import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check, ArrowLeft, Play, Download, History, Loader2, Clock, HelpCircle, Send, Wand2, Share2, FileText, Sparkles, MoreHorizontal, Square, Layers } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { translateQuestions, explainAnswer, editQuestions, type Question } from "@/lib/ai.functions";
import { downloadForPlatform, formatFor, toRows, multiExcludedNotice, PLATFORM_COLUMNS, PLATFORM_HEADERS, PLATFORM_LABELS, type Platform } from "@/lib/export";
import { formatMs, getQuizDefaults, getTimings, setGeneratePrefill, type QuizSettingsSnapshot, type StepTiming } from "@/lib/prefs";
import { subjectText, audienceText } from "@/lib/quiz-context";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getCorrectIndexes } from "@/lib/question-utils";
import { QuizGame } from "@/components/quiz-game";
import { QuizResultsDialog } from "@/components/quiz-results";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";



export const Route = createFileRoute("/_authenticated/export/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Export Quiz Questions — CanWinBuddy" },
      { name: "description", content: "Copy your curriculum-aware generated questions and worksheets in the exact format required by Blooket, Gimkit, Gimkit 2, or Kahoot." },
      { property: "og:title", content: "Export Quiz Questions — CanWinBuddy" },
      { property: "og:description", content: "Copy curriculum-aware questions in Blooket, Gimkit, or Kahoot format." },
      { property: "og:url", content: `/export/${params.id}` },
    ],
    links: [{ rel: "canonical", href: `/export/${params.id}` }],
  }),
  validateSearch: (s: Record<string, unknown>): { from?: string; groupId?: string; groupName?: string } => ({
    from: typeof s.from === "string" ? s.from : undefined,
    groupId: typeof s.groupId === "string" ? s.groupId : undefined,
    groupName: typeof s.groupName === "string" ? s.groupName : undefined,
  }),
  component: ExportPage,
});

const LANGUAGES = [
  "Arabic", "Chinese (Simplified)", "Chinese (Traditional)", "Dutch", "English", "French",
  "German", "Hindi", "Italian", "Japanese", "Korean", "Polish",
  "Portuguese", "Russian", "Spanish", "Turkish", "Ukrainian", "Vietnamese",
].sort((a, b) => a.localeCompare(b));

