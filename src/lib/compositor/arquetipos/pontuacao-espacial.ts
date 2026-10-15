/**
 * A AVALIAÇÃO PELA FOTO da busca espacial (CP2B, 14/10/2026): uma combinação já materializada, num corte. Primeiro os
 * HARD CONSTRAINTS (corte sem o assunto, região protegida, colisão, ordem de leitura, hierarquia, tratamento inviável)
 * — eliminam, nunca viram penalidade, e todos são juntados (o diagnóstico diz tudo o que a candidata violou). Depois
 * o tratamento ESTIMADO com a MESMA função do CP2A (`planejamento.planejar`) e, se a candidata sobreviveu, os
 * componentes da pontuação (ver `ComponentesDaPontuacao` no contrato).
 *
 * A ordenação é por FILTRO SEQUENCIAL, nunca por um sort com tolerância (que não é transitivo): o custo do tratamento
 * domina; entre custos empatados, a pontuação; entre pontuações empatadas, a mais perto da referência, o corte
 * central e a ordem fixa das combinações.
 *
 * Módulo PURO.
 */

import type { Rect } from '@/lib/creatives/halo/halo'
import { percentisNoRect } from '@/lib/creatives/halo/halo-medicao'
import { alcanceDoGrupo, type Borda } from '../gradiente-de-leitura'
import { coberturaDaRegiao, lerMapaSob, TETO_DE_COBERTURA_DO_ASSUNTO, TETO_DE_COBERTURA_DO_ASSUNTO_ESTIMADO } from '../mapa-de-calma'
import { MOTIVOS_DO_TRATAMENTO, type LeituraNaBorda, type MotivoDoTratamento, type TextoNaBorda } from '../tratamento-de-leitura'
import {
  MOTIVOS_DE_ELIMINACAO,
  PESOS_DA_PONTUACAO,
  TOLERANCIA_DA_COBERTURA,
  TOLERANCIA_DA_PONTUACAO,
  TOLERANCIA_DO_CUSTO,
  type AvaliacaoDaCombinacao,
  type CombinacaoMaterializada,
  type ComponentesDaPontuacao,
  type Eliminacao,
  type FaixaDeBusca,
  type LeituraDoCorte,
  type LeituraDoTexto,
  type MotivoDeEliminacao,
  type PlanejamentoDoTratamento,
  type RegiaoProtegida,
  type ResumoDaAvaliacao,
  type TratamentoEstimado,
} from './busca-espacial-tipos'

/** Abaixo desta fração visível da caixa do catálogo, o corte perdeu o assunto. */
const ASSUNTO_VISIVEL_MINIMO = 0.75
/** px de folga na ordem de leitura: a seguinte pode começar até aqui antes de a anterior terminar (antialias, arredondamento). */
const FOLGA_DA_ORDEM_PX = 2
/** Margem de leitura (níveis 0–255) que já vale contraste natural pleno. */
const MARGEM_PLENA = 64
/** O fundo de um texto que não deu para medir (fora do raster): a faixa inteira — ele fica fora do plano. */
const SEM_LEITURA = { p02: 0, p98: 255 }

const ELIMINACAO_DO_TRATAMENTO: Record<MotivoDoTratamento, MotivoDeEliminacao> = {
  [MOTIVOS_DO_TRATAMENTO.piorou]: MOTIVOS_DE_ELIMINACAO.tratamentoPiora,
  [MOTIVOS_DO_TRATAMENTO.semCor]: MOTIVOS_DE_ELIMINACAO.semCorAprovada,
  [MOTIVOS_DO_TRATAMENTO.sentidoErrado]: MOTIVOS_DE_ELIMINACAO.semCorAprovada,
  [MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel]: MOTIVOS_DE_ELIMINACAO.polaridadeIncompativel,
}

const CHAVES_DA_PONTUACAO = Object.keys(PESOS_DA_PONTUACAO) as Array<keyof typeof PESOS_DA_PONTUACAO>

const presa = (v: number) => Math.max(0, Math.min(1, v))
const arred = (v: number) => Number(v.toFixed(4))
const pct = (v: number) => Math.round(v * 100)
/** Número no diagnóstico: duas casas, vírgula decimal. */
const num = (v: number) => v.toFixed(2).replace('.', ',')
const nomeDaBorda = (b: Borda) => (b === 'topo' ? 'topo' : 'rodapé')

