import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check, ArrowLeft, Play, Download, History, Loader2, Clock, HelpCircle, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { translateQuestions, explainAnswer, type Question } from "@/lib/ai.functions";
import { downloadForPlatform, formatFor, toRows, PLATFORM_COLUMNS, PLATFORM_HEADERS, PLATFORM_LABELS, type Platform } from "@/lib/export";
import { formatMs, getQuizDefaults, getTimings, type StepTiming } from "@/lib/prefs";
import { useT } from "@/lib/i18n";
import { QuizGame } from "@/components/quiz-game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/export/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Export Quiz Questions — CanWinBuddy" },
      { name: "description", content: "Copy your generated questions in the exact format required by Blooket, Gimkit, Gimkit 2, or Kahoot." },
      { property: "og:title", content: "Export Quiz Questions — CanWinBuddy" },
      { property: "og:description", content: "Copy questions in Blooket, Gimkit, or Kahoot format." },
      { property: "og:url", content: `/export/${params.id}` },
    ],
    links: [{ rel: "canonical", href: `/export/${params.id}` }],
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
  const [platform, setPlatform] = useState<Platform>("blooket");
  const [language, setLanguage] = useState<string>("English");
  const [translated, setTranslated] = useState<Record<string, Question[]>>({});
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [timing, setTiming] = useState<{ steps: StepTiming[]; totalMs: number } | null>(null);
  const [explainIndex, setExplainIndex] = useState<number | null>(null);

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
  const rows = useMemo(() => toRows(platform, questions), [platform, questions]);

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
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const ext = downloadForPlatform(platform, questions, data?.title ?? "questions");
    toast.success(`${t("Downloaded")} ${PLATFORM_LABELS[platform]} .${ext}`);
  };

  if (isLoading) return <div className="p-10 text-muted-foreground">{t("Loading…")}</div>;
  if (!data) return <div className="p-10">{t("Not found.")} <Link to="/history" className="text-primary underline">{t("Back to history")}</Link></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <Link to="/generate" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("New quiz")}
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{data.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {questions.length} {t("verified questions · ready to export")}
        </p>
      </motion.div>

      {timing && (
        <div className="panel mt-5 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Clock className="h-4 w-4 text-primary" /> {t("Generation time")}
          </p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{formatMs(timing.totalMs)}</p>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {timing.steps.map((s) => (
              <li key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <span className="min-w-0 truncate">{t(s.label)}</span>
                <span className="shrink-0 tabular-nums">{formatMs(s.ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Button onClick={copy}>
              {copied ? <Check className="h-4 w-4 sm:mr-2" /> : <Copy className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{copied ? t("Copied") : t("Copy")}</span>
            </Button>
            <Button variant="secondary" onClick={download}>
              <Download className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("Download")}</span>
            </Button>
            <Button variant="secondary" onClick={() => setPlaying(true)}>
              <Play className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("Play")}</span>
            </Button>
          </div>
        </div>

        <p className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">{t("Format")}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground sm:text-sm">{PLATFORM_HEADERS[platform]}</p>

        <pre className="mt-4 max-h-[400px] overflow-auto rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words sm:max-h-[560px] sm:p-4">
{text}
        </pre>

        <p className="mt-8 text-xs uppercase tracking-wider text-muted-foreground">{t("Preview")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("How your rows will land in a spreadsheet.")}
        </p>
        <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-border sm:max-h-[560px]">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-secondary">
              <tr>
                <th className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">#</th>
                {PLATFORM_COLUMNS[platform].map((c) => (
                  <th key={c} className="border-b border-border px-3 py-2 font-semibold">{c}</th>
                ))}
                <th className="border-b border-border px-3 py-2 font-semibold">{t("Explain")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i % 2 ? "bg-secondary/20" : undefined}>
                  <td className="border-b border-border px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                  {r.map((cell, j) => (
                    <td key={j} className="border-b border-border px-3 py-2 align-top">{cell}</td>
                  ))}
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

      <ExplainDialog
        question={explainIndex !== null ? questions[explainIndex] : null}
        sourceText={(data.source_text as string) ?? ""}
        onClose={() => setExplainIndex(null)}
      />

      <AnimatePresence>
        {playing && <QuizGame questions={questions} onClose={() => setPlaying(false)} title={data.title} />}
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/history" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <History className="h-4 w-4" /> {t("View all history")}
        </Link>
      </div>
    </div>
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
              {String.fromCharCode(65 + question.correctIndex)}. {question.choices[question.correctIndex]}
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
