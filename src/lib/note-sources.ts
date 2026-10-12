export type NoteSource = {
  id: string;
  kind: "file" | "topics" | "paste";
  name: string;
  text: string;
  topics?: string[];
};

export const COMPACT_PASTE_THRESHOLD = 300;
export const shouldCompactPaste = (text: string) => text.length >= COMPACT_PASTE_THRESHOLD;

export function parseTopics(text: string): string[] {
  return text.split(/,|\n/).map((s) => s.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s*)/, "").trim()).filter(Boolean);
}

export function topicsPreview(topics: string[]): string {
  return topics.slice(0, 3).join(", ") + (topics.length > 3 ? "..." : "");
}

export function combineNoteSources(source: string, sources: NoteSource[]): string {
  return [source.trim(), ...sources.map((s) => `${s.kind === "topics" ? "Topics to follow" : s.name}:\n${s.text}`)].filter(Boolean).join("\n\n");
}

const QUICK_SOURCE_KEY = "cwb:quick-delete-source";
export function getQuickSourceDelete(): boolean {
  try { return typeof window !== "undefined" && window.localStorage.getItem(QUICK_SOURCE_KEY) === "on"; }
  catch { return false; }
}
export function setQuickSourceDelete(value: boolean) {
  window.localStorage.setItem(QUICK_SOURCE_KEY, value ? "on" : "off");
}