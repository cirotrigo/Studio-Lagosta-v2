/**
 * CP-X0 — guarda do push do desktop (contrato v3, 21/10/2026; ver docs/regras/editor-e-galeria.md).
 *
 * O app desktop devolve uma forma só com fill/stroke/strokeWidth/shapeType (`localLayerToWeb` em
 * desktop-app/electron/services/sync/template-normalizer.ts) e manda só as páginas que conhece. O PUT gravava isso
 * por cima: o `svg-path` perdia o path, a máscara sumia, a página feita no web era apagada. Aqui: o que o desktop
 * NÃO representa é preservado (chaves ausentes) ou o push é RECUSADO — nunca perdido em silêncio.
 *
 * Puro, sem `@/lib/db`: roda dentro do compare-and-set de `gravarCamadasComRevisao`, sobre a base RELIDA.
 */
import { lerCamadas } from '@/lib/posts/page-layers'
import { conferirGrade } from '@/lib/grades/conferir'
import type { Layer } from '@/types/template'

export type CodigoDaRecusa =
  | 'PUSH_ALTERA_VETOR'
  | 'PUSH_ALTERA_GRADE'
  | 'PUSH_APAGARIA_CAMADA'
  | 'PUSH_PAGINA_INCERTA'
  | 'PUSH_PAGINAS_DUPLICADAS'
  | 'PUSH_DESTINO_REPETIDO'
  | 'PUSH_CAMADAS_DUPLICADAS'
  | 'PUSH_CAMADAS_ILEGIVEIS'
  | 'PUSH_BASE_ILEGIVEL'

/** Lançada de DENTRO da transação: o `$transaction` reverte tudo, e a rota responde 409 fora dela. */
export class RecusaDoPushDoDesktop extends Error {
  constructor(
    readonly codigo: CodigoDaRecusa,
    readonly paginaId: string | null,
    readonly camadaId?: string,
  ) {
    super(`${codigo}${paginaId ? ` (página ${paginaId}${camadaId ? `, camada ${camadaId}` : ''})` : ''}`)
    this.name = 'RecusaDoPushDoDesktop'
  }
}

type Objeto = Record<string, unknown>
type Camada = Objeto & { id: string }

const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const temValor = (v: unknown) => v !== undefined && v !== null

/** Chaves de `style` que só o web desenha e que definem o que a camada É. */
const IDENTIDADE_NO_STYLE = ['shapeType', 'pathData', 'pathViewBox', 'pathFillRule', 'mask', 'vetor'] as const
/** Chaves de `metadata` que amarram a camada ao compositor (recomposição, reverter, slots). */
const IDENTIDADE_NO_METADATA = ['compositor', 'slot'] as const

/** A camada tem algo que o desktop não representa (contrato v3, "camada protegida"). */
export function ehCamadaProtegida(camada: unknown): boolean {
  if (!ehObjeto(camada)) return false
  const style = ehObjeto(camada.style) ? camada.style : {}
  const metadata = ehObjeto(camada.metadata) ? camada.metadata : {}
  return (
    style.shapeType === 'svg-path' ||
    IDENTIDADE_NO_STYLE.some((k) => k !== 'shapeType' && temValor(style[k])) ||
    IDENTIDADE_NO_METADATA.some((k) => temValor(metadata[k]))
  )
}

/** Camadas legíveis: array de objetos com `id` string não vazia e `style`/`metadata` objeto quando presentes. */
function lerCamadasEstritas(raw: unknown): Camada[] | null {
  const { camadas, legivel } = lerCamadas(raw)
  if (!legivel) return null
  for (const c of camadas as unknown[]) {
    if (!ehObjeto(c)) return null
    if (typeof c.id !== 'string' || c.id.length === 0) return null
    if (c.style !== undefined && !ehObjeto(c.style)) return null
    if (c.metadata !== undefined && !ehObjeto(c.metadata)) return null
  }
  return camadas as unknown as Camada[]
}

/**
 * G4.1 — grade de fotos (27/10/2026). O desktop não conhece grade: no pull ele descarta `style.crop`, `border` e
 * `metadata`, e no push devolve posição, tamanho, `src`, `fit` e opacidade da célula. A mescla preserva o que falta,
 * mas aceitava do payload a geometria, a foto e o estilo — e uma célula movida 10 px quebrava a grade em silêncio.
 * Enquanto o desktop não tiver suporte, NENHUM membro muda pelo push: a camada mesclada INTEIRA (raiz, `style`,
 * `metadata`, `effects`, `movimento`…) sai igual à base RELIDA, ou o push inteiro é recusado (409, a transação desfaz
 * tudo). Comparação conservadora com a lista EXPLÍCITA do que o normalizador do desktop renormaliza sem mudar o desenho
 * nem a grade: nome, `order` (o zIndex dele), o `fit` de topo (só o desktop lê) e a posição na pilha; `visible`,
 * `locked`, `rotation`, `fileUrl` e `crop` de topo comparados pelo valor efetivo (ausente = padrão).
 */
