import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trash2, FileQuestion } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Quiz History — CanWinBuddy" },
      { name: "description", content: "Browse every quiz set you've generated. Reopen a set to play, copy, or export it to Blooket, Gimkit, or Kahoot." },
      { property: "og:title", content: "Quiz History — CanWinBuddy" },
      { property: "og:description", content: "Every quiz set you've generated, saved and ready to reopen." },
      { property: "og:url", content: "/history" },
    ],
    links: [{ rel: "canonical", href: "/history" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_sets")
        .select("id, title, question_count, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quiz_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-bold tracking-tight">History</h1>
        <p className="mt-2 text-muted-foreground">All your generated quiz sets. Click one to view, play, or export.</p>
      </motion.div>

      <div className="mt-8">
        {isLoading ? (
          <div className="panel p-8 text-center text-muted-foreground">Loading…</div>
        ) : !data?.length ? (
          <div className="panel p-12 text-center">
            <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">No history yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Generate your first quiz to see it here.</p>
            <Button asChild className="mt-4"><Link to="/generate">Generate now</Link></Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.map((row) => (
              <motion.li
                key={row.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
                className="panel"
              >
                <div className="flex items-center justify-between gap-4 p-5">
                  <Link to="/history/$id" params={{ id: row.id }} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.question_count} questions · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => del.mutate(row.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete quiz set ${row.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
