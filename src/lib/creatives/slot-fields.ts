/**
 * Os CAMPOS PREENCHÍVEIS de uma página-modelo — o que o `escolher-modelo`
 * devolve ao agente — e o diagnóstico semântico da página inteira (B1b).
 *
 * Os cinco campos legados (`layerId`, `name`, `type`, `isDynamic`,
 * `currentValue`) não mudam. `semantic` é aditivo e ESTRUTURAL: papel (com a
 * confiança — declarado, inferido, ausente, inválido), slot, por onde o campo
 * pode ser endereçado e os problemas. Nada de texto, URL ou metadata bruta além
 * do `currentValue` que já existia; valor corrompido nunca aparece.
 *
 * Quais camadas viram campo:
 *  - as de sempre: `type === 'text'` e imagem com `isDynamic` (rich-text não);
 *  - mais as que declaram `metadata.slot.id` válido, de qualquer tipo;
 *  - papel inferido SOZINHO nunca faz uma camada entrar.
 *
 * `addressableBy` = os endereços que o Studio de HOJE executa DE PONTA A PONTA —
 * não "o que o `resolverAlvo` localiza". No B1b o preenchimento só entende o
 * contrato legado (id/nome), então só entra `layerId`, e só quando é seguro:
 * `resolverAlvo({ layerId })` aceita (id repetido aplicaria o valor nas duas
 * camadas) e nenhuma OUTRA camada tem esse id como nome (pelo `id ?? nome` do
 * legado, a chave também cairia nela) e o tipo da camada desenha o valor
 * preenchido (texto, rich-text, imagem — forma, gradiente e logo não). `slotId` e `semanticRole` continuam DESCRITOS em `slot`/`role`,
 * mas não prometidos (F1 da revisão adversarial do B1b: anunciá-los antes do
 * preenchimento deixava o agente gerar arte sem o conteúdo, sem erro).
 *
 * 🔴 Requisito do B1c: o MESMO PR que tornar `_slots` preenchível acrescenta
 * `slotId` aqui; o que tornar `_papeis` preenchível acrescenta `semanticRole` —
 * com teste ponta a ponta (anunciado → aceito na criação/ajuste → a camada certa
 * recebe → conflito/ambiguidade falha explícito).
 *
 * `semanticIssues` diagnostica a PÁGINA, inclusive camadas que não viram campo
 * (um slot inválido numa forma, um papel inválido que bloqueia a resolução por
 * papel). Multiplicidade de papel não é problema — está em `occurrences` e
 * `ambiguous`; slot e id de camada repetidos são (o `resolverAlvo` os recusa).
 *
 * `currentValue` só existe para quem já entrava; a camada que entra apenas pelo
 * slot sai com `""` — sem expor conteúdo que a resposta nunca teve. Camadas
 * ilegíveis e página que não voltou da consulta aparecem em `semanticIssues`
 * (`LAYERS_UNREADABLE`, `PAGE_NOT_LOADED`), nunca como "modelo sem campos".
 *
 * Módulo PURO (não importa o banco): `arte-rapida.ts` reexporta.
 */

import { lerCamadas } from '@/lib/posts/page-layers'
import { descreverAlvos } from '@/lib/semantica/descritores'
import { resolverAlvo } from '@/lib/semantica/resolver-alvo'
import type { OrigemDoPapel } from '@/lib/semantica/ler'
import type { Cardinalidade, SemanticRole } from '@/lib/semantica/papeis'
import type { Layer } from '@/types/template'

export type ProblemaDoCampo =
  | { code: 'ROLE_INVALID'; reason: 'valor' | 'tipo' }
  | { code: 'SLOT_INVALID' }
  | { code: 'SLOT_DUPLICATE'; layerIds: string[] }
  | { code: 'LAYER_ID_DUPLICATE' }
  /** Outra camada tem este id como NOME: o legado (`id ?? nome`) aplicaria o valor nas duas. */
  | { code: 'LAYER_ID_MATCHES_OTHER_NAME'; layerIds: string[] }
  /** O valor que o preenchimento grava (`content`/`fileUrl`) não chega ao desenho deste tipo de camada. */
  | { code: 'TYPE_NOT_FILLABLE' }

