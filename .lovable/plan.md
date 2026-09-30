# Create Worksheet

## What you'll get
- A **Create Worksheet** button above the Title field on the Generate page.
- Pressing it opens a worksheet window with:
  - **Subject** (required, includes Others + your own text)
  - **Age** (required, 6–18 with Standard/Form labels)
  - **Curriculum** (required: SPM, IGCSE, A-Levels, Gaokao, AP, SAT, CBSE, ICSE, or Other with your own text)
  - **Topics to follow** (box with auto list formatting)
  - Uses the Source text already typed on the Generate page (and any uploaded files).
- Pressing **Generate worksheet** with a missing subject, age or curriculum, or with neither source text nor topics, shows a clear error beside the missing field(s) and stops.
- The AI builds the worksheet in the real exam style for that curriculum and age. For example: SPM/IGCSE get sections with A–D multiple choice, structured short answers with lines and mark allocations, and essays where the real paper has them; AP/SAT use A–D or A–E with free-response; CBSE/ICSE use MCQ, very-short/short/long answer sections; younger ages get simpler formats (fill in the blanks, matching, true/false). Each question shows its marks, and the header shows the total.
- **Worksheet page** (opens when it's done):
  - A print-ready worksheet with name/class/date lines, sections, instructions, blank answer lines sized to the expected answer, and essay spaces.
  - A **Fill in** toggle so students can pick answers and type into the lines on screen.
  - A separate **Answer key** tab with correct answers, model answers and the marking scheme.
  - **Download PDF** (worksheet only, or worksheet + answer key) and **Print** buttons.
- **History**: worksheets appear alongside quizzes but look clearly different: a distinct colour, a "Worksheet" badge and worksheet icon, plus a Worksheets filter. Star, rename, delete and sorting work as for quizzes.

## Technical details
- New table `worksheets` (user_id, title, subject, age, curriculum, topics, source_text, content jsonb, answer_key jsonb, is_favorite, timestamps) with GRANTs, RLS own-rows only, and the updated_at trigger.
- New server function `generateWorksheet` in `src/lib/worksheet.functions.ts` (auth required, Lovable AI, structured tool-call output). Schema: sections[] with title, instructions, and items typed `mcq` (choices A–D or A–E), `short` (lines count), `structured` (sub-parts), `fill_blank`, `true_false`, `matching`, `essay` (lines count), each with marks. System prompt holds per-curriculum format guides (section layout, option count, mark ranges) and age-level adjustments, grounded in source text/topics, reusing the exact-term consistency rule. Zod-validated input with the same required-field rules as the form.
- `src/components/worksheet-dialog.tsx` for the form + validation; button placed above Title in `generate.tsx`, seeded with that page's subject/For/curriculum when set.
- New route `src/routes/_authenticated/worksheet.$id.tsx` with head() metadata, print CSS (`@media print`) and PDF export via jsPDF (already-safe client-only dynamic import).
- `history.tsx`: fetch worksheets too, merge into the list with a type marker, and add a worksheet card style using design tokens plus a type filter.
- Verify with typecheck and a browser check of validation errors, the worksheet page, answer key tab, and the History badge.
