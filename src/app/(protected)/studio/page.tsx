"use client";

import { useUser, useOrganization } from "@clerk/nextjs";
import { useSetPageMetadata } from "@/contexts/page-metadata";
import { useProjects } from "@/hooks/use-project";
import { useOrganizationTimeline } from "@/hooks/use-organizations";
import { useInstagramSummaries } from "@/hooks/use-instagram-analytics";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import Link from "next/link";
import { Building2, Plus, Users, Plug } from "lucide-react";
import { useMemo } from "react";
import dynamic from "next/dynamic";

// Lazy load heavy components
const UsageTrendChart = dynamic(
  () => import("@/components/organizations/usage-trend-chart").then(mod => ({ default: mod.UsageTrendChart })),
  {
    loading: () => <ChartSkeleton />,
    ssr: false
  }
);

const InstagramMiniWidget = dynamic(
  () => import("@/components/instagram/instagram-mini-widget").then(mod => ({ default: mod.InstagramMiniWidget })),
  {
    loading: () => <div className="mt-2 h-16 animate-pulse bg-muted/50 rounded" />,
    ssr: false
  }
);

function ChartSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-[300px] w-full" />
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: timelineData, isLoading: timelineLoading } =
    useOrganizationTimeline(organization?.id ?? null, { period: "30d" });

  // Buscar resumos do Instagram para todos os projetos
  const projectIds = useMemo(() => projects?.map(p => p.id) ?? [], [projects]);
  const { data: instagramData } = useInstagramSummaries(projectIds);

  const hasOrganization = Boolean(organization);

  useSetPageMetadata({
    title: "",
    description: "",
    breadcrumbs: [],
  });

  return (
    <div className="space-y-8">
      {/* Welcome Message */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Bem-vindo, {user?.firstName || "Usuário"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {hasOrganization
            ? `Você está na ${organization.name}`
            : "Você está em sua página pessoal"}
        </p>
      </div>

      {/* Projects Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Projetos</h2>
          <Button variant="default" size="sm" asChild>
            <Link href="/projects">
              <Plus className="mr-1.5 h-4 w-4" />
              Novo
            </Link>
          </Button>
        </div>

        {projectsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx} className="p-4">
                <Skeleton className="h-12 w-12 rounded-lg mb-3" />
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => {
              const instagramSummary = instagramData?.summaries?.find(
                s => s.projectId === project.id
              );
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  instagramSummary={instagramSummary}
                />
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center border-dashed">
            <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground mb-3">
              Nenhum projeto encontrado
            </p>
            <Button variant="default" size="sm" asChild>
              <Link href="/projects">
                <Plus className="mr-1.5 h-4 w-4" />
                Criar Projeto
              </Link>
            </Button>
          </Card>
        )}
      </section>

      {/* Usage Chart - Only for Organizations */}
      {hasOrganization && (
        <section>
          <h2 className="text-lg font-medium mb-4">Uso do Sistema</h2>
          <UsageTrendChart
            data={timelineData?.timeline ?? []}
            period="30d"
            isLoading={timelineLoading}
          />
        </section>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  instagramSummary,
}: {
  project: {
    id: number;
    name: string;
    description: string | null;
    Logo?: Array<{ fileUrl: string }>;
    _count?: { Template: number; Generation: number };
    laterAccountId?: string | null;
    followers?: number | null;
  };
  instagramSummary?: {
    projectId: number;
    hasInstagram: boolean;
    data: any;
  };
}) {
  const projectLogo = project.Logo?.[0];
  const hasInstagram = instagramSummary?.hasInstagram && instagramSummary?.data;

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`
    }
    return num.toString()
  }

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="group p-4 hover:bg-accent/30 hover:border-foreground/10 transition-all cursor-pointer border border-border/40 bg-card/60 h-full">
        <div className="flex items-start gap-3">
          <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted/50 flex items-center justify-center shrink-0">
            {projectLogo ? (
              <Image
                src={projectLogo.fileUrl}
                alt={project.name}
                fill
                className="object-contain"
              />
            ) : (
              <Building2 className="h-6 w-6 text-muted-foreground/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="font-medium text-sm truncate"
              title={project.name}
            >
              {project.name}
            </h3>
            {project.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {project.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {project._count && (
                <span className="text-xs text-muted-foreground">
                  {project._count.Generation} criativos
                </span>
              )}
              {project.laterAccountId && (
                <div
                  className="flex items-center justify-center"
                  title={
                    project.followers !== null && project.followers !== undefined
                      ? "Conexão Later ativa"
                      : "Conexão Later com problema"
                  }
                >
                  <Plug
                    className={`h-4 w-4 ${
                      project.followers !== null && project.followers !== undefined
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  />
                </div>
              )}
              {project.followers !== null && project.followers !== undefined && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {formatNumber(project.followers)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Instagram Mini Widget */}
        {hasInstagram && (
          <InstagramMiniWidget
            summary={instagramSummary.data}
            followers={project.followers}
          />
        )}
      </Card>
    </Link>
  );
}
