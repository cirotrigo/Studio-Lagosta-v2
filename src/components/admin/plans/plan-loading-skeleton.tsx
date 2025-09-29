import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PlanLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 bg-muted animate-pulse rounded-md w-1/3" />
        <div className="h-4 bg-muted animate-pulse rounded-md w-1/2" />
      </div>
      <Card>
        <CardHeader>
          <div className="h-6 bg-muted animate-pulse rounded-md w-1/4" />
          <div className="h-4 bg-muted animate-pulse rounded-md w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid grid-cols-12 gap-4">
              <div className="col-span-4 h-10 bg-muted animate-pulse rounded-md" />
              <div className="col-span-4 h-10 bg-muted animate-pulse rounded-md" />
              <div className="col-span-3 h-10 bg-muted animate-pulse rounded-md" />
              <div className="col-span-1 h-10 bg-muted animate-pulse rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
