"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePageMetadata } from "@/contexts/page-metadata";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  className?: string;
}

export function PageHeader({ className }: PageHeaderProps) {
  const pathname = usePathname();
  const { metadata } = usePageMetadata();
  
  // Gerar breadcrumbs automaticamente se não forem fornecidos
  const generateAutoBreadcrumbs = (): BreadcrumbItem[] => {
    const segments = pathname.split("/").filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [
      { label: "Início", href: "/dashboard" }
    ];
    
    segments.forEach((segment, index) => {
      if (segment === "dashboard" && index === 0) return;
      
      const href = `/${segments.slice(0, index + 1).join("/")}`;
      const label = segment
        .split("-")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      
      breadcrumbs.push({ label, href });
    });
    
    return breadcrumbs;
  };
  
  const breadcrumbs = metadata.breadcrumbs || generateAutoBreadcrumbs();
  const showBreadcrumbs = metadata.showBreadcrumbs !== false;
  
  // Se não houver título e descrição, não renderizar nada
  if (!metadata.title && !metadata.description && !showBreadcrumbs) {
    return null;
  }
  
  return (
    <div className={cn("space-y-4 mb-6", className)}>
      {/* Breadcrumbs */}
      {showBreadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center space-x-1 text-sm text-muted-foreground">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            
            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <ChevronRight className="h-4 w-4" />}
                {isLast || !item.href ? (
                  <span className="text-foreground font-medium">{item.label}</span>
                ) : (
                  <Link href={item.href} className="hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}
      
      {/* Título e Descrição */}
      {(metadata.title || metadata.description) && (
        <div>
          {metadata.title && (
            <h1 className="text-3xl font-bold">{metadata.title}</h1>
          )}
          {metadata.description && (
            <p className="text-muted-foreground mt-2">{metadata.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}