/** As regiões que o texto não cobre: com catálogo, só a caixa dele; sem, a estimada pela energia. */
export function regioesProtegidas(args: { catalogo: Rect | null; estimado: Rect | null }): RegiaoProtegida[] {
  if (args.catalogo) return [{ rect: args.catalogo, origem: 'catalogo', teto: TETO_DE_COBERTURA_DO_ASSUNTO }]
  if (args.estimado) return [{ rect: args.estimado, origem: 'estimado', teto: TETO_DE_COBERTURA_DO_ASSUNTO_ESTIMADO }]
  return []
}

/**
 * Avalia UMA combinação num corte: elimina (juntando todos os motivos), estima o tratamento por borda e, se
 * sobreviveu, pontua. O tratamento e as leituras dos textos saem sempre que houver o que medir — também na eliminada.
 */
export function avaliarCombinacao(args: {
  corte: LeituraDoCorte
  /** A energia que vale como "nada calmo" — a MESMA em todos os cortes, para a calma ser comparável entre eles. */
  energiaDeReferencia: number
  /** A materializada com unidades (a eliminada pela geometria volta como veio: sem `strictNullChecks` o tipo não estreita). */
  materializada: CombinacaoMaterializada
  faixas: FaixaDeBusca[]
  planejamento: PlanejamentoDoTratamento
  canvas: { width: number; height: number }
}): AvaliacaoDaCombinacao {
  const { corte, materializada, planejamento, canvas } = args
  const { combinacao, unidades } = materializada
  if (!unidades) return { crop: corte.crop, combinacao, eliminada: materializada.eliminada }
  const eliminada: Eliminacao[] = []

  // a. O corte que perde o assunto do catálogo.
  if (corte.assuntoVisivel !== null && corte.assuntoVisivel < ASSUNTO_VISIVEL_MINIMO) {
    eliminada.push({ motivo: MOTIVOS_DE_ELIMINACAO.corteSemOAssunto, detalhe: `o corte ${corte.crop} mostra ${pct(corte.assuntoVisivel)}% do assunto do catálogo (mínimo ${pct(ASSUNTO_VISIVEL_MINIMO)}%)` })
  }

  // b. A região protegida: a unidade inteira (com os ornamentos), cada texto dela e a logo de referência fixa (que anda
  // com a faixa do serviço). Só a ANOTADA (catálogo) elimina; a ESTIMADA pela energia é heurística (a borda de uma
  // faixa de luz vira "assunto") e, como recusa dura, zerava fotos inteiras — ela vira um PATAMAR da ordenação
  // (`regiaoEstimada`: quem não a cobre vence quem cobre, antes do custo do véu), nunca eliminação.
  const alvosDaRegiao = [
    ...unidades.flatMap((u) => [{ papel: u.papel, nome: `${u.papel} (com ornamentos)`, rect: u.rectComOrnamentos, texto: false }, ...u.textos.map((t) => ({ papel: u.papel, nome: t.camada, rect: t.rect, texto: true }))]),
    ...(materializada.logo ? [{ papel: 'logo' as const, nome: 'logo', rect: materializada.logo, texto: false }] : []),
  ]
  let regiaoEstimada: AvaliacaoDaCombinacao['regiaoEstimada']
  for (const regiao of corte.regioes) {
    if (regiao.origem === 'catalogo') {
      for (const alvo of alvosDaRegiao) {
        const cobertura = coberturaDaRegiao(alvo.rect, regiao.rect)
        if (cobertura <= regiao.teto) continue
        eliminada.push({ motivo: MOTIVOS_DE_ELIMINACAO.invadeRegiaoProtegida, papel: alvo.papel, detalhe: `${alvo.nome} cobre ${pct(cobertura)}% da região protegida do catálogo (teto ${pct(regiao.teto)}%)` })
      }
      continue
    }
    // A estimada: só os TEXTOS contam (o pedido do owner é que texto não cubra a região); a pior cobertura decide.
    const cobertura = Math.max(0, ...alvosDaRegiao.filter((a) => a.texto || a.nome.endsWith('(com ornamentos)')).map((a) => coberturaDaRegiao(a.rect, regiao.rect)))
    if (!regiaoEstimada || cobertura > regiaoEstimada.cobertura) regiaoEstimada = { cobertura: arred(cobertura), teto: regiao.teto, invade: cobertura > regiao.teto }
  }

  // c. A colisão entre unidades de faixas diferentes (encostar não conta).
  for (let i = 0; i < unidades.length; i++) {
    for (let j = i + 1; j < unidades.length; j++) {
      const a = unidades[i]
      const b = unidades[j]
      if (a.faixa !== b.faixa && coberturaDaRegiao(a.rectComOrnamentos, b.rectComOrnamentos) > 0) {
        eliminada.push({ motivo: MOTIVOS_DE_ELIMINACAO.colisao, papel: b.papel, detalhe: `${a.papel} e ${b.papel} se sobrepõem` })
      }
    }
  }

  // d. A ordem de leitura: a seguinte começa depois de a anterior terminar.
  const porLeitura = [...unidades].sort((a, b) => a.ordemDeLeitura - b.ordemDeLeitura)
  for (let i = 1; i < porLeitura.length; i++) {
    const anterior = porLeitura[i - 1]
    const seguinte = porLeitura[i]
    const fim = anterior.rect.y + anterior.rect.height
    if (seguinte.rect.y < fim - FOLGA_DA_ORDEM_PX) {
      eliminada.push({ motivo: MOTIVOS_DE_ELIMINACAO.ordemDeLeitura, papel: seguinte.papel, detalhe: `${seguinte.papel} começa em ${Math.round(seguinte.rect.y)} antes de ${anterior.papel} terminar (${Math.round(fim)})` })
    }
  }

  // e. A hierarquia estrutural: quem estava acima na referência continua acima.
  for (let i = 0; i < unidades.length; i++) {
    for (let j = i + 1; j < unidades.length; j++) {
      const a = unidades[i]
      const b = unidades[j]
      if ((a.rectNaReferencia.y - b.rectNaReferencia.y) * (a.rect.y - b.rect.y) < 0) {
        const [acima, abaixo] = a.rectNaReferencia.y < b.rectNaReferencia.y ? [a, b] : [b, a]
        eliminada.push({ motivo: MOTIVOS_DE_ELIMINACAO.hierarquia, papel: acima.papel, detalhe: `${acima.papel} ficava acima de ${abaixo.papel} na referência e passou para baixo` })
      }
    }
  }

  // f. O tratamento, pela função do CP2A, por borda (a GEOMÉTRICA da unidade na posição candidata, a mesma da régua).
  const textosNaBorda = new Map<Borda, TextoNaBorda[]>()
  for (const u of unidades) {
    for (const t of u.textos) {
      const percentis = percentisNoRect(corte.raster, t.rect)
      // Sem leitura possível o texto entra como caixa de fundo: o plano o lista em `foraDoPlano` e não o julga.
      const texto: TextoNaBorda = { camada: t.camada, grupo: t.grupo, cor: t.cor, rect: t.rect, percentis: percentis ?? SEM_LEITURA, caixaDeFundo: t.caixaDeFundo || !percentis }
      textosNaBorda.set(u.borda, [...(textosNaBorda.get(u.borda) ?? []), texto])
    }
  }
  const tratamento: TratamentoEstimado[] = []
  const textos: LeituraDoTexto[] = []
  const julgados: LeituraNaBorda[] = []
  for (const borda of ['topo', 'rodape'] as const) {
    const daBorda = textosNaBorda.get(borda)
    if (!daBorda) continue
    const vizinhos = [...textosNaBorda.entries()].filter(([b]) => b !== borda).flatMap(([, ts]) => ts)
    const alcance = Math.max(...unidades.filter((u) => u.borda === borda).map((u) => alcanceDoGrupo(u.rectComOrnamentos, borda, canvas.height)))
    const plano = planejamento.planejar({ borda, textos: daBorda, vizinhos, alcance })
    const explicita = planejamento.bordasExplicitas.includes(borda)
    julgados.push(...plano.textos)
    if (explicita) {
      // O véu é da página: existe sempre, o CP2A não o planeja; o plano serve só para as leituras.
      tratamento.push({ borda, estado: 'explicito' })
    } else {
      tratamento.push({
        borda,
        estado: plano.estado,
        ...(plano.forca !== undefined ? { forca: plano.forca } : {}),
        ...(plano.cor !== undefined ? { cor: plano.cor } : {}),
        ...(plano.alcancaAlvo !== undefined ? { alcancaAlvo: plano.alcancaAlvo } : {}),
        ...(plano.motivo !== undefined ? { motivo: plano.motivo } : {}),
      })
      if (plano.estado === 'inviavel') {
        eliminada.push({
          motivo: plano.motivo ? ELIMINACAO_DO_TRATAMENTO[plano.motivo] : MOTIVOS_DE_ELIMINACAO.semCorAprovada,
          detalhe: `${nomeDaBorda(borda)}: nenhum véu automático serve (${plano.motivo ?? 'sem motivo'})`,
          ...(plano.motivo ? { motivoDoTratamento: plano.motivo } : {}),
        })
      }
    }
    const veu = !explicita && plano.estado === 'tratado'
    for (const t of daBorda) {
      const l = plano.textos.find((x) => x.camada === t.camada)
      textos.push({
        camada: t.camada,
        borda,
        p02: t.percentis.p02,
        p98: t.percentis.p98,
        polaridade: l?.polaridade ?? null,
        alvo: l?.alvo ?? null,
        jaLe: l ? l.ok : !!t.caixaDeFundo && t.percentis !== SEM_LEITURA,
        precisaDeTratamento: l ? !l.ok : false,
        alcancaAlvo: veu ? (plano.alcancaAlvo ?? null) : null,
        forcaEstimada: veu ? (plano.forca ?? null) : null,
      })
    }
  }

  const base = { crop: corte.crop, combinacao, eliminada, tratamento, textos, ...(regiaoEstimada ? { regiaoEstimada } : {}) }
  if (eliminada.length > 0) return base

  // g. Os componentes (definições no contrato).
  const custoDoTratamento = tratamento.reduce((s, t) => s + (t.estado === 'tratado' ? (t.forca ?? 0) + (t.alcancaAlvo === false ? 0.5 : 0) : 0), 0)
  let energiaPonderada = 0
  let area = 0
  for (const u of unidades) {
    const a = u.rect.width * u.rect.height
    energiaPonderada += lerMapaSob(corte.mapa, u.rect).energia * a
    area += a
  }
  const energia = area > 0 ? energiaPonderada / area : 0
  const calma = presa(1 - (args.energiaDeReferencia > 0 ? energia / args.energiaDeReferencia : 0))
  const margens = julgados.map((l) => (l.polaridade === 'clara' ? l.alvo - l.antes : l.antes - l.alvo) / MARGEM_PLENA)
  const contrasteNatural = margens.length > 0 ? presa(Math.min(...margens)) : 1
  let piorCobertura = 0
  for (const regiao of corte.regioes) {
    for (const u of unidades) piorCobertura = Math.max(piorCobertura, coberturaDaRegiao(u.rectComOrnamentos, regiao.rect) / regiao.teto)
  }
  const assunto = corte.regioes.length > 0 ? presa(1 - piorCobertura) : 1
  const afastamentos = args.faixas.map((f) => {
    const dy = combinacao.escolhas.find((e) => e.faixa === f.indice)?.dy ?? 0
    const amplitude = Math.max(Math.abs(f.intervalo.min), Math.abs(f.intervalo.max))
    return amplitude > 0 ? Math.abs(dy) / amplitude : 0
  })
  const referencia = presa(1 - (afastamentos.length > 0 ? afastamentos.reduce((s, v) => s + v, 0) / afastamentos.length : 0))

  const componentes: ComponentesDaPontuacao = {
    custoDoTratamento: arred(custoDoTratamento),
    calma: arred(calma),
    contrasteNatural: arred(contrasteNatural),
    assunto: arred(assunto),
    referencia: arred(referencia),
    corte: corte.crop === 'center-middle' ? 1 : 0,
  }
  const pontuacao = arred(CHAVES_DA_PONTUACAO.reduce((s, k) => s + PESOS_DA_PONTUACAO[k] * componentes[k], 0))
  return { ...base, componentes, pontuacao }
}

