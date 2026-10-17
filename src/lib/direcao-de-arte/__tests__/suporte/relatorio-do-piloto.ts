/**
 * Piloto sintético (§ 3 do contrato) — o REGISTRO por peça e o RESUMO (puro: agrega e escreve markdown). O piloto MEDE; os
 * limiares são do owner (5.3). "Falso APTO" só nas regras cobertas da matriz; o que não é coberto sai dito ao lado do veredito.
 */
import { createHash } from 'node:crypto'
import type { Rect } from '@/lib/creatives/halo/halo'
import type { SpecDoLote } from './lote-do-piloto'
import { MATRIZ, REGRAS_JULGADAS, regrasCobertas, type VereditoDoJuiz } from './oraculos-do-piloto'

export type Etapa = 'compor' | 'revisar' | 'ajustar' | 'agendar' | 'juizes' | 'png' | 'pareada' | 'repeticao' | 'injecao' | 'modoG'
export const ETAPAS: readonly Etapa[] = ['compor', 'revisar', 'ajustar', 'agendar', 'juizes', 'png', 'pareada', 'repeticao', 'injecao', 'modoG']
export interface GateRegistrado {
  tipo: 'medida' | 'sem-vinculo' | 'nao-medida'
  resultado?: 'APTO' | 'REVISAO_HUMANA_NECESSARIA'
  motivos: Array<{ regra: string; codigo: string; camadas: string[] }>
  naoMedidos: string[]
}
export interface RegistroDaPeca {
  spec: SpecDoLote
  compor: { desfecho: 'composta' | 'recusa-estrutural' | 'erro'; codigo?: string; ms: number }
  /** O gate informativo da v1 composta (`revisar-arte`). */
  gateV1?: GateRegistrado
  /** Ciclos revisar → ajustar executados (0–2) e o gate da versão final. */
  ciclos: number
  gateFinal?: GateRegistrado
  draft: 'criado' | 'recusado' | 'nao-tentado'
  draftCodigo?: string
  juizes: VereditoDoJuiz[]
  /** Camadas não-texto acima de texto na peça final (decisão 2). */
  oclusaoProduzida: string[]
  renders: Partial<Record<Etapa, number>>
  ms: Partial<Record<Etapa, number>>
  estabilidade: { excecoes: string[]; naoMedida: boolean; semVinculo: boolean; timeout: boolean }
  repeticao?: { igual: boolean; diferencas: string[] }
  png?: { caminho: string; sha256: string }
  /** Decisão 1: a leitura pareada (fotos A1/A2). */
  assunto?: { estimado: Rect | null; catalogo: Rect | null; verdade: Rect | null; origemNaPeca: 'estimado' | 'catalogo' | 'nenhum' | null }
  /** Modo G: a falha injetada depois da composição. */
  modoG?: { fetchFalhou: boolean; motivoSemAssunto: boolean; gateRecusou: boolean; valido: boolean; /** O que o PRODUTOR (`agendar-leva`) respondeu com o item desligado e sem DRAFT na página. */ produtor?: { codigo: string; postsDaPagina: number; motivos: string[] } }
  /** Foto REAL da fixture: caixas de texto/logo da peça final FORA das janelas fiéis (contrato § 1.2: medida fora delas é "não medida", nunca contada). */
  fidelidade?: { fora: string[] }
  /** Decisão 2, cenário INJETADO: uma shape acima da headline — o gate tem de não dar APTO. */
  oclusaoInjetada?: { gateRecusou: boolean; motivos: string[] }
}

