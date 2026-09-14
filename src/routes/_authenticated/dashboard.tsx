import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sparkles, History, TrendingUp, FileQuestion, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { formatDistanceToNow } from "date-fns";
import logo from "@/assets/canwinbuddy-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Quiz Dashboard — CanWinBuddy" },
      { name: "description", content: "Overview of your quiz generation activity: total sets, questions generated, and recent quiz history." },
      { property: "og:title", content: "Your Quiz Dashboard — CanWinBuddy" },
      { property: "og:description", content: "See your quiz generation stats and jump into recent quiz sets." },
      { property: "og:url", content: "/dashboard" },
    ],
    links: [{ rel: "canonical", href: "/dashboard" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const t = useT();
  const { user, username } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_sets")
        .select("id, title, question_count, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const total = data.length;
      const totalQ = data.reduce((s, r) => s + (r.question_count ?? 0), 0);
      const last = data[0];
      return { total, totalQ, last, recent: data.slice(0, 5) };
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start gap-4"
      >
        <div className="flex shrink-0 flex-col items-center gap-1">
          <img
            src={logo.url}
            alt="CanWinBuddy logo"
            className="h-12 w-12 rounded-2xl bg-primary/10 object-cover sm:h-14 sm:w-14"
          />
          <span className="font-display text-[11px] font-semibold text-muted-foreground">CanWinBuddy</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{t("Welcome back")}, @{username}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t("Your Quiz Dashboard")}</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t("Your intelligent question workspace — ready to generate.")}</p>
        </div>
      </motion.div>


      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <StatCard icon={FileQuestion} label={t("Quiz sets created")} value={stats?.total ?? 0} />
        <StatCard icon={TrendingUp} label={t("Questions generated")} value={stats?.totalQ ?? 0} />
        <StatCard
          icon={Clock}
          label={t("Last generation")}
          value={stats?.last ? formatDistanceToNow(new Date(stats.last.created_at), { addSuffix: true }) : "—"}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <motion.div whileHover={{ y: -2 }} className="panel p-6">
          <div className="mb-3 flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="min-w-0 truncate text-lg font-semibold">{t("Generate new set")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t("Paste text, upload a doc, spreadsheet, or image. AI extracts and validates every question against the source.")}</p>
          <Button asChild className="mt-4" size="lg">
            <Link to="/generate">{t("Start generating")}</Link>
          </Button>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="panel p-6">
          <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <History className="h-5 w-5" />
              </div>
              <h2 className="min-w-0 truncate text-lg font-semibold">{t("Recent sets")}</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/history">{t("View history")}</Link>
            </Button>
          </div>
          {stats?.recent.length ? (
            <ul className="space-y-2">
              {stats.recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/export/$id"
                    params={{ id: r.id }} search={{}}
                    className="flex items-center justify-between rounded-full border border-border bg-secondary/60 px-4 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="ml-4 shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{r.question_count} {t("Qs")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("No history yet — your generations appear here.")}</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: string | number }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight">{value}</p>
    </motion.div>
  );
}
