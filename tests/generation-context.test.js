import { describe, expect, test } from "bun:test";
import { splitSource, selectEvidence, generationBatchSize, hasMathContext, completeReviewIndexes } from "../src/lib/generation-context.ts";

describe("efficient generation without losing evidence", () => {
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
  test("100-question requests use bounded batches; detailed advanced answers use smaller batches", () => {
    expect(generationBatchSize(100)).toBe(10);
    expect(generationBatchSize(100, true, true)).toBe(5);
    expect(generationBatchSize(3)).toBe(3);
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