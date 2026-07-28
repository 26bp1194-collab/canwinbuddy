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

const StyleSpecSchema = z.object({
  mode: z.enum(["simple", "advanced"]).default("simple"),
  shortQA: z.boolean().default(false),
  questionLength: z.number().int().min(1).max(5).default(3),
  answerLength: z.number().int().min(1).max(5).default(3),
  complexity: z.number().int().min(1).max(5).default(3),
  obscurity: z.number().int().min(1).max(5).default(3),
});

export type StyleSpec = z.infer<typeof StyleSpecSchema>;

const SCALE = ["very low", "low", "medium", "high", "very high"];

function styleBlock(spec?: Partial<StyleSpec> | null) {
  if (!spec) return "";
  if (spec.mode !== "advanced") {
    return spec.shortQA
      ? `\n\nSHORT Q&A MODE: keep every question stem under 15 words and every choice under 6 words. Stay clear and still fully self-contained.`
      : "";
  }
  const s = { questionLength: 3, answerLength: 3, complexity: 3, obscurity: 3, ...spec };
  return `\n\nADVANCED STYLE CONTROLS (1 = lowest, 5 = highest):
- Question length ${s.questionLength}/5 (${SCALE[s.questionLength - 1]}): 1 = very short stems (<10 words), 5 = long detailed stems (30-45 words).
- Answer length ${s.answerLength}/5 (${SCALE[s.answerLength - 1]}): 1 = very short options (1-3 words), 5 = long full-sentence options.
- Complexity ${s.complexity}/5 (${SCALE[s.complexity - 1]}): 1 = simple single-step recall, 5 = complex multi-step reasoning.
- Obscurity ${s.obscurity}/5 (${SCALE[s.obscurity - 1]}): 1 = explicit, the answer is stated directly in the notes, 5 = implicit, the answer must be inferred from the notes.
Respect all four controls at once. They never override the requirement that every question is answerable from the notes and self-contained.`;
}

const SELF_CONTAINED = `SELF-CONTAINED CONTEXT (critical):
- Every question must be answerable on its own, without seeing the notes, the other questions, or any earlier context.
- Put the needed context inside the stem: name the subject, topic, period, formula, or entity explicitly instead of using "it", "this", "the author", "the above", "the experiment".
- Never reference "the passage", "the notes", "the text", "the diagram" or question numbers.
- If a term only makes sense with a definition, include the short defining phrase in the stem.
- Where an example helps, write a short example in the same style as the notes — a few short notes only, never long extra material.`;

