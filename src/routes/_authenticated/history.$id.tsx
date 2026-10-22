import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Download, Play, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Question } from "@/lib/ai.functions";
import { toStrippedClipboard, downloadForPlatform, multiExcludedNotice, type Platform } from "@/lib/export";
import { getCorrectIndexes } from "@/lib/question-utils";
import { QuizGame } from "@/components/quiz-game";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/history/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Quiz Set Details — CanWinBuddy" },
      { name: "description", content: "View, play, or export this saved quiz set. Copy clean text or download for Blooket, Gimkit, or Quizlet." },
      { property: "og:title", content: "Quiz Set Details — CanWinBuddy" },
      { property: "og:description", content: "Play or export a saved CanWinBuddy quiz set." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: `/history/${params.id}` },
    ],
    links: [{ rel: "canonical", href: `/history/${params.id}` }],
  }),
  component: HistoryDetail,
});

function HistoryDetail() {
  const t = useT();
  const { id } = Route.useParams();
  const [playing, setPlaying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-set", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_sets").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-10 text-muted-foreground">{t("Loading…")}</div>;
  if (!data) return <div className="p-10">{t("Not found.")} <Link to="/history" className="text-primary underline">{t("Back to history")}</Link></div>;

  const questions = data.questions as unknown as Question[];

  const exportTo = (p: Platform, msg: string) => {
    downloadForPlatform(p, questions, data.title);
    toast.success(msg);
    const notice = multiExcludedNotice(p, questions);
    if (notice) toast.warning(t(notice));
  };

  const copyStripped = async () => {
    await navigator.clipboard.writeText(toStrippedClipboard(questions));
    toast.success("Copied clean questions to clipboard");
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <Link to="/history" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("Back to history")}
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{data.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{questions.length} {t("questions")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPlaying(true)}>
            <Play className="mr-2 h-4 w-4" /> {t("Play")}
          </Button>
          <Button variant="secondary" onClick={copyStripped}>
            <Copy className="mr-2 h-4 w-4" /> {t("Copy clean")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary"><Download className="mr-2 h-4 w-4" /> {t("Export")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportTo("blooket", "Blooket CSV downloaded")}>
                Blooket (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportTo("gimkit", "Gimkit CSV downloaded")}>
                Gimkit (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportTo("gimkit2", "Gimkit 2 CSV downloaded")}>
                Gimkit 2 (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportTo("kahoot", "Kahoot XLSX downloaded")}>
                Kahoot (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      <ul className="mt-8 space-y-4">
        {questions.map((q, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="panel p-4 sm:p-5"
          >
            <p className="font-medium">
              <span className="mr-2 text-primary">{i + 1}.</span>{q.question}
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {q.choices.map((c, ci) => {
                const correct = getCorrectIndexes(q).includes(ci);
                return (
                  <li
                    key={ci}
                    className={
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm " +
                      (correct
                        ? "border-success/40 bg-success/10 text-foreground"
                        : "border-border bg-secondary/50 text-muted-foreground")
                    }
                  >
                    {correct ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <span className="mt-0.5 w-4 shrink-0 text-center">{String.fromCharCode(65 + ci)}</span>}
                    <span>{c}</span>
                  </li>
                );
              })}
            </ul>
          </motion.li>
        ))}
      </ul>

      <AnimatePresence>
        {playing && <QuizGame questions={questions} onClose={() => setPlaying(false)} title={data.title} />}
      </AnimatePresence>
    </div>
  );
}
