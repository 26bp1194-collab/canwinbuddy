import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Loader2, Sparkles, CheckCircle2, X, Wand2, Clock, SlidersHorizontal, Zap, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { analyzeSource, generateQuestions, reviewAndRepair } from "@/lib/ai.functions";
import { parseFile } from "@/lib/file-parse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  clearDraft,
  formatMs,
  getDraft,
  getQuizDefaults,
  saveDraft,
  saveTimings,
  DEFAULT_SPEC,
  DEFAULT_SPEC_ADVANCED,

  type Difficulty,
  type StepTiming,
  type StyleSpec,
} from "@/lib/prefs";

import { AiTextHelper } from "@/components/ai-text-helper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

type Stage = "input" | "extracting" | "analyzing" | "generating" | "reviewing" | "saving" | "done";
const SUGGESTION_KEY = "cwb:next-quiz";

function GeneratePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [countText, setCountText] = useState("10");
  const count = Math.max(1, Math.min(100, Number(countText) || 1));
  const wordCount = source.trim() ? source.trim().split(/\s+/).length : 0;
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [specs, setSpecs] = useState<{ simple: StyleSpec; advanced: StyleSpec }>({
    simple: DEFAULT_SPEC,
    advanced: DEFAULT_SPEC_ADVANCED,
  });
  const spec: StyleSpec = { ...specs[mode], mode };
  const setSpec = (next: StyleSpec) => {
    if (next.mode !== mode) {
      setMode(next.mode);
      return;
    }
    setSpecs((s) => ({ ...s, [mode]: { ...next, mode } }));
  };

  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const [timings, setTimings] = useState<StepTiming[]>([]);
  const [totalMs, setTotalMs] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperSeed, setHelperSeed] = useState("");
  const restored = useRef(false);

  /* Restore any in-progress draft + a suggested follow-up quiz */
  useEffect(() => {
    const draft = getDraft();
    const defaults = getQuizDefaults();
    if (draft) {
      setSource(draft.source);
      setTitle(draft.title);
      setCountText(draft.countText ?? String(draft.count));
      setDifficulty(draft.difficulty);
      setMode(draft.mode ?? "simple");
      setSpecs({
        simple: { ...DEFAULT_SPEC, ...defaults.spec, ...(draft.specs?.simple ?? (draft.spec?.mode !== "advanced" ? draft.spec : undefined)), mode: "simple" },
        advanced: { ...DEFAULT_SPEC_ADVANCED, ...defaults.specAdvanced, ...(draft.specs?.advanced ?? (draft.spec?.mode === "advanced" ? draft.spec : undefined)), mode: "advanced" },
      });
    } else {
      setCountText(String(defaults.count));
      setDifficulty(defaults.difficulty);
      setSpecs({
        simple: { ...DEFAULT_SPEC, ...defaults.spec, mode: "simple" },
        advanced: { ...DEFAULT_SPEC_ADVANCED, ...defaults.specAdvanced, mode: "advanced" },
      });
    }

    const raw = window.localStorage.getItem(SUGGESTION_KEY);
    if (raw) {
      window.localStorage.removeItem(SUGGESTION_KEY);
      try {
        const s = JSON.parse(raw) as { title: string; topic: string };
        setTitle(s.title);
        setHelperSeed(s.topic);
        setHelperOpen(true);
        toast.success(t("Suggested quiz loaded — generate the source text to continue"));
      } catch {
        /* ignore */
      }
    }
    restored.current = true;
  }, [t]);

  /* Persist the whole page state (text AND settings) so navigating away never loses work */
  useEffect(() => {
    if (!restored.current) return;
    const d = getQuizDefaults();
    const settingsAreDefault =
      mode === "simple" &&
      count === d.count &&
      difficulty === d.difficulty &&
      JSON.stringify(specs.simple) === JSON.stringify({ ...DEFAULT_SPEC, ...d.spec, mode: "simple" }) &&
      JSON.stringify(specs.advanced) === JSON.stringify({ ...DEFAULT_SPEC_ADVANCED, ...d.specAdvanced, mode: "advanced" });
    if (!source.trim() && !title.trim() && settingsAreDefault) {
      clearDraft();
      return;
    }
    saveDraft({ source, title, count, countText, difficulty, spec, mode, specs });
  }, [source, title, count, countText, difficulty, spec, mode, specs]);


  const resetSettings = () => {
    const d = getQuizDefaults();
    setCountText(String(d.count));
    setDifficulty(d.difficulty);
    setSpecs({
      simple: { ...DEFAULT_SPEC, ...d.spec, mode: "simple" },
      advanced: { ...DEFAULT_SPEC_ADVANCED, ...d.specAdvanced, mode: "advanced" },
    });
    toast.success(t("Quiz settings reset to your defaults"));
  };




  const useHelperText = (text: string) => {
    setSource(text);
    setHelperOpen(false);
    toast.success(t("Text applied to source"));
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  };

  const removeFile = (i: number) => setFiles((f) => f.filter((_, idx) => idx !== i));

  const run = async () => {
    if (!source.trim() && files.length === 0) {
      toast.error(t("Add source text or upload a file first."));
      return;
    }
    const started = performance.now();
    const steps: StepTiming[] = [];
    const mark = (label: string, from: number) => {
      const entry = { label, ms: performance.now() - from };
      steps.push(entry);
      setTimings([...steps]);
      setTotalMs(performance.now() - started);
    };

    try {
      let combined = source.trim();
      setTimings([]);
      setTotalMs(0);

      if (files.length > 0) {
        setStage("extracting");
        const t0 = performance.now();
        for (const f of files) {
          const text = await parseFile(f);
          combined += (combined ? "\n\n" : "") + `[${f.name}]\n${text}`;
        }
        mark("Extracting source content", t0);
      }

      if (combined.length < 30) {
        toast.error(t("Source content is too short to generate meaningful questions."));
        setStage("input");
        return;
      }

      setStage("analyzing");
      const t0a = performance.now();
      const analysis = await analyzeSource({ data: { sourceText: combined, count, difficulty } });
      mark("Analyzing notes", t0a);

      setStage("generating");
      const t1 = performance.now();
      const generated = await generateQuestions({
        data: { sourceText: combined, count, difficulty, spec, analysis },
      });
      mark("Generating questions", t1);

      setStage("reviewing");
      const t2 = performance.now();
      const { questions } = await reviewAndRepair({
        data: { sourceText: combined, questions: generated.questions, difficulty, spec, requested: count, analysis },
      });
      mark("AI reviewing questions", t2);

      setStage("saving");
      const t3 = performance.now();
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
      mark("Saving your set", t3);

      const total = performance.now() - started;
      setTotalMs(total);
      saveTimings(inserted.id, steps, total);
      setStage("done");
      finished.current = true;
      clearDraft();

      if (questions.length < count) {
        toast.success(`${t("Generated")} ${questions.length}/${count} — ${formatMs(total)}`);
      } else {
        toast.success(`${t("Generated")} ${questions.length} — ${formatMs(total)}`);
      }
      navigate({ to: "/export/$id", params: { id: inserted.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Generation failed"));
      setStage("input");
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("Generate")}</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("Paste text or upload a source. AI generates, validates, and saves your set.")}
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {stage === "input" ? (
          <motion.div key="input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-6 space-y-5 sm:mt-8">
            <div className="panel space-y-5 p-4 sm:p-6">
              <div>
                <Label htmlFor="title" className="mb-2 block">
                  {t("Title")} <span className="text-muted-foreground">({t("optional")})</span>
                </Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Chapter 4: The French Revolution")} />
              </div>

              <div>
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
                  <Label htmlFor="src" className="min-w-0 truncate">{t("Source text")}</Label>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {wordCount.toLocaleString()} {wordCount === 1 ? t("word") : t("words")}
                    </span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => { setHelperSeed(""); setHelperOpen(true); }}>
                      <Wand2 className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">{t("AI Text Helper")}</span>
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="src"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder={t("Paste your notes, article, or study material here…")}
                  className="min-h-[180px] resize-y sm:min-h-[220px]"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("Your text and settings are saved automatically if you leave this page.")}</p>
              </div>

              <div>
                <Label className="mb-2 block">{t("Or upload files")}</Label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileInput.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-accent/30 px-3 py-6 text-center transition-colors hover:bg-accent/60 sm:py-8"
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">{t("Drop files or click to upload")}</p>
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
                      <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate">{f.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span>
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <DifficultyControls
                difficulty={difficulty}
                setDifficulty={setDifficulty}
                spec={spec}
                setSpec={setSpec}
                countText={countText}
                setCountText={setCountText}
                onReset={resetSettings}
              />



              <Button size="lg" onClick={run} className="w-full">
                <Sparkles className="mr-2 h-4 w-4" /> {t("Generate quiz")}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 space-y-5 sm:mt-8">
            <StageProgress stage={stage} timings={timings} totalMs={totalMs} />
          </motion.div>
        )}
      </AnimatePresence>

      <AiTextHelper
        open={helperOpen}
        onOpenChange={setHelperOpen}
        sourceText={source}
        onApply={useHelperText}
        initialInstruction={helperSeed}
      />
    </div>
  );
}

