import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Loader2, Sparkles, CheckCircle2, X, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { generateQuestions, aiTextHelper, type Question } from "@/lib/ai.functions";
import { parseFile } from "@/lib/file-parse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/generate")({
  head: () => ({
    meta: [
      { title: "Generate Quiz Questions — CanWinBuddy" },
      { name: "description", content: "Paste text or upload PDFs, docs, spreadsheets, or images. AI generates and validates quiz questions against your source." },
      { property: "og:title", content: "Generate Quiz Questions — CanWinBuddy" },
      { property: "og:description", content: "Turn any document into validated quiz questions in seconds." },
      { property: "og:url", content: "/generate" },
    ],
    links: [{ rel: "canonical", href: "/generate" }],
  }),
  component: GeneratePage,
});

type Stage = "input" | "extracting" | "generating" | "validating" | "done";

function GeneratePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(10);
  const wordCount = source.trim() ? source.trim().split(/\s+/).length : 0;
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  };

  const removeFile = (i: number) => setFiles((f) => f.filter((_, idx) => idx !== i));

  const run = async () => {
    if (!source.trim() && files.length === 0) {
      toast.error("Add source text or upload a file first.");
      return;
    }
    try {
      let combined = source.trim();

      if (files.length > 0) {
        setStage("extracting");
        for (const f of files) {
          const text = await parseFile(f);
          combined += (combined ? "\n\n" : "") + `[${f.name}]\n${text}`;
        }
      }

      if (combined.length < 30) {
        toast.error("Source content is too short to generate meaningful questions.");
        setStage("input");
        return;
      }

      setStage("generating");
      const { questions } = await generateQuestions({ data: { sourceText: combined, count, difficulty } });

      setStage("validating");
      await new Promise((r) => setTimeout(r, 400));

      // Save to history
      const finalTitle = title.trim() || combined.slice(0, 60).replace(/\s+/g, " ") + (combined.length > 60 ? "…" : "");
      const { data: inserted, error } = await supabase
        .from("quiz_sets")
        .insert({
          user_id: user!.id,
          title: finalTitle,
          source_text: combined,
          questions: JSON.parse(JSON.stringify(questions)),
          question_count: questions.length,
        })
        .select("id")
        .single();
      if (error) throw error;

      setStage("done");
      toast.success(`Generated ${questions.length} verified questions.`);
      navigate({ to: "/export/$id", params: { id: inserted.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
      setStage("input");
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-bold tracking-tight">Generate</h1>
        <p className="mt-2 text-muted-foreground">Paste text or upload a source. AI generates, validates, and saves your set.</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {stage === "input" ? (
          <motion.div key="input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-8 space-y-5">
            <div className="panel p-6 space-y-5">
              <div>
                <Label htmlFor="title" className="mb-2 block">Title <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 4: The French Revolution" />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label htmlFor="src">Source text</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
                  </span>
                </div>
                <Textarea
                  id="src"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Paste your notes, article, or study material here…"
                  className="min-h-[220px] resize-y"
                />
              </div>

              <div>
                <Label className="mb-2 block">Or upload files</Label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileInput.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-accent/30 py-8 text-center transition-colors hover:bg-accent/60"
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop files or click to upload</p>
                  <p className="text-xs text-muted-foreground">PDF, DOCX, XLSX, CSV, TXT, PNG, JPG</p>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,image/*"
                    onChange={(e) => addFiles(e.target.files)}
                    className="hidden"
                  />
                </div>
                {files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 truncate">
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate">{f.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span>
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="count" className="mb-2 block">Amount of questions</Label>
                  <Input id="count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
                </div>
                <div>
                  <Label className="mb-2 block">Difficulty</Label>
                  <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button size="lg" onClick={run} className="w-full">
                <Sparkles className="mr-2 h-4 w-4" /> Generate quiz
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
            <StageProgress stage={stage} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StageProgress({ stage }: { stage: Stage }) {
  const steps: Array<{ id: Stage; label: string }> = [
    { id: "extracting", label: "Extracting source content" },
    { id: "generating", label: "Generating questions" },
    { id: "validating", label: "Validating against source" },
    { id: "done", label: "Complete" },
  ];
  const order: Stage[] = ["input", "extracting", "generating", "validating", "done"];
  const idx = order.indexOf(stage);

  return (
    <div className="panel p-8">
      <ul className="space-y-4">
        {steps.map((s) => {
          const si = order.indexOf(s.id);
          const state = si < idx ? "done" : si === idx ? "active" : "pending";
          return (
            <li key={s.id} className="flex items-center gap-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary">
                {state === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : state === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground">·</span>
                )}
              </span>
              <span className={state === "pending" ? "text-muted-foreground" : "font-medium"}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
