/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { shouldCompactPaste, parseTopics, topicsPreview, combineNoteSources } from "./note-sources";

describe("compact notes rules", () => {
  test("300-character pastes are compact while 299 stay text", () => {
    expect(shouldCompactPaste("a".repeat(299))).toBe(false);
    expect(shouldCompactPaste("a".repeat(300))).toBe(true);
  });
  test("commas, numbering and bullets separate topics", () => {
    expect(parseTopics("Motion, Force\n1. Energy\n• Work\n- Power")).toEqual(["Motion", "Force", "Energy", "Work", "Power"]);
  });
  test("only lists longer than three receive an ellipsis", () => {
    expect(topicsPreview(["A", "B", "C"])).toBe("A, B, C");
    expect(topicsPreview(["A", "B", "C", "D"])).toBe("A, B, C...");
  });
  test("generation receives complete attachments, not previews", () => {
    expect(combineNoteSources("Notes", [{ id: "1", kind: "file", name: "physics.txt", text: "Full extracted content" }])).toBe("Notes\n\nphysics.txt:\nFull extracted content");
  });
});