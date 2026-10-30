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
  // Margens da casa de 29/10/2026 (decisão do owner): laterais 64, topo e base IGUAIS. Story 160/160 é o piso da
  // interface (`interface-do-story.ts`) — texto e logo não entram na faixa, foto pode passar por baixo. Eram
  // 92/188/224 (13/10) e, no editor, 70/120/100.
  story: { margemH: 64, safeTopo: 160, safeRodape: 160, gapEntreBlocos: 14, escalaDeFonte: 1 },
  // Feed: nada cobre a foto aberta; a grade 3:4 do perfil corta ~34 px de cada lado e os 64 cobrem o corte. Eram
  // 92/120/104 — o 120 existia porque o revisor conferia a margem do editor; desde 29/10 revisor, autofix e
  // text-geometry leem ESTES números (`margensDoEditor`), então o compositor não pousa texto onde o revisor acusa.
  feed: { margemH: 64, safeTopo: 72, safeRodape: 72, gapEntreBlocos: 14, escalaDeFonte: 0.875 },
  // Quadrado NÃO foi decidido em 29/10: fica como estava até o Ciro dizer.
  quadrado: { margemH: 92, safeTopo: 120, safeRodape: 104, gapEntreBlocos: 12, escalaDeFonte: 0.85 },
}

/**
 * `base` com a `geometria` de `numerosDoProjeto` (o JSON de `Project.assinatura`) por cima, formato a formato.
 * Mesma regra de sempre: chave presente vence, ausente fica; nada é validado aqui (quem precisa de número são
 * finito guarda na ponta — `margensDoEditor`).
 */
export function mesclarGeometria(base: Record<Formato, GeometriaDoFormato>, numerosDoProjeto: unknown): Record<Formato, GeometriaDoFormato> {
  // Como o `mesclarNumeros` antigo: sem JSON, só o mapa externo é copiado (os formatos continuam os mesmos objetos).
  if (!numerosDoProjeto || typeof numerosDoProjeto !== 'object') return { ...base }
  const e = (numerosDoProjeto as { geometria?: Partial<Record<Formato, Partial<GeometriaDoFormato>>> }).geometria
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
