import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QuestionSchema = z.object({
  question: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  sourceQuote: z.string(),
});

export type Question = z.infer<typeof QuestionSchema>;

const InputSchema = z.object({
  sourceText: z.string().min(20),
  count: z.number().int().min(1).max(100),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const MATH_RULES = `Mathematical notation: write math using Unicode so it renders as plain text everywhere.
- Powers/superscripts: x², x³, 10⁻⁴ (use superscript characters; fall back to x^n only if no character exists)
- Fractions: ½, ⅓, ¾, or a/b for general fractions
- Subscripts: H₂O, aₙ
- Symbols: √, ∛, π, θ, ×, ÷, ±, ≈, ≠, ≤, ≥, ∞, ∑, ∏, ∫, ∂, Δ, ∈, ∪, ∩, →, ∠, °
- Never use LaTeX, \\frac, $...$, or markdown math delimiters.`;

async function callAI(messages: Array<{ role: string; content: string }>, json = true) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to your workspace.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content as string;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

function validateQuestion(q: Question, sourceNorm: string): boolean {
  const quote = normalize(q.sourceQuote);
  if (quote.length < 8) return false;
  if (sourceNorm.includes(quote)) return true;
  // fall back: check that a run of >=6 words from the quote appears in the source
  const words = quote.split(" ").filter(Boolean);
  for (let i = 0; i + 6 <= words.length; i++) {
    const chunk = words.slice(i, i + 6).join(" ");
    if (sourceNorm.includes(chunk)) return true;
  }
  return false;
}

const BATCH = 15;

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, count, difficulty } = data;
    const sourceNorm = normalize(sourceText);

    const systemPrompt = `You generate multiple-choice quiz questions from provided source material. Rules:
- Return ONLY valid JSON of the shape: {"questions":[{"question":string,"choices":[string,string,string,string],"correctIndex":0-3,"sourceQuote":string}]}
- Each "sourceQuote" MUST be a verbatim substring copied directly from the source (10-30 words) that supports the answer.
- Do not paraphrase the sourceQuote; copy exact text from the source.
- Exactly 4 choices, only one correct.
- Difficulty: ${difficulty}. Keep questions self-contained (no "in the passage" phrasing).
${MATH_RULES}`;

    const validated: Question[] = [];
    const seen = new Set<string>();
    // Enough attempts to fill large sets (up to 100) in batches.
    const maxAttempts = Math.min(20, Math.ceil(count / BATCH) * 3 + 3);
    let attempts = 0;

    while (validated.length < count && attempts < maxAttempts) {
      attempts++;
      const need = Math.min(count - validated.length, BATCH);
      const avoid = validated.slice(-25).map((q) => q.question);
      const userPrompt = `Generate ${need} quiz questions from this source. Return valid JSON only.${
        avoid.length ? `\n\nDo NOT repeat or rephrase any of these already-used questions:\n${avoid.map((q) => `- ${q}`).join("\n")}` : ""
      }\n\nSOURCE:\n"""${sourceText}"""`;
      const raw = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
      let parsed: { questions: unknown[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      let addedThisRound = 0;
      for (const item of parsed.questions ?? []) {
        const p = QuestionSchema.safeParse(item);
        if (!p.success) continue;
        const q = p.data;
        const dedupKey = q.question.toLowerCase().trim();
        if (seen.has(dedupKey)) continue;
        if (!validateQuestion(q, sourceNorm)) continue;
        seen.add(dedupKey);
        validated.push(q);
        addedThisRound++;
        if (validated.length >= count) break;
      }
      // Source exhausted — stop burning attempts.
      if (addedThisRound === 0 && attempts >= 3) break;
    }

    if (validated.length === 0) {
      throw new Error("Couldn't generate verifiable questions from this source. Try adding more detailed content.");
    }

    return { questions: validated, requested: count };
  });

/* ---------------- AI Text Helper ---------------- */

const HelperMode = z.enum(["source-finder", "refine-check"]);

const TextHelperInput = z.object({
  mode: HelperMode.default("source-finder"),
  instruction: z.string().min(1).max(4000),
  existingText: z.string().max(40000).optional().default(""),
  actions: z
    .object({
      improve: z.boolean().default(false),
      factCheck: z.boolean().default(false),
      custom: z.string().max(2000).optional().default(""),
    })
    .optional(),
  planAnswers: z.array(z.object({ question: z.string(), answer: z.string() })).max(10).optional(),
});

function planBlock(planAnswers?: Array<{ question: string; answer: string }>) {
  const filled = (planAnswers ?? []).filter((p) => p.answer.trim());
  if (filled.length === 0) return "";
  return `\n\nThe user answered these planning questions — follow them closely:\n${filled
    .map((p) => `Q: ${p.question}\nA: ${p.answer.trim()}`)
    .join("\n")}`;
}

export const aiTextHelper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TextHelperInput.parse(raw))
  .handler(async ({ data }) => {
    const { mode, instruction, existingText, actions, planAnswers } = data;

    const base = `You are a writing assistant that produces study/reference text suitable for generating quiz questions from. Rules:
- Return ONLY the finished text as plain prose. No preamble, no markdown headers, no commentary, no quotes.
- Prefer clear factual sentences, concrete details, definitions, dates, names, numbers.
${MATH_RULES}`;

    let system: string;
    let user: string;

    if (mode === "source-finder") {
      system = `${base}
- You are in SOURCE FINDER mode: gather and compile the most relevant, accurate real-world information about the described topic from your knowledge of published sources.
- Be comprehensive and specific: include key facts, figures, dates, names, definitions and relationships a quiz could test.
- Only state information you are confident is accurate. Do not invent statistics or citations.`;
      user = `Information description: ${instruction}${planBlock(planAnswers)}`;
    } else {
      const asked: string[] = [];
      if (actions?.improve) asked.push("Improve the text: clarity, structure, flow, and completeness. Add useful detail where it helps a quiz.");
      if (actions?.factCheck)
        asked.push(
          "Fact-check the text: correct anything inaccurate or misleading, and remove claims you cannot support. Keep corrections silent (no notes) inside the returned prose.",
        );
      if (actions?.custom?.trim()) asked.push(`Custom instruction from the user: ${actions.custom.trim()}`);
      if (asked.length === 0) asked.push("Improve the text for clarity and factual accuracy.");

      system = `${base}
- You are in REFINE & CHECK mode: rewrite the user's existing source text according to the requested actions while preserving its meaning and all accurate facts.
- Return the full rewritten text, not a diff or a summary.`;
      user = `Requested actions:\n${asked.map((a) => `- ${a}`).join("\n")}\n\nAdditional context: ${instruction}${planBlock(
        planAnswers,
      )}\n\nYOUR SOURCE TEXT:\n"""${existingText}"""`;
    }

    const text = (await callAI(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      false,
    ))?.trim();

    if (!text) throw new Error("No text returned");
    return { text };
  });

