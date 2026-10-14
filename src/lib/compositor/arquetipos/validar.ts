/**
 * O VALIDADOR do contrato de arquétipo: puro, sem banco, sem render. Devolve a
 * lista de problemas (vazia = válido); nunca corrige nada.
 *
 * A área segura NÃO vem do arquétipo: é o piso padrão do compositor
 * (`NUMEROS_PADRAO.geometria` + `DIMENSOES`), lido daqui, nunca copiado. Ela
 * RECORTA a zona na materialização, e o validador confere que o recorte ainda
 * comporta a caixa — mudar o piso global não invalida uma versão publicada
 * enquanto ela couber. (O autofix confere o `CANVAS_MARGIN`, mais frouxo em
 * todos os lados: quem passa aqui passa lá. A geometria efetiva de cada
 * projeto, que a assinatura pode sobrescrever, é do T1a.)
 */
import { NUMEROS_PADRAO } from '../assinatura'
import { ALINHAMENTOS, ANCORAS, CANTOS, DIMENSOES } from '../spec'
import {
  chaveDoArquetipo,
  CODIGOS_TAXONOMICOS,
  ELEMENTOS_DO_ARQUETIPO,
  FORMATOS_DO_ARQUETIPO,
  PAPEIS_DE_COR,
  PAPEIS_DO_ARQUETIPO,
  type ArquetipoDeLayout,
  type Caixa,
  type FormatoDoArquetipo,
  type Zona,
} from './tipos'

export const CODIGOS_DO_ARQUETIPO = [
  'ID_INVALIDO',
  'ID_DUPLICADO',
  'VERSAO_INVALIDA',
  'FORMATO_AUSENTE',
  'FORMATO_DESCONHECIDO',
  'COORDENADA_FORA',
  'TAMANHO_INVALIDO',
  'ZONA_INVERTIDA',
  'REFERENCIA_FORA_DA_ZONA',
  'FORA_DA_AREA_SEGURA',
  'AREA_SEGURA_IMPOSSIVEL',
  'SEM_HEADLINE',
  'PAPEL_DUPLICADO',
  'PAPEL_FORA_DO_CONTRATO',
  'POSICAO_AUSENTE',
  'ELEMENTO_DESCONHECIDO',
  'PREFERENCIA_INCOERENTE',
  'CAMPO_PROIBIDO',
  'CAMPO_DESCONHECIDO',
  'CAMPO_INVALIDO',
] as const
export type CodigoDoArquetipo = (typeof CODIGOS_DO_ARQUETIPO)[number]

export interface ProblemaDoArquetipo {
  readonly codigo: CodigoDoArquetipo
  /** `id@versao` de quem tem o problema. */
  readonly arquetipo: string
  /** O caminho do campo, como `formatos.story.papeis.headline.zona`. */
  readonly campo: string
  readonly mensagem: string
}

/** A área segura de um formato, em pixels da peça. */
export interface AreaSegura {
  readonly largura: number
  readonly altura: number
  readonly margemH: number
  readonly safeTopo: number
  readonly safeRodape: number
}

export function areaSeguraPadrao(formato: FormatoDoArquetipo): AreaSegura {
  const { width, height } = DIMENSOES[formato]
  const { margemH, safeTopo, safeRodape } = NUMEROS_PADRAO.geometria[formato]
  return { largura: width, altura: height, margemH, safeTopo, safeRodape }
}

export interface OpcoesDaValidacao {
  /** Só para teste: substitui a área segura padrão de um formato. */
  readonly areaSegura?: Partial<Record<FormatoDoArquetipo, AreaSegura>>
}