export interface SemanticaDoCampo {
  role: {
    status: 'declared' | 'inferred' | 'absent' | 'invalid'
    value: SemanticRole | null
    origin: OrigemDoPapel | null
    /** Expectativa do vocabulário, nunca validação. */
    expectedCardinality: Cardinalidade | null
    /** Contagem OBSERVADA na página. */
    occurrences: number
    ambiguous: boolean
  }
  slot: { status: 'declared' | 'absent' | 'invalid' | 'duplicate'; id: string | null }
  /** Endereços executáveis HOJE, de ponta a ponta. B1b: só `layerId` (ver o cabeçalho). */
  addressableBy: Array<'layerId'>
  problems: ProblemaDoCampo[]
}

export interface SlotField {
  layerId: string
  name: string
  type: string
  isDynamic: boolean
  currentValue: string
  semantic: SemanticaDoCampo
}

export type SemanticIssue =
  | { code: 'ROLE_INVALID'; layerIds: string[]; reason: 'valor' | 'tipo' }
  | { code: 'SLOT_INVALID'; layerIds: string[] }
  | { code: 'SLOT_DUPLICATE'; layerIds: string[]; slotId: string }
  | { code: 'LAYER_ID_DUPLICATE'; layerIds: string[]; occurrences: number }
  /** As camadas da página não puderam ser lidas: lista vazia NÃO quer dizer modelo sem campos. */
  | { code: 'LAYERS_UNREADABLE'; layerIds: [] }
  /** A página não voltou da consulta (alternativa removida no meio): idem. */
  | { code: 'PAGE_NOT_LOADED'; layerIds: [] }

export interface AnaliseDosCampos {
  slotFields: SlotField[]
  semanticIssues: SemanticIssue[]
}

const entraPeloLegado = (l: any) => l?.type === 'text' || (l?.type === 'image' && l?.isDynamic)

/**
 * Tipos cujo valor preenchido o render DESENHA: texto e rich-text (`content`) e
 * imagem (`fileUrl`). Forma, gradiente, ícone e afins não usam nenhum dos dois;
 * a logo é desenhada pelo `logoId`. Nesses, o campo é descrito, mas não
 * prometido (codex review do B1b).
 */
const TIPOS_PREENCHIVEIS = new Set(['text', 'rich-text', 'image'])

/** A análise de uma página que não voltou da consulta — vazia, mas dita (revisão adversarial do B1b, F2). */
export function analiseDePaginaAusente(): AnaliseDosCampos {
  return { slotFields: [], semanticIssues: [{ code: 'PAGE_NOT_LOADED', layerIds: [] }] }
}

