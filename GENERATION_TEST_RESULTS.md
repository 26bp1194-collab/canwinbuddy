# Generation test results

Tested on 22 October 2026 using the requesting user's signed-in temporary account, through the running app. No application behavior was changed.

## Passed live checks

| Feature | Observed result |
| --- | --- |
| Simple quiz from Lily worked example | Source-shortage warning correctly reduced five requested questions to two; completed in 27.9 seconds. Correct remaining-apples answer was 9, distractors were plausible, and neither question included the example label or solution steps. |
| Image containing a table | Extracted a complete markdown table with all fruit quantities; about seven seconds. |
| Bar-chart image | Extracted a `[GRAPH]` description with both axes, scale, student labels and values 4, 6 and 8; about seven seconds. |
| Blank image | Friendly unreadable-content error appeared; Insert remained disabled and the image was not added. |
| DOCX table | Extracted heading, paragraph, `[TABLE]` and complete markdown table; about one second. |
| XLSX with two sheets | Both sheets appeared as separately named `[TABLE]` blocks with all CSV values; about one second. |
| Ten-page PDF | Extracted in about 15 seconds; all ten distinct sample names and all ten end-of-lesson markers were present. This was a controlled, clear scan-style PDF, not a guarantee for every PDF. |
| Uploaded-source draft | All inserted files remained after Dashboard → Generate navigation. |
| Study Notes from table image | Correct quantities, totals, formulas, comparisons and self-check questions appeared; Copy and PDF download worked. |
| Worksheet from same table image | Required-curriculum validation worked; generated in about 24 seconds, with multiple-choice questions, written-answer spaces, marks and answer key. Saved worksheet reopened after reload. |
| Table-image quiz | Saved questions included the values needed to answer without seeing the table. It saved four of five requested questions with warnings; see concerns below. |
| Advanced quiz from 9,900 characters | Confirmed 25-question/Advanced/IGCSE settings; retry completed in about 4 minutes 12 seconds and saved 23 questions, with shortfall and incomplete-review warnings. All 23 rows reopened from the saved quiz. |
| Clear draft after successful quiz | Source text and title were empty when returning to Generate. |
| AI question editing | Edited the Lily question into a concise question; updated question and correct answer survived reload. |
| Flashcards | Generated quiz opened as flashcards and flipped to the correct answer 9. |
| Quiz play/resume | Correct answer could be selected; Reset quiz appeared. Reloading and reopening Play retained the answered question and answer order. |
| Existing automated checks | `bun test tests`: 35 passed, zero failed. Vitest is not compatible with these existing `bun:test` files. |

## Reproduced concerns, not fixed

1. **Customisation resets after navigation.** With committed settings of 17 questions, Advanced and AP, Dashboard → Generate returned to 10 questions, Simple and None. Instructions and sources survived. Repeated in the earlier large-source setup. Draft restoration and settings/default effects need investigation before changing code.
2. **Large-source analysis can time out.** The first 9,900-character attempt returned to the input screen; app logs reported an AI timeout. A corresponding gateway request took about 134 seconds and produced 27,707 output tokens. Individual app AI calls have a 75-second timeout, so a successful provider call can still arrive too late for the app.
3. **Quizzes still underfill and reviews sometimes remain incomplete.** Table quiz saved 4/5 in about 166 seconds; advanced large-source retry saved 23/25 in about 252 seconds. Both displayed shortfall and incomplete-quality-check warnings. The source was deliberately repetitive, so a shortfall alone does not establish a bug.
4. **Some large-source questions are not self-contained.** For example, asking the recorded heating duration from only a sample's mass and volume requires the original notes. Several temperature questions inferred heating causality that the notes did not establish. Density questions were also repetitive despite varied sample numbers. These are substantive quality issues even though the set was saved.
5. **The saved quiz labels questions “verified” after incomplete-review warnings.** The export page displayed “23 verified questions” although generation warned that some quality checks were incomplete.
6. **Worksheet curriculum/age consistency needs improvement.** For age 10 and IGCSE, the generated paper labelled itself Cambridge Primary/Lower Secondary Stage 6. It also said “Calculators allowed” in its heading and “Do not use a calculator” in its instructions. Arithmetic questions and answer-key checks inspected were otherwise consistent with the table.
7. **Refine & Check output was excessively expansive.** Refining three short sentences about water produced 3,694 words. Generation and Use Text worked, but the expansion adds unnecessary material and token use; its factual claims were not independently verified.

## Not verified in this session

- A live 100-question quiz; exact adaptive batch sizes/concurrency were covered by existing automated tests, not a 100-question live run.
- Standalone chart-to-quiz and XLSX-to-quiz generation; extraction itself passed.
- Source Finder mode, every planning preference, topics-only generation, compact-paste editing and all curriculum/language combinations.
- Poor-quality photographs with five `[unclear]` markers; warning threshold passed automated tests.
- DOCX embedded-image OCR (previously skipped), XLS legacy files, 20 MB boundary uploads and very long or poor-quality PDFs.
- Worksheet PDF/download, fill-in and print; Study Notes print/regenerate; complete quiz finish/results flow and sharing.
- Published-site behavior; these were authenticated checks against the running preview app.

## Test data

Three test quizzes and one worksheet were saved to the temporary account under titles starting with `TEST`. They were retained for inspection. The account was not deleted or changed. Browser fixtures, screenshots and logs remain in temporary test storage, not app assets.

## Next priority

Fix customisation persistence, bound excessive analysis/refinement output, and make incomplete review/self-contained checks reliable before expanding feature scope. Re-run these exact scenarios after any fixes.