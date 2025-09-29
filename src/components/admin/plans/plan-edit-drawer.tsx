"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { 
  AlertTriangle, 
  Save, 
  Package, 
  CreditCard, 
  FileText, 
  Sparkles,
  MousePointer,
  Settings,
  DollarSign,
  Hash,
  Globe,
  Link2,
  CheckCircle2,
  XCircle
} from "lucide-react";
import type { ClerkPlan } from "@/hooks/use-admin-plans";
import { DrawerSection, InfoBox, FieldGroup } from "./drawer-sections";
import { FeatureEditor } from "./feature-editor";

type BillingPlan = {
  planId?: string;
  clerkId?: string | null;
  billingSource?: 'clerk' | 'manual';
  name: string;
  credits: number;
  active?: boolean;
  clerkName?: string | null;
  currency?: string | null;
  priceMonthlyCents?: number | null;
  priceYearlyCents?: number | null;
  description?: string | null;
  features?: PlanFeatureForm[];
  badge?: string | null;
  highlight?: boolean;
  ctaType?: 'checkout' | 'contact';
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  isNew?: boolean;
}

type PlanFeatureForm = {
  id: string;
  name: string;
  description: string;
  included: boolean;
}

interface PlanEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  plan: BillingPlan | null;
  clerkPlanDetails?: ClerkPlan;
  onSave: (plan: BillingPlan) => void;
  isSaving?: boolean;
}

const generateFeatureId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const formatPriceInput = (value: number | null | undefined) => {
  if (value == null) return ''
  return (value / 100).toString()
}

const parsePriceInput = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number.parseFloat(trimmed.replace(',', '.'))
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.round(numeric * 100))
}



