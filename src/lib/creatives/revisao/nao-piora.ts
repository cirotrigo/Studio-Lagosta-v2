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
import { fotoDeFundo } from './regras'

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
  'texto-pequeno',
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
  // CP4.1: a regra do revisor (corpo em 1080, piso relativo ao modelo) entra na não-piora — sem limiar novo.
  'texto-pequeno',
]

/** Uma medida de peça: o relatório e o que o gerou (contraste por texto, camadas). */
export interface MedidaComparavel {
  /** O relatório do revisor sobre a medida (os achados mecânicos comparados vêm dele; `texto-pequeno` inclusive). */
  relatorio: RelatorioDaRevisao
  /** As leituras da régua SEM a correção hipotética (`corrigir: false`): o que a peça gravada mostra, não o que a régua proporia. */
  contraste: ContrasteMedido[] | null
  camadas: Layer[]
  canvas: { width: number; height: number }
  /** Camadas que a geometria NÃO mediu (fonte não cadastrada, texto sem métrica, rich text aproximado): mexer nelas é "não medido". */
  semMetrica?: string[]
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
  /** Regras `nao-avaliada` dos DOIS lados por não se aplicarem à peça (sem foto de fundo não há assunto): ditas, não recusam. */
  naoAplicaveis: NaoMedida[]
  /** O veredito: aceito só sem piora, sem propriedade não medida e com o achado alvo resolvido/melhorado. */
  veredito: 'aceito' | typeof AJUSTE_PIOROU_ARTE | typeof AJUSTE_NAO_MEDIDO | typeof AJUSTE_NAO_MELHOROU_O_ACHADO
}

export interface OpcoesDaComparacao {
  /** O id do achado (do relatório de ANTES) que o ajuste declarou corrigir. */
  achadoAlvo?: string | null
  /** As camadas que o ajuste tocou: mexer numa camada sem métrica de geometria é "não medido". */
  alteradas?: Iterable<string>
  /** O ajuste É `visibilidade` (esconder é o que ele faz): texto escondido não é piora de geometria — mas nunca "resolve" um achado. */
  permiteOcultar?: boolean
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
    case 'texto-pequeno': {
      // Quanto abaixo do piso de leitura (ambos em px de 1080, da própria regra: o piso já é relativo ao modelo —
      // um modelo que nasceu miúdo tem piso menor). Sem limiar novo: a evidência da regra decide (CP4.1).
      const corpo = num(e.corpo1080)
      const piso = num(e.piso1080)
      return { valor: corpo !== null && piso !== null ? Math.max(0, piso - corpo) : 1, tolerancia: TOLERANCIA_PX }
    }
    case 'logo-sobre-texto':
      // `camadas` = [logo, ...textos tocados]: a gravidade é quantos textos a logo encosta.
      return { valor: Math.max(0, a.camadas.length - 1), tolerancia: 0 }
    case 'fonte-nao-carregada':
      // Uma fonte, N camadas com ela: a gravidade é quantas camadas saem com a fonte de reserva.
      return { valor: a.camadas.length, tolerancia: 0 }
    default:
      // logo-sobre-texto, fonte-nao-carregada e o resto: existir já é a gravidade.
      return { valor: 1, tolerancia: 0 }
  }
}

/**
 * A chave estável de um achado, para casar o mesmo achado nos dois lados. É o `id` que `adicionar` já deduplica
 * (`texto-cortado:ID` e `texto-largo:ID` são achados DIFERENTES da mesma regra; os de bloco têm id por bloco) —
 * exceto onde o id carrega a lista de camadas e a lista muda sem o achado mudar: a colisão (a ordem troca quando um
 * texto passa o outro), a logo sobre texto (a chave é a logo; os textos tocados são a gravidade) e a fonte ausente
 * (a chave é a família; as camadas são a gravidade). Revisores C e D, 15/10/2026.
 */
