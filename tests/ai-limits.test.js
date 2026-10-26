import { expect, test } from "bun:test";
import { MAX_REGENERATION_ROUNDS, MAX_GENERATION_ROUNDS, TEXT_HELPER_MAX_TOKENS, TEXT_HELPER_SUMMARY_MAX_TOKENS } from "../src/lib/ai-limits.ts";

test("quiz writing allows an initial pass and only two regeneration passes", () => {
  expect(MAX_REGENERATION_ROUNDS).toBe(2);
  expect(MAX_GENERATION_ROUNDS).toBe(3);
});

test("AI Text Helper has finite output ceilings for writing and summaries", () => {
  expect(TEXT_HELPER_MAX_TOKENS).toBe(4096);
  expect(TEXT_HELPER_SUMMARY_MAX_TOKENS).toBe(256);
});