const ehValida = (a: AvaliacaoDaCombinacao) => a.eliminada.length === 0 && !!a.componentes
const custoDe = (a: AvaliacaoDaCombinacao) => a.componentes!.custoDoTratamento
const pontuacaoDe = (a: AvaliacaoDaCombinacao) => a.pontuacao ?? 0

/** Ficam as que chegam a `folga` da melhor (maior) chave. */
function estreitar(lista: AvaliacaoDaCombinacao[], chave: (a: AvaliacaoDaCombinacao) => number, folga = 0): AvaliacaoDaCombinacao[] {
  const melhor = Math.max(...lista.map(chave))
  return lista.filter((a) => chave(a) >= melhor - folga)
}

/** Cobrir a região ESTIMADA além do teto. */
export const invadeAEstimada = (a: AvaliacaoDaCombinacao) => a.regiaoEstimada?.invade === true

/**
 * O FILTRO SEQUENCIAL que escolhe a melhor de uma lista de válidas:
 * 0. a região estimada como assunto: quem não a cobre (além do teto) vence quem cobre; se todas cobrem, a de menor
 *    cobertura (tolerância `TOLERANCIA_DA_COBERTURA`; é heurística — nunca elimina, mas também nunca fica atrás do véu);
 * 1. o menor custo de tratamento (tolerância `TOLERANCIA_DO_CUSTO`);
 * 2. a maior pontuação (tolerância `TOLERANCIA_DA_PONTUACAO`);
 * 3. a mais perto da referência; 4. o corte central; 5. o menor índice; 6. a primeira na entrada.
 */
