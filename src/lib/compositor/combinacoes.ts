/**
 * COMBINAÇÕES como blocos do compositor (11/09/2026).
 *
 * Pedido do Ciro: "para facilitar o compositor aproveitar assinatura de textos,
 * logo, o gradiente e também ícones, filetes e outros elementos você pode
 * agrupar e criar combinações de textos". Um grupo de texto — o da página de
 * assinatura (Cmd+G) ou uma combinação salva na aba Texto — vira um ARRANJO:
 * os papéis na ordem de leitura, o estilo de cada texto, o vão vertical antes de
 * cada um e os elementos presos a cada texto (ícone, filete, selo, a logo),
 * medidos em relação à TINTA dele — e não à caixa, que na página costuma ser
 * larga e na peça é justa.
 *
 * O compositor continua escolhendo onde o bloco pousa pela foto; o arranjo diz
 * como o bloco é por dentro.
 *
 * Módulo PURO: recebe camadas e um medidor.
 */

import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { grupoDaCamada } from '@/lib/creatives/halo/bloco-de-fundo'
import { blocosDeServico } from '@/lib/ai/blocos-de-servico'
import {
  caixaDoOrnamento,
  caixaVisivel,
  camadaDoOrnamento,
  type EixoDoOrnamento,
  type FontComboElement,
  type FontComboOrnamento,
  type FontComboPair,
  type LadoDoOrnamento,
} from '@/lib/font-combinations'
import { buildComboLayers } from '@/lib/font-combinations-layers'
import {
  associarIcones,
  associarOrnamentos,
  dadosDoElemento,
  ehElementoDeCombinacao,
  ladoDoOrnamento,
  papelDoTexto,
} from '@/lib/font-combinations-capture'

import { estiloDaCamada, type EstiloDePapel } from './assinatura'
import type { EstiloDeDestaque } from './destaques'
import type { Alinhamento, Papel } from './spec'

/** Um elemento preso a um texto, em px da base 1080, relativo à TINTA do texto (mesma regra de `caixaDoOrnamento`). */
export type ElementoDoArranjo = FontComboOrnamento

export interface TextoDoArranjo {
  papel: Papel
  estilo: EstiloDePapel
  /** px entre a base da tinta do texto anterior e o topo deste; null no primeiro. */
  vaoAntes: number | null
  elementos: ElementoDoArranjo[]
  /** Numa linha de serviço, o que ela anuncia — é o que casa o relógio com o horário. */
  tipo: 'horario' | 'endereco' | null
  /** O id do elemento da combinação de onde o texto veio (quando veio de uma). */
  elementoId?: string
  /**
   * Quanto a tinta começa para DENTRO da borda em que o grupo alinha (px da
   * origem): "Funcionamento" rente e as unidades 90 px para dentro, ao lado dos
   * ícones. Ausente = rente (e sempre em grupo centrado).
   */
  recuo?: number
}

export type OrigemDoArranjo = 'pagina' | 'combinacao'

export interface ArranjoDeGrupo {
  /** `<pageId>:<grupo>` ou `combinacao:<id>` — gravado na spec para a recomposição manter a escolha. */
  id: string
  nome: string
  origem: OrigemDoArranjo
  /** Na ordem de leitura. */
  textos: TextoDoArranjo[]
  papeis: Papel[]
  alinhamento: Alinhamento | null
  /** A logo mora dentro do arranjo (ao lado do serviço, por exemplo): a peça não põe outra no canto. */
  temLogo: boolean
  /** Onde os textos do arranjo moram no canvas de origem (união das caixas) — na página, é o que diz topo ou rodapé. */
  caixa?: { x: number; y: number; width: number; height: number }
  /** Do topo da primeira tinta à base da última, na origem — o que mede o vão entre dois grupos da página. */
  faixaDaTinta?: { topo: number; base: number }
}

interface Retangulo {
  x: number
  y: number
  width: number
  height: number
}

/** A tinta de um texto dentro da caixa: a largura da linha mais longa, posta pelo alinhamento. */
export function tintaDoTexto(camada: Layer, medir: MeasureTextBox): Retangulo {
  const x0 = camada.position?.x ?? 0
  const y0 = camada.position?.y ?? 0
  const largura = camada.size?.width ?? 0
  const util = Math.max(1, largura - 2 * PADDING_DE_DESENHO)
  // O medidor do servidor não mede rich text; o destaque não muda corpo nem entrelinha
  const m = medir({ ...camada, type: 'text' } as Layer)
  const larguraDaTinta = m ? Math.max(1, Math.min(util, Math.ceil(m.maxLineWidth))) : util
  const folga = util - larguraDaTinta
  const alinhamento = camada.style?.textAlign
  return {
    x: x0 + PADDING_DE_DESENHO + (alinhamento === 'center' ? folga / 2 : alinhamento === 'right' ? folga : 0),
    y: y0,
    width: larguraDaTinta,
    height: m ? Math.ceil(m.height) : (camada.size?.height ?? 0),
  }
}

