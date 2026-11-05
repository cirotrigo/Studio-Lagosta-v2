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
 * - `order` NÃO é caminho por camada: apagar uma camada no meio renumera as
 *   outras e o diff sairia com dezenas de `order` falsos. O que conta é a
 *   ORDEM RELATIVA das camadas que existem dos dois lados: mudou → `reordenou`;
 * - `text` é espelho de `content` (a rota de camada grava os dois): quando os
 *   dois mudam, fica só `content`, igual à rota da página;
 * - id repetido no lado "depois": vale a primeira ocorrência;
 * - camada idêntica não entra; nada diferente = nada a registrar (`vazio`).
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
  /** A ordem relativa das camadas presentes nos dois lados mudou (subir/descer camada). */
  reordenou: boolean
  camadas: CamadaNoDiff[]
}

/** Nada a registrar: ilegível ou sem diferença nenhuma. */
export function diffVazio(d: DiffDeCamadas): boolean {
  return d.ilegivel || (d.camadas.length === 0 && !d.reordenou)
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

/** Ids comuns, na ordem em que aparecem empilhados (`order`, ou a posição no array sem ele). */
function ordemRelativa(ls: PageLayer[], comuns: Set<string>): string[] {
  return ls
    .map((l, i) => ({ id: String(l.id), o: typeof l.order === 'number' ? l.order : i }))
    .filter((x) => comuns.has(x.id))
    .sort((x, y) => x.o - y.o)
    .map((x) => x.id)
}

/** Recebe `Page.layers` cru (qualquer codificação) dos dois lados. */
export function diffDeCamadas(antes: unknown, depois: unknown): DiffDeCamadas {
  const a = lerCamadas(antes)
  const d = lerCamadas(depois)
  if (!a.legivel || !d.legivel) return { ilegivel: true, reordenou: false, camadas: [] }

  const comId = (ls: PageLayer[]) => ls.filter((l) => l && l.id != null)
  const listaAntes = comId(a.camadas)
  const porIdAntes = new Map(listaAntes.map((l) => [String(l.id), l]))
  const idsDepois = new Set<string>()
  const listaDepois: PageLayer[] = []
  for (const l of comId(d.camadas)) {
    const id = String(l.id)
    if (idsDepois.has(id)) continue
    idsDepois.add(id)
    listaDepois.push(l)
  }
  const camadas: CamadaNoDiff[] = []

  for (const ld of listaDepois) {
    const la = porIdAntes.get(String(ld.id))
    if (!la) {
      camadas.push({ ...resumo(ld), situacao: 'criada' })
      continue
    }
    let caminhos: string[] = []
    caminhosAlterados(la, ld, '', caminhos)
    caminhos = caminhos.filter((c) => c !== 'order' && !(c === 'text' && caminhos.includes('content')))
    if (caminhos.length === 0) continue
    camadas.push({ ...resumo(ld), situacao: 'alterada', caminhos: caminhos.sort().slice(0, MAX_CAMINHOS) })
  }
  for (const [id, la] of porIdAntes) {
    if (!idsDepois.has(id)) camadas.push({ ...resumo(la), situacao: 'apagada' })
  }

  const comuns = new Set([...idsDepois].filter((id) => porIdAntes.has(id)))
  const reordenou = ordemRelativa(listaAntes, comuns).join('\n') !== ordemRelativa(listaDepois, comuns).join('\n')

  return { ilegivel: false, reordenou, camadas }
}

/**
 * Funde dois diffs da MESMA página na mesma janela (o balde de 10 min do
 * registro): o resultado descreve a janela inteira — do estado antes do
 * primeiro autosave ao depois do último. Criada e depois apagada some;
 * criada e depois alterada continua criada; caminhos se somam.
 */
export function fundirDiffsDeCamadas(anterior: DiffDeCamadas, novo: DiffDeCamadas): DiffDeCamadas {
  // A linha gravada pode vir truncada (`paraJson`) ou de outra safra: sem lista, recomeça do novo.
  const base = Array.isArray(anterior?.camadas) ? anterior.camadas : []
  const porId = new Map(base.map((c) => [c.id, c]))
  for (const n of novo.camadas) {
    const v = porId.get(n.id)
    if (!v) {
      porId.set(n.id, n)
    } else if (n.situacao === 'apagada') {
      if (v.situacao === 'criada') porId.delete(n.id)
      else porId.set(n.id, n)
    } else if (v.situacao === 'criada') {
      porId.set(n.id, { id: n.id, tipo: n.tipo, nome: n.nome, situacao: 'criada' })
    } else if (v.situacao === 'alterada' && n.situacao === 'alterada') {
      const caminhos = [...new Set([...(v.caminhos ?? []), ...(n.caminhos ?? [])])].sort().slice(0, MAX_CAMINHOS)
      porId.set(n.id, { ...n, caminhos })
    } else {
      porId.set(n.id, n)
    }
  }
  return { ilegivel: false, reordenou: anterior?.reordenou === true || novo.reordenou, camadas: [...porId.values()] }
}
