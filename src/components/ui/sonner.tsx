"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/components/theme-provider";

// Monta o Toaster do sonner (o `toast` de 'sonner' só aparece com ele montado).
// Fica embaixo à direita: o Toaster do Radix (use-toast) ocupa o topo à direita.
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return <SonnerToaster theme={resolvedTheme} position="bottom-right" richColors closeButton />;
}
