/**
 * NÃO PIORAR (CP4, 15/10/2026): a garantia mecânica de que um ajuste não deixa
 * a peça pior em NENHUMA propriedade medida.
 *
 * O piloto histórico mostrou o defeito: um ajuste melhorava a manchete e
 * piorava o serviço, e a peça era gravada. Aqui TODO ajuste é julgado pela
 * comparação de duas MEDIDAS da mesma peça — antes e depois dele, em memória
 * (`medirCamadasDaPeca`, a mesma medição do revisor) — propriedade a
 * propriedade. **Não existe pontuação global**: "melhorou muito uma coisa e
 * piorou pouco outra" é RECUSA. Uma regressão determinística em qualquer
 * propriedade basta.
 *
 * As propriedades (as regras MECÂNICAS do revisor, nunca a visão):
 *   texto cortado · tinta fora da caixa · colisão · área segura · contraste
 *   dos textos · tratamento que piorou a leitura · região protegida · logo
 *   sobre texto · legibilidade da logo (CP3) · fontes · geometria das caixas.
 *
 * Fail-closed: propriedade que NÃO foi medida de um dos lados (cobertura
 * `nao-avaliada`, régua que não rodou, logo que não carregou) não pode provar
 * "não piorou" — o ajuste é recusado como NÃO MEDIDO, com o motivo, nunca
 * aceito por falta de prova. Cobertura `parcial` (rich text, fonte incerta)
 * conta como medida para o que ela cobriu — o motivo vai junto.
 *
 * O achado ALVO: o ajuste que declara `achado` (o id do achado da revisão que
 * ele corrige) tem de RESOLVER ou MELHORAR objetivamente esse achado, quando
 * a regra dele é mensurável; achado só de visão não exige prova de melhora,
 * mas passa pela não-piora como qualquer outro.
 *
 * Módulo PURO: compara dois relatórios (e as medidas que os geraram).
 */

import type { Layer } from '@/types/template'
import { TOLERANCIA_DE_PIORA, type ContrasteMedido } from '@/lib/compositor/regua'
import type { AchadoDaRevisao, RegraDaRevisao, RelatorioDaRevisao } from './contrato'

/** O ajuste deixou a peça pior em alguma propriedade medida. */
export const AJUSTE_PIOROU_ARTE = 'AJUSTE_PIOROU_ARTE'
/** Alguma propriedade não foi medida antes ou depois: não há como provar que o ajuste não piorou. */
export const AJUSTE_NAO_MEDIDO = 'AJUSTE_NAO_MEDIDO'
/** O ajuste declarou corrigir um achado mensurável e não o resolveu nem o melhorou. */
export const AJUSTE_NAO_MELHOROU_O_ACHADO = 'AJUSTE_NAO_MELHOROU_O_ACHADO'

/** As propriedades comparadas, na ordem em que são relatadas. */
export const PROPRIEDADES = [
  'texto-cortado',
  'tinta-fora-da-caixa',
  'colisao',
  'fora-da-area-segura',
  'contraste',
  'tratamento-piorou-leitura',
  'texto-sobre-assunto',
  'logo-sobre-texto',
  'logo-sem-leitura',
  'fonte-nao-carregada',
  'geometria',
] as const
export type Propriedade = (typeof PROPRIEDADES)[number]

/** As regras do revisor que viram propriedade (a mesma chave); `contraste` e `geometria` vêm de outras medidas. */
const REGRAS_COMPARADAS: ReadonlyArray<Extract<Propriedade, RegraDaRevisao>> = [
  'texto-cortado',
  'tinta-fora-da-caixa',
  'colisao',
  'fora-da-area-segura',
  'tratamento-piorou-leitura',
  'texto-sobre-assunto',
  'logo-sobre-texto',
  'logo-sem-leitura',
  'fonte-nao-carregada',
]

