"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SimpleTopbar() {
  return (
    <header
      className={cn(
        "pt-safe sticky top-0 z-20 w-full border-b border-border/40 bg-background/30 backdrop-blur-xl supports-[backdrop-filter]:bg-background/20 glass-panel"
      )}
      role="banner"
    >
      <div className="glow-separator w-full" aria-hidden="true" />
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            {/* Sem "Inscrever-se": o acesso é só por convite. */}
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">Entrar</Button>
            </SignInButton>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}