const InputSchema = z.object({
  sourceText: z.string().min(20),
  count: z.number().int().min(1).max(100),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  spec: StyleSpecSchema.partial().optional(),
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

/* ---------------- 1. Analyze ---------------- */

const AnalyzeInput = z.object({
  sourceText: z.string().min(20),
  count: z.number().int().min(1).max(100).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

const AnalysisSchema = z.object({
  topics: z.array(z.string()).min(1),
  keyFacts: z.array(z.string()),
  coverageNotes: z.string(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const analyzeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AnalyzeInput.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, count, difficulty } = data;
    const system = `You analyse study notes so quiz questions can be written from them later.
- Return ONLY valid JSON: {"topics":[string],"keyFacts":[string],"coverageNotes":string}
- "topics": 5-12 distinct topics/concepts actually present in the notes, spread across the WHOLE text (beginning, middle and end), each a short phrase.
- "keyFacts": short factual bullets grounded ONLY in the notes (max 20).
- "coverageNotes": 1-2 sentences on how dense/testable the material is.
- Use ONLY the provided notes. Never add outside knowledge.
${MATH_RULES}`;
    const user = `Requested difficulty: ${difficulty}${count ? `\nPlanned question count: ${count}` : ""}\n\nNOTES:\n"""${sourceText.slice(0, 30000)}"""`;
    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    try {
      const parsed = AnalysisSchema.parse(JSON.parse(raw));
      return {
        topics: parsed.topics.slice(0, 12),
        keyFacts: parsed.keyFacts.slice(0, 20),
        coverageNotes: parsed.coverageNotes,
      } satisfies Analysis;
    } catch {
      return { topics: [], keyFacts: [], coverageNotes: "" } as Analysis;
    }
  });

/* ---------------- 2. Generate ---------------- */

function genSystemPrompt(difficulty: string, analysis?: Analysis | null, spec?: Partial<StyleSpec> | null) {
  const topics = analysis?.topics?.length
    ? `\n\nANALYSED TOPICS (spread questions evenly across these):\n${analysis.topics.map((t) => `- ${t}`).join("\n")}`
    : "";
  const facts = analysis?.keyFacts?.length
    ? `\n\nKEY FACTS FROM THE NOTES:\n${analysis.keyFacts.map((f) => `- ${f}`).join("\n")}`
    : "";
  return `You generate multiple-choice quiz questions from provided source material. Rules:
- Return ONLY valid JSON of the shape: {"questions":[{"question":string,"choices":[string,string,string,string],"correctIndex":0-3,"sourceQuote":string}]}
- Each "sourceQuote" MUST be a verbatim substring copied directly from the source (10-30 words) that supports the correct answer. Never paraphrase it.
- Exactly 4 choices, only one correct.
- Use ONLY the source material. Never use outside knowledge as quiz facts.

DIFFICULTY (${difficulty}):
- easy = direct recall of a clearly stated fact or definition
- medium = simple application, comparison, or restating an idea in new words
- hard = inference, multi-step reasoning, cause/effect, or applying ideas to a new situation still supported by the notes

DISTRACTORS:
- All 4 choices must have similar length and parallel grammar.
- Wrong answers must be plausible common confusions drawn from the same notes. Never joke, absurd, empty, or obviously wrong options.
- Exactly one option is defensibly correct.

COVERAGE:
- Spread questions across the analysed topics and the whole source; do not cluster on the opening paragraphs.

STYLE:
- Vary correctIndex across 0,1,2,3 — do not bias toward 0 or 1.
- Do not repeat or lightly rephrase questions already accepted.

${SELF_CONTAINED}
${MATH_RULES}${styleBlock(spec)}${topics}${facts}`;
}

const GenerateInput = InputSchema.extend({
  analysis: AnalysisSchema.partial().optional(),
});

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GenerateInput.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, count, difficulty, spec } = data;
    const analysis = (data.analysis ?? null) as Analysis | null;
    const sourceNorm = normalize(sourceText);
    const systemPrompt = genSystemPrompt(difficulty, analysis, spec);


    const validated: Question[] = [];
    const seen = new Set<string>();
    const maxAttempts = Math.min(20, Math.ceil(count / BATCH) * 3 + 3);
    let attempts = 0;

    while (validated.length < count && attempts < maxAttempts) {
      attempts++;
      const need = Math.min(count - validated.length, BATCH);
      const avoid = validated.slice(-25).map((q) => q.question);
      const userPrompt = `Generate ${need} quiz questions from this source. Return valid JSON only.${
        analysis?.topics?.length ? `\n\nAllocate the ${need} questions across the analysed topics as evenly as possible.` : ""
      }${
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

/* ---------------- 3. AI review + 4. targeted regeneration ---------------- */

const ReviewSchema = z.object({
  reviews: z.array(
    z.object({
      index: z.number().int().min(0),
      pass: z.boolean(),
      issues: z.array(z.string()).default([]),
    }),
  ),
});

const REVIEW_SYSTEM = (difficulty: string, spec?: Partial<StyleSpec> | null) => `You are a strict quiz quality reviewer.
- Return ONLY valid JSON: {"reviews":[{"index":number,"pass":boolean,"issues":[string]}]}
- Review EVERY question given, using its index from the input. "issues" is empty when pass is true.
Check each question for:
1. Is the marked correct choice actually supported by its sourceQuote and the surrounding notes?
2. Are all distractors plausible and non-joke, similar in length and grammar, with only one correct answer?
3. Does the difficulty roughly match "${difficulty}"?
4. CONTEXT (fail if not met): could a learner who has never seen the notes answer this question from the stem and options alone? Fail it when the stem relies on unstated context, vague references ("it", "this process", "the author", "the above"), an undefined term, or mentions the passage/notes/text or another question.
5. Is it a duplicate or near-duplicate of another question in the set? (fail the later one)
Each issue is one short, actionable sentence.${styleBlock(spec)}`;

async function reviewBatch(sourceText: string, questions: Question[], difficulty: string, spec?: Partial<StyleSpec> | null) {
  const user = `NOTES:\n"""${sourceText.slice(0, 20000)}"""\n\nQUESTIONS:\n${JSON.stringify(
    questions.map((q, index) => ({ index, ...q })),
  )}`;
  const raw = await callAI([
    { role: "system", content: REVIEW_SYSTEM(difficulty, spec) },
    { role: "user", content: user },
  ]);
  try {
    const parsed = ReviewSchema.parse(JSON.parse(raw));
    return parsed.reviews;
  } catch {
    // Reviewer failed — do not throw away valid work.
    return questions.map((_, index) => ({ index, pass: true, issues: [] as string[] }));
  }
}


async function regenerateOne(
  sourceText: string,
  difficulty: string,
  analysis: Analysis | null,
  failed: Question,
  issues: string[],
  accepted: Question[],
  spec?: Partial<StyleSpec> | null,

): Promise<Question | null> {
  const user = `Write ONE replacement quiz question.

The following question FAILED review:
${JSON.stringify(failed)}

Reviewer issues to fix:
${issues.map((i) => `- ${i}`).join("\n") || "- low quality"}

Fix these issues. Keep the same topic if the source supports it.${
    analysis?.topics?.length ? `\nRelevant topics: ${analysis.topics.slice(0, 12).join(", ")}` : ""
  }

Do NOT duplicate any of these already-accepted questions:
${accepted.slice(-30).map((q) => `- ${q.question}`).join("\n") || "(none)"}

Return JSON with exactly one item: {"questions":[{...}]}

SOURCE:
"""${sourceText}"""`;
  const raw = await callAI([
    { role: "system", content: genSystemPrompt(difficulty, analysis, spec) },
    { role: "user", content: user },
  ]);
  try {
    const parsed = JSON.parse(raw);
    const p = QuestionSchema.safeParse(parsed.questions?.[0]);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

const ReviewInput = z.object({
  sourceText: z.string().min(20),
  questions: z.array(QuestionSchema).min(1),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  requested: z.number().int().min(1).max(100),
  analysis: AnalysisSchema.partial().optional(),
  spec: StyleSpecSchema.partial().optional(),

});

const MAX_ATTEMPTS_PER_ITEM = 2;
const GLOBAL_REGEN_CAP = 12;

export const reviewAndRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReviewInput.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, questions, difficulty, requested, spec } = data;
    const analysis = (data.analysis ?? null) as Analysis | null;
    const sourceNorm = normalize(sourceText);

    const reviews = await reviewBatch(sourceText, questions, difficulty, spec);

    const verdict = new Map(reviews.map((r) => [r.index, r]));

    const accepted: Question[] = [];
    const failures: Array<{ q: Question; issues: string[] }> = [];
    questions.forEach((q, i) => {
      const r = verdict.get(i);
      if (r && !r.pass) failures.push({ q, issues: r.issues });
      else accepted.push(q);
    });

    let regenerated = 0;
    let budget = GLOBAL_REGEN_CAP;

    for (const failure of failures) {
      let issues = failure.issues;
      let current = failure.q;
      let fixed = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_ITEM && budget > 0; attempt++) {
        budget--;
        const replacement = await regenerateOne(sourceText, difficulty, analysis, current, issues, accepted, spec);
        if (!replacement) continue;
        if (!validateQuestion(replacement, sourceNorm)) {
          current = replacement;
          issues = ["The sourceQuote was not a verbatim substring of the notes. Copy exact text from the source."];
          continue;
        }
        if (accepted.some((a) => a.question.toLowerCase().trim() === replacement.question.toLowerCase().trim())) {
          current = replacement;
          issues = ["Duplicate of an already-accepted question. Cover a different topic."];
          continue;
        }
        const [check] = await reviewBatch(sourceText, [replacement], difficulty, spec);
        if (check && !check.pass) {
          current = replacement;
          issues = check.issues;
          continue;
        }
        accepted.push(replacement);
        regenerated++;
        fixed = true;
        break;
      }
      // If still failing after the caps, drop it rather than saving a bad question.
      if (!fixed) continue;
    }

    if (accepted.length === 0) {
      throw new Error("Couldn't produce questions that passed review. Try adding more detailed source content.");
    }

    return {
      questions: accepted.slice(0, requested),
      requested,
      reviewed: questions.length,
      regenerated,
      dropped: failures.length - regenerated,
    };
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
    { question: "Which part of the topic should the text cover?", options: ["Core concepts and definitions", "Key people, dates and events", "Causes, effects and relationships", "Real examples and applications"] },
    { question: "Which specific angle matters most to you?", options: ["Background and origins", "How it works step by step", "Comparisons and contrasts", "Common misconceptions"] },
    { question: "What extra content should be included?", options: ["Named examples", "Key figures or formulas", "Important terminology", "Nothing extra"] },
  ],
};

export const planTextQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PlanInput.parse(raw))
  .handler(async ({ data }) => {
    const { mode, instruction, existingText } = data;
    const system = `You help pin down the CONTENT of a piece of study text before it is written. Ask short multiple-choice questions about WHAT information the text should contain.
- Return ONLY valid JSON: {"questions":[{"question":string,"options":[string,string,string]}]}
- Ask 3 questions maximum, each one short sentence.
- Each question MUST have 3 or 4 short, concrete selectable options (a few words each). Never ask for free text.
- Questions MUST be about subject matter: which subtopics, which time period, which examples, which people/events/formulas, which scope or depth of the topic itself.
- NEVER ask about text length, word count, tone, reading level, audience, format, or style. Those are forbidden.`;
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

/* ---------------- Edit / regenerate existing questions ---------------- */

const EditInput = z.object({
  sourceText: z.string().max(40000).optional().default(""),
  questions: z.array(QuestionSchema).min(1).max(100),
  instruction: z.string().max(2000).optional().default(""),
  presets: z.array(z.string()).max(10).optional().default([]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  spec: StyleSpecSchema.partial().optional(),
});

export const editQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => EditInput.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, questions, instruction, presets, difficulty, spec } = data;
    const asks = [...presets.map((p) => `- ${p}`), instruction.trim() ? `- ${instruction.trim()}` : ""].filter(Boolean);
    const system = `You rewrite existing multiple-choice quiz questions on request.
- Return ONLY valid JSON: {"questions":[{"question":string,"choices":[string,string,string,string],"correctIndex":0-3,"sourceQuote":string}]}
- Return EXACTLY ${questions.length} question(s), in the same order as the input.
- Keep every question grounded in the provided source material; "sourceQuote" must stay a verbatim substring of the source.
- Exactly 4 choices, one correct, plausible parallel distractors.
- Baseline difficulty: ${difficulty}.

${SELF_CONTAINED}
${MATH_RULES}${styleBlock(spec)}`;
    const user = `Requested changes:\n${asks.join("\n") || "- Improve the questions"}\n\nQUESTIONS TO REWRITE:\n${JSON.stringify(
      questions,
    )}${sourceText ? `\n\nSOURCE:\n"""${sourceText.slice(0, 30000)}"""` : ""}`;
    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    let parsed: { questions?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Couldn't apply those changes. Try again.");
    }
    const sourceNorm = normalize(sourceText);
    const out: Question[] = questions.map((original, i) => {
      const p = QuestionSchema.safeParse(parsed.questions?.[i]);
      if (!p.success) return original;
      if (sourceText && !validateQuestion(p.data, sourceNorm)) {
        return { ...p.data, sourceQuote: original.sourceQuote };
      }
      return p.data;
    });
    return { questions: out };
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
    const system = `You explain quiz answers as a short bullet list.
- Reply with 2-4 bullet points ONLY. Each bullet starts with "• " on its own line.
- Each bullet is one short clause, max 15 words. No intro, no closing sentence, no markdown headers.
- Bullet 1: why the correct answer is correct. Remaining bullets: the key reason the tempting wrong options fail.
${MATH_RULES}`;
    const user = `QUESTION: ${q.question}
OPTIONS:
${q.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}${i === q.correctIndex ? "  <- correct" : ""}`).join("\n")}
SUPPORTING SOURCE QUOTE: "${q.sourceQuote}"${sourceText ? `\nWIDER SOURCE (excerpt): """${sourceText.slice(0, 4000)}"""` : ""}${
      userQuestion.trim() ? `\n\nThe learner still doesn't understand and asks: "${userQuestion.trim()}" — answer this specifically, still as short bullets.` : ""
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