export const chaveDoAchado = (a: AchadoDaRevisao): string => {
  if (a.regra === 'colisao') return `colisao:${[...a.camadas].sort().join('+')}`
  if (a.regra === 'logo-sobre-texto') return `logo-sobre-texto:${a.camadas[0] ?? ''}`
  if (a.regra === 'fonte-nao-carregada') return `fonte-nao-carregada:${String(a.evidencia?.familia ?? '')}:${String(a.evidencia?.peso ?? '')}`
  return a.id
}

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
type LeituraDeTexto = NonNullable<ContrasteMedido['textos']>[number]
/** A leitura "com tratamento", no sentido do texto: p98 para texto claro (menor é melhor), p02 para escuro (maior é melhor). */
const distancia = (t: LeituraDeTexto) => (t.sentido === 'claro' ? t.p98ComHalo - t.alvo : t.alvo - t.p98ComHalo)
/** Um texto pode aparecer em dois grupos da régua (topo e rodapé): fica a PIOR leitura. */
function porTexto(m: ContrasteMedido[]): Map<string, LeituraDeTexto> {
  const saida = new Map<string, LeituraDeTexto>()
  for (const t of m.flatMap((g) => g.textos ?? [])) {
    const atual = saida.get(t.camada)
    if (!atual || (atual.ok && !t.ok) || (atual.ok === t.ok && distancia(t) > distancia(atual))) saida.set(t.camada, t)
  }
  return saida
}

function compararContraste(antes: ContrasteMedido[], depois: ContrasteMedido[], ignorar: Set<string>): { pioras: Piora[]; melhoras: Melhora[] } {
  const a = porTexto(antes)
  const d = porTexto(depois)
  const pioras: Piora[] = []
  const melhoras: Melhora[] = []
  for (const [camada, td] of d) {
    // Texto VAZIO (slot opcional): a régua o mede, a regra o ignora (`textoSemConteudo`) — aqui também (revisor B).
    if (ignorar.has(camada)) continue
    const ta = a.get(camada)
    if (!ta) {
      // Texto que só existe DEPOIS (revelado por `visibilidade`, por exemplo) e não lê: é piora, não "sem antes".
      if (!td.ok) pioras.push({ propriedade: 'contraste', camadas: [camada], antes: null, depois: td.p98ComHalo, motivo: `apareceu fora do alvo (${td.sentido}: ${td.p98ComHalo}, alvo ${Math.round(td.alvo)})` })
      continue
    }
    const piorou = ta.ok ? !td.ok : distancia(td) > distancia(ta) + TOLERANCIA_DE_PIORA
    const melhorou = !ta.ok && (td.ok || distancia(td) < distancia(ta) - TOLERANCIA_DE_PIORA)
    if (piorou) pioras.push({ propriedade: 'contraste', camadas: [camada], antes: ta.p98ComHalo, depois: td.p98ComHalo, motivo: ta.ok ? `saiu do alvo (${td.sentido}: ${ta.p98ComHalo} → ${td.p98ComHalo}, alvo ${Math.round(td.alvo)})` : `afastou-se do alvo (${td.sentido}: ${ta.p98ComHalo} → ${td.p98ComHalo}, alvo ${Math.round(td.alvo)})` })
    else if (melhorou) melhoras.push({ propriedade: 'contraste', camadas: [camada], antes: ta.p98ComHalo, depois: td.p98ComHalo })
  }
  return { pioras, melhoras }
}

/** O mesmo predicado de `logosDaPeca` (sem a condição de visibilidade): a logo pode ser `logo`, `id: 'logo'` ou imagem chamada logo. */
const ehLogo = (l: Layer) => l.type === 'logo' || l.id === 'logo' || (l.type === 'image' && /\blogo\b/i.test(l.name ?? ''))
const ehTextoComConteudo = (l: Layer) => (l.type === 'text' || l.type === 'rich-text') && String(l.content ?? '').trim().length > 0
const caixaDe = (l: Layer) => `${Math.round(l.position.x)},${Math.round(l.position.y)} ${Math.round(l.size.width)}×${Math.round(l.size.height)}`

/**
 * Geometria das caixas: texto ou logo que passou a ter caixa degenerada ou a sair inteira do canvas; logo que passou a
 * sair PARCIALMENTE do canvas (a leitura mede só os pixels que sobraram — empurrar a marca para fora não é "legível");
 * e o DESAPARECIMENTO: texto com conteúdo ou logo visível antes e invisível/ausente depois (esconder o horário não
 * "resolve" a leitura do horário). Com `permiteOcultar` (o ajuste É `visibilidade`), o texto escondido não é piora —
 * a logo escondida é, sempre (revisores A, C e D, 15/10/2026).
 */
