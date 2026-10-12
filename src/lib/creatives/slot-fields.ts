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
 * não "o que o `resolverAlvo` localiza". `layerId` só quando é seguro:
 * `resolverAlvo({ layerId })` aceita (id repetido aplicaria o valor nas duas
 * camadas) e nenhuma OUTRA camada tem esse id como nome (pelo `id ?? nome` do
 * legado, a chave também cairia nela) e o tipo da camada desenha o valor
 * preenchido (texto e imagem; rich-text em quarentena até a #209 — forma, gradiente e logo não), e a
 * camada não está oculta no modelo (o preenchimento não a torna visível), e a
 * página não pode ser trocada pela criação (família "(3 layouts)": com foto,
 * `createArteRapida` pode assar sobre uma irmã, onde o layerId pode não existir;
 * a promessa é incondicional, então não depende de haver foto ou `layoutFixo`).
 *
 * B1c: `_slots`/`_papeis` passaram a ser preenchidos (`createArteRapida` e
 * `ajustarArte`, por `resolverValoresSemanticos`), e entram aqui sob as MESMAS
 * portas de tipo, visibilidade e página: `slotId` quando o slot é válido e o
 * `resolverAlvo({ slotId })` devolve esta camada; `semanticRole` quando o papel é
 * DECLARADO (inferido a escrita recusa: PAPEL_NAO_DECLARADO) e o
 * `resolverAlvo({ semanticRole })` devolve esta camada (papel ambíguo, não). A
 * sombra de nome tira só o `layerId`: o semântico aplica por índice.
 *
 * 🔴 Família "(3 layouts)" continua SEM endereço nenhum: a criação resolve
 * `_slots` na irmã efetiva (ALVO_NAO_RESOLVIDO explícito se ela não tiver o
 * slot), mas prometer exige que as irmãs compartilhem os slotIds — em produção
 * (12/10/2026) nenhuma página tem slot, e as famílias 207 e 308 divergem até nos
 * layerIds. É pré-requisito de migração/marcação, nunca fallback por nome.
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
  /** Oculta no modelo: o preenchimento grava o valor, mas não a torna visível, e o render a pula. */
  | { code: 'LAYER_HIDDEN' }
  /**
   * A criação padrão pode trocar esta página por uma irmã (família "(3 layouts)", pela foto): o layerId daqui
   * pode não existir na página realmente usada. Limitação da via de criação — não é corrupção (fica fora de
   * `semanticIssues`).
   */
  | { code: 'PAGE_MAY_CHANGE_BY_LAYOUT' }
  /**
   * Rich-text em quarentena até a issue #209: descrito (slot, papel), mas não oferecido ao agente como campo
   * editável — o contrato novo recusa escrevê-lo (VALOR_INCOMPATIVEL_COM_CAMADA) e o legado não é prometido.
   */
  | { code: 'RICH_TEXT_NOT_SUPPORTED' }
  /**
   * Uma chave reservada colide: outra camada usa `_slots`/`_papeis` como id ou nome (a escrita recusa a chave inteira,
   * CHAVE_RESERVADA_COLIDE_COM_LAYER), ou o id/nome DESTA camada é uma chave reservada (nenhum endereço é seguro).
   */
  | { code: 'RESERVED_KEY_COLLISION'; key: ChaveReservada }
  /**
   * Campo de texto cuja chave visual (`name ?? id`) começa com `_`, ou página com algum texto visível assim: a escrita
   * semântica de texto recusa (CHAVE_VISUAL_RESERVADA).
   */
  | { code: 'VISUAL_KEY_RESERVED' }

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
  /** Endereços executáveis HOJE, de ponta a ponta (ver o cabeçalho). */
  addressableBy: Array<'layerId' | 'slotId' | 'semanticRole'>
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

/** As chaves de `slotValues` que nunca endereçam camada pelo id/nome (as mesmas de `createArteRapida`). */
const CHAVES_RESERVADAS = ['_driveImageId', '_imageUrl', '_slots', '_papeis'] as const
type ChaveReservada = (typeof CHAVES_RESERVADAS)[number]
const ehChaveReservada = (k: string): k is ChaveReservada => (CHAVES_RESERVADAS as readonly string[]).includes(k)

const entraPeloLegado = (l: any) => l?.type === 'text' || (l?.type === 'image' && l?.isDynamic)

/**
 * Tipos cujo valor preenchido o render DESENHA: texto e rich-text (`content`) e
 * imagem (`fileUrl`). Forma, gradiente, ícone e afins não usam nenhum dos dois;
 * a logo é desenhada pelo `logoId`. Nesses, o campo é descrito, mas não
 * prometido (codex review do B1b). Rich-text está aqui porque o render o desenha, mas fica fora de
 * `addressableBy` pela quarentena da #209 (RICH_TEXT_NOT_SUPPORTED).
 */
const TIPOS_PREENCHIVEIS = new Set(['text', 'rich-text', 'image'])
const TIPOS_DE_TEXTO = new Set(['text', 'rich-text'])

/** A análise de uma página que não voltou da consulta — vazia, mas dita (revisão adversarial do B1b, F2). */
export function analiseDePaginaAusente(): AnaliseDosCampos {
  return { slotFields: [], semanticIssues: [{ code: 'PAGE_NOT_LOADED', layerIds: [] }] }
}

/** O contexto da via de criação que consome estes campos. */
export interface ContextoDosCampos {
  /** A criação padrão pode trocar esta página por uma irmã (família "(3 layouts)"). */
  paginaPodeSerSubstituida?: boolean
}

export function analisarSlotFields(raw: unknown, contexto: ContextoDosCampos = {}): AnaliseDosCampos {
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

  // A mesma guarda global do resolvedor: com uma camada chamada (ou com id) _slots/_papeis, a chave inteira é recusada.
  const colide = (chave: string) => camadas.some((c: any) => c?.id === chave || c?.name === chave)
  // Texto visível com chave visual "_…" em QUALQUER camada: com texto semântico, a criação recusa a página inteira.
  const chaveVisualReservadaDe = (c: any) => TIPOS_DE_TEXTO.has(c?.type) && String(c?.name ?? c?.id).startsWith('_')
  const paginaComChaveVisualReservada = camadas.some((c: any) => chaveVisualReservadaDe(c) && c.visible !== false)
  const slotsColidem = colide('_slots')
  const papeisColidem = colide('_papeis')

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
    const oculta = l.visible === false
    const richTextEmQuarentena = l.type === 'rich-text'
    if (richTextEmQuarentena) problems.push({ code: 'RICH_TEXT_NOT_SUPPORTED' })
    if (oculta) problems.push({ code: 'LAYER_HIDDEN' })
    const podeTrocar = contexto.paginaPodeSerSubstituida === true
    if (podeTrocar) problems.push({ code: 'PAGE_MAY_CHANGE_BY_LAYOUT' })
    // B1c: slotId e semanticRole entram quando a escrita (`resolverValoresSemanticos`) os executa: o MESMO
    // `resolverAlvo` devolve esta camada, e o papel é DECLARADO (inferido é PAPEL_NAO_DECLARADO). A sombra de
    // nome só afeta a chave legada; o semântico aplica por índice.
    const eEsta = (r: ReturnType<typeof resolverAlvo>) => 'indice' in r && r.indice === i
    const temSlot = d.slot.status === 'valido'
    const temPapelDeclarado = p.status === 'valido' && p.origem === 'metadata'
    // Id ou nome que é chave reservada: a mesma chave pode vir na chamada (a foto, o _slots) e o casamento legado
    // por id/nome a leria como valor DESTA camada — nenhum endereço é seguro (Codex #208, CP3).
    const reservadaPropria = [d.layerId, l.name].find((k): k is ChaveReservada => typeof k === 'string' && ehChaveReservada(k))
    if (reservadaPropria) problems.push({ code: 'RESERVED_KEY_COLLISION', key: reservadaPropria })
    const chaveVisualReservada = TIPOS_DE_TEXTO.has(l.type) && (chaveVisualReservadaDe(l) || paginaComChaveVisualReservada)
    if (chaveVisualReservada && !reservadaPropria) problems.push({ code: 'VISUAL_KEY_RESERVED' })
    if (temSlot && slotsColidem && reservadaPropria !== '_slots') problems.push({ code: 'RESERVED_KEY_COLLISION', key: '_slots' })
    if (temPapelDeclarado && papeisColidem && reservadaPropria !== '_papeis') problems.push({ code: 'RESERVED_KEY_COLLISION', key: '_papeis' })
    const addressableBy: SemanticaDoCampo['addressableBy'] = []
    if (preenchivel && !oculta && !podeTrocar && !reservadaPropria && !richTextEmQuarentena) {
      if (sombras.length === 0 && eEsta(resolverAlvo(camadas, { layerId: d.layerId }))) addressableBy.push('layerId')
      if (d.slot.status === 'valido' && !slotsColidem && !chaveVisualReservada && eEsta(resolverAlvo(camadas, { slotId: d.slot.slotId }))) addressableBy.push('slotId')
      if (temPapelDeclarado && !papeisColidem && !chaveVisualReservada && eEsta(resolverAlvo(camadas, { semanticRole: p.papel }))) addressableBy.push('semanticRole')
    }

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
