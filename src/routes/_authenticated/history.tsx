import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, FileQuestion, MoreVertical, FolderPlus, Folder, ChevronRight, Star, Pencil, Play, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Question } from "@/lib/ai.functions";
import { QuizGame } from "@/components/quiz-game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";



import { useT } from "@/lib/i18n";
import { useQuickDelete } from "@/lib/prefs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Quiz History — CanWinBuddy" },
      { name: "description", content: "Browse every quiz set you've generated. Group them into study folders, reopen a set to play, copy, or export it." },
      { property: "og:title", content: "Quiz History — CanWinBuddy" },
      { property: "og:description", content: "Every quiz set you've generated, grouped and ready to reopen." },
      { property: "og:url", content: "/history" },
    ],
    links: [{ rel: "canonical", href: "/history" }],
  }),
  component: HistoryPage,
});

type Row = { id: string; title: string; question_count: number; created_at: string; is_favorite: boolean };

type SortKey = "default" | "newest" | "oldest" | "az" | "za" | "most" | "least";
type CategoryKey = "all" | "groups" | "quizzes" | "favourites";

function HistoryPage() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [assignFor, setAssignFor] = useState<Row | null>(null);
  const [renameFor, setRenameFor] = useState<{ id: string; name: string } | null>(null);
  const [addQuizFor, setAddQuizFor] = useState<{ id: string; name: string } | null>(null);
  const [playAll, setPlayAll] = useState<{ name: string; questions: Question[] } | null>(null);
  const [sort, setSort] = useState<SortKey>("default");
  const [category, setCategory] = useState<CategoryKey>("all");
  const quick = useQuickDelete();
  /* id currently showing "Are you sure?" (quizzes and groups share the id space) */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const timer = window.setTimeout(() => setConfirmId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [confirmId]);




  const { data, isLoading } = useQuery({
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


  const { data: groups } = useQuery({
    queryKey: ["groups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_groups")
        .select("id, name, created_at, is_favorite")
        .order("is_favorite", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
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

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quiz_sets").delete().eq("id", id);
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

  const createGroup = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("quiz_groups").insert({ user_id: user!.id, name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      setNewGroupOpen(false);
      setGroupName("");
      toast.success(t("Group created"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create group"),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("quiz_group_items").delete().eq("group_id", id);
      const { error } = await supabase.from("quiz_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group-items"] });
      toast.success(t("Group deleted"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete group"),
  });

  const renameGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("quiz_groups").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      setRenameFor(null);
      toast.success(t("Group renamed"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not rename group"),
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("quiz_groups").update({ is_favorite: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update group"),
  });

  const startPlayAll = async (group: { id: string; name: string }) => {
    const ids = idsInGroup(group.id);
    if (!ids.length) {
      toast.error(t("This group has no quizzes yet."));
      return;
    }
    const { data: sets, error } = await supabase.from("quiz_sets").select("questions").in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    const questions = (sets ?? []).flatMap((s) => (s.questions as unknown as Question[]) ?? []);
    if (!questions.length) {
      toast.error(t("This group has no questions yet."));
      return;
    }
    setPlayAll({ name: group.name, questions });
  };


  const toggleMembership = useMutation({
    mutationFn: async ({ groupId, quizId, member }: { groupId: string; quizId: string; member: boolean }) => {
      if (member) {
        const { error } = await supabase
          .from("quiz_group_items")
          .delete()
          .eq("group_id", groupId)
          .eq("quiz_set_id", quizId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quiz_group_items")
          .insert({ group_id: groupId, quiz_set_id: quizId, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-items"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update group"),
  });

  const toggleQuizFavorite = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("quiz_sets").update({ is_favorite: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["history"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update quiz"),
  });

  const idsInGroup = (groupId: string) =>
    (items ?? []).filter((i) => i.group_id === groupId).map((i) => i.quiz_set_id);

  /* Quizzes that live in a group only show up inside that group */
  const grouped = new Set((items ?? []).map((i) => i.quiz_set_id));
  const ungrouped = (data ?? []).filter((r) => !grouped.has(r.id));

  const countById = new Map((data ?? []).map((r) => [r.id, r.question_count]));
  const groupQuestionCount = (groupId: string) =>
    idsInGroup(groupId).reduce((sum, id) => sum + (countById.get(id) ?? 0), 0);

  type Sortable = { name: string; created_at: string; is_favorite: boolean; count: number };
  const applySort = <T,>(list: T[], pick: (item: T) => Sortable): T[] => {
    const arr = [...list];
    const time = (v: string) => new Date(v).getTime();
    arr.sort((a, b) => {
      const x = pick(a);
      const y = pick(b);
      switch (sort) {
        case "newest":
          return time(y.created_at) - time(x.created_at);
        case "oldest":
          return time(x.created_at) - time(y.created_at);
        case "az":
          return x.name.localeCompare(y.name);
        case "za":
          return y.name.localeCompare(x.name);
        case "most":
          return y.count - x.count;
        case "least":
          return x.count - y.count;
        default:
          if (x.is_favorite !== y.is_favorite) return x.is_favorite ? -1 : 1;
          return time(y.created_at) - time(x.created_at);
      }
    });
    return arr;
  };

  const visibleGroups = applySort(
    (groups ?? []).filter((g) => (category === "favourites" ? g.is_favorite : category === "all" || category === "groups")),
    (g) => ({ name: g.name, created_at: g.created_at, is_favorite: g.is_favorite, count: groupQuestionCount(g.id) }),
  );

  const visibleQuizzes = applySort(
    ungrouped.filter((r) => (category === "favourites" ? r.is_favorite : category === "all" || category === "quizzes")),
    (r) => ({ name: r.title, created_at: r.created_at, is_favorite: r.is_favorite, count: r.question_count }),
  );

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
    { value: "groups", label: t("Groups") },
    { value: "quizzes", label: t("Quizzes") },
    { value: "favourites", label: t("Favourited") },
  ];




  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("History")}</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t("All your generated quiz sets. Click one to view, play, or export.")}</p>
        </div>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setNewGroupOpen(true)}>
          <FolderPlus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("Create group")}</span>
        </Button>
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


      {!!visibleGroups.length && (
        <div className="mt-6 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("Groups")}</p>
          {visibleGroups.map((g) => {

            const ids = idsInGroup(g.id);
            return (
              <div key={g.id} className="panel flex items-center gap-1 p-2 pl-4 transition-colors hover:bg-accent/40 sm:gap-2 sm:p-4">
                <Link
                  to="/group/$id"
                  params={{ id: g.id }}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2"
                >
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ids.length} {t("quizzes")}</span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={g.is_favorite ? t("Unfavourite group") : t("Favourite group")}
                  onClick={() => toggleFavorite.mutate({ id: g.id, value: !g.is_favorite })}
                >
                  <Star className={g.is_favorite ? "h-4 w-4 fill-warning text-warning" : "h-4 w-4 text-muted-foreground"} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Options for ${g.name}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="max-w-[220px] truncate">{g.name}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setRenameFor({ id: g.id, name: g.name })}>
                      <Pencil className="mr-2 h-4 w-4" /> {t("Change name")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAddQuizFor({ id: g.id, name: g.name })}>
                      <Plus className="mr-2 h-4 w-4" /> {t("Add quiz")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void startPlayAll(g)}>
                      <Play className="mr-2 h-4 w-4" /> {t("Play all")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={(e) => {
                        if (quick.group) return void deleteGroup.mutate(g.id);
                        if (confirmId === g.id) {
                          setConfirmId(null);
                          return void deleteGroup.mutate(g.id);
                        }
                        e.preventDefault();
                        setConfirmId(g.id);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {confirmId === g.id && !quick.group ? t("Are you sure?") : t("Delete group")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}

        </div>
      )}


      <div className="mt-8">
        {isLoading ? (
          <div className="panel p-8 text-center text-muted-foreground">{t("Loading…")}</div>
        ) : !visibleQuizzes.length ? (
          <div className="panel p-12 text-center">
            <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">
              {category !== "all" && data?.length
                ? t("Nothing matches this filter.")
                : data?.length
                  ? t("Every quiz is already in a group.")
                  : t("No history yet")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t("Generate your first quiz to see it here.")}</p>
            <Button asChild className="mt-4"><Link to="/generate">{t("Generate now")}</Link></Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleQuizzes.map((row) => (

              <motion.li
                key={row.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
                className="panel"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 p-2 pl-4 sm:gap-2 sm:p-4 sm:pl-5">
                  <Link to="/export/$id" params={{ id: row.id }} search={{ from: "history" }} className="min-w-0 flex-1 py-2">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.question_count} {t("questions")} · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={row.is_favorite ? t("Unfavourite quiz") : t("Favourite quiz")}
                    onClick={() => toggleQuizFavorite.mutate({ id: row.id, value: !row.is_favorite })}
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
                      <DropdownMenuLabel>{row.title}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setAssignFor(row)}>
                        <Folder className="mr-2 h-4 w-4" /> {t("Add to group")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setAssignFor(row); setNewGroupOpen(true); }}>
                        <FolderPlus className="mr-2 h-4 w-4" /> {t("Create group")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={(e) => {
                          if (quick.quiz) return void del.mutate(row.id);
                          if (confirmId === row.id) {
                            setConfirmId(null);
                            return void del.mutate(row.id);
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

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("Create group")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">{t("Group related quizzes together for organised studying.")}</DialogDescription>
          </DialogHeader>
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && groupName.trim() && createGroup.mutate(groupName.trim())}
            placeholder={t("e.g. Biology unit 3")}
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setNewGroupOpen(false)}>{t("Cancel")}</Button>
            <Button disabled={!groupName.trim() || createGroup.isPending} onClick={() => createGroup.mutate(groupName.trim())}>
              {t("Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignFor && !newGroupOpen} onOpenChange={(v) => !v && setAssignFor(null)}>
        <DialogContent className="max-h-[80vh] w-[calc(100vw-1.5rem)] max-w-sm overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("Add to group")}</DialogTitle>
            <DialogDescription className="break-words text-xs sm:text-sm">{assignFor?.title}</DialogDescription>
          </DialogHeader>
          {!groups?.length ? (
            <p className="text-sm text-muted-foreground">{t("You have no groups yet. Create one first.")}</p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const member = idsInGroup(g.id).includes(assignFor?.id ?? "");
                return (
                  <div key={g.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`g-${g.id}`}
                      checked={member}
                      onCheckedChange={() =>
                        assignFor && toggleMembership.mutate({ groupId: g.id, quizId: assignFor.id, member })
                      }
                    />
                    <Label htmlFor={`g-${g.id}`} className="cursor-pointer truncate text-sm font-medium">{g.name}</Label>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAssignFor(null)}>{t("Done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameFor} onOpenChange={(v) => !v && setRenameFor(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("Change name")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">{t("Give this group a new name.")}</DialogDescription>
          </DialogHeader>
          <Input
            value={renameFor?.name ?? ""}
            onChange={(e) => setRenameFor((r) => (r ? { ...r, name: e.target.value } : r))}
            onKeyDown={(e) =>
              e.key === "Enter" && renameFor?.name.trim() && renameGroup.mutate({ id: renameFor.id, name: renameFor.name.trim() })
            }
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRenameFor(null)}>{t("Cancel")}</Button>
            <Button
              disabled={!renameFor?.name.trim() || renameGroup.isPending}
              onClick={() => renameFor && renameGroup.mutate({ id: renameFor.id, name: renameFor.name.trim() })}
            >
              {t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addQuizFor} onOpenChange={(v) => !v && setAddQuizFor(null)}>
        <DialogContent className="max-h-[80vh] w-[calc(100vw-1.5rem)] max-w-sm overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("Add quiz")}</DialogTitle>
            <DialogDescription className="break-words text-xs sm:text-sm">{addQuizFor?.name}</DialogDescription>
          </DialogHeader>
          {!data?.length ? (
            <p className="text-sm text-muted-foreground">{t("No history yet")}</p>
          ) : (
            <div className="space-y-3">
              {data.map((row) => {
                const member = addQuizFor ? idsInGroup(addQuizFor.id).includes(row.id) : false;
                return (
                  <div key={row.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`aq-${row.id}`}
                      checked={member}
                      onCheckedChange={() =>
                        addQuizFor && toggleMembership.mutate({ groupId: addQuizFor.id, quizId: row.id, member })
                      }
                    />
                    <Label htmlFor={`aq-${row.id}`} className="min-w-0 cursor-pointer truncate text-sm font-medium">
                      {row.title}
                    </Label>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAddQuizFor(null)}>{t("Done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {playAll && (
          <QuizGame questions={playAll.questions} title={playAll.name} onClose={() => setPlayAll(null)} />
        )}
      </AnimatePresence>


    </div>
  );
}