function compararGeometria(antes: MedidaComparavel, depois: MedidaComparavel, permiteOcultar: boolean): { pioras: Piora[]; desaparecidas: string[] } {
  const foraDoCanvas = (l: Layer, canvas: { width: number; height: number }) =>
    l.size.width <= 0 || l.size.height <= 0 || l.position.x + l.size.width <= 0 || l.position.y + l.size.height <= 0 || l.position.x >= canvas.width || l.position.y >= canvas.height
  /** Quantos px da caixa ficam FORA do canvas (o maior dos quatro lados): cresce quando a logo é empurrada para fora. */
  const pxFora = (l: Layer, canvas: { width: number; height: number }) =>
    Math.max(0, -l.position.x, -l.position.y, l.position.x + l.size.width - canvas.width, l.position.y + l.size.height - canvas.height)
  const conta = (l: Layer) => l.visible !== false && (l.type === 'text' || l.type === 'rich-text' || ehLogo(l))
  const ruinsAntes = new Set(antes.camadas.filter((l) => conta(l) && foraDoCanvas(l, antes.canvas)).map((l) => l.id))
  const logoForaAntes = new Map(antes.camadas.filter((l) => conta(l) && ehLogo(l)).map((l) => [l.id, pxFora(l, antes.canvas)]))
  const pioras: Piora[] = []
  for (const l of depois.camadas) {
    if (!conta(l)) continue
    if (foraDoCanvas(l, depois.canvas) && !ruinsAntes.has(l.id)) {
      pioras.push({ propriedade: 'geometria', camadas: [l.id], antes: null, depois: caixaDe(l), motivo: 'a caixa ficou degenerada ou inteira fora do canvas' })
      continue
    }
    if (!ehLogo(l)) continue
    // A logo que sai (ou sai MAIS) do canvas: a leitura só mede o que sobrou dentro (Codex R1: já fora e empurrada mais também é piora).
    const foraAntes = logoForaAntes.get(l.id) ?? 0
    const foraDepois = pxFora(l, depois.canvas)
    if (foraDepois > foraAntes + TOLERANCIA_PX) pioras.push({ propriedade: 'geometria', camadas: [l.id], antes: Math.round(foraAntes), depois: Math.round(foraDepois), motivo: `a logo ${foraAntes > 0 ? 'sai mais' : 'passou a sair'} do canvas (${Math.round(foraAntes)} → ${Math.round(foraDepois)} px fora; a leitura só mede o que sobrou dentro)` })
  }
  const visiveisDepois = new Map(depois.camadas.filter((l) => l.visible !== false).map((l) => [l.id, l]))
  const desaparecidas: string[] = []
  for (const l of antes.camadas) {
    if (l.visible === false || !(ehTextoComConteudo(l) || ehLogo(l))) continue
    if (visiveisDepois.has(l.id)) continue
    desaparecidas.push(l.id)
    if (ehLogo(l)) pioras.push({ propriedade: 'logo-sem-leitura', camadas: [l.id], antes: 'visível', depois: 'escondida', motivo: 'a logo foi escondida ou removida — não é uma logo legível' })
    else if (!permiteOcultar) pioras.push({ propriedade: 'geometria', camadas: [l.id], antes: 'visível', depois: 'escondido', motivo: 'o texto sumiu da peça (escondido ou removido) por um ajuste que não é de visibilidade' })
  }
  return { pioras, desaparecidas }
}

/**
 * As propriedades cujo lado não foi medido (cobertura `nao-avaliada`, régua sem medida, camada tocada sem métrica).
 * `naoAplicaveis`: a regra que não se aplica à peça de nenhum dos lados — hoje só `texto-sobre-assunto` numa peça
 * SEM foto de fundo (não há assunto a proteger; "não há" não é "não medimos"). Foto que existe e não baixou continua
 * "não medida" (fail-closed). Logo num arranjo ou fora do contrato também: o conserto é no editor (revisor D).
 */