/** Meio pixel: 8,5% de 1080 é 91,8 px contra a margem de 92 — arredondamento, não invasão. */
const TOLERANCIA_PX = 0.5
const EPSILON = 1e-9
const ID_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FAIXAS_DA_FOTO = ['topo', 'meio', 'base'] as const
/** A faixa da peça em que a zona da headline tem de ficar, por âncora. */
const FAIXA_DA_ANCORA = { topo: [0, 0.4], meio: [1 / 3, 2 / 3], rodape: [0.5, 1] } as const
/** O que é da assinatura/DNA ou do cliente, nunca do arquétipo. */
const CHAVES_PROIBIDAS = new Set([
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'fontSize',
  'fill',
  'stroke',
  'color',
  'cor',
  'hex',
  'svg',
  'path',
  'projectId',
  'projetoId',
  'clienteId',
  'userId',
])
const VALOR_DE_COR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i
/**
 * O contrato é FECHADO: em cada nível, só estas chaves. Uma chave a mais
 * (`peso`, `svgData`…) é recusada, não ignorada — é por onde fonte, cor e
 * desenho entrariam com outro nome.
 */
const CHAVES = {
  raiz: ['id', 'versao', 'codigoTaxonomico', 'nome', 'papeis', 'elementos', 'preferencias', 'fotoIdeal', 'formatos'],
  papel: ['papel', 'obrigatorio', 'ordemDeLeitura'],
  elemento: ['id', 'tipo', 'opcional', 'corPorPapel', 'presoA', 'canto'],
  preferencias: ['ancora', 'alinha', 'cantoDaMarca'],
  fotoIdeal: ['areaCalma', 'assunto', 'descricao', 'referencias'],
  geometria: ['papeis', 'elementos', 'limitesDeTexto'],
  posicao: ['referencia', 'zona'],
  automatica: ['automatica'],
  caixa: ['x', 'y', 'w', 'h'],
  zona: ['xMin', 'xMax', 'yMin', 'yMax'],
  limite: ['linhasMax', 'caracteresPorLinha'],
} as const

const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const contem = <T extends string>(lista: readonly T[], v: unknown): v is T => lista.includes(v as T)
const perto = (a: number, b: number) => Math.abs(a - b) <= EPSILON

type Posicao = { referencia: Caixa; zona: Zona }

