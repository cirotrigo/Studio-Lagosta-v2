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
import { colunaDaCaixa } from './blocos'
import { conferirLogo, excessosDeLinhas, type ArquetipoPreparado } from './arquetipos/na-spec'
import { alinhaDoPapel, caixasMaximas, GAP_DA_PILHA, type Materializacao, type PapelMaterializado, type ProblemaDeMaterializacao } from './arquetipos/materializar'
import { ajusteFinalNecessario, caixasDosItens, camadasNaReferencia, papeisDeLista, papelGeometrico, prepararNoArquetipo } from './arquetipos/no-compositor'
import { partidaNoArquetipo } from './arquetipos/candidatos-espaciais'
import { obstaculosDosAcentos, posicionarAcentos, receitasDoArquetipo, type ProblemaDoAcento } from './arquetipos/acentos'
import type { TextGeometryIssue } from '@/lib/creatives/text-geometry'
import type { PapelDeTexto } from './arquetipos/tipos'
import { papelDoBloco, tintasAtivas } from './arquetipos/fundo'

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
  /**
   * Largura da tinta no tamanho da assinatura (antes de qualquer redução), px. Com arquétipo (T1a), a do bloco
   * montado é medida na escala FINAL dele — a mesma da caixa e do corpo devolvidos.
   */
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
  /**
   * Com arquétipo (T1a): a definição exata e a medida contra ELA — a coluna e a
   * capacidade de cada papel (as mesmas do compor), onde cada caixa pousaria, e
   * o que não cabe (linhas acima de `linhasMax`, caixa fora da referência ou da
   * zona efetiva). Ausente sem arquétipo.
   */
  arquetipo?: MedicaoDoArquetipo
  /**
   * #8 (foto em caixa): o papel do liso que ESTA medição escolheu (`papelDoBloco`) pelas tintas da preparação dela — a da
   * variante medida, seja a escolhida ou uma de `outrasVariantes`. Ausente nos outros fundos.
   */
  fundo?: string
  avisos: string[]
}

