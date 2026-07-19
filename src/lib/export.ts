import type { Question } from "./ai.functions";

export type Platform = "blooket" | "gimkit" | "gimkit2" | "kahoot";

export const PLATFORM_LABELS: Record<Platform, string> = {
  blooket: "Blooket",
  gimkit: "Gimkit",
  gimkit2: "Gimkit 2",
  kahoot: "Kahoot",
};

// Stripped clipboard — question + choices only, no labels
export function toStrippedClipboard(questions: Question[]): string {
  return questions.map((q) => [q.question, ...q.choices].join("\n")).join("\n\n");
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// Blooket: Question, A1, A2, A3, A4, Time Limit, Correct#
export function toBlooketText(questions: Question[], timeLimit = 20): string {
  return questions
    .map((q) => {
      const [a1, a2, a3, a4] = q.choices;
      return [q.question, a1, a2, a3 ?? "", a4 ?? "", String(timeLimit), String(q.correctIndex + 1)]
        .map(csvEscape)
        .join(", ");
    })
    .join("\n");
}

// Gimkit: Question, Correct, Incorrect1, Incorrect2, Incorrect3
export function toGimkitText(questions: Question[]): string {
  return questions
    .map((q) => {
      const correct = q.choices[q.correctIndex];
      const incorrect = q.choices.filter((_, i) => i !== q.correctIndex);
      return [q.question, correct, ...incorrect].map(csvEscape).join(", ");
    })
    .join("\n");
}

// Gimkit 2: Question, Correct Answer
export function toGimkit2Text(questions: Question[]): string {
  return questions
    .map((q) => [q.question, q.choices[q.correctIndex]].map(csvEscape).join(", "))
    .join("\n");
}

// Kahoot: Question(≤120), A1-A4(≤75), Time Limit, Correct#
export function toKahootText(questions: Question[], timeLimit = 20): string {
  return questions
    .map((q) => {
      const [a1, a2, a3, a4] = q.choices;
      return [
        truncate(q.question, 120),
        truncate(a1 ?? "", 75),
        truncate(a2 ?? "", 75),
        truncate(a3 ?? "", 75),
        truncate(a4 ?? "", 75),
        String(timeLimit),
        String(q.correctIndex + 1),
      ]
        .map(csvEscape)
        .join(", ");
    })
    .join("\n");
}

export function formatFor(platform: Platform, questions: Question[]): string {
  switch (platform) {
    case "blooket": return toBlooketText(questions);
    case "gimkit": return toGimkitText(questions);
    case "gimkit2": return toGimkit2Text(questions);
    case "kahoot": return toKahootText(questions);
  }
}

export const PLATFORM_HEADERS: Record<Platform, string> = {
  blooket: "Question Text, Answer 1, Answer 2, Answer 3 (Optional), Answer 4 (Optional), Time Limit (sec)(Max: 300 seconds), Correct Answer(s)(Only include Answer #)",
  gimkit: "Question, Correct Answer, Incorrect Answer 1, Incorrect Answer 2 (Optional), Incorrect Answer 3 (Optional)",
  gimkit2: "Question, Correct Answer",
  kahoot: "Question (max 120), Answer 1 (max 75), Answer 2 (max 75), Answer 3 (max 75), Answer 4 (max 75), Time Limit, Correct Answer(s)",
};

// Legacy file exports (kept for history detail)
export function toBlooketCSV(questions: Question[]): string {
  const rows = [[
    "Question #", "Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4",
    "Time Limit (sec) - Max 300 seconds", "Correct Answer(s)",
  ]];
  questions.forEach((q, i) => {
    const [a1, a2, a3, a4] = q.choices;
    rows.push([String(i + 1), q.question, a1, a2, a3, a4, "20", String(q.correctIndex + 1)]);
  });
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function toGimkitTSV(questions: Question[]): string {
  return questions
    .map((q) => {
      const correct = q.choices[q.correctIndex];
      const incorrect = q.choices.filter((_, i) => i !== q.correctIndex);
      return [q.question, correct, ...incorrect].join("\t");
    })
    .join("\n");
}

export function toQuizletTSV(questions: Question[]): string {
  return questions.map((q) => `${q.question}\t${q.choices[q.correctIndex]}`).join("\n");
}

export function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