export function validarArquetipo(arquetipo: ArquetipoDeLayout, opcoes: OpcoesDaValidacao = {}): ProblemaDoArquetipo[] {
  const a = (ehObjeto(arquetipo) ? arquetipo : {}) as ArquetipoDeLayout
  const chave = chaveDoArquetipo(a)
  const problemas: ProblemaDoArquetipo[] = []
  const recusar = (codigo: CodigoDoArquetipo, campo: string, mensagem: string) => problemas.push({ codigo, arquetipo: chave, campo, mensagem })

  if (typeof a.id !== 'string' || !ID_VALIDO.test(a.id)) recusar('ID_INVALIDO', 'id', 'o id é kebab-case (a-z, 0-9 e hífen)')
  if (!Number.isInteger(a.versao) || a.versao < 1) recusar('VERSAO_INVALIDA', 'versao', 'a versão é um inteiro ≥ 1')
  if (!contem(CODIGOS_TAXONOMICOS, a.codigoTaxonomico)) recusar('CAMPO_INVALIDO', 'codigoTaxonomico', `código taxonômico fora de ${CODIGOS_TAXONOMICOS.join(', ')}`)
  if (typeof a.nome !== 'string' || !a.nome.trim()) recusar('CAMPO_INVALIDO', 'nome', 'o arquétipo tem nome')
  procurarCamposProibidos(a, '', recusar)
  const fechado = (valor: unknown, permitidas: readonly string[], campo: string) => chavesFechadas(valor, permitidas, campo, recusar)
  fechado(a, CHAVES.raiz, '')

  // Todo contêiner tem o tipo dele: um valor de outro tipo é recusado, nunca lido como vazio.
  const tipoDoConteiner = (valor: unknown, lista: boolean, opcional: boolean, campo: string) => {
    if (opcional && valor === undefined) return
    if (lista ? !Array.isArray(valor) : !ehObjeto(valor)) recusar('CAMPO_INVALIDO', campo, `${campo} é ${lista ? 'uma lista' : 'um objeto'}`)
  }
  tipoDoConteiner(a.papeis, true, false, 'papeis')
  tipoDoConteiner(a.elementos, true, true, 'elementos')
  tipoDoConteiner(a.preferencias, false, false, 'preferencias')

  // Papéis: o vocabulário fechado, sem repetição, headline sempre obrigatória.
  const listaDePapeis = Array.isArray(a.papeis) ? a.papeis : []
  const papeis = new Set<string>()
  const ordens = new Set<number>()
  listaDePapeis.forEach((p, i) => {
    const campo = `papeis[${i}]`
    fechado(p, CHAVES.papel, campo)
    if (!contem(PAPEIS_DO_ARQUETIPO, p?.papel)) return recusar('PAPEL_FORA_DO_CONTRATO', campo, `papel "${p?.papel}" fora de ${PAPEIS_DO_ARQUETIPO.join(', ')}`)
    if (papeis.has(p.papel)) return recusar('PAPEL_DUPLICADO', campo, `o papel "${p.papel}" aparece mais de uma vez`)
    papeis.add(p.papel)
    if (typeof p.obrigatorio !== 'boolean') recusar('CAMPO_INVALIDO', `${campo}.obrigatorio`, 'obrigatorio é booleano')
    if (!Number.isInteger(p.ordemDeLeitura) || p.ordemDeLeitura < 0 || ordens.has(p.ordemDeLeitura)) {
      recusar('CAMPO_INVALIDO', `${campo}.ordemDeLeitura`, 'a ordem de leitura é um inteiro ≥ 0, sem repetição')
    }
    ordens.add(p.ordemDeLeitura)
  })
  if (!listaDePapeis.some((p) => p?.papel === 'headline' && p.obrigatorio === true)) recusar('SEM_HEADLINE', 'papeis', 'todo arquétipo tem headline obrigatória')

  // Elementos: só a referência semântica (o T0 não materializa nem desenha).
  const elementos = new Set<string>()
  ;(Array.isArray(a.elementos) ? a.elementos : []).forEach((e, i) => {
    const campo = `elementos[${i}]`
    fechado(e, CHAVES.elemento, campo)
    if (!contem(ELEMENTOS_DO_ARQUETIPO, e?.tipo)) return recusar('ELEMENTO_DESCONHECIDO', campo, `elemento "${e?.tipo}" fora de ${ELEMENTOS_DO_ARQUETIPO.join(', ')}`)
    if (typeof e.id !== 'string' || !ID_VALIDO.test(e.id) || elementos.has(e.id)) return recusar('CAMPO_INVALIDO', `${campo}.id`, 'o id do elemento é kebab-case e único')
    elementos.add(e.id)
    if (typeof e.opcional !== 'boolean') recusar('CAMPO_INVALIDO', `${campo}.opcional`, 'opcional é booleano')
    if (!contem(PAPEIS_DE_COR, e.corPorPapel)) recusar('CAMPO_INVALIDO', `${campo}.corPorPapel`, `a cor do elemento é um papel (${PAPEIS_DE_COR.join(', ')}), nunca um valor`)
    if (e.presoA !== undefined && !papeis.has(e.presoA)) recusar('PAPEL_FORA_DO_CONTRATO', `${campo}.presoA`, `"${e.presoA}" não é papel deste arquétipo`)
    if (e.tipo === 'moldura-aberta' ? !contem(CANTOS, e.canto) : e.canto !== undefined) {
      recusar('CAMPO_INVALIDO', `${campo}.canto`, 'só a moldura-aberta tem canto, e ela sempre tem (a orientação do L é identidade)')
    }
  })

  const pref = ehObjeto(a.preferencias) ? a.preferencias : null
  fechado(pref, CHAVES.preferencias, 'preferencias')
  if (!contem(ANCORAS, pref?.ancora)) recusar('CAMPO_INVALIDO', 'preferencias.ancora', `âncora fora de ${ANCORAS.join(', ')}`)
  if (!contem(ALINHAMENTOS, pref?.alinha)) recusar('CAMPO_INVALIDO', 'preferencias.alinha', `alinhamento fora de ${ALINHAMENTOS.join(', ')}`)
  if (pref?.cantoDaMarca !== 'auto' && !contem(CANTOS, pref?.cantoDaMarca)) recusar('CAMPO_INVALIDO', 'preferencias.cantoDaMarca', 'canto fora dos quatro cantos ou auto')
  const foto = a.fotoIdeal
  fechado(foto, CHAVES.fotoIdeal, 'fotoIdeal')
  if (
    foto !== undefined &&
    !(
      ehObjeto(foto) &&
      contem(FAIXAS_DA_FOTO, foto.areaCalma) &&
      Array.isArray(foto.assunto) &&
      foto.assunto.every((x) => contem([...FAIXAS_DA_FOTO, 'deslocado'], x)) &&
      typeof foto.descricao === 'string' &&
      Array.isArray(foto.referencias) &&
      foto.referencias.every((x) => typeof x === 'string')
    )
  ) {
    recusar('CAMPO_INVALIDO', 'fotoIdeal', 'a foto ideal é descritiva: área calma, assunto, descrição e referências')
  }

  // Formatos: story e feed, cada um com geometria própria.
  const formatos = (ehObjeto(a.formatos) ? a.formatos : {}) as Record<string, ArquetipoDeLayout['formatos'][FormatoDoArquetipo]>
  for (const f of Object.keys(formatos)) {
    if (!contem(FORMATOS_DO_ARQUETIPO, f)) recusar('FORMATO_DESCONHECIDO', `formatos.${f}`, `formato fora de ${FORMATOS_DO_ARQUETIPO.join(', ')}`)
  }
  for (const f of FORMATOS_DO_ARQUETIPO) {
    const g = formatos[f]
    const base = `formatos.${f}`
    if (!ehObjeto(g)) {
      recusar('FORMATO_AUSENTE', base, `o arquétipo não define o ${f}`)
      continue
    }
    fechado(g, CHAVES.geometria, base)
    tipoDoConteiner(g.papeis, false, false, `${base}.papeis`)
    tipoDoConteiner(g.elementos, false, true, `${base}.elementos`)
    tipoDoConteiner(g.limitesDeTexto, false, false, `${base}.limitesDeTexto`)
    const area = opcoes.areaSegura?.[f] ?? areaSeguraPadrao(f)
    const areaPossivel = areaSeguraPossivel(area)
    if (!areaPossivel) recusar('AREA_SEGURA_IMPOSSIVEL', base, `a área segura do ${f} não deixa espaço útil`)

    const posicoes = (ehObjeto(g.papeis) ? g.papeis : {}) as Record<string, unknown>
    const fixas = new Map<string, Posicao>()
    const automaticas = new Set<string>()
    for (const papel of papeis) if (!posicoes[papel]) recusar('POSICAO_AUSENTE', `${base}.papeis.${papel}`, `o papel "${papel}" não tem posição no ${f}`)
    for (const [papel, pos] of Object.entries(posicoes)) {
      const campo = `${base}.papeis.${papel}`
      if (!papeis.has(papel)) {
        recusar('PAPEL_FORA_DO_CONTRATO', campo, `"${papel}" não é papel deste arquétipo`)
        continue
      }
      const p = (ehObjeto(pos) ? pos : {}) as { automatica?: unknown; referencia?: Caixa; zona?: Zona }
      fechado(p, 'automatica' in p ? CHAVES.automatica : CHAVES.posicao, campo)
      fechado(p.referencia, CHAVES.caixa, `${campo}.referencia`)
      fechado(p.zona, CHAVES.zona, `${campo}.zona`)
      if ('automatica' in p) {
        if (papel !== 'logo' || p.automatica !== 'canto-mais-calmo') recusar('CAMPO_INVALIDO', campo, 'só a logo tem posição automática (o canto mais calmo)')
        else automaticas.add(papel)
        continue
      }
      const referencia = conferirCaixa(p.referencia, `${campo}.referencia`, recusar)
      const zona = conferirZona(p.zona, `${campo}.zona`, recusar)
      if (!referencia || !zona) continue
      if (!caixaNaZona(referencia, zona)) recusar('REFERENCIA_FORA_DA_ZONA', `${campo}.referencia`, 'a referência sai da zona permitida')
      else fixas.set(papel, { referencia, zona })
      if (areaPossivel && !recorteComporta(zona, referencia, area)) {
        recusar('FORA_DA_AREA_SEGURA', `${campo}.zona`, `recortada pela área segura do ${f}, a zona não comporta a caixa`)
      }
    }

    const caixas = (ehObjeto(g.elementos) ? g.elementos : {}) as Record<string, Caixa>
    for (const id of elementos) if (!caixas[id]) recusar('POSICAO_AUSENTE', `${base}.elementos.${id}`, `o elemento "${id}" não tem posição no ${f}`)
    for (const [id, c] of Object.entries(caixas)) {
      const campo = `${base}.elementos.${id}`
      if (!elementos.has(id)) {
        recusar('ELEMENTO_DESCONHECIDO', campo, `"${id}" não é elemento declarado`)
        continue
      }
      fechado(c, CHAVES.caixa, campo)
      const caixa = conferirCaixa(c, campo, recusar)
      if (caixa && areaPossivel && !recorteComporta(zonaDaCaixa(caixa), caixa, area)) recusar('FORA_DA_AREA_SEGURA', campo, `o elemento invade a área segura do ${f}`)
    }

    const limites = (ehObjeto(g.limitesDeTexto) ? g.limitesDeTexto : {}) as Record<string, { linhasMax?: unknown; caracteresPorLinha?: unknown }>
    for (const papel of papeis) {
      if (papel !== 'logo' && !limites[papel]) recusar('CAMPO_INVALIDO', `${base}.limitesDeTexto.${papel}`, `o papel de texto "${papel}" não tem linhasMax no ${f} (o limite estrutural é obrigatório)`)
    }
    for (const [papel, limite] of Object.entries(limites)) {
      const campo = `${base}.limitesDeTexto.${papel}`
      fechado(limite, CHAVES.limite, campo)
      if (!papeis.has(papel) || papel === 'logo') {
        recusar('PAPEL_FORA_DO_CONTRATO', campo, `"${papel}" não é papel de texto deste arquétipo`)
        continue
      }
      if (!Number.isInteger(limite?.linhasMax) || (limite.linhasMax as number) < 1) recusar('CAMPO_INVALIDO', `${campo}.linhasMax`, 'linhasMax é um inteiro ≥ 1')
      if (limite?.caracteresPorLinha !== undefined && (!Number.isInteger(limite.caracteresPorLinha) || (limite.caracteresPorLinha as number) < 1)) {
        recusar('CAMPO_INVALIDO', `${campo}.caracteresPorLinha`, 'caracteresPorLinha é um inteiro ≥ 1')
      }
    }

    if (pref) conferirPreferencias(pref, fixas, automaticas, base, recusar)
  }
  return problemas
}

