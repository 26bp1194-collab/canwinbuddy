import { describe, expect, test } from "bun:test";
import { validateStudyExtraction, UNREADABLE_STUDY_FILE, UNCLEAR_STUDY_FILE, labelledSheetText } from "../src/lib/study-file-text.ts";

describe("study upload rules", () => {
  for (const text of ["", "   ", "[NO READABLE CONTENT]", "1234567890123456789"]) {
    test(`reject unreadable extraction ${JSON.stringify(text)}`, () => {
      expect(() => validateStudyExtraction(text)).toThrow(UNREADABLE_STUDY_FILE);
    });
  }
  test("twenty characters are readable and are preserved verbatim", () => {
    expect(validateStudyExtraction("12345678901234567890")).toBe("12345678901234567890");
  });
  test("five unclear marks warn but do not discard extracted text", () => {
    const warnings = [];
    const text = "[unclear] ".repeat(5);
    expect(validateStudyExtraction(text, (warning) => warnings.push(warning))).toBe(text);
    expect(warnings).toEqual([UNCLEAR_STUDY_FILE]);
  });
  test("four unclear marks do not warn", () => {
    const warnings = [];
    validateStudyExtraction("[unclear] ".repeat(4), (warning) => warnings.push(warning));
    expect(warnings).toEqual([]);
  });
  test("each spreadsheet sheet retains its name and all CSV values", () => {
    const csv = "Month,Apples\nJanuary,10\nFebruary,20\n";
    expect(labelledSheetText("Harvest", csv)).toBe(`[TABLE] Harvest\n${csv}`);
  });
});