/**
 * MEDIR A COPY antes de compor (PR 8 de "Marca simples, copy melhor", F2,
 * 12/09/2026) — módulo PURO, sem Prisma, sem sharp.
 *
 * Quem escreve a copy no chat precisava de uma medida VERIFICÁVEL antes de
 * gastar uma composição: até aqui o único jeito de saber se a manchete cabia
 * era compor e ler a recusa (`TEXTO_NAO_CABE_NA_COLUNA`). Aqui a copy passa
 * pela MESMA régua da composição — `montarBloco` e `medirLinha`, com o mesmo
 * medidor do render (o napi-rs no servidor; uma régua falsa no teste) — e volta
 * com três verdades, ditas pelo que são:
 *
 *  - a MEDIDA EXATA com o texto (largura por linha, escala necessária até o
 *    piso de 80%, caixa final, linhas), quando a fonte do papel está carregada;
 *  - "NÃO MEDIDO" quando a fonte não está no servidor: o medidor caiu na fonte
 *    de fallback e o número não vale — nunca se finge que mediu;
 *  - "APROXIMADO" quando há palavra entre [colchetes]: o destaque troca a
 *    família do trecho e a largura extra é estimada trecho a trecho (o medidor
 *    do servidor não mede rich text).
 *
 * E o ORÇAMENTO antes do texto (`orcamentoDaVariante`): quantos caracteres
 * cabem numa linha de cada papel, no tamanho da assinatura, medidos com uma
 * amostra em português — é o número que a instrução do conector dava de cabeça
 * ("headline até ~18 caracteres") e que muda de marca para marca.
 */

import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { estiloDaCamada, papeisQueFaltam, papelDoNome, type AssinaturaDaMarca, type EstiloDePapel } from './assinatura'
import { aplicarPrefixo, camadaDoPapel, larguraExtraDoDestaque, medirLinha, PISO_DE_ESCALA, type OrcamentoDeLinha } from './blocos'
import type { ArranjoDeGrupo } from './combinacoes'
import { lerDestaques, type EstiloDeDestaque } from './destaques'
import { estiloDeDestaqueDoPapel, prepararBlocos, type PecaParaBlocos } from './preparar-blocos'
import { DIMENSOES, type Formato, type Papel } from './spec'

/** Amostra em português para o orçamento por caracteres (a largura média de uma letra da marca). */
export const AMOSTRA_DO_ORCAMENTO = 'Sexta é dia de churrasco com a família no salão'

export interface AreaUtil {
  formato: Formato
  larguraDoCanvas: number
  alturaDoCanvas: number
  margemH: number
  safeTopo: number
  safeRodape: number
  /** A largura entre as margens — a coluna em que cada linha tem de caber. */
  colunaUtil: number
  /** A altura entre a safe area do topo e a do rodapé. */
  alturaUtil: number
  /** Multiplicador dos tamanhos da página de assinatura para este formato (1 quando a página é do formato). */
  escalaDoFormato: number
}

export function areaUtilDe(assinatura: AssinaturaDaMarca, formato: Formato): AreaUtil {
  const canvas = DIMENSOES[formato]
  const geo = assinatura.numeros.geometria[formato]
  const escalaDoFormato = assinatura.origem.formatoDaPagina === formato ? 1 : geo.escalaDeFonte
  return {
    formato,
    larguraDoCanvas: canvas.width,
    alturaDoCanvas: canvas.height,
    margemH: geo.margemH,
    safeTopo: geo.safeTopo,
    safeRodape: geo.safeRodape,
    colunaUtil: canvas.width - 2 * geo.margemH,
    alturaUtil: canvas.height - geo.safeTopo - geo.safeRodape,
    escalaDoFormato,
  }
}

export interface OrcamentoDoPapel {
  papel: Papel
  fonte: string
  /** O corpo com que o papel sai neste formato (px). */
  fontSize: number
  /** A coluna do papel (a coluna útil, menos a largura máxima da assinatura quando ela limita). */
  coluna: number
  /** Quantos caracteres cabem numa linha, aproximado pela largura média de uma letra da amostra. */
  caracteresPorLinha: number | null
  /** Quantas linhas do papel cabem na altura útil (só o corpo × entrelinha; sem contar os outros blocos). */
  linhasNaAlturaUtil: number | null
  naoMedido: boolean
}

function estiloComEscala(estilo: EstiloDePapel, escala: number): EstiloDePapel {
  return { ...estilo, fontSize: estilo.fontSize * escala }
}

