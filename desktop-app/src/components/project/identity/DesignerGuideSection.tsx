import { CheckCircle2, LayoutGrid, Shield, SwatchBook, Type as TypeIcon } from 'lucide-react'
import type { ArtTemplate } from '@/hooks/use-art-templates'
import type { ImportedDsTemplateSummary, InstagramPreviewTokens } from '@/lib/instagram-ds/token-parser'
import { listDsTemplatesForFormat } from '@/lib/instagram-ds/template-registry'

interface DesignerGuideSectionProps {
  brandName?: string
  previewTokens: Partial<InstagramPreviewTokens>
  tokenSourceLabel: string
  createdTemplates?: ArtTemplate[]
  importedTemplates?: ImportedDsTemplateSummary[]
}

function formatCountBadge(value: number): string {
  return value > 0 ? `${value} ativo(s)` : '0 ativo(s)'
}

export default function DesignerGuideSection({
  brandName,
  previewTokens,
  tokenSourceLabel,
  createdTemplates,
  importedTemplates,
}: DesignerGuideSectionProps) {
  const created = Array.isArray(createdTemplates) ? createdTemplates : []
  const imported = Array.isArray(importedTemplates) ? importedTemplates : []

  const createdByFormat = {
    STORY: created.filter((item) => item.format === 'STORY').length,
    FEED_PORTRAIT: created.filter((item) => item.format === 'FEED_PORTRAIT').length,
    SQUARE: created.filter((item) => item.format === 'SQUARE').length,
  }

  const importedByFormat = {
    STORY: imported.filter((item) => item.format === 'STORY').length,
    FEED_PORTRAIT: imported.filter((item) => item.format === 'FEED_PORTRAIT').length,
    SQUARE: imported.filter((item) => item.format === 'SQUARE').length,
  }

  const tokens = [
    { key: 'BRAND_NAME', value: brandName || 'Projeto' },
    { key: 'BRAND_PRIMARY', value: previewTokens.primaryColor || '#f97316' },
    { key: 'BRAND_SECONDARY', value: previewTokens.secondaryColor || '#ea580c' },
    { key: 'BRAND_TEXT_COLOR', value: previewTokens.textColor || '#ffffff' },
    { key: 'BRAND_BG_COLOR', value: previewTokens.bgColor || '#09090b' },
    { key: 'BRAND_FONT_HEADING', value: previewTokens.fontHeading || 'Montserrat' },
    { key: 'BRAND_FONT_BODY', value: previewTokens.fontBody || 'Montserrat' },
    { key: 'TOKEN_SOURCE', value: tokenSourceLabel },
  ]

  const rules = [
    {
      id: 'R1',
      title: 'Lei dos 70/30',
      body: 'Texto + elementos de design devem ocupar no maximo 30% da arte. A fotografia deve manter protagonismo visual.',
    },
    {
      id: 'R2',
      title: 'Overlay com gradiente',
      body: 'Usar gradiente linear com contraste progressivo. Faixa recomendada: 30% a 45% da altura, conforme o template.',
    },
    {
      id: 'R4',
      title: 'Hierarquia tipografica',
      body: 'Title com maior peso e quebra manual de linha (<br>) para blocos harmonicos. CTA curto e direto.',
    },
    {
      id: 'R5',
      title: 'Escala da logo',
      body: 'Logo presente, mas discreta. Story: topo (centro ou alinhada). Feed: cantos opostos ao bloco principal de texto.',
    },
    {
      id: 'R6',
      title: 'Consistencia de serie',
      body: 'Manter ritmo visual entre pecas da campanha: posicao dos blocos, direcao de overlay e tom de copy.',
    },
  ]

  const templateLibrary = [
    ...listDsTemplatesForFormat('STORY'),
    ...listDsTemplatesForFormat('FEED_PORTRAIT'),
    ...listDsTemplatesForFormat('SQUARE'),
  ]

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">Master Guide do Designer</h2>
          <p className="mt-1 text-sm text-text-muted">
            Guia pratico para manter consistencia entre DS importado, templates e artes aprovadas.
          </p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
          Layout + Tokens + Checklist
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text">
            <SwatchBook size={14} className="text-primary" />
            Tokens ativos
          </div>
          <div className="space-y-1 text-[11px]">
            {tokens.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 border-b border-border/60 py-1 last:border-b-0">
                <span className="font-mono text-primary">{row.key}</span>
                <span className="truncate text-text-muted">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text">
            <LayoutGrid size={14} className="text-primary" />
            Biblioteca de templates
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="rounded border border-border bg-input px-2 py-1 text-text-muted">
              Story: {formatCountBadge(createdByFormat.STORY)} criados • {importedByFormat.STORY} importados
            </div>
            <div className="rounded border border-border bg-input px-2 py-1 text-text-muted">
              Feed 4:5: {formatCountBadge(createdByFormat.FEED_PORTRAIT)} criados • {importedByFormat.FEED_PORTRAIT} importados
            </div>
            <div className="rounded border border-border bg-input px-2 py-1 text-text-muted">
              Square 1:1: {formatCountBadge(createdByFormat.SQUARE)} criados • {importedByFormat.SQUARE} importados
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {templateLibrary.map((item) => (
              <span key={item.id} className="rounded-md border border-border bg-input px-1.5 py-0.5 text-[10px] text-text-muted">
                <span className="font-semibold text-text">{item.id}</span> {item.notes}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text">
            <TypeIcon size={14} className="text-primary" />
            Hierarquia textual
          </div>
          <div className="space-y-1 text-[11px] text-text-muted">
            <p><span className="font-semibold text-text">PRE-TITLE:</span> pequeno, caps, espaçamento amplo.</p>
            <p><span className="font-semibold text-text">TITLE:</span> principal, peso alto, line-height curto.</p>
            <p><span className="font-semibold text-text">DESCRIPTION:</span> apoio curto e legivel.</p>
            <p><span className="font-semibold text-text">CTA/TAG:</span> objetivo, sem bloco de texto longo.</p>
            <p className="rounded border border-border bg-input px-2 py-1 text-[10px]">
              Regra critica: quebre titulo manualmente com <code>&lt;br&gt;</code> para evitar viuva e desalinhamento.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
            <Shield size={14} className="text-primary" />
            Hard rules obrigatorias
          </div>
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border-l-2 border-primary border border-border bg-card p-3">
              <p className="text-sm font-semibold text-text">{rule.id} - {rule.title}</p>
              <p className="mt-1 text-xs text-text-muted">{rule.body}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold text-text">R3 - Safe zones por formato</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[300px] border-collapse text-[11px]">
                <thead>
                  <tr className="bg-input text-left text-text">
                    <th className="border border-border px-2 py-1 font-medium">Formato</th>
                    <th className="border border-border px-2 py-1 font-medium">Topo</th>
                    <th className="border border-border px-2 py-1 font-medium">Base</th>
                    <th className="border border-border px-2 py-1 font-medium">Lados</th>
                  </tr>
                </thead>
                <tbody className="text-text-muted">
                  <tr>
                    <td className="border border-border px-2 py-1">Story 9:16</td>
                    <td className="border border-border px-2 py-1">15%</td>
                    <td className="border border-border px-2 py-1">18%</td>
                    <td className="border border-border px-2 py-1">8%</td>
                  </tr>
                  <tr>
                    <td className="border border-border px-2 py-1">Feed 4:5 / 1:1</td>
                    <td className="border border-border px-2 py-1">5%</td>
                    <td className="border border-border px-2 py-1">5%</td>
                    <td className="border border-border px-2 py-1">5%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold text-text">Fluxo diario de producao</p>
            <div className="space-y-1.5 text-[11px] text-text-muted">
              {[
                'Definir formato, objetivo e foto principal.',
                'Selecionar ate 3 templates (ou Automatico).',
                'Aplicar tokens de marca e validar contraste do overlay.',
                'Revisar quebras de linha, CTA e escala da logo.',
                'Aprovar variacoes e publicar no Historico/agenda.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-1.5">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
