import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check, ArrowLeft, Play, Download, History } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Question } from "@/lib/ai.functions";
import { downloadForPlatform, formatFor, PLATFORM_HEADERS, PLATFORM_LABELS, type Platform } from "@/lib/export";
import { QuizGame } from "@/components/quiz-game";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

function ExportPage() {
  const { id } = Route.useParams();
  const [platform, setPlatform] = useState<Platform>("blooket");
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-set", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_sets").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const questions = (data?.questions as unknown as Question[]) ?? [];
  const text = useMemo(() => formatFor(platform, questions), [platform, questions]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`Copied ${PLATFORM_LABELS[platform]} — paste into a spreadsheet`);
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const ext = downloadForPlatform(platform, questions, data?.title ?? "questions");
    toast.success(`Downloaded ${PLATFORM_LABELS[platform]} .${ext}`);
  };

  if (isLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-10">Not found. <Link to="/history" className="text-primary underline">Back to history</Link></div>;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link to="/generate" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> New generation
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">{data.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {questions.length} verified questions · ready to export
        </p>
      </motion.div>

      <div className="panel mt-8 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[220px]">
            <label className="mb-2 block text-sm font-medium">Target platform</label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="blooket">Blooket</SelectItem>
                <SelectItem value="gimkit">Gimkit</SelectItem>
                <SelectItem value="gimkit2">Gimkit 2</SelectItem>
                <SelectItem value="kahoot">Kahoot</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={copy}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="secondary" onClick={download}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button variant="secondary" onClick={() => setPlaying(true)}>
              <Play className="mr-2 h-4 w-4" /> Play
            </Button>
          </div>
        </div>

        <p className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">Format</p>
        <p className="mt-1 text-sm text-muted-foreground">{PLATFORM_HEADERS[platform]}</p>

        <pre className="mt-4 max-h-[560px] overflow-auto rounded-xl border border-border bg-secondary/40 p-4 text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
{text}
        </pre>
      </div>

      <AnimatePresence>
        {playing && <QuizGame questions={questions} onClose={() => setPlaying(false)} title={data.title} />}
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/history" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <History className="h-4 w-4" /> View all history
        </Link>
      </div>
    </div>
  );
}
