/** Lossless source indexing: excerpts are original text, never AI summaries. */
export type SourceSection = { id: number; text: string };
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
    sections.push({ id: sections.length, text: source.slice(start, end) });
    if (end === source.length) break;
    start = end - overlap;
  }
  return sections;
}

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
export function selectEvidence(sections: SourceSection[], targets: string[], maxSections = 12): string {
  if (sections.length <= maxSections) return sections.map((s) => s.text).join("\n\n");
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
    if (!best || best.score < Math.min(2, tokens.size) || tokens.size === 0) return sections.map((s) => s.text).join("\n\n");
    selected.add(best.id);
    if (best.id > 0) selected.add(best.id - 1);
    if (best.id + 1 < sections.length) selected.add(best.id + 1);
  }
  if (!selected.size || selected.size > maxSections) return sections.map((s) => s.text).join("\n\n");
  return sections.filter((s) => selected.has(s.id)).map((s) => s.text).join("\n\n");
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