export interface MedicaoDoArquetipo {
  id: string
  versao: number
  impressao: string
  formato: Formato
  /** Por papel: a coluna de tinta (px), a capacidade de altura (px), as linhas máximas (HARD) e a estimativa SOFT. */
  papeis: Partial<Record<PapelDeTexto, { largura: number; coluna: number; capacidade: number; linhasMax: number; caracteresPorLinha?: number }>>
  /**
   * Onde cada caixa pousaria na posição de PARTIDA (quando tudo coube): a referência, ou — se a área segura do projeto
   * a corta — a posição válida mais perto dela. Não é a posição final: desde o CP2B o compor escolhe, pela foto, o
   * corte e a posição de cada faixa dentro das zonas.
   */
  posicoes?: Partial<Record<PapelDeTexto | 'logo', PapelMaterializado>>
  /**
   * A busca espacial pela foto NÃO roda aqui (CP2B): esta medida responde "a copy cabe estruturalmente no arquétipo?"
   * (na referência, o portão que o compor também usa) e NÃO garante que a foto tenha uma posição visual boa — isso só
   * o compor decide (e recusa com SEM_COMBINACAO quando não tem).
   */
  avaliacaoEspacial: 'nao-executada'
  problemas: ProblemaDeMaterializacao[]
  excessosDeLinhas: Array<{ papel: Papel; linhas: number; linhasMax: number }>
  /** O que o ajuste final (autofix) teria de encolher na referência — com arquétipo, recusa (a mesma conferência do compor). */
  ajustesFinais: TextGeometryIssue[]
  /**
   * T1b: os acentos do arquétipo na posição de PARTIDA, pela mesma conta do compor (`posicionarAcentos`): onde cada um
   * pousaria, o opcional que sairia e o OBRIGATÓRIO que não cabe (recusa no compor: `cabeTudo` falso). A logo
   * automática (canto mais calmo) só é conhecida no compor, com a foto.
   */
  acentos: { previstos: Array<{ elemento: string; tipo: string; rect: { x: number; y: number; width: number; height: number }; item?: number }>; omitidos: ProblemaDoAcento[]; recusas: ProblemaDoAcento[] }
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
  /** T1a: o arquétipo já resolvido (`prepararArquetipo`) — a medida é contra a referência dele, como no compor. */
  arquetipo?: ArquetipoPreparado | null
}): MedicaoDaCopy {
  const area = areaUtilDe(args.assinatura, args.formato)
  const arq = args.arquetipo ?? null
  if (arq) conferirLogo(arq.definicao, Boolean(args.assinatura.logo))
  // O piso do PROJETO, como no compor (`pisoDoProjeto`): a coluna de cada papel é a da referência efetiva (opção A).
  const pisoArq = arq ? (args.assinatura.pisoDoProjeto ?? args.assinatura.numeros.geometria)[args.formato] : null
  // A margem da marca (29/10/2026): o medir mede a peça NOVA — sempre `'marca'`, como o compor compõe.
  const caixasArq = arq ? caixasMaximas(arq.definicao, arq.formato, DIMENSOES[args.formato], pisoArq!, 'marca') : null
  const listasArq = arq ? papeisDeLista(arq.definicao) : null
  const preparar = (escalaMaximaDoPapel?: (p: Papel) => number | undefined) =>
    prepararBlocos({
      spec: args.spec,
      assinatura: args.assinatura,
      colunaUtil: area.colunaUtil,
      escalaDoFormato: area.escalaDoFormato,
      mancha: args.assinatura.numeros.mancha,
      medir: args.medir,
      familias: args.familias,
      combinacoesSalvas: args.combinacoesSalvas ?? [],
      ...(caixasArq ? { caixaDoPapel: (p: Papel) => caixasArq[papelGeometrico(p)], ...(escalaMaximaDoPapel ? { escalaMaximaDoPapel } : {}) } : {}),
      ...(listasArq?.size ? { listaDoPapel: (p: Papel) => listasArq.has(papelGeometrico(p)) } : {}),
    })
  // Com arquétipo, a MESMA escada da unidade do compor (`prepararNoArquetipo`).
  const noArquetipo = arq
    ? prepararNoArquetipo({ arquetipo: arq.definicao, formato: arq.formato, canvas: DIMENSOES[args.formato], geometria: pisoArq!, gap: GAP_DA_PILHA, margem: 'marca', preparar })
    : null
  const preparados = noArquetipo ? noArquetipo.preparados : preparar()
  // #8: o papel do liso pelas tintas DESTA preparação (a da assinatura recebida), a mesma conta do compor — sem preparar
  // de novo. Nenhum papel serve: a mesma recusa do compor (`ARQUETIPO_FUNDO_INDISPONIVEL`).
  const fundo = arq?.definicao.fundo === 'foto-em-caixa' ? papelDoBloco(arq.definicao, args.assinatura.numeros, tintasAtivas(noArquetipo!.montados)).fundo : undefined
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
    // R21: as linhas são as do bloco COMUM do papel — o extra da mesma função pode vir antes dele na spec.
    const linhas = (args.spec.blocos ?? []).find((b) => (b.papel as Papel) === papel && !b.herdaDe)?.linhas ?? []
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

  // 🔴 A coluna é a que a MONTAGEM usou (`b.coluna`/`r.coluna`), nunca recalculada aqui: com arquétipo ela é a da
  // referência de cada papel (T1a), e uma conta paralela pela coluna útil diria "cabe" onde a composição recusa.
  // Com arquétipo, a linha do bloco montado é medida na ESCALA FINAL dele (a da caixa e do corpo devolvidos); sem
  // arquétipo, no tamanho de assinatura, como sempre.
  const medirLinhas = (papel: Papel, estilo: EstiloDePapel, linhasDaCopy: string[], naoMedido: boolean, destaque: EstiloDeDestaque | null, coluna: number, escala = area.escalaDoFormato): MedidaDeLinha[] => {
    // O texto EFETIVO da linha é o que `montarBloco` mede: `lerDestaques` tira
    // os colchetes — inclusive o colchete sem par, que a montagem remove com
    // aviso (R07). `linha` continua sendo a string do autor.
    const lidas = linhasDaCopy.map(lerDestaques)
    const limpas = lidas.map((l) => l.texto)
    const base = camadaDoPapel({ papel, linhas: limpas, estilo, escala, width: coluna, textAlign: 'left', groupId: 'medicao', corDaMancha: args.assinatura.numeros.mancha })
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
      linhasMedidas: medirLinhas(b.papel, b.estilo, b.linhasDaCopy, naoMedido, b.destaque, b.coluna, arq ? area.escalaDoFormato * b.escala : area.escalaDoFormato),
      ...(b.extra ? { extra: { funcao: b.extra.funcao, herdaDe: b.extra.herdaDe, grupoVisual: b.extra.grupoVisual } } : {}),
      avisos: [...avisosDoPapel(b.papel), ...(b.escala < 1 ? [`fonte reduzida a ${Math.round(b.escala * 100)}% para caber na coluna (piso ${Math.round(PISO_DE_ESCALA * 100)}%)`] : [])],
    })
  }
  for (const r of preparados.recusas) {
    if (faltamNaAssinatura.has(r.papel) && !r.extra) continue
    const naoMedido = naoCarregou(r.familiasMedidas)
    const coluna = r.coluna
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
      linhasMedidas: medirLinhas(r.papel, r.estilo, r.linhasDaCopy, naoMedido, r.destaque, r.coluna),
      orcamento: r.orcamento,
      avisos: [
        ...avisosDoPapel(r.papel),
        naoMedido
          ? `a fonte de "${r.papel}" (${r.familiasMedidas.filter((f) => !args.fonteCarregada(f)).join(', ')}) não está no servidor: a recusa foi medida na fonte de fallback e NÃO vale — cadastre a fonte antes de reescrever`
          : r.altura
            ? `a caixa tem ${r.altura.medida}px de altura e a referência do arquétipo comporta ${r.altura.capacidade}px mesmo a ${Math.round(PISO_DE_ESCALA * 100)}% da fonte: tire linhas ou encurte`
            : r.orcamento.length === 0 && r.quebras?.length
              ? `${r.quebras.map((q) => `"${q.linha}"`).join(', ')} se desenha em mais de uma linha na coluna (${coluna}px) — há quebra dentro do item: cada linha da copy é um item`
              : `linha maior que a coluna (${coluna}px) mesmo a ${Math.round(PISO_DE_ESCALA * 100)}% da fonte: reescreva com o orçamento`,
      ],
    })
  }

  const alturaDosBlocos = medidas.reduce((s, m) => s + (m.height ?? 0), 0)
  // Com arquétipo a altura útil da página não decide nada (a capacidade é a de cada referência, abaixo).
  if (!arq && alturaDosBlocos > area.alturaUtil) avisos.push(`os blocos somam ${alturaDosBlocos}px de altura, mais que a altura útil (${area.alturaUtil}px): a peça não tem onde pousar tudo sem reduzir`)
  // T1a/CP2B: o MESMO portão estrutural do compor — unidades por papel, na área segura do projeto, cada faixa numa
  // posição vertical que cabe na zona (a referência, ou o resgate mais perto dela). A busca pela foto NÃO roda aqui.
  let medicaoDoArquetipo: MedicaoDoArquetipo | undefined
  if (arq) {
    const piso = (args.assinatura.pisoDoProjeto ?? args.assinatura.numeros.geometria)[args.formato]
    const unidades = noArquetipo!.unidades
    const partida = partidaNoArquetipo({
      arquetipo: arq.definicao,
      formato: arq.formato,
      canvas: DIMENSOES[args.formato],
      geometria: piso,
      unidades,
      logo: args.assinatura.logo ? { razao: args.assinatura.logo.razao } : null,
      gap: GAP_DA_PILHA,
      margem: 'marca',
    })
    const m: Materializacao = 'problemas' in partida ? { ok: false, problemas: partida.problemas } : partida.materializacao
    for (const r of 'resgatados' in partida ? partida.resgatados : []) {
      avisos.push(
        `arquétipo: ${r.causa === 'ornamento' ? `com ${r.membro} na referência, os ornamentos do arranjo saem da zona efetiva` : `a referência de ${r.membro} sai da zona efetiva (a área segura do projeto a corta)`}; a medida vale na posição válida mais perto dela (${r.dy} px), de onde o compor parte`,
      )
    }
    const limites = arq.definicao.formatos[arq.formato].limitesDeTexto
    const papeis: MedicaoDoArquetipo['papeis'] = {}
    for (const [papel, caixa] of Object.entries(caixasArq ?? {}) as Array<[PapelDeTexto, { largura: number; altura: number }]>) {
      const limite = limites[papel]
      papeis[papel] = { largura: caixa.largura, coluna: colunaDaCaixa(caixa.largura), capacidade: caixa.altura, linhasMax: limite?.linhasMax ?? 0, ...(limite?.caracteresPorLinha ? { caracteresPorLinha: limite.caracteresPorLinha } : {}) }
    }
    const problemas = 'problemas' in m ? m.problemas : []
    const excessos = excessosDeLinhas(arq.definicao, arq.formato, args.spec)
    for (const p of problemas) avisos.push(`arquétipo: ${p.papel} — ${p.motivo}`)
    // O bloco da unidade que a referência recusou NÃO cabe — os blocos não podem contradizer `cabeTudo`.
    for (const p of problemas) {
      const ids = new Set(unidades.find((u) => u.papel === p.papel)?.blocos.map((b) => b.layer.id) ?? [])
      for (const b of medidas) {
        if (!ids.has(b.id) || b.situacao === 'nao-cabe') continue
        b.situacao = 'nao-cabe'
        b.avisos.push(`a unidade "${p.papel}" do arquétipo não cabe na referência: ${p.motivo}`)
      }
    }
    for (const e of excessos) avisos.push(`arquétipo: ${e.papel} tem ${e.linhas} linhas e o máximo é ${e.linhasMax} (limite estrutural)`)
    // A geometria FINAL, como o compor a confere antes do autofix: as mesmas camadas, na mesma posição.
    const naReferencia = 'papeis' in m ? camadasNaReferencia(unidades, m.papeis, (p) => alinhaDoPapel(arq.definicao, p)).flatMap((x) => x.camadas) : []
    const ajustesFinais = naReferencia.length > 0 ? ajusteFinalNecessario(naReferencia, DIMENSOES[args.formato], args.medir) : []
    // A conferência nomeia as camadas pelo nome; o bloco medido, pelo id.
    const idDoNome = new Map(naReferencia.map((c) => [c.name ?? c.id, c.id]))
    for (const a of ajustesFinais) {
      avisos.push(`arquétipo: ${a.detalhe} — o ajuste final encolheria abaixo da escada (o compositor recusa)`)
      const ids = new Set(a.camadas.map((n) => idDoNome.get(n) ?? n))
      for (const b of medidas) {
        if (!ids.has(b.id) || b.situacao === 'nao-cabe') continue
        b.situacao = 'nao-cabe'
        b.avisos.push(`na referência do arquétipo: ${a.detalhe}`)
      }
    }
    // T1b: os acentos presos ao texto onde ele pousaria — a mesma conta e os mesmos obstáculos do compor.
    const acentos: MedicaoDoArquetipo['acentos'] = { previstos: [], omitidos: [], recusas: [] }
    if ('papeis' in m) {
      const pos = posicionarAcentos({
        arquetipo: arq.definicao,
        formato: arq.formato,
        canvas: DIMENSOES[args.formato],
        geometria: piso,
        receitas: receitasDoArquetipo(arq.definicao, { formato: arq.formato, canvas: DIMENSOES[args.formato], geometria: piso, margem: 'marca' }).receitas,
        papeis: m.papeis,
        obstaculos: obstaculosDosAcentos(unidades, m.papeis, m.papeis.logo?.posicao ?? null, caixasDosItens(arq.definicao, unidades, m.papeis)),
        itens: caixasDosItens(arq.definicao, unidades, m.papeis),
        margem: 'marca',
      })
      acentos.previstos = pos.acentos.map((a) => ({ elemento: a.receita.elemento, tipo: a.receita.tipo, rect: a.rect, ...(a.item ? { item: a.item } : {}) }))
      acentos.omitidos = pos.omitidos
      acentos.recusas = pos.recusas
      for (const o of pos.omitidos) avisos.push(`arquétipo: o acento ${o.elemento} (${o.tipo}, opcional) não seria desenhado: ${o.motivo}`)
      for (const r of pos.recusas) avisos.push(`arquétipo: o acento ${r.elemento} (${r.tipo}, obrigatório) não cabe: ${r.motivo} — o compositor recusa`)
    }
    medicaoDoArquetipo = {
      id: arq.resolvido.id,
      versao: arq.resolvido.versao,
      impressao: arq.resolvido.impressao,
      formato: args.formato,
      papeis,
      ...('papeis' in m ? { posicoes: m.papeis } : {}),
      problemas,
      excessosDeLinhas: excessos,
      ajustesFinais,
      acentos,
      avaliacaoEspacial: 'nao-executada',
    }
  }
  return {
    areaUtil: area,
    blocos: medidas,
    cabeTudo:
      papeisAusentes.length === 0 &&
      preparados.falhas.length === 0 &&
      medidas.every((m) => m.situacao === 'cabe' || m.situacao === 'cabe-reduzido') &&
      (!medicaoDoArquetipo || (medicaoDoArquetipo.problemas.length === 0 && medicaoDoArquetipo.excessosDeLinhas.length === 0 && medicaoDoArquetipo.ajustesFinais.length === 0 && medicaoDoArquetipo.acentos.recusas.length === 0)),
    papeisAusentes,
    naoMedido: medidas.some((m) => m.naoMedido),
    aproximado: medidas.some((m) => m.aproximado),
    fontesNaoCarregadas: [...fontesUsadasSemCarregar],
    alturaDosBlocos,
    segundaVoz: preparados.segundaVoz,
    arranjos: preparados.arranjos,
    ...(medicaoDoArquetipo ? { arquetipo: medicaoDoArquetipo } : {}),
    ...(fundo ? { fundo } : {}),
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
