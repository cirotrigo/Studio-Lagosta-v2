import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { PlanFeatureForm } from "./types";

interface FeatureEditorProps {
  features: PlanFeatureForm[];
  onAdd: () => void;
  onUpdate: (featureId: string, patch: Partial<PlanFeatureForm>) => void;
  onRemove: (featureId: string) => void;
}

export function FeatureEditor({ features, onAdd, onUpdate, onRemove }: FeatureEditorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Recursos em destaque</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Liste os principais benefícios deste plano
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {features.length > 0 ? (
        <div className="space-y-3">
          {features.map((feature, index) => (
            <Card key={feature.id} className="p-4 bg-background/50">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-move" />
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Input
                          value={feature.name}
                          onChange={(e) => onUpdate(feature.id, { name: e.target.value })}
                          placeholder="Ex: Suporte 24/7"
                          className="font-medium"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemove(feature.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <textarea
                      value={feature.description}
                      onChange={(e) => onUpdate(feature.id, { description: e.target.value })}
                      placeholder="Descrição opcional do recurso"
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={feature.included}
                          onCheckedChange={(checked) => onUpdate(feature.id, { included: checked })}
                        />
                        <Label className="text-xs font-normal cursor-pointer">
                          {feature.included ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <Check className="h-3 w-3" />
                              Incluído no plano
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <X className="h-3 w-3" />
                              Não incluído
                            </span>
                          )}
                        </Label>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        #{index + 1}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 border-dashed bg-muted/10">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Plus className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm font-medium">Nenhum recurso cadastrado</p>
            <p className="text-xs text-muted-foreground">
              Adicione recursos para destacar os benefícios deste plano
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
