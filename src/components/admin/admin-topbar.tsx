"use client";

import { UserButton } from "@clerk/nextjs";
import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export function AdminTopbar() {
  return (
    <div className="h-16 bg-background/70 backdrop-blur border-b border-border px-4 md:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1">
        <SidebarTrigger />

        {/* Search Button */}
        <Button
          variant="outline"
          className="relative h-9 w-full max-w-sm justify-start text-sm text-muted-foreground sm:pr-12"
          onClick={() => {
            const event = new KeyboardEvent('keydown', {
              key: 'k',
              metaKey: true,
              bubbles: true,
            });
            document.dispatchEvent(event);
          }}
        >
          <Search className="mr-2 h-4 w-4" />
          <span>Buscar...</span>
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">Admin</p>
            <p className="text-xs text-muted-foreground">Super Administrator</p>
          </div>
          <UserButton />
        </div>
      </div>
    </div>
  );
}