export function DifficultyControls({
  difficulty,
  setDifficulty,
  spec,
  setSpec,
  countText,
  setCountText,
  onReset,
}: {
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  spec: StyleSpec;
  setSpec: (s: StyleSpec) => void;
  countText: string;
  setCountText: (v: string) => void;
  onReset?: () => void;
}) {
  const t = useT();
  const advanced = spec.mode === "advanced";

  const countField = (
    <div className="min-w-0">
      <Label htmlFor="count" className="mb-2 block">{t("Amount of questions")}</Label>
      <Input
        id="count"
        type="text"
        inputMode="numeric"
        value={countText}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "");
          if (v === "") return setCountText("");
          setCountText(String(Math.min(100, Number(v))));
        }}
        onBlur={() => { if (!countText.trim()) setCountText("1"); }}
      />
    </div>
  );

  const difficultyField = (
    <div className="min-w-0">
      <Label className="mb-2 block">{t("Difficulty")}</Label>
      <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="easy">{t("Easy")}</SelectItem>
          <SelectItem value="medium">{t("Medium")}</SelectItem>
          <SelectItem value="hard">{t("Hard")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-secondary/30 p-4">
      {onReset && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{t("Reset")}</span>
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">

        <button
          type="button"
          onClick={() => setSpec({ ...spec, mode: "simple" })}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
            !advanced ? "border-primary/60 bg-primary text-primary-foreground" : "border-border bg-secondary/50 hover:bg-accent/60",
          )}
        >
          <Zap className="h-4 w-4 shrink-0" /> <span className="truncate">{t("Simple")}</span>
        </button>
        <button
          type="button"
          onClick={() => setSpec({ ...spec, mode: "advanced" })}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
            advanced ? "border-primary/60 bg-primary text-primary-foreground" : "border-border bg-secondary/50 hover:bg-accent/60",
          )}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" /> <span className="truncate">{t("Advanced")}</span>
        </button>
      </div>

      {!advanced ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {countField}
            {difficultyField}
          </div>
          <button
            type="button"
            onClick={() => setSpec({ ...spec, shortQA: !spec.shortQA })}
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
              spec.shortQA ? "border-primary/60 bg-primary/15" : "border-border bg-secondary/50 hover:bg-accent/60",
            )}
          >
            {t("Short questions & answers")}
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              {t("Keep every stem and option as short as possible.")}
            </span>
          </button>
        </>
      ) : (
        <div className="space-y-4">
          {countField}
          <div className="grid grid-cols-2 gap-3">
            <BarRow label={t("Question length")} low={t("Short")} high={t("Long")} value={spec.questionLength} onChange={(v) => setSpec({ ...spec, questionLength: v })} />
            <BarRow label={t("Answer length")} low={t("Short")} high={t("Long")} value={spec.answerLength} onChange={(v) => setSpec({ ...spec, answerLength: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BarRow label={t("Complexity")} low={t("Simple")} high={t("Complex")} value={spec.complexity} onChange={(v) => setSpec({ ...spec, complexity: v })} />
            <BarRow label={t("Obscurity")} low={t("Explicit")} high={t("Implicit")} value={spec.obscurity} onChange={(v) => setSpec({ ...spec, obscurity: v })} />
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("1–100 questions per set. Leave it empty and click away to reset to 1.")}</p>

    </div>
  );
}

function BarRow({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{value}/5</span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n}`}
            onClick={() => onChange(n)}
            className={cn(
              "h-8 flex-1 rounded-md border transition-colors",
              n <= value ? "border-primary/60 bg-primary" : "border-border bg-secondary/60 hover:bg-accent/60",
            )}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function StageProgress({ stage, timings, totalMs }: { stage: Stage; timings: StepTiming[]; totalMs: number }) {
  const t = useT();
  const steps: Array<{ id: Stage; label: string }> = [
    { id: "extracting", label: "Extracting source content" },
    { id: "analyzing", label: "Analyzing notes" },
    { id: "generating", label: "Generating questions" },
    { id: "reviewing", label: "AI reviewing questions" },
    { id: "saving", label: "Saving your set" },
    { id: "done", label: "Complete" },
  ];
  const order: Stage[] = ["input", "extracting", "analyzing", "generating", "reviewing", "saving", "done"];

  const idx = order.indexOf(stage);

  return (
    <div className="panel p-5 sm:p-8">
      <ul className="space-y-4">
        {steps.map((s) => {
          const si = order.indexOf(s.id);
          const state = si < idx ? "done" : si === idx ? "active" : "pending";
          const timing = timings.find((x) => x.label === s.label);
          return (
            <li key={s.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                {state === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : state === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground">·</span>
                )}
              </span>
              <span className={`min-w-0 text-sm sm:text-base ${state === "pending" ? "text-muted-foreground" : "font-medium"}`}>{t(s.label)}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{timing ? formatMs(timing.ms) : ""}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border pt-4 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0 text-primary" /> {t("Total time")}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{formatMs(totalMs)}</span>
      </div>
    </div>
  );
}