/** Valida cada definição e a identidade do conjunto: `id@versao` não se repete. */
export function validarCatalogo(arquetipos: ReadonlyArray<ArquetipoDeLayout>, opcoes: OpcoesDaValidacao = {}): ProblemaDoArquetipo[] {
  const vistos = new Set<string>()
  return arquetipos.flatMap((a) => {
    const problemas = validarArquetipo(a, opcoes)
    const chave = chaveDoArquetipo(ehObjeto(a) ? a : ({} as ArquetipoDeLayout))
    if (vistos.has(chave)) problemas.push({ codigo: 'ID_DUPLICADO', arquetipo: chave, campo: 'id', mensagem: `${chave} já foi publicado` })
    vistos.add(chave)
    return problemas
  })
}

type Recusar = (codigo: CodigoDoArquetipo, campo: string, mensagem: string) => void

/**
 * As preferências não são uma segunda fonte de posição: têm de dizer o mesmo
 * que a geometria. A âncora põe a zona da headline na faixa dela; o
 * alinhamento prende a referência da headline à borda (ou ao eixo) da zona; o
 * canto da marca é a logo automática (`auto`) ou o quadrante da zona da logo.
 */
function conferirPreferencias(
  pref: ArquetipoDeLayout['preferencias'],
  fixas: ReadonlyMap<string, Posicao>,
  automaticas: ReadonlySet<string>,
  base: string,
  recusar: Recusar,
): void {
  const headline = fixas.get('headline')
  if (headline && contem(ANCORAS, pref.ancora)) {
    const [de, ate] = FAIXA_DA_ANCORA[pref.ancora]
    if (headline.zona.yMin < de - EPSILON || headline.zona.yMax > ate + EPSILON) {
      recusar('PREFERENCIA_INCOERENTE', `${base}.papeis.headline.zona`, `a âncora "${pref.ancora}" pede a zona da headline entre ${de.toFixed(2)} e ${ate.toFixed(2)} da altura`)
    }
  }
  if (headline && contem(ALINHAMENTOS, pref.alinha)) {
    const { referencia: r, zona: z } = headline
    const coerente =
      pref.alinha === 'esquerda'
        ? perto(r.x, z.xMin)
        : pref.alinha === 'direita'
          ? perto(r.x + r.w, z.xMax)
          : perto(r.x + r.w / 2, 0.5) && perto((z.xMin + z.xMax) / 2, 0.5)
    if (!coerente) recusar('PREFERENCIA_INCOERENTE', `${base}.papeis.headline.referencia`, `o alinhamento "${pref.alinha}" não bate com a referência e a zona da headline`)
  }
  const logo = fixas.get('logo')
  if (pref.cantoDaMarca === 'auto') {
    if (logo) recusar('PREFERENCIA_INCOERENTE', `${base}.papeis.logo`, 'cantoDaMarca "auto" pede a logo automática (o canto mais calmo)')
  } else if (contem(CANTOS, pref.cantoDaMarca)) {
    if (automaticas.has('logo')) recusar('PREFERENCIA_INCOERENTE', `${base}.papeis.logo`, `cantoDaMarca "${pref.cantoDaMarca}" pede a logo nesse canto, não automática`)
    if (logo) {
      const cx = (logo.zona.xMin + logo.zona.xMax) / 2
      const cy = (logo.zona.yMin + logo.zona.yMax) / 2
      const [vertical, horizontal] = pref.cantoDaMarca.split('-')
      const noCanto = (vertical === 'superior' ? cy < 0.5 : cy > 0.5) && (horizontal === 'esquerdo' ? cx < 0.5 : cx > 0.5)
      if (!noCanto) recusar('PREFERENCIA_INCOERENTE', `${base}.papeis.logo.zona`, `a zona da logo não fica no canto "${pref.cantoDaMarca}"`)
    }
  }
}