/** A tinta de um texto que o COMPOSITOR montou: a caixa já é justa (tinta + folga de desenho). */
export function tintaDaCaixaJusta(camada: Layer): Retangulo {
  return {
    x: (camada.position?.x ?? 0) + PADDING_DE_DESENHO,
    y: camada.position?.y ?? 0,
    width: Math.max(1, (camada.size?.width ?? 0) - 2 * PADDING_DE_DESENHO - 2),
    height: camada.size?.height ?? 0,
  }
}

/** A caixa que envolve um conjunto de camadas (px no canvas delas). */
function uniaoDasCaixas(camadas: Layer[]): Retangulo {
  const x0 = Math.min(...camadas.map((c) => c.position?.x ?? 0))
  const y0 = Math.min(...camadas.map((c) => c.position?.y ?? 0))
  const x1 = Math.max(...camadas.map((c) => (c.position?.x ?? 0) + (c.size?.width ?? 0)))
  const y1 = Math.max(...camadas.map((c) => (c.position?.y ?? 0) + (c.size?.height ?? 0)))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function relativoATinta(elemento: Layer, tinta: Retangulo, lado: LadoDoOrnamento, eixo?: EixoDoOrnamento): ElementoDoArranjo {
  const caixa = caixaVisivel(elemento)
  const base = { ...dadosDoElemento(elemento, 1), width: caixa.width, height: caixa.height, lado }
  if (lado === 'antes') return { ...base, offsetX: caixa.x - tinta.x, offsetY: caixa.y - tinta.y }
  if (lado === 'depois') return { ...base, offsetX: caixa.x - (tinta.x + tinta.width), offsetY: caixa.y - tinta.y }
  const e = eixo ?? 'inicio'
  const offsetX =
    e === 'inicio'
      ? caixa.x - tinta.x
      : e === 'centro'
        ? caixa.x + caixa.width / 2 - (tinta.x + tinta.width / 2)
        : caixa.x + caixa.width - (tinta.x + tinta.width)
  const offsetY = lado === 'acima' ? caixa.y - tinta.y : caixa.y - (tinta.y + tinta.height)
  return { ...base, eixo: e, offsetX, offsetY }
}

const ICONE_DE_HORARIO = /rel[oó]gio|clock|hor[aá]ri|funciona/i
const ICONE_DE_ENDERECO = /\bpin\b|alfinete|local|endere|mapa|\bmap\b/i

function tipoDoServico(camada: Layer, elementos: ElementoDoArranjo[]): TextoDoArranjo['tipo'] {
  const conteudo = (camada.content ?? '').replace(/\s+/g, ' ').trim()
  const [bloco] = blocosDeServico([conteudo])
  if (bloco) return bloco.papel === 'horário' ? 'horario' : 'endereco'
  const pistas = `${camada.name ?? ''} ${String(camada.metadata?.elementLabel ?? '')} ${elementos.map((e) => e.url ?? '').join(' ')}`
  if (ICONE_DE_HORARIO.test(pistas)) return 'horario'
  if (ICONE_DE_ENDERECO.test(pistas)) return 'endereco'
  return null
}

/** Elemento de um grupo: ícone, forma, selo ou logo — nunca a foto de fundo. */
function ehElementoDoGrupo(c: Layer): boolean {
  if (!ehElementoDeCombinacao(c) || c.id === 'bg-foto') return false
  const caixa = caixaVisivel(c)
  return !(caixa.width >= 1000 && caixa.height >= 1000)
}

/**
 * Elemento ao lado de uma linha que a peça não tem — o alfinete da segunda
 * linha do serviço, quando a peça só traz o horário — fica de fora.
 */
function foraDaTinta(e: ElementoDoArranjo, alturaDaTinta: number, escala: number): boolean {
  if (e.lado !== 'antes' && e.lado !== 'depois') return false
  const altura = e.height * escala
  // Elemento da altura do bloco (a logo, o divisor vertical) acompanha o bloco inteiro
  if (altura >= alturaDaTinta * 0.9) return false
  // Ícone de linha: some quando o centro dele cai abaixo do texto que sobrou
  return e.offsetY * escala + altura / 2 > alturaDaTinta
}

/** A altura de UMA linha do texto (corpo × entrelinha), com a entrelinha que o render lê primeiro. */
function alturaDeUmaLinha(camada: Layer): number {
  const corpo = camada.style?.fontSize ?? 0
  const entrelinha = camada.textboxConfig?.autoWrap?.lineHeight ?? camada.style?.lineHeight ?? 1.2
  return corpo * entrelinha
}

const linhaNormalizada = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * O vão que a página dá antes de um texto: do fim da tinta do anterior ao topo
 * dele, com teto de meia altura do anterior para a sobreposição (o lockup
 * apertado, a voz 2 em script entrando na linha de cima).
 *
 * A exceção é o texto DESENHADO POR CIMA de uma linha do anterior: as variantes
 * do Espeto guardam a manchete inteira na caixa da voz 1 e põem a voz 2 sobre a
 * última linha, repetindo-a. Na peça cada voz tem só as suas linhas, e o vão
 * negativo da página as sobrepunha (TEXTO_NAO_CABE). Duas marcas denunciam o
 * desenho por cima: o texto REPETE uma linha do anterior, ou COMEÇA numa delas
 * (a um quinto do passo de linha). Aí não há vão e a peça usa o ritmo da casa.
 * Sobrepor mais de meia linha, sozinho, NÃO é marca: o "quintal" do Convite do
 * dia do Quintal entra 44 px em "é dia de" de propósito, e a primeira versão
 * desta regra, que cortava pela meia linha, o descolava 55 px (11/09/2026).
 */
export function vaoDaPagina(
  anterior: { y: number; altura: number; umaLinha: number; linhas: string[] },
  atual: { y: number; conteudo: string },
): number | null {
  const vao = Math.round(atual.y - (anterior.y + anterior.altura))
  if (vao >= 0) return vao
  const repete = anterior.linhas.length > 1 && anterior.linhas.map(linhaNormalizada).includes(linhaNormalizada(atual.conteudo))
  const emLinhas = anterior.umaLinha > 0 ? (atual.y - anterior.y) / anterior.umaLinha : 0
  const k = Math.round(emLinhas)
  const comecaNumaLinha = k >= 1 && k < anterior.linhas.length && Math.abs(emLinhas - k) <= 0.2
  if (repete || comecaNumaLinha) return null
  return Math.max(-Math.round(anterior.altura * 0.5), vao)
}

/**
 * O arranjo de um conjunto de camadas (um grupo da página ou uma combinação
 * materializada). Textos sem papel ficam de fora — e os elementos presos a eles
 * também.
 */
export function arranjoDasCamadas(args: {
  id: string
  nome: string
  origem: OrigemDoArranjo
  camadas: Layer[]
  /** A página inteira, para o estilo de camada em grupo seguir a regra do editor. */
  todas?: Layer[]
  medir: MeasureTextBox
}): ArranjoDeGrupo | null {
  const textos = args.camadas
    .filter((c) => c.visible !== false && (c.type === 'text' || c.type === 'rich-text') && papelDoTexto(c))
    .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))
  if (textos.length === 0) return null

  const elementos = args.camadas.filter(ehElementoDoGrupo)
  const icones = associarIcones(
    textos,
    elementos.filter((e) => e.type === 'image' && !e.rotation),
  )
  const usados = new Set([...icones.values()].map((i) => i.id))
  const presos = associarOrnamentos(textos, elementos.filter((e) => !usados.has(e.id)))

  const itens: TextoDoArranjo[] = []
  const tintas: Retangulo[] = []
  let anterior: { y: number; altura: number; umaLinha: number; linhas: string[] } | null = null
  for (const texto of textos) {
    const estilo = estiloDaCamada(texto, args.todas ?? args.camadas)
    if (!estilo) continue
    const tinta = tintaDoTexto(texto, args.medir)
    const comoTinta = { ...texto, position: { x: tinta.x, y: tinta.y }, size: { width: tinta.width, height: tinta.height } } as Layer
    const doTexto: ElementoDoArranjo[] = []
    const icone = icones.get(texto.id)
    if (icone) doTexto.push(relativoATinta(icone, tinta, 'antes'))
    for (const o of presos.get(texto.id) ?? []) {
      const { lado, eixo } = ladoDoOrnamento(o.imagem, comoTinta)
      doTexto.push(relativoATinta(o.imagem, tinta, lado, eixo))
    }
    const y = texto.position?.y ?? 0
    const vaoAntes = anterior ? vaoDaPagina(anterior, { y, conteudo: texto.content ?? '' }) : null
    const papel = papelDoTexto(texto) as Papel
    const elementoId = texto.metadata?.elementId
    itens.push({
      papel,
      estilo,
      vaoAntes,
      elementos: doTexto,
      tipo: papel === 'servico' ? tipoDoServico(texto, doTexto) : null,
      ...(typeof elementoId === 'string' && elementoId ? { elementoId } : {}),
    })
    tintas.push(tinta)
    anterior = { y, altura: tinta.height, umaLinha: alturaDeUmaLinha(texto), linhas: (texto.content ?? '').split('\n') }
  }
  if (itens.length === 0) return null

  const referencia = itens.find((t) => t.papel === 'headline') ?? itens[0]
  const alinhamento = referencia.estilo.alinhamento ?? null
  const recuos = recuosDaOrigem(itens, tintas, alinhamento)
  return {
    id: args.id,
    nome: args.nome,
    origem: args.origem,
    textos: recuos ? itens.map((t, i) => (recuos[i] > 0 ? { ...t, recuo: recuos[i] } : t)) : itens,
    papeis: [...new Set(itens.map((t) => t.papel))],
    alinhamento,
    temLogo: itens.some((t) => t.elementos.some((e) => e.logo)),
    caixa: uniaoDasCaixas(textos),
    faixaDaTinta: { topo: Math.min(...tintas.map((t) => t.y)), base: Math.max(...tintas.map((t) => t.y + t.height)) },
  }
}

