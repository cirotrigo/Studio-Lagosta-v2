/**
 * RESOLVER os valores semânticos de um preenchimento — `slotValues._slots`
 * (por slotId) e `slotValues._papeis` (por papel) — em valores POR ÍNDICE de
 * camada, sem aplicar nada (B1a; docs/research/studio-target-architecture.md).
 *
 * O endereçamento é o de `resolverAlvo`, nunca outro: papel repetido, slot
 * ausente ou duplicado e semântica corrompida voltam como o erro estruturado
 * dele, sem escolher camada. O resultado é indexado (não por referência de
 * objeto, nem achatado de volta para `slotValues[layer.id]` — isso reabriria a
 * colisão id × nome do casamento legado).
 *
 * DOIS CONTRATOS, separados de propósito:
 *  - o LEGADO (as chaves por id/nome) continua entendendo `content`, `fileUrl`,
 *    `hidden`, `papel` e `bloco` — a copy autoral depende das duas marcas;
 *  - o SEMÂNTICO (`ValorSemantico`, só em `_slots`/`_papeis`) é conteúdo pedido
 *    por quem preenche: string, ou objeto com `content` e/ou `fileUrl` — só o
 *    que as DUAS vias futuras aplicam do mesmo jeito. `hidden` fica de fora: a
 *    via de criação (`bakeLayers`) o entende, a do render
 *    (`aplicarSlotNaCamada`) não (finding do Codex no B1a). `papel` e `bloco`
 *    são identidade interna da composição e da copy e NÃO podem ser redefinidos
 *    por aqui. Fail-closed: chave fora do contrato, tipo errado, objeto vazio
 *    ou `fileUrl: ""` é VALOR_INVALIDO.
 *
 * Conflito nunca é escolhido em silêncio: duas fontes explicitamente enviadas
 * para a MESMA camada — `_slots` e `_papeis`, ou uma delas e a chave legada
 * que o casamento real usaria — precisam produzir o mesmo EFEITO editável;
 * senão VALOR_CONFLITANTE. A chave legada efetiva espelha exatamente
 * `slotValues[layer.id] ?? slotValues[layer.name]` (sem excluir "_": o
 * `isControlKey` do legado só serve ao diagnóstico). `undefined` e `null` são
 * ausentes; `""` é valor.
 *
 * `_slots` e `_papeis` são RESERVADOS: em uso, uma layer cujo id ou nome seja
 * a própria chave receberia o mesmo valor como conteúdo pelo legado —
 * CHAVE_RESERVADA_COLIDE_COM_LAYER, e aquele campo não é resolvido.
 *
 * 🔴 O ÍNDICE é a posição no array RECEBIDO — não a ordem de desenho (`order`).
 * Quem aplica tem de aplicar sobre o MESMO array que resolveu, antes de
 * qualquer ordenação (a leitura da agenda ordena por `emOrdemDoRender`), ou
 * levar a posição original junto da camada. Aplicar o índice num array
 * reordenado acerta outra camada (revisão adversarial do B1a, F2).
 *
 * Só lê. A aplicação (bakeLayers, aplicarSlotNaCamada) é dos PRs seguintes.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { lerSemanticRole } from './ler'
import { resolverAlvo, type ErroDoAlvo } from './resolver-alvo'
import type { SemanticRole } from './papeis'

/** O contrato SEMÂNTICO: o que `_slots`/`_papeis` podem pedir para uma camada. */
export type ValorSemantico = string | { content?: string; fileUrl?: string }

export type OrigemSemantica = { tipo: 'slotId' | 'semanticRole'; chave: string }
export type OrigemDoValor = OrigemSemantica | { tipo: 'layerId' | 'name'; chave: string }

export interface ValorResolvido {
  indice: number
  /** O valor COMO VEIO — a aplicação decide o que ele significa em cada caminho. */
  valor: ValorSemantico
  origem: OrigemSemantica
}

type CampoReservado = '_slots' | '_papeis'

