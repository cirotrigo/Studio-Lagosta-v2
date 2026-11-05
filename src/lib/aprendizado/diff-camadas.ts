/**
 * O DIFF DE CAMADAS — o que a equipe mudou à mão no editor, camada a camada
 * (T2 do plano "artes de ponta a ponta pelo MCP", 05/11/2026).
 *
 * Mede a LACUNA: o que a pessoa corrige depois que a peça foi entregue (pelo
 * MCP, pelo compositor ou por outra pessoa). Diferente de `diff-geometria.ts`
 * (só peça do compositor, com tolerância e deltas numéricos), este vale para
 * toda página e guarda só CAMINHOS, nunca valores: `position.x`,
 * `style.fontSize`, `effects.background.enabled`, `content`. Assim a linha
 * fica pequena e não carrega texto do cliente nem URL nenhuma.
 *
 * Regras:
 * - compara pelo `id`; camada sem id não entra (não há com quem comparar);
 * - objeto simples desce um nível no caminho; array e valor primitivo são
 *   FOLHA (`style.richText`, `content`) — o caminho diz o que mudou, não como;
 * - `order` é um campo como outro qualquer, então reordenar vira o caminho `order`;
 * - camada idêntica não entra; lista vazia = nada a registrar.
 *
 * Módulo puro: sem Prisma, sem `@/lib/db` (que lança no import sem `DATABASE_URL`).
 */

import { lerCamadas, type PageLayer } from '@/lib/posts/page-layers'

export const VERSAO_DIFF_CAMADAS = 'diff-camadas-v1'

export type SituacaoDaCamada = 'alterada' | 'criada' | 'apagada'

export interface CamadaNoDiff {
  id: string
  tipo: string | null
  nome: string | null
  situacao: SituacaoDaCamada
  /** Só em `alterada`: os caminhos que mudaram, em ordem alfabética. */
  caminhos?: string[]
}

export interface DiffDeCamadas {
  /** Um dos lados não pôde ser lido — nunca vira "não mudou nada". */
  ilegivel: boolean
  camadas: CamadaNoDiff[]
}

/** Teto de caminhos por camada — acima disso o diff já disse o essencial. */
const MAX_CAMINHOS = 40
const MAX_NOME = 80

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function caminhosAlterados(a: unknown, b: unknown, prefixo: string, saida: string[]): void {
  if (ehObjetoSimples(a) && ehObjetoSimples(b)) {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of chaves) caminhosAlterados(a[k], b[k], prefixo ? `${prefixo}.${k}` : k, saida)
    return
  }
  // `undefined` e chave ausente são a mesma coisa (o JSON nem grava a chave).
  if (JSON.stringify(a) !== JSON.stringify(b)) saida.push(prefixo)
}

function resumo(l: PageLayer): Pick<CamadaNoDiff, 'id' | 'tipo' | 'nome'> {
  return {
    id: String(l.id),
    tipo: typeof l.type === 'string' ? l.type : null,
    nome: typeof l.name === 'string' ? l.name.slice(0, MAX_NOME) : null,
  }
}

/** Recebe `Page.layers` cru (qualquer codificação) dos dois lados. */
export function diffDeCamadas(antes: unknown, depois: unknown): DiffDeCamadas {
  const a = lerCamadas(antes)
  const d = lerCamadas(depois)
  if (!a.legivel || !d.legivel) return { ilegivel: true, camadas: [] }

  const comId = (ls: PageLayer[]) => ls.filter((l) => l && l.id != null)
  const porIdAntes = new Map(comId(a.camadas).map((l) => [String(l.id), l]))
  const idsDepois = new Set<string>()
  const camadas: CamadaNoDiff[] = []

  for (const ld of comId(d.camadas)) {
    const id = String(ld.id)
    idsDepois.add(id)
    const la = porIdAntes.get(id)
    if (!la) {
      camadas.push({ ...resumo(ld), situacao: 'criada' })
      continue
    }
    const caminhos: string[] = []
    caminhosAlterados(la, ld, '', caminhos)
    if (caminhos.length === 0) continue
    camadas.push({ ...resumo(ld), situacao: 'alterada', caminhos: caminhos.sort().slice(0, MAX_CAMINHOS) })
  }
  for (const [id, la] of porIdAntes) {
    if (!idsDepois.has(id)) camadas.push({ ...resumo(la), situacao: 'apagada' })
  }

  return { ilegivel: false, camadas }
}