function conferirCaixa(c: Caixa | undefined, campo: string, recusar: Recusar): Caixa | null {
  if (!ehObjeto(c) || ![c.x, c.y, c.w, c.h].every(ehNumero)) {
    recusar('COORDENADA_FORA', campo, 'a caixa tem x, y, w e h numéricos')
    return null
  }
  if (c.w <= 0 || c.h <= 0) {
    recusar('TAMANHO_INVALIDO', campo, 'largura e altura são > 0')
    return null
  }
  if (c.x < 0 || c.y < 0 || c.x + c.w > 1 + EPSILON || c.y + c.h > 1 + EPSILON) {
    recusar('COORDENADA_FORA', campo, 'a caixa sai de 0..1 (as coordenadas são frações da peça)')
    return null
  }
  return c
}

function conferirZona(z: Zona | undefined, campo: string, recusar: Recusar): Zona | null {
  if (!ehObjeto(z) || ![z.xMin, z.xMax, z.yMin, z.yMax].every(ehNumero)) {
    recusar('COORDENADA_FORA', campo, 'a zona tem xMin, xMax, yMin e yMax numéricos')
    return null
  }
  if ([z.xMin, z.xMax, z.yMin, z.yMax].some((v) => v < 0 || v > 1)) {
    recusar('COORDENADA_FORA', campo, 'a zona sai de 0..1 (as coordenadas são frações da peça)')
    return null
  }
  if (z.xMin >= z.xMax || z.yMin >= z.yMax) {
    recusar('ZONA_INVERTIDA', campo, 'a zona está invertida ou vazia (mínimo ≥ máximo)')
    return null
  }
  return z
}