/**
 * O orçamento ANTES do texto, papel a papel: quantos caracteres cabem numa
 * linha e quantas linhas cabem na altura útil. Aproximado por construção — a
 * largura de uma linha depende das letras que ela tem — e dito assim.
 */
export function orcamentoDaVariante(args: {
  assinatura: AssinaturaDaMarca
  formato: Formato
  medir: MeasureTextBox
  fontesNaoCarregadas: ReadonlySet<string>
}): OrcamentoDoPapel[] {
  const area = areaUtilDe(args.assinatura, args.formato)
  const saida: OrcamentoDoPapel[] = []
  for (const [papel, estilo] of Object.entries(args.assinatura.papeis) as Array<[Papel, EstiloDePapel]>) {
    const coluna = Math.floor(area.colunaUtil * (estilo.larguraMaxima ?? 1))
    const naoMedido = args.fontesNaoCarregadas.has(estilo.fontFamily)
    const base = camadaDoPapel({ papel, linhas: [AMOSTRA_DO_ORCAMENTO], estilo, escala: area.escalaDoFormato, width: coluna, textAlign: 'left', groupId: 'orcamento', corDaMancha: args.assinatura.numeros.mancha })
    const m = naoMedido ? null : medirLinha(args.medir, base, AMOSTRA_DO_ORCAMENTO, coluna)
    const fontSize = Number(base.style?.fontSize ?? Math.round(estilo.fontSize * area.escalaDoFormato))
    const alturaDaLinha = fontSize * estilo.lineHeight
    saida.push({
      papel,
      fonte: estilo.fontFamily,
      fontSize,
      coluna,
      caracteresPorLinha: m && m.largura > 0 ? Math.max(1, Math.floor((AMOSTRA_DO_ORCAMENTO.length * coluna) / m.largura)) : null,
      linhasNaAlturaUtil: naoMedido ? null : Math.max(1, Math.floor(area.alturaUtil / alturaDaLinha)),
      naoMedido,
    })
  }
  return saida
}

export interface MedidaDeLinha {
  linha: string
  /** Largura da tinta no tamanho da assinatura (antes de qualquer redução), px. */
  largura: number | null
  coluna: number
  cabe: boolean | null
  /** Quantos caracteres caberiam nesta linha, na mesma fonte e tamanho. */
  caracteresQueCabem: number | null
}

export type SituacaoDoBloco = 'cabe' | 'cabe-reduzido' | 'nao-cabe' | 'papel-ausente'

export interface MedidaDeBloco {
  papel: Papel
  /** O id que a composição daria à camada (`servico`, `servico-2`, `headline2`…) — a identidade do bloco. */
  id: string
  situacao: SituacaoDoBloco
  fonte: string | null
  /** A escala aplicada para caber (1 = tamanho da assinatura; até 0,8). */
  escala: number | null
  /** O corpo final (px), a caixa e as linhas do bloco como ele sairia. */
  fontSize: number | null
  width: number | null
  height: number | null
  linhas: number
  /** Alguma fonte que a montagem PEDIU não está no servidor: os números saíram na fonte de fallback e não valem. */
  naoMedido: boolean
  /** Há destaque entre [colchetes]: a largura extra do trecho é estimada (o medidor não mede rich text). */
  aproximado: boolean
  linhasMedidas: MedidaDeLinha[]
  /** Só quando não cabe: o orçamento por linha que a composição devolveria. */
  orcamento?: OrcamentoDeLinha[]
  /** F3: o bloco é uma camada EXTRA — `papel` é o de estilo; aqui a função original, a herança e onde pousa. */
  extra?: { funcao: string; herdaDe: Papel; grupoVisual: string }
  avisos: string[]
}

export interface MedicaoDaCopy {
  areaUtil: AreaUtil
  /** Os blocos COMO A COMPOSIÇÃO OS MONTARIA: mesmos arranjos, divisão de linhas, estilos e ids. */
  blocos: MedidaDeBloco[]
  /** Todo bloco coube (na escala que fosse) e nenhum papel falta. */
  cabeTudo: boolean
  papeisAusentes: Papel[]
  /** Algum bloco saiu na fonte de fallback. */
  naoMedido: boolean
  aproximado: boolean
  fontesNaoCarregadas: string[]
  /** A altura somada dos blocos que couberam, sem os vãos — contra a altura útil. */
  alturaDosBlocos: number
  /** De onde saiu a divisão da manchete em duas vozes. */
  segundaVoz: 'contrato' | 'legado' | 'nenhuma'
  /** O arranjo escolhido para cada grupo (o da página ou uma combinação salva). */
  arranjos: Array<{ grupo: string; id: string; nome: string; origem: ArranjoDeGrupo['origem']; motivo: string }>
  avisos: string[]
}

