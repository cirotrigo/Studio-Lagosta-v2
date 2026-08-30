/**
 * Backtest do ranking do acervo (F1.5) — SOMENTE LEITURA.
 *
 * Para cada sinal de foto FECHADO com decisão (`aceita-como-veio` | `trocada`,
 * com `escolhido.driveFileId`), refaz a busca com os `criterios` gravados na
 * emissão e responde: em que posição a foto historicamente escolhida ficaria
 * na ordem VELHA (v1, "menos usada primeiro") × na ordem NOVA (`ranquearAcervo`,
 * score composto da F1.3 + casamento por palavra da F2)? É o que calibra os
 * PESOS offline, sem custo e sem deploy (docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md,
 * §F1.5). A meta do plano: mediana da posição nova no top-3.
 *
 * 🔴 **NUNCA chama `buscarNoAcervo`** — ela registra um `LearningSignal` por
 * busca (mesma armadilha de `validar-cadencia-f2.ts`, que não chama
 * `sugerirPosts` pela mesma razão): rodar a validação não pode sujar o corpus
 * que ela mede. Os insumos vêm de `lerCatalogoDoProjeto` e
 * `montarInsumosDeRanking`, que existem exatamente para isso e não escrevem
 * NADA — nem banco, nem Drive.
 *
 * LEAVE-ONE-OUT: antes de ranquear cada sinal, toda escolha/rejeição cujo
 * `sugestaoId` é o próprio sinal sai das preferências — sem isso a escolha que
 * está sendo avaliada inflaria o próprio resultado. O uso em `PhotoUsage` que
 * nasceu dessa mesma decisão NÃO é removido (não há vínculo confiável
 * sinal→uso); ele só pesa no desempate da ordem nova, mas na VELHA ele é o
 * critério inteiro — e empurrar a foto escolhida para o fim da fila é
 * justamente o comportamento v1 que o plano diagnostica.
 *
 * ⚠️ LIMITAÇÃO HONESTA: o catálogo e os insumos são os de HOJE, não os do
 * momento do sinal — fotos entraram e saíram, usos e sinais novos se
 * acumularam. O backtest é DIRECIONAL: serve para calibrar pesos, não para
 * prometer número. E a linha de base é LISONJEADA por viés de apresentação:
 * as escolhas do corpus foram feitas olhando a lista que a v1 mostrou, então
 * parte do "acerto" da ordem velha é a pessoa ter levado o que estava na
 * primeira página — o ganho real da nova em produção tende a ser maior do que
 * a mediana crua daqui sugere.
 *
 * Extra (ganho de recall da F2): quantas fotos escolhidas NÃO passariam no
 * filtro de tema VELHO (substring da frase inteira sobre bestFor/tags/pasta —
 * replicado aqui só para esta conta, verbatim do commit 6327ef8b) mas PASSAM
 * no novo casamento por palavra. Reportado separado, com a contramão
 * (passava no velho e não passa no novo) como cheque de honestidade.
 *
 * USO
 *   npx tsx scripts/validar-ranking-do-acervo.ts           # relatório legível
 *   npx tsx scripts/validar-ranking-do-acervo.ts --json    # a mesma medição em JSON
 */
import 'dotenv/config'
import { db } from '../src/lib/db'
import {
  lerCatalogoDoProjeto,
  montarInsumosDeRanking,
  ultimoUsoDoCatalogo,
  type ImagemCatalogo,
} from '../src/lib/creatives/acervo'
import { mesclarUsos } from '../src/lib/creatives/uso-de-foto'
import {
  casaComTema,
  filtrarAcervo,
  palavrasDoTema,
  ranquearAcervo,
  PESOS,
  type PesosDoAcervo,
  type PilarParaBusca,
  type PreferenciasDeFoto,
} from '../src/lib/creatives/ranquear-acervo'
import { normalizar } from '../src/lib/posts/dia-semana'
import { diaBRT } from '../src/lib/aprendizado/chaves'

