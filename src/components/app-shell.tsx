import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Sparkles,
  History,
  Settings,
  BookOpen,
  ChevronLeft,
  Sun,
  Moon,
  LogOut,
  Menu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import logo from "@/assets/canwinbuddy-logo.png.asset.json";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generate", label: "Generate", icon: Sparkles },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/guide", label: "Guide", icon: BookOpen },
] as const;

// Mobile bottom bar order: guide, generate, dashboard, history, settings
const mobileNav = [
  { to: "/guide", label: "Guide", icon: BookOpen },
  { to: "/generate", label: "Generate", icon: Sparkles },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { theme, toggle } = useTheme();
  const { username } = useAuth();
  const t = useT();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <motion.aside
        animate={{ width: collapsed ? 72 : 248 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
      >

        <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-2")}>
          {!collapsed ? (
            <>
              <img
                src={logo.url}
                alt="CanWinBuddy logo"
                className="h-9 w-9 shrink-0 rounded-2xl object-cover bg-primary/10"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold">CanWinBuddy</p>
                <p className="truncate text-xs text-muted-foreground">@{username ?? "you"}</p>
              </div>
              <button
                onClick={() => setCollapsed((c) => !c)}
                aria-label="Collapse sidebar"
                className="glow-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          ) : (
            <img
              src={logo.url}
              alt="CanWinBuddy logo"
              className="h-9 w-9 rounded-2xl object-cover bg-primary/10"
            />
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-12px] shadow-primary/60"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(item.label)}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={cn("space-y-2 border-t border-sidebar-border p-3", collapsed && "px-2")}>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!collapsed && <span>{theme === "dark" ? t("Light mode") : t("Dark mode")}</span>}
          </button>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className={cn("w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground", collapsed && "justify-center")}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && t("Log out")}
          </Button>
        </div>
      </motion.aside>

      <main className="flex-1 min-w-0">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-sidebar-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {mobileNav.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={t(item.label)}
              title={t(item.label)}
              className={cn(
                "flex h-14 items-center justify-center transition-colors",
                active ? "text-primary" : "text-sidebar-foreground/60",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  active && "bg-primary text-primary-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );

}