/* ---------------- Planning questions ---------------- */

const PlanInput = z.object({
  mode: HelperMode.default("source-finder"),
  instruction: z.string().min(1).max(4000),
  existingText: z.string().max(40000).optional().default(""),
});

const PlanQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).min(2).max(5),
      }),
    )
    .min(1)
    .max(4),
});

const FALLBACK_PLAN = {
  questions: [
    { question: "How long should the text be?", options: ["Short (~150 words)", "Medium (~400 words)", "Long (~800 words)"] },
    { question: "What reading level should it use?", options: ["Simple and beginner-friendly", "Standard school level", "Advanced and technical"] },
    { question: "What should it focus on?", options: ["Key facts and definitions", "Dates, names and numbers", "Causes, effects and relationships"] },
  ],
};

export const planTextQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PlanInput.parse(raw))
  .handler(async ({ data }) => {
    const { mode, instruction, existingText } = data;
    const system = `You help plan a piece of study text before writing it. Ask short multiple-choice questions so the result matches the user's style and needs.
- Return ONLY valid JSON: {"questions":[{"question":string,"options":[string,string,string]}]}
- Ask 3 questions maximum, each one short sentence.
- Each question MUST have 3 or 4 short, concrete selectable options (a few words each). Never ask for free text.
- Cover things like: length/detail level, tone & reading level, and focus or subtopics.`;
    const user = `Mode: ${mode}\nUser description: ${instruction}${
      existingText.trim() ? `\nExisting text (first 600 chars): """${existingText.slice(0, 600)}"""` : ""
    }`;

    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    try {
      return PlanQuestionsSchema.parse(JSON.parse(raw));
    } catch {
      return FALLBACK_PLAN;
    }
  });


/* ---------------- Translation ---------------- */

const TranslateInput = z.object({
  questions: z.array(QuestionSchema),
  language: z.string().min(1).max(60),
});

export const translateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TranslateInput.parse(raw))
  .handler(async ({ data }) => {
    const { questions, language } = data;
    const system = `You translate quiz questions to ${language}. Return ONLY valid JSON of the shape: {"questions":[{"question":string,"choices":[string,string,string,string],"correctIndex":number,"sourceQuote":string}]}. Preserve correctIndex exactly. Translate question, choices, and sourceQuote to ${language}. Do not add or remove items. Keep mathematical notation as Unicode symbols.`;
    const user = JSON.stringify({ questions });
    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    let parsed: { questions: Question[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Translation failed");
    }
    const out: Question[] = [];
    for (let i = 0; i < questions.length; i++) {
      const p = QuestionSchema.safeParse(parsed.questions?.[i]);
      out.push(p.success ? { ...p.data, correctIndex: questions[i].correctIndex } : questions[i]);
    }
    return { questions: out };
  });

/* ---------------- Fun facts ---------------- */

const FunFactsInput = z.object({
  topic: z.string().min(10).max(6000),
});

export const funFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FunFactsInput.parse(raw))
  .handler(async ({ data }) => {
    const system = `You produce short, surprising, true fun facts related to a study topic, to entertain someone while they wait.
- Return ONLY valid JSON: {"facts":[string]}
- Give 10 facts. Each fact is one sentence, under 200 characters, self-contained and genuinely interesting.
- Facts must be real and accurate. No made-up statistics.
${MATH_RULES}`;
    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: `Topic material (may be long, use the main subject):\n"""${data.topic.slice(0, 4000)}"""` },
    ]);
    try {
      const parsed = z.object({ facts: z.array(z.string()).min(1) }).parse(JSON.parse(raw));
      return { facts: parsed.facts.slice(0, 12) };
    } catch {
      return { facts: [] as string[] };
    }
  });