const zonaDaCaixa = (c: Caixa): Zona => ({ xMin: c.x, xMax: c.x + c.w, yMin: c.y, yMax: c.y + c.h })

const caixaNaZona = (c: Caixa, z: Zona) =>
  c.x >= z.xMin - EPSILON && c.x + c.w <= z.xMax + EPSILON && c.y >= z.yMin - EPSILON && c.y + c.h <= z.yMax + EPSILON

function areaSeguraPossivel(a: AreaSegura): boolean {
  const numeros = [a.largura, a.altura, a.margemH, a.safeTopo, a.safeRodape]
  return numeros.every((n) => ehNumero(n) && n >= 0) && a.largura > 0 && a.altura > 0 && 2 * a.margemH < a.largura && a.safeTopo + a.safeRodape < a.altura
}

/** A zona recortada pela área segura ainda comporta a caixa? Em pixels, com meio pixel de tolerância. */
function recorteComporta(z: Zona, c: Caixa, a: AreaSegura): boolean {
  const largura = Math.min(z.xMax * a.largura, a.largura - a.margemH) - Math.max(z.xMin * a.largura, a.margemH)
  const altura = Math.min(z.yMax * a.altura, a.altura - a.safeRodape) - Math.max(z.yMin * a.altura, a.safeTopo)
  return largura >= c.w * a.largura - TOLERANCIA_PX && altura >= c.h * a.altura - TOLERANCIA_PX
}

