# Roadmap

## Done
- [x] Smarter uploads: faithful document prompt with every-PDF-page instruction, DOCX semantic text/tables/image markers, labelled spreadsheet sheets, unreadable rejection and unclear warning, editable extracted file text, shared textbook prompts and Guide update; 35 tests and real browser DOCX/XLSX parsing pass
- [x] Disable highlighting outside editable fields; adaptive five/ten-question generation with exact remainders and five rolling generation/review/repair requests; reuse source indexing across review and repair; 27 tests pass and sign-up selection verified
- [x] Generation fixes: remove known evidence overlap, keep small sources verbatim, condense analysis wording, review in groups of eight, preserve valid partial verdicts with one omitted-index follow-up; 21 regression tests pass
- [x] Full generation optimization: lossless source indexing, adaptive batches, concise prompts, code-first checks and targeted re-review; authenticated 10-question generation displayed and temporary account deleted
- [x] Compact Notes Space: unified editor, "+" menu (files, topics), source bubbles with confirm-remove, compact paste bubbles (≥300 chars) with side editor
- [x] Final polish: real Guide page (accordion, 10 sections, Start generating), account deletion now removes worksheets + quiz results, refreshed llms.txt and Generate/Export descriptions, added Malay language
- [x] Quiz variety add-on: question style mix in generation and review prompts

## Open
- [ ] Smarter uploads end-to-end AI checks (Lily quiz, table/diagram/blank-image uploads, same-upload worksheet/Study Notes, 10+ page PDF completeness/timeout) — blocked by no requesting-user session; full PDF extraction is requested in the prompt but not verified
- [ ] Verify a 9,900-character quiz end-to-end — blocked until the requesting user logs in; managed sign-in found no matching account
- [ ] Web links + Research Mode: removed per user request; would need a search connector (e.g. Perplexity) if ever re-added
- [ ] Worksheet file uploads, share links, dashboard worksheet stats, flashcards, Anki/Quizlet export, PDF math rendering — proposed improvements awaiting user pick
- [ ] One security finding left open (user scoped the fix to a single finding)
