import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOURCE_HANDLING_RULES } from "./source-handling-rules";

/* Study Notes: a short revision sheet built only from the user's notes. Nothing is saved. */

const InputSchema = z
  .object({
    subject: z.string().trim().max(100).default(""),
    age: z.number().int().min(5).max(25).optional(),
    curriculum: z.string().trim().max(100).default(""),
    length: z.enum(["short", "standard", "detailed"]).default("standard"),
    focus: z.enum(["everything", "forgotten", "exam"]).default("everything"),
    language: z.string().trim().max(60).default("English"),
    sourceText: z.string().max(60000).default(""),
    title: z.string().max(200).default(""),
  })
  .refine((d) => d.sourceText.trim().length > 0, { message: "Add topics or source text in the Notes Space." });

const str = z.string().trim().min(1);
export const StudyNotesSchema = z.object({
  summary: z.array(str).default([]),
  keyTerms: z.array(z.object({ term: str, meaning: str })).default([]),
  keyFacts: z.array(str).default([]),
  formulas: z.array(z.object({ name: str, formula: str, whenToUse: z.string().default("") })).default([]),
  dontForget: z.array(z.object({ point: str, why: z.string().default("") })).default([]),
  commonMixUps: z.array(z.object({ itemA: str, itemB: str, difference: str })).default([]),
  memoryTricks: z.array(z.object({ trick: str, forPoint: z.string().default("") })).default([]),
  selfCheck: z.array(str).default([]),
});

export type StudyNotes = z.infer<typeof StudyNotesSchema>;

const LENGTH: Record<string, string> = {
  short: "about 1 printed page in total",
  standard: "about 2 printed pages in total",
  detailed: "about 3 printed pages in total",
};
const FOCUS: Record<string, string> = {
  everything: "Cover the whole source, most important first.",
  forgotten: "Focus mainly on easily forgotten points and common mix-ups; keep other sections very short.",
  exam: "Focus on what is most likely to be examined for this curriculum and level, using its command words where natural.",
};

export const generateStudyNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");
    const system = `You write concise revision notes (a study sheet) for a learner.
${SOURCE_HANDLING_RULES}
For this study sheet apply the block-reading and coverage rules to revision content and selfCheck questions; do not add quiz options or new sections. The source-only revision-note rules below take priority over creating new practice examples.
RULES:
- Use ONLY facts stated in the source. Never add outside facts, numbers or examples.
- Order every list by importance, most important first.
- "dontForget" and "commonMixUps" are the points that learners at this age and curriculum typically forget or confuse, chosen from the topic and the learner level. Do not claim statistics, studies or surveys.
- "memoryTricks" are memory aids only (mnemonics, rhymes, links). They must not add any new facts.
- Write in ${data.language}. Plain text only: no markdown, no LaTeX, no dollar signs or backslashes. Write maths with Unicode symbols (× ÷ − ² ³ √ π ≤ ≥, fractions as 3/4).
- Length: ${LENGTH[data.length]}. Short lines, no padding.
- ${FOCUS[data.focus]}
- Skip (return an empty array for) any section the source cannot support instead of padding it. Only include "formulas" if the source has formulas.
- "summary": 3 to 5 short lines. "selfCheck": 3 to 6 short questions to test yourself (no answers).
Return ONLY valid JSON exactly of this shape:
{"summary":[string],"keyTerms":[{"term":string,"meaning":string}],"keyFacts":[string],"formulas":[{"name":string,"formula":string,"whenToUse":string}],"dontForget":[{"point":string,"why":string}],"commonMixUps":[{"itemA":string,"itemB":string,"difference":string}],"memoryTricks":[{"trick":string,"forPoint":string}],"selfCheck":[string]}`;
    const user = `${data.title ? `Title: ${data.title}\n` : ""}Subject: ${data.subject || "(not given)"}
Learner age: ${data.age ?? "(not given)"}
Curriculum: ${data.curriculum && data.curriculum !== "none" ? data.curriculum : "(none)"}

Source:
${data.sourceText.trim().slice(0, 50000)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to your workspace.");
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    const json = await res.json();
    const raw = (json.choices?.[0]?.message?.content as string) ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, ""));
    } catch {
      throw new Error("The AI returned invalid study notes. Please try again.");
    }
    const notes = StudyNotesSchema.safeParse(parsed);
    if (!notes.success) throw new Error("The AI returned invalid study notes. Please try again.");
    const n = notes.data;
    n.summary = n.summary.slice(0, 5);
    n.selfCheck = n.selfCheck.slice(0, 6);
    const empty = Object.values(n).every((v) => !v.length);
    if (empty) throw new Error("The AI returned empty study notes. Please try again.");
    return { notes: n };
  });
