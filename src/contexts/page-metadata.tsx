"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageMetadata {
  title?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  showBreadcrumbs?: boolean;
}

interface PageMetadataContextType {
  metadata: PageMetadata;
  setMetadata: (metadata: PageMetadata) => void;
  updateMetadata: (metadata: Partial<PageMetadata>) => void;
}

const PageMetadataContext = createContext<PageMetadataContextType | undefined>(undefined);

export function PageMetadataProvider({ children }: { children: ReactNode }) {
  const [metadata, setMetadataState] = useState<PageMetadata>({
    showBreadcrumbs: true,
  });

  const setMetadata = useCallback((newMetadata: PageMetadata) => {
    setMetadataState(newMetadata);
  }, []);

  const updateMetadata = useCallback((partialMetadata: Partial<PageMetadata>) => {
    setMetadataState((prev) => ({ ...prev, ...partialMetadata }));
  }, []);

  return (
    <PageMetadataContext.Provider value={{ metadata, setMetadata, updateMetadata }}>
      {children}
    </PageMetadataContext.Provider>
  );
}

export function usePageMetadata() {
  const context = useContext(PageMetadataContext);
  if (context === undefined) {
    throw new Error("usePageMetadata must be used within a PageMetadataProvider");
  }
  return context;
}

// Hook para definir metadados da página
export function useSetPageMetadata(metadata: PageMetadata) {
  const { setMetadata } = usePageMetadata();
  
  React.useEffect(() => {
    setMetadata(metadata);
    // Dependências específicas ao invés do objeto completo para evitar loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setMetadata,
    metadata.title,
    metadata.description,
    metadata.showBreadcrumbs,
    // Para arrays, usamos JSON.stringify para comparação profunda
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(metadata.breadcrumbs)
  ]);
}
