import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Extract text from a base64-encoded image / PDF using Lovable AI vision.
const InputSchema = z.object({
  fileBase64: z.string(),
  mimeType: z.string(),
  kind: z.enum(["image", "pdf"]),
});

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export const extractFromFile = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const dataUrl = `data:${data.mimeType};base64,${data.fileBase64}`;

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: "Extract ALL text content from this file. Preserve structure and meaning. Output only the extracted text — no commentary.",
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
