/* Auto list formatting for textareas: "1. " continues numbering, "- " continues bullets. */

type Handled = { value: string; caret: number } | null;

export function continueList(value: string, caret: number): Handled {
  const before = value.slice(0, caret);
  const after = value.slice(caret);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.slice(lineStart);

  const numbered = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (numbered) {
    const [, indent, n, content] = numbered;
    if (!content.trim()) {
      /* Empty item — end the list */
      const next = value.slice(0, lineStart) + after;
      return { value: next, caret: lineStart };
    }
    const insert = `\n${indent}${Number(n) + 1}. `;
    return { value: before + insert + after, caret: caret + insert.length };
  }

  const bulleted = line.match(/^(\s*)([-*•])\s+(.*)$/);
  if (bulleted) {
    const [, indent, mark, content] = bulleted;
    if (!content.trim()) {
      const next = value.slice(0, lineStart) + after;
      return { value: next, caret: lineStart };
    }
    const insert = `\n${indent}${mark} `;
    return { value: before + insert + after, caret: caret + insert.length };
  }

  return null;
}

/** Attach to a textarea's onKeyDown to get automatic list continuation. */
export function listKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  onChange: (value: string) => void,
) {
  const el = e.currentTarget;
  if (el.selectionStart !== el.selectionEnd) return;
  if (e.key === " " && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const line = el.value.slice(start, el.selectionStart);
    const match = line.match(/^(\d+\.|-)$/);
    if (match) {
      e.preventDefault();
      const replacement = `    ${match[1] === "-" ? "•" : match[1]} `;
      const value = el.value.slice(0, start) + replacement + el.value.slice(el.selectionStart);
      onChange(value);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + replacement.length; });
    }
    return;
  }
  if (e.key !== "Enter" || e.shiftKey) return;
  const result = continueList(el.value, el.selectionStart);
  if (!result) return;
  e.preventDefault();
  onChange(result.value);
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = result.caret;
  });
}
