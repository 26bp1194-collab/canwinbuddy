/** Initial quiz writing is separate from automatic replacement attempts. */
export const MAX_REGENERATION_ROUNDS = 2;
export const MAX_GENERATION_ROUNDS = 1 + MAX_REGENERATION_ROUNDS;

/** API-enforced output ceilings, including all helper modes and follow-up edits. */
export const TEXT_HELPER_MAX_TOKENS = 4096;
export const TEXT_HELPER_SUMMARY_MAX_TOKENS = 256;