export function PlanEditDrawer({ 
  isOpen, 
  onClose, 
  plan, 
  clerkPlanDetails, 
  onSave, 
  isSaving = false 
}: PlanEditDrawerProps) {
  const [editedPlan, setEditedPlan] = useState<BillingPlan | null>(plan);

  // Reset edited plan when plan changes
  React.useEffect(() => {
    if (plan) {
      setEditedPlan({
        ...plan,
        features: plan.features ? plan.features.map(f => ({ ...f })) : []
      });
    }
  }, [plan]);

  if (!editedPlan) return null;

  const isClerkPlan = (editedPlan.billingSource ?? 'clerk') === 'clerk';
  const currencyDisplay = editedPlan.currency ? editedPlan.currency.toUpperCase() : '';
  const monthlyInput = formatPriceInput(editedPlan.priceMonthlyCents);
  const yearlyInput = formatPriceInput(editedPlan.priceYearlyCents);
  const ctaValue = editedPlan.ctaType ?? (isClerkPlan ? 'checkout' : 'contact');

  const hasNameError = !editedPlan.name || !editedPlan.name.trim();
  const hasCreditsError = !Number.isFinite(editedPlan.credits) || editedPlan.credits < 0;
  const hasCtaUrlError = ctaValue === 'contact' && !editedPlan.ctaUrl?.trim();

  const patchPlan = (patch: Partial<BillingPlan> | ((current: BillingPlan) => BillingPlan)) => {
    setEditedPlan(prev => {
      if (!prev) return null;
      return typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
    });
  };

  const addPlanFeature = () => {
    setEditedPlan(prev => {
      if (!prev) return null;
      const nextFeatures = [...(prev.features ?? []), {
        id: generateFeatureId(),
        name: '',
        description: '',
        included: true,
      }];
      return {
        ...prev,
        features: nextFeatures,
      };
    });
  };

  const updatePlanFeature = (featureId: string, patch: Partial<PlanFeatureForm>) => {
    setEditedPlan(prev => {
      if (!prev || !prev.features) return prev;
      const nextFeatures = prev.features.map(feature =>
        feature.id === featureId ? { ...feature, ...patch } : feature
      );
      return {
        ...prev,
        features: nextFeatures,
      };
    });
  };

  const removePlanFeature = (featureId: string) => {
    setEditedPlan(prev => {
      if (!prev || !prev.features) return prev;
      const nextFeatures = prev.features.filter(feature => feature.id !== featureId);
      return {
        ...prev,
        features: nextFeatures,
      };
    });
  };

  const handleSave = () => {
    if (hasNameError || hasCreditsError || hasCtaUrlError) return;
    onSave(editedPlan);
  };

  const featuresPreview = clerkPlanDetails?.features?.slice(0, 3)?.filter(f => f?.name || f?.description) ?? [];
  const hasMoreFeatures = (clerkPlanDetails?.features?.length || 0) > featuresPreview.length;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[600px] sm:w-[800px] p-0 flex flex-col h-screen max-h-screen">
        <SheetHeader className="px-6 py-6 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-xl">
                {editedPlan.isNew ? 'Criar Novo Plano' : editedPlan.name}
              </SheetTitle>
              <SheetDescription>
                {editedPlan.isNew 
                  ? 'Configure um novo plano de assinatura' 
                  : 'Edite as configurações do plano'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 space-y-8">
            {/* Plan Source */}
            <DrawerSection 
              title="Origem do Plano"
              icon={<Settings className="h-4 w-4" />}
              helpText={isClerkPlan 
                ? "Este plano está sincronizado com o Clerk e alguns campos não podem ser editados" 
                : "Plano manual permite configuração completa de todos os campos"}
            >
              <div className="flex items-center flex-wrap gap-3">
                <Badge 
                  variant={isClerkPlan ? 'default' : 'secondary'}
                  className="gap-1.5"
                >
                  {isClerkPlan ? (
                    <><CheckCircle2 className="h-3 w-3" /> Sincronizado com Clerk</>
                  ) : (
                    <><XCircle className="h-3 w-3" /> Plano Manual</>
                  )}
                </Badge>
                {isClerkPlan && editedPlan.clerkId && (
                  <code className="text-xs font-mono bg-muted px-2.5 py-1 rounded-md">
                    ID: {editedPlan.clerkId}
                  </code>
                )}
              </div>
              <InfoBox variant={isClerkPlan ? "default" : "warning"}>
                {isClerkPlan
                  ? 'Preços e alguns metadados são gerenciados pelo Clerk Dashboard.'
                  : 'Configure todos os campos manualmente. Ideal para ofertas personalizadas.'}
              </InfoBox>
            </DrawerSection>

            {/* Basic Information */}
            <DrawerSection 
              title="Informações Básicas"
              icon={<FileText className="h-4 w-4" />}
              description="Defina o nome e os créditos mensais do plano"
            >
              <FieldGroup className="grid-cols-1 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plan-name" className="flex items-center gap-1">
                    Nome do Plano
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="plan-name"
                    value={editedPlan.name}
                    onChange={(e) => patchPlan({ name: e.target.value })}
                    placeholder="Ex.: Professional"
                    className={hasNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {hasNameError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Campo obrigatório
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-credits" className="flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    Créditos Mensais
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="plan-credits"
                    type="number"
                    min={0}
                    value={String(editedPlan.credits)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      patchPlan({ credits: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0 });
                    }}
                    className={hasCreditsError ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {hasCreditsError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Deve ser ≥ 0
                    </p>
                  )}
                </div>
              </FieldGroup>
            </DrawerSection>

            {/* Pricing */}
            <DrawerSection 
              title="Configuração de Preços"
              icon={<DollarSign className="h-4 w-4" />}
              description={isClerkPlan ? "Preços sincronizados do Clerk" : "Configure os valores do plano"}
            >
              {isClerkPlan ? (
                <div className="space-y-3">
                  <FieldGroup className="grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Moeda</Label>
                      <Input disabled className="bg-muted font-mono" value={currencyDisplay || '—'} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Preço Mensal</Label>
                      <Input 
                        disabled 
                        className="bg-muted font-mono" 
                        value={editedPlan.priceMonthlyCents != null ? `${currencyDisplay} ${(editedPlan.priceMonthlyCents/100).toFixed(2)}` : '—'} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Preço Anual</Label>
                      <Input 
                        disabled 
                        className="bg-muted font-mono" 
                        value={editedPlan.priceYearlyCents != null ? `${currencyDisplay} ${(editedPlan.priceYearlyCents/100).toFixed(2)}` : '—'} 
                      />
                    </div>
                  </FieldGroup>
                  <InfoBox>
                    Preços gerenciados pelo Clerk Dashboard. Para alterar, acesse o painel do Clerk.
                  </InfoBox>
                </div>
              ) : (
                <div className="space-y-3">
                  <FieldGroup className="grid-cols-1 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        Moeda
                      </Label>
                      <Select
                        value={editedPlan.currency || 'usd'}
                        onValueChange={(value) => patchPlan({ currency: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="usd">USD - Dólar</SelectItem>
                          <SelectItem value="brl">BRL - Real</SelectItem>
                          <SelectItem value="eur">EUR - Euro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Preço Mensal</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          {currencyDisplay}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={monthlyInput}
                          onChange={(e) => patchPlan({ priceMonthlyCents: parsePriceInput(e.target.value) })}
                          placeholder="49.90"
                          className="pl-12"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Preço Anual</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          {currencyDisplay}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={yearlyInput}
                          onChange={(e) => patchPlan({ priceYearlyCents: parsePriceInput(e.target.value) })}
                          placeholder="499.00"
                          className="pl-12"
                        />
                      </div>
                    </div>
                  </FieldGroup>
                  <InfoBox>
                    Deixe os preços em branco para exibir apenas o botão de contato.
                  </InfoBox>
                </div>
              )}
            </DrawerSection>

          {/* Clerk Details */}
          {isClerkPlan && clerkPlanDetails && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Detalhes do Clerk</Label>
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 p-3 text-xs space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {clerkPlanDetails.publiclyVisible != null && (
                    <Badge variant={clerkPlanDetails.publiclyVisible ? 'outline' : 'secondary'}>
                      {clerkPlanDetails.publiclyVisible ? 'Público' : 'Privado'}
                    </Badge>
                  )}
                  {clerkPlanDetails.isDefault && <Badge variant="outline">Plano padrão</Badge>}
                  {clerkPlanDetails.isRecurring === false && <Badge variant="outline">Não recorrente</Badge>}
                </div>
                {featuresPreview.length > 0 && (
                  <div className="space-y-1 text-muted-foreground">
                    <p className="font-medium text-foreground">Recursos ({clerkPlanDetails.features.length})</p>
                    <ul className="list-disc space-y-1 pl-4">
                      {featuresPreview.map((feature, idx) => (
                        <li key={feature?.id ?? `feature-${idx}`}>
                          {feature?.name || feature?.slug || 'Sem nome'}
                          {feature?.description ? ` – ${feature.description}` : ''}
                        </li>
                      ))}
                    </ul>
                    {hasMoreFeatures && (
                      <p>+{(clerkPlanDetails?.features?.length || 0) - featuresPreview.length} outros</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

            {/* Description */}
            <DrawerSection 
              title="Descrição do Plano"
              icon={<FileText className="h-4 w-4" />}
              description="Texto que aparece na vitrine de preços"
            >
              <div className="space-y-2">
                <Textarea
                  id="plan-description"
                  value={editedPlan.description ?? ''}
                  onChange={(e) => patchPlan({ description: e.target.value })}
                  placeholder="Descreva os principais benefícios e diferenciais deste plano..."
                  className="min-h-[100px] resize-none"
                  maxLength={500}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Aparece na landing page e checkout</span>
                  <span>{editedPlan.description?.length || 0}/500</span>
                </div>
              </div>
            </DrawerSection>

            {/* Visual Customization */}
            <DrawerSection 
              title="Personalização Visual"
              icon={<Sparkles className="h-4 w-4" />}
              description="Destaque este plano na vitrine"
            >
              <FieldGroup className="grid-cols-1 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="plan-badge">Badge de Destaque</Label>
                  <Input
                    id="plan-badge"
                    value={editedPlan.badge ?? ''}
                    onChange={(e) => patchPlan({ badge: e.target.value })}
                    placeholder="Ex.: Mais Popular"
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editedPlan.badge ? `${20 - (editedPlan.badge?.length || 0)} caracteres restantes` : 'Opcional'}
                  </p>
                </div>
                <div className="space-y-3">
                  <Label>Opções de Destaque</Label>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                    <div className="space-y-0.5">
                      <Label htmlFor="highlight-switch" className="text-sm font-normal cursor-pointer">
                        Destacar plano
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Aplica estilo de destaque
                      </p>
                    </div>
                    <Switch
                      id="highlight-switch"
                      checked={editedPlan.highlight ?? false}
                      onCheckedChange={(checked) => patchPlan({ highlight: checked })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-sort-order">Ordem de Exibição</Label>
                  <Input
                    id="plan-sort-order"
                    type="number"
                    value={String(editedPlan.sortOrder ?? 0)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      patchPlan({ sortOrder: Number.isFinite(n) ? n : 0 });
                    }}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Número menor = aparece primeiro
                  </p>
                </div>
              </FieldGroup>
            </DrawerSection>

            {/* Features */}
            <DrawerSection 
              title="Recursos do Plano"
              icon={<Package className="h-4 w-4" />}
            >
              <FeatureEditor
                features={editedPlan.features || []}
                onAdd={addPlanFeature}
                onUpdate={updatePlanFeature}
                onRemove={removePlanFeature}
              />
            </DrawerSection>

            {/* CTA Configuration */}
            <DrawerSection 
              title="Botão de Ação (CTA)"
              icon={<MousePointer className="h-4 w-4" />}
              description="Configure como os usuários interagem com este plano"
            >
              <FieldGroup>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Tipo de Ação
                    {!isClerkPlan && <Badge variant="outline" className="ml-2 text-xs">Fixo: Contato</Badge>}
                  </Label>
                  <Select
                    value={ctaValue}
                    onValueChange={(value) => patchPlan({ ctaType: value as 'checkout' | 'contact' })}
                    disabled={!isClerkPlan}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checkout">
                        <span className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          Checkout Automático
                        </span>
                      </SelectItem>
                      <SelectItem value="contact">
                        <span className="flex items-center gap-2">
                          <Link2 className="h-4 w-4" />
                          Link de Contato
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Texto do Botão</Label>
                    <Input
                      value={editedPlan.ctaLabel ?? ''}
                      onChange={(e) => patchPlan({ ctaLabel: e.target.value })}
                      placeholder={ctaValue === 'checkout' ? 'Assinar Agora' : 'Fale Conosco'}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                      URL de Contato
                      {ctaValue === 'contact' && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      value={editedPlan.ctaUrl ?? ''}
                      onChange={(e) => patchPlan({ ctaUrl: e.target.value })}
                      placeholder="https://exemplo.com/contato"
                      disabled={ctaValue !== 'contact'}
                      className={hasCtaUrlError ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {hasCtaUrlError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        URL obrigatória para modo contato
                      </p>
                    )}
                  </div>
                </div>

                {ctaValue === 'contact' && (
                  <InfoBox variant="warning">
                    No modo contato, os usuários serão redirecionados para a URL especificada ao invés do checkout.
                  </InfoBox>
                )}
              </FieldGroup>
            </DrawerSection>

            {/* Status */}
            <DrawerSection 
              title="Status do Plano"
              icon={<Settings className="h-4 w-4" />}
            >
              <div className="flex items-center justify-between p-4 rounded-lg border bg-background">
                <div className="space-y-0.5">
                  <Label htmlFor="status-switch" className="text-base font-normal cursor-pointer">
                    Plano Ativo
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {editedPlan.active 
                      ? 'Este plano está visível na vitrine' 
                      : 'Este plano está oculto da vitrine'}
                  </p>
                </div>
                <Switch
                  id="status-switch"
                  checked={editedPlan.active ?? true}
                  onCheckedChange={(checked) => patchPlan({ active: checked })}
                />
              </div>
            </DrawerSection>
          </div>
        </ScrollArea>

        <div className="border-t bg-background shrink-0">
          <SheetFooter className="px-6 py-4">
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-muted-foreground">
                {hasNameError || hasCreditsError || hasCtaUrlError ? (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Corrija os erros antes de salvar
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Pronto para salvar
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving || hasNameError || hasCreditsError || hasCtaUrlError}
                  className="min-w-[120px]"
                >
                  {isSaving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
