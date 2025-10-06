"use client";

import { useUser } from "@clerk/nextjs";
import { CreditStatus } from "@/components/credits/credit-status";
import { useSetPageMetadata } from "@/contexts/page-metadata";
import { useProjects } from "@/hooks/use-project";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import Link from "next/link";
import { Building2 } from "lucide-react";

export default function DashboardPage() {
  const { user } = useUser();
  const { data: projects, isLoading } = useProjects();

  useSetPageMetadata({
    title: `Bem-vindo, ${user?.firstName || "Usuário"}!`,
    description: "Aqui está uma visão geral da sua conta",
    breadcrumbs: [
      { label: "Início" }
    ]
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <CreditStatus />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Meus Projetos</h2>
          <p className="text-sm text-muted-foreground">
            Acesso rápido aos seus projetos
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Card key={idx} className="p-4">
                <Skeleton className="h-16 w-16 rounded-lg mb-3" />
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => {
              const projectLogo = project.Logo?.[0];

              return (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="p-4 hover:bg-accent/50 transition-colors cursor-pointer border border-border/40 bg-card/70 h-full">
                    <div className="flex items-start gap-3">
                      <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        {projectLogo ? (
                          <Image
                            src={projectLogo.fileUrl}
                            alt={project.name}
                            fill
                            className="object-contain"
                          />
                        ) : (
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate" title={project.name}>
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {project.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {project._count && (
                            <>
                              <span>{project._count.Template} templates</span>
                              <span>•</span>
                              <span>{project._count.Generation} criativos</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p>Nenhum projeto encontrado.</p>
            <p className="mt-1">Crie seu primeiro projeto para começar!</p>
          </Card>
        )}
      </section>
    </div>
  );
}