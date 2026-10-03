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

const TERM_CONSISTENCY = `TERM CONSISTENCY (critical): When the source defines a specific named concept, term, or device (for example, "Ethos", "Tricolon", or "Repetition"), use the exact singular form and spelling as it first appears in the source. Never pluralize, abbreviate, or vary it in any question or answer option in this set. Apply this consistently across all questions.`;

const guidanceBlock = (g?: string | null) =>
  g && g.trim()
    ? `\n\nUSER BRIEF (subject areas, target learner level/age, and extra instructions). Follow these when choosing wording, vocabulary and framing. Facts must still come ONLY from the source:\n${g.trim().slice(0, 2000)}`
    : "";

const InputSchema = z.object({
  guidance: z.string().max(2000).optional(),
  curriculum: z.string().max(120).optional(),
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

/* Checks the supporting quote (fact, formula, example or data) is from the notes.
   The final answer itself need not appear — derived answers are verified by the reviewer. */
function validateQuestion(q: Question, sourceNorm: string): boolean {
  const quote = normalize(q.sourceQuote);
  if (quote.length < 6) return false;
  if (sourceNorm.includes(quote)) return true;
  const words = quote.split(" ").filter(Boolean);
  const run = words.length < 8 ? 3 : 5;
  for (let i = 0; i + run <= words.length; i++) {
    const chunk = words.slice(i, i + run).join(" ");
    if (sourceNorm.includes(chunk)) return true;
  }
  return false;
}

/* ---- near-duplicate detection (stops "the same question asked four ways") ---- */

const STOP = new Set(
  "a an the of in on at to for from by with and or is are was were which what who whom whose how why when does do did that this these those it its as into all body human".split(
    " ",
  ),
);

function contentWords(s: string) {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((w) => { if (b.has(w)) inter++; });
  return inter / (a.size + b.size - inter);
}

/** True when two questions essentially test the same fact. */
export function tooSimilar(a: Question, b: Question) {
  const sameAnswer = normalize(a.choices[a.correctIndex]) === normalize(b.choices[b.correctIndex]);
  const sim = jaccard(contentWords(a.question), contentWords(b.question));
  if (sameAnswer && sim >= 0.3) return true;
  return sim >= 0.6;
}

/* Batch size scales with the requested amount:
   1-25 → 1 at a time, 26-50 → 2, 51-75 → 3, 76-100 → 4 */
function batchSize(count: number) {
  if (count <= 25) return 1;
  if (count <= 50) return 2;
  if (count <= 75) return 3;
  return 4;
}

/* ---------------- Level / curriculum settings (sent first, every call) ---------------- */

const CURRICULUM_GUIDES: Record<string, string> = {
  IGCSE: `Cambridge/Edexcel IGCSE exam style. Begin stems with IGCSE command words where natural: State, Name, Describe, Explain, Calculate, Suggest, Complete (the equation), Determine, Deduce, Predict. Use correct scientific terminology and SI units, and phrase questions the way IGCSE papers do.`,
  SPM: `Malaysian SPM exam style: clear Bahasa-paper-style phrasing translated to the chosen language, command words State, Explain, Calculate, Describe, Compare; KBAT-style application questions at higher levels.`,
  "A-Levels": `A-Level exam style: precise terminology, command words Explain, Calculate, Deduce, Evaluate, Suggest; more quantitative and multi-step than GCSE.`,
  Gaokao: `Gaokao style: rigorous, concise, calculation- and reasoning-heavy stems with precise terminology.`,
  AP: `College Board AP style: stimulus-based stems (short scenario, data or experiment) followed by a question requiring application or analysis.`,
  SAT: `SAT style: concise, evidence-based stems; quantitative questions framed as short real-world problems.`,
  CBSE: `CBSE (India) style: NCERT-aligned phrasing, command words State, Define, Explain, Calculate, Give reason; competency-based questions at higher levels.`,
  ICSE: `ICSE (India) style: precise definitions, Give reasons / State / Calculate / Explain phrasing, numerical problems with units.`,
};

function levelBlock(difficulty: string, spec?: Partial<StyleSpec> | null, curriculum?: string | null) {
  const parts: string[] = ["LEVEL & STYLE SETTINGS (highest priority — every question must clearly reflect these):"];
  if (spec?.mode === "advanced") {
    const s = { questionLength: 3, answerLength: 3, complexity: 3, obscurity: 3, ...spec };
    parts.push(
      `- Question length ${s.questionLength}/5: ${["under 10 words", "10-15 words", "15-25 words", "25-35 words", "35-45 words, with a short scenario or data"][s.questionLength - 1]}.`,
      `- Answer length ${s.answerLength}/5: ${["1-3 words", "2-5 words", "a short phrase (4-8 words)", "a clause (8-14 words)", "a full sentence (14-25 words)"][s.answerLength - 1]} per option.`,
      `- Complexity ${s.complexity}/5: ${[
        "single-step recall of one fact",
        "recall plus one simple step (identify, classify)",
        "application: use a fact, rule or formula in a given situation",
        "two-step reasoning: combine two ideas or do a two-step calculation",
        "multi-step reasoning: combine several ideas, multi-step calculations, cause→effect chains. Plain recall is FORBIDDEN",
      ][s.complexity - 1]}.`,
      `- Obscurity ${s.obscurity}/5: ${[
        "the answer is stated word-for-word in the notes",
        "the answer is stated in the notes but reworded",
        "the answer must be put together from two places in the notes",
        "the answer must be inferred or derived (applied to a new example) from the notes",
        "the answer must be inferred/derived in an unfamiliar context; never copy a sentence from the notes as the answer",
      ][s.obscurity - 1]}.`,
    );
  } else {
    parts.push(
      `- Difficulty ${difficulty}: ${
        difficulty === "easy"
          ? "direct recall of a clearly stated fact, definition or term."
          : difficulty === "medium"
            ? "about half recall, half application (use a fact/formula in a new example, compare, explain why). Pure recall must NOT exceed half the set."
            : "multi-step reasoning: multi-step calculations, cause→effect, predicting outcomes, applying ideas to unfamiliar situations. Plain recall is FORBIDDEN."
      }`,
    );
    if (spec?.shortQA) parts.push("- Short Q&A: stems under 15 words, options under 6 words.");
  }
  const c = curriculum?.trim();
  if (c) {
    parts.push(`- Curriculum ${c}: ${CURRICULUM_GUIDES[c] ?? `follow the real exam style, command words and terminology of ${c}.`} Match the level of this curriculum; facts still come only from the notes.`);
  }
  return parts.join("\n");
}

const REFERS_TO_SOURCE = /\b(according to|as stated in|as described in|as mentioned in|based on) (the )?(text|source|notes?|passage|definition|article|reading|diagram)\b/i;

function openerOf(q: string) {
  return normalize(q).split(" ").slice(0, 2).join(" ");
}

function stemCap(n: number) {
  return Math.max(3, Math.ceil(n / 25));
}

/** Move the correct option to a target position (keeps option order otherwise). */
function placeCorrect(q: Question, target: number): Question {
  if (q.correctIndex === target) return q;
  const choices = [...q.choices];
  [choices[q.correctIndex], choices[target]] = [choices[target], choices[q.correctIndex]];
  return { ...q, choices, correctIndex: target };
}

/* ---------------- 1. Analyze ---------------- */

const AnalyzeInput = z.object({
  guidance: z.string().max(2000).optional(),
  curriculum: z.string().max(120).optional(),
  sourceText: z.string().min(20),
  count: z.number().int().min(1).max(100).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

const AnalysisSchema = z.object({
  topics: z.array(z.string()).min(1),
  keyFacts: z.array(z.string()),
  summaries: z.array(z.string()).default([]),
  namedTerms: z.array(z.string()).default([]),
  coverageNotes: z.string(),
  maxQuestions: z.number().int().min(0).max(300).default(0),
  concepts: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  keyTerms: z.array(z.string()).default([]),
  calculations: z.array(z.string()).default([]),
  sourceQuestions: z.array(z.string()).default([]),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const analyzeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AnalyzeInput.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, count, difficulty, guidance } = data;
    const system = `You analyse study notes (already converted to plain text, including text read out of images) so quiz questions can be written from them later.
- Return ONLY valid JSON: {"topics":[string],"keyFacts":[string],"summaries":[string],"namedTerms":[string],"concepts":[string],"objectives":[string],"keyTerms":[string],"calculations":[string],"sourceQuestions":[string],"coverageNotes":string,"maxQuestions":number}
- Read the notes carefully from start to finish before answering.
- "topics": 5-12 distinct topics actually present in the notes, spread across the WHOLE text.
- "keyFacts": short factual bullets grounded ONLY in the notes (max 60).
- "summaries": short summaries (max 12) of each testable section, in reading order.
- "namedTerms": up to 30 defined named concepts/terms copied with exact singular spelling and capitalisation from their FIRST occurrence.
- "concepts": every DISTINCT testable concept in the notes (max 100), one short phrase each. Repeated mentions of the same fact are ONE concept. Each formula/worked example/data table counts as one concept.
- "objectives": items from any Objectives / Learning outcomes / Key points list in the notes, verbatim-ish (empty if none).
- "keyTerms": bold, highlighted or explicitly defined key terms (empty if none).
- "calculations": every formula, equation, worked example, data table or numeric relationship in the notes (including ones inside diagrams/equations), written out compactly with the numbers. Empty if none.
- "sourceQuestions": end-of-section / practice questions that appear in the notes, copied (max 10). Empty if none.
- "coverageNotes": 1-2 sentences on how dense/testable the material is.
- "maxQuestions": equal to the number of items in "concepts".
- Use ONLY the provided notes. Never add outside knowledge.
${MATH_RULES}${guidanceBlock(guidance)}`;
    const user = `Requested difficulty: ${difficulty}${count ? `\nPlanned question count: ${count}` : ""}\n\nNOTES:\n"""${sourceText.slice(0, 30000)}"""`;
    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    try {
      const parsed = AnalysisSchema.parse(JSON.parse(raw));
      const concepts = (parsed.concepts ?? []).slice(0, 100);
      return {
        topics: parsed.topics.slice(0, 12),
        keyFacts: parsed.keyFacts.slice(0, 60),
        summaries: (parsed.summaries ?? []).slice(0, 12),
        namedTerms: (parsed.namedTerms ?? []).slice(0, 30),
        coverageNotes: parsed.coverageNotes,
        concepts,
        objectives: (parsed.objectives ?? []).slice(0, 30),
        keyTerms: (parsed.keyTerms ?? []).slice(0, 40),
        calculations: (parsed.calculations ?? []).slice(0, 30),
        sourceQuestions: (parsed.sourceQuestions ?? []).slice(0, 10),
        // Capacity = distinct testable concepts (same number the warning uses)
        maxQuestions: concepts.length || parsed.maxQuestions || 0,
      } satisfies Analysis;
    } catch {
      return { topics: [], keyFacts: [], summaries: [], namedTerms: [], coverageNotes: "", maxQuestions: 0, concepts: [], objectives: [], keyTerms: [], calculations: [], sourceQuestions: [] } as Analysis;
    }
  });


/* ---------------- 2. Generate ---------------- */

function genSystemPrompt(difficulty: string, analysis?: Analysis | null, spec?: Partial<StyleSpec> | null, guidance?: string | null, curriculum?: string | null) {
  const list = (title: string, items?: string[]) => (items?.length ? `\n\n${title}:\n${items.map((t) => `- ${t}`).join("\n")}` : "");

  return `You generate multiple-choice quiz questions from provided source material.

${levelBlock(difficulty, spec, curriculum)}

RULES:
- Return ONLY valid JSON of the shape: {"questions":[{"question":string,"choices":[string,string,string,string],"correctIndex":0-3,"sourceQuote":string}]}
- "sourceQuote" MUST be a verbatim substring of the source (6-30 words) supporting the answer. For calculation/application questions quote the formula, worked example or data used — the final answer itself does NOT need to appear in the source.
- Exactly 4 choices, exactly one clearly correct.
- Facts, formulas and data come ONLY from the source. Calculation/application answers may be derived from them, and must be worked out correctly.

DISTRACTORS:
- Plausible misconceptions on the SAME topic as the question. For calculations use common mistakes (forgetting to add the masses, forgetting ×100, wrong unit conversion, inverted formula).
- Never options from an unrelated part of the source, silly options, options that contradict the stem, or two wrong options that mean the same thing.

FORMATTING:
- All 4 options share capitalisation, style, grammar and similar length; the correct option must never stand out. Don't capitalise ordinary terms (mass, weight) mid-sentence.

STEMS:
- Never write "according to the text/source/notes/definition". Every question stands alone.
- Use the stem opening assigned in each question plan. Do not start most questions with "Which of the following".
- Use the assigned correct-answer position (correctIndex) exactly.

 ${SELF_CONTAINED}
 ${TERM_CONSISTENCY}
 ${MATH_RULES}${guidanceBlock(guidance)}${list("ANALYSED TOPICS", analysis?.topics)}${list("KEY FACTS FROM THE NOTES", analysis?.keyFacts)}${list("FORMULAS / WORKED EXAMPLES / DATA IN THE NOTES", analysis?.calculations)}${list("THE SOURCE'S OWN PRACTICE QUESTIONS (use as a guide for style and difficulty)", analysis?.sourceQuestions)}${list("EXACT SOURCE-DEFINED TERMS (use only these spellings and singular forms)", analysis?.namedTerms)}`;
}

/* ---------------- Blueprint: plan the whole set before writing ---------------- */

type QType = "recall" | "calculation" | "explain" | "apply";
type Slot = { concept: string; type: QType; answer: number; opener: string };

const OPENERS: Record<QType, string[]> = {
  recall: ["State", "Name", "What is", "Which term", "Identify", "Define", "What does", "Give"],
  calculation: ["Calculate", "A student measures", "Work out", "If", "Determine", "A sample of", "Find", "What is the value"],
  explain: ["Explain why", "Why does", "Describe", "What causes", "Suggest why", "How does", "What happens when"],
  apply: ["Suggest", "Predict", "In an experiment", "A scientist", "Complete", "Deduce", "Which change", "When"],
};

function typeWeights(difficulty: string, spec?: Partial<StyleSpec> | null): Record<Exclude<QType, "calculation">, number> {
  if (spec?.mode === "advanced") {
    const c = spec.complexity ?? 3;
    const o = spec.obscurity ?? 3;
    const recall = Math.max(0, 0.8 - 0.2 * (c - 1) - 0.05 * (o - 1));
    return { recall, explain: (1 - recall) * 0.45, apply: (1 - recall) * 0.55 };
  }
  if (difficulty === "easy") return { recall: 0.8, explain: 0.1, apply: 0.1 };
  if (difficulty === "medium") return { recall: 0.45, explain: 0.25, apply: 0.3 };
  return { recall: 0.05, explain: 0.4, apply: 0.55 };
}

function buildBlueprint(count: number, difficulty: string, analysis: Analysis | null, spec?: Partial<StyleSpec> | null): Slot[] {
  const calcs = analysis?.calculations ?? [];
  const nCalc = calcs.length ? Math.ceil(count * 0.4) : 0;
  const w = typeWeights(difficulty, spec);
  const rest = count - nCalc;
  const nRecall = Math.round(rest * w.recall);
  const nExplain = Math.round(rest * w.explain);
  const nApply = Math.max(0, rest - nRecall - nExplain);
  const pools: QType[][] = [Array(nCalc).fill("calculation"), Array(nApply).fill("apply"), Array(nExplain).fill("explain"), Array(nRecall).fill("recall")];
  // Interleave so types are spread through the set
  const types: QType[] = [];
  while (types.length < count) {
    let added = false;
    for (const p of pools) if (p.length) { types.push(p.shift()!); added = true; }
    if (!added) types.push("recall");
  }

  // Concepts: must-cover (objectives + key terms) first, then all other concepts; no repeat until all used
  const seen = new Set<string>();
  const ordered = [...(analysis?.objectives ?? []), ...(analysis?.keyTerms ?? []), ...(analysis?.concepts ?? []), ...(analysis?.topics ?? [])].filter((c) => {
    const k = c.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let ci = 0;
  let kci = 0;

  // Balanced answer positions: shuffled blocks of 0..3
  const answers: number[] = [];
  while (answers.length < count) {
    const block = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    answers.push(...block);
  }

  const cap = stemCap(count);
  const used = new Map<string, number>();
  const pickOpener = (t: QType) => {
    const all = [...OPENERS[t], ...Object.values(OPENERS).flat()];
    const o = all.find((x) => (used.get(x) ?? 0) < cap) ?? OPENERS[t][0];
    used.set(o, (used.get(o) ?? 0) + 1);
    return o;
  };

  return types.map((type, i) => {
    let concept: string;
    if (type === "calculation" && calcs.length) concept = calcs[kci++ % calcs.length];
    else concept = ordered.length ? ordered[ci++ % ordered.length] : "any untested part of the notes";
    return { concept, type, answer: answers[i], opener: pickOpener(type) };
  });
}

const GenerateInput = InputSchema.extend({
  analysis: AnalysisSchema.partial().optional(),
});

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GenerateInput.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, count, difficulty, spec, guidance, curriculum } = data;
    const analysis = (data.analysis ?? null) as Analysis | null;
    const sourceNorm = normalize(sourceText);
    const systemPrompt = genSystemPrompt(difficulty, analysis, spec, guidance, curriculum);

    const pending: Slot[] = buildBlueprint(count, difficulty, analysis, spec);
    const batch = batchSize(count);
    const validated: Question[] = [];
    const seen = new Set<string>();
    const maxAttempts = Math.ceil(count / batch) * 2 + 8;
    let attempts = 0;
    let emptyStreak = 0;

    while (validated.length < count && attempts < maxAttempts && pending.length) {
      attempts++;
      const slots = pending.slice(0, Math.min(count - validated.length, batch));
      const need = slots.length;

      const avoid = validated.map((q) => q.question);
      const plan = slots
        .map(
          (s, i) =>
            `Question ${i + 1}: concept = "${s.concept}"; type = ${s.type}${s.type === "calculation" ? " (must require calculating/applying the formula or data)" : ""}; start the stem with "${s.opener}" (adapt grammar if needed); correctIndex = ${s.answer}.`,
        )
        .join("\n");
      const userPrompt = `Generate exactly ${need} quiz question(s) from this source, following this plan in order. Return valid JSON only.\n\nPLAN:\n${plan}${
        avoid.length ? `\n\nDo NOT repeat or test the same concept as any of these already-used questions:\n${avoid.map((q) => `- ${q}`).join("\n")}` : ""
      }\n\nSOURCE:\n"""${sourceText}"""`;
      let raw: string;
      try {
        raw = await callAI([
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ]);
      } catch (e) {
        if (validated.length === 0) throw e;
        emptyStreak++;
        if (emptyStreak >= 5) break;
        continue;
      }
      let parsed: { questions: unknown[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        emptyStreak++;
        if (emptyStreak >= 5) break;
        continue;
      }
      let addedThisRound = 0;
      const items = parsed.questions ?? [];
      for (let k = 0; k < items.length && k < slots.length; k++) {
        const p = QuestionSchema.safeParse(items[k]);
        if (!p.success) continue;
        const q = placeCorrect(p.data, slots[k].answer);
        const dedupKey = q.question.toLowerCase().trim();
        if (seen.has(dedupKey)) continue;
        if (REFERS_TO_SOURCE.test(q.question)) continue;
        if (!validateQuestion(q, sourceNorm)) continue;
        if (validated.some((a) => tooSimilar(a, q))) continue;
        seen.add(dedupKey);
        validated.push(q);
        pending.splice(pending.indexOf(slots[k]), 1);
        addedThisRound++;
        if (validated.length >= count) break;
      }
      // A slot that failed twice gets a fresh concept so the run doesn't stall on it
      if (addedThisRound === 0 && pending.length) {
        const s = pending.shift()!;
        const alt = analysis?.concepts?.find((c) => !validated.some((q) => normalize(q.question).includes(normalize(c))));
        pending.push({ ...s, concept: alt ?? "any untested part of the notes" });
      }
      emptyStreak = addedThisRound === 0 ? emptyStreak + 1 : 0;
      if (emptyStreak >= 5) break;
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

const REVIEW_SYSTEM = (difficulty: string, analysis?: Analysis | null, spec?: Partial<StyleSpec> | null, guidance?: string | null, curriculum?: string | null) => `You are a strict quiz quality reviewer.
- Return ONLY valid JSON: {"reviews":[{"index":number,"pass":boolean,"issues":[string]}]}
- Review EVERY question given, using its index from the input. "issues" is empty when pass is true.
${levelBlock(difficulty, spec, curriculum)}
Check each question, in this order:
1. GROUNDING (check first): is the marked correct answer TRUE according to the notes? Accept answers stated in the notes AND answers DERIVED correctly from a formula, worked example, data table or rule in the notes (e.g. notes give speed = distance / time; a question asking the speed for 150 m in 10 s with answer 15 m/s is VALID). For derived answers, redo the working yourself and fail only if the working or result is wrong — never fail because the final answer text does not appear in the notes. Fail if it contradicts the notes or relies on outside facts.
2. SETTINGS: fail it if it does not match the LEVEL & STYLE SETTINGS above (e.g. plain recall when the settings demand application, multi-step reasoning or inference; wrong length; missing curriculum command-word style).
3. DISTRACTORS: wrong options must be plausible misconceptions on the same topic (for calculations: common mistakes such as a forgotten step, wrong unit conversion, not multiplying by 100). Fail for options from an unrelated part of the notes, silly options, options contradicting the stem, two wrong options meaning the same thing, or more than one defensible answer (ambiguous / double-correct).
4. FORMATTING: all options must share capitalisation, style and similar length; the correct option must not stand out. Ordinary terms (mass, weight) must not be capitalised mid-sentence.
5. CONTEXT: fail if a learner without the notes could not answer from the stem and options alone, or if it says "according to the text/source/notes/passage/definition", or uses vague references ("it", "this process", "the above").
6. SET-LEVEL (compare the whole set): fail the later question when two test the same concept/fact (even reworded); fail questions whose stem opening (first 2-3 words) is used by more than 3 questions in the set${analysis?.objectives?.length ? "; when objectives or key terms below are not covered by any question while another concept is tested twice, fail one of the repeats and say which objective to test instead" : ""}.
7. TERM CONSISTENCY: fail any question or option that pluralizes, abbreviates or respells a source-defined term; include the exact source term in the issue.
Each issue is one short, actionable sentence. ${TERM_CONSISTENCY}${analysis?.namedTerms?.length ? `\nEXACT FIRST-OCCURRENCE SOURCE TERMS:\n${analysis.namedTerms.join("\n")}` : ""}${mustCoverList(analysis) ? `\nMUST-COVER OBJECTIVES / KEY TERMS:\n${mustCoverList(analysis).map((m) => `- ${m}`).join("\n")}` : ""}${guidanceBlock(guidance)}`;

function mustCoverList(analysis?: Analysis | null): string[] {
  if (!analysis) return [];
  return [...(analysis.objectives ?? []), ...(analysis.keyTerms ?? [])];
}

async function reviewBatch(sourceText: string, questions: Question[], difficulty: string, analysis?: Analysis | null, spec?: Partial<StyleSpec> | null, guidance?: string | null, curriculum?: string | null) {
  const user = `NOTES:\n"""${sourceText.slice(0, 20000)}"""\n\nQUESTIONS (correct answer marked by correctIndex):\n${JSON.stringify(
    questions.map((q, index) => ({ index, ...q })),
  )}`;
  const raw = await callAI([
    { role: "system", content: REVIEW_SYSTEM(difficulty, analysis, spec, guidance, curriculum) },
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

/** Deterministic set-level checks the reviewer may miss. */
function localIssues(current: Question[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (i: number, s: string) => out.set(i, [...(out.get(i) ?? []), s]);
  const cap = stemCap(current.length);
  const openerCount = new Map<string, number>();
  current.forEach((q, i) => {
    if (REFERS_TO_SOURCE.test(q.question)) add(i, "Remove wording that refers to the text/source/notes; make the question standalone.");
    const o = openerOf(q.question);
    const n = (openerCount.get(o) ?? 0) + 1;
    openerCount.set(o, n);
    if (n > cap) add(i, `The stem opening "${o}" is overused; start the question differently.`);
    for (let j = 0; j < i; j++) {
      if (tooSimilar(current[j], q)) {
        add(i, `Tests the same concept as question ${j + 1}; test a different concept from the notes.`);
        break;
      }
    }
  });
  return out;
}

async function regenerateOne(
  sourceText: string,
  difficulty: string,
  analysis: Analysis | null,
  failed: Question,
  issues: string[],
  accepted: Question[],
  spec?: Partial<StyleSpec> | null,
  guidance?: string | null,
  curriculum?: string | null,
): Promise<Question | null> {
  const used = new Set(accepted.map((q) => openerOf(q.question)));
  const user = `Write ONE replacement quiz question.

The following question FAILED review:
${JSON.stringify(failed)}

Reviewer issues to fix:
${issues.map((i) => `- ${i}`).join("\n") || "- low quality"}

Fix these issues. Keep the same concept unless the issues say it duplicates another question.${
    mustCoverList(analysis).length ? `\nMust-cover objectives/key terms: ${mustCoverList(analysis).join("; ")}` : ""
  }
Avoid these overused stem openings: ${[...used].slice(0, 40).join(", ") || "(none)"}

Do NOT duplicate any of these already-accepted questions:
${accepted.map((q) => `- ${q.question}`).join("\n") || "(none)"}

Return JSON with exactly one item: {"questions":[{...}]}

SOURCE:
"""${sourceText}"""`;
  const raw = await callAI([
    { role: "system", content: genSystemPrompt(difficulty, analysis, spec, guidance, curriculum) },
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
  guidance: z.string().max(2000).optional(),
  curriculum: z.string().max(120).optional(),
  sourceText: z.string().min(20),
  questions: z.array(QuestionSchema).min(1),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  requested: z.number().int().min(1).max(100),
  analysis: AnalysisSchema.partial().optional(),
  spec: StyleSpecSchema.partial().optional(),
});

const MAX_REVIEW_ROUNDS = 5;
const GLOBAL_REGEN_CAP = 150;

export const reviewAndRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReviewInput.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, questions, difficulty, requested, spec, guidance, curriculum } = data;
    const analysis = (data.analysis ?? null) as Analysis | null;
    const sourceNorm = normalize(sourceText);

    /* Questions are never deleted — failing ones are regenerated in place and
       re-verified, for up to 5 rounds. After that the current version is kept. */
    const current: Question[] = [...questions];
    let regenerated = 0;
    let budget = GLOBAL_REGEN_CAP;
    let rounds = 0;
    let stillFailing = 0;

    for (let round = 0; round < MAX_REVIEW_ROUNDS; round++) {
      rounds = round + 1;
      const reviews = await reviewBatch(sourceText, current, difficulty, analysis, spec, guidance, curriculum);
      const verdict = new Map(reviews.map((r) => [r.index, r]));
      const local = localIssues(current);

      const failing: Array<{ index: number; issues: string[] }> = [];
      current.forEach((_, i) => {
        const r = verdict.get(i);
        const extra = local.get(i) ?? [];
        if ((r && !r.pass) || extra.length) failing.push({ index: i, issues: [...(r && !r.pass ? r.issues : []), ...extra] });
      });

      stillFailing = failing.length;
      if (failing.length === 0) break;

      let changed = false;
      for (const f of failing) {
        if (budget <= 0) break;
        budget--;
        const others = current.filter((_, i) => i !== f.index);
        const replacement = await regenerateOne(sourceText, difficulty, analysis, current[f.index], f.issues, others, spec, guidance, curriculum);
        if (!replacement) continue;
        const dupe = others.some(
          (a) =>
            a.question.toLowerCase().trim() === replacement.question.toLowerCase().trim() ||
            tooSimilar(a, replacement),
        );
        if (dupe || REFERS_TO_SOURCE.test(replacement.question) || !validateQuestion(replacement, sourceNorm)) continue;
        /* Keep the planned answer position so the A-D balance is preserved */
        current[f.index] = placeCorrect(replacement, current[f.index].correctIndex);
        regenerated++;
        changed = true;
      }
      if (!changed) break;
    }

    return {
      questions: current.slice(0, requested),
      requested,
      reviewed: questions.length,
      regenerated,
      rounds,
      stillFailing,
      dropped: 0,
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
  brief: z.string().max(2000).optional().default(""),
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
    const { mode, instruction, existingText, actions, planAnswers, brief } = data;

    const VOLUME = `- The text must be rich enough to write at least 150 distinct multiple-choice quiz questions from it. Aim for 1800+ words packed with separate, testable facts (definitions, dates, names, numbers, causes, effects, examples, comparisons). Never pad with filler or repetition — every sentence should add new testable information.
- FACT-CHECK EVERYTHING before returning it: verify each fact, figure, date, name and relationship against what you reliably know, correct anything wrong, and silently drop any claim you cannot stand behind. Never invent statistics, quotes or citations.`;

    const base = `You are a writing assistant that produces study/reference text suitable for generating quiz questions from. Rules:
- Return ONLY the finished text as plain prose. No preamble, no markdown headers, no commentary, no quotes.
- Prefer clear factual sentences, concrete details, definitions, dates, names, numbers.
${VOLUME}
${MATH_RULES}`;

    let system: string;
    let user: string;

    if (mode === "source-finder") {
      system = `${base}
- You are in SOURCE FINDER mode: gather and compile the most relevant, accurate real-world information about the described topic from your knowledge of published sources.
- Be comprehensive and specific: include key facts, figures, dates, names, definitions and relationships a quiz could test.
- Fact-check the compiled information before returning it: only state information you are confident is accurate, and drop anything doubtful. Do not invent statistics or citations.`;
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

      /* Use the user's brief when given; otherwise have the AI summarise the text first */
      let context = brief?.trim() ?? "";
      if (!context && existingText.trim()) {
        context =
          (
            await callAI(
              [
                {
                  role: "system",
                  content:
                    "Summarise what the following text is about in 2-3 sentences. Name the subject, scope and purpose. Return only the summary.",
                },
                { role: "user", content: existingText.slice(0, 20000) },
              ],
              false,
            )
          )?.trim() ?? "";
      }

      system = `${base}
- You are in REFINE & CHECK mode: rewrite the user's existing source text according to the requested actions while preserving its meaning and all accurate facts.
- Return the full rewritten text, not a diff or a summary.
- Expand the text with further accurate, fact-checked, closely related detail where needed so it can support at least 150 quiz questions.`;
      user = `What this text is about: ${context || "(not provided)"}\n\nRequested actions:\n${asked
        .map((a) => `- ${a}`)
        .join("\n")}\n\nAdditional context: ${instruction}${planBlock(
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
    const user = `Apply EVERY requested change below literally and completely, to every question:\n${asks.join("\n") || "- Improve the questions"}\n\nQUESTIONS TO REWRITE:\n${JSON.stringify(
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
  missed: z.array(z.object({ question: z.string(), correct: z.string() })).max(100).optional().default([]),
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

/* ---------------- Short explanations for wrong answers ---------------- */

const WrongInput = z.object({
  sourceText: z.string().max(20000).optional().default(""),
  items: z
    .array(
      z.object({
        question: z.string().max(1000),
        correct: z.string().max(500),
        chosen: z.string().max(500),
      }),
    )
    .min(1)
    .max(100),
});

export const explainWrongAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => WrongInput.parse(raw))
  .handler(async ({ data }) => {
    const { items, sourceText } = data;
    const system = `You write one very short explanation for each quiz question a learner got wrong.
- Return ONLY valid JSON: {"explanations":[string]} with EXACTLY ${items.length} items, in the same order.
- Each explanation says why the correct answer is right (and, if it fits, why the chosen one is wrong).
- LENGTH: 5-20 words for a simple, everyday topic. Only for a genuinely advanced or technical topic may you use up to 45 words. Never longer.
- Plain sentence, no bullets, no markdown, no preamble.
${MATH_RULES}`;
    const user = `${sourceText ? `SOURCE (excerpt):\n"""${sourceText.slice(0, 6000)}"""\n\n` : ""}WRONG ANSWERS:\n${JSON.stringify(items)}`;
    const raw = await callAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    try {
      const parsed = z.object({ explanations: z.array(z.string()) }).parse(JSON.parse(raw));
      return { explanations: items.map((_, i) => parsed.explanations[i] ?? "") };
    } catch {
      return { explanations: items.map(() => "") };
    }
  });
