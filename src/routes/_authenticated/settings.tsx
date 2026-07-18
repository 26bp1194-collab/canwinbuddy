import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Moon, Sun, LogOut, User } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — CanWinBuddy" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/auth" });
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your account and appearance.</p>
      </motion.div>

      <div className="mt-8 space-y-5">
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><User className="h-4 w-4 text-primary" /> Account</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-border pb-3">
              <span className="text-muted-foreground">Username</span>
              <span className="font-medium">{user?.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs text-muted-foreground">{user?.id.slice(0, 12)}…</span>
            </div>
          </div>
          <Button variant="secondary" onClick={handleSignOut} className="mt-5">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </section>

        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {theme === "dark" ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />}
            Appearance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose your preferred theme.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ThemeOption active={theme === "dark"} onClick={() => setTheme("dark")} label="Dark" icon={<Moon className="h-4 w-4" />} />
            <ThemeOption active={theme === "light"} onClick={() => setTheme("light")} label="Light" icon={<Sun className="h-4 w-4" />} />
          </div>
        </section>
      </div>
    </div>
  );
}

function ThemeOption({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-medium transition-colors " +
        (active ? "border-primary/60 bg-accent" : "border-border bg-secondary/50 hover:border-border hover:bg-accent/60")
      }
    >
      {icon}
      <span>{label}</span>
      {active && <span className="ml-auto text-xs text-primary">Active</span>}
    </button>
  );
}
