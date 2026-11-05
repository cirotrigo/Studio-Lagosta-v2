/**
 * Importador de SVG para CURADORIA (CP-V6, arquitetura de vetores §6). Puro: sem `@/lib/db`, sem Konva, sem rede e
 * sem arquivo — quem lê o arquivo e escreve a saída é o CLI (`scripts/importar-vetor.ts`). Nunca lança.
 *
 * Entra o texto do SVG; sai uma PROPOSTA de entrada de catálogo (`ElementoCandidato` de `shapes-library.ts`), sempre
 * `status: 'proposta'` e `ativada: false`. Nenhum SVG é guardado: só os paths normalizados.
 *
 * - XML ESTRITO, lido aqui (o subconjunto que o importador aceita; nenhum parser XML é dependência do projeto): só
 *   UTF-8; recusa DOCTYPE, CDATA, instrução de processamento, entidade fora das 5 predefinidas, atributo duplicado, texto,
 *   prefixo de namespace e qualquer erro de boa formação — nunca "recupera".
 * - Allowlist de elementos e atributos da arquitetura §6.2–6.3 (`use`, `style`, `class`, `id`, gradiente: recusa).
 * - Normaliza para `M L C Q Z` absolutos (arcos em cúbicas, transforms aplicados, viewBox em `0 0 w h`), 2 casas.
 * - Tetos medidos DEPOIS da expansão e do arredondamento, com as constantes das portas (`partes.ts`, `validar.ts`), e a
 *   entrada final passa pelo `problemasDoVetor` — o importador recusa antes o que a porta recusaria.
 * - O que o contrato não representa com fidelidade é RECUSADO com código, nunca achatado: opacidade < 1, espessuras
 *   diferentes, transform não uniforme num contorno, multicor só de contornos (silhueta invisível na inserção).
 * - Cor de origem só SEPARA slots: o papel da marca de cada slot vem da curadoria (`Curadoria.slots`); sem ela, a
 *   pendência é listada e o papel fica ausente (nunca inferido).
 */
import { CATEGORIAS_CANDIDATAS, type CategoriaDoElemento, type ElementoCandidato } from '@/lib/assets/shapes-library'
import { PAPEIS_DA_MARCA, type PapelDaMarca } from '@/lib/brand/papeis-de-cor'
import { MAX_COMANDOS_DAS_PARTES, MAX_PARTES, MAX_SLOTS, SLOT_VALIDO } from './partes'
import type { ParteDoVetor, SlotDeCor } from './tipos'
import { PATH_DATA_MAX_BYTES, validarPathData } from './validar'
import { problemasDoVetor } from './validar-camada'

/** Arquivo de entrada (arquitetura §6.6). */
export const ENTRADA_MAX_BYTES = 64 * 1024
/** Largura e altura máximas do viewBox (arquitetura §6.4). */
export const VIEWBOX_MAX = 4096
/**
 * Proporção máxima do viewBox, nos dois sentidos. A inserção (`camadaDoElemento`) usa largura ≤ 360 e altura = largura /
 * proporção: 1:100 já dá 4 px num sentido e 35600 px no outro. Os itens do catálogo vão de 0,4 a 10.
 */
export const PROPORCAO_MAX = 100
/** |coordenada| final máxima: 24× o viewBox máximo — além disso é desenho fora de qualquer caixa (ou número absurdo). */
export const COORDENADA_MAX = 100_000
/** Limites de CURADORIA do v1 (SVG-ELEMENTOS §7.1): informação para quem cura, não admissão técnica. */
export const LIMITES_DE_CURADORIA = { subpaths: 4, segmentos: 120, bytes: 4 * 1024 } as const
const PROFUNDIDADE_MAX = 32
const SVG_NS = 'http://www.w3.org/2000/svg'
/** Cor de vitrine: o cinza neutro dos itens do catálogo (a inserção nunca a lê). */
const VITRINE = '#374151'

export interface Problema {
  codigo: string
  mensagem: string
}

export interface CuradoriaDoSlot {
  id: string
  papelPadrao: PapelDaMarca
  rotulo?: string
}

export interface Curadoria {
  id?: string
  label?: string
  category?: CategoriaDoElemento
  keywords?: string[]
  versao?: number
  ajuste?: 'travado' | 'livre'
  /** Cor de origem (`#rgb`/`#rrggbb`) → slot e papel da marca escolhidos por quem cura. */
  slots?: Record<string, CuradoriaDoSlot>
}

export type EntradaProposta = Omit<ElementoCandidato, 'id' | 'label' | 'category' | 'slots'> & {
  id?: string
  label?: string
  category?: CategoriaDoElemento
  slots: Array<Omit<SlotDeCor, 'papelPadrao'> & { papelPadrao?: PapelDaMarca }>
}

export interface PropostaDeVetor {
  formato: 'studio-lagosta/proposta-de-vetor'
  versaoDoFormato: 1
  status: 'proposta'
  ativada: false
  entrada: EntradaProposta
  /** Cor de origem de cada slot (só separa slots; nunca é cor da marca). */
  coresDeOrigem: Record<string, string>
  pendencias: string[]
  avisos: Problema[]
  metricas: { bytesDeEntrada: number; partes: number; slots: number; subpaths: number; comandos: number; bytesDosPaths: number }
  elegivelParaCatalogo: { ok: boolean; limites: typeof LIMITES_DE_CURADORIA; motivos: string[] }
}

export type ResultadoDaImportacao = { ok: true; proposta: PropostaDeVetor } | ({ ok: false } & Problema)

class Recusa extends Error {
  constructor(readonly codigo: string, mensagem: string) {
    super(mensagem)
  }
}
const recusar = (codigo: string, mensagem: string): never => {
  throw new Recusa(codigo, mensagem)
}

// ── XML estrito ──────────────────────────────────────────────────────────────

interface No {
  nome: string
  atributos: Map<string, string>
  filhos: No[]
}

