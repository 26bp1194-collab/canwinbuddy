import { describe, expect, test } from "bun:test";
import { getCorrectIndexes, isRightPick, reorderChoices } from "../src/lib/question-utils.ts";
import { toRows, multiExcludedNotice } from "../src/lib/export.ts";

const old = { question: "Old?", choices: ["a", "b", "c", "d"], correctIndex: 2, sourceQuote: "x" };
const multi = { question: "Pick? Select TWO answers.", choices: ["a", "b", "c", "d"], correctIndex: 0, correctIndexes: [0, 2], sourceQuote: "x" };
const tf = { question: "True or false: sky is blue", choices: ["True", "False"], correctIndex: 0, sourceQuote: "x" };

describe("answer rules", () => {
  test("old single-answer questions keep correctIndex", () => {
    expect(getCorrectIndexes(old)).toEqual([2]);
  });
  test("multi-answer is right only with exactly both correct picks", () => {
    expect(isRightPick(multi, [2, 0])).toBe(true);
    expect(isRightPick(multi, [0, 1])).toBe(false);
    expect(isRightPick(multi, [0])).toBe(false);
  });
  test("shuffling remaps both correct answers", () => {
    const r = reorderChoices(multi, [3, 2, 1, 0]);
    expect(getCorrectIndexes(r).sort()).toEqual([1, 3]);
    expect(r.correctIndex).toBe(getCorrectIndexes(r)[0]);
  });
});

describe("export rules", () => {
  test("Kahoot lists both answer numbers comma-separated", () => {
    expect(toRows("kahoot", [multi])[0][6]).toBe("1,3");
  });
  test("Blooket and Gimkit leave out multi-answer questions with a notice", () => {
    expect(toRows("blooket", [old, multi])).toHaveLength(1);
    expect(toRows("gimkit", [multi])).toHaveLength(0);
    expect(multiExcludedNotice("gimkit2", [multi])).toContain("1 multi-answer question(s)");
    expect(multiExcludedNotice("kahoot", [multi])).toBeNull();
  });
  test("two-option questions leave unused columns blank", () => {
    const row = toRows("kahoot", [tf])[0];
    expect(row[3]).toBe("");
    expect(row[4]).toBe("");
    expect(row[6]).toBe("1");
  });
});