export function melhorEntre(validas: AvaliacaoDaCombinacao[]): AvaliacaoDaCombinacao {
  let restam = validas.some((a) => !invadeAEstimada(a)) ? validas.filter((a) => !invadeAEstimada(a)) : estreitar(validas, (a) => -(a.regiaoEstimada?.cobertura ?? 0), TOLERANCIA_DA_COBERTURA)
  restam = estreitar(restam, (a) => -custoDe(a), TOLERANCIA_DO_CUSTO)
  restam = estreitar(restam, pontuacaoDe, TOLERANCIA_DA_PONTUACAO)
  restam = estreitar(restam, (a) => a.componentes!.referencia)
  restam = estreitar(restam, (a) => a.componentes!.corte)
  restam = estreitar(restam, (a) => -a.combinacao.indice)
  return restam[0]
}

/**
 * TODAS as avaliações: as válidas na ordem do MESMO filtro sequencial (a vencedora, depois a melhor do que sobra, e
 * assim por diante — no máximo 75), e por último as eliminadas, na ordem de entrada.
 */
export function ordenarAvaliacoes(avaliacoes: AvaliacaoDaCombinacao[]): AvaliacaoDaCombinacao[] {
  const eliminadas = avaliacoes.filter((a) => !ehValida(a))
  const restam = avaliacoes.filter(ehValida)
  const ordenadas: AvaliacaoDaCombinacao[] = []
  while (restam.length > 0) {
    const melhor = melhorEntre(restam)
    ordenadas.push(melhor)
    restam.splice(restam.indexOf(melhor), 1)
  }
  return [...ordenadas, ...eliminadas]
}

