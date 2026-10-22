import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractFromFile } from "./extract.functions";
import { htmlToStudyText, labelledSheetText, validateStudyExtraction } from "./study-file-text";

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

export async function parseFile(file: File, onWarning?: (message: string) => void): Promise<string> {
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
    return validateStudyExtraction(text, onWarning);
  }

  // PDF → AI
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const base64 = await fileToBase64(file);
    const { text } = await extractFromFile({ data: { fileBase64: base64, mimeType: "application/pdf", kind: "pdf" } });
    return validateStudyExtraction(text, onWarning);
  }

  // DOCX
  if (name.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
    return htmlToStudyText(value);
  }

  // XLSX / XLS
  if (/\.(xlsx|xls)$/i.test(name) || type.includes("sheet") || type.includes("excel")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      parts.push(labelledSheetText(sheetName, csv));
    }
    return parts.join("\n\n");
  }

  throw new Error(`Unsupported file type: ${type || name}`);
}
