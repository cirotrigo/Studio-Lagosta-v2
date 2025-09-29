"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { PageHeader } from "@/components/app/page-header";
import { PageMetadataProvider } from "@/contexts/page-metadata";
import { useSubscription } from "@/hooks/use-subscription";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);

  // Use TanStack Query for subscription status
  const { data: subscriptionStatus, isLoading: isLoadingSubscription } = useSubscription();

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

  // Redirect to sign-in if not authenticated
  React.useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // After auth, verify subscription access. Allow billing page even without plan.
  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || isLoadingSubscription) return;

    const isActive = Boolean(subscriptionStatus?.isActive);
    // Allow access to billing and subscribe pages even without active subscription
    const allowedPaths = ['/subscribe', '/billing'];
    const isOnAllowedPath = allowedPaths.some(path => pathname.startsWith(path));

    if (!isActive && !isOnAllowedPath) {
      router.replace('/subscribe');
    }
  }, [isLoaded, isSignedIn, isLoadingSubscription, subscriptionStatus?.isActive, pathname, router]);

  // Show loading state while checking authentication
  if (!isLoaded || isLoadingSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Authenticated layout with sidebar
  return (
    <PageMetadataProvider>
      <div className="min-h-dvh w-full text-foreground">
        <div className="flex">
          <Sidebar collapsed={collapsed} onToggle={toggleCollapse} />
          <div className="flex min-h-dvh flex-1 flex-col p-4">
            <Topbar onToggleSidebar={toggleCollapse} sidebarCollapsed={collapsed} />
            <main
              className={cn(
                "container mx-auto w-full max-w-[1400px] pb-10 pt-6"
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
                <div className="glass-panel border-border/40 bg-card/30 p-6">
                  <PageHeader />
                  {children}
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </PageMetadataProvider>
  );
}
