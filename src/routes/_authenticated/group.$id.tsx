import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, FileQuestion, Play, Plus, Trash2, FolderX, Star, MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { useQuickDelete } from "@/lib/prefs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type Row = { id: string; title: string; question_count: number; created_at: string; is_favorite: boolean };

type SortKey = "default" | "newest" | "oldest" | "az" | "za" | "most" | "least";
type CategoryKey = "all" | "favourites";

function GroupPage() {
  const { id } = Route.useParams();
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const quick = useQuickDelete();
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [playing, setPlaying] = useState<{ title: string; questions: Question[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [sort, setSort] = useState<SortKey>("default");
  const [category, setCategory] = useState<CategoryKey>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmGroup, setConfirmGroup] = useState(false);

  useEffect(() => {
    if (!confirmId) return;
    const timer = window.setTimeout(() => setConfirmId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [confirmId]);

  useEffect(() => {
    if (!confirmGroup) return;
    const timer = window.setTimeout(() => setConfirmGroup(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirmGroup]);

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
        .select("id, title, question_count, created_at, is_favorite")
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

  const time = (v: string) => new Date(v).getTime();
  const visibleRows = [...rows]
    .filter((r) => (category === "favourites" ? r.is_favorite : true))
    .sort((a, b) => {
      switch (sort) {
        case "newest":
          return time(b.created_at) - time(a.created_at);
        case "oldest":
          return time(a.created_at) - time(b.created_at);
        case "az":
          return a.title.localeCompare(b.title);
        case "za":
          return b.title.localeCompare(a.title);
        case "most":
          return b.question_count - a.question_count;
        case "least":
          return a.question_count - b.question_count;
        default:
          if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
          return time(b.created_at) - time(a.created_at);
      }
    });

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: "default", label: t("Default") },
    { value: "newest", label: t("Newest") },
    { value: "oldest", label: t("Oldest") },
    { value: "az", label: t("A–Z") },
    { value: "za", label: t("Z–A") },
    { value: "most", label: t("Most questions") },
    { value: "least", label: t("Least questions") },
  ];

  const categoryOptions: { value: CategoryKey; label: string }[] = [
    { value: "all", label: t("All") },
    { value: "favourites", label: t("Favourited") },
  ];

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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove quiz"),
  });

  const deleteQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      await supabase.from("quiz_group_items").delete().eq("quiz_set_id", quizId);
      const { error } = await supabase.from("quiz_sets").delete().eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["group-items"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(t("Deleted"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const toggleQuizFavorite = useMutation({
    mutationFn: async ({ quizId, value }: { quizId: string; value: boolean }) => {
      const { error } = await supabase.from("quiz_sets").update({ is_favorite: value }).eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["history"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update quiz"),
  });

  const deleteGroup = useMutation({
    mutationFn: async () => {
      await supabase.from("quiz_group_items").delete().eq("group_id", id);
      const { error } = await supabase.from("quiz_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group-items"] });
      toast.success(t("Group deleted"));
      navigate({ to: "/history" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete group"),
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

      <div className="mt-5 grid grid-cols-1 gap-2 sm:max-w-2xl sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">{t("Sorting")}</span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger aria-label={t("Sorting")} className="min-w-0 flex-1">
              <SelectValue placeholder={t("Sorting")} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">{t("Category")}</span>
          <Select value={category} onValueChange={(v) => setCategory(v as CategoryKey)}>
            <SelectTrigger aria-label={t("Category")} className="min-w-0 flex-1">
              <SelectValue placeholder={t("Category")} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8">
        {isLoading ? (
          <div className="panel p-8 text-center text-muted-foreground">{t("Loading…")}</div>
        ) : !visibleRows.length ? (
          <div className="panel p-12 text-center">
            <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">
              {rows.length ? t("Nothing matches this filter.") : t("No quizzes in this group yet.")}
            </p>
            {!rows.length && (
              <Button className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> {t("Add quiz")}
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleRows.map((row) => (
              <motion.li key={row.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="panel">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 p-2 pl-4 sm:gap-2 sm:p-4 sm:pl-5">
                  <Link to="/export/$id" params={{ id: row.id }} className="min-w-0 py-2">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.question_count} {t("questions")} · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={row.is_favorite ? t("Unfavourite quiz") : t("Favourite quiz")}
                    onClick={() => toggleQuizFavorite.mutate({ quizId: row.id, value: !row.is_favorite })}
                  >
                    <Star className={row.is_favorite ? "h-4 w-4 fill-warning text-warning" : "h-4 w-4 text-muted-foreground"} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Options for ${row.title}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="max-w-[220px] truncate">{row.title}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => remove.mutate(row.id)}>
                        <FolderX className="mr-2 h-4 w-4" /> {t("Remove from group")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={(e) => {
                          if (quick.quiz) return void deleteQuiz.mutate(row.id);
                          if (confirmId === row.id) {
                            setConfirmId(null);
                            return void deleteQuiz.mutate(row.id);
                          }
                          e.preventDefault();
                          setConfirmId(row.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {confirmId === row.id && !quick.quiz ? t("Are you sure?") : t("Delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <Button
        variant="ghost"
        className="mt-6 text-destructive"
        onClick={() => {
          if (quick.group || confirmGroup) {
            setConfirmGroup(false);
            deleteGroup.mutate();
          } else {
            setConfirmGroup(true);
          }
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" /> {confirmGroup && !quick.group ? t("Are you sure?") : t("Delete group")}
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
