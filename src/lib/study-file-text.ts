export const UNREADABLE_STUDY_FILE = "We couldn't read any study content from this file. Try a clearer photo or a different file.";
export const UNCLEAR_STUDY_FILE = "Parts of this file were hard to read. Check the text before generating.";

export function validateStudyExtraction(text: string, onWarning?: (message: string) => void): string {
  const trimmed = text.trim();
  if (trimmed.length < 20 || /^\[NO READABLE CONTENT\]$/i.test(trimmed)) throw new Error(UNREADABLE_STUDY_FILE);
  if ((text.match(/\[unclear\]/gi) ?? []).length >= 5) onWarning?.(UNCLEAR_STUDY_FILE);
  return text;
}

/** Convert mammoth's semantic HTML without executing it or changing the stored text shape. */
export function htmlToStudyText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const inline = (node: Element): string => Array.from(node.childNodes).map((child) => {
    if (child.nodeType === 3) return child.textContent ?? "";
    if (!(child instanceof Element)) return "";
    if (child.tagName === "IMG") return "\n[IMAGE]\n";
    if (child.tagName === "BR") return "\n";
    return inline(child);
  }).join("").trim();
  const cellText = (cell: Element) => inline(cell).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const walk = (node: Element): string => {
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inline(node)}`;
    if (tag === "TABLE") {
      const rows = Array.from(node.querySelectorAll("tr")).filter((row) => row.closest("table") === node)
        .map((row) => Array.from(row.children).filter((c) => c.tagName === "TD" || c.tagName === "TH").map(cellText));
      const width = Math.max(0, ...rows.map((row) => row.length));
      if (!width) return "[TABLE]";
      const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ")} |`;
      const first = rows[0];
      if (!first) return "[TABLE]";
      return ["[TABLE]", line(first), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
    }
    if (tag === "UL" || tag === "OL") {
      let number = Number(node.getAttribute("start") ?? 1);
      return Array.from(node.children).filter((c) => c.tagName === "LI").map((item) => {
        if (item.hasAttribute("value")) number = Number(item.getAttribute("value"));
        const marker = tag === "OL" ? `${number++}.` : "-";
        const nested = Array.from(item.children).filter((c) => c.tagName === "UL" || c.tagName === "OL");
        const copy = item.cloneNode(true) as Element;
        Array.from(copy.children).filter((c) => c.tagName === "UL" || c.tagName === "OL").forEach((c) => c.remove());
        return [`${marker} ${inline(copy)}`, ...nested.map((c) => walk(c).split("\n").map((line) => `  ${line}`).join("\n"))].join("\n");
      }).join("\n");
    }
    if (tag === "P") return inline(node);
    if (tag === "IMG") return "[IMAGE]";
    return Array.from(node.children).map(walk).filter(Boolean).join("\n\n");
  };
  return walk(doc.body).trim();
}

export function labelledSheetText(name: string, csv: string): string {
  return `[TABLE] ${name}\n${csv}`;
}