/**
 * Até 2 px é arraste no editor, não desenho. 3 px já pode ser alinhamento ótico:
 * no Feriado do TERO o apoio mora 7 px para dentro da manchete serifada, e um
 * piso de 8 px o achatava na borda dela (11/09/2026).
 */
const RECUO_MINIMO = 3

/**
 * O recuo de cada texto dentro da borda em que o grupo alinha: a tinta rente é
 * 0; a linha de serviço 90 px para dentro, ao lado do ícone, é 90 (a segunda da
 * Real, 11/09/2026 — sem isto as três linhas saíam no mesmo x e o ícone ia a
 * 30 px da borda). Só conta texto alinhado como o grupo; grupo centrado não tem
 * recuo. `null` quando ninguém tem recuo, o caso comum.
 */
function recuosDaOrigem(itens: TextoDoArranjo[], tintas: Retangulo[], alinhamento: Alinhamento | null): number[] | null {
  if (alinhamento !== 'esquerda' && alinhamento !== 'direita') return null
  const alinhados = itens.map((t) => (t.estilo.alinhamento ?? 'esquerda') === alinhamento)
  const bordas = tintas.map((t) => (alinhamento === 'esquerda' ? t.x : t.x + t.width))
  const doGrupo = bordas.filter((_, i) => alinhados[i])
  if (doGrupo.length < 2) return null
  const rente = alinhamento === 'esquerda' ? Math.min(...doGrupo) : Math.max(...doGrupo)
  const recuos = bordas.map((borda, i) => {
    if (!alinhados[i]) return 0
    const recuo = Math.round(Math.abs(borda - rente))
    return recuo >= RECUO_MINIMO ? recuo : 0
  })
  return recuos.some((r) => r > 0) ? recuos : null
}