/**
 * Mede a copy contra UMA assinatura (a variante já escolhida) com a MESMA
 * preparação da composição (`prepararBlocos`): agrupamento, arranjos,
 * distribuição das linhas, segunda voz, estilos, ids e a régua. O que sai daqui
 * é o que `comporPeca` montaria — bloco a bloco, com a identidade de cada um.
 */
export function medirCopy(args: {
  spec: PecaParaBlocos
  assinatura: AssinaturaDaMarca
  formato: Formato
  medir: MeasureTextBox
  /** As famílias cadastradas no projeto (o destaque "pesado" escolhe entre elas). */
  familias: string[]
  /**
   * A família está carregada no servidor de render? Consultada sobre as
   * famílias que a montagem MEDIU em cada bloco (`familiasMedidas`, a resposta
   * de quem mediu) — não sobre uma lista prévia: o segundo texto de serviço
   * pode ter família própria, e a combinação salva também (R04).
   */
  fonteCarregada: (familia: string) => boolean
  /** As combinações salvas do projeto, já como arranjos (a composição também as considera). */
  combinacoesSalvas?: ArranjoDeGrupo[]
}): MedicaoDaCopy {
  const area = areaUtilDe(args.assinatura, args.formato)
  const preparados = prepararBlocos({
    spec: args.spec,
    assinatura: args.assinatura,
    colunaUtil: area.colunaUtil,
    escalaDoFormato: area.escalaDoFormato,
    mancha: args.assinatura.numeros.mancha,
    medir: args.medir,
    familias: args.familias,
    combinacoesSalvas: args.combinacoesSalvas ?? [],
  })
  const avisos = [...preparados.avisos]
  // Os avisos que a montagem deu por PAPEL ("headline: a copy marcou destaque, mas a marca não tem estilo…") viajam
  // também no bloco: quem lê o bloco tem de ver por que ele saiu sem destaque ou sem o que pediu.
  const avisosDoPapel = (papel: Papel) => preparados.avisos.filter((a) => a.startsWith(`${papel}:`))
  const medidas: MedidaDeBloco[] = []
  const fontesUsadasSemCarregar = new Set<string>()

  // Papel pedido que a variante (e os arranjos) não têm: a preparação o
  // descarta em silêncio; aqui ele é DECLARADO.
  // Papel pedido que a ASSINATURA não tem é ausente — a MESMA conferência que a
  // composição faz ANTES dos arranjos (`papeisQueFaltam` → PAPEIS_INCOMPATIVEIS):
  // uma combinação salva que oferece o papel monta o bloco aqui, mas a
  // composição recusa a peça (R05). O bloco montado por ela não conta.
  // F3: o papel que HERDA estilo (camada extra) não está ausente — a mesma
  // resolução da composição (`resolverCamadasExtras`, dentro da preparação) diz
  // o que falta de verdade; e o bloco montado conta pela FUNÇÃO que cumpre.
  // Quem HERDA estilo não é "papel ausente" por si: a falha dele é por bloco (abaixo, R03).
  const papeisPedidos = [...new Set((args.spec.blocos ?? []).filter((b) => !b.herdaDe).map((b) => b.papel as Papel))]
  const faltamNaAssinatura = new Set(preparados.faltam)
  const preparadosPorPapel = new Set([...preparados.montados, ...preparados.recusas].map((b) => b.funcao))
  const papeisAusentes = papeisPedidos.filter((p) => faltamNaAssinatura.has(p) || (!preparadosPorPapel.has(p) && !(p === 'headline' && preparadosPorPapel.has('headline2' as Papel))))
  for (const papel of papeisAusentes) {
    const linhas = (args.spec.blocos ?? []).find((b) => (b.papel as Papel) === papel)?.linhas ?? []
    medidas.push({ papel, id: papel, situacao: 'papel-ausente', fonte: null, escala: null, fontSize: null, width: null, height: null, linhas: linhas.length, naoMedido: false, aproximado: false, linhasMedidas: [], avisos: [`a variante não tem o papel "${papel}"`] })
  }

  // R03: o extra cuja origem de estilo a variante não tem (o livre herdando um
  // `cta` ausente, o serviço repetido herdando de papel ausente) não vira medida
  // pela preparação — e sumia do resultado com `cabeTudo` verdadeiro enquanto
  // `comporPeca` recusava a mesma entrada. Cada falha é declarada pelo id do
  // bloco afetado e entra em `cabeTudo`.
  for (const f of preparados.falhas) {
    medidas.push({ papel: f.herdaDe, id: f.id, situacao: 'papel-ausente', fonte: null, escala: null, fontSize: null, width: null, height: null, linhas: f.linhas, naoMedido: false, aproximado: false, linhasMedidas: [], extra: { funcao: f.funcao, herdaDe: f.herdaDe, grupoVisual: f.grupoVisual }, avisos: [`a variante não tem o papel "${f.herdaDe}", de que "${f.id}" herdaria o estilo`] })
  }

  const medirLinhas = (papel: Papel, estilo: EstiloDePapel, linhasDaCopy: string[], naoMedido: boolean, destaque: EstiloDeDestaque | null): MedidaDeLinha[] => {
    const coluna = Math.floor(area.colunaUtil * (estilo.larguraMaxima ?? 1))
    // O texto EFETIVO da linha é o que `montarBloco` mede: `lerDestaques` tira
    // os colchetes — inclusive o colchete sem par, que a montagem remove com
    // aviso (R07). `linha` continua sendo a string do autor.
    const lidas = linhasDaCopy.map(lerDestaques)
    const limpas = lidas.map((l) => l.texto)
    const base = camadaDoPapel({ papel, linhas: limpas, estilo, escala: area.escalaDoFormato, width: coluna, textAlign: 'left', groupId: 'medicao', corDaMancha: args.assinatura.numeros.mancha })
    // A linha EFETIVA leva o prefixo da assinatura (o "→ " do CTA) como a
    // montagem a mede; `linha` continua sendo a string do autor (R06).
    const efetivas = aplicarPrefixo(limpas, estilo.prefixo)
    // O destaque só vale como na montagem: [colchetes] na copy E estilo na marca
    // (`montarBloco`: `pediuDestaque && temEstilo`). Aí cada trecho ganha a
    // família pesada e alarga a linha — a MESMA conta (`larguraExtraDoDestaque`)
    // entra na medida por linha, senão o bloco diz "não cabe" e a linha "cabe" (R08).
    const temEstilo = Boolean(destaque && Object.values(destaque).some(Boolean))
    const ativo = lidas.some((l) => l.trechos.length > 0) && temEstilo ? destaque : null
    return linhasDaCopy.map((linha, i) => {
      const efetiva = efetivas[i]
      const m = naoMedido ? null : medirLinha(args.medir, base, efetiva, coluna)
      const extra = m && ativo ? larguraExtraDoDestaque(args.medir, base, limpas[i], lidas[i].trechos, ativo.fontFamily, coluna) : 0
      const largura = m ? m.largura + extra : null
      return {
        linha,
        largura: largura !== null ? Math.round(largura) : null,
        coluna,
        cabe: largura !== null ? largura <= coluna : null,
        caracteresQueCabem: largura !== null && largura > 0 ? Math.max(1, Math.floor((efetiva.length * coluna) / largura) - (efetiva.length - limpas[i].length)) : null,
      }
    })
  }
  const naoCarregou = (familias: string[]) => {
    const faltam = familias.filter((f) => !args.fonteCarregada(f))
    for (const f of faltam) fontesUsadasSemCarregar.add(f)
    return faltam.length > 0
  }

  for (const b of preparados.montados) {
    // O extra existe mesmo quando a variante não tem o papel: é dele que herda
    // o estilo, e a peça o compõe — declará-lo ausente seria medir outra peça.
    if (faltamNaAssinatura.has(b.papel) && !b.extra) continue
    const naoMedido = naoCarregou(b.familiasMedidas)
    medidas.push({
      papel: b.papel,
      id: b.layer.id,
      situacao: b.escala < 1 ? 'cabe-reduzido' : 'cabe',
      fonte: b.estilo.fontFamily,
      escala: b.escala,
      fontSize: Number(b.layer.style?.fontSize ?? null),
      width: b.width,
      height: b.height,
      linhas: b.linhasDaCopy.length,
      naoMedido,
      aproximado: Boolean(b.destacado),
      linhasMedidas: medirLinhas(b.papel, b.estilo, b.linhasDaCopy, naoMedido, b.destaque),
      ...(b.extra ? { extra: { funcao: b.extra.funcao, herdaDe: b.extra.herdaDe, grupoVisual: b.extra.grupoVisual } } : {}),
      avisos: [...avisosDoPapel(b.papel), ...(b.escala < 1 ? [`fonte reduzida a ${Math.round(b.escala * 100)}% para caber na coluna (piso ${Math.round(PISO_DE_ESCALA * 100)}%)`] : [])],
    })
  }
  for (const r of preparados.recusas) {
    if (faltamNaAssinatura.has(r.papel) && !r.extra) continue
    const naoMedido = naoCarregou(r.familiasMedidas)
    const coluna = Math.floor(area.colunaUtil * (r.estilo.larguraMaxima ?? 1))
    medidas.push({
      papel: r.papel,
      id: r.id,
      situacao: 'nao-cabe',
      fonte: r.estilo.fontFamily,
      escala: null,
      fontSize: null,
      width: null,
      height: null,
      linhas: r.linhasDaCopy.length,
      naoMedido,
      aproximado: r.linhasDaCopy.some((l) => lerDestaques(l).trechos.length > 0),
      linhasMedidas: medirLinhas(r.papel, r.estilo, r.linhasDaCopy, naoMedido, r.destaque),
      orcamento: r.orcamento,
      avisos: [
        ...avisosDoPapel(r.papel),
        naoMedido
          ? `a fonte de "${r.papel}" (${r.familiasMedidas.filter((f) => !args.fonteCarregada(f)).join(', ')}) não está no servidor: a recusa foi medida na fonte de fallback e NÃO vale — cadastre a fonte antes de reescrever`
          : `linha maior que a coluna (${coluna}px) mesmo a ${Math.round(PISO_DE_ESCALA * 100)}% da fonte: reescreva com o orçamento`,
      ],
    })
  }

  const alturaDosBlocos = medidas.reduce((s, m) => s + (m.height ?? 0), 0)
  if (alturaDosBlocos > area.alturaUtil) avisos.push(`os blocos somam ${alturaDosBlocos}px de altura, mais que a altura útil (${area.alturaUtil}px): a peça não tem onde pousar tudo sem reduzir`)
  return {
    areaUtil: area,
    blocos: medidas,
    cabeTudo: papeisAusentes.length === 0 && preparados.falhas.length === 0 && medidas.every((m) => m.situacao === 'cabe' || m.situacao === 'cabe-reduzido'),
    papeisAusentes,
    naoMedido: medidas.some((m) => m.naoMedido),
    aproximado: medidas.some((m) => m.aproximado),
    fontesNaoCarregadas: [...fontesUsadasSemCarregar],
    alturaDosBlocos,
    segundaVoz: preparados.segundaVoz,
    arranjos: preparados.arranjos,
    avisos,
  }
}

