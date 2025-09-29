"use client";

import { UserButton } from "@clerk/nextjs";
 import { SidebarTrigger } from "@/components/ui/sidebar";

export function AdminTopbar() {
  return (
    <div className="h-16 bg-background/70 backdrop-blur border-b border-border px-4 md:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1">
        <SidebarTrigger />
       
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