const NOME = /[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?/y
const ENTIDADES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
const CHAR_PROIBIDO = /[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/

function lerXml(texto: string): No {
  if (CHAR_PROIBIDO.test(texto)) recusar('XML_MALFORMADO', 'caractere de controle proibido em XML')
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0
  const erro = (msg: string) => recusar('XML_MALFORMADO', `${msg} (posição ${i})`)
  const espaco = () => {
    while (i < texto.length && ' \t\r\n'.includes(texto[i])) i++
  }
  const nome = () => {
    NOME.lastIndex = i
    const m = NOME.exec(texto)
    if (!m) erro('nome esperado')
    i += m![0].length
    return m![0]
  }
  const comentario = () => {
    const fim = texto.indexOf('-->', i + 4)
    if (fim < 0) erro('comentário sem fim')
    const corpo = texto.slice(i + 4, fim)
    if (corpo.includes('--') || corpo.endsWith('-')) erro('"--" dentro de comentário')
    i = fim + 3
  }
  // fora de elemento: espaço e comentários; DOCTYPE, CDATA e instruções recusados com código próprio
  const diversos = () => {
    for (;;) {
      espaco()
      if (texto.startsWith('<!--', i)) comentario()
      else if (texto.startsWith('<!DOCTYPE', i)) recusar('DOCTYPE_RECUSADO', 'DOCTYPE não é aceito (sem DTD nem entidades)')
      else if (texto.startsWith('<![CDATA[', i)) recusar('CDATA_RECUSADO', 'CDATA não é aceito')
      else if (texto.startsWith('<?', i)) recusar('INSTRUCAO_RECUSADA', 'instrução de processamento fora da declaração XML')
      else if (texto.startsWith('<!', i)) recusar('XML_MALFORMADO', `declaração "${texto.slice(i, i + 12)}" não é aceita`)
      else return
    }
  }
  const valor = (aspa: string) => {
    let saida = ''
    for (;;) {
      if (i >= texto.length) erro('atributo sem fim')
      const c = texto[i]
      if (c === aspa) {
        i++
        return saida
      }
      if (c === '<') erro('"<" dentro de atributo')
      if (c === '&') {
        const fim = texto.indexOf(';', i)
        const ref = fim < 0 ? '' : texto.slice(i + 1, fim)
        let ch: string | undefined
        if (/^#[0-9]{1,7}$/.test(ref)) ch = codigoValido(Number(ref.slice(1)))
        else if (/^#x[0-9a-fA-F]{1,6}$/.test(ref)) ch = codigoValido(parseInt(ref.slice(2), 16))
        else if (Object.hasOwn(ENTIDADES, ref)) ch = ENTIDADES[ref]
        else recusar('ENTIDADE_RECUSADA', `entidade "&${ref.slice(0, 20)};" não é das 5 predefinidas do XML`)
        if (ch === undefined) erro('referência de caractere inválida')
        saida += ch
        i = fim + 1
        continue
      }
      saida += c === '\t' || c === '\n' || c === '\r' ? ' ' : c
      i++
    }
  }
  const elemento = (profundidade: number): No => {
    if (profundidade > PROFUNDIDADE_MAX) recusar('XML_PROFUNDO_DEMAIS', `aninhamento acima de ${PROFUNDIDADE_MAX}`)
    i++ // '<'
    const no: No = { nome: nome(), atributos: new Map(), filhos: [] }
    for (;;) {
      const antes = i
      espaco()
      if (texto.startsWith('/>', i)) {
        i += 2
        return no
      }
      if (texto[i] === '>') {
        i++
        break
      }
      if (i === antes) erro('espaço esperado entre atributos')
      const chave = nome()
      espaco()
      if (texto[i] !== '=') erro(`"=" esperado depois de ${chave}`)
      i++
      espaco()
      const aspa = texto[i]
      if (aspa !== '"' && aspa !== "'") erro(`aspas esperadas em ${chave}`)
      i++
      const v = valor(aspa)
      if (no.atributos.has(chave)) recusar('ATRIBUTO_DUPLICADO', `atributo "${chave}" duplicado em <${no.nome}>`)
      no.atributos.set(chave, v)
    }
    for (;;) {
      const inicio = i
      while (i < texto.length && texto[i] !== '<') i++
      if (texto.slice(inicio, i).trim()) recusar(Object.hasOwn(ATRIBUTOS, no.nome) ? 'TEXTO_RECUSADO' : 'ELEMENTO_RECUSADO', `texto dentro de <${no.nome}> não é aceito`)
      if (i >= texto.length) erro(`<${no.nome}> sem fechamento`)
      if (texto.startsWith('</', i)) {
        i += 2
        const fecha = nome()
        if (fecha !== no.nome) erro(`</${fecha}> fecha <${no.nome}>`)
        espaco()
        if (texto[i] !== '>') erro('">" esperado')
        i++
        return no
      }
      if (texto.startsWith('<!--', i)) comentario()
      else if (texto.startsWith('<![CDATA[', i)) recusar('CDATA_RECUSADO', 'CDATA não é aceito')
      else if (texto.startsWith('<?', i)) recusar('INSTRUCAO_RECUSADA', 'instrução de processamento dentro do documento')
      else if (texto.startsWith('<!', i)) erro('declaração dentro de elemento')
      else no.filhos.push(elemento(profundidade + 1))
    }
  }

  if (texto.startsWith('<?xml', i) && /[\s?]/.test(texto[i + 5] ?? '')) {
    const fim = texto.indexOf('?>', i)
    const decl = fim < 0 ? '' : texto.slice(i, fim + 2)
    const m = /^<\?xml\s+version\s*=\s*(["'])1\.\d+\1(?:\s+encoding\s*=\s*(["'])([A-Za-z][\w.-]*)\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\4)?\s*\?>$/.exec(decl)
    if (!m) erro('declaração XML inválida')
    if (m![3] && m![3].toLowerCase() !== 'utf-8') recusar('CODIFICACAO_RECUSADA', `codificação ${m![3]} (só UTF-8)`)
    i = fim + 2
  }
  diversos()
  if (texto[i] !== '<') erro('elemento raiz esperado')
  const raiz = elemento(0)
  diversos()
  if (i < texto.length) erro('conteúdo depois do elemento raiz')
  return raiz
}

function codigoValido(n: number): string | undefined {
  const ok = n === 0x9 || n === 0xa || n === 0xd || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff)
  return ok ? String.fromCodePoint(n) : undefined
}

// ── Allowlist ────────────────────────────────────────────────────────────────

const APRESENTACAO = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'opacity']
const ATRIBUTOS: Record<string, string[]> = {
  svg: ['xmlns', 'viewBox', 'width', 'height', ...APRESENTACAO],
  g: [...APRESENTACAO, 'transform'],
  path: ['d', ...APRESENTACAO, 'transform'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', ...APRESENTACAO, 'transform'],
  circle: ['cx', 'cy', 'r', ...APRESENTACAO, 'transform'],
  ellipse: ['cx', 'cy', 'rx', 'ry', ...APRESENTACAO, 'transform'],
  line: ['x1', 'y1', 'x2', 'y2', ...APRESENTACAO, 'transform'],
  polyline: ['points', ...APRESENTACAO, 'transform'],
  polygon: ['points', ...APRESENTACAO, 'transform'],
}

function conferirNo(no: No, raiz: boolean): void {
  if (no.nome.includes(':')) recusar('NAMESPACE_RECUSADO', `elemento com prefixo <${no.nome}>`)
  if (!Object.hasOwn(ATRIBUTOS, no.nome)) recusar('ELEMENTO_RECUSADO', `<${no.nome}> fora da lista de elementos aceitos`)
  if (no.nome === 'svg' && !raiz) recusar('SVG_ANINHADO', '<svg> dentro de <svg> não é aceito')
  if (raiz && no.nome !== 'svg') recusar('ELEMENTO_RECUSADO', `a raiz tem de ser <svg>, não <${no.nome}>`)
  for (const [chave, v] of no.atributos) {
    if (chave.includes(':')) recusar('NAMESPACE_RECUSADO', `atributo com prefixo "${chave}" em <${no.nome}>`)
    if (!ATRIBUTOS[no.nome].includes(chave) && !(chave === 'xmlns' && v === SVG_NS)) {
      recusar('ATRIBUTO_RECUSADO', `atributo "${chave}" fora da lista aceita em <${no.nome}>`)
    }
  }
  const ns = no.atributos.get('xmlns')
  if (raiz && ns !== SVG_NS) recusar('NAMESPACE_RECUSADO', `a raiz precisa de xmlns="${SVG_NS}"`)
  if (ns !== undefined && ns !== SVG_NS) recusar('NAMESPACE_RECUSADO', `xmlns "${ns}" não é o do SVG`)
  const forma = no.nome !== 'svg' && no.nome !== 'g'
  if (forma && no.filhos.length) recusar('ELEMENTO_RECUSADO', `<${no.nome}> não aceita filhos (<${no.filhos[0].nome}>)`)
  for (const f of no.filhos) conferirNo(f, false)
}

// ── Números, cores, transforms ──────────────────────────────────────────────

const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?'
const NUMERO_INTEIRO = new RegExp(`^${NUM}$`)

function numero(texto: string | undefined, onde: string, padrao?: number, comPx = true): number {
  if (texto === undefined) {
    if (padrao === undefined) recusar('GEOMETRIA_INVALIDA', `${onde} ausente`)
    return padrao!
  }
  const t = comPx ? texto.trim().replace(/px$/, '') : texto.trim()
  const v = NUMERO_INTEIRO.test(t) ? Number(t) : NaN
  if (!Number.isFinite(v)) recusar('GEOMETRIA_INVALIDA', `${onde}="${texto.slice(0, 20)}" não é número (unidade e % não são aceitas)`)
  return v
}

/** Lista de números separados por vírgula/espaço (no máximo uma vírgula entre dois números). */
/**
 * Lista de números de `viewBox`, `points` e argumentos de transform: cada número SEPARADO do próximo por espaço ou
 * vírgula (SVG 1.1 §7.6–7.7). `10.5.5` e `10-5` são recusados aqui — a forma compacta só vale no `d`, que tem leitor próprio.
 */
function listaDeNumeros(t: string, onde: string, codigo = 'GEOMETRIA_INVALIDA'): number[] {
  const re = new RegExp(NUM, 'y')
  const saida: number[] = []
  let i = 0
  const ws = () => {
    while (i < t.length && ' \t\r\n'.includes(t[i])) i++
  }
  ws()
  while (i < t.length) {
    re.lastIndex = i
    const m = re.exec(t)
    const v = m ? Number(m[0]) : NaN
    if (!Number.isFinite(v)) recusar(codigo, `${onde} com lista de números inválida`)
    saida.push(v)
    i += m![0].length
    if (i < t.length && !' \t\r\n,'.includes(t[i])) recusar(codigo, `${onde}: números colados perto de "${t.slice(i - m![0].length, i + 4)}" (separe com espaço ou vírgula)`)
    ws()
    if (t[i] === ',') {
      i++
      ws()
      if (i >= t.length) recusar(codigo, `${onde} termina em vírgula`)
    }
  }
  return saida
}

type Cor = string | 'none'

function cor(texto: string, onde: string): Cor {
  const t = texto.trim()
  if (t === 'none') return 'none'
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t)
  if (!m) recusar('COR_RECUSADA', `${onde}="${t.slice(0, 30)}": só hex sólido (#rgb, #rrggbb) ou none`)
  const h = m![1].toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

type Matriz = [number, number, number, number, number, number]
const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0]
const mult = (m: Matriz, n: Matriz): Matriz => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const ARIDADE_DO_TRANSFORM: Record<string, number[]> = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] }

function transform(texto: string): Matriz {
  let m = IDENTIDADE
  const re = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*(,)?/y
  let i = 0
  const t = texto.trim()
  let ultimaVirgula = false
  while (i < t.length) {
    re.lastIndex = i
    const r = re.exec(t)
    if (!r) recusar('TRANSFORM_INVALIDO', `transform "${t.slice(0, 40)}" fora da gramática`)
    const nome = r![1]
    const a = listaDeNumeros(r![2], `transform ${nome}`, 'TRANSFORM_INVALIDO')
    if (!ARIDADE_DO_TRANSFORM[nome].includes(a.length)) recusar('TRANSFORM_INVALIDO', `${nome} com ${a.length} número(s)`)
    const rad = (g: number) => (g * Math.PI) / 180
    let n: Matriz
    if (nome === 'matrix') n = a as Matriz
    else if (nome === 'translate') n = [1, 0, 0, 1, a[0], a[1] ?? 0]
    else if (nome === 'scale') n = [a[0], 0, 0, a[1] ?? a[0], 0, 0]
    else if (nome === 'rotate') {
      const [c, s] = [Math.cos(rad(a[0])), Math.sin(rad(a[0]))]
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0]
      n = mult(mult([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy])
    } else if (nome === 'skewX') n = [1, 0, Math.tan(rad(a[0])), 1, 0, 0]
    else n = [1, Math.tan(rad(a[0])), 0, 1, 0, 0]
    m = mult(m, n)
    i = re.lastIndex
    ultimaVirgula = r![3] === ','
  }
  if (ultimaVirgula) recusar('TRANSFORM_INVALIDO', 'vírgula sobrando no fim do transform')
  if (!m.every(Number.isFinite) || Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-12) recusar('TRANSFORM_INVALIDO', 'transform singular ou não finito')
  return m
}

/** Escala uniforme (rotação/translação/espelho permitidos): o fator, ou `null` se esticar diferente nos eixos. */
function escalaUniforme(m: Matriz): number | null {
  const sx = Math.hypot(m[0], m[1])
  const sy = Math.hypot(m[2], m[3])
  const tol = 1e-9 * Math.max(1, sx, sy)
  return Math.abs(sx - sy) <= tol && Math.abs(m[0] * m[2] + m[1] * m[3]) <= tol * Math.max(1, sx * sy) ? sx : null
}

// ── Geometria: segmentos absolutos M L C Q Z ────────────────────────────────

type Seg = { c: 'M' | 'L'; p: [number, number] } | { c: 'C'; p: [number, number, number, number, number, number] } | { c: 'Q'; p: [number, number, number, number] } | { c: 'Z' }

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }

/** Path com a gramática SVG COMPLETA (relativos, H/V/S/T, flags coladas, `10.e5`), para segmentos absolutos. */
function lerPath(d: string): Seg[] {
  const numero = new RegExp(NUM, 'y')
  let i = 0
  const erro = (msg: string): never => recusar('PATH_INVALIDO', `${msg} (posição ${i} do d)`)
  const ws = () => {
    while (i < d.length && ' \t\r\n'.includes(d[i])) i++
  }
  // separador depois de um número: espaços com no máximo uma vírgula, que exige um número depois
  const sep = () => {
    ws()
    if (d[i] === ',') {
      i++
      ws()
      if (i >= d.length || /[A-Za-z,]/.test(d[i])) erro('vírgula sem número depois')
    }
  }
  const lerNumero = () => {
    numero.lastIndex = i
    const m = numero.exec(d)
    if (!m) erro(`número esperado perto de "${d.slice(i, i + 10)}"`)
    i += m![0].length
    const v = Number(m![0])
    if (!Number.isFinite(v)) erro('número não finito')
    sep()
    return v
  }
  const lerFlag = () => {
    if (d[i] !== '0' && d[i] !== '1') erro('flag de arco tem de ser 0 ou 1')
    const v = d[i] === '1' ? 1 : 0
    i++
    sep()
    return v
  }

  const saida: Seg[] = []
  let [x, y, sx, sy] = [0, 0, 0, 0]
  let controle: [number, number] | null = null // último controle de C/S ou Q/T, para a reflexão
  let ultimo = ''
  let fechou = false
  const desenha = () => {
    if (fechou) {
      saida.push({ c: 'M', p: [sx, sy] }) // comando depois de Z sem M: subpath novo no ponto inicial (SVG §9.3.4)
      fechou = false
    }
  }
  ws()
  if (!/[Mm]/.test(d[i] ?? '')) erro('o path tem de começar com M')
  let cmd = ''
  while (i < d.length) {
    if (/[A-Za-z]/.test(d[i])) {
      cmd = d[i]
      if (!(cmd.toLowerCase() in ARGS)) erro(`comando "${cmd}" desconhecido`)
      i++
      ws()
      if (d[i] === ',') erro(`vírgula logo depois de ${cmd}`)
    } else if (!cmd || cmd.toLowerCase() === 'z') {
      erro(`número sem comando perto de "${d.slice(i, i + 10)}"`)
    }
    const rel = cmd === cmd.toLowerCase()
    const k = cmd.toLowerCase()
    let grupos = 0
    do {
      const dx = rel ? x : 0
      const dy = rel ? y : 0
      if (k === 'z') {
        saida.push({ c: 'Z' })
        ;[x, y] = [sx, sy]
        fechou = true
        controle = null
        ultimo = 'z'
        break
      }
      if (k === 'm') {
        const p: [number, number] = [lerNumero() + dx, lerNumero() + dy]
        if (grupos === 0) {
          saida.push({ c: 'M', p })
          ;[sx, sy] = p
          fechou = false
        } else {
          desenha()
          saida.push({ c: 'L', p })
        }
        ;[x, y] = p
        controle = null
      } else if (k === 'l' || k === 'h' || k === 'v') {
        desenha()
        const nx = k === 'v' ? x : lerNumero() + dx
        const ny = k === 'h' ? y : lerNumero() + dy
        saida.push({ c: 'L', p: [nx, ny] })
        ;[x, y] = [nx, ny]
        controle = null
      } else if (k === 'c' || k === 's') {
        desenha()
        const [rx1, ry1] = k === 's' ? (controle && 'cs'.includes(ultimo) ? [2 * x - controle[0], 2 * y - controle[1]] : [x, y]) : [lerNumero() + dx, lerNumero() + dy]
        const p: [number, number, number, number, number, number] = [rx1, ry1, lerNumero() + dx, lerNumero() + dy, lerNumero() + dx, lerNumero() + dy]
        saida.push({ c: 'C', p })
        controle = [p[2], p[3]]
        ;[x, y] = [p[4], p[5]]
      } else if (k === 'q' || k === 't') {
        desenha()
        const [qx, qy] = k === 't' ? (controle && 'qt'.includes(ultimo) ? [2 * x - controle[0], 2 * y - controle[1]] : [x, y]) : [lerNumero() + dx, lerNumero() + dy]
        const p: [number, number, number, number] = [qx, qy, lerNumero() + dx, lerNumero() + dy]
        saida.push({ c: 'Q', p })
        controle = [qx, qy]
        ;[x, y] = [p[2], p[3]]
      } else {
        desenha()
        const [rx, ry, rot] = [lerNumero(), lerNumero(), lerNumero()]
        const [grande, horario] = [lerFlag(), lerFlag()]
        const [nx, ny] = [lerNumero() + dx, lerNumero() + dy]
        for (const c of arcoEmCubicas(x, y, rx, ry, rot, grande, horario, nx, ny)) saida.push(c)
        ;[x, y] = [nx, ny]
        controle = null
      }
      ultimo = k
      grupos++
      ws()
    } while (i < d.length && !/[A-Za-z]/.test(d[i]))
  }
  return saida
}

/** Arco SVG (parametrização de ponta, F.6.5) em cúbicas de no máximo 90°; raio 0 vira reta, raio curto é escalado (F.6.6). */
function arcoEmCubicas(x1: number, y1: number, rx: number, ry: number, graus: number, grande: number, horario: number, x2: number, y2: number): Seg[] {
  if (x1 === x2 && y1 === y2) return []
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx === 0 || ry === 0) return [{ c: 'L', p: [x2, y2] }]
  const phi = (((graus % 360) + 360) % 360) * (Math.PI / 180)
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)]
  const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2]
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (grande !== horario ? 1 : -1) * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angulo = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const [ux, uy] = [(x1p - cxp) / rx, (y1p - cyp) / ry]
  const t1 = angulo(1, 0, ux, uy)
  let dt = angulo(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!horario && dt > 0) dt -= 2 * Math.PI
  if (horario && dt < 0) dt += 2 * Math.PI
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9))
  const passo = dt / n
  const k = (4 / 3) * Math.tan(passo / 4)
  const ponto = (px: number, py: number): [number, number] => [cx + rx * px * cos - ry * py * sin, cy + rx * px * sin + ry * py * cos]
  const saida: Seg[] = []
  for (let j = 0; j < n; j++) {
    const a1 = t1 + j * passo
    const a2 = a1 + passo
    const c1 = ponto(Math.cos(a1) - k * Math.sin(a1), Math.sin(a1) + k * Math.cos(a1))
    const c2 = ponto(Math.cos(a2) + k * Math.sin(a2), Math.sin(a2) - k * Math.cos(a2))
    const fim = j === n - 1 ? [x2, y2] : ponto(Math.cos(a2), Math.sin(a2))
    saida.push({ c: 'C', p: [c1[0], c1[1], c2[0], c2[1], fim[0], fim[1]] })
  }
  return saida
}

