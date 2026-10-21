/** Lossless source indexing: excerpts are original text, never AI summaries. */
export type SourceSection = { id: number; text: string; start?: number; end?: number };
export function splitSource(source: string, size = 24000, overlap = 800): SourceSection[] {
  if (size <= overlap || overlap < 0) throw new Error("Invalid source chunk size");
  const sections: SourceSection[] = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(start + size, source.length);
    if (end < source.length) {
      const boundary = source.lastIndexOf("\n", end);
      if (boundary > start + size / 2) end = boundary + 1;
    }
    sections.push({ id: sections.length, text: source.slice(start, end), start, end });
    if (end === source.length) break;
    start = end - overlap;
  }
  return sections;
}

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
/** Small notes need no retrieval; large notes retain narrow, overlapping search windows. */
export function splitEvidenceSource(source: string): SourceSection[] {
  return splitSource(source, source.length <= 24000 ? 24000 : 2400, source.length <= 24000 ? 0 : 300);
}

/** Strip only known overlap, never repeated text occurring elsewhere in the source. */
function joinEvidence(sections: SourceSection[]): string {
  let previousEnd: number | undefined;
  let joined = "";
  for (const section of sections) {
    const contiguous = previousEnd !== undefined && section.start !== undefined && section.start <= previousEnd;
    const overlap = contiguous && previousEnd !== undefined && section.start !== undefined ? Math.max(0, previousEnd - section.start) : 0;
    joined += (joined && !contiguous ? "\n\n" : "") + section.text.slice(overlap);
    previousEnd = section.end;
  }
  return joined;
}

export function selectEvidence(sections: SourceSection[], targets: string[], maxSections = 12): string {
  if (sections.length <= maxSections) return joinEvidence(sections);
  const selected = new Set<number>();
  for (const target of targets.filter((t) => t.trim())) {
    const tokens = words(target);
    const ranked = sections.map((s) => {
      const lower = s.text.toLowerCase();
      const tokensHere = words(s.text);
      let score = lower.includes(target.toLowerCase().trim()) ? 100 : 0;
      tokens.forEach((word) => { if (tokensHere.has(word)) score += 1; });
      return { id: s.id, score };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    // Low-confidence matching must not silently remove necessary evidence.
    if (!best || best.score < Math.min(2, tokens.size) || tokens.size === 0) return joinEvidence(sections);
    selected.add(best.id);
    if (best.id > 0) selected.add(best.id - 1);
    if (best.id + 1 < sections.length) selected.add(best.id + 1);
  }
  if (!selected.size || selected.size > maxSections) return joinEvidence(sections);
  return joinEvidence(sections.filter((s) => selected.has(s.id)));
}

export function generationBatchSize(remaining: number, advanced = false, longAnswers = false, evidenceLength = 0): number {
  const target = longAnswers ? 5 : advanced || evidenceLength > 24000 ? 8 : 10;
  return Math.max(1, Math.min(remaining, target));
}

export function hasMathContext(source: string, guidance: string | null | undefined = "", calculations: string[] = []): boolean {
  return calculations.length > 0 || /\b(mathematics|maths|physics|chemistry|accounting|economics)\b/i.test(guidance ?? "") || /(?:\d\s*[+×÷=^]|[=√∑∫]|\b(formula|equation|calculate|percentage|ratio)\b)/i.test(source);
}

export function uniqueText(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function completeReviewIndexes(indexes: number[], expected: number[]): boolean {
  return indexes.length === expected.length && new Set(indexes).size === indexes.length && expected.every((i) => indexes.includes(i));
}

export type QuestionReview = { index: number; pass: boolean; issues: string[] };
/** Invalid or duplicate verdicts remain unreviewed, not silently counted as passes. */
export function partitionReviews(reviews: QuestionReview[], expected: number[]) {
  const allowed = new Set(expected);
  const counts = new Map<number, number>();
  reviews.forEach((r) => counts.set(r.index, (counts.get(r.index) ?? 0) + 1));
  const valid = reviews.filter((r) => allowed.has(r.index) && counts.get(r.index) === 1);
  const reviewed = new Set(valid.map((r) => r.index));
  return { reviews: valid, missing: expected.filter((index) => !reviewed.has(index)) };
}