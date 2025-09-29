import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Info, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DrawerSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  helpText?: string;
}

export function DrawerSection({ 
  title, 
  description, 
  children, 
  className,
  icon,
  helpText 
}: DrawerSectionProps) {
  return (
    <div className={cn("space-y-4 pb-8 border-b border-border/50 last:border-0", className)}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="text-base font-semibold leading-none tracking-tight">
            {title}
          </h3>
          {helpText && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">{helpText}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

interface InfoBoxProps {
  children: ReactNode;
  variant?: 'default' | 'warning' | 'success';
  className?: string;
}

export function InfoBox({ children, variant = 'default', className }: InfoBoxProps) {
  const variants = {
    default: "border-border bg-muted/30 text-muted-foreground",
    warning: "border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200",
    success: "border-green-300/60 bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-200",
  };

  return (
    <div className={cn(
      "rounded-lg border border-dashed p-3 text-xs flex items-start gap-2",
      variants[variant],
      className
    )}>
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="space-y-1 flex-1">{children}</div>
    </div>
  );
}

interface FieldGroupProps {
  children: ReactNode;
  className?: string;
}

export function FieldGroup({ children, className }: FieldGroupProps) {
  return (
    <div className={cn("grid gap-4", className)}>
      {children}
    </div>
  );
}