export type ErroDeValor =
  | { codigo: 'ENTRADA_INVALIDA'; campo: CampoReservado }
  | { codigo: 'CHAVE_RESERVADA_COLIDE_COM_LAYER'; chave: CampoReservado; indice: number; layerId: string }
  | { codigo: 'VALOR_INVALIDO'; origem: OrigemSemantica }
  | { codigo: 'ALVO_NAO_RESOLVIDO'; origem: OrigemSemantica; erro: ErroDoAlvo }
  | { codigo: 'VALOR_CONFLITANTE'; indice: number; layerId: string; origens: OrigemDoValor[] }
  /** `_papeis` achou a camada por papel INFERIDO (id, nome, tipo, id reservado): não é endereço de escrita estável. */
  | { codigo: 'PAPEL_NAO_DECLARADO'; origem: OrigemSemantica; layerId: string }
  /** Oculta na página: o valor seria gravado e o render pularia a camada (espelha o LAYER_HIDDEN do addressableBy). */
  | { codigo: 'CAMADA_OCULTA'; layerId: string; origem: OrigemSemantica }
  /**
   * Texto numa camada cuja chave visual (`name ?? id`, a de textosDaPagina/copyVisualDasCamadas) começa com `_`: a
   * copy registrada da arte cairia numa chave que os leitores descartam (Codex #208; a convenção é requisito do B1d).
   * Sem `origem`: a camada não foi endereçada, mas o contrato está presente e a copy visual a perderia (B1d checkpoint g).
   */
  | { codigo: 'CHAVE_VISUAL_RESERVADA'; layerId: string; origem?: OrigemSemantica }
  /** O efeito pedido não é desenhado por este tipo de camada (seria gravado e ignorado pelo render). */
  | { codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA'; layerId: string; type: string; origem: OrigemSemantica; efeito: EfeitoPedido }

export type EfeitoPedido = 'content' | 'fileUrl' | 'content+fileUrl'

export type AvisoDeValor = { codigo: 'FONTES_EQUIVALENTES'; indice: number; origens: OrigemDoValor[] }

export interface ValoresSemanticos {
  valores: Map<number, ValorResolvido>
  erros: ErroDeValor[]
  avisos: AvisoDeValor[]
}

const fornecido = (v: unknown) => v !== undefined && v !== null
const objetoSimples = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** O contrato semântico, fail-closed: só chaves conhecidas, tipos certos, e ao menos uma operação com efeito. */
function valorSemanticoValido(v: unknown): v is ValorSemantico {
  if (typeof v === 'string') return true
  if (!objetoSimples(v)) return false
  const chaves = Object.keys(v)
  if (chaves.length === 0) return false
  return chaves.every((k) => {
    if (k === 'content') return typeof v.content === 'string'
    if (k === 'fileUrl') return typeof v.fileUrl === 'string' && v.fileUrl !== ''
    return false
  })
}

/**
 * O EFEITO visual de um valor — legado ou semântico: `content` (string),
 * `fileUrl` (string) e o `hidden: true` do LEGADO (a camada some — efeito
 * real, que o contrato semântico não pede, e por isso conflita com ele).
 * `papel`/`bloco` e chaves que o legado ignora ficam de fora: a metadata
 * interna do legado não é conflito. String não vazia `s` equivale a
 * `{ content: s }`; `""` é um efeito próprio (no render ela MANTÉM a camada, e
 * `{ content: "" }` a apaga).
 */
function efeito(v: unknown): string {
  if (typeof v === 'string') return v === '' ? 'string-vazia' : JSON.stringify({ content: v })
  if (!objetoSimples(v)) return `invalido:${JSON.stringify(v)}`
  const e: Record<string, unknown> = {}
  if (typeof v.content === 'string') e.content = v.content
  if (typeof v.fileUrl === 'string') e.fileUrl = v.fileUrl
  if (v.hidden === true) e.hidden = true
  return JSON.stringify(e)
}

const ENTRADAS: Array<{ campo: CampoReservado; tipo: OrigemSemantica['tipo'] }> = [
  { campo: '_slots', tipo: 'slotId' },
  { campo: '_papeis', tipo: 'semanticRole' },
]

/** A validação ESTRUTURAL de um campo reservado: forma e ValorSemantico. Devolve as entradas válidas. */
function estruturaDoCampo(campo: CampoReservado, tipo: OrigemSemantica['tipo'], bruto: unknown) {
  const erros: ErroDeValor[] = []
  const validas: Array<{ origem: OrigemSemantica; valor: ValorSemantico }> = []
  if (!objetoSimples(bruto)) return { erros: [{ codigo: 'ENTRADA_INVALIDA', campo } as ErroDeValor], validas }
  for (const [chave, valor] of Object.entries(bruto)) {
    const origem: OrigemSemantica = { tipo, chave }
    if (valorSemanticoValido(valor)) validas.push({ origem, valor })
    else erros.push({ codigo: 'VALOR_INVALIDO', origem })
  }
  return { erros, validas }
}

/**
 * Só a parte ESTRUTURAL de `_slots`/`_papeis` — sem página: forma e
 * ValorSemantico. É o que dá para recusar antes de ler a foto e escolher o
 * modelo (B1c); o resto (endereço, papel declarado, tipo, conflito) depende da
 * página efetiva e fica em `resolverValoresSemanticos`, que usa ESTA mesma
 * validação.
 */
export function validarEntradaSemantica(slotValues: Record<string, unknown>): ErroDeValor[] {
  return ENTRADAS.flatMap(({ campo, tipo }) => (fornecido(slotValues[campo]) ? estruturaDoCampo(campo, tipo, slotValues[campo]).erros : []))
}

/**
 * Os tipos em que o contrato NOVO escreve `content`. Rich-text fica FORA até a issue #209 (quarentena): trocar o
 * `content` sem reconstruir os trechos e estilos deixa a peça difícil de editar depois. O legado (layerId/nome
 * direto) não passa por aqui e continua como sempre.
 */
const TIPOS_DE_TEXTO = new Set(['text'])

function efeitoPedido(v: ValorSemantico): EfeitoPedido {
  if (typeof v === 'string') return 'content'
  if (v.content !== undefined && v.fileUrl !== undefined) return 'content+fileUrl'
  return v.content !== undefined ? 'content' : 'fileUrl'
}

/** O tipo recebe o efeito pelo contrato novo? content → texto (rich-text em quarentena, #209); fileUrl → imagem; os dois juntos → nenhum, por ora. */
function tipoDesenha(efeito: EfeitoPedido, tipo: unknown): boolean {
  if (efeito === 'content') return typeof tipo === 'string' && TIPOS_DE_TEXTO.has(tipo)
  if (efeito === 'fileUrl') return tipo === 'image'
  return false
}

export function resolverValoresSemanticos(camadas: readonly Layer[], slotValues: Record<string, unknown>): ValoresSemanticos {
  const erros: ErroDeValor[] = []
  const avisos: AvisoDeValor[] = []
  const porIndice = new Map<number, Array<{ origem: OrigemSemantica; valor: ValorSemantico }>>()

  for (const { campo, tipo } of ENTRADAS) {
    const bruto = slotValues[campo]
    if (!fornecido(bruto)) continue
    const colide = camadas.findIndex((l) => l.id === campo || l.name === campo)
    if (colide !== -1) {
      erros.push({ codigo: 'CHAVE_RESERVADA_COLIDE_COM_LAYER', chave: campo, indice: colide, layerId: camadas[colide].id })
      continue
    }
    const estrutura = estruturaDoCampo(campo, tipo, bruto)
    erros.push(...estrutura.erros)
    for (const { origem, valor } of estrutura.validas) {
      const r = resolverAlvo(camadas, tipo === 'slotId' ? { slotId: origem.chave } : { semanticRole: origem.chave as SemanticRole })
      if ('erro' in r) {
        erros.push({ codigo: 'ALVO_NAO_RESOLVIDO', origem, erro: r.erro })
        continue
      }
      const layer = camadas[r.indice]
      // Política de ESCRITA (B1c; o resolverAlvo não muda): papel só endereça escrita quando DECLARADO.
      if (tipo === 'semanticRole') {
        const p = lerSemanticRole(layer)
        if (!(p.status === 'valido' && p.origem === 'metadata')) {
          erros.push({ codigo: 'PAPEL_NAO_DECLARADO', origem, layerId: layer.id })
          continue
        }
      }
      if (layer.visible === false) {
        erros.push({ codigo: 'CAMADA_OCULTA', layerId: layer.id, origem })
        continue
      }
      // O efeito tem de ser desenhado pelo tipo: senão seria gravado e ignorado pelo render.
      const efeito = efeitoPedido(valor)
      if (!tipoDesenha(efeito, layer.type)) {
        erros.push({ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', layerId: layer.id, type: String(layer.type), origem, efeito })
        continue
      }
      if (efeito === 'content' && String(layer.name ?? layer.id).startsWith('_')) {
        erros.push({ codigo: 'CHAVE_VISUAL_RESERVADA', layerId: layer.id, origem })
        continue
      }
      porIndice.set(r.indice, [...(porIndice.get(r.indice) ?? []), { origem, valor }])
    }
  }

  const valores = new Map<number, ValorResolvido>()
  for (const [indice, semanticas] of [...porIndice.entries()].sort((a, b) => a[0] - b[0])) {
    const layer = camadas[indice]
    // A fonte legada EFETIVA, exatamente como o casamento real: `slotValues[id] ?? slotValues[name]`.
    const fontes: Array<{ origem: OrigemDoValor; valor: unknown }> = []
    if (typeof layer.id === 'string' && fornecido(slotValues[layer.id])) {
      fontes.push({ origem: { tipo: 'layerId', chave: layer.id }, valor: slotValues[layer.id] })
    } else if (typeof layer.name === 'string' && fornecido(slotValues[layer.name])) {
      fontes.push({ origem: { tipo: 'name', chave: layer.name }, valor: slotValues[layer.name] })
    }
    fontes.push(...semanticas)
    const origens = fontes.map((f) => f.origem)
    const alvo = efeito(semanticas[0].valor)
    if (fontes.some((f) => efeito(f.valor) !== alvo)) {
      erros.push({ codigo: 'VALOR_CONFLITANTE', indice, layerId: layer.id, origens })
      continue
    }
    if (fontes.length > 1) avisos.push({ codigo: 'FONTES_EQUIVALENTES', indice, origens })
    valores.set(indice, { indice, valor: semanticas[0].valor, origem: semanticas[0].origem })
  }
  return { valores, erros, avisos }
}