const idsDeGradeEm = (camadas: Camada[]) =>
  new Set(camadas.map((c) => (ehObjeto(c.metadata) && ehObjeto(c.metadata.grade) ? c.metadata.grade.id : null)).filter((id): id is string => typeof id === 'string' && id.length > 0))
const vinculadaAGrade = (c: Camada, ids: ReadonlySet<string>) => {
  const meta = ehObjeto(c.metadata) ? c.metadata : {}
  return temValor(meta.grade) || (typeof meta.groupId === 'string' && ids.has(meta.groupId))
}
/** JSON com as chaves em ordem: a mescla pode reordenar chaves sem mudar nada */
const canonico = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonico) : ehObjeto(v) ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canonico(v[k])])) : v
const RENORMALIZADAS_PELO_DESKTOP = ['name', 'order', 'fit'] as const
const desenhoDoMembro = (c: Camada) => {
  const resto: Objeto = { ...c }
  for (const k of RENORMALIZADAS_PELO_DESKTOP) delete resto[k]
  return JSON.stringify(canonico({
    ...resto, rotation: c.rotation ?? 0, fileUrl: c.fileUrl ?? '', crop: c.crop ?? null, visible: c.visible !== false, locked: c.locked === true,
    style: c.style ?? {}, metadata: c.metadata ?? {},
  }))
}
const chaveDoDiagnostico = (d: { codigo: string; gradeId?: string; camadaId?: string; mensagem: string }) => `${d.codigo}|${d.gradeId ?? ''}|${d.camadaId ?? ''}|${d.mensagem}`

/** Recusa (PUSH_ALTERA_GRADE) se o push mexe em membro de grade, cria vínculo novo com grade ou piora `conferirGrade`. */
function exigirGradeIntocada(base: Camada[], mescladas: Camada[], paginaId: string): void {
  const ids = new Set([...idsDeGradeEm(base), ...idsDeGradeEm(mescladas)])
  const membrosDaBase = new Map(base.filter((c) => vinculadaAGrade(c, ids)).map((c) => [c.id, c]))
  const doResultado = new Map(mescladas.map((c) => [c.id, c]))
  for (const [id, antes] of membrosDaBase) {
    const depois = doResultado.get(id)
    if (!depois || desenhoDoMembro(depois) !== desenhoDoMembro(antes)) throw new RecusaDoPushDoDesktop('PUSH_ALTERA_GRADE', paginaId, id)
  }
  const intrusa = mescladas.find((c) => vinculadaAGrade(c, ids) && !membrosDaBase.has(c.id))
  if (intrusa) throw new RecusaDoPushDoDesktop('PUSH_ALTERA_GRADE', paginaId, intrusa.id)
  const antes = new Set(conferirGrade(base as unknown as Layer[]).map(chaveDoDiagnostico))
  const nova = conferirGrade(mescladas as unknown as Layer[]).find((d) => !antes.has(chaveDoDiagnostico(d)))
  if (nova) throw new RecusaDoPushDoDesktop('PUSH_ALTERA_GRADE', paginaId, nova.camadaId)
}

/** Página NOVA do push (sem base para mesclar): o desktop não cria grade. Camadas ilegíveis seguem a regra de antes. */
export function exigirPaginaNovaSemGrade(layersRaw: unknown, paginaId: string): void {
  const camadas = lerCamadasEstritas(layersRaw)
  if (camadas) exigirGradeIntocada([], camadas, paginaId)
}

const formaDe = (c: Objeto): unknown => (temValor(c.shape) ? c.shape : ehObjeto(c.style) ? c.style.shapeType : undefined)

/** Ids de página repetidos no payload (R4). Páginas sem id ficam de fora — elas casam por ordem/nome. */
export function idsDePaginaRepetidos(paginas: Array<{ id?: unknown }>): string[] {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const p of paginas) {
    if (typeof p?.id !== 'string' || p.id.length === 0) continue
    if (vistos.has(p.id)) repetidos.add(p.id)
    vistos.add(p.id)
  }
  return [...repetidos]
}

