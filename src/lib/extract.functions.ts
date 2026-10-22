import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Extract text from a base64-encoded image / PDF using Lovable AI vision.
const InputSchema = z.object({
  fileBase64: z.string(),
  mimeType: z.string(),
  kind: z.enum(["image", "pdf"]),
});

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export const extractFromFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const dataUrl = `data:${data.mimeType};base64,${data.fileBase64}`;

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `You are digitising a study document (textbook page, worksheet, slides, notes, photo or scan) so another AI can write quiz questions from your output alone. Transcribe faithfully and keep the structure.
Process every page of the attached PDF, from the first through the last, without skipping or summarising pages.
1. Keep reading order. For multi-column pages, finish one column before the next.
2. Keep headings as lines starting with #, ## or ### by level. Keep numbered and bulleted lists.
3. Keep numbering exactly as printed (Example 3, Exercise 2.1, Q4).
4. Put a label on its own line before each special block: [DEFINITION], [KEY POINT], [FORMULA], [WORKED EXAMPLE], [SOLUTION], [EXERCISE], [ANSWER KEY], [TABLE], [DIAGRAM], [GRAPH], [CODE], [NOTE]. Use only labels that apply.
5. Tables: output a markdown table with every header and every cell value. Do not summarise.
6. Diagrams, charts, maps and photos: write a [DIAGRAM] or [GRAPH] block describing everything needed to answer questions without seeing it: title, every label and caption, all numbers and units, axis names and scales, key data points and trends, and how the parts connect or are ordered. Never write 'see image'.
7. Maths and science: write equations in plain text with Unicode symbols (× ÷ − ² ³ √ π ≤ ≥ ≈), fractions as a/b, subscripts like H₂O. Keep units, every step of worked solutions, and final answers.
8. Handwriting or poor quality: give your best reading. Mark anything you cannot read with [unclear]. Never guess numbers.
9. Skip page numbers, running headers and footers, watermarks, adverts, copyright lines and navigation text.
10. Do not add, correct or explain anything, and add no commentary.
If there is no readable study content, output exactly: [NO READABLE CONTENT]`,
      },
    ];
    if (data.kind === "image") {
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      content.push({
        type: "file",
        file: { filename: "source.pdf", file_data: dataUrl },
      });
    }

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content }],
      }),
    });
    if (res.status === 429) throw new Error("Rate limited. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`Extraction failed (${res.status}): ${await res.text()}`);
    const body = await res.json();
    const text = body.choices?.[0]?.message?.content as string | undefined;
    return { text: text ?? "" };
  });