/** Uma medida de peça: o relatório e o que o gerou (contraste por texto, camadas). */
export interface MedidaComparavel {
  relatorio: RelatorioDaRevisao
  contraste: ContrasteMedido[] | null
  camadas: Layer[]
  canvas: { width: number; height: number }
}

export interface Piora {
  propriedade: Propriedade
  /** As camadas envolvidas (o achado, ou o texto). */
  camadas: string[]
  /** O número que piorou, antes e depois (ou o achado que apareceu). */
  antes: number | string | null
  depois: number | string | null
  motivo: string
}

export interface NaoMedida {
  propriedade: Propriedade
  lado: 'antes' | 'depois' | 'ambos'
  motivo: string
}

export interface Melhora {
  propriedade: Propriedade
  camadas: string[]
  antes: number | string | null
  depois: number | string | null
}

export interface ComparacaoDeNaoPiora {
  pioras: Piora[]
  naoMedidas: NaoMedida[]
  melhoras: Melhora[]
  /** O achado alvo (quando declarado): resolvido, melhorado, inalterado/piorado, ou não mensurável (visão). */
  achadoAlvo?: { id: string; regra: string; estado: 'resolvido' | 'melhorou' | 'nao-melhorou' | 'nao-mensuravel' | 'nao-encontrado'; antes: number | null; depois: number | null }
  /** O veredito: aceito só sem piora, sem propriedade não medida e com o achado alvo resolvido/melhorado. */
  veredito: 'aceito' | typeof AJUSTE_PIOROU_ARTE | typeof AJUSTE_NAO_MEDIDO | typeof AJUSTE_NAO_MELHOROU_O_ACHADO
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** Diferença mínima, em px, para dizer que um número de geometria piorou (ruído de arredondamento). */
const TOLERANCIA_PX = 1
/** Diferença mínima na fração de cobertura do assunto. */
const TOLERANCIA_DE_COBERTURA = 0.01

/**
 * A GRAVIDADE de um achado, por regra: um número que cresce quando o achado piora. É o que se compara entre os
 * dois lados, achado a achado (pela regra e pelas camadas, em ordem estável).
 */
export function gravidadeDoAchado(a: AchadoDaRevisao): { valor: number; tolerancia: number } {
  const e = a.evidencia
  switch (a.regra) {
    case 'texto-cortado': {
      const linhas = num(e.linhas)
      const visiveis = num(e.linhasVisiveis)
      if (linhas !== null && visiveis !== null) return { valor: Math.max(0, linhas - visiveis), tolerancia: 0 }
      const estouro = num(e.larguraDaLinha) !== null && num(e.larguraUtil) !== null ? num(e.larguraDaLinha)! - num(e.larguraUtil)! : null
      return { valor: estouro ?? 1, tolerancia: TOLERANCIA_PX }
    }
    case 'tinta-fora-da-caixa':
      return { valor: Math.max(num(e.pxAcima) ?? 0, num(e.pxAbaixo) ?? 0), tolerancia: TOLERANCIA_PX }
    case 'colisao':
      return { valor: num(e.px) ?? 1, tolerancia: TOLERANCIA_PX }
    case 'fora-da-area-segura':
      return { valor: num(e.px) ?? 1, tolerancia: TOLERANCIA_PX }
    case 'texto-sobre-assunto':
      return { valor: num(e.cobertura) ?? 1, tolerancia: TOLERANCIA_DE_COBERTURA }
    case 'logo-sem-leitura': {
      // Quanto falta para o limiar: cresce quando o p10 cai.
      const p10 = num(e.p10)
      const limiar = num(e.limiar) ?? 45
      return { valor: p10 === null ? limiar : Math.max(0, limiar - p10), tolerancia: TOLERANCIA_DE_PIORA }
    }
    case 'tratamento-piorou-leitura': {
      const antes = num(e.antes)
      const depois = num(e.depois)
      return { valor: antes !== null && depois !== null ? Math.abs(depois - antes) : 1, tolerancia: TOLERANCIA_DE_PIORA }
    }
    default:
      // logo-sobre-texto, fonte-nao-carregada e o resto: existir já é a gravidade.
      return { valor: 1, tolerancia: 0 }
  }
}

/** A chave estável de um achado: a regra e as camadas em ordem (a colisão troca a ordem quando um texto passa o outro). */
export const chaveDoAchado = (a: AchadoDaRevisao): string => `${a.regra}:${[...a.camadas].sort().join('+')}`

const mecanico = (a: AchadoDaRevisao) => a.certeza !== 'visao' && (REGRAS_COMPARADAS as readonly string[]).includes(a.regra)

function compararAchados(antes: RelatorioDaRevisao, depois: RelatorioDaRevisao): { pioras: Piora[]; melhoras: Melhora[] } {
  const pioras: Piora[] = []
  const melhoras: Melhora[] = []
  const deAntes = new Map(antes.achados.filter(mecanico).map((a) => [chaveDoAchado(a), a]))
  const deDepois = new Map(depois.achados.filter(mecanico).map((a) => [chaveDoAchado(a), a]))
  for (const [chave, d] of deDepois) {
    const a = deAntes.get(chave)
    const gd = gravidadeDoAchado(d)
    if (!a) {
      pioras.push({ propriedade: d.regra as Propriedade, camadas: d.camadas, antes: null, depois: gd.valor, motivo: `apareceu: ${d.mensagem}` })
      continue
    }
    const ga = gravidadeDoAchado(a)
    if (gd.valor > ga.valor + gd.tolerancia) pioras.push({ propriedade: d.regra as Propriedade, camadas: d.camadas, antes: ga.valor, depois: gd.valor, motivo: `piorou: ${d.mensagem}` })
    else if (gd.valor < ga.valor - gd.tolerancia) melhoras.push({ propriedade: d.regra as Propriedade, camadas: d.camadas, antes: ga.valor, depois: gd.valor })
  }
  for (const [chave, a] of deAntes) if (!deDepois.has(chave)) melhoras.push({ propriedade: a.regra as Propriedade, camadas: a.camadas, antes: gravidadeDoAchado(a).valor, depois: null })
  return { pioras, melhoras }
}

/**
 * O contraste de cada TEXTO (a leitura decisiva da régua, no sentido da polaridade): texto que estava no alvo e saiu
 * dele piorou; texto já fora do alvo piorou quando a leitura afastou-se do alvo além do ruído de render
 * (`TOLERANCIA_DE_PIORA`). Texto no alvo que mexeu dentro dele não é piora (a regra do oráculo P9 do CP0).
 */
function compararContraste(antes: ContrasteMedido[], depois: ContrasteMedido[]): { pioras: Piora[]; melhoras: Melhora[] } {
  const porTexto = (m: ContrasteMedido[]) => new Map(m.flatMap((g) => (g.textos ?? []).map((t) => [t.camada, t] as const)))
  const a = porTexto(antes)
  const d = porTexto(depois)
  const pioras: Piora[] = []
  const melhoras: Melhora[] = []
  for (const [camada, td] of d) {
    const ta = a.get(camada)
    if (!ta) continue
    // A leitura "com tratamento", no sentido do texto: p98 para texto claro (menor é melhor), p02 para escuro (maior é melhor).
    const distancia = (t: typeof td) => (t.sentido === 'claro' ? t.p98ComHalo - t.alvo : t.alvo - t.p98ComHalo)
    const piorou = ta.ok ? !td.ok : distancia(td) > distancia(ta) + TOLERANCIA_DE_PIORA
    const melhorou = !ta.ok && (td.ok || distancia(td) < distancia(ta) - TOLERANCIA_DE_PIORA)
    if (piorou) pioras.push({ propriedade: 'contraste', camadas: [camada], antes: ta.p98ComHalo, depois: td.p98ComHalo, motivo: ta.ok ? `saiu do alvo (${td.sentido}: ${ta.p98ComHalo} → ${td.p98ComHalo}, alvo ${Math.round(td.alvo)})` : `afastou-se do alvo (${td.sentido}: ${ta.p98ComHalo} → ${td.p98ComHalo}, alvo ${Math.round(td.alvo)})` })
    else if (melhorou) melhoras.push({ propriedade: 'contraste', camadas: [camada], antes: ta.p98ComHalo, depois: td.p98ComHalo })
  }
  return { pioras, melhoras }
}

/** Geometria das caixas: texto ou logo que passou a ter caixa degenerada ou a sair inteira do canvas. */
function compararGeometria(antes: MedidaComparavel, depois: MedidaComparavel): Piora[] {
  const foraDoCanvas = (l: Layer, canvas: { width: number; height: number }) =>
    l.size.width <= 0 || l.size.height <= 0 || l.position.x + l.size.width <= 0 || l.position.y + l.size.height <= 0 || l.position.x >= canvas.width || l.position.y >= canvas.height
  const conta = (l: Layer) => l.visible !== false && (l.type === 'text' || l.type === 'rich-text' || l.type === 'logo')
  const ruinsAntes = new Set(antes.camadas.filter((l) => conta(l) && foraDoCanvas(l, antes.canvas)).map((l) => l.id))
  return depois.camadas
    .filter((l) => conta(l) && foraDoCanvas(l, depois.canvas) && !ruinsAntes.has(l.id))
    .map((l) => ({ propriedade: 'geometria' as const, camadas: [l.id], antes: null, depois: `${Math.round(l.position.x)},${Math.round(l.position.y)} ${Math.round(l.size.width)}×${Math.round(l.size.height)}`, motivo: 'a caixa ficou degenerada ou inteira fora do canvas' }))
}

/** As propriedades cujo lado não foi medido (cobertura `nao-avaliada`, régua sem medida). */
function naoMedidas(antes: MedidaComparavel, depois: MedidaComparavel): NaoMedida[] {
  const saida: NaoMedida[] = []
  for (const regra of REGRAS_COMPARADAS) {
    const ca = antes.relatorio.cobertura[regra]
    const cd = depois.relatorio.cobertura[regra]
    const faltaA = !ca || ca.estado === 'nao-avaliada'
    const faltaD = !cd || cd.estado === 'nao-avaliada'
    if (faltaA || faltaD) saida.push({ propriedade: regra, lado: faltaA && faltaD ? 'ambos' : faltaA ? 'antes' : 'depois', motivo: (faltaD ? cd?.motivo : ca?.motivo) ?? 'regra não avaliada' })
  }
  if (antes.contraste === null || depois.contraste === null) saida.push({ propriedade: 'contraste', lado: antes.contraste === null && depois.contraste === null ? 'ambos' : antes.contraste === null ? 'antes' : 'depois', motivo: 'a régua de contraste não mediu' })
  return saida
}

/**
 * Compara ANTES e DEPOIS de um ajuste e decide. `achadoAlvo` é o id do achado
 * que o ajuste declarou corrigir (no relatório de ANTES).
 */
export function compararNaoPiora(antes: MedidaComparavel, depois: MedidaComparavel, opcoes: { achadoAlvo?: string | null } = {}): ComparacaoDeNaoPiora {
  const achados = compararAchados(antes.relatorio, depois.relatorio)
  const contraste = antes.contraste && depois.contraste ? compararContraste(antes.contraste, depois.contraste) : { pioras: [], melhoras: [] }
  const pioras = [...achados.pioras, ...contraste.pioras, ...compararGeometria(antes, depois)]
  const melhoras = [...achados.melhoras, ...contraste.melhoras]
  const semMedida = naoMedidas(antes, depois)

  let achadoAlvo: ComparacaoDeNaoPiora['achadoAlvo']
  if (opcoes.achadoAlvo) {
    const alvo = antes.relatorio.achados.find((a) => a.id === opcoes.achadoAlvo)
    if (!alvo) achadoAlvo = { id: opcoes.achadoAlvo, regra: '?', estado: 'nao-encontrado', antes: null, depois: null }
    else if (alvo.regra === 'texto-sem-leitura' && alvo.certeza !== 'visao') {
      // A leitura do texto é medida pela régua, não pelo achado: a gravidade é a distância ao alvo (pior das camadas).
      const distanciaDe = (m: ContrasteMedido[] | null): number | null => {
        if (!m) return null
        const textos = m.flatMap((g) => (g.textos ?? [])).filter((t) => alvo.camadas.includes(t.camada))
        if (textos.length === 0) return null
        return Math.max(...textos.map((t) => (t.ok ? 0 : Math.max(0, t.sentido === 'claro' ? t.p98ComHalo - t.alvo : t.alvo - t.p98ComHalo))))
      }
      const da = distanciaDe(antes.contraste)
      const dd = distanciaDe(depois.contraste)
      achadoAlvo =
        da === null || dd === null
          ? { id: alvo.id, regra: alvo.regra, estado: 'nao-mensuravel', antes: da, depois: dd }
          : { id: alvo.id, regra: alvo.regra, estado: dd === 0 ? 'resolvido' : dd < da - TOLERANCIA_DE_PIORA ? 'melhorou' : 'nao-melhorou', antes: da, depois: dd }
    } else if (!mecanico(alvo)) achadoAlvo = { id: alvo.id, regra: alvo.regra, estado: 'nao-mensuravel', antes: null, depois: null }
    else {
      const ga = gravidadeDoAchado(alvo)
      const chave = chaveDoAchado(alvo)
      const ainda = depois.relatorio.achados.find((a) => mecanico(a) && chaveDoAchado(a) === chave)
      const gd = ainda ? gravidadeDoAchado(ainda) : null
      achadoAlvo = {
        id: alvo.id,
        regra: alvo.regra,
        estado: !ainda ? 'resolvido' : gd!.valor < ga.valor - gd!.tolerancia ? 'melhorou' : 'nao-melhorou',
        antes: ga.valor,
        depois: gd?.valor ?? null,
      }
    }
  }

  const veredito: ComparacaoDeNaoPiora['veredito'] =
    pioras.length > 0 ? AJUSTE_PIOROU_ARTE : semMedida.length > 0 ? AJUSTE_NAO_MEDIDO : achadoAlvo?.estado === 'nao-melhorou' ? AJUSTE_NAO_MELHOROU_O_ACHADO : 'aceito'
  return { pioras, naoMedidas: semMedida, melhoras, ...(achadoAlvo ? { achadoAlvo } : {}), veredito }
}

/** Uma frase para o registro da recusa. */
export function motivoDaComparacao(c: ComparacaoDeNaoPiora): string {
  if (c.veredito === AJUSTE_PIOROU_ARTE) return `o ajuste piora a peça: ${c.pioras.map((p) => `${p.propriedade} em ${p.camadas.join(', ')} (${p.motivo})`).join('; ')}`
  if (c.veredito === AJUSTE_NAO_MEDIDO) return `não foi possível provar que o ajuste não piora: ${c.naoMedidas.map((n) => `${n.propriedade} não medida ${n.lado === 'ambos' ? 'antes nem depois' : n.lado} (${n.motivo})`).join('; ')}`
  if (c.veredito === AJUSTE_NAO_MELHOROU_O_ACHADO) return `o ajuste declarou corrigir ${c.achadoAlvo!.id} (${c.achadoAlvo!.regra}) e não o resolveu nem o melhorou (${c.achadoAlvo!.antes} → ${c.achadoAlvo!.depois})`
  return 'aceito: nenhuma propriedade medida piorou'
}
