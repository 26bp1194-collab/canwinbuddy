# Sidebar and Generation Context Update

## Changes
- In the collapsed desktop sidebar, show the Expand control where the app logo currently sits and remove the separate bottom Expand control.
- Place Subject and For side by side on wider screens, while stacking them on narrow phones.
- Replace the Single/Multiple controls with one For dropdown containing age choices, Range, and All.
- When Range is selected, show two age-only dropdowns separated by “until”; normalize the saved/displayed range from lower to higher and treat matching ages as one age.
- Keep every added Subject or For row inside its existing section, one row below the previous entry, with add/remove controls.
- Preserve compatibility with existing saved generation drafts and guidance sent to quiz generation.

## Technical details
- Update the sidebar header/footer conditional rendering in `src/components/app-shell.tsx` without changing navigation behavior.
- Extend the audience data model and formatter in `src/lib/quiz-context.ts` to support All and normalized ranges.
- Update the generation form and default-state checks in `src/routes/_authenticated/generate.tsx`.
- Verify the generation page at desktop and narrow mobile sizes and confirm no client errors.