export const iou = (a: Rect | null, b: Rect | null): number | null => {
  if (!a || !b) return null
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const inter = w * h
  const uniao = a.width * a.height + b.width * b.height - inter
  return uniao > 0 ? inter / uniao : null
}
const mediana = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : 0)
const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(0.95 * xs.length) - 1)] : 0)
const contar = (xs: string[]) => xs.reduce<Record<string, number>>((r, x) => ((r[x] = (r[x] ?? 0) + 1), r), {})
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)} % (${n}/${d})` : '— (0)')

export interface Resumo {
  pecas: number
  /** Denominadores VALIDADOS: só peças medidas (caixas dentro das janelas fiéis) contam de `chegaramAoGate` em diante. */
  denominadores: { elegiveis: number; compostas: number; recusasEstruturais: number; erros: number; chegaramAoGate: number; aptasV1: number; aptasFinal: number; drafts: number }
  /** Desfechos operacionais BRUTOS (incluem as peças não medidas): o que o fluxo fez, não o que o piloto valida. */
  brutos: { chegaramAoGate: number; aptasFinal: number; drafts: number; naoMedidas: number }
  taxaApto: Record<'cliente' | 'formato' | 'foto' | 'copy' | 'arquetipo', Record<string, { pecas: number; aptasV1: number; aptasFinal: number; drafts: number }>>
  motivos: Record<string, Record<string, number>>
  motivosPorCliente: Record<string, Record<string, number>>
  falsoApto: Array<{ chave: string; regra: string; camadas: string[]; png?: string; sha256?: string }>
  candidatosFalsoBloqueio: Array<{ chave: string; motivos: string[]; naoComprovadas: number; criticos: number; png?: string; sha256?: string }>
  /** Peças que chegaram ao gate mas NÃO contam (caixas fora das janelas fiéis da fixture): o que o gate disse e o que o juiz acusaria — indício, não veredito. */
  naoMedidas: Array<{ chave: string; fora: string[]; gate: string; juizAcusa: string[]; png?: string; sha256?: string }>
  custo: Record<Etapa, { rendersMediana: number; rendersP95: number; msMediana: number; msP95: number }>
  estabilidade: { excecoes: number; naoMedida: number; semVinculo: number; timeouts: number; excecoesPorMensagem: Record<string, number> }
  repetibilidade: { comparadas: number; iguais: number; divergencias: Array<{ chave: string; diferencas: string[] }> }
  decisao1: { fotos: number; iouEstimadoCatalogo: number | null; iouEstimadoVerdade: number | null; iouCatalogoVerdade: number | null; estimadoAcertouInvasao: number; estimadoErrouInvasao: number; bloqueiosPorCaso: Record<string, { pecas: number; bloqueadas: number; bloqueadasQueAVerdadeAprovaria: number; aptasQueAVerdadeReprovaria: number }> }
  decisao2: { pecasComCamadaAcimaDeTexto: number; oclusaoNaoComprovada: number; injecoes: number; injecoesRecusadas: number; motivosDasInjecoes: Record<string, number> }
  rendersSomados: number
  modoG: { leituras: number; validas: number; invalidas: number; recusadas: number }
  naoCoberto: Array<{ regra: string; estado: string; limite: string }>
}

export function agregar(registros: RegistroDaPeca[], elegiveis: number): Resumo {
  const compostas = registros.filter((r) => r.compor.desfecho === 'composta')
  const chegaram = compostas.filter((r) => r.gateV1)
  const aptoV1 = (r: RegistroDaPeca) => r.gateV1?.tipo === 'medida' && r.gateV1.resultado === 'APTO'
  const aptoFinal = (r: RegistroDaPeca) => r.gateFinal?.tipo === 'medida' && r.gateFinal.resultado === 'APTO'
  const cobertas = new Set<string>(regrasCobertas())
  // Só a peça MEDIDA conta (contrato § 1.2): com caixa fora das janelas fiéis da fixture, o gate leu pixels que não são os da foto.
  const naoMedida = (r: RegistroDaPeca) => (r.fidelidade?.fora.length ?? 0) > 0
  const medidas = chegaram.filter((r) => !naoMedida(r))
  const taxaApto = {} as Resumo['taxaApto']
  for (const eixo of ['cliente', 'formato', 'foto', 'copy', 'arquetipo'] as const) {
    taxaApto[eixo] = {}
    for (const r of medidas) {
      const v = r.spec[eixo]
      const t = (taxaApto[eixo][v] ??= { pecas: 0, aptasV1: 0, aptasFinal: 0, drafts: 0 })
      t.pecas++
      if (aptoV1(r)) t.aptasV1++
      if (aptoFinal(r)) t.aptasFinal++
      if (r.draft === 'criado') t.drafts++
    }
  }
  const motivos: Resumo['motivos'] = {}
  const motivosPorCliente: Resumo['motivosPorCliente'] = {}
  for (const r of medidas) {
    for (const m of r.gateFinal?.motivos ?? []) {
      ;(motivos[m.regra] ??= {})[m.codigo] = (motivos[m.regra][m.codigo] ?? 0) + 1
      ;(motivosPorCliente[r.spec.cliente] ??= {})[m.regra] = (motivosPorCliente[r.spec.cliente][m.regra] ?? 0) + 1
    }
  }
  const falsoApto: Resumo['falsoApto'] = []
  const candidatosFalsoBloqueio: Resumo['candidatosFalsoBloqueio'] = []
  for (const r of medidas) {
    const violacoesCobertas = r.juizes.filter((j) => j.viola === true && cobertas.has(j.regra))
    if (aptoFinal(r)) for (const j of violacoesCobertas) falsoApto.push({ chave: r.spec.chave, regra: j.regra, camadas: j.camadas, png: r.png?.caminho, sha256: r.png?.sha256 })
    else if (r.gateFinal?.tipo === 'medida' && violacoesCobertas.length === 0) {
      const ms = r.gateFinal.motivos
      candidatosFalsoBloqueio.push({ chave: r.spec.chave, motivos: ms.map((m) => `${m.regra}:${m.codigo}`), naoComprovadas: ms.filter((m) => m.codigo !== 'ACHADO_CRITICO').length, criticos: ms.filter((m) => m.codigo === 'ACHADO_CRITICO').length, png: r.png?.caminho, sha256: r.png?.sha256 })
    }
  }
  const naoMedidas: Resumo['naoMedidas'] = chegaram.filter(naoMedida).map((r) => ({
    chave: r.spec.chave,
    fora: r.fidelidade!.fora,
    gate: r.gateFinal?.tipo === 'medida' ? `${r.gateFinal.resultado}${r.gateFinal.motivos.length ? ` (${r.gateFinal.motivos.map((m) => `${m.regra}:${m.codigo}`).join(', ')})` : ''}` : (r.gateFinal?.tipo ?? '—'),
    juizAcusa: r.juizes.filter((j) => j.viola === true && cobertas.has(j.regra)).map((j) => `${j.regra} (${j.camadas.join(', ')})`),
    png: r.png?.caminho,
    sha256: r.png?.sha256,
  }))
  const custo = {} as Resumo['custo']
  for (const etapa of ETAPAS) {
    const renders = registros.map((r) => r.renders[etapa]).filter((x): x is number => typeof x === 'number')
    const ms = registros.map((r) => r.ms[etapa]).filter((x): x is number => typeof x === 'number')
    custo[etapa] = { rendersMediana: mediana(renders), rendersP95: p95(renders), msMediana: Math.round(mediana(ms)), msP95: Math.round(p95(ms)) }
  }
  const excecoes = registros.flatMap((r) => r.estabilidade.excecoes)
  const comparadas = registros.filter((r) => r.repeticao)
  const divergencias = comparadas.filter((r) => !r.repeticao!.igual).map((r) => ({ chave: r.spec.chave, diferencas: r.repeticao!.diferencas }))
  const comAssunto = registros.filter((r) => r.assunto && r.assunto.verdade)
  const media = (xs: Array<number | null>) => {
    const v = xs.filter((x): x is number => x !== null)
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  }
  const invasaoPelaVerdade = (r: RegistroDaPeca) => r.juizes.find((j) => j.regra === 'texto-sobre-assunto')?.viola
  const invasaoPeloGate = (r: RegistroDaPeca) => (r.gateFinal?.motivos ?? []).some((m) => m.regra === 'texto-sobre-assunto')
  let acertou = 0
  let errou = 0
  for (const r of comAssunto.filter((r) => !naoMedida(r))) {
    if (r.assunto?.origemNaPeca !== 'estimado') continue
    const verdade = invasaoPelaVerdade(r)
    if (verdade === null || verdade === undefined) continue
    if (invasaoPeloGate(r) === verdade) acertou++
    else errou++
  }
  const bloqueiosPorCaso: Resumo['decisao1']['bloqueiosPorCaso'] = {}
  for (const r of medidas) {
    // A peça principal fica no SEU caso (A/B/C/E); o modo G é um cenário à parte, agregado abaixo pelo gate PÓS-falha.
    const caso = r.spec.foto === 'sem-foto' ? 'E-sem-foto' : r.assunto?.origemNaPeca === 'catalogo' ? 'A-catalogo' : r.assunto?.origemNaPeca === 'estimado' ? 'B-estimado' : 'C-nao-se-aplica'
    const b = (bloqueiosPorCaso[caso] ??= { pecas: 0, bloqueadas: 0, bloqueadasQueAVerdadeAprovaria: 0, aptasQueAVerdadeReprovaria: 0 })
    b.pecas++
    const bloqueada = (r.gateFinal?.motivos ?? []).some((m) => m.regra === 'texto-sobre-assunto')
    if (bloqueada) {
      b.bloqueadas++
      if (invasaoPelaVerdade(r) === false) b.bloqueadasQueAVerdadeAprovaria++
    } else if (aptoFinal(r) && invasaoPelaVerdade(r) === true) b.aptasQueAVerdadeReprovaria++ // o falso APTO da decisão 1, por caso
  }
  // Caso D (falha de leitura depois da composição): o que o gate disse DEPOIS da falha — `gateRecusou` por texto-sobre-assunto não comprovada.
  for (const r of medidas.filter((r) => r.modoG)) {
    const d = (bloqueiosPorCaso['D-falha-de-leitura'] ??= { pecas: 0, bloqueadas: 0, bloqueadasQueAVerdadeAprovaria: 0, aptasQueAVerdadeReprovaria: 0 })
    d.pecas++
    if (r.modoG!.gateRecusou) {
      d.bloqueadas++
      if (invasaoPelaVerdade(r) === false) d.bloqueadasQueAVerdadeAprovaria++
    } else if (invasaoPelaVerdade(r) === true) d.aptasQueAVerdadeReprovaria++
  }
  const modoG = registros.filter((r) => r.modoG)
  return {
    pecas: registros.length,
    denominadores: {
      elegiveis,
      compostas: compostas.length,
      recusasEstruturais: registros.filter((r) => r.compor.desfecho === 'recusa-estrutural').length,
      erros: registros.filter((r) => r.compor.desfecho === 'erro').length,
      chegaramAoGate: medidas.length,
      aptasV1: medidas.filter(aptoV1).length,
      aptasFinal: medidas.filter(aptoFinal).length,
      drafts: medidas.filter((r) => r.draft === 'criado').length,
    },
    brutos: { chegaramAoGate: chegaram.length, aptasFinal: chegaram.filter(aptoFinal).length, drafts: chegaram.filter((r) => r.draft === 'criado').length, naoMedidas: chegaram.length - medidas.length },
    taxaApto,
    motivos,
    motivosPorCliente,
    falsoApto,
    candidatosFalsoBloqueio,
    naoMedidas,
    rendersSomados: registros.reduce((t, r) => t + Object.values(r.renders).reduce((a, b) => a + (b ?? 0), 0), 0),
    custo,
    estabilidade: {
      excecoes: excecoes.length,
      naoMedida: registros.filter((r) => r.estabilidade.naoMedida).length,
      semVinculo: registros.filter((r) => r.estabilidade.semVinculo).length,
      timeouts: registros.filter((r) => r.estabilidade.timeout).length,
      excecoesPorMensagem: contar(excecoes.map((e) => e.slice(0, 80))),
    },
    repetibilidade: { comparadas: comparadas.length, iguais: comparadas.length - divergencias.length, divergencias },
    decisao1: {
      fotos: comAssunto.length,
      iouEstimadoCatalogo: media(comAssunto.map((r) => iou(r.assunto!.estimado, r.assunto!.catalogo))),
      iouEstimadoVerdade: media(comAssunto.map((r) => iou(r.assunto!.estimado, r.assunto!.verdade))),
      iouCatalogoVerdade: media(comAssunto.map((r) => iou(r.assunto!.catalogo, r.assunto!.verdade))),
      estimadoAcertouInvasao: acertou,
      estimadoErrouInvasao: errou,
      bloqueiosPorCaso,
    },
    decisao2: {
      pecasComCamadaAcimaDeTexto: compostas.filter((r) => r.oclusaoProduzida.length > 0).length,
      oclusaoNaoComprovada: chegaram.filter((r) => (r.gateFinal?.motivos ?? []).some((m) => m.regra === 'oclusao')).length,
      injecoes: registros.filter((r) => r.oclusaoInjetada).length,
      injecoesRecusadas: registros.filter((r) => r.oclusaoInjetada?.gateRecusou).length,
      motivosDasInjecoes: contar(registros.flatMap((r) => r.oclusaoInjetada?.motivos ?? [])),
    },
    modoG: { leituras: modoG.length, validas: modoG.filter((r) => r.modoG!.valido).length, invalidas: modoG.filter((r) => !r.modoG!.valido).length, recusadas: modoG.filter((r) => r.modoG!.valido && r.modoG!.gateRecusou).length },
    naoCoberto: REGRAS_JULGADAS.filter((r) => MATRIZ[r].estado === 'nao-coberta' || MATRIZ[r].estado === 'mesma-medida').map((r) => ({ regra: r, estado: MATRIZ[r].estado, limite: MATRIZ[r].limite })),
  }
}

export const sha256 = (texto: string | Buffer) => createHash('sha256').update(texto).digest('hex')

/**
 * O que o PILOTO exige de si (contrato § 5.3 e § 4): a rodada que viola um destes NÃO passa — o teste cai, em vez de o número
 * ir quieto para o resumo. Recusa estrutural é desfecho registrado, não violação; o resto do veredito (taxas, caso C, piso) é
 * do owner, lendo o resumo.
 */
/**
 * @param oficial rodada padrão ou `--completo` sem filtros (`PILOTO_CALIBRACAO`, `PILOTO_CLIENTE`, `PILOTO_SEM_REPETICAO` a
 * tornam EXPLORATÓRIA): na oficial a cobertura dos cenários é obrigatória — toda spec repetida, modo G e oclusão injetada com
 * contagem > 0 — porque 0/0 passaria pelas comparações abaixo sem medir nada.
 */
export function violacoesDoPiloto(resumo: Resumo, registros: RegistroDaPeca[], opcoes: { oficial: boolean } = { oficial: true }): string[] {
  const v: string[] = []
  if (opcoes.oficial) {
    if (resumo.repetibilidade.comparadas !== registros.length) v.push(`rodada oficial sem repetir todas as specs (${resumo.repetibilidade.comparadas}/${registros.length})`)
    if (resumo.modoG.leituras === 0) v.push('rodada oficial sem nenhuma leitura em modo G')
    if (resumo.decisao2.injecoes === 0) v.push('rodada oficial sem nenhuma oclusão injetada')
  }
  const erros = registros.filter((r) => r.compor.desfecho === 'erro')
  if (erros.length) v.push(`erro de execução em ${erros.length} peça(s): ${erros.map((r) => `${r.spec.chave}: ${r.compor.codigo}`).join('; ')}`)
  if (resumo.estabilidade.excecoes) v.push(`${resumo.estabilidade.excecoes} exceção(ões) durante a rodada`)
  if (resumo.estabilidade.timeouts) v.push(`${resumo.estabilidade.timeouts} timeout(s)`)
  if (resumo.denominadores.chegaramAoGate === 0) v.push('nenhuma peça MEDIDA chegou ao gate (cobertura vazia)')
  if (resumo.falsoApto.length) v.push(`falso APTO em ${resumo.falsoApto.length} peça(s) MEDIDA(S): ${resumo.falsoApto.map((f) => `${f.chave} (${f.regra})`).join('; ')}`)
  if (resumo.repetibilidade.iguais !== resumo.repetibilidade.comparadas) v.push(`repetibilidade ${resumo.repetibilidade.iguais}/${resumo.repetibilidade.comparadas}: ${resumo.repetibilidade.divergencias.map((d) => d.chave).join(', ')}`)
  if (resumo.modoG.invalidas) v.push(`modo G: ${resumo.modoG.invalidas} leitura(s) inválida(s) (a falha não foi injetada ou o cache serviu)`)
  if (resumo.modoG.recusadas !== resumo.modoG.validas) v.push(`modo G: ${resumo.modoG.validas - resumo.modoG.recusadas} leitura(s) válida(s) que o gate NÃO recusou`)
  if (resumo.decisao2.injecoes !== resumo.decisao2.injecoesRecusadas) v.push(`oclusão injetada: ${resumo.decisao2.injecoes - resumo.decisao2.injecoesRecusadas} injeção(ões) que o gate NÃO recusou`)
  return v
}

/** O RESUMO versionado (`docs/piloto-sintetico/<data>-resumo.md`): HEAD, lote, ambiente, denominadores, tabelas e hashes. */
export function paraMarkdown(resumo: Resumo, meta: { data: string; head: string; loteId: string; ambiente: string; rodada: string; hashRelatorio: string; limites: string[]; excluidosPorMotivo?: Record<string, number>; rendersObservados?: number }): string {
  const L: string[] = []
  L.push(`# Piloto sintético de autonomia — resumo da rodada ${meta.rodada} (${meta.data})`)
  L.push('')
  L.push(`HEAD \`${meta.head}\` · lote \`${meta.loteId}\` · ambiente ${meta.ambiente} · relatório integral: \`human-output/relatorios/piloto-sintetico/${meta.data}-${meta.rodada}/relatorio.json\` (SHA-256 \`${meta.hashRelatorio}\`).`)
  L.push('')
  L.push('**O que este piloto NÃO mede** (ao lado do veredito, sempre): ' + meta.limites.join('; ') + '.')
  L.push('')
  const d = resumo.denominadores
  L.push('## Denominadores')
  L.push(`elegíveis ${d.elegiveis} → peças da rodada ${resumo.pecas} → compostas ${d.compostas} (recusas estruturais ${d.recusasEstruturais}, erros ${d.erros}) → chegaram ao gate e foram MEDIDAS ${d.chegaramAoGate} → APTAS na v1 ${d.aptasV1} → APTAS ao fim ${d.aptasFinal} → DRAFTs ${d.drafts}.`)
  L.push(`Desfechos BRUTOS do fluxo (incluem as ${resumo.brutos.naoMedidas} peças NÃO MEDIDAS, fora das janelas fiéis — § 3b): chegaram ao gate ${resumo.brutos.chegaramAoGate} · APTAS ao fim ${resumo.brutos.aptasFinal} · DRAFTs ${resumo.brutos.drafts}. As seções 1–4 e 8 são sobre as peças MEDIDAS; custo (5), estabilidade (6) e repetibilidade (7) cobrem todas as peças da rodada.`)
  if (meta.excluidosPorMotivo) L.push(`Exclusões do lote por motivo (não são peças): ${Object.entries(meta.excluidosPorMotivo).map(([m, n]) => `${m} ${n}`).join(' · ') || 'nenhuma'}.`)
  L.push('')
  L.push('## 1. Taxa APTO por eixo, peças MEDIDAS (v1 composta · ao fim dos ciclos · DRAFT)')
  for (const eixo of ['cliente', 'formato', 'foto', 'copy', 'arquetipo'] as const) {
    L.push(`### ${eixo}`)
    L.push('| valor | peças | APTO v1 | APTO final | DRAFT |')
    L.push('|---|---|---|---|---|')
    for (const [v, t] of Object.entries(resumo.taxaApto[eixo]).sort()) L.push(`| ${v} | ${t.pecas} | ${pct(t.aptasV1, t.pecas)} | ${pct(t.aptasFinal, t.pecas)} | ${pct(t.drafts, t.pecas)} |`)
  }
  L.push('')
  L.push('## 2. Motivos de revisão humana (gate final) por regra × código')
  L.push('| regra | ACHADO_CRITICO | NAO_COMPROVADA | NAO_MEDIDO | IDENTIDADE_ILEGIVEL |')
  L.push('|---|---|---|---|---|')
  for (const [regra, c] of Object.entries(resumo.motivos).sort()) L.push(`| ${regra} | ${c.ACHADO_CRITICO ?? 0} | ${c.NAO_COMPROVADA ?? 0} | ${c.NAO_MEDIDO ?? 0} | ${c.IDENTIDADE_ILEGIVEL ?? 0} |`)
  L.push('')
  L.push('### 2b. Motivos de revisão humana por cliente (gate final)')
  const regrasPorCliente = [...new Set(Object.values(resumo.motivosPorCliente).flatMap((m) => Object.keys(m)))].sort()
  L.push(`| cliente | ${regrasPorCliente.join(' | ')} |`)
  L.push(`|---|${regrasPorCliente.map(() => '---').join('|')}|`)
  for (const [cliente, m] of Object.entries(resumo.motivosPorCliente).sort()) L.push(`| ${cliente} | ${regrasPorCliente.map((r) => m[r] ?? 0).join(' | ')} |`)
  L.push('')
  const indicios = resumo.naoMedidas.filter((n) => n.juizAcusa.length > 0 && /^APTO/.test(n.gate))
  const veredito3 = resumo.falsoApto.length > 0 ? `**${resumo.falsoApto.length}** — o piloto é INSATISFATÓRIO por definição` : indicios.length > 0 ? `NENHUM nas peças MEDIDAS — mas ${indicios.length} peça(s) NÃO MEDIDA(S) APTA(S) com o juiz acusando (§ 3b): INCONCLUSIVO sobre essa regra até as janelas da fixture cobrirem as caixas` : 'NENHUM nas regras cobertas'
  L.push(`## 3. Falso APTO (gate APTO ∧ juiz coberto acusa, só peças MEDIDAS) — ${veredito3}`)
  for (const f of resumo.falsoApto) L.push(`- ${f.chave}: ${f.regra} (${f.camadas.join(', ')})${f.png ? ` — ${f.png}` : ''}${f.sha256 ? ` (SHA-256 \`${f.sha256}\`)` : ''}`)
  L.push('')
  L.push(`### 3b. Peças NÃO MEDIDAS (caixas fora das janelas fiéis da foto da fixture) — ${resumo.naoMedidas.length}; indício, nunca contado`)
  for (const n of resumo.naoMedidas) L.push(`- ${n.chave}: fora das janelas: ${n.fora.join(', ')} · gate: ${n.gate} · juiz acusaria: ${n.juizAcusa.join('; ') || 'nada'}${n.png ? ` — ${n.png}` : ''}${n.sha256 ? ` (SHA-256 \`${n.sha256}\`)` : ''}`)
  L.push('')
  L.push(`## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — ${resumo.candidatosFalsoBloqueio.length} para inspeção humana`)
  L.push(`(${resumo.candidatosFalsoBloqueio.filter((c) => c.criticos === 0).length} só com motivos NÃO COMPROVADOS — o gate não mediu; ${resumo.candidatosFalsoBloqueio.filter((c) => c.criticos > 0).length} com ACHADO_CRITICO — o gate mediu e o juiz discorda)`)
  for (const c of resumo.candidatosFalsoBloqueio.slice(0, 50)) L.push(`- ${c.chave}: ${c.motivos.join(', ')}${c.png ? ` — ${c.png}` : ''}${c.sha256 ? ` (SHA-256 \`${c.sha256}\`)` : ''}`)
  L.push('')
  L.push('## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95) — a peça principal (compor…png), a leitura pareada, a repetição e a injeção em linhas próprias')
  L.push('| etapa | renders med | renders p95 | ms med | ms p95 |')
  L.push('|---|---|---|---|---|')
  for (const [etapa, c] of Object.entries(resumo.custo)) L.push(`| ${etapa} | ${c.rendersMediana} | ${c.rendersP95} | ${c.msMediana} | ${c.msP95} |`)
  L.push(`Renders somados por etapa: ${resumo.rendersSomados}${meta.rendersObservados !== undefined ? ` · observados pelo contador do renderer na rodada: ${meta.rendersObservados}` : ''}.`)
  L.push('')
  const e = resumo.estabilidade
  L.push(`## 6. Estabilidade: exceções ${e.excecoes} · nao-medida ${e.naoMedida} · sem-vinculo ${e.semVinculo} · timeouts ${e.timeouts}`)
  for (const [m, n] of Object.entries(e.excecoesPorMensagem)) L.push(`- ${n}× ${m}`)
  L.push('')
  const r = resumo.repetibilidade
  L.push(`## 7. Repetibilidade: ${pct(r.iguais, r.comparadas)} iguais (compostas: veredito, motivos, camadas normalizadas e hash do PNG; recusas estruturais: o mesmo código)`)
  for (const dv of r.divergencias) L.push(`- ${dv.chave}: ${dv.diferencas.join('; ')}`)
  L.push('')
  const d1 = resumo.decisao1
  const f = (x: number | null) => (x === null ? '—' : x.toFixed(2))
  L.push(`## 8. Decisão 1 — assunto estimado × catálogo × verdade (${d1.fotos} peças com verdade): IoU est×cat ${f(d1.iouEstimadoCatalogo)} · est×verdade ${f(d1.iouEstimadoVerdade)} · cat×verdade ${f(d1.iouCatalogoVerdade)} · o estimado acertou a invasão em ${d1.estimadoAcertouInvasao} e errou em ${d1.estimadoErrouInvasao}`)
  L.push('A linha D é o gate DEPOIS da falha de leitura injetada (as mesmas peças também aparecem no seu caso de origem).')
  L.push('| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |')
  L.push('|---|---|---|---|---|')
  for (const [caso, b] of Object.entries(d1.bloqueiosPorCaso).sort()) L.push(`| ${caso} | ${b.pecas} | ${b.bloqueadas} | ${b.bloqueadasQueAVerdadeAprovaria} | ${b.aptasQueAVerdadeReprovaria} |`)
  L.push('')
  L.push(`## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): ${resumo.decisao2.pecasComCamadaAcimaDeTexto}; \`oclusao\` não comprovada no gate: ${resumo.decisao2.oclusaoNaoComprovada}`)
  L.push(`Cenário INJETADO (shape acima da headline em peça APTA): ${resumo.decisao2.injecoes} injeções, ${resumo.decisao2.injecoesRecusadas} recusadas pelo gate${Object.keys(resumo.decisao2.motivosDasInjecoes).length ? ` — motivos: ${Object.entries(resumo.decisao2.motivosDasInjecoes).map(([m, n]) => `${m} ${n}`).join(', ')}` : ''}.`)
  L.push(`Modo G (falha de leitura injetada): ${resumo.modoG.leituras} leituras, ${resumo.modoG.validas} válidas (${resumo.modoG.recusadas} recusadas pelo REVISOR e pelo PRODUTOR — item desligado, sem DRAFT na página, resposta REVISAO_HUMANA_NECESSARIA por texto-sobre-assunto e nenhum post criado), ${resumo.modoG.invalidas} inválidas (cache usado).`)
  L.push('')
  L.push('## 10. O que NÃO está coberto por juiz (inspeção humana nos PNGs amostrados)')
  for (const n of resumo.naoCoberto) L.push(`- ${n.regra} — ${n.estado}: ${n.limite}`)
  L.push('')
  return L.join('\n')
}
