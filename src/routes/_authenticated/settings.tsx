import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun, LogOut, User, ListChecks, Languages, SlidersHorizontal, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import {
  getPlanningEnabled,
  getQuizDefaults,
  getSettingsDraft,
  saveSettingsDraft,
  clearSettingsDraft,
  setPlanningEnabledValue,
  setQuizDefaults,
  DEFAULT_QUIZ_DEFAULTS,
  type QuizDefaults,
} from "@/lib/prefs";
import { APP_LANGUAGES, useI18n, useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DifficultyControls } from "@/routes/_authenticated/generate";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account Settings — CanWinBuddy" },
      { name: "description", content: "Manage your CanWinBuddy account details, app language, quiz defaults, and appearance." },
      { property: "og:title", content: "Account Settings — CanWinBuddy" },
      { property: "og:description", content: "Manage your CanWinBuddy account, language, and quiz defaults." },
      { property: "og:url", content: "/settings" },
    ],
    links: [{ rel: "canonical", href: "/settings" }],
  }),
  component: SettingsPage,
});

type Form = {
  appLanguage: string;
  theme: "dark" | "light";
  planning: boolean;
  defaults: QuizDefaults;
};

function SettingsPage() {
  const { user, username } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, translating, t } = useI18n();
  const navigate = useNavigate();

  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    const current: Form = {
      appLanguage: language,
      theme: theme === "light" ? "light" : "dark",
      planning: getPlanningEnabled(),
      defaults: getQuizDefaults(),
    };
    setSaved(current);
    const draft = getSettingsDraft<Form>();
    setForm(draft ?? current);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved);

  /* Keep unsaved edits when navigating away, and drop them once nothing changed */
  useEffect(() => {
    if (!hydrated.current || !form) return;
    if (dirty) saveSettingsDraft(form);
    else clearSettingsDraft();
  }, [form, dirty]);

  if (!form || !saved) return null;

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f!, ...p }));
  const patchDefaults = (p: Partial<QuizDefaults>) => setForm((f) => ({ ...f!, defaults: { ...f!.defaults, ...p } }));

  const save = () => {
    setQuizDefaults(form.defaults);
    setPlanningEnabledValue(form.planning);
    if (form.theme !== theme) setTheme(form.theme);
    if (form.appLanguage !== language) setLanguage(form.appLanguage);
    setSaved(form);
    clearSettingsDraft();
    toast.success(t("Settings saved"));
  };

  const cancel = () => {
    setForm(saved);
    clearSettingsDraft();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success(t("Logged out"));
    navigate({ to: "/auth" });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-40 sm:px-8 sm:py-10 md:pb-32">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("Settings")}</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t("Manage your account, language, quiz defaults, and appearance.")}</p>
      </motion.div>

      <div className="mt-8 space-y-5">
        <section className="panel p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><User className="h-4 w-4 shrink-0 text-primary" /> {t("Account")}</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] justify-between gap-3 border-b border-border pb-3">
              <span className="text-muted-foreground">{t("Username")}</span>
              <span className="truncate text-right font-medium">{username ?? "—"}</span>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] justify-between gap-3">
              <span className="text-muted-foreground">{t("User ID")}</span>
              <span className="truncate text-right font-mono text-xs text-muted-foreground">{user?.id.slice(0, 12)}…</span>
            </div>
          </div>
          <Button variant="secondary" onClick={handleSignOut} className="mt-5 w-full sm:w-auto">
            <LogOut className="mr-2 h-4 w-4" /> {t("Log out")}
          </Button>
        </section>

        <section className="panel p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Languages className="h-4 w-4 shrink-0 text-primary" /> {t("App language")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Translates the whole app interface. Your username, quiz titles, and the app name stay unchanged.")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Select value={form.appLanguage} onValueChange={(v) => patch({ appLanguage: v })}>
              <SelectTrigger className="w-full sm:w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {APP_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {translating && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
          </div>
        </section>

        <section className="panel p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" /> {t("Quiz defaults")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Used every time you start a new quiz.")}</p>

          <div className="mt-4">
            <DifficultyControls
              difficulty={form.defaults.difficulty}
              setDifficulty={(d) => patchDefaults({ difficulty: d })}
              spec={form.defaults.spec}
              setSpec={(s) => patchDefaults({ spec: s })}
              countText={String(form.defaults.count)}
              setCountText={(v) => patchDefaults({ count: Math.max(1, Math.min(100, Number(v) || 1)) })}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block">{t("Question format")}</Label>
              <Select value={form.defaults.platform} onValueChange={(v) => patchDefaults({ platform: v as QuizDefaults["platform"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blooket">Blooket</SelectItem>
                  <SelectItem value="gimkit">Gimkit</SelectItem>
                  <SelectItem value="gimkit2">Gimkit 2</SelectItem>
                  <SelectItem value="kahoot">Kahoot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">{t("Quiz language")}</Label>
              <Select value={form.defaults.language} onValueChange={(v) => patchDefaults({ language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APP_LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => patch({ defaults: DEFAULT_QUIZ_DEFAULTS })}
          >
            {t("Reset quiz defaults")}
          </Button>
        </section>

        <section className="panel p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="h-4 w-4 shrink-0 text-primary" /> {t("AI Text Helper")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Planning asks you a few quick questions before writing, so the text matches your style.")}
          </p>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-border bg-secondary/40 p-4">
            <Label htmlFor="planning" className="min-w-0 cursor-pointer text-sm font-medium">
              {t("Planning questions")}
            </Label>
            <Switch id="planning" checked={form.planning} onCheckedChange={(v) => patch({ planning: v })} className="shrink-0" />
          </div>
        </section>

        <section className="panel p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {form.theme === "dark" ? <Moon className="h-4 w-4 shrink-0 text-primary" /> : <Sun className="h-4 w-4 shrink-0 text-primary" />}
            {t("Appearance")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Choose your preferred theme.")}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ThemeOption active={form.theme === "dark"} onClick={() => patch({ theme: "dark" })} label={t("Dark")} icon={<Moon className="h-4 w-4" />} />
            <ThemeOption active={form.theme === "light"} onClick={() => patch({ theme: "light" })} label={t("Light")} icon={<Sun className="h-4 w-4" />} />
          </div>
        </section>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-0 bottom-16 z-40 px-3 md:bottom-4"
          >
            <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
              <p className="min-w-0 truncate text-sm text-muted-foreground">{t("You have unsaved changes")}</p>
              <Button variant="ghost" size="sm" onClick={cancel}>
                <X className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{t("Cancel")}</span>
              </Button>
              <Button size="sm" onClick={save}>
                <Save className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{t("Save")}</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemeOption({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      className={
        "flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition-colors sm:p-4 " +
        (active ? "border-primary/60 bg-accent" : "border-border bg-secondary/50 hover:border-border hover:bg-accent/60")
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto shrink-0 text-xs text-primary">{t("Active")}</span>}
    </button>
  );
}
