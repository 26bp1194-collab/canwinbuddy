import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, FileQuestion, MoreVertical, FolderPlus, Folder, Play, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QuizGame } from "@/components/quiz-game";
import type { Question } from "@/lib/ai.functions";
import { useT } from "@/lib/i18n";
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

type Row = { id: string; title: string; question_count: number; created_at: string };

function HistoryPage() {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [assignFor, setAssignFor] = useState<Row | null>(null);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [playing, setPlaying] = useState<{ title: string; questions: Question[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  const { data, isLoading } = useQuery({
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

  const { data: groups } = useQuery({
    queryKey: ["groups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_groups")
        .select("id, name, created_at")
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
      const { error } = await supabase.from("quiz_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group-items"] });
      toast.success(t("Group deleted"));
    },
  });

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

  const idsInGroup = (groupId: string) =>
    (items ?? []).filter((i) => i.group_id === groupId).map((i) => i.quiz_set_id);

  const playGroup = async (groupId: string, name: string) => {
    const ids = idsInGroup(groupId);
    if (!ids.length) {
      toast.error(t("Add quizzes to this group first."));
      return;
    }
    setLoadingPlay(true);
    try {
      const { data: sets, error } = await supabase.from("quiz_sets").select("questions").in("id", ids);
      if (error) throw error;
      const all = (sets ?? []).flatMap((s) => (s.questions as unknown as Question[]) ?? []);
      if (!all.length) {
        toast.error(t("No questions in this group yet."));
        return;
      }
      setPlaying({ title: name, questions: all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start group quiz");
    } finally {
      setLoadingPlay(false);
    }
  };

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

      {!!groups?.length && (
        <div className="mt-6 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("Groups")}</p>
          {groups.map((g) => {
            const ids = idsInGroup(g.id);
            return (
              <Link
                key={g.id}
                to="/group/$id"
                params={{ id: g.id }}
                className="panel flex items-center gap-2 p-4 transition-colors hover:bg-accent/40"
              >
                <Folder className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{ids.length} {t("quizzes")}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}


      <div className="mt-8">
        {isLoading ? (
          <div className="panel p-8 text-center text-muted-foreground">{t("Loading…")}</div>
        ) : !data?.length ? (
          <div className="panel p-12 text-center">
            <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">{t("No history yet")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("Generate your first quiz to see it here.")}</p>
            <Button asChild className="mt-4"><Link to="/generate">{t("Generate now")}</Link></Button>
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
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 sm:p-5">
                  <Link to="/export/$id" params={{ id: row.id }} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.question_count} {t("questions")} · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </p>
                  </Link>
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
                      <DropdownMenuItem className="text-destructive" onSelect={() => del.mutate(row.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> {t("Delete")}
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

      <AnimatePresence>
        {playing && <QuizGame questions={playing.questions} title={playing.title} onClose={() => setPlaying(null)} />}
      </AnimatePresence>
    </div>
  );
}
