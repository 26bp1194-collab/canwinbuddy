/* Shared, browser-safe helpers for reading quiz answers.
   Old questions only have correctIndex; newer ones may add correctIndexes (1–2 answers). */

export type AnswerShape = { choices: string[]; correctIndex: number; correctIndexes?: number[] };

/** All correct option indexes (1 or 2), always valid for the question's choices. */
export function getCorrectIndexes(q: AnswerShape): number[] {
  const n = q.choices?.length ?? 0;
  const list = Array.isArray(q.correctIndexes) && q.correctIndexes.length ? q.correctIndexes : [q.correctIndex];
  const out = [...new Set(list)].filter((i) => Number.isInteger(i) && i >= 0 && i < n).slice(0, 2);
  if (out.length) return out;
  return Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < n ? [q.correctIndex] : [];
}

export function isMultiAnswer(q: AnswerShape): boolean {
  return getCorrectIndexes(q).length > 1;
}

/** Text of every correct option. */
export function correctAnswers(q: AnswerShape): string[] {
  return getCorrectIndexes(q).map((i) => q.choices[i]);
}

/** True when the picked indexes are exactly the correct ones. */
export function isRightPick(q: AnswerShape, picks: number[]): boolean {
  const right = getCorrectIndexes(q);
  const p = [...new Set(picks)];
  return p.length === right.length && p.every((i) => right.includes(i));
}

/** Keeps correctIndex equal to the first correct answer; drops correctIndexes for single-answer questions. */
export function normalizeAnswers<T extends AnswerShape>(q: T): T {
  const idx = getCorrectIndexes(q);
  const { correctIndexes: _drop, ...rest } = q;
  void _drop;
  if (idx.length > 1) return { ...(rest as T), correctIndex: idx[0], correctIndexes: idx };
  return { ...(rest as T), correctIndex: idx[0] ?? 0 };
}

/** Reorders choices by `order` (new position -> old index) and remaps the answers. */
export function reorderChoices<T extends AnswerShape>(q: T, order: number[]): T {
  const idx = getCorrectIndexes(q).map((old) => Math.max(0, order.indexOf(old)));
  const next = { ...q, choices: order.map((o) => q.choices[o]), correctIndex: idx[0] ?? 0 };
  if (idx.length > 1) return { ...next, correctIndexes: idx };
  return next;
}
