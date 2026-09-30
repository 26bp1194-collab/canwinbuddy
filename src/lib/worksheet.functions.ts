import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorksheetContent } from "./worksheet-types";

const InputSchema = z
  .object({
    subject: z.string().trim().min(1, "Subject is required").max(100),
    age: z.number().int().min(5).max(19),
    curriculum: z.string().trim().min(1, "Curriculum is required").max(100),
    topics: z.string().max(4000).default(""),
    sourceText: z.string().max(60000).default(""),
    title: z.string().max(200).default(""),
  })
  .refine((d) => d.topics.trim().length > 0 || d.sourceText.trim().length > 0, {
    message: "Add source text or topics to follow",
  });

const FORMAT_GUIDES = `REAL CURRICULUM FORMATS — mirror the genuine paper structure for the chosen curriculum and age:
- SPM (Malaysia, Form 4–5, age 16–17): Paper 1 style Section of objective MCQ with 4 options A–D (1 mark each); Paper 2 style Section A structured questions with sub-parts (a)(b)(c) and marks per part; Section B/C longer structured or essay questions for languages/humanities/sciences (e.g. "Answer any one question"). Primary (Standard 1–6, UPSR/PBD style) and lower secondary (Form 1–3, PT3 style) use MCQ A–D, fill in the blanks, matching, short answers.
- IGCSE (Cambridge, age 14–16): MCQ with 4 options A–D for science/maths Paper 1/2; structured questions with sub-parts and marks in [brackets]; extended-response/essay for English, History, etc.
- A-Levels (age 17–18): mostly structured and extended-response; MCQ A–D only for sciences (AS Paper 1); essays for humanities with high marks (e.g. 20–25).
- Gaokao (China, age 17–18): single-choice MCQ with 4 options A–D, fill-in-the-blank, and worked-solution / free-response questions; essay (作文) for Chinese/English.
- AP (US, age 15–18): MCQ with 4 options A–D (5 options A–E for older AP-style if suitable), plus Free-Response Questions (FRQ) with parts (a)(b)(c) / DBQ / essay depending on subject.
- SAT (age 16–18): MCQ with 4 options A–D, plus student-produced response (grid-in) for math; reading/writing are passage-based MCQ.
- CBSE (India, age 6–18): sections of MCQ (1 mark), very short answer (2 marks), short answer (3 marks), long answer (5 marks), case/source-based questions (4 marks); assertion–reason for classes 9–12.
- ICSE (India, age 6–16): Section A compulsory short answers & MCQ; Section B choice of longer structured questions with marks per part.
- Other/custom curricula: follow the real format of that curriculum if you know it; otherwise use a sensible national-exam style for that age.
AGE ADJUSTMENTS: ages 6–9 → simple wording, fill in the blanks, matching, true/false, picture-free short answers, few lines; ages 10–12 → add MCQ and short answers; 13+ → full exam style including essays where the real paper has them. Only include essays when the real subject paper uses them.`;

const SCHEMA_HINT = `Return JSON exactly:
{"title": string, "header": string, "duration": string, "generalInstructions": string[],
 "sections": [{"title": string, "instructions": string, "items": [
   {"type": "mcq"|"short"|"structured"|"fill_blank"|"true_false"|"matching"|"essay",
    "prompt": string, "marks": number,
    "choices"?: string[] (mcq only: 4 or 5, text only without letters),
    "lines"?: number (short 1-4, essay 12-30),
    "parts"?: [{"label":"(a)","prompt":string,"marks":number,"lines":number}] (structured only),
    "pairs"?: [{"left":string,"right":string}] (matching only, correct pairs),
    "answer": string (mcq: the correct letter + short reason; others: model answer / marking points; true_false: "True" or "False")}
 ]}]}
fill_blank prompts use "_____" for each blank. 12-25 items total unless the format needs fewer long questions.`;

export const generateWorksheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");
    const system = `You are an expert exam setter who writes printable school worksheets that look exactly like real ${data.curriculum} papers.
${FORMAT_GUIDES}
Ground every question in the provided source text and/or topics. When source text is given, facts must come from it.
TERM CONSISTENCY: use named terms exactly as they first appear in the source, in the same singular form and spelling.
Write math with Unicode (x², ½, √, π), never LaTeX.
${SCHEMA_HINT}`;
    const user = `Curriculum: ${data.curriculum}
Subject: ${data.subject}
Student age: ${data.age}
${data.title ? `Worksheet title: ${data.title}\n` : ""}Topics to follow:
${data.topics.trim() || "(none — use the source text)"}

Source text:
${data.sourceText.trim().slice(0, 50000) || "(none — use the topics and standard curriculum knowledge)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
    let content: WorksheetContent;
    try {
      content = JSON.parse(raw.replace(/^```json\s*|```$/g, ""));
    } catch {
      throw new Error("The AI returned an invalid worksheet. Please try again.");
    }
    if (!Array.isArray(content.sections) || !content.sections.length) throw new Error("The AI returned an empty worksheet. Please try again.");
    content.generalInstructions = Array.isArray(content.generalInstructions) ? content.generalInstructions : [];
    for (const s of content.sections) {
      s.items = (Array.isArray(s.items) ? s.items : []).map((i) => ({ ...i, marks: Math.max(0, Number(i.marks) || 1) }));
    }
    const title = data.title.trim() || content.title || `${data.subject} worksheet`;
    content.title = title;

    const { data: row, error } = await context.supabase
      .from("worksheets")
      .insert({
        user_id: context.userId,
        title,
        subject: data.subject,
        age: data.age,
        curriculum: data.curriculum,
        topics: data.topics,
        source_text: data.sourceText,
        content: content as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