/**
 * Os arranjos de uma página de assinatura: um por grupo do editor (Cmd+G), e
 * cada texto com papel fora de grupo é o seu próprio arranjo — a mesma chave que
 * o compositor usa para montar os blocos (`solo:<papel>`; a segunda voz solta
 * mora com a manchete).
 */
export function arranjosDaPagina(args: { pageId: string; nome: string; camadas: Layer[]; medir: MeasureTextBox }): Map<string, ArranjoDeGrupo> {
  const porGrupo = new Map<string, Layer[]>()
  for (const camada of args.camadas) {
    if (camada.visible === false) continue
    const grupo = grupoDaCamada(camada)
    if (grupo) {
      porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), camada])
      continue
    }
    const papel = camada.type === 'text' || camada.type === 'rich-text' ? papelDoTexto(camada) : null
    if (papel) {
      const chave = `solo:${papel === 'headline2' ? 'headline' : papel}`
      porGrupo.set(chave, [...(porGrupo.get(chave) ?? []), camada])
    }
  }
  const saida = new Map<string, ArranjoDeGrupo>()
  for (const [chave, camadas] of porGrupo) {
    const arranjo = arranjoDasCamadas({
      id: `${args.pageId}:${chave}`,
      nome: args.nome,
      origem: 'pagina',
      camadas,
      todas: args.camadas,
      medir: args.medir,
    })
    if (arranjo) saida.set(chave, arranjo)
  }
  return saida
}

