import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "CanWinBuddy — Your Study Workspace" },
    { name: "description", content: "Create source-grounded quizzes, worksheets and study notes in your CanWinBuddy study workspace." },
    { property: "og:title", content: "CanWinBuddy — Your Study Workspace" },
    { property: "og:description", content: "Create source-grounded quizzes, worksheets and study notes in your CanWinBuddy study workspace." },
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
