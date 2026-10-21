import * as XLSX from "xlsx";
import type { Question } from "./ai.functions";
import { getCorrectIndexes, isMultiAnswer } from "./question-utils";

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
    "Question (max 95)",
    "Answer 1 (max 60)",
    "Answer 2 (max 60)",
    "Answer 3 (max 60)",
    "Answer 4 (max 60)",
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

/** Blooket and Gimkit exports take one correct answer, so two-answer questions are left out there. */
export function supportsMultiAnswer(platform: Platform) {
  return platform === "kahoot";
}

/** Questions that a platform's export can include (and whose answers are valid). */
export function exportableQuestions(platform: Platform, questions: Question[]): Question[] {
  return questions.filter((q) => getCorrectIndexes(q).length > 0 && (supportsMultiAnswer(platform) || !isMultiAnswer(q)));
}

/** Notice for left-out two-answer questions, or null when none are left out. */
export function multiExcludedNotice(platform: Platform, questions: Question[]): string | null {
  if (supportsMultiAnswer(platform)) return null;
  const n = questions.filter(isMultiAnswer).length;
  return n ? `${n} multi-answer question(s) were not included because Blooket and Gimkit exports use one correct answer.` : null;
}

// Build platform-specific rows (each inner array = one spreadsheet row of cells).
// Unused answer columns stay blank; two-answer questions are skipped where the platform takes only one.
export function toRows(platform: Platform, questions: Question[], timeLimit = 20): string[][] {
  const qs = exportableQuestions(platform, questions);
  switch (platform) {
    case "blooket":
      return qs.map((q) => {
        const [a1, a2, a3, a4] = q.choices;
        return [q.question, a1 ?? "", a2 ?? "", a3 ?? "", a4 ?? "", String(timeLimit), String(getCorrectIndexes(q)[0] + 1)];
      });
    case "gimkit":
      return qs.map((q) => {
        const c = getCorrectIndexes(q)[0];
        const incorrect = q.choices.filter((_, i) => i !== c);
        return [q.question, q.choices[c], incorrect[0] ?? "", incorrect[1] ?? "", incorrect[2] ?? ""];
      });
    case "gimkit2":
      return qs.map((q) => [q.question, q.choices[getCorrectIndexes(q)[0]]]);
    case "kahoot":
      return qs.map((q) => {
        const [a1, a2, a3, a4] = q.choices;
        return [
          truncate(q.question, 95),
          truncate(a1 ?? "", 60),
          truncate(a2 ?? "", 60),
          a3 ? truncate(a3, 60) : "",
          a4 ? truncate(a4, 60) : "",
          String(timeLimit),
          getCorrectIndexes(q).map((i) => i + 1).join(","),
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
