import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { BookOpen, Sparkles, Upload, Copy } from "lucide-react";

import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({
    meta: [
      { title: "Guide — CanWinBuddy" },
      { name: "description", content: "Learn how to generate, validate, and export quiz questions with CanWinBuddy." },
      { property: "og:title", content: "Guide — CanWinBuddy" },
      { property: "og:description", content: "Walkthroughs and tips for getting the most out of CanWinBuddy." },
      { property: "og:url", content: "/guide" },
    ],
    links: [{ rel: "canonical", href: "/guide" }],
  }),
  component: GuidePage,
});

function GuidePage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("Guide")}</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          {t("Walkthroughs, tips, and video tutorials for getting the most out of CanWinBuddy. More content is on the way.")}
        </p>
      </motion.div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Placeholder icon={Upload} title={t("1. Add a source")} body={t("Paste text or upload PDFs, docs, spreadsheets, or images.")} />
        <Placeholder icon={Sparkles} title={t("2. Generate")} body={t("Pick the amount and difficulty. AI writes and validates each question.")} />
        <Placeholder icon={Copy} title={t("3. Export")} body={t("Copy or download in Blooket, Gimkit, Gimkit 2, or Kahoot format.")} />
      </div>

      <div className="panel mt-8 p-6 text-center sm:p-8">
        <p className="text-sm font-medium">{t("Video tutorials coming soon")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("This page will grow with videos and detailed walkthroughs.")}
        </p>
      </div>
    </div>
  );
}

function Placeholder({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="panel p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