function elipse(cx: number, cy: number, rx: number, ry: number): Seg[] {
  return [
    { c: 'M', p: [cx + rx, cy] },
    ...arcoEmCubicas(cx + rx, cy, rx, ry, 0, 0, 1, cx - rx, cy),
    ...arcoEmCubicas(cx - rx, cy, rx, ry, 0, 0, 1, cx + rx, cy),
    { c: 'Z' },
  ]
}

/** A geometria do elemento em segmentos absolutos LOCAIS; `null` = a especificação não desenha nada (tamanho 0). */
function geometria(no: No): Seg[] | null {
  const a = (k: string) => no.atributos.get(k)
  const naoNegativo = (v: number, onde: string) => (v < 0 ? recusar('GEOMETRIA_INVALIDA', `${onde} negativo em <${no.nome}>`) : v)
  switch (no.nome) {
    case 'path': {
      const d = a('d')
      if (d === undefined || !d.trim()) return null
      const segs = lerPath(d)
      return segs.some((s) => s.c !== 'M' && s.c !== 'Z') ? segs : null // só M/Z: nada a pintar
    }
    case 'rect': {
      const [x, y] = [numero(a('x'), 'x', 0), numero(a('y'), 'y', 0)]
      const w = naoNegativo(numero(a('width'), 'width de <rect>'), 'width')
      const h = naoNegativo(numero(a('height'), 'height de <rect>'), 'height')
      if (w === 0 || h === 0) return null
      const rxDeclarado = a('rx') === undefined ? undefined : naoNegativo(numero(a('rx'), 'rx'), 'rx')
      const ryDeclarado = a('ry') === undefined ? undefined : naoNegativo(numero(a('ry'), 'ry'), 'ry')
      // o raio omitido herda o DECLARADO do outro eixo; só depois cada eixo é limitado à metade do seu lado (SVG 2 §10.2)
      const rx = Math.min(rxDeclarado ?? ryDeclarado ?? 0, w / 2)
      const ry = Math.min(ryDeclarado ?? rxDeclarado ?? 0, h / 2)
      if (rx === 0 || ry === 0) return [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + w, y] }, { c: 'L', p: [x + w, y + h] }, { c: 'L', p: [x, y + h] }, { c: 'Z' }]
      return [
        { c: 'M', p: [x + rx, y] },
        { c: 'L', p: [x + w - rx, y] },
        ...arcoEmCubicas(x + w - rx, y, rx, ry, 0, 0, 1, x + w, y + ry),
        { c: 'L', p: [x + w, y + h - ry] },
        ...arcoEmCubicas(x + w, y + h - ry, rx, ry, 0, 0, 1, x + w - rx, y + h),
        { c: 'L', p: [x + rx, y + h] },
        ...arcoEmCubicas(x + rx, y + h, rx, ry, 0, 0, 1, x, y + h - ry),
        { c: 'L', p: [x, y + ry] },
        ...arcoEmCubicas(x, y + ry, rx, ry, 0, 0, 1, x + rx, y),
        { c: 'Z' },
      ]
    }
    case 'circle': {
      const r = naoNegativo(numero(a('r'), 'r de <circle>'), 'r')
      return r === 0 ? null : elipse(numero(a('cx'), 'cx', 0), numero(a('cy'), 'cy', 0), r, r)
    }
    case 'ellipse': {
      const rx = naoNegativo(numero(a('rx'), 'rx de <ellipse>'), 'rx')
      const ry = naoNegativo(numero(a('ry'), 'ry de <ellipse>'), 'ry')
      return rx === 0 || ry === 0 ? null : elipse(numero(a('cx'), 'cx', 0), numero(a('cy'), 'cy', 0), rx, ry)
    }
    case 'line':
      return [
        { c: 'M', p: [numero(a('x1'), 'x1', 0), numero(a('y1'), 'y1', 0)] },
        { c: 'L', p: [numero(a('x2'), 'x2', 0), numero(a('y2'), 'y2', 0)] },
      ]
    default: {
      const n = listaDeNumeros(a('points') ?? '', `points de <${no.nome}>`)
      if (n.length % 2 !== 0) recusar('GEOMETRIA_INVALIDA', `points de <${no.nome}> com número ímpar de coordenadas`)
      if (n.length < 4) recusar('GEOMETRIA_INVALIDA', `<${no.nome}> precisa de pelo menos 2 pontos`)
      const segs: Seg[] = []
      for (let j = 0; j < n.length; j += 2) segs.push({ c: j === 0 ? 'M' : 'L', p: [n[j], n[j + 1]] })
      if (no.nome === 'polygon') segs.push({ c: 'Z' })
      return segs
    }
  }
}

