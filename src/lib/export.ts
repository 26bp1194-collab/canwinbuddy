import * as XLSX from "xlsx";
import type { Question } from "./ai.functions";

export type Platform = "blooket" | "gimkit" | "gimkit2" | "kahoot";

export const PLATFORM_LABELS: Record<Platform, string> = {
  blooket: "Blooket",
  gimkit: "Gimkit",
  gimkit2: "Gimkit 2",
  kahoot: "Kahoot",
};

export const PLATFORM_COLUMNS: Record<Platform, string[]> = {
  blooket: [
    "Question Text",
    "Answer 1",
    "Answer 2",
    "Answer 3 (Optional)",
    "Answer 4 (Optional)",
    "Time Limit (sec)(Max: 300 seconds)",
    "Correct Answer(s)(Only include Answer #)",
  ],
  gimkit: [
    "Question",
    "Correct Answer",
    "Incorrect Answer 1",
    "Incorrect Answer 2 (Optional)",
    "Incorrect Answer 3 (Optional)",
  ],
  gimkit2: ["Question", "Correct Answer"],
  kahoot: [
    "Question (max 120)",
    "Answer 1 (max 75)",
    "Answer 2 (max 75)",
    "Answer 3 (max 75)",
    "Answer 4 (max 75)",
    "Time Limit",
    "Correct Answer(s)",
  ],
};

export const PLATFORM_HEADERS: Record<Platform, string> = {
  blooket: PLATFORM_COLUMNS.blooket.join(", "),
  gimkit: PLATFORM_COLUMNS.gimkit.join(", "),
  gimkit2: PLATFORM_COLUMNS.gimkit2.join(", "),
  kahoot: PLATFORM_COLUMNS.kahoot.join(", "),
};

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// Stripped clipboard — question + choices only, no labels
export function toStrippedClipboard(questions: Question[]): string {
  return questions.map((q) => [q.question, ...q.choices].join("\n")).join("\n\n");
}

// Build platform-specific rows (each inner array = one spreadsheet row of cells).
export function toRows(platform: Platform, questions: Question[], timeLimit = 20): string[][] {
  switch (platform) {
    case "blooket":
      return questions.map((q) => {
        const [a1, a2, a3, a4] = q.choices;
        return [q.question, a1, a2, a3 ?? "", a4 ?? "", String(timeLimit), String(q.correctIndex + 1)];
      });
    case "gimkit":
      return questions.map((q) => {
        const correct = q.choices[q.correctIndex];
        const incorrect = q.choices.filter((_, i) => i !== q.correctIndex);
        return [q.question, correct, incorrect[0] ?? "", incorrect[1] ?? "", incorrect[2] ?? ""];
      });
    case "gimkit2":
      return questions.map((q) => [q.question, q.choices[q.correctIndex]]);
    case "kahoot":
      return questions.map((q) => {
        const [a1, a2, a3, a4] = q.choices;
        return [
          truncate(q.question, 120),
          truncate(a1 ?? "", 75),
          truncate(a2 ?? "", 75),
          truncate(a3 ?? "", 75),
          truncate(a4 ?? "", 75),
          String(timeLimit),
          String(q.correctIndex + 1),
        ];
      });
  }
}

// Tab-separated — pastes into Excel / Sheets with each field in its own cell.
export function toTSV(platform: Platform, questions: Question[]): string {
  const rows = toRows(platform, questions);
  const escape = (v: string) => v.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return rows.map((r) => r.map(escape).join("\t")).join("\n");
}

// Kept as the primary clipboard formatter (spreadsheet-friendly).
export function formatFor(platform: Platform, questions: Question[]): string {
  return toTSV(platform, questions);
}

function csvEscape(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCSV(platform: Platform, questions: Question[]): string {
  const rows = toRows(platform, questions);
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export function toXLSXBlob(platform: Platform, questions: Question[]): Blob {
  const rows = toRows(platform, questions);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, PLATFORM_LABELS[platform]);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadFile(filename: string, content: string, mime = "text/plain") {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

// Platform-appropriate spreadsheet download.
export function downloadForPlatform(platform: Platform, questions: Question[], baseName: string) {
  const safe = baseName.replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "questions";
  if (platform === "kahoot") {
    downloadBlob(`${safe}-kahoot.xlsx`, toXLSXBlob(platform, questions));
    return "xlsx";
  }
  downloadFile(`${safe}-${platform}.csv`, toCSV(platform, questions), "text/csv");
  return "csv";
}
