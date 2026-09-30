/* Shared worksheet shapes (browser + server safe). */

export type WorksheetItem = {
  type: "mcq" | "short" | "structured" | "fill_blank" | "true_false" | "matching" | "essay";
  prompt: string;
  marks: number;
  choices?: string[]; // mcq: 4 (A–D) or 5 (A–E)
  lines?: number; // short / essay / structured parts
  parts?: { label: string; prompt: string; marks: number; lines: number }[];
  pairs?: { left: string; right: string }[]; // matching (right side shuffled on display)
  answer: string; // correct letter / model answer / marking points
};

export type WorksheetSection = { title: string; instructions: string; items: WorksheetItem[] };

export type WorksheetContent = {
  title: string;
  header: string; // e.g. "SPM Form 4 Biology — Practice Worksheet"
  duration?: string;
  generalInstructions: string[];
  sections: WorksheetSection[];
};

export function totalMarks(c: WorksheetContent): number {
  return c.sections.reduce((s, sec) => s + sec.items.reduce((a, i) => a + (Number(i.marks) || 0), 0), 0);
}

export const LETTERS = ["A", "B", "C", "D", "E"];