function naoMedidas(antes: MedidaComparavel, depois: MedidaComparavel, alteradas: Set<string>): { naoMedidas: NaoMedida[]; naoAplicaveis: NaoMedida[] } {
  const saida: NaoMedida[] = []
  const naoAplicaveis: NaoMedida[] = []
  for (const regra of REGRAS_COMPARADAS) {
    const ca = antes.relatorio.cobertura[regra]
    const cd = depois.relatorio.cobertura[regra]
    const faltaA = !ca || ca.estado === 'nao-avaliada'
    const faltaD = !cd || cd.estado === 'nao-avaliada'
    if (!faltaA && !faltaD) continue
    const item: NaoMedida = { propriedade: regra, lado: faltaA && faltaD ? 'ambos' : faltaA ? 'antes' : 'depois', motivo: (faltaD ? cd?.motivo : ca?.motivo) ?? 'regra não avaliada' }
    if (regra === 'texto-sobre-assunto' && faltaA && faltaD && !fotoDeFundo(antes.camadas, antes.canvas) && !fotoDeFundo(depois.camadas, depois.canvas)) {
      naoAplicaveis.push({ ...item, motivo: 'a peça não tem foto de fundo: não há assunto a proteger' })
      continue
    }
    saida.push(item)
  }
  if (antes.contraste === null || depois.contraste === null) saida.push({ propriedade: 'contraste', lado: antes.contraste === null && depois.contraste === null ? 'ambos' : antes.contraste === null ? 'antes' : 'depois', motivo: 'a régua de contraste não mediu' })
  const semMetrica = new Set([...(antes.semMetrica ?? []), ...(depois.semMetrica ?? [])])
  const tocadasSemMetrica = [...alteradas].filter((id) => semMetrica.has(id))
  if (tocadasSemMetrica.length > 0) saida.push({ propriedade: 'geometria', lado: 'ambos', motivo: `o ajuste mexe em camada que a geometria não mede (fonte não cadastrada, texto curvo/fitty/auto-resize ou rich text): ${tocadasSemMetrica.join(', ')}` })
  return { naoMedidas: saida, naoAplicaveis }
}

/**
 * Compara ANTES e DEPOIS de um ajuste e decide. `achadoAlvo` é o id do achado
 * que o ajuste declarou corrigir (no relatório de ANTES).
 */
