import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractFromFile } from "./extract.functions";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  // Plain text / csv / markdown
  if (type.startsWith("text/") || /\.(txt|md|csv)$/i.test(name)) {
    return await file.text();
  }

  // Images → AI OCR
  if (type.startsWith("image/")) {
    const base64 = await fileToBase64(file);
    const { text } = await extractFromFile({ data: { fileBase64: base64, mimeType: type, kind: "image" } });
    return text;
  }

  // PDF → AI
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const base64 = await fileToBase64(file);
    const { text } = await extractFromFile({ data: { fileBase64: base64, mimeType: "application/pdf", kind: "pdf" } });
    return text;
  }

  // DOCX
  if (name.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return value;
  }

  // XLSX / XLS
  if (/\.(xlsx|xls)$/i.test(name) || type.includes("sheet") || type.includes("excel")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      parts.push(`# Sheet: ${sheetName}`);
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      parts.push(csv);
    }
    return parts.join("\n\n");
  }

  throw new Error(`Unsupported file type: ${type || name}`);
}
