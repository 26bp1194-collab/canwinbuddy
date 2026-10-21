import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, NotebookPen, Copy, Download, Printer, RotateCcw, AlertTriangle, Shuffle } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRICULA, getQuizDefaults } from "@/lib/prefs";
import { useT } from "@/lib/i18n";
import { generateStudyNotes, type StudyNotes } from "@/lib/notes.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceText: string;
  title: string;
  subject?: string;
  age?: number;
};

type Length = "short" | "standard" | "detailed";
type Focus = "everything" | "forgotten" | "exam";

/** Section order for display, copy, print and PDF. */
function sections(n: StudyNotes, t: (s: string) => string): { key: string; title: string; accent?: boolean; lines: string[] }[] {
  return [
    { key: "summary", title: t("Summary"), lines: n.summary },
    { key: "dontForget", title: t("Don't forget"), accent: true, lines: n.dontForget.map((d) => (d.why ? `${d.point} — ${d.why}` : d.point)) },
    { key: "commonMixUps", title: t("Common mix-ups"), accent: true, lines: n.commonMixUps.map((m) => `${m.itemA} vs ${m.itemB}: ${m.difference}`) },
    { key: "keyTerms", title: t("Key terms"), lines: n.keyTerms.map((k) => `${k.term}: ${k.meaning}`) },
    { key: "keyFacts", title: t("Key facts"), lines: n.keyFacts },
    { key: "formulas", title: t("Formulas"), lines: n.formulas.map((f) => `${f.name}: ${f.formula}${f.whenToUse ? ` (${f.whenToUse})` : ""}`) },
    { key: "memoryTricks", title: t("Memory tricks"), lines: n.memoryTricks.map((m) => (m.forPoint ? `${m.trick} — ${m.forPoint}` : m.trick)) },
    { key: "selfCheck", title: t("Self-check"), lines: n.selfCheck },
  ].filter((s) => s.lines.length);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function StudyNotesDialog({ open, onOpenChange, sourceText, title, subject, age }: Props) {
  const t = useT();
  const gen = useServerFn(generateStudyNotes);
  const [length, setLength] = useState<Length>("standard");
  const [focus, setFocus] = useState<Focus>("everything");
  const [curriculum, setCurriculum] = useState("none");
  const [customCurriculum, setCustomCurriculum] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [notes, setNotes] = useState<StudyNotes | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = getQuizDefaults();
    setCurriculum(d.curriculum);
    setCustomCurriculum(d.customCurriculum);
    setSourceError("");
    setError("");
  }, [open]);

  const heading = title.trim() || (subject ? `${subject} ${t("study notes")}` : t("Study notes"));

  async function create() {
    if (!sourceText.trim()) {
      setSourceError(t("Add topics or source text in the Notes Space."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const cur = curriculum === "other" ? customCurriculum.trim() : curriculum === "none" ? "" : curriculum;
      const { notes } = await gen({
        data: { sourceText, title, subject: subject ?? "", age, curriculum: cur, length, focus, language: getQuizDefaults().language || "English" },
      });
      setNotes(notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not create study notes"));
    } finally {
      setBusy(false);
    }
  }

  const plain = () =>
    notes
      ? [heading, "", ...sections(notes, t).flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `• ${l}`), ""])].join("\n").trim()
      : "";

  const copy = async () => {
    await navigator.clipboard.writeText(plain());
    toast.success(t("Copied study notes"));
  };

  const print = () => {
    if (!notes) return;
    const w = window.open("", "_blank");
    if (!w) return toast.error(t("Allow pop-ups to print"));
    const body = sections(notes, t)
      .map((s) => `<h2${s.accent ? ' class="a"' : ""}>${esc(s.title)}</h2><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`)
      .join("");
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(heading)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#111;line-height:1.45}h1{font-size:22px}h2{font-size:15px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em}h2.a{border-left:4px solid #d97706;padding-left:8px}li{margin:3px 0}</style></head><body><h1>${esc(heading)}</h1>${body}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const pdf = async () => {
    if (!notes) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 48;
      let y = M;
      const text = (s: string, size = 11, style: "normal" | "bold" = "normal", x = M) => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        for (const l of doc.splitTextToSize(s, W - M - x) as string[]) {
          if (y + size * 1.4 > H - M) { doc.addPage(); y = M; }
          doc.text(l, x, y);
          y += size * 1.4;
        }
      };
      text(heading, 16, "bold");
      for (const s of sections(notes, t)) {
        y += 10;
        text(s.title, 13, "bold");
        s.lines.forEach((l) => text(`• ${l}`, 10.5, "normal", M + 8));
      }
      const safe = heading.replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "study-notes";
      doc.save(`${safe}.pdf`);
    } catch {
      toast.error(t("Could not create the PDF"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className={notes ? "max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto p-4 sm:p-6" : "max-h-[90vh] overflow-y-auto sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><NotebookPen className="h-5 w-5" /> {notes ? heading : t("Study Notes")}</DialogTitle>
          <DialogDescription>{t("Study notes are not saved. Copy or download them to keep them.")}</DialogDescription>
        </DialogHeader>

        {busy ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Reading your notes and picking the points people often forget…")}
          </p>
        ) : notes ? (
          <div className="space-y-3">
            {sections(notes, t).map((s) => (
              <section key={s.key} className={s.accent ? "rounded-xl border border-warning/50 bg-warning/10 p-4" : "rounded-xl border border-border bg-secondary/40 p-4"}>
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                  {s.key === "dontForget" && <AlertTriangle className="h-4 w-4 text-warning" />}
                  {s.key === "commonMixUps" && <Shuffle className="h-4 w-4 text-warning" />}
                  {s.title}
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
                  {s.lines.map((l, i) => <li key={i} className="break-words">• {l}</li>)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-2 block">{t("Length")}</Label>
                <Select value={length} onValueChange={(v) => setLength(v as Length)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">{t("Short")}</SelectItem>
                    <SelectItem value="standard">{t("Standard")}</SelectItem>
                    <SelectItem value="detailed">{t("Detailed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">{t("Focus")}</Label>
                <Select value={focus} onValueChange={(v) => setFocus(v as Focus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everything">{t("Everything")}</SelectItem>
                    <SelectItem value="forgotten">{t("Easily-forgotten points only")}</SelectItem>
                    <SelectItem value="exam">{t("Exam focus")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">{t("Curriculum")}</Label>
              <Select value={curriculum} onValueChange={setCurriculum}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("None")}</SelectItem>
                  {CURRICULA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="other">{t("Other")}</SelectItem>
                </SelectContent>
              </Select>
              {curriculum === "other" && <Input className="mt-2" value={customCurriculum} onChange={(e) => setCustomCurriculum(e.target.value)} placeholder={t("Type curriculum")} />}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("Add title, notes, topics, or files in the Notes Space for generating quizzes.")}</p>
              {sourceError && <p className="mt-1 text-xs text-destructive">{sourceError}</p>}
            </div>
          </div>
        )}

        {error && !busy && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <DialogFooter className="flex-wrap gap-2">
          {notes && !busy ? (
            <>
              <Button variant="secondary" onClick={copy}><Copy className="mr-2 h-4 w-4" /> {t("Copy")}</Button>
              <Button variant="secondary" onClick={pdf}><Download className="mr-2 h-4 w-4" /> {t("Download PDF")}</Button>
              <Button variant="secondary" onClick={print}><Printer className="mr-2 h-4 w-4" /> {t("Print")}</Button>
              <Button onClick={create}><RotateCcw className="mr-2 h-4 w-4" /> {t("Regenerate")}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{t("Cancel")}</Button>
              <Button onClick={create} disabled={busy}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("Creating…")}</> : t("Create study notes")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
