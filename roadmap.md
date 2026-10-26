# Roadmap

## Current request
- [ ] Refresh vulnerable transitive dependencies without forced versions, update zod, verify lockfile versions and app build, and rerun the dependency scan.
- [x] Limit quiz regeneration to two rounds after initial writing, cap AI Text Helper output at 4,096 tokens and internal summaries at 256 tokens; reviewed changes, 19 focused checks pass and app build is clean.

## Done
- [x] Smarter uploads: faithful document prompt with every-PDF-page instruction, DOCX semantic text/tables/image markers, labelled spreadsheet sheets, unreadable rejection and unclear warning, editable extracted file text, shared textbook prompts and Guide update; 35 tests and real browser DOCX/XLSX parsing pass
- [x] Disable highlighting outside editable fields; adaptive five/ten-question generation with exact remainders and five rolling generation/review/repair requests; reuse source indexing across review and repair; 27 tests pass and sign-up selection verified
- [x] Generation fixes: remove known evidence overlap, keep small sources verbatim, condense analysis wording, review in groups of eight, preserve valid partial verdicts with one omitted-index follow-up; 21 regression tests pass
- [x] Full generation optimization: lossless source indexing, adaptive batches, concise prompts, code-first checks and targeted re-review; authenticated 10-question generation displayed and temporary account deleted
- [x] Compact Notes Space: unified editor, "+" menu (files, topics), source bubbles with confirm-remove, compact paste bubbles (≥300 chars) with side editor
- [x] Final polish: real Guide page (accordion, 10 sections, Start generating), account deletion now removes worksheets + quiz results, refreshed llms.txt and Generate/Export descriptions, added Malay language
- [x] Quiz variety add-on: question style mix in generation and review prompts
- [x] Credits line "Designed & developed by Loke Ken Win" at the bottom of Guide and Settings, plus the author's walkthrough video with cover image in a Guide video panel

## Open
- [x] Tested most generation features with the requesting user's temporary account; live results and limitations recorded in GENERATION_TEST_RESULTS.md; no application behavior changed
- [x] Smarter uploads live checks: Lily quiz, table/chart/blank image extraction, DOCX/XLSX, same-upload worksheet/Study Notes and all ten PDF pages verified; standalone chart/XLSX quizzes remain untested
- [x] Verified 9,900-character advanced quiz end-to-end: first attempt timed out; confirmed-settings retry saved and reopened 23/25 questions in 252 seconds with warnings
- [ ] Fix reproduced generation issues — awaiting user approval to change behavior: customisation resets on navigation, excessive analysis/refinement output, incomplete review and non-self-contained/repetitive questions, inconsistent worksheet instructions (see GENERATION_TEST_RESULTS.md)
- [ ] Web links + Research Mode: removed per user request; would need a search connector (e.g. Perplexity) if ever re-added
- [ ] Worksheet file uploads, share links, dashboard worksheet stats, flashcards, Anki/Quizlet export, PDF math rendering — proposed improvements awaiting user pick
- [ ] One security finding left open (user scoped the fix to a single finding)