/**
 * As famílias que a variante efetivamente USA: a de cada papel, a de TODO texto
 * reconhecido da página (o segundo serviço com fonte própria, que
 * `montarAssinatura` não guarda em `papeis` — só o primeiro estilo de cada
 * papel), a do destaque desenhado na página, a do destaque padrão E a do
 * destaque AUTOMÁTICO de cada estilo — a família pesada que `pesado: true`
 * escolhe entre as cadastradas (`familias`), resolvida pela MESMA função da
 * preparação dos blocos (`estiloDeDestaqueDoPapel`). É contra esta lista que
 * `ver-assinatura` declara as fontes ausentes: pela lista de `papeis`, a
 * "Fonte Rara" do segundo serviço sumia da resposta (R09 da revisão de
 * fd82505c); só com as famílias explícitas, a "Barlow Bold" que o destaque
 * automático usaria sumia também, e `medir-copy` com [colchetes] a declarava
 * ausente enquanto `ver-assinatura` dizia "nenhuma" (R11 da revisão de
 * 775f4377).
 */
export function familiasUsadasNaVariante(a: AssinaturaDaMarca, camadas: Layer[] = a.camadasDaPagina ?? [], familias: string[] = []): string[] {
  const out = new Set<string>()
  const olhar = (e: EstiloDePapel) => {
    if (e.fontFamily) out.add(e.fontFamily)
    if (e.destaque?.fontFamily) out.add(e.destaque.fontFamily)
    const efetivo = estiloDeDestaqueDoPapel(e, a.numeros.destaque, familias)
    if (efetivo?.fontFamily) out.add(efetivo.fontFamily)
  }
  for (const e of Object.values(a.papeis) as EstiloDePapel[]) olhar(e)
  for (const c of camadas) {
    if ((c.type !== 'text' && c.type !== 'rich-text') || c.visible === false) continue
    if (!papelDoNome(c.name) && !papelDoNome(c.id)) continue
    const e = estiloDaCamada(c, camadas)
    if (e) olhar(e)
  }
  if (a.numeros.destaque.fontFamily) out.add(a.numeros.destaque.fontFamily)
  return [...out]
}
