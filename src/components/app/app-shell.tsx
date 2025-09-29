"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { PublicHeader } from "@/components/app/public-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const [collapsed, setCollapsed] = React.useState(false);

  // hydrate from localStorage
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("app.sidebarCollapsed");
    if (saved != null) setCollapsed(saved === "true");
  }, []);

  const toggleCollapse = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("app.sidebarCollapsed", String(next));
      }
      return next;
    });
  }, []);


  // Non-authenticated layout (no sidebar)
  if (!isSignedIn) {
    return (
      <div className="min-h-dvh w-full bg-background text-foreground">
        <PublicHeader />
        <main>
          {children}
        </main>
      </div>
    );
  }

  // Authenticated layout (with sidebar)
  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <div className="flex gap-2">
        {/* Desktop sidebar */}
        <Sidebar collapsed={collapsed} onToggle={toggleCollapse} />
        <div className="flex min-h-dvh flex-1 flex-col">
          <Topbar onToggleSidebar={toggleCollapse} sidebarCollapsed={collapsed} />
          <main
            className={cn(
              "container mx-auto w-full max-w-[1400px] px-4 pb-10 pt-6"
            )}
          >
            {/* layered glow behind the main content for futuristic feel */}
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-6 -z-10 rounded-2xl"
                style={{
                  background:
                    "radial-gradient(60% 40% at 10% 0%, color-mix(in oklch, var(--neon) 20%, transparent), transparent 70%), radial-gradient(50% 40% at 90% 10%, color-mix(in oklch, var(--neon-2) 18%, transparent), transparent 70%)",
                  filter: "blur(30px)",
                  opacity: 0.6,
                }}
                aria-hidden="true"
              />
              <div className="glass-panel border-border/40 bg-card/30">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
