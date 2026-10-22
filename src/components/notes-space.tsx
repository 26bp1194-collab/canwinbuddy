import { useRef, useState } from "react";
import { FileText, List, Loader2, Plus, Upload, X, Pencil, Check, Type, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { parseFile } from "@/lib/file-parse";
import { listKeyDown } from "@/lib/list-input";
import { getQuickSourceDelete, parseTopics, shouldCompactPaste, topicsPreview, type NoteSource } from "@/lib/note-sources";
import { useT } from "@/lib/i18n";

type VerifiedFile = { name: string; text: string; status: "checking" | "ready" | "error"; error?: string };
type Props = { source: string; onSourceChange: (v: string) => void; sources: NoteSource[]; onSourcesChange: (v: NoteSource[]) => void };

export function NotesSpace({ source, onSourceChange, sources, onSourcesChange }: Props) {
  const t = useT();
  const [dialog, setDialog] = useState<"files" | "topics" | null>(null);
  const [input, setInput] = useState("");
  const [verifiedFiles, setVerifiedFiles] = useState<VerifiedFile[]>([]);
  const [topicError, setTopicError] = useState("");
  const [selected, setSelected] = useState<NoteSource | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const requestVersion = useRef(0);

  function openDialog(next: typeof dialog) {
    requestVersion.current += 1;
    setDialog(next); setInput(""); setTopicError(""); setVerifiedFiles([]);
  }
  function add(items: Omit<NoteSource, "id">[]) {
    onSourcesChange([...sources, ...items.map((s) => ({ ...s, id: crypto.randomUUID() }))]);
  }
  function remove(id: string) {
    if (getQuickSourceDelete()) commitRemove(id);
    else setRemoveId(id);
  }
  function commitRemove(id: string) {
    onSourcesChange(sources.filter((s) => s.id !== id));
    if (selected?.id === id) setSelected(null);
    setRemoveId(null);
  }
  async function verifyFiles(files: File[]) {
    const version = requestVersion.current;
    const batch = files.map((f) => ({ name: f.name, text: "", status: "checking" as const }));
    const offset = verifiedFiles.length;
    setVerifiedFiles((prev) => [...prev, ...batch]);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let result: VerifiedFile;
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error("File exceeds 20 MB.");
        const text = await parseFile(file, (warning) => { if (version === requestVersion.current) toast.warning(t(warning)); });
        if (!text.trim()) throw new Error("No readable text was found in this file.");
        result = { name: file.name, text, status: "ready" };
      } catch (error) {
        result = { name: file.name, text: "", status: "error", error: error instanceof Error ? error.message : "Could not read this file." };
      }
      if (version !== requestVersion.current) return;
      setVerifiedFiles((prev) => prev.map((f, index) => index === offset + i ? result : f));
    }
  }
  function insertTopics() {
    const topics = parseTopics(input);
    if (!topics.length) { setTopicError("Add at least one topic."); return; }
    if (topics.length === 1 && !/[,\n]|^\s*(?:\d+[.)]\s+|[-*•]\s+)/.test(input)) {
      setTopicError("Use commas, a numbered list, or a bullet list to separate topics."); return;
    }
    add([{ kind: "topics", name: "Topics to follow", text: topics.join("\n"), topics }]);
    setDialog(null);
  }
  function finishEdit() {
    if (!selected) return;
    if (editing && !editText.trim()) { toast.error("Notes cannot be empty."); return; }
    if (editing) onSourcesChange(sources.map((s) => s.id === selected.id ? { ...s, text: editText } : s));
    setSelected(null); setEditing(false);
  }

  return <>
    <div className="overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      {sources.length > 0 && <div className="flex flex-wrap items-start gap-2 border-b border-border p-3" aria-label="Inserted sources">
        {sources.map((s) => <div key={s.id} className={s.kind === "paste" ? "relative h-28 w-28 shrink-0 rounded-lg border border-border bg-secondary" : s.kind === "file" ? "flex w-64 max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary pl-3" : "flex max-w-full items-center gap-1 rounded-lg border border-border bg-secondary pl-3"}>
          {s.kind === "paste" ? <Button variant="ghost" className="h-full w-full flex-col items-start justify-start gap-2 overflow-hidden p-3 text-left" aria-label={`Open ${s.name}`} onClick={() => { setSelected(s); setEditing(false); setEditText(s.text); }}>
            <FileText className="h-4 w-4 shrink-0 text-primary" /><span className="line-clamp-2 whitespace-normal break-words pr-2 text-xs">{s.text}</span><span className="text-xs text-muted-foreground">{s.text.length} characters</span>
          </Button> : <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            {s.kind === "topics" ? <List className="h-4 w-4 shrink-0 text-primary" /> : <FileText className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate" title={s.kind === "topics" ? s.text : s.name}>{s.kind === "topics" ? topicsPreview(s.topics ?? parseTopics(s.text)) : s.name}</span>
          </span>}
          <Button type="button" variant="ghost" size="icon" className={s.kind === "paste" ? "absolute right-0 top-0 h-7 w-7" : "h-8 w-8 shrink-0"} title="Remove source" aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)}><X className="h-3.5 w-3.5" /></Button>
          {s.kind === "file" && <details className="min-w-0 basis-full p-2">
            <summary className="cursor-pointer text-xs text-primary">{t("View text")}</summary>
            <Textarea aria-label={`${t("Edit extracted text")}: ${s.name}`} className="mt-2 min-h-40 w-full resize-y" value={s.text} onChange={(e) => onSourcesChange(sources.map((item) => item.id === s.id ? { ...item, text: e.target.value } : item))} />
          </details>}
        </div>)}
      </div>}
      <Textarea ref={textarea} id="src" value={source} onChange={(e) => onSourceChange(e.target.value)} onKeyDown={(e) => listKeyDown(e, onSourceChange)}
        onPaste={(e) => { const text = e.clipboardData.getData("text/plain"); if (shouldCompactPaste(text)) { e.preventDefault(); add([{ kind: "paste", name: "Pasted notes", text }]); } }}
        placeholder="Paste your notes, article, or study material here…" className="min-h-[160px] resize-y rounded-none border-0 shadow-none focus-visible:ring-0 sm:min-h-[200px]" />
      <div className="flex items-center p-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Add source" title="Add source"><Plus className="h-5 w-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => openDialog("files")}><Upload />Add files</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog("topics")}><List />Add topics to follow</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) openDialog(null); }}>
      <DialogContent className={dialog === "topics" ? "max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-sm" : "max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl"}>
        <DialogHeader><DialogTitle>{dialog === "files" ? "Add files" : "Add topics to follow"}</DialogTitle><DialogDescription>{dialog === "files" ? "Files are checked for readable content before insertion." : "Separate topics with commas, numbered lists, or bullet lists."}</DialogDescription></DialogHeader>
        {dialog === "files" ? <>
          <Button variant="outline" className="h-40 w-full flex-col gap-2 whitespace-normal border-dashed" onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void verifyFiles(Array.from(e.dataTransfer.files)); }} disabled={verifiedFiles.some((f) => f.status === "checking")}>
            <Upload className="h-6 w-6 text-muted-foreground" /><span>Drop files or click to upload</span><span className="text-xs text-muted-foreground">PDF, DOCX, XLSX, CSV, TXT, PNG, JPG · 20 MB per file</span>
          </Button>
          <input ref={fileInput} type="file" className="hidden" multiple accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,image/*" onChange={(e) => { void verifyFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <div className="space-y-2">{verifiedFiles.map((f, i) => <div key={i} className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm">
            {f.status === "checking" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : f.status === "ready" ? <Check className="h-4 w-4 shrink-0 text-success" /> : <X className="h-4 w-4 shrink-0 text-destructive" />}
            <div className="min-w-0 flex-1"><p className="truncate">{f.name}</p><p className={f.status === "error" ? "break-words text-xs text-destructive" : "text-xs text-muted-foreground"}>{f.status === "checking" ? "Checking access…" : f.status === "ready" ? "Verified · readable" : t(f.error ?? "Could not read this file.")}</p>
              {f.status === "ready" && <details className="mt-2"><summary className="cursor-pointer text-xs text-primary">{t("View text")}</summary><Textarea aria-label={`${t("Edit extracted text")}: ${f.name}`} className="mt-2 min-h-40 resize-y" value={f.text} onChange={(e) => setVerifiedFiles((prev) => prev.map((item, index) => index === i ? { ...item, text: e.target.value } : item))} /></details>}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Discard ${f.name}`} disabled={verifiedFiles.some((item) => item.status === "checking")} onClick={() => setVerifiedFiles((prev) => prev.filter((_, index) => index !== i))}><X className="h-3 w-3" /></Button>
          </div>)}</div>
        </> : <><Textarea aria-label="Topics to follow" value={input} onChange={(e) => { setInput(e.target.value); setTopicError(""); }} onKeyDown={(e) => dialog === "topics" && listKeyDown(e, setInput)} className="min-h-[320px]" placeholder={"1. Forces and motion\n2. Energy transfers\n3. Electricity"} />
          {topicError && <p role="alert" className="text-sm text-destructive">{topicError}</p>}
        </>}
        <DialogFooter><Button disabled={(dialog === "files" ? !verifiedFiles.length || verifiedFiles.some((f) => f.status !== "ready" || !f.text.trim()) : !input.trim())} onClick={() => {
          if (dialog === "topics") insertTopics();
          else if (dialog === "files") { add(verifiedFiles.map((f) => ({ kind: "file", name: f.name, text: f.text }))); openDialog(null); }
        }}>Insert</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) finishEdit(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader><SheetTitle>Pasted notes</SheetTitle><SheetDescription>{selected?.text.length ?? 0} characters</SheetDescription></SheetHeader>
        {editing ? <Textarea aria-label="Edit pasted notes" className="min-h-0 flex-1 resize-none" value={editText} onChange={(e) => setEditText(e.target.value)} /> : <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm">{selected?.text}</div>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => { if (!selected) return; const text = editing ? editText : selected.text; if (!text.trim()) return; onSourceChange(source + (source ? "\n\n" : "") + text); onSourcesChange(sources.filter((s) => s.id !== selected.id)); setSelected(null); requestAnimationFrame(() => textarea.current?.focus()); }}><Type className="mr-2 h-4 w-4" />Insert as characters</Button>
          <Button variant="outline" onClick={() => { setEditing(true); }}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
          <Button variant="ghost" onClick={() => selected && remove(selected.id)}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
          <Button onClick={finishEdit}><Check className="mr-2 h-4 w-4" />Finish</Button>
        </div>
      </SheetContent>
    </Sheet>
    <AlertDialog open={removeId !== null} onOpenChange={(open) => !open && setRemoveId(null)}><AlertDialogContent className="w-[calc(100%-2rem)]"><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>Remove this source from the Notes Space?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => removeId && commitRemove(removeId)}>Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}