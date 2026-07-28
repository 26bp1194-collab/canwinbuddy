import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, FileQuestion, Play, Plus, Trash2, FolderX } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QuizGame } from "@/components/quiz-game";
import type { Question } from "@/lib/ai.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/group/$id")({
  head: () => ({
    meta: [
      { title: "Study Group — CanWinBuddy" },
      { name: "description", content: "Open a study group to see every quiz inside it, add more quizzes, or play them all together as one run." },
      { property: "og:title", content: "Study Group — CanWinBuddy" },
      { property: "og:description", content: "All the quizzes in one study group, ready to play together." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupPage,
});

type Row = { id: string; title: string; question_count: number; created_at: string };

function GroupPage() {
  const { id } = Route.useParams();
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [playing, setPlaying] = useState<{ title: string; questions: Question[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  const { data: group } = useQuery({
    queryKey: ["group", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_groups").select("id, name").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: sets, isLoading } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_sets")
        .select("id, title, question_count, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["group-items", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_group_items").select("group_id, quiz_set_id");
      if (error) throw error;
      return data;
    },
  });

  const memberIds = (items ?? []).filter((i) => i.group_id === id).map((i) => i.quiz_set_id);
  const groupedElsewhere = new Set((items ?? []).map((i) => i.quiz_set_id));
  const rows = (sets ?? []).filter((r) => memberIds.includes(r.id));
  const available = (sets ?? []).filter((r) => !groupedElsewhere.has(r.id));

  const addMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("quiz_group_items")
        .insert(ids.map((quiz_set_id) => ({ group_id: id, quiz_set_id, user_id: user!.id })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-items"] });
      setAddOpen(false);
      setPicked([]);
      toast.success(t("Added to group"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add quizzes"),
  });

  const remove = useMutation({
    mutationFn: async (quizId: string) => {
      const { error } = await supabase
        .from("quiz_group_items")
        .delete()
        .eq("group_id", id)
        .eq("quiz_set_id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-items"] });
      toast.success(t("Removed from group"));
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("quiz_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group-items"] });
      toast.success(t("Group deleted"));
      navigate({ to: "/history" });
    },
  });

  const playAll = async () => {
    if (!rows.length) {
      toast.error(t("Add quizzes to this group first."));
      return;
    }
    setLoadingPlay(true);
    try {
      const { data, error } = await supabase.from("quiz_sets").select("questions").in("id", rows.map((r) => r.id));
      if (error) throw error;
      const all = (data ?? []).flatMap((s) => (s.questions as unknown as Question[]) ?? []);
      if (!all.length) {
        toast.error(t("No questions in this group yet."));
        return;
      }
      setPlaying({ title: group?.name ?? t("Group"), questions: all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start group quiz");
    } finally {
      setLoadingPlay(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <Link to="/history" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("History")}
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold tracking-tight sm:text-4xl">{group?.name ?? t("Group")}</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {rows.length} {t("quizzes")} · {t("Play them all together or open one on its own.")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{t("Add quiz")}</span>
          </Button>
          <Button size="sm" disabled={loadingPlay} onClick={playAll}>
            <Play className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t("Play all")}</span>
          </Button>
        </div>
      </motion.div>

      <div className="mt-8">
        {isLoading ? (
          <div className="panel p-8 text-center text-muted-foreground">{t("Loading…")}</div>
        ) : !rows.length ? (
          <div className="panel p-12 text-center">
            <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">{t("No quizzes in this group yet.")}</p>
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t("Add quiz")}
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <motion.li key={row.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="panel">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 sm:p-5">
                  <Link to="/export/$id" params={{ id: row.id }} className="min-w-0">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.question_count} {t("questions")} · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${row.title} from group`}
                    onClick={() => remove.mutate(row.id)}
                  >
                    <FolderX className="h-4 w-4" />
                  </Button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <Button variant="ghost" className="mt-6 text-destructive" onClick={() => deleteGroup.mutate()}>
        <Trash2 className="mr-2 h-4 w-4" /> {t("Delete group")}
      </Button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[80vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("Add quiz")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {t("Pick as many quizzes as you like. They move out of History and into this group.")}
            </DialogDescription>
          </DialogHeader>
          {!available.length ? (
            <p className="text-sm text-muted-foreground">{t("Every quiz is already in a group.")}</p>
          ) : (
            <div className="space-y-3">
              {available.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`add-${r.id}`}
                    checked={picked.includes(r.id)}
                    onCheckedChange={() =>
                      setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))
                    }
                  />
                  <Label htmlFor={`add-${r.id}`} className="min-w-0 cursor-pointer truncate text-sm font-medium">
                    {r.title}
                  </Label>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setAddOpen(false); setPicked([]); }}>{t("Cancel")}</Button>
            <Button disabled={!picked.length || addMany.isPending} onClick={() => addMany.mutate(picked)}>
              {t("Add")} {picked.length ? `(${picked.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {playing && <QuizGame questions={playing.questions} title={playing.title} onClose={() => setPlaying(null)} />}
      </AnimatePresence>
    </div>
  );
}