/**
 * Uma combinação salva como arranjo — só quando TODO texto dela tem papel: a
 * combinação do catálogo base ("Sabor de Verdade") não serve à usina até alguém
 * dizer qual texto é a manchete.
 */
export function arranjoDaCombinacao(args: {
  combinacao: { id: string; name: string; elements: FontComboElement[] }
  pair: FontComboPair
  medir: MeasureTextBox
}): ArranjoDeGrupo | null {
  const elementos = Array.isArray(args.combinacao.elements) ? args.combinacao.elements : []
  if (elementos.length === 0 || elementos.some((e) => !e.papel)) return null
  const alturaDeBase = elementos.find((e) => e.alturaDeBase)?.alturaDeBase ?? 1920
  const camadas = buildComboLayers({
    elements: elementos,
    pair: args.pair,
    canvasWidth: 1080,
    canvasHeight: alturaDeBase,
    comboId: args.combinacao.id,
    comboName: args.combinacao.name,
  })
  const arranjo = arranjoDasCamadas({
    id: `combinacao:${args.combinacao.id}`,
    nome: args.combinacao.name,
    origem: 'combinacao',
    camadas,
    medir: args.medir,
  })
  if (!arranjo) return null
  // O estilo de destaque é do ELEMENTO: o texto de exemplo pode não ter nenhum
  // [colchete], e aí a camada materializada não é rich text para mostrá-lo
  const porId = new Map(elementos.map((e) => [e.id, e]))
  for (const texto of arranjo.textos) {
    const elemento = texto.elementoId ? porId.get(texto.elementoId) : undefined
    if (elemento?.destaque && !texto.estilo.destaque) {
      texto.estilo = { ...texto.estilo, destaque: { ...elemento.destaque } as EstiloDeDestaque }
    }
  }
  return arranjo
}

function tokens(texto: string | null | undefined): string[] {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
}

