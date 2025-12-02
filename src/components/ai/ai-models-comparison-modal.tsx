'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getAvailableModels } from '@/lib/ai/image-models-config'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Zap, Sparkles, Check, X } from 'lucide-react'

interface AIModelsComparisonModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AIModelsComparisonModal({ open, onOpenChange }: AIModelsComparisonModalProps) {
  const models = getAvailableModels()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-7xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Comparação de Modelos de IA
            <Badge variant="secondary" className="text-xs">
              {models.length} modelos
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Compare recursos, preços e capacidades de todos os modelos disponíveis
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-120px)] pr-4 w-full">
          <div className="space-y-6">
            {/* Tabela comparativa */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-3 font-medium min-w-[180px]">Modelo</th>
                    <th className="text-center py-3 px-3 font-medium min-w-[100px]">Custo</th>
                    <th className="text-center py-3 px-3 font-medium min-w-[90px]">Velocidade</th>
                    <th className="text-center py-3 px-3 font-medium min-w-[100px]">Resolução</th>
                    <th className="text-center py-3 px-3 font-medium min-w-[90px]">Ref. Images</th>
                    <th className="text-left py-3 px-3 font-medium min-w-[280px]">Especialidade</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {model.isRecommended && (
                            <Zap className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                          )}
                          {model.isNew && (
                            <Sparkles className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium whitespace-nowrap">{model.displayName}</div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">{model.provider}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {model.resolutions ? (
                          <div className="text-xs space-y-0.5">
                            {model.resolutions.map((res) => (
                              <div key={res} className="whitespace-nowrap">
                                {res}: {model.pricing[`resolution${res}`] ?? model.pricing.baseCredits}c
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="font-medium whitespace-nowrap">{model.pricing.baseCredits}c</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="text-xs whitespace-nowrap">~{model.capabilities.averageSpeed}s</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="text-xs">
                          {model.capabilities.supports4K ? (
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">4K</Badge>
                          ) : (
                            <span className="text-muted-foreground whitespace-nowrap">
                              {model.capabilities.maxResolution}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="font-medium whitespace-nowrap">
                          {model.capabilities.maxReferenceImages || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-xs text-muted-foreground">
                          {model.description}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards detalhados */}
            <div className="space-y-4 mt-6">
              <h3 className="font-semibold">Detalhes dos Modelos</h3>
              {models.map((model) => (
                <div key={model.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {model.isRecommended && <Zap className="h-4 w-4 text-yellow-500" />}
                        {model.isNew && <Sparkles className="h-4 w-4 text-blue-500" />}
                        <h4 className="font-semibold">{model.displayName}</h4>
                        {model.isRecommended && (
                          <Badge variant="secondary" className="text-xs">Recomendado</Badge>
                        )}
                        {model.isNew && (
                          <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-500">
                            Novo
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{model.provider}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{model.pricing.baseCredits} créditos</div>
                      <div className="text-xs text-muted-foreground">~{model.capabilities.averageSpeed}s</div>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">{model.description}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Resolução Máx.</div>
                      <div className="font-medium">{model.capabilities.maxResolution}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Ref. Images</div>
                      <div className="font-medium">
                        {model.capabilities.maxReferenceImages || 'Não suporta'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">4K</div>
                      <div className="font-medium">
                        {model.capabilities.supports4K ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Custom Dims</div>
                      <div className="font-medium">
                        {model.capabilities.supportsCustomDimensions ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Features:</div>
                    <div className="flex flex-wrap gap-1">
                      {model.features.map((feature, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recomendações */}
            <div className="space-y-3 mt-6 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-semibold">Recomendações por Caso de Uso</h3>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Para testes/experimentação:</span>
                  <span className="text-muted-foreground"> FLUX Schnell (1 crédito)</span>
                </div>
                <div>
                  <span className="font-medium">Para produção geral:</span>
                  <span className="text-muted-foreground"> FLUX 1.1 Pro (4 créditos)</span>
                </div>
                <div>
                  <span className="font-medium">Para realismo extremo:</span>
                  <span className="text-muted-foreground"> Seedream 4 (3-6 créditos)</span>
                </div>
                <div>
                  <span className="font-medium">Para texto em imagens:</span>
                  <span className="text-muted-foreground"> Ideogram v3 Turbo (3 créditos)</span>
                </div>
                <div>
                  <span className="font-medium">Para design e ilustração:</span>
                  <span className="text-muted-foreground"> Recraft V3 (4 créditos)</span>
                </div>
                <div>
                  <span className="font-medium">Para máxima qualidade:</span>
                  <span className="text-muted-foreground"> Nano Banana Pro 4K (30 créditos)</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