function chavesFechadas(valor: unknown, permitidas: readonly string[], campo: string, recusar: Recusar): void {
  if (!ehObjeto(valor)) return
  for (const k of Object.keys(valor)) {
    // A chave proibida já foi recusada com o motivo certo (CAMPO_PROIBIDO).
    if (!permitidas.includes(k) && !CHAVES_PROIBIDAS.has(k)) recusar('CAMPO_DESCONHECIDO', campo ? `${campo}.${k}` : k, `"${k}" não faz parte do contrato do arquétipo`)
  }
}

/** Fonte, peso, cor e cliente moram na assinatura/DNA: aqui são recusados em qualquer nível. */
function procurarCamposProibidos(valor: unknown, caminho: string, recusar: Recusar): void {
  if (typeof valor === 'string') {
    if (VALOR_DE_COR.test(valor)) recusar('CAMPO_PROIBIDO', caminho || '(raiz)', 'cor literal no arquétipo: a cor é um papel da assinatura')
    return
  }
  if (!valor || typeof valor !== 'object') return
  for (const [k, v] of Object.entries(valor)) {
    const campo = caminho ? `${caminho}.${k}` : k
    if (CHAVES_PROIBIDAS.has(k)) recusar('CAMPO_PROIBIDO', campo, `"${k}" é da assinatura/DNA ou do cliente, não do arquétipo`)
    procurarCamposProibidos(v, campo, recusar)
  }
}
