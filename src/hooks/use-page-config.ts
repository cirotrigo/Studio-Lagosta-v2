"use client";

import { useMemo } from "react";
import { useSetPageMetadata, PageMetadata } from "@/contexts/page-metadata";

/**
 * Hook helper para configurar metadados da página de forma mais simples
 * 
 * @example
 * // Uso básico
 * usePageConfig("Minha Página", "Descrição da página");
 * 
 * // Com breadcrumbs customizados
 * usePageConfig("Perfil", "Gerencie seu perfil", [
 *   { label: "Início", href: "/dashboard" },
 *   { label: "Perfil" }
 * ]);
 * 
 * // Com objeto completo
 * usePageConfig({
 *   title: "Dashboard",
 *   description: "Visão geral",
 *   showBreadcrumbs: false
 * });
 */
export function usePageConfig(
  titleOrConfig: string | PageMetadata,
  description?: string,
  breadcrumbs?: PageMetadata["breadcrumbs"]
) {
  // Memoizar o objeto metadata para evitar recriações desnecessárias
  const metadata = useMemo<PageMetadata>(() => {
    return typeof titleOrConfig === "string"
      ? {
          title: titleOrConfig,
          description,
          breadcrumbs,
        }
      : titleOrConfig;
  }, [titleOrConfig, description, breadcrumbs]);

  useSetPageMetadata(metadata);
}
