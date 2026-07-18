import type { Question } from "./ai.functions";

// Stripped clipboard text — question + choices only, no labels like "Question:" / "Answer:" / "Correct:"
export function toStrippedClipboard(questions: Question[]): string {
  return questions
    .map((q) => {
      const lines = [q.question, ...q.choices];
      return lines.join("\n");
    })
    .join("\n\n");
}

// Blooket CSV: question, answer1, answer2, answer3, answer4, time, correctAnswers
// https://www.blooket.com/set-import
export function toBlooketCSV(questions: Question[]): string {
  const rows = [
    ["Question #", "Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Time Limit (sec) - Max 300 seconds", "Correct Answer(s)"],
  ];
  questions.forEach((q, i) => {
    const [a1, a2, a3, a4] = q.choices;
    rows.push([
      String(i + 1),
      q.question,
      a1, a2, a3, a4,
      "20",
      String(q.correctIndex + 1),
    ]);
  });
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

// Gimkit uses TSV-style: Question<TAB>CorrectAnswer<TAB>Incorrect1<TAB>Incorrect2<TAB>Incorrect3
export function toGimkitTSV(questions: Question[]): string {
  return questions
    .map((q) => {
      const correct = q.choices[q.correctIndex];
      const incorrect = q.choices.filter((_, i) => i !== q.correctIndex);
      return [q.question, correct, ...incorrect].join("\t");
    })
    .join("\n");
}

// Quizlet: term<TAB>definition, one per line
export function toQuizletTSV(questions: Question[]): string {
  return questions.map((q) => `${q.question}\t${q.choices[q.correctIndex]}`).join("\n");
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
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