export function analisarSlotFields(raw: unknown): AnaliseDosCampos {
  const { camadas: lidas, legivel } = lerCamadas(raw)
  // Ilegível continua com a lista vazia de sempre, mas DIAGNOSTICADA: a criação recusaria essa página.
  if (!legivel) return { slotFields: [], semanticIssues: [{ code: 'LAYERS_UNREADABLE', layerIds: [] }] }
  const camadas = lidas as Layer[]
  const descritores = descreverAlvos(camadas)

  const porId = new Map<string, number[]>()
  const porSlot = new Map<string, number[]>()
  descritores.forEach((d, i) => {
    porId.set(d.layerId, [...(porId.get(d.layerId) ?? []), i])
    if (d.slot.status === 'valido') porSlot.set(d.slot.slotId, [...(porSlot.get(d.slot.slotId) ?? []), i])
  })
  const idsDe = (indices: number[]) => indices.map((i) => descritores[i].layerId)

  const semanticIssues: SemanticIssue[] = []
  const vistos = new Set<string>()
  descritores.forEach((d) => {
    const repetidos = porId.get(d.layerId)!
    if (repetidos.length > 1 && !vistos.has(`id:${d.layerId}`)) {
      vistos.add(`id:${d.layerId}`)
      semanticIssues.push({ code: 'LAYER_ID_DUPLICATE', layerIds: [d.layerId], occurrences: repetidos.length })
    }
    if (d.papel.status === 'invalido') semanticIssues.push({ code: 'ROLE_INVALID', layerIds: [d.layerId], reason: d.papel.motivo })
    if (d.slot.status === 'invalido') semanticIssues.push({ code: 'SLOT_INVALID', layerIds: [d.layerId] })
    if (d.slot.status === 'valido') {
      const mesmos = porSlot.get(d.slot.slotId)!
      if (mesmos.length > 1 && !vistos.has(`slot:${d.slot.slotId}`)) {
        vistos.add(`slot:${d.slot.slotId}`)
        semanticIssues.push({ code: 'SLOT_DUPLICATE', layerIds: idsDe(mesmos), slotId: d.slot.slotId })
      }
    }
  })

  const slotFields: SlotField[] = []
  descritores.forEach((d, i) => {
    const l = camadas[i] as any
    const peloLegado = entraPeloLegado(l)
    if (!peloLegado && d.slot.status !== 'valido') return

    const problems: ProblemaDoCampo[] = []
    const idRepetido = porId.get(d.layerId)!.length > 1
    if (idRepetido) problems.push({ code: 'LAYER_ID_DUPLICATE' })

    const p = d.papel
    const role: SemanticaDoCampo['role'] =
      p.status === 'valido'
        ? {
            status: p.origem === 'metadata' ? 'declared' : 'inferred',
            value: p.papel,
            origin: p.origem,
            expectedCardinality: d.cardinalidadeEsperada,
            occurrences: d.ocorrenciasDoPapel,
            ambiguous: d.ambiguous,
          }
        : { status: p.status === 'invalido' ? 'invalid' : 'absent', value: null, origin: null, expectedCardinality: null, occurrences: 0, ambiguous: false }
    if (p.status === 'invalido') problems.push({ code: 'ROLE_INVALID', reason: p.motivo })

    let slot: SemanticaDoCampo['slot'] = { status: 'absent', id: null }
    if (d.slot.status === 'invalido') {
      slot = { status: 'invalid', id: null }
      problems.push({ code: 'SLOT_INVALID' })
    } else if (d.slot.status === 'valido') {
      const mesmos = porSlot.get(d.slot.slotId)!
      slot = { status: mesmos.length > 1 ? 'duplicate' : 'declared', id: d.slot.slotId }
      if (mesmos.length > 1) problems.push({ code: 'SLOT_DUPLICATE', layerIds: idsDe(mesmos) })
    }

    // O único endereço que o preenchimento de HOJE executa: o layerId — seguro só quando o resolverAlvo o
    // aceita (único) E nenhuma OUTRA camada tem esse valor como nome (o legado casa `id ?? nome`, então a chave
    // cairia nas duas).
    const sombras = camadas.flatMap((c: any, j) => (j !== i && c?.name === d.layerId ? [String(c.id)] : []))
    if (sombras.length > 0) problems.push({ code: 'LAYER_ID_MATCHES_OTHER_NAME', layerIds: sombras })
    const preenchivel = TIPOS_PREENCHIVEIS.has(l.type)
    if (!preenchivel) problems.push({ code: 'TYPE_NOT_FILLABLE' })
    const porLayerId = resolverAlvo(camadas, { layerId: d.layerId })
    const addressableBy: SemanticaDoCampo['addressableBy'] =
      preenchivel && 'indice' in porLayerId && porLayerId.indice === i && sombras.length === 0 ? ['layerId'] : []

    slotFields.push({
      layerId: l.id,
      name: l.name,
      type: l.type,
      isDynamic: !!l.isDynamic,
      // Só quem já entrava expõe o valor (a fórmula de sempre). Quem entra SÓ pelo slot (imagem estática, logo,
      // forma) sai com "": a URL dela nunca constou da resposta (revisão adversarial do B1b, F3).
      currentValue: !peloLegado ? '' : l.type === 'text' ? (l.content ?? '') : (l.fileUrl ?? ''),
      semantic: { role, slot, addressableBy, problems },
    })
  })

  return { slotFields, semanticIssues }
}

/** A lista de campos — a API de sempre, agora enriquecida. */
export function slotFieldsFromLayers(raw: unknown): SlotField[] {
  return analisarSlotFields(raw).slotFields
}