function ExportPage() {
  const { id } = Route.useParams();
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform>("blooket");
  const [language, setLanguage] = useState<string>("English");
  const [translated, setTranslated] = useState<Record<string, Question[]>>({});
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [timing, setTiming] = useState<{ steps: StepTiming[]; totalMs: number } | null>(null);
  const [explainIndex, setExplainIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [progressiveOpen, setProgressiveOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const search = Route.useSearch();
  const qc = useQueryClient();




  const { data, isLoading } = useQuery({
    queryKey: ["quiz-set", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_sets").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const original = (data?.questions as unknown as Question[]) ?? [];
  const questions = language === "English" ? original : (translated[language] ?? original);
  const text = useMemo(() => formatFor(platform, questions), [platform, questions]);
  /* One entry per question so row numbers and selection stay aligned; null = left out of this export */
  const rows = useMemo(() => questions.map((q) => toRows(platform, [q])[0] ?? null), [platform, questions]);
  const notice = useMemo(() => multiExcludedNotice(platform, questions), [platform, questions]);

  useEffect(() => {
    const d = getQuizDefaults();
    setPlatform(d.platform);
    setTiming(getTimings(id));
    if (d.language && d.language !== "English") void changeLanguage(d.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changeLanguage = async (lang: string) => {
    setLanguage(lang);
    if (lang === "English" || translated[lang]) return;
    setTranslating(true);
    try {
      const { data: row } = await supabase.from("quiz_sets").select("questions").eq("id", id).maybeSingle();
      const base = ((row?.questions as unknown as Question[]) ?? original) ?? [];
      if (base.length === 0) return;
      const { questions: out } = await translateQuestions({ data: { questions: base, language: lang } });
      setTranslated((prev) => ({ ...prev, [lang]: out }));
      toast.success(`${t("Translated to")} ${lang}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Translation failed"));
      setLanguage("English");
    } finally {
      setTranslating(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${t("Copied")} ${PLATFORM_LABELS[platform]}`);
    if (notice) toast.warning(t(notice));
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const ext = downloadForPlatform(platform, questions, data?.title ?? "questions");
    toast.success(`${t("Downloaded")} ${PLATFORM_LABELS[platform]} .${ext}`);
    if (notice) toast.warning(t(notice));
  };

  const share = async () => {
    if (!data) return;
    setSharing(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("quiz_shares")
        .insert({
          user_id: userRes.user!.id,
          quiz_set_id: id,
          title: data.title,
          questions: JSON.parse(JSON.stringify(questions)),
          question_count: questions.length,
        })
        .select("id")
        .single();
      if (error) throw error;
      setShareUrl(`${window.location.origin}/play/${row.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Couldn't create a share link"));
    } finally {
      setSharing(false);
    }
  };

  const applyEdits = async (indices: number[], instruction: string, presets: string[]) => {
    const subset = indices.map((i) => original[i]);
    const { questions: out } = await editQuestions({
      data: {
        sourceText: (data?.source_text as string) ?? "",
        questions: subset,
        instruction,
        presets,
      },
    });
    const next = [...original];
    indices.forEach((idx, k) => { next[idx] = out[k] ?? next[idx]; });
    const { error } = await supabase
      .from("quiz_sets")
      .update({ questions: JSON.parse(JSON.stringify(next)), question_count: next.length })
      .eq("id", id);
    if (error) throw error;
    setTranslated({});
    setLanguage("English");
    setSelected([]);
    await qc.invalidateQueries({ queryKey: ["quiz-set", id] });
  };

  /* Progressive quiz — builds a brand new set from this one */
  const makeProgressive = async (instruction: string, presets: string[]) => {
    const { questions: out } = await editQuestions({
      data: {
        sourceText: (data?.source_text as string) ?? "",
        questions: original,
        instruction,
        presets,
      },
    });
    const next = out.length ? out : original;
    const { data: inserted, error } = await supabase
      .from("quiz_sets")
      .insert({
        user_id: user!.id,
        title: `${data!.title} — ${t("next round")}`,
        source_text: (data?.source_text as string) ?? "",
        questions: JSON.parse(JSON.stringify(next)),
        question_count: next.length,
      })
      .select("id")
      .single();
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["history"] });
    navigate({ to: "/export/$id", params: { id: inserted.id } });
  };

  const toggleRow = (i: number) =>
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  if (isLoading) return <div className="p-10 text-muted-foreground">{t("Loading…")}</div>;
  if (!data) return <div className="p-10">{t("Not found.")} <Link to="/history" className="text-primary underline">{t("Back to history")}</Link></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      {search.from === "history" ? (
        <Link to="/history" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("History")}
        </Link>
      ) : search.from === "group" && search.groupId ? (
        <Link to="/group/$id" params={{ id: search.groupId }} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {search.groupName || t("Group")}
        </Link>
      ) : (
        <Link to="/generate" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("Generate another quiz")}
        </Link>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{data.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {questions.length} {t("verified questions · ready to export")}
          </p>
        </div>
        {timing && (
          <span
            title={t("Generation time")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">{t("Generation time")}</span>
            <span className="font-semibold tabular-nums text-foreground">{formatMs(timing.totalMs)}</span>
          </span>
        )}
      </motion.div>


      <div className="panel mt-6 p-4 sm:mt-8 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="grid grid-cols-1 gap-4 sm:flex sm:flex-wrap sm:items-end">
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium">{t("Question format")}</label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blooket">Blooket</SelectItem>
                  <SelectItem value="gimkit">Gimkit</SelectItem>
                  <SelectItem value="gimkit2">Gimkit 2</SelectItem>
                  <SelectItem value="kahoot">Kahoot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium">{t("Language")}</label>
              <Select value={language} onValueChange={changeLanguage} disabled={translating}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  {translating ? (
                    <span className="flex items-center gap-2 truncate text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Translating…")}</span>
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
            <Button onClick={() => setPlaying(true)}>
              <Play className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("Play")}</span>
            </Button>
            <Button variant="secondary" asChild aria-label={t("Flashcards")}>
              <Link to="/flashcards/$id" params={{ id }}>
                <Layers className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("Flashcards")}</span>
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => setResultsOpen(true)} aria-label={t("Results history")}>
              <History className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("History")}</span>
            </Button>
            <Button variant="secondary" onClick={copy}>
              {copied ? <Check className="h-4 w-4 sm:mr-2" /> : <Copy className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{copied ? t("Copied") : t("Copy")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" aria-label={t("More")}>
                  <MoreHorizontal className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("More")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={download}>
                  <Download className="mr-2 h-4 w-4" /> {t("Download")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSourcesOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" /> {t("Sources")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={sharing} onClick={share}>
                  {sharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                  {t("Share")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setProgressiveOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" /> {t("Follow-up quiz")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </div>

        <p className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">{t("Format")}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground sm:text-sm">{PLATFORM_HEADERS[platform]}</p>
        {notice && <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">{t(notice)}</p>}

        <pre className="mt-4 max-h-[400px] overflow-auto rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words sm:max-h-[560px] sm:p-4">
{text}
        </pre>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("Preview")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Tick questions to edit them, or edit the whole set at once.")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="ghost" disabled={selected.length === 0} onClick={() => setSelected([])}>
              <Square className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t("Unselect all")}</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setSelected(original.map((_, i) => i)); setEditOpen(true); }}>
              <Wand2 className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t("Edit all")}</span>
            </Button>
            <Button size="sm" disabled={selected.length === 0} onClick={() => setEditOpen(true)}>
              <Wand2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("Edit selected")}</span>
              <span className="ml-1 tabular-nums">{selected.length || ""}</span>
            </Button>
          </div>
        </div>
        <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-border sm:max-h-[560px]">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-secondary">
              <tr>
                <th className="border-b border-border px-3 py-2" />
                <th className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">#</th>
                {PLATFORM_COLUMNS[platform].map((c) => (
                  <th key={c} className="border-b border-border px-3 py-2 font-semibold">{c}</th>
                ))}
                <th className="border-b border-border px-3 py-2 font-semibold">{t("Explain")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={cn(selected.includes(i) ? "bg-primary/10" : i % 2 ? "bg-secondary/20" : undefined)}>
                  <td className="border-b border-border px-3 py-2 align-top">
                    <Checkbox
                      checked={selected.includes(i)}
                      onCheckedChange={() => toggleRow(i)}
                      aria-label={`Select question ${i + 1}`}
                    />
                  </td>
                  <td className="border-b border-border px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                  {r ? (
                    r.map((cell, j) => (
                      <td key={j} className="border-b border-border px-3 py-2 align-top">{cell}</td>
                    ))
                  ) : (
                    <td colSpan={PLATFORM_COLUMNS[platform].length} className="border-b border-border px-3 py-2 align-top text-muted-foreground">
                      <span className="text-foreground">{questions[i]?.question}</span> — {t("Not included: this export uses one correct answer.")}
                    </td>
                  )}
                  <td className="border-b border-border px-3 py-2 align-top">
                    <Button size="sm" variant="secondary" onClick={() => setExplainIndex(i)}>
                      <HelpCircle className="mr-1.5 h-3.5 w-3.5" /> {t("Explain")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <EditDialog
        open={editOpen}
        count={selected.length}
        onOpenChange={setEditOpen}
        onApply={async (instruction, presets) => {
          await applyEdits([...selected].sort((a, b) => a - b), instruction, presets);
        }}
      />

      <ProgressiveDialog
        open={progressiveOpen}
        onOpenChange={setProgressiveOpen}
        onApply={makeProgressive}
      />

      <SourcesDialog
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        sourceText={(data.source_text as string) ?? ""}
        settings={(data.settings as unknown as QuizSettingsSnapshot | null) ?? null}
        title={(data.title as string) ?? ""}
      />


      <ExplainDialog
        question={explainIndex !== null ? questions[explainIndex] : null}
        sourceText={(data.source_text as string) ?? ""}
        onClose={() => setExplainIndex(null)}
      />



      <QuizResultsDialog open={resultsOpen} onOpenChange={setResultsOpen} quizSetId={id} />

      <Dialog open={shareUrl !== null} onOpenChange={(v) => !v && setShareUrl(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Share this quiz")}</DialogTitle>
            <DialogDescription>{t("Anyone with this link can play — no account needed.")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="secondary"
              onClick={() => {
                if (shareUrl) void navigator.clipboard.writeText(shareUrl);
                toast.success(t("Link copied"));
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShareUrl(null)}>{t("Done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {playing && (
          <QuizGame
            questions={questions}
            onClose={() => setPlaying(false)}
            title={data.title}
            quizSetId={id}
            sourceText={(data.source_text as string) ?? ""}
            onSaved={() => qc.invalidateQueries({ queryKey: ["quiz-results", id] })}
          />
        )}
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/history" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <History className="h-4 w-4" /> {t("View all history")}
        </Link>
      </div>
    </div>
  );
}

function SourcesDialog({
  open,
  onOpenChange,
  sourceText,
  settings,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceText: string;
  settings?: QuizSettingsSnapshot | null;
  title?: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  /* Uploaded files were merged in as "[filename]" blocks when the set was generated */
  const files = Array.from(sourceText.matchAll(/^\[([^\]\n]+)\]$/gm)).map((m) => m[1]);

  /* "Quiz name" → "Quiz name 2" → "Quiz name 3" … */
  const nextTitle = (name: string) => {
    const m = name.match(/^(.*?)(\s+)(\d+)$/);
    return m ? `${m[1]}${m[2]}${Number(m[3]) + 1}` : `${name} 2`;
  };

  const useAll = () => {
    if (!settings) return;
    setGeneratePrefill({ ...settings, source: sourceText, title: nextTitle(title ?? "") });
    onOpenChange(false);
    navigate({ to: "/generate" });
  };

  const rows: Array<[string, string]> = settings
    ? [
        [t("Questions"), String(settings.count)],
        [t("Difficulty"), t(({ easy: "Simple", medium: "Average", hard: "Difficult" } as Record<string, string>)[settings.difficulty] ?? settings.difficulty)],
        [t("Curriculum"), settings.curriculum === "other" ? (settings.customCurriculum?.trim() || t("Other")) : settings.curriculum && settings.curriculum !== "none" ? settings.curriculum : t("None")],
        [t("Customisation"), settings.mode === "advanced" ? t("Advanced") : t("Simple")],
        ...(settings.mode === "advanced"
          ? ([
              [t("Question length"), String(settings.spec?.questionLength ?? "—")],
              [t("Answer length"), String(settings.spec?.answerLength ?? "—")],
              [t("Complexity"), String(settings.spec?.complexity ?? "—")],
              [t("Obscurity"), String(settings.spec?.obscurity ?? "—")],
            ] as Array<[string, string]>)
          : ([[t("Short questions & answers"), settings.spec?.shortQA ? t("Yes") : t("No")]] as Array<[string, string]>)),
        ...(settings.subjects?.length
          ? ([[t("Subject"), settings.subjects.map(subjectText).join(", ")]] as Array<[string, string]>)
          : []),
        ...(settings.audiences?.length
          ? ([[t("For"), settings.audiences.map(audienceText).join(", ")]] as Array<[string, string]>)
          : []),
        ...(settings.instructions?.trim()
          ? ([[t("Instructions"), settings.instructions.trim()]] as Array<[string, string]>)
          : []),
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{t("Sources and customization used")}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {t("Everything this quiz was generated from — your pasted text, uploaded files and settings.")}
          </DialogDescription>
        </DialogHeader>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs">
                <FileText className="h-3.5 w-3.5 text-primary" /> <span className="break-all">{f}</span>
              </span>
            ))}
          </div>
        )}

        <pre className="max-h-[40vh] overflow-auto rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
{sourceText || t("No source text was stored for this quiz.")}
        </pre>

        {rows.length > 0 && (
          <div className="rounded-xl border border-border">
            <table className="w-full text-xs sm:text-sm">
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k} className="border-b border-border last:border-0">
                    <td className="w-[45%] px-3 py-2 text-muted-foreground">{k}</td>
                    <td className="px-3 py-2 break-words font-medium">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {settings && (
          <Button onClick={useAll} className="w-full">
            <Sparkles className="mr-2 h-4 w-4" /> {t("Use all")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}


function ExplainDialog({
  question,
  sourceText,
  onClose,
}: {
  question: Question | null;
  sourceText: string;
  onClose: () => void;
}) {
  const t = useT();
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const key = question?.question ?? "";

  useEffect(() => {
    if (!question) return;
    setExplanation("");
    setAnswer("");
    setAsk("");
    setAskOpen(false);
    setLoading(true);
    explainAnswer({ data: { question, sourceText } })
      .then((r) => setExplanation(r.text))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Explanation failed"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const sendAsk = async () => {
    if (!question || !ask.trim()) return;
    setAsking(true);
    try {
      const r = await explainAnswer({ data: { question, sourceText, userQuestion: ask.trim() } });
      setAnswer(r.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAsking(false);
    }
  };

  return (
    <Dialog open={!!question} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{t("Why is this the answer?")}</DialogTitle>
          <DialogDescription className="break-words text-xs sm:text-sm">{question?.question}</DialogDescription>
        </DialogHeader>

        {question && (
          <div className="space-y-4">
            <p className="rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium">
              {getCorrectIndexes(question).map((ci) => `${String.fromCharCode(65 + ci)}. ${question.choices[ci]}`).join("  ·  ")}
            </p>

            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("Thinking…")}
              </p>
            ) : (
              <p className="text-sm leading-relaxed">{explanation}</p>
            )}

            {!askOpen ? (
              <Button variant="secondary" onClick={() => setAskOpen(true)} className="w-full sm:w-auto">
                <HelpCircle className="mr-2 h-4 w-4" /> {t("Ask")}
              </Button>
            ) : (
              <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">{t("Still unsure? Ask anything about this question.")}</p>
                <div className="flex gap-2">
                  <Input
                    value={ask}
                    onChange={(e) => setAsk(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void sendAsk()}
                    placeholder={t("e.g. Why isn't option B correct?")}
                  />
                  <Button onClick={sendAsk} disabled={asking || !ask.trim()} aria-label={t("Send")}>
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                {answer && <p className="text-sm leading-relaxed">{answer}</p>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const PRESETS: Array<{ label: string; instruction: string }> = [
  {
    label: "Shorten",
    instruction:
      "SHORTEN: cut the wording of every question stem and every answer option to the fewest words that still keep the question fully self-contained and answerable. Do not change the topic, the facts, or which option is correct.",
  },
  {
    label: "Lengthen",
    instruction:
      "LENGTHEN: expand each question stem and each answer option with extra useful context and detail drawn from the source, so they read fuller and richer. Do not change the facts or which option is correct.",
  },
  {
    label: "Ease",
    instruction:
      "EASE: make the questions easier — test the most obvious, directly stated facts, use plain everyday wording, and make the three wrong options clearly wrong. Keep the same topic for each question.",
  },
  {
    label: "Harden",
    instruction:
      "HARDEN: make the questions harder — require reasoning, precise detail, or combining facts, and make the three wrong options genuinely plausible and closely related. Keep the same topic for each question and keep exactly one option correct.",
  },
  {
    label: "More explicit",
    instruction:
      "MORE EXPLICIT: state everything needed directly in the question. Name the subject, period, and context outright, quote the relevant fact almost verbatim from the source, and remove any need to infer.",
  },
  {
    label: "More implicit",
    instruction:
      "MORE IMPLICIT: stop restating the fact outright. Ask so the learner must infer or apply the underlying idea from the source rather than recall a sentence, while keeping enough context for the question to stand alone.",
  },
];

function EditDialog({
  open,
  count,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  count: number;
  onOpenChange: (v: boolean) => void;
  onApply: (instruction: string, presets: string[]) => Promise<void>;
}) {
  const t = useT();
  const [picks, setPicks] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPicks([]);
      setPrompt("");
    }
  }, [open]);

  const toggle = (p: string) => setPicks((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  const run = async () => {
    if (!picks.length && !prompt.trim()) {
      toast.error(t("Pick a change or describe what you want."));
      return;
    }
    setBusy(true);
    try {
      await onApply(prompt.trim(), picks);
      toast.success(t("Questions updated"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Couldn't update those questions"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{t("Edit questions")}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {count} {count === 1 ? t("question selected") : t("questions selected")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => toggle(p.instruction)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  picks.includes(p.instruction)
                    ? "border-primary/60 bg-primary text-primary-foreground"
                    : "border-border bg-secondary/50 hover:bg-accent/60",
                )}
              >
                {t(p.label)}
              </button>
            ))}
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("Tell the AI what to change, e.g. focus more on dates and keep options under 5 words.")}
            className="min-h-[100px]"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="w-full sm:w-auto">
            {t("Cancel")}
          </Button>
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {t("Apply changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PROGRESSIVE_PRESETS: Array<{ label: string; instruction: string }> = [
  {
    label: "Easier",
    instruction:
      "EASIER: the new set must test the most obvious, directly stated facts, use plain everyday wording, and make the three wrong options clearly wrong.",
  },
  {
    label: "Harder",
    instruction:
      "HARDER: the new set must require reasoning, precise detail, or combining facts, and the three wrong options must be genuinely plausible and closely related.",
  },
  {
    label: "Same level",
    instruction: "SAME LEVEL: keep the same difficulty as the current set.",
  },
];

function ProgressiveDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (instruction: string, presets: string[]) => Promise<void>;
}) {
  const t = useT();
  const [pick, setPick] = useState<string>(PROGRESSIVE_PRESETS[1].instruction);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPick(PROGRESSIVE_PRESETS[1].instruction);
      setPrompt("");
    }
  }, [open]);

  const run = async () => {
    setBusy(true);
    try {
      await onApply(
        `${t("Build a follow-up quiz on the same source. Every question must be freshly worded and must not repeat the current questions.")} ${prompt.trim()}`.trim(),
        [pick],
      );
      toast.success(t("Follow-up quiz created"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Couldn't create the new quiz"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{t("Follow-up quiz")}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {t("Make a follow-up quiz from this one. Pick a difficulty change and add a comment if you want.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PROGRESSIVE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPick(p.instruction)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  pick === p.instruction
                    ? "border-primary/60 bg-primary text-primary-foreground"
                    : "border-border bg-secondary/50 hover:bg-accent/60",
                )}
              >
                {t(p.label)}
              </button>
            ))}
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("Optional — tell the AI how you want the next quiz, e.g. focus on the parts I got wrong.")}
            className="min-h-[100px]"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="w-full sm:w-auto">
            {t("Cancel")}
          </Button>
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {t("Create quiz")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
