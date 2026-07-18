import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuestionSchema = z.object({
  question: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  sourceQuote: z.string(),
});

export type Question = z.infer<typeof QuestionSchema>;

const InputSchema = z.object({
  sourceText: z.string().min(20),
  count: z.number().int().min(3).max(30),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callAI(messages: Array<{ role: string; content: string }>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: "json_object" },
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

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { sourceText, count, difficulty } = data;
    const sourceNorm = normalize(sourceText);

    const systemPrompt = `You generate multiple-choice quiz questions from provided source material. Rules:
- Return ONLY valid JSON of the shape: {"questions":[{"question":string,"choices":[string,string,string,string],"correctIndex":0-3,"sourceQuote":string}]}
- Each "sourceQuote" MUST be a verbatim substring copied directly from the source (10-30 words) that supports the answer.
- Do not paraphrase the sourceQuote; copy exact text from the source.
- Exactly 4 choices, only one correct.
- Difficulty: ${difficulty}. Keep questions self-contained (no "in the passage" phrasing).`;

    const validated: Question[] = [];
    const seen = new Set<string>();
    let attempts = 0;

    while (validated.length < count && attempts < 4) {
      attempts++;
      const need = count - validated.length;
      const userPrompt = `Generate ${need} quiz questions from this source. Return valid JSON only.\n\nSOURCE:\n"""${sourceText}"""`;
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
      for (const item of parsed.questions ?? []) {
        const p = QuestionSchema.safeParse(item);
        if (!p.success) continue;
        const q = p.data;
        const dedupKey = q.question.toLowerCase().trim();
        if (seen.has(dedupKey)) continue;
        if (!validateQuestion(q, sourceNorm)) continue;
        seen.add(dedupKey);
        validated.push(q);
        if (validated.length >= count) break;
      }
    }

    if (validated.length === 0) {
      throw new Error("Couldn't generate verifiable questions from this source. Try adding more detailed content.");
    }

    return { questions: validated };
  });
