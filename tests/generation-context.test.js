import { describe, expect, test } from "bun:test";
import { splitSource, splitEvidenceSource, selectEvidence, generationBatchSize, hasMathContext, completeReviewIndexes, partitionReviews, pool, QUIZ_CONCURRENCY } from "../src/lib/generation-context.ts";

describe("efficient generation without losing evidence", () => {
  test("9,900-character notes reach prompts verbatim, without duplicated overlap", () => {
    const source = "Momentum remains constant.\n".repeat(400).slice(0, 9900);
    const sections = splitEvidenceSource(source);
    expect(sections.length).toBe(1);
    expect(selectEvidence(sections, ["Momentum"])).toBe(source);
  });
  test("large full-source fallback strips overlap without losing the source tail", () => {
    const source = "Birds fly over the river.\n".repeat(3000) + "Unique tail objective";
    expect(selectEvidence(splitEvidenceSource(source), ["Quantum entanglement"])).toBe(source);
  });
  test("targeted neighbouring sections join without overlap or lost characters", () => {
    const source = "x".repeat(50000) + "Momentum conservation" + "y".repeat(50000);
    const sections = splitEvidenceSource(source);
    const found = sections.findIndex((s) => s.text.includes("Momentum conservation"));
    const neighbours = sections.slice(found - 1, found + 2);
    expect(selectEvidence(sections, ["Momentum conservation"])).toBe(source.slice(neighbours[0].start, neighbours.at(-1).end));
  });
  test("missing verdicts retain valid reviews and request only omitted indexes", () => {
    const verdict = { index: 0, pass: true, issues: [] };
    const first = partitionReviews([verdict], [0, 1]);
    expect(first.reviews).toEqual([verdict]);
    expect(first.missing).toEqual([1]);
    const next = partitionReviews([{ index: 1, pass: false, issues: ["Wrong result"] }], first.missing);
    expect(next.missing).toEqual([]);
    expect(next.reviews[0].pass).toBe(false);
  });
  test("duplicate and unexpected verdicts never count as verified questions", () => {
    const result = partitionReviews([0, 0, 2, 9].map((index) => ({ index, pass: true, issues: [] })), [0, 1, 2]);
    expect(result.reviews.map((r) => r.index)).toEqual([2]);
    expect(result.missing).toEqual([0, 1]);
  });
  test("analysis chunks include the complete source, including its tail", () => {
    const text = "A".repeat(60000) + "Tail objective: momentum conservation";
    const chunks = splitSource(text);
    expect(chunks.at(-1).text.endsWith("Tail objective: momentum conservation")).toBe(true);
    expect(chunks[0].text.length).toBe(24000);
    expect(chunks[1].text.length).toBe(24000);
    expect(chunks.map((s, i) => i ? s.text.slice(800) : s.text).join("")).toBe(text);
  });
  test("targeted repair retrieves verbatim evidence beyond former 20000 character cap", () => {
    const sections = Array.from({ length: 30 }, (_, id) => ({ id, text: id === 25 ? "Momentum conservation: total momentum remains constant." : `Unrelated historical passage ${id}.` }));
    const evidence = selectEvidence(sections, ["Momentum conservation"]);
    expect(evidence).toContain("Momentum conservation: total momentum remains constant.");
    expect(evidence).not.toContain("Unrelated historical passage 0.");
  });
  test("uncertain targeting falls back to every source section", () => {
    const sections = Array.from({ length: 15 }, (_, id) => ({ id, text: `Section ${id} birds fly` }));
    expect(selectEvidence(sections, ["Quantum entanglement"])).toContain("Section 14 birds fly");
  });
  for (const [count, expected] of [[25, [5, 5, 5, 5, 5]], [50, [10, 10, 10, 10, 10]], [100, Array(10).fill(10)], [17, [5, 5, 5, 2]], [47, [10, 10, 10, 10, 7]], [3, [3]]]) {
    test(`${count} questions use preferred batches and an exact remainder`, () => {
      const size = generationBatchSize(count);
      const sizes = Array.from({ length: Math.ceil(count / size) }, (_, i) => Math.min(size, count - i * size));
      expect(sizes).toEqual(expected);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(count);
    });
  }
  test("generation, review and repair share a five-request rolling limit", async () => {
    expect(QUIZ_CONCURRENCY).toBe(5);
    const started = [];
    const release = new Map();
    let active = 0;
    let peak = 0;
    const done = pool(Array.from({ length: 10 }, (_, i) => i), QUIZ_CONCURRENCY, async (i) => {
      started.push(i);
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => release.set(i, resolve));
      active--;
      return i;
    });
    expect(started).toEqual([0, 1, 2, 3, 4]);
    release.get(1)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    for (const i of [0, 2, 3, 4, 5]) release.get(i)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const i of [6, 7, 8, 9]) release.get(i)();
    expect(await done).toEqual(Array.from({ length: 10 }, (_, i) => i));
    expect(peak).toBe(5);
  });
  test("math rules remain active for formulas and mathematical subjects", () => {
    expect(hasMathContext("speed = distance / time")).toBe(true);
    expect(hasMathContext("Forces and motion", "Subject(s): Physics")).toBe(true);
    expect(hasMathContext("The treaty ended the war.", "Subject(s): History")).toBe(false);
  });
  test("missing, duplicate, or invalid review indexes cannot count as a complete review", () => {
    expect(completeReviewIndexes([0, 1], [0, 1])).toBe(true);
    expect(completeReviewIndexes([0], [0, 1])).toBe(false);
    expect(completeReviewIndexes([0, 0], [0, 1])).toBe(false);
    expect(completeReviewIndexes([0, 2], [0, 1])).toBe(false);
  });
});