const r2 = (v: number) => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? 0 : r
}

/** Aplica a matriz, arredonda e escreve o `d` final (`M L C Q Z`, números separados por espaço). */
function escrever(segs: Seg[], m: Matriz): string {
  const pts = (p: number[]) => {
    const saida: number[] = []
    for (let j = 0; j < p.length; j += 2) {
      const px = r2(m[0] * p[j] + m[2] * p[j + 1] + m[4])
      const py = r2(m[1] * p[j] + m[3] * p[j + 1] + m[5])
      if (!(Math.abs(px) <= COORDENADA_MAX && Math.abs(py) <= COORDENADA_MAX)) {
        recusar('COORDENADA_FORA_DO_LIMITE', `coordenada final além de ±${COORDENADA_MAX}`)
      }
      saida.push(px, py)
    }
    return saida.join(' ')
  }
  return segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${pts(s.p)}`)).join(' ')
}

// ── Pintura: herança, partes ────────────────────────────────────────────────

interface Herdado {
  fill: Cor | undefined
  stroke: Cor
  largura: number
  regra: 'nonzero' | 'evenodd'
  matriz: Matriz
}

interface ParteBruta {
  d: string
  cor: string
  alvo: 'fill' | 'stroke'
  regra: 'nonzero' | 'evenodd'
  espessura?: number
}

function herdar(no: No, pai: Herdado, raiz: boolean): Herdado {
  const a = (k: string) => no.atributos.get(k)
  const op = a('opacity')
  if (op !== undefined && numero(op, 'opacity', undefined, false) !== 1) {
    recusar('OPACIDADE_NAO_REPRESENTAVEL', `opacity="${op}" em <${no.nome}>: a entrada de catálogo não guarda cor nem opacidade de grupo; aceito só 1`)
  }
  const regra = a('fill-rule')
  if (regra !== undefined && regra.trim() !== 'nonzero' && regra.trim() !== 'evenodd') recusar('ATRIBUTO_RECUSADO', `fill-rule="${regra}"`)
  const largura = a('stroke-width') === undefined ? pai.largura : numero(a('stroke-width'), 'stroke-width')
  if (largura < 0) recusar('ESPESSURA_INVALIDA', `stroke-width negativo em <${no.nome}>`)
  return {
    fill: a('fill') === undefined ? pai.fill : cor(a('fill')!, `fill de <${no.nome}>`),
    stroke: a('stroke') === undefined ? pai.stroke : cor(a('stroke')!, `stroke de <${no.nome}>`),
    largura,
    regra: regra === undefined ? pai.regra : (regra.trim() as Herdado['regra']),
    matriz: a('transform') === undefined ? pai.matriz : mult(pai.matriz, transform(a('transform')!)),
  }
}

function coletar(no: No, pai: Herdado, raiz: boolean, partes: ParteBruta[], avisos: Problema[]): void {
  const estilo = herdar(no, pai, raiz)
  if (no.nome === 'svg' || no.nome === 'g') {
    for (const f of no.filhos) coletar(f, estilo, false, partes, avisos)
    return
  }
  const segs = geometria(no)
  if (!segs) {
    avisos.push({ codigo: 'ELEMENTO_SEM_DESENHO', mensagem: `<${no.nome}> com tamanho 0 ou d vazio não desenha (especificação SVG) e ficou de fora` })
    return
  }
  let pintou = false
  if (no.nome !== 'line') {
    let fill = estilo.fill
    if (fill === undefined) {
      fill = '#000000'
      if (!avisos.some((a) => a.codigo === 'FILL_PADRAO_DO_SVG')) {
        avisos.push({ codigo: 'FILL_PADRAO_DO_SVG', mensagem: 'forma sem fill na cadeia: preto, o padrão do SVG' })
      }
    }
    if (fill !== 'none') {
      partes.push({ d: escrever(segs, estilo.matriz), cor: fill, alvo: 'fill', regra: estilo.regra })
      pintou = true
    }
  }
  if (estilo.stroke !== 'none' && estilo.largura > 0) {
    const escala = escalaUniforme(estilo.matriz)
    if (escala === null) recusar('TRANSFORM_NAO_UNIFORME_NO_CONTORNO', `<${no.nome}> com contorno sob transform que estica um eixo mais que o outro: a espessura da camada é uma só`)
    partes.push({ d: escrever(segs, estilo.matriz), cor: estilo.stroke, alvo: 'stroke', regra: estilo.regra, espessura: r2(estilo.largura * escala!) })
    pintou = true
  }
  if (!pintou) avisos.push({ codigo: 'ELEMENTO_SEM_PINTURA', mensagem: `<${no.nome}> sem fill nem stroke visível ficou de fora` })
}

function viewBox(svg: No): [number, number, number, number] {
  const vb = svg.atributos.get('viewBox')
  if (vb === undefined) recusar('VIEWBOX_AUSENTE', 'o <svg> precisa de viewBox')
  const n = listaDeNumeros(vb!, 'viewBox', 'VIEWBOX_INVALIDO')
  if (n.length !== 4) recusar('VIEWBOX_INVALIDO', 'viewBox precisa de 4 números')
  if (!(n[2] > 0 && n[3] > 0)) recusar('VIEWBOX_INVALIDO', 'viewBox com largura e altura > 0')
  if (n[2] > VIEWBOX_MAX || n[3] > VIEWBOX_MAX) recusar('VIEWBOX_GRANDE_DEMAIS', `viewBox ${n[2]}×${n[3]} (máximo ${VIEWBOX_MAX})`)
  const proporcao = n[2] / n[3]
  if (proporcao > PROPORCAO_MAX || proporcao < 1 / PROPORCAO_MAX) {
    recusar('PROPORCAO_EXTREMA', `viewBox ${n[2]}×${n[3]}: proporção além de 1:${PROPORCAO_MAX} (a inserção daria caixa de menos de 4 px ou mais de 35000 px)`)
  }
  for (const k of ['width', 'height']) {
    const v = svg.atributos.get(k)
    if (v !== undefined) {
      const x = numero(v, `${k} do <svg>`)
      if (!(x > 0 && x <= VIEWBOX_MAX)) recusar('VIEWBOX_GRANDE_DEMAIS', `${k} do <svg> fora de (0, ${VIEWBOX_MAX}]`)
    }
  }
  return n as [number, number, number, number]
}

// ── A proposta ──────────────────────────────────────────────────────────────

function proposta(partes: ParteBruta[], vb: [number, number, number, number], curadoria: Curadoria, bytesDeEntrada: number, avisos: Problema[]): PropostaDeVetor {
  if (partes.length === 0) recusar('SEM_DESENHO', 'o SVG não desenha nada')
  const espessuras = [...new Set(partes.filter((p) => p.alvo === 'stroke').map((p) => p.espessura!))]
  if (espessuras.length > 1) recusar('ESPESSURAS_DIFERENTES', `contornos com espessuras ${espessuras.join(', ')}: a camada tem uma espessura só`)
  if (partes.length > MAX_PARTES) recusar('PARTES_DEMAIS', `${partes.length} partes (máximo ${MAX_PARTES})`)
  const cores = [...new Set(partes.map((p) => p.cor))]
  if (cores.length > MAX_SLOTS) recusar('SLOTS_DEMAIS', `${cores.length} cores distintas (máximo ${MAX_SLOTS})`)

  const pendencias: string[] = []
  const mapa = new Map<string, CuradoriaDoSlot>()
  for (const [chave, s] of Object.entries(curadoria.slots ?? {})) {
    let hex = ''
    try {
      hex = cor(chave, 'cor da curadoria')
    } catch {
      recusar('CURADORIA_INVALIDA', `cor "${chave}" da curadoria não é hex`)
    }
    if (!cores.includes(hex)) recusar('CURADORIA_INVALIDA', `a cor ${hex} da curadoria não aparece no SVG (cores: ${cores.join(', ')})`)
    if (!SLOT_VALIDO.test(s.id)) recusar('CURADORIA_INVALIDA', `slot "${s.id}" fora de ${SLOT_VALIDO}`)
    if (!(PAPEIS_DA_MARCA as readonly string[]).includes(s.papelPadrao)) recusar('CURADORIA_INVALIDA', `papel "${s.papelPadrao}" fora de ${PAPEIS_DA_MARCA.join(', ')}`)
    if ([...mapa.values()].some((o) => o.id === s.id)) recusar('CURADORIA_INVALIDA', `slot "${s.id}" usado em duas cores`)
    mapa.set(hex, s)
  }
  if (curadoria.category !== undefined && !CATEGORIAS_CANDIDATAS.some((c) => c.id === curadoria.category)) {
    recusar('CURADORIA_INVALIDA', `categoria "${curadoria.category}" fora de ${CATEGORIAS_CANDIDATAS.map((c) => c.id).join(', ')}`)
  }
  if (curadoria.id !== undefined && !/^[a-z0-9][a-z0-9-]{0,47}$/.test(curadoria.id)) recusar('CURADORIA_INVALIDA', `id "${curadoria.id}" (minúsculas, números e hífen)`)
  if (curadoria.versao !== undefined && !(Number.isInteger(curadoria.versao) && curadoria.versao >= 1)) recusar('CURADORIA_INVALIDA', 'versão é inteiro >= 1')
  for (const [k, v] of [['id', curadoria.id], ['label', curadoria.label], ['category', curadoria.category]] as const) {
    if (v === undefined || v === '') pendencias.push(`${k} do item (curadoria)`)
  }

  // cor → slot injetivo: os ids da curadoria ficam reservados antes de numerar os automáticos (`cor-N`)
  const reservados = new Set([...mapa.values()].map((s) => s.id))
  let n = 0
  const automatico = () => {
    let id: string
    do id = `cor-${++n}`
    while (reservados.has(id))
    return id
  }
  const idDaCor = new Map(cores.map((c) => [c, mapa.get(c)?.id ?? automatico()]))
  const comandosDe = (d: string) => {
    const r = validarPathData(d)
    if (r.ok === false) recusar('NORMALIZACAO_INVALIDA', `path normalizado recusado pelo validador das portas (${(r as Extract<typeof r, { ok: false }>).codigo})`)
    return (r as Extract<typeof r, { ok: true }>).comandos
  }
  const contorno = partes.some((p) => p.alvo === 'stroke')
  if (contorno) {
    avisos.push({ codigo: 'ESPESSURA_EM_PX_DA_CAMADA', mensagem: `strokeWidth ${espessuras[0]} veio em unidades do viewBox; no catálogo é px da camada, constante ao redimensionar — confirme na curadoria` })
    avisos.push({ codigo: 'JUNCAO_REDONDA', mensagem: 'o renderer junta os contornos com lineJoin round; o SVG padrão é miter (cantos vivos ficam arredondados)' })
  }

  // monocor: uma parte, ou só contornos numa cor (concatenar traços opacos de uma cor é a mesma união; fills nunca)
  const monocor = partes.length === 1 || (cores.length === 1 && partes.every((p) => p.alvo === 'stroke'))
  if (!monocor && !partes.some((p) => p.alvo === 'fill')) {
    recusar('SILHUETA_SEM_PREENCHIMENTO', 'multicor só de contornos: a silhueta legada (1ª parte de preenchimento) ficaria invisível na inserção')
  }
  const finais: ParteDoVetor[] = monocor
    ? [{ d: partes.map((p) => p.d).join(' '), slot: idDaCor.get(cores[0])!, alvo: partes[0].alvo, ...(partes[0].alvo === 'fill' && partes[0].regra === 'evenodd' && { fillRule: 'evenodd' as const }) }]
    : partes.map((p) => ({ d: p.d, slot: idDaCor.get(p.cor)!, alvo: p.alvo, ...(p.alvo === 'fill' && p.regra === 'evenodd' && { fillRule: 'evenodd' as const }) }))
  const bytes = finais.reduce((s, p) => s + new TextEncoder().encode(p.d).length, 0)
  if (bytes > PATH_DATA_MAX_BYTES) recusar('PATHS_GRANDES_DEMAIS', `${bytes} bytes de path depois da normalização (máximo ${PATH_DATA_MAX_BYTES})`)
  const comandos = finais.reduce((s, p) => s + comandosDe(p.d), 0)
  if (comandos > MAX_COMANDOS_DAS_PARTES) recusar('COMANDOS_DEMAIS', `${comandos} comandos depois da normalização (máximo ${MAX_COMANDOS_DAS_PARTES})`)
  const subpaths = finais.reduce((s, p) => s + (p.d.match(/M/g)?.length ?? 0), 0)

  const slots = cores.map((hex) => {
    const c = mapa.get(hex)
    const id = idDaCor.get(hex)!
    const canal: SlotDeCor['canal'] = partes.some((p) => p.cor === hex && p.alvo === 'stroke') ? 'contorno' : 'preenchimento'
    if (!c) pendencias.push(`papel da marca da cor ${hex} (slot ${id})`)
    const rotulo = c?.rotulo ?? (canal === 'contorno' ? 'Contorno' : 'Preenchimento')
    return { canal, ...(!monocor && { id }), ...(c && { papelPadrao: c.papelPadrao }), rotulo }
  })
  const pathViewBox: [number, number, number, number] = [0, 0, vb[2], vb[3]]
  const silhueta = finais.find((p) => p.alvo === 'fill') ?? finais[0]
  const entrada: EntradaProposta = {
    ...(curadoria.id !== undefined && { id: curadoria.id }),
    ...(curadoria.label !== undefined && { label: curadoria.label }),
    shapeType: 'svg-path',
    ...(curadoria.category !== undefined && { category: curadoria.category }),
    keywords: curadoria.keywords ?? [],
    fill: silhueta.alvo === 'fill' ? VITRINE : 'transparent',
    ...(contorno && monocor && { strokeColor: VITRINE }),
    ...(contorno && { strokeWidth: espessuras[0] }),
    aspect: vb[2] / vb[3], // exata: arredondar levava 1:4096 a 0 (altura infinita na inserção)
    pathViewBox,
    versao: curadoria.versao ?? 1,
    ajuste: curadoria.ajuste ?? 'travado',
    slots,
    pathData: silhueta.d,
    ...(monocor && silhueta.fillRule && { pathFillRule: silhueta.fillRule }),
    ...(!monocor && { partes: finais }),
  }

  // a porta tem a última palavra: a camada que a inserção faria precisa passar sem problema
  const coresDosSlots = Object.fromEntries(cores.map((hex) => [idDaCor.get(hex)!, hex]))
  const problemas = problemasDoVetor({
    type: 'shape',
    style: {
      shapeType: 'svg-path',
      pathData: entrada.pathData,
      pathViewBox,
      pathFillRule: entrada.pathFillRule,
      fill: VITRINE,
      ...(!monocor && { vetor: { asset: { id: 'importado', versao: 1 }, partes: finais, cores: coresDosSlots } }),
    },
  })
  if (problemas.length) recusar('CONTRATO_RECUSOU', problemas.map((p) => p.codigo).join(', '))

  const motivos: string[] = []
  if (subpaths > LIMITES_DE_CURADORIA.subpaths) motivos.push(`${subpaths} subpaths (curadoria v1: ≤ ${LIMITES_DE_CURADORIA.subpaths})`)
  if (comandos > LIMITES_DE_CURADORIA.segmentos) motivos.push(`${comandos} segmentos (curadoria v1: ≤ ${LIMITES_DE_CURADORIA.segmentos})`)
  if (bytes > LIMITES_DE_CURADORIA.bytes) motivos.push(`${bytes} bytes de path (curadoria v1: ≤ ${LIMITES_DE_CURADORIA.bytes})`)
  return {
    formato: 'studio-lagosta/proposta-de-vetor',
    versaoDoFormato: 1,
    status: 'proposta',
    ativada: false,
    entrada,
    coresDeOrigem: coresDosSlots,
    pendencias,
    avisos,
    metricas: { bytesDeEntrada, partes: finais.length, slots: cores.length, subpaths, comandos, bytesDosPaths: bytes },
    elegivelParaCatalogo: { ok: motivos.length === 0, limites: LIMITES_DE_CURADORIA, motivos },
  }
}

export function importarSvg(fonte: string | Uint8Array, curadoria: Curadoria = {}): ResultadoDaImportacao {
  try {
    const bruto = typeof fonte === 'string' ? new TextEncoder().encode(fonte) : fonte
    if (bruto.length > ENTRADA_MAX_BYTES) recusar('ENTRADA_GRANDE_DEMAIS', `${bruto.length} bytes (máximo ${ENTRADA_MAX_BYTES})`)
    let texto = ''
    try {
      texto = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bruto)
    } catch {
      recusar('CODIFICACAO_RECUSADA', 'o arquivo não é UTF-8 válido')
    }
    const raiz = lerXml(texto)
    conferirNo(raiz, true)
    const vb = viewBox(raiz)
    const partes: ParteBruta[] = []
    const avisos: Problema[] = []
    const inicial: Herdado = { fill: undefined, stroke: 'none', largura: 1, regra: 'nonzero', matriz: [1, 0, 0, 1, -vb[0], -vb[1]] }
    coletar(raiz, inicial, true, partes, avisos)
    return { ok: true, proposta: proposta(partes, vb, curadoria, bruto.length, avisos) }
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, codigo: e.codigo, mensagem: e.message }
    return { ok: false, codigo: 'ERRO_INTERNO', mensagem: String((e as Error)?.message ?? e) }
  }
}