/**
 * As camadas que o push grava numa página, mescladas sobre a BASE RELIDA (string JSON), ou a recusa.
 *
 * - camada casada por id: o payload vence no que manda; o que ele não traz (topo, `style`, `metadata`) fica da base;
 *   na camada PROTEGIDA a identidade vem sempre da base, e trocar `type`/forma é recusa;
 * - camada protegida da base ausente do payload: recusa (preservar faria ela voltar depois de apagada no desktop);
 * - camada comum ausente: sai, como sempre (limite declarado: sem versionar o pull não há como distinguir);
 * - página casada por ordem/nome (id ausente ou de outro template) e protegida: recusa — pode ser outra página.
 */
export function mesclarCamadasDoDesktop(
  baseRaw: unknown,
  payloadRaw: unknown,
  opcoes: { paginaId: string; casadaPorFallback: boolean },
): string {
  const { paginaId } = opcoes
  const base = lerCamadasEstritas(baseRaw)
  if (!base) throw new RecusaDoPushDoDesktop('PUSH_BASE_ILEGIVEL', paginaId)
  const payload = lerCamadasEstritas(payloadRaw)
  if (!payload) throw new RecusaDoPushDoDesktop('PUSH_CAMADAS_ILEGIVEIS', paginaId)

  const protegidas = base.filter(ehCamadaProtegida)
  if (opcoes.casadaPorFallback && protegidas.length > 0) {
    throw new RecusaDoPushDoDesktop('PUSH_PAGINA_INCERTA', paginaId)
  }
  const repetido = (camadas: Camada[]) => camadas.find((c, i) => camadas.findIndex((o) => o.id === c.id) !== i)
  const repetidaNoPayload = repetido(payload)
  if (repetidaNoPayload) throw new RecusaDoPushDoDesktop('PUSH_CAMADAS_DUPLICADAS', paginaId, repetidaNoPayload.id)
  const repetidaNaBase = protegidas.length > 0 ? repetido(base) : undefined
  if (repetidaNaBase) throw new RecusaDoPushDoDesktop('PUSH_CAMADAS_DUPLICADAS', paginaId, repetidaNaBase.id)

  const idsDoPayload = new Set(payload.map((c) => c.id))
  const ausente = protegidas.find((c) => !idsDoPayload.has(c.id))
  if (ausente) throw new RecusaDoPushDoDesktop('PUSH_APAGARIA_CAMADA', paginaId, ausente.id)

  const daBase = new Map(base.map((c) => [c.id, c]))
  const mescladas = payload.map((doPayload) => {
    const anterior = daBase.get(doPayload.id)
    if (!anterior) return doPayload
    const protegida = ehCamadaProtegida(anterior)
    if (!protegida && temValor(doPayload.type) && doPayload.type !== anterior.type) return doPayload
    if (protegida) {
      const formaNova = formaDe(doPayload)
      if ((temValor(doPayload.type) && doPayload.type !== anterior.type) || (temValor(formaNova) && formaNova !== formaDe(anterior))) {
        throw new RecusaDoPushDoDesktop('PUSH_ALTERA_VETOR', paginaId, doPayload.id)
      }
    }
    const styleBase = ehObjeto(anterior.style) ? anterior.style : {}
    const metaBase = ehObjeto(anterior.metadata) ? anterior.metadata : {}
    const camada: Objeto = {
      ...anterior,
      ...doPayload,
      style: { ...styleBase, ...(ehObjeto(doPayload.style) ? doPayload.style : {}) },
      metadata: { ...metaBase, ...(ehObjeto(doPayload.metadata) ? doPayload.metadata : {}) },
    }
    if (protegida) {
      // A identidade vem SEMPRE da base — `null`/ausente no payload não apaga, e chave que a base não tem não nasce.
      const style = camada.style as Objeto
      const metadata = camada.metadata as Objeto
      camada.type = anterior.type
      if ('shape' in anterior) camada.shape = anterior.shape
      else delete camada.shape
      for (const k of IDENTIDADE_NO_STYLE) {
        if (k in styleBase) style[k] = styleBase[k]
        else delete style[k]
      }
      for (const k of IDENTIDADE_NO_METADATA) {
        if (k in metaBase) metadata[k] = metaBase[k]
        else delete metadata[k]
      }
    }
    if (!('style' in anterior) && !('style' in doPayload)) delete camada.style
    if (!('metadata' in anterior) && !('metadata' in doPayload)) delete camada.metadata
    return camada as Camada
  })
  exigirGradeIntocada(base, mescladas, paginaId)
  return JSON.stringify(mescladas)
}