/** A avaliação compacta do diagnóstico (sem as camadas). */
export function resumirAvaliacao(a: AvaliacaoDaCombinacao): ResumoDaAvaliacao {
  return {
    crop: a.crop,
    escolhas: a.combinacao.escolhas,
    pontuacao: a.pontuacao ?? null,
    componentes: a.componentes ?? null,
    tratamento: a.tratamento ?? [],
    textos: a.textos ?? [],
    eliminada: a.eliminada,
    ...(a.regiaoEstimada ? { regiaoEstimada: a.regiaoEstimada } : {}),
  }
}

/** O tratamento de uma avaliação em palavras: "lê sem véu", "véu no rodapé 0,76", "véu no topo 0,90 e nem assim lê". */
export function descreverTratamento(a: AvaliacaoDaCombinacao): string {
  const tratadas = (a.tratamento ?? []).filter((t) => t.estado === 'tratado')
  const explicitas = (a.tratamento ?? []).filter((t) => t.estado === 'explicito')
  if (tratadas.length === 0) {
    const custo = a.componentes?.custoDoTratamento ?? 0
    if (custo > 0) return `véu (custo ${num(custo)})`
    return explicitas.length > 0 ? `sem véu automático (o véu da página no ${explicitas.map((t) => nomeDaBorda(t.borda)).join(' e ')} fica)` : 'lê sem véu'
  }
  return tratadas.map((t) => `véu no ${nomeDaBorda(t.borda)} ${num(t.forca ?? 0)}${t.alcancaAlvo === false ? ' e nem assim lê' : ''}`).join(', ')
}