export function compararNaoPiora(antes: MedidaComparavel, depois: MedidaComparavel, opcoes: OpcoesDaComparacao = {}): ComparacaoDeNaoPiora {
  const achados = compararAchados(antes.relatorio, depois.relatorio)
  const vazios = new Set([...antes.camadas, ...depois.camadas].filter((l) => (l.type === 'text' || l.type === 'rich-text') && !ehTextoComConteudo(l)).map((l) => l.id))
  const contraste = antes.contraste && depois.contraste ? compararContraste(antes.contraste, depois.contraste, vazios) : { pioras: [], melhoras: [] }
  const geometria = compararGeometria(antes, depois, opcoes.permiteOcultar === true)
  // A leitura efetiva de um texto (a pior das suas entradas na régua), para julgar o achado `tratamento-piorou-leitura`.
  const leituraDe = (m: ContrasteMedido[] | null, camada: string) => (m ? (porTexto(m).get(camada) ?? null) : null)
  const leituraNaoPiorou = (camadas: string[]) =>
    camadas.every((c) => {
      const ta = leituraDe(antes.contraste, c)
      const td = leituraDe(depois.contraste, c)
      return !!ta && !!td && (td.ok || distancia(td) <= distancia(ta) + TOLERANCIA_DE_PIORA)
    })
  // O achado `tratamento-piorou-leitura` que APARECE sem a leitura do texto ter piorado (o véu ficou igual, a foto sob
  // ele mudou): não é piora — quem decide a leitura é o contraste por texto (revisor B).
  const piorasDosAchados = achados.pioras.filter((p) => !(p.propriedade === 'tratamento-piorou-leitura' && p.antes === null && leituraNaoPiorou(p.camadas)))
  const pioras = [...piorasDosAchados, ...contraste.pioras, ...geometria.pioras]
  const melhoras = [...achados.melhoras, ...contraste.melhoras]
  const { naoMedidas: semMedida, naoAplicaveis } = naoMedidas(antes, depois, new Set(opcoes.alteradas ?? []))
  const sumiu = new Set(geometria.desaparecidas)

  let achadoAlvo: ComparacaoDeNaoPiora['achadoAlvo']
  if (opcoes.achadoAlvo) {
    const alvo = antes.relatorio.achados.find((a) => a.id === opcoes.achadoAlvo)
    if (!alvo) {
      // O id que não está no ANTES: achado de visão (`visao-…`) nunca está na medida sem visão — não exige prova;
      // qualquer outro é um id desconhecido (digitado errado, ou já resolvido antes deste ajuste): não é prova de nada.
      achadoAlvo = opcoes.achadoAlvo.startsWith('visao')
        ? { id: opcoes.achadoAlvo, regra: 'visao', estado: 'nao-mensuravel', antes: null, depois: null }
        : { id: opcoes.achadoAlvo, regra: '?', estado: 'nao-encontrado', antes: null, depois: null }
    } else if (alvo.camadas.length > 0 && alvo.camadas.every((c) => sumiu.has(c))) {
      // Esconder a camada do achado não o resolve: some o achado, não o problema.
      achadoAlvo = { id: alvo.id, regra: alvo.regra, estado: 'nao-melhorou', antes: mecanico(alvo) ? gravidadeDoAchado(alvo).valor : null, depois: null }
    } else if (alvo.regra === 'texto-sem-leitura' && alvo.certeza !== 'visao') {
      // A leitura do texto é medida pela régua, não pelo achado: a gravidade é a distância ao alvo (pior das camadas).
      const distanciaDe = (m: ContrasteMedido[] | null): number | null => {
        if (!m) return null
        const textos = m.flatMap((g) => (g.textos ?? [])).filter((t) => alvo.camadas.includes(t.camada) && !vazios.has(t.camada))
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
      // O achado de tratamento que SOME porque o texto saiu de sob o gradiente não está resolvido se a leitura piorou.
      const sumiuDeVerdade = !ainda && (alvo.regra !== 'tratamento-piorou-leitura' || leituraNaoPiorou(alvo.camadas))
      achadoAlvo = {
        id: alvo.id,
        regra: alvo.regra,
        estado: !ainda ? (sumiuDeVerdade ? 'resolvido' : 'nao-melhorou') : gd!.valor < ga.valor - gd!.tolerancia ? 'melhorou' : 'nao-melhorou',
        antes: ga.valor,
        depois: gd?.valor ?? null,
      }
    }
  }

  const veredito: ComparacaoDeNaoPiora['veredito'] =
    pioras.length > 0
      ? AJUSTE_PIOROU_ARTE
      : semMedida.length > 0
        ? AJUSTE_NAO_MEDIDO
        : achadoAlvo?.estado === 'nao-melhorou' || achadoAlvo?.estado === 'nao-encontrado'
          ? AJUSTE_NAO_MELHOROU_O_ACHADO
          : 'aceito'
  return { pioras, naoMedidas: semMedida, melhoras, ...(achadoAlvo ? { achadoAlvo } : {}), naoAplicaveis, veredito }
}

/** Uma frase para o registro da recusa. */
export function motivoDaComparacao(c: ComparacaoDeNaoPiora): string {
  if (c.veredito === AJUSTE_PIOROU_ARTE) return `o ajuste piora a peça: ${c.pioras.map((p) => `${p.propriedade} em ${p.camadas.join(', ')} (${p.motivo})`).join('; ')}`
  if (c.veredito === AJUSTE_NAO_MEDIDO) return `não foi possível provar que o ajuste não piora: ${c.naoMedidas.map((n) => `${n.propriedade} não medida ${n.lado === 'ambos' ? 'antes nem depois' : n.lado} (${n.motivo})`).join('; ')}`
  if (c.veredito === AJUSTE_NAO_MELHOROU_O_ACHADO) {
    if (c.achadoAlvo!.estado === 'nao-encontrado') return `o ajuste declarou corrigir ${c.achadoAlvo!.id}, que não é um achado da revisão desta versão (id desconhecido, ou já resolvido antes deste ajuste): sem achado, não há prova de melhora — tire o rótulo ou revise de novo`
    if (c.achadoAlvo!.depois === null) return `o ajuste declarou corrigir ${c.achadoAlvo!.id} (${c.achadoAlvo!.regra}) e só escondeu a camada do achado: sumir não é resolver`
    return `o ajuste declarou corrigir ${c.achadoAlvo!.id} (${c.achadoAlvo!.regra}) e não o resolveu nem o melhorou (${c.achadoAlvo!.antes} → ${c.achadoAlvo!.depois})`
  }
  return 'aceito: nenhuma propriedade medida piorou'
}