const emJson = process.argv.includes('--json')

/** O mesmo sentinela da v1: nunca usada ordena antes de qualquer data real. */
const NUNCA_USADA = '0000-01-01'

/**
 * Segunda passada com uma variação de pesos, para o coordenador comparar.
 *
 * O que varia e por quê (medido na primeira rodada, 30/08/2026): a anotação de
 * `quality` do catálogo é quase CONSTANTE — 93% a 99% de cada acervo está
 * marcado 'alta' (By Rock 939/1076, Real 2962/3003, Quintal 1684/1690…), então
 * QUALIDADE_ALTA não discrimina nada e só age como muro de +6 contra a minoria
 * não-'alta': 93% das fotos ranqueadas ACIMA da escolhida tinham `qualidade`
 * como componente dominante. A variação zera QUALIDADE_ALTA (QUALIDADE_BAIXA
 * fica — 'baixa' é rara e aí a anotação diz algo). Os outros palpites testados
 * (ESCOLHA_GLOBAL 10→16, NOVIDADE_MAX 15→6, REJEICAO_GLOBAL −5→−2) não moveram
 * nada: NOVIDADE está dormente (zero fotos com `catalogadaEm` < 21 dias em
 * TODOS os catálogos) e o resto muda casos que o empate de score já decide.
 */
const PESOS_VARIACAO: PesosDoAcervo = {
  ...PESOS,
  QUALIDADE_ALTA: 0,
}
const DESCRICAO_VARIACAO = 'QUALIDADE_ALTA 6→0 (anotação quase constante: 93-99% do acervo é alta)'

// ── Leitura defensiva dos sinais ───────────────────────────────────────────

/** Os critérios que `registrarProposta` grava (fileName nunca entrou neles). */
interface CriteriosGravados {
  theme?: string | null
  folder?: string | null
  menuCategory?: string | null
  tags?: string[] | null
  quality?: string | null
}

function criteriosDoSinal(sugerido: unknown): CriteriosGravados {
  if (!sugerido || typeof sugerido !== 'object' || Array.isArray(sugerido)) return {}
  const criterios = (sugerido as { criterios?: unknown }).criterios
  if (!criterios || typeof criterios !== 'object' || Array.isArray(criterios)) return {}
  const c = criterios as Record<string, unknown>
  const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
  return {
    theme: texto(c.theme),
    folder: texto(c.folder),
    menuCategory: texto(c.menuCategory),
    tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : null,
    quality: texto(c.quality),
  }
}

function escolhidaDoSinal(escolhido: unknown): string | null {
  if (!escolhido || typeof escolhido !== 'object' || Array.isArray(escolhido)) return null
  const id = (escolhido as { driveFileId?: unknown }).driveFileId
  return typeof id === 'string' && id ? id : null
}

// ── O filtro de tema VELHO (v1), replicado SÓ para a conta de recall ───────

/**
 * Verbatim do `buscarNoAcervo` pré-F2 (commit 6327ef8b): substring da frase
 * INTEIRA normalizada sobre bestFor, tags e pasta. É a heurística que devolvia
 * ZERO para "cortes e churrasco" num acervo de mil fotos.
 */
function passaNoTemaVelho(img: ImagemCatalogo, theme: string): boolean {
  const t = normalizar(theme)
  return (
    (img.bestFor?.some((b) => normalizar(b).includes(t)) ?? false) ||
    (img.tags?.some((x) => normalizar(x).includes(t)) ?? false) ||
    (img.folder ? normalizar(img.folder).includes(t) : false)
  )
}

// ── Leave-one-out ──────────────────────────────────────────────────────────

/**
 * Remove das preferências toda escolha/rejeição nascida do PRÓPRIO sinal em
 * avaliação (`sugestaoId` bate) — inclusive as rejeições das vizinhas de topo
 * daquele mesmo sinal, que sem isso rebaixariam as concorrentes da escolhida.
 * Feedbacks ficam (não carregam sugestaoId; o vínculo deles é a Generation).
 */
