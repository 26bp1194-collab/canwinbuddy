import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "CanWinBuddy — Quizzes and Worksheets" },
    { name: "description", content: "Create quizzes and curriculum-based worksheets from your study notes with CanWinBuddy." },
    { property: "og:title", content: "CanWinBuddy — Quizzes and Worksheets" },
    { property: "og:description", content: "Turn study notes into quizzes and worksheets with CanWinBuddy." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  return <Navigate to={session ? "/dashboard" : "/auth"} replace />;
}