function hashDe(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Escolhe o arranjo de UM grupo da peça entre o da página e as combinações que
 * cobrem os papéis pedidos:
 * - arranjo já usado por esta peça (`preferidos`, gravado na spec) vence — a
 *   recomposição refaz A MESMA peça;
 * - −1 por papel que o arranjo tem e a peça não usa (o texto some com os seus
 *   elementos), +3 por palavra do tema no nome;
 * - empate → rodízio determinístico pela chave: uma leva varia sem repetir.
 */
export function escolherArranjo(
  candidatos: ArranjoDeGrupo[],
  criterios: { papeis: Papel[]; tema?: string | null; chave: string; preferidos?: string[] },
): { arranjo: ArranjoDeGrupo; motivo: string } | null {
  const pedidos = [...new Set(criterios.papeis.filter((p) => p !== 'headline2'))]
  const cobrem = candidatos.filter((a) => pedidos.every((p) => a.papeis.includes(p)))
  if (cobrem.length === 0) return null

  const mantido = cobrem.find((a) => criterios.preferidos?.includes(a.id))
  if (mantido) return { arranjo: mantido, motivo: 'mantido da composição anterior' }

  const doTema = tokens(criterios.tema)
  const pontuados = cobrem
    .map((a) => {
      const sobram = a.papeis.filter((p) => p !== 'headline2' && !pedidos.includes(p)).length
      const casam = doTema.filter((t) => tokens(a.nome).some((x) => x.startsWith(t) || t.startsWith(x))).length
      return { a, pontos: 3 * casam - sobram, sobram, casam }
    })
    .sort((x, y) => y.pontos - x.pontos || x.a.id.localeCompare(y.a.id))
  const melhores = pontuados.filter((p) => p.pontos === pontuados[0].pontos)
  const escolhido = melhores[hashDe(criterios.chave) % melhores.length]
  const motivos = [
    escolhido.a.origem === 'pagina' ? 'grupo da página' : `combinação "${escolhido.a.nome}"`,
    ...(escolhido.casam > 0 ? ['casa com o tema'] : []),
    ...(escolhido.sobram > 0 ? [`${escolhido.sobram} papel(is) sem copy`] : []),
    ...(melhores.length > 1 ? [`rodízio entre ${melhores.length}`] : []),
  ]
  return { arranjo: escolhido.a, motivo: motivos.join(', ') }
}

export interface TextoPreenchido {
  /** Posição do texto no arranjo. */
  indice: number
  texto: TextoDoArranjo
  linhas: string[]
}

/**
 * As linhas da copy nos textos do arranjo. Papel com um texto recebe todas as
 * linhas; papel com vários (Local + Horário) recebe UMA linha por texto, casando
 * horário com o texto de horário e endereço com o de endereço antes da ordem —
 * senão o relógio vai parar ao lado do endereço. Linha que sobra entra no último
 * texto usado; texto sem linha some da peça com os seus elementos.
 */
export function distribuirLinhas(arranjo: ArranjoDeGrupo, blocos: Array<{ papel: Papel; linhas: string[] }>): TextoPreenchido[] {
  const saida: TextoPreenchido[] = []
  for (const bloco of blocos) {
    const alvos = arranjo.textos.map((texto, indice) => ({ texto, indice })).filter((a) => a.texto.papel === bloco.papel)
    if (alvos.length === 0 || bloco.linhas.length === 0) continue
    if (alvos.length === 1) {
      saida.push({ indice: alvos[0].indice, texto: alvos[0].texto, linhas: bloco.linhas })
      continue
    }

    const tipos = new Map<number, 'horario' | 'endereco'>()
    for (const b of blocosDeServico(bloco.linhas)) tipos.set(b.indice, b.papel === 'horário' ? 'horario' : 'endereco')
    const livres = new Set(alvos.map((a) => a.indice))
    const porAlvo = new Map<number, string[]>()
    const sobras: string[] = []
    bloco.linhas.forEach((linha, i) => {
      const tipo = tipos.get(i)
      const alvo = tipo ? alvos.find((a) => livres.has(a.indice) && a.texto.tipo === tipo) : undefined
      if (alvo) {
        livres.delete(alvo.indice)
        porAlvo.set(alvo.indice, [linha])
      } else {
        sobras.push(linha)
      }
    })
    for (const linha of sobras) {
      const alvo = alvos.find((a) => livres.has(a.indice))
      if (alvo) {
        livres.delete(alvo.indice)
        porAlvo.set(alvo.indice, [linha])
        continue
      }
      const ultimo = Math.max(...porAlvo.keys())
      porAlvo.get(ultimo)?.push(linha)
    }
    for (const [indice, linhas] of porAlvo) saida.push({ indice, texto: arranjo.textos[indice], linhas })
  }
  return saida.sort((a, b) => a.indice - b.indice)
}

/** Quanto os elementos de um texto passam da tinta dele, em cada lado (px), numa escala. */
export function extensoesDosElementos(
  elementos: ElementoDoArranjo[],
  tinta: { width: number; height: number },
  escala: number,
): { esquerda: number; direita: number; topo: number; base: number } {
  let esquerda = 0
  let direita = 0
  let topo = 0
  let base = 0
  for (const e of elementos) {
    if (foraDaTinta(e, tinta.height, escala)) continue
    const c = caixaDoOrnamento(e, { x: 0, y: 0, width: tinta.width, height: tinta.height }, escala)
    esquerda = Math.max(esquerda, -c.x)
    direita = Math.max(direita, c.x + c.width - tinta.width)
    topo = Math.max(topo, -c.y)
    base = Math.max(base, c.y + c.height - tinta.height)
  }
  return { esquerda, direita, topo, base }
}

/** As camadas dos elementos de um texto já na posição FINAL (depois do autofix). */
export function camadasDosElementos(texto: Layer, elementos: ElementoDoArranjo[], escala: number): Layer[] {
  const tinta = tintaDaCaixaJusta(texto)
  const grupo = texto.metadata?.groupId
  const saida: Layer[] = []
  elementos.forEach((e, i) => {
    if (foraDaTinta(e, tinta.height, escala)) return
    const caixa = caixaDoOrnamento(e, tinta, escala)
    saida.push(
      camadaDoOrnamento(e, caixa, escala, {
        id: e.logo ? 'logo' : `${texto.id}-elemento-${i + 1}`,
        name: e.logo ? 'Logo' : `${texto.name ?? texto.id} (elemento)`,
        metadata: {
          ...(typeof grupo === 'string' && grupo ? { groupId: grupo } : {}),
          compositor: { elementoDe: texto.id, lado: e.lado, ...(e.eixo ? { eixo: e.eixo } : {}) },
        },
      }),
    )
  })
  return saida
}