function semOSinal(preferencias: PreferenciasDeFoto, sinalId: string): PreferenciasDeFoto {
  return {
    ...preferencias,
    escolhas: preferencias.escolhas.filter((e) => e.sugestaoId !== sinalId),
    rejeicoes: preferencias.rejeicoes.filter((r) => r.sugestaoId !== sinalId),
  }
}

// ── Estatística ────────────────────────────────────────────────────────────

interface Estatisticas {
  n: number
  mediana: number
  p75: number
  top1Pct: number
  top3Pct: number
  top10Pct: number
}

function estatisticas(posicoes: number[]): Estatisticas | null {
  const s = [...posicoes].sort((a, b) => a - b)
  const n = s.length
  if (n === 0) return null
  const mediana = n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
  const p75 = s[Math.min(n - 1, Math.ceil(0.75 * n) - 1)]
  const pct = (k: number) => Math.round((s.filter((p) => p <= k).length / n) * 1000) / 10
  return { n, mediana, p75, top1Pct: pct(1), top3Pct: pct(3), top10Pct: pct(10) }
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

function linhaDeTabela(rotulo: string, velha: Estatisticas, nova: Estatisticas, variacao: Estatisticas): void {
  console.log(
    `  ${rotulo.padEnd(9)} ${fmt(velha.mediana).padStart(7)} ${fmt(nova.mediana).padStart(7)} ${fmt(variacao.mediana).padStart(8)}` +
      `   | p75 ${fmt(velha.p75).padStart(4)} ${fmt(nova.p75).padStart(4)} ${fmt(variacao.p75).padStart(4)}` +
      `   | top-3 ${String(velha.top3Pct).padStart(5)}% ${String(nova.top3Pct).padStart(5)}% ${String(variacao.top3Pct).padStart(5)}%`,
  )
}

// ── Avaliação ──────────────────────────────────────────────────────────────

interface SinalFechado {
  id: string
  projectId: number
  desfecho: string
  criterios: CriteriosGravados
  escolhida: string
}

interface Avaliacao {
  sinalId: string
  projectId: number
  desfecho: string
  criterios: CriteriosGravados
  escolhida: string
  totalConjunto: number
  posVelha: number
  posNova: number
  posVariacao: number
  /**
   * Depois do leave-one-out, a foto escolhida ainda tem algum sinal POSITIVO
   * (escolha em OUTRO sinal, correção pós-produção ou feedback "gostei")? É o
   * teto do aprendizado: só nesses casos o score tem o que aprender — nos
   * outros a foto é primeira escolha e mora no empate de score, onde quem
   * decide é o desempate (uso → hash do dia), não os pesos.
   */
  comSinalRestante: boolean
}

interface NaoAvaliavel {
  sinalId: string
  projectId: number
  criterios: CriteriosGravados
  escolhida: string
  /** 'sem-catalogo' | 'apagada-do-catalogo' | 'nao-passa-no-filtro-hoje' */
  motivo: string
}

interface RecallDoTema {
  sinalId: string
  projectId: number
  theme: string
  escolhida: string
  fileName: string
  passaVelho: boolean
  passaNovo: boolean
}

async function main() {
  console.error('Backtest do ranking do acervo (F1.5) — somente leitura, catálogo e insumos de HOJE.\n')

  // 1. Os sinais fechados com decisão — filtro de Json SEMPRE em código,
  //    nunca por path no SQL (regra da casa: a ausência do campo é o caso comum).
  const linhas = await db.learningSignal.findMany({
    where: { tipo: 'foto', desfecho: { in: ['aceita-como-veio', 'trocada'] } },
    select: { id: true, projectId: true, desfecho: true, sugerido: true, escolhido: true },
    orderBy: { sugeridoEm: 'asc' },
  })

  const sinais: SinalFechado[] = []
  let semEscolhida = 0
  for (const linha of linhas) {
    const escolhida = escolhidaDoSinal(linha.escolhido)
    if (!escolhida) {
      semEscolhida++
      continue
    }
    sinais.push({
      id: linha.id,
      projectId: linha.projectId,
      desfecho: linha.desfecho ?? '',
      criterios: criteriosDoSinal(linha.sugerido),
      escolhida,
    })
  }

  const projetos = [...new Set(sinais.map((s) => s.projectId))].sort((a, b) => a - b)
  const nomes = new Map(
    (await db.project.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  )

  console.error(
    `${linhas.length} sinais fechados; ${sinais.length} com escolhido.driveFileId` +
      (semEscolhida ? ` (${semEscolhida} sem — fora da conta)` : '') +
      `; ${projetos.length} projetos.\n`,
  )

  const avaliacoes: Avaliacao[] = []
  const naoAvaliaveis: NaoAvaliavel[] = []
  const recall: RecallDoTema[] = []
  const hojeBRT = diaBRT()

  // 2. Por projeto: UMA leitura do catálogo e UMA dos insumos, cacheadas no laço.
  for (const projectId of projetos) {
    const doProjeto = sinais.filter((s) => s.projectId === projectId)
    const nome = nomes.get(projectId) ?? `projeto ${projectId}`

    let todas: ImagemCatalogo[]
    let insumos: {
      preferencias: PreferenciasDeFoto
      destaques: Set<string>
      pilares: PilarParaBusca[]
      usos: Map<string, { ultimoUso: string; vezes: number }>
    }
    try {
      ;[{ todas }, insumos] = await Promise.all([
        lerCatalogoDoProjeto(projectId),
        montarInsumosDeRanking(projectId),
      ])
    } catch (erro) {
      const codigo = (erro as { code?: string }).code ?? 'erro'
      console.error(`  [${nome}] catálogo indisponível (${codigo}) — ${doProjeto.length} sinal(is) não avaliável(is).`)
      for (const s of doProjeto) {
        naoAvaliaveis.push({ sinalId: s.id, projectId, criterios: s.criterios, escolhida: s.escolhida, motivo: 'sem-catalogo' })
      }
      continue
    }

    const { preferencias, destaques, pilares, usos } = insumos
    const noCatalogo = new Map(todas.map((i) => [i.driveFileId, i]))
    const temQualidade = todas.some((i) => i.quality)

    // O MESMO mapa de último uso que `buscarNoAcervo` monta (banco + legado do
    // catálogo) — serve às duas ordens: é a chave inteira da velha e o
    // desempate da nova.
    const ultimoUso = new Map<string, string>()
    for (const i of todas) {
      const uso = mesclarUsos(usos.get(i.driveFileId), ultimoUsoDoCatalogo(i))
      if (uso) ultimoUso.set(i.driveFileId, uso)
    }

    console.error(`  [${nome}] ${doProjeto.length} sinais, acervo ${todas.length}, sinais no insumo: ${preferencias.escolhas.length} escolhas / ${preferencias.rejeicoes.length} rejeições.`)

    for (const sinal of doProjeto) {
      const c = sinal.criterios
      const palavras = c.theme ? palavrasDoTema(c.theme, pilares) : []

      // Ganho de recall da F2 — só para busca com tema, e só quando a foto
      // ainda existe no catálogo (é a entrada dela que os dois filtros leem).
      const entrada = noCatalogo.get(sinal.escolhida)
      if (c.theme && entrada) {
        recall.push({
          sinalId: sinal.id,
          projectId,
          theme: c.theme,
          escolhida: sinal.escolhida,
          fileName: entrada.fileName,
          passaVelho: passaNoTemaVelho(entrada, c.theme),
          passaNovo: casaComTema(entrada, palavras).casa,
        })
      }

      // 3. O conjunto candidato de HOJE, com o filtro novo (F2) — o mesmo
      //    conjunto para as duas ordens, para a comparação ser só de ORDEM.
      const conjunto = filtrarAcervo(todas, {
        folder: c.folder,
        fileName: null,
        menuCategory: c.menuCategory,
        tags: c.tags,
        quality: c.quality,
        temQualidadeNoCatalogo: temQualidade,
        palavrasDoTema: palavras,
      })

      if (!conjunto.some((i) => i.driveFileId === sinal.escolhida)) {
        naoAvaliaveis.push({
          sinalId: sinal.id,
          projectId,
          criterios: c,
          escolhida: sinal.escolhida,
          motivo: entrada ? 'nao-passa-no-filtro-hoje' : 'apagada-do-catalogo',
        })
        continue
      }

      // 4. ORDEM VELHA (v1): só "menos usada primeiro" — a chave é o mesmo
      //    mesclarUsos, `localeCompare` asc, e o sort estável do JS mantém a
      //    ordem do catálogo no empate (verbatim do 6327ef8b).
      const chaveDeUso = (i: ImagemCatalogo) => ultimoUso.get(i.driveFileId) ?? NUNCA_USADA
      const ordemVelha = [...conjunto].sort((a, b) => chaveDeUso(a).localeCompare(chaveDeUso(b)))
      const posVelha = ordemVelha.findIndex((i) => i.driveFileId === sinal.escolhida) + 1

      // 5. ORDEM NOVA: `ranquearAcervo` com leave-one-out do próprio sinal.
      const loo = semOSinal(preferencias, sinal.id)
      const comSinalRestante =
        loo.escolhas.some((e) => e.driveFileId === sinal.escolhida) ||
        loo.feedbacks.some((f) => f.driveFileId === sinal.escolhida && f.positivo)
      const posicaoNova = (pesos: PesosDoAcervo): number => {
        const ranqueadas = ranquearAcervo(
          {
            imagens: conjunto,
            tema: c.theme ?? null,
            pilares,
            preferencias: loo,
            ultimoUso,
            destaques,
            hojeBRT,
          },
          pesos,
        )
        return ranqueadas.findIndex((r) => r.imagem.driveFileId === sinal.escolhida) + 1
      }

      avaliacoes.push({
        sinalId: sinal.id,
        projectId,
        desfecho: sinal.desfecho,
        criterios: c,
        escolhida: sinal.escolhida,
        totalConjunto: conjunto.length,
        posVelha,
        posNova: posicaoNova(PESOS),
        posVariacao: posicaoNova(PESOS_VARIACAO),
        comSinalRestante,
      })
    }
  }

  // ── Relatório ────────────────────────────────────────────────────────────

  const porMotivo: Record<string, number> = {}
  for (const n of naoAvaliaveis) porMotivo[n.motivo] = (porMotivo[n.motivo] ?? 0) + 1

  const ganhoDeRecall = recall.filter((r) => !r.passaVelho && r.passaNovo)
  const perdaDeRecall = recall.filter((r) => r.passaVelho && !r.passaNovo)

  const porProjeto = projetos
    .map((projectId) => {
      const doProjeto = avaliacoes.filter((a) => a.projectId === projectId)
      const velha = estatisticas(doProjeto.map((a) => a.posVelha))
      const nova = estatisticas(doProjeto.map((a) => a.posNova))
      const variacao = estatisticas(doProjeto.map((a) => a.posVariacao))
      return {
        projectId,
        projeto: nomes.get(projectId) ?? `projeto ${projectId}`,
        avaliaveis: doProjeto.length,
        naoAvaliaveis: naoAvaliaveis.filter((n) => n.projectId === projectId).length,
        velha,
        nova,
        variacao,
      }
    })
    .filter((p) => p.avaliaveis > 0 || p.naoAvaliaveis > 0)

  const geral = {
    avaliaveis: avaliacoes.length,
    naoAvaliaveis: naoAvaliaveis.length,
    naoAvaliaveisPorMotivo: porMotivo,
    velha: estatisticas(avaliacoes.map((a) => a.posVelha)),
    nova: estatisticas(avaliacoes.map((a) => a.posNova)),
    variacao: estatisticas(avaliacoes.map((a) => a.posVariacao)),
  }

  const porDesfecho = ['aceita-como-veio', 'trocada'].map((desfecho) => {
    const grupo = avaliacoes.filter((a) => a.desfecho === desfecho)
    return {
      desfecho,
      velha: estatisticas(grupo.map((a) => a.posVelha)),
      nova: estatisticas(grupo.map((a) => a.posNova)),
      variacao: estatisticas(grupo.map((a) => a.posVariacao)),
    }
  })

  // O teto do aprendizado: o score só tem o que aprender quando sobra sinal
  // positivo da foto DEPOIS do leave-one-out. É a divisão que diz onde os
  // pesos importam (com sinal) e onde nada além de corpus resolve (sem).
  const tetoDoSinal = [true, false].map((comSinal) => {
    const grupo = avaliacoes.filter((a) => a.comSinalRestante === comSinal)
    return {
      grupo: comSinal ? 'com-sinal-restante' : 'sem-sinal-restante',
      velha: estatisticas(grupo.map((a) => a.posVelha)),
      nova: estatisticas(grupo.map((a) => a.posNova)),
      variacao: estatisticas(grupo.map((a) => a.posVariacao)),
    }
  })

  const resultado = {
    geradoEm: new Date().toISOString(),
    limitacao:
      'Catálogo e insumos são os de HOJE, não os do momento do sinal — backtest direcional, para calibrar pesos, não para prometer número.',
    pesos: { nova: 'PESOS default do módulo', variacao: DESCRICAO_VARIACAO },
    geral,
    porProjeto,
    porDesfecho,
    tetoDoSinal,
    ganhoDeRecallF2: {
      buscasComTemaAvaliadas: recall.length,
      ganho: ganhoDeRecall.length,
      perda: perdaDeRecall.length,
      notaEstrutural:
        'Todo sinal FECHADO veio de uma lista que OFERECEU a foto (fechamento conservador), ' +
        'então a escolhida passava no filtro velho por construção — o ganho de recall da F2 ' +
        'vive nas 74 EXPIRADAS (foto de fora da lista), que não têm escolhido para testar.',
      fotos: ganhoDeRecall.map((r) => ({
        projeto: nomes.get(r.projectId) ?? r.projectId,
        theme: r.theme,
        fileName: r.fileName,
      })),
      contramao: perdaDeRecall.map((r) => ({
        projeto: nomes.get(r.projectId) ?? r.projectId,
        theme: r.theme,
        fileName: r.fileName,
      })),
    },
    avaliacoes,
    naoAvaliaveis,
  }

  if (emJson) {
    console.log(JSON.stringify(resultado, null, 2))
    await db.$disconnect()
    return
  }

  console.log('\n══ Backtest do ranking do acervo — posição da foto escolhida (velha × nova × variação) ══')
  console.log(`   pesos da variação: ${DESCRICAO_VARIACAO}`)
  console.log('\n   (mediana)  velha    nova  variação')
  for (const p of porProjeto) {
    if (!p.velha || !p.nova || !p.variacao) {
      console.log(`\n── ${p.projeto} — 0 avaliáveis, ${p.naoAvaliaveis} não avaliável(is) ──`)
      continue
    }
    console.log(`\n── ${p.projeto} — ${p.avaliaveis} avaliáveis${p.naoAvaliaveis ? `, ${p.naoAvaliaveis} não avaliáveis` : ''} ──`)
    linhaDeTabela('mediana', p.velha, p.nova, p.variacao)
    console.log(
      `            top-1 ${p.velha.top1Pct}% → ${p.nova.top1Pct}% (var ${p.variacao.top1Pct}%)   top-10 ${p.velha.top10Pct}% → ${p.nova.top10Pct}% (var ${p.variacao.top10Pct}%)`,
    )
  }

  if (geral.velha && geral.nova && geral.variacao) {
    console.log(`\n══ GERAL — ${geral.avaliaveis} avaliáveis, ${geral.naoAvaliaveis} não avaliáveis ══`)
    console.log('              velha    nova  variação')
    console.log(`  mediana   ${fmt(geral.velha.mediana).padStart(7)} ${fmt(geral.nova.mediana).padStart(7)} ${fmt(geral.variacao.mediana).padStart(9)}`)
    console.log(`  p75       ${fmt(geral.velha.p75).padStart(7)} ${fmt(geral.nova.p75).padStart(7)} ${fmt(geral.variacao.p75).padStart(9)}`)
    console.log(`  top-1     ${String(geral.velha.top1Pct + '%').padStart(7)} ${String(geral.nova.top1Pct + '%').padStart(7)} ${String(geral.variacao.top1Pct + '%').padStart(9)}`)
    console.log(`  top-3     ${String(geral.velha.top3Pct + '%').padStart(7)} ${String(geral.nova.top3Pct + '%').padStart(7)} ${String(geral.variacao.top3Pct + '%').padStart(9)}`)
    console.log(`  top-10    ${String(geral.velha.top10Pct + '%').padStart(7)} ${String(geral.nova.top10Pct + '%').padStart(7)} ${String(geral.variacao.top10Pct + '%').padStart(9)}`)
  }

  for (const grupo of porDesfecho) {
    if (!grupo.velha || !grupo.nova || !grupo.variacao) continue
    console.log(
      `\n  só ${grupo.desfecho} (${grupo.velha.n}): mediana ${fmt(grupo.velha.mediana)} → ${fmt(grupo.nova.mediana)} (var ${fmt(grupo.variacao.mediana)}); top-3 ${grupo.velha.top3Pct}% → ${grupo.nova.top3Pct}% (var ${grupo.variacao.top3Pct}%)`,
    )
  }

  console.log('\n══ Teto do sinal — onde o score tem o que aprender (pós leave-one-out) ══')
  for (const grupo of tetoDoSinal) {
    if (!grupo.velha || !grupo.nova || !grupo.variacao) continue
    console.log(
      `  ${grupo.grupo} (${grupo.velha.n}): mediana ${fmt(grupo.velha.mediana)} → ${fmt(grupo.nova.mediana)} (var ${fmt(grupo.variacao.mediana)}); ` +
        `top-3 ${grupo.velha.top3Pct}% → ${grupo.nova.top3Pct}% (var ${grupo.variacao.top3Pct}%); top-10 ${grupo.velha.top10Pct}% → ${grupo.nova.top10Pct}% (var ${grupo.variacao.top10Pct}%)`,
    )
  }

  if (Object.keys(porMotivo).length > 0) {
    console.log('\n── Não avaliáveis por motivo ──')
    for (const [motivo, n] of Object.entries(porMotivo)) console.log(`  ${motivo}: ${n}`)
  }

  console.log(`\n── Ganho de recall da F2 (buscas com tema: ${recall.length}) ──`)
  console.log(`  não passava no filtro velho e passa no novo: ${ganhoDeRecall.length}`)
  for (const r of ganhoDeRecall) {
    console.log(`    · [${nomes.get(r.projectId) ?? r.projectId}] tema "${r.theme}" → ${r.fileName}`)
  }
  console.log(`  contramao (passava no velho, não passa no novo): ${perdaDeRecall.length}`)
  for (const r of perdaDeRecall) {
    console.log(`    · [${nomes.get(r.projectId) ?? r.projectId}] tema "${r.theme}" → ${r.fileName}`)
  }
  console.log(
    '  ⚠️ nota estrutural: sinal fechado só nasce de lista que OFERECEU a foto, então a\n' +
      '  escolhida passava no filtro velho por construção — o ganho da F2 vive nas buscas\n' +
      '  EXPIRADAS (foto de fora da lista), que não têm escolhido para testar aqui.',
  )

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
