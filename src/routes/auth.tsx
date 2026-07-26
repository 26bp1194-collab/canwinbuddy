import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail, USERNAME_RE } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CanWinBuddy AI Quiz Generator" },
      { name: "description", content: "Sign in or create a CanWinBuddy account to generate AI quiz questions and export them to Blooket, Gimkit, and Kahoot." },
      { property: "og:title", content: "Sign in — CanWinBuddy AI Quiz Generator" },
      { property: "og:description", content: "Access your CanWinBuddy account to generate and export validated quiz questions." },
      { property: "og:url", content: "/auth" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [session, loading, navigate]);

  if (session) return <Navigate to="/dashboard" replace />;

  const validate = () => {
    if (!USERNAME_RE.test(username)) {
      toast.error("Username must be 4+ characters, letters & numbers only, and include at least one letter.");
      return false;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return false;
    }
    return true;
  };

  const signUp = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const lower = username.toLowerCase();
      const { data: existing } = await supabase.from("profiles").select("id").eq("username_lower", lower).maybeSingle();
      if (existing) {
        toast.error("That username is already taken.");
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: usernameToEmail(username),
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { username } },
      });
      if (error) throw error;
      if (data.user) {
        const { error: profErr } = await supabase.from("profiles").insert({
          id: data.user.id,
          username,
          username_lower: lower,
        });
        if (profErr && !profErr.message.includes("duplicate")) throw profErr;
      }
      toast.success("Account created — welcome!");
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (error) throw error;
      toast.success("Signed in");
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign in failed";
      toast.error(msg.includes("Invalid") ? "Invalid username or password" : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-primary-glow/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="panel relative z-10 w-full max-w-md p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="glow-ring flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">CanWinBuddy — AI Quiz Generator</h1>
            <p className="text-xs text-muted-foreground">AI-generated quiz questions, verified.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Log in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          {(["signin", "signup"] as const).map((t) => (
            <TabsContent key={t} value={t} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="u">Username</Label>
                <Input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. quizmaster42" />
                {t === "signup" && (
                  <p className="text-xs text-muted-foreground">
                    Letters & numbers only, 4+ chars, must include a letter. Not case-sensitive for uniqueness.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="p">Password</Label>
                <div className="relative">
                  <Input
                    id="p"
                    type={showPassword ? "text" : "password"}
                    autoComplete={t === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                onClick={t === "signup" ? signUp : signIn}
                disabled={busy}
                className="w-full"
                size="lg"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t === "signup" ? "Create account" : "Log in"}
              </Button>
            </TabsContent>
          ))}
        </Tabs>

      </motion.div>
    </div>
  );
}