const COMPONENTE_QUE_DECIDIU: Record<keyof typeof PESOS_DA_PONTUACAO, string> = {
  calma: 'mais calma',
  contrasteNatural: 'mais contraste natural',
  assunto: 'mais longe do assunto',
  referencia: 'mais perto da referência',
  corte: 'no corte central',
}

/**
 * Por que a vencedora venceu, em UMA frase com números: o critério do filtro que a separou da segunda (a conta é a
 * do par, como se só as duas existissem — exceto o patamar da cobertura quando TODAS as válidas cobrem a região
 * estimada: aí ele se mede, como em `melhorEntre`, contra a `menorCobertura` entre as válidas).
 */
export function motivoDaVitoria(vencedora: AvaliacaoDaCombinacao, segunda?: AvaliacaoDaCombinacao, menorCobertura = vencedora.regiaoEstimada?.cobertura ?? 0): string {
  if (!segunda || !ehValida(segunda) || !ehValida(vencedora)) return 'única combinação válida'
  const a = vencedora.componentes!
  const b = segunda.componentes!
  if (invadeAEstimada(segunda) && !invadeAEstimada(vencedora)) {
    return `não cobre a região estimada como assunto; a segunda cobria ${pct(segunda.regiaoEstimada!.cobertura)}% dela`
  }
  // A vencedora cobre ⇒ TODAS as válidas cobrem: o patamar da menor cobertura (com tolerância) decide antes do véu.
  if (invadeAEstimada(vencedora) && (segunda.regiaoEstimada?.cobertura ?? 0) > menorCobertura + TOLERANCIA_DA_COBERTURA) {
    return `toda posição válida cobre a região estimada como assunto, e esta cobre menos (${pct(vencedora.regiaoEstimada!.cobertura)}% contra ${pct(segunda.regiaoEstimada!.cobertura)}% da segunda)`
  }
  if (b.custoDoTratamento > a.custoDoTratamento + TOLERANCIA_DO_CUSTO) {
    return a.custoDoTratamento === 0
      ? `${descreverTratamento(vencedora)}; a segunda pedia ${descreverTratamento(segunda)}`
      : `tratamento mais leve (${descreverTratamento(vencedora)}, contra ${descreverTratamento(segunda)})`
  }
  if (pontuacaoDe(segunda) < pontuacaoDe(vencedora) - TOLERANCIA_DA_PONTUACAO) {
    const ganho = (k: keyof typeof PESOS_DA_PONTUACAO) => PESOS_DA_PONTUACAO[k] * (a[k] - b[k])
    const decisivo = CHAVES_DA_PONTUACAO.reduce((m, k) => (ganho(k) > ganho(m) ? k : m))
    return `mesmo custo de tratamento e ${COMPONENTE_QUE_DECIDIU[decisivo]} (${num(a[decisivo])} contra ${num(b[decisivo])})`
  }
  if (a.referencia > b.referencia) return `a foto não distingue: ficou a mais perto da referência (${num(a.referencia)} contra ${num(b.referencia)})`
  if (a.corte > b.corte) return `a foto não distingue: ficou ${a.referencia === 1 ? 'a referência' : 'a posição'} no corte central`
  return `a foto não distingue: ficou a primeira na ordem fixa (combinação ${vencedora.combinacao.indice} contra ${segunda.combinacao.indice})`
}
