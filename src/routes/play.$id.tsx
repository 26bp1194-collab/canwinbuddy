import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Play, Sparkles } from "lucide-react";

import { getSharedQuiz } from "@/lib/share.functions";
import type { Question } from "@/lib/ai.functions";
import { QuizGame } from "@/components/quiz-game";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/play/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Play a Shared Quiz — CanWinBuddy" },
      { name: "description", content: "Play a quiz someone shared with you. No account, no sign-up — just answer the questions and see your score." },
      { property: "og:title", content: "Play a Shared Quiz — CanWinBuddy" },
      { property: "og:description", content: "A shared CanWinBuddy quiz — play instantly, no account needed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: `/play/${params.id}` },
    ],
    links: [{ rel: "canonical", href: `/play/${params.id}` }],
  }),
  component: PlaySharedPage,
});

function PlaySharedPage() {
  const { id } = Route.useParams();
  const [playing, setPlaying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["share", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_shared_quiz", { share_id: id })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Quiz not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This share link is invalid or has been removed.</p>
        <Button asChild className="mt-6"><Link to="/">Go to CanWinBuddy</Link></Button>
      </div>
    );
  }

  const questions = (data.questions as unknown as Question[]) ?? [];

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="glow-ring mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Sparkles className="h-6 w-6" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{data.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {questions.length} questions · shared with you, no account needed
      </p>
      <Button size="lg" className="mt-6" onClick={() => setPlaying(true)}>
        <Play className="mr-2 h-4 w-4" /> Play quiz
      </Button>
      <Link to="/" className="mt-6 text-xs text-muted-foreground underline hover:text-foreground">
        Make your own quizzes with CanWinBuddy
      </Link>

      <AnimatePresence>
        {playing && <QuizGame guest questions={questions} title={data.title} onClose={() => setPlaying(false)} />}
      </AnimatePresence>
    </div>
  );
}
