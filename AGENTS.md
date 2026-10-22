<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
 
- Keep source text and serializable verified-source attachments in the Generate page per-tab draft, and pass their complete combined text to both quiz and worksheet generation; this preserves sources across navigation without keeping raw File objects.
- Quiz generation uses lossless chunked source analysis and evidence-targeted prompts with full-source fallback; deterministic checks precede semantic review, and only changed questions are re-reviewed while retaining a whole-set overview to preserve quality without repeated token spend.
- Evidence windows store source offsets to remove only known overlap; notes within one analysis window stay verbatim, and partial semantic reviews retain valid verdicts with one missing-index-only follow-up so omissions never become passes.
- Generation, review and repair use a shared bounded rolling pool; generation commits each completed batch before refilling its slot, preserving cross-batch deduplication while avoiding slowest-wave waits. Source sections are indexed once per review/repair invocation to avoid repeated source splitting.