/* ---------------- Answer explanation & follow-up ---------------- */

const ExplainInput = z.object({
  question: QuestionSchema,
  userQuestion: z.string().max(1000).optional().default(""),
  sourceText: z.string().max(20000).optional().default(""),
});

export const explainAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ExplainInput.parse(raw))
  .handler(async ({ data }) => {
    const { question: q, userQuestion, sourceText } = data;
    const system = `You are a patient tutor explaining quiz answers.
- Reply in plain prose, no markdown headers, 2-5 short sentences.
- Explain clearly WHY the correct answer is correct, and briefly why the tempting wrong options are not.
${MATH_RULES}`;
    const user = `QUESTION: ${q.question}
OPTIONS:
${q.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}${i === q.correctIndex ? "  <- correct" : ""}`).join("\n")}
SUPPORTING SOURCE QUOTE: "${q.sourceQuote}"${sourceText ? `\nWIDER SOURCE (excerpt): """${sourceText.slice(0, 4000)}"""` : ""}${
      userQuestion.trim() ? `\n\nThe learner still doesn't understand and asks: "${userQuestion.trim()}" — answer this specifically.` : ""
    }`;
    const text = (await callAI([{ role: "system", content: system }, { role: "user", content: user }], false))?.trim();
    if (!text) throw new Error("No explanation returned");
    return { text };
  });

/* ---------------- Post-quiz feedback ---------------- */

const FeedbackInput = z.object({
  title: z.string().max(200),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
  missed: z.array(z.object({ question: z.string(), correct: z.string() })).max(30).optional().default([]),
});

export const quizFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FeedbackInput.parse(raw))
  .handler(async ({ data }) => {
    const { title, score, total, missed } = data;
    const system = `You are an encouraging study coach reviewing a finished quiz.
- Return ONLY valid JSON: {"feedback":string,"suggestionTitle":string,"suggestionTopic":string}
- "feedback": 2-4 short sentences. Warm, specific, mention what went well and the weak areas from the missed questions.
- "suggestionTitle": a short title (max 60 chars) for a follow-up quiz that targets the weak areas.
- "suggestionTopic": a 2-4 sentence description of the material that follow-up quiz should cover, written so it can be used as an information request.
${MATH_RULES}`;
    const user = `Quiz: ${title}\nScore: ${score}/${total}\nMissed questions:\n${
      missed.length ? missed.map((m) => `- ${m.question} (correct: ${m.correct})`).join("\n") : "(none — perfect score)"
    }`;
    const raw = await callAI([{ role: "system", content: system }, { role: "user", content: user }]);
    try {
      return z
        .object({ feedback: z.string(), suggestionTitle: z.string(), suggestionTopic: z.string() })
        .parse(JSON.parse(raw));
    } catch {
      return {
        feedback: `You scored ${score} of ${total}. Review the questions you missed and try again.`,
        suggestionTitle: `${title} — review round`,
        suggestionTopic: `Key concepts from "${title}", focusing on the areas that were answered incorrectly.`,
      };
    }
  });

/* ---------------- UI translation ---------------- */

const UiInput = z.object({
  strings: z.array(z.string()).min(1).max(400),
  language: z.string().min(1).max(60),
});

export const translateUi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UiInput.parse(raw))
  .handler(async ({ data }) => {
    const { strings, language } = data;
    const system = `You localise user-interface strings to ${language}.
- Return ONLY valid JSON: {"translations":[string]} with EXACTLY the same number of items, in the same order.
- Translate naturally and concisely, keeping UI tone and any punctuation/placeholders like {n}, %, · or … intact.
- NEVER translate the product name "CanWinBuddy", platform names (Blooket, Gimkit, Gimkit 2, Kahoot), file formats, or usernames.`;
    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ strings }) },
    ]);
    try {
      const parsed = z.object({ translations: z.array(z.string()) }).parse(JSON.parse(raw));
      if (parsed.translations.length !== strings.length) throw new Error("length mismatch");
      return { translations: parsed.translations };
    } catch {
      return { translations: strings };
    }
  });
