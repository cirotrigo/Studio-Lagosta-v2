/**
 * A GEOMETRIA da assinatura por formato (margem lateral, área segura, vão entre blocos, escala de fonte) e a
 * mesclagem dela com `Project.assinatura` — módulo PURO.
 *
 * Extraído de `assinatura.ts` em 29/10/2026 (L0 das linhas-guia) sem mudar a lógica: o editor (`canvas-margin.ts`)
 * precisa do piso do projeto sem puxar halo, gradiente, destaques e logo para o bundle do cliente. `assinatura.ts`
 * continua sendo quem a usa no compositor (`NUMEROS_PADRAO.geometria`, `pisoDoProjeto`); um teste confere que a
 * saída dos dois caminhos é idêntica.
 */
import type { Formato } from './spec'

export interface GeometriaDoFormato {
  margemH: number
  safeTopo: number
  safeRodape: number
  /** Vão vertical entre blocos (px). */
  gapEntreBlocos: number
  /** Multiplicador dos tamanhos de fonte da página de assinatura de STORY, quando o formato não tem página própria. */
  escalaDeFonte: number
}

export const GEOMETRIA_PADRAO: Record<Formato, GeometriaDoFormato> = {
  // Safe area do story: onde o Instagram desenha avatar e barra de resposta.
  story: { margemH: 92, safeTopo: 188, safeRodape: 224, gapEntreBlocos: 14, escalaDeFonte: 1 },
  // Feed e quadrado não têm faixa do Instagram, mas o autofix confere a
  // margem legada do revisor (`MARGEM_LEGADA_DO_REVISOR`: 120 no topo, 100 na
  // base, até o L5) — o compositor não pode pousar texto onde o revisor o acusa.
  // Desde o L0 (29/10/2026) estes números são também a margem da marca que o
  // EDITOR desenha e encaixa (`margensDoEditor`).
  feed: { margemH: 92, safeTopo: 120, safeRodape: 104, gapEntreBlocos: 14, escalaDeFonte: 0.875 },
  quadrado: { margemH: 92, safeTopo: 120, safeRodape: 104, gapEntreBlocos: 12, escalaDeFonte: 0.85 },
}

/**
 * `base` com a `geometria` de `numerosDoProjeto` (o JSON de `Project.assinatura`) por cima, formato a formato.
 * Mesma regra de sempre: chave presente vence, ausente fica; nada é validado aqui (quem precisa de número são
 * finito guarda na ponta — `margensDoEditor`).
 */
export function mesclarGeometria(base: Record<Formato, GeometriaDoFormato>, numerosDoProjeto: unknown): Record<Formato, GeometriaDoFormato> {
  const e = numerosDoProjeto && typeof numerosDoProjeto === 'object' ? (numerosDoProjeto as { geometria?: Partial<Record<Formato, Partial<GeometriaDoFormato>>> }).geometria : undefined
  const geometria = { ...base }
  for (const f of Object.keys(base) as Formato[]) {
    geometria[f] = { ...base[f], ...(e?.[f] ?? {}) }
  }
  return geometria
}

/**
 * O piso do PROJETO por formato: `GEOMETRIA_PADRAO` com `Project.assinatura` por cima — a MESMA mesclagem do
 * `pisoDoProjeto` de `montarAssinatura` (`assinatura.ts`), sem a derivação da página. É o que o editor desenha como
 * margem da marca (`margensDoEditor`).
 */
export function pisoDoProjetoDe(numerosDoProjeto: unknown): Record<Formato, GeometriaDoFormato> {
  return mesclarGeometria(GEOMETRIA_PADRAO, numerosDoProjeto)
}
