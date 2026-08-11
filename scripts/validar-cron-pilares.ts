/**
 * E2E da rodada diária de classificação de pilares — pelo SERVIÇO, contra o
 * banco de DESENVOLVIMENTO.
 *
 * A rota de cron exige `CRON_SECRET` e a da aba Marca exige sessão do Clerk, então
 * quem é exercitado aqui é o que as duas embrulham: `classificarHistorico`
 * (`src/lib/aprendizado/pilares-service.ts`) e o contrato da rodada
 * (`src/lib/aprendizado/rodada-de-pilares.ts`). É o protocolo que a casa já usa
 * (`validar-plano-f3.ts`): importar o serviço e rodar o caminho real, sem HTTP.
 *
 * 🔴 NADA AQUI GASTA CHAMADA PAGA DE MODELO, e isso é desenho, não sorte:
 * os posts de teste nascem SEM TEXTO (`caption: ''`), e `classificarLote`
 * resolve o caso "sem texto" localmente, sem falar com a OpenAI. O que se prova
 * é a mecânica que o cron precisa — fila, teto, relógio, idempotência,
 * contagem do que falta —, não a qualidade do rótulo, que é assunto de
 * `classificador.test.ts`. A janela (`desde`) é de 2 minutos e o script ABORTA
 * se encontrar qualquer post real dentro dela, justamente para não classificar
 * (nem cobrar) histórico de verdade.
 *
 * O que é SIMULADO: o relógio de `percorrerComOrcamento` (injetado, para o
 * corte por orçamento não custar 4 minutos de espera) e a lista de projetos das
 * conferências de rotação. O que é REAL: o banco, os posts, a taxonomia, o
 * serviço inteiro e a fila montada a partir dos projetos que existem.
 *
 * USO
 *   npx tsx scripts/dev-db.ts npx tsx scripts/validar-cron-pilares.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// Módulos PUROS podem ser importados estaticamente. `@/lib/db` e o serviço,
// não: eles abrem conexão no import, e por isso só entram DEPOIS do guard.
import {
  LIMITE_DA_UI,
  LIMITE_POR_PROJETO,
  ORCAMENTO_DA_RODADA_MS,
  filaDeClassificacao,
  fraseDoProgresso,
  percorrerComOrcamento,
  restantesDaPassada,
} from '@/lib/aprendizado/rodada-de-pilares'

const PROJECT_ID = 8
/** Janela estreita: só os posts que este script acabou de criar cabem nela. */
const JANELA_MS = 2 * 60_000
const POSTS_DE_TESTE = 3

/**
 * 🔴 O guard que falta quando alguém roda o script "na mão".
 *
 * `npx tsx scripts/validar-cron-pilares.ts` sem o runner carrega o `.env`, que
 * aponta para PRODUÇÃO — e este script ESCREVE. A comparação é pelo COMPUTE
 * (primeiro rótulo do host, sem o sufixo `-pooler`), nunca pelo host inteiro:
 * `ep-x-pooler.…` e `ep-x.…` são a MESMA instância.
 */
function computeDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}

function garantirBancoDeDev(): void {
  const atual = computeDe(process.env.DATABASE_URL)
  if (!atual) {
    console.error('\n✗ DATABASE_URL não é uma URL de conexão válida.\n')
    process.exit(1)
  }
  const envProd = resolve(process.cwd(), '.env')
  if (!existsSync(envProd)) return
  for (const linha of readFileSync(envProd, 'utf8').split('\n')) {
    const m = linha.trim().match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/)
    if (!m) continue
    const prod = computeDe(m[2].trim().replace(/^["']|["']$/g, ''))
    if (prod && prod === atual) {
      console.error('\n✗ Este script ESCREVE no banco e você está apontando para PRODUÇÃO.\n')
      console.error(`  compute resolvido: ${atual} (o mesmo do .env)\n`)
      console.error('  Rode assim:  npx tsx scripts/dev-db.ts npx tsx scripts/validar-cron-pilares.ts\n')
      process.exit(1)
    }
  }
  console.log(`[e2e] banco: ${atual} (desenvolvimento)`)
}

garantirBancoDeDev()

let falhas = 0
function conferir(descricao: string, condicao: boolean, detalhe?: unknown) {
  if (condicao) {
    console.log(`  ✓ ${descricao}`)
  } else {
    falhas += 1
    console.error(`  ✗ ${descricao}`, detalhe ?? '')
  }
}

const DIA_MS = 86_400_000

async function main() {
  // Import DEPOIS do guard: `@/lib/db` abre conexão já no import do módulo.
  const { db } = await import('@/lib/db')
  const { classificarHistorico, taxonomiaAprovada } = await import('@/lib/aprendizado/pilares-service')
  const { VERSAO_DO_CLASSIFICADOR } = await import('@/lib/aprendizado/classificador')
  const { PILAR_SEM_TEXTO } = await import('@/lib/aprendizado/pilares')

  const limpeza: Array<() => Promise<void>> = []

  try {
    // ── 1. A fila: quem entra, quem fica de fora, e em que ordem ────────────
    console.log('\n1) a fila da rodada, montada com os projetos que existem')
    const projetos = await db.project.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })
    const taxonomias = await db.contentPillar.groupBy({
      by: ['projectId'],
      where: { aprovado: true },
      _count: { _all: true },
    })
    const aprovadosPorProjeto = new Map(taxonomias.map((t) => [t.projectId, t._count._all]))
    const candidatos = projetos.map((p) => ({
      id: p.id,
      nome: p.name,
      pilaresAprovados: aprovadosPorProjeto.get(p.id) ?? 0,
    }))
    const semTaxonomia = candidatos.filter((p) => p.pilaresAprovados === 0)
    const fila = filaDeClassificacao(candidatos)

    console.log(
      `   ${candidatos.length} projeto(s) no banco · ${fila.length} na fila · ${semTaxonomia.length} sem taxonomia`,
    )
    conferir(
      'todo mundo que entrou na fila tem taxonomia aprovada',
      fila.every((p) => p.pilaresAprovados > 0),
    )
    conferir(
      'nenhum projeto sem taxonomia entrou na fila',
      semTaxonomia.every((p) => !fila.some((q) => q.id === p.id)),
      semTaxonomia.map((p) => p.nome),
    )

    if (fila.length > 1) {
      const primeiros = new Set<number>()
      for (let dia = 0; dia < fila.length; dia++) {
        primeiros.add(filaDeClassificacao(candidatos, new Date(Date.now() + dia * DIA_MS))[0].id)
      }
      conferir(
        `em ${fila.length} dias consecutivos, todo cliente da fila chega a ser o primeiro`,
        primeiros.size === fila.length,
        `${primeiros.size} clientes diferentes na frente`,
      )
    } else {
      console.log('   (menos de 2 projetos na fila — rotação conferida só no vitest)')
    }

    // ── 2. O corte por orçamento (relógio SIMULADO) ─────────────────────────
    console.log('\n2) o orçamento para de pegar trabalho novo (relógio simulado)')
    let agoraFalso = 0
    const visitados: number[] = []
    const percurso = await percorrerComOrcamento(
      fila.length > 0 ? fila : [{ id: 0, nome: 'fictício', pilaresAprovados: 1 }],
      async (p) => {
        visitados.push(p.id)
        // Cada projeto "gasta" metade do orçamento: o terceiro já não cabe.
        agoraFalso += ORCAMENTO_DA_RODADA_MS / 2
        return p.id
      },
      { prazoEm: ORCAMENTO_DA_RODADA_MS, agora: () => agoraFalso },
    )
    conferir(
      'no máximo 2 projetos são pegos quando cada um consome metade do orçamento',
      percurso.feitos.length <= 2,
      percurso.feitos,
    )
    conferir(
      'quem não coube volta em "adiados", nunca some do relato',
      percurso.feitos.length + percurso.adiados.length === Math.max(fila.length, 1),
    )
    conferir('só foi trabalhado o que está em "feitos"', visitados.length === percurso.feitos.length)

    // ── 3. Taxonomia do projeto de teste ────────────────────────────────────
    console.log('\n3) taxonomia do projeto de teste')
    const projeto = await db.project.findUniqueOrThrow({
      where: { id: PROJECT_ID },
      select: { id: true, name: true, userId: true },
    })
    let taxonomia = await taxonomiaAprovada(PROJECT_ID)
    if (taxonomia.length === 0) {
      const pilar = await db.contentPillar.create({
        data: {
          projectId: PROJECT_ID,
          slug: 'e2e-cron-pilares',
          nome: 'E2E — apagar',
          descricao: 'pilar temporário do e2e',
          ordem: 999,
          aprovado: true,
          origem: 'humano',
        },
      })
      limpeza.push(async () => {
        await db.contentPillar.deleteMany({ where: { id: pilar.id } })
        console.log('[cleanup] pilar temporário apagado')
      })
      taxonomia = await taxonomiaAprovada(PROJECT_ID)
    }
    console.log(`   ${projeto.name}: ${taxonomia.length} pilar(es) aprovado(s)`)
    conferir('o projeto de teste tem taxonomia (senão a classificação nem roda)', taxonomia.length > 0)

    // ── 4. Posts SEM TEXTO, dentro de uma janela de 2 minutos ───────────────
    console.log(`\n4) ${POSTS_DE_TESTE} posts publicados SEM TEXTO (zero chamada paga)`)
    const desde = new Date(Date.now() - JANELA_MS)
    const jaHaviaNaJanela = await db.socialPost.count({
      where: { projectId: PROJECT_ID, status: 'POSTED', scheduledDatetime: { gte: desde } },
    })
    if (jaHaviaNaJanela > 0) {
      console.error(
        `\n✗ Há ${jaHaviaNaJanela} post(s) REAIS na janela de teste — abortando para não classificar histórico de verdade.\n`,
      )
      process.exit(1)
    }

    const criados: string[] = []
    for (let i = 0; i < POSTS_DE_TESTE; i++) {
      const post = await db.socialPost.create({
        data: {
          projectId: PROJECT_ID,
          userId: projeto.userId,
          postType: 'STORY',
          // 🔴 Vazio de propósito: é o que mantém o modelo fora do caminho.
          caption: '',
          mediaUrls: ['https://exemplo.invalido/e2e-cron-pilares.png'],
          scheduleType: 'SCHEDULED',
          scheduledDatetime: new Date(Date.now() - i * 1_000),
          status: 'POSTED',
          publishType: 'REMINDER',
          renderStatus: 'NOT_NEEDED',
        },
        select: { id: true },
      })
      criados.push(post.id)
    }
    limpeza.push(async () => {
      await db.socialPost.deleteMany({ where: { id: { in: criados } } })
      console.log(`[cleanup] ${criados.length} post(s) de teste apagados`)
    })
    console.log(`   ${criados.join(', ')}`)

    // ── 5. O teto: uma passada não precisa dar conta de tudo ────────────────
    console.log('\n5) passada com teto de 2 — o resto tem de ser RELATADO')
    const passadaA = await classificarHistorico(PROJECT_ID, { desde, limite: 2 })
    conferir('a passada viu os 3 pendentes', passadaA.pendentes === POSTS_DE_TESTE, passadaA.pendentes)
    conferir('o teto foi respeitado', passadaA.analisados === 2, passadaA.analisados)
    conferir('quem ficou de fora aparece em "restantes"', passadaA.restantes === 1, passadaA.restantes)
    conferir('post sem texto vira "sem-texto", não "outro"', passadaA.semTexto === 2, passadaA.semTexto)
    console.log(`   frase da tela: "${fraseDoProgresso(passadaA)}"`)
    conferir(
      'a frase convida a clicar de novo enquanto sobra trabalho',
      fraseDoProgresso(passadaA).includes('Faltam 1'),
    )

    // ── 6. Clicar de novo AVANÇA (era aqui que a passada girava em falso) ───
    console.log('\n6) a passada seguinte avança em vez de repetir')
    const passadaB = await classificarHistorico(PROJECT_ID, { desde, limite: 2 })
    conferir('a segunda passada pegou o que faltava', passadaB.analisados === 1, passadaB.analisados)
    conferir('e não sobrou nada', passadaB.restantes === 0, passadaB.restantes)

    const marcados = await db.socialPost.findMany({
      where: { id: { in: criados } },
      select: { id: true, pilar: true, pilarVersao: true, pilarClassificadoEm: true },
    })
    conferir(
      'os 3 posts ficaram gravados como "sem-texto" na versão atual',
      marcados.length === POSTS_DE_TESTE &&
        marcados.every(
          (p) => p.pilar === PILAR_SEM_TEXTO && p.pilarVersao === VERSAO_DO_CLASSIFICADOR && p.pilarClassificadoEm,
        ),
      marcados,
    )

    // ── 7. Idempotência ─────────────────────────────────────────────────────
    console.log('\n7) rodar de novo não reclassifica (é o que faz o cron diário ser barato)')
    const passadaC = await classificarHistorico(PROJECT_ID, { desde })
    conferir('não há mais pendentes', passadaC.pendentes === 0, passadaC.pendentes)
    conferir('nada foi analisado de novo', passadaC.analisados === 0, passadaC.analisados)
    conferir('nada foi reescrito', passadaC.classificados === 0, passadaC.classificados)
    conferir(
      'a tela diz "nada novo" em vez de "0 classificadas"',
      fraseDoProgresso(passadaC).startsWith('Nada novo'),
      fraseDoProgresso(passadaC),
    )

    // Comparação por ID: `findMany` sem `orderBy` não promete ordem, e comparar
    // por posição transformaria um teste de "não mexeu" em sorteio.
    const antes = new Map(marcados.map((p) => [p.id, p.pilarClassificadoEm?.getTime() ?? null]))
    const carimbos = await db.socialPost.findMany({
      where: { id: { in: criados } },
      select: { id: true, pilarClassificadoEm: true },
    })
    conferir(
      'os carimbos de classificação não foram mexidos',
      carimbos.every((c) => (c.pilarClassificadoEm?.getTime() ?? null) === antes.get(c.id)),
    )

    // ── 8. O relógio: orçamento vencido não pega lote nenhum ────────────────
    console.log('\n8) orçamento vencido: a passada devolve tudo como pendente')
    const passadaD = await classificarHistorico(PROJECT_ID, {
      desde,
      reclassificar: true,
      prazoEm: Date.now() - 1,
    })
    conferir('com o prazo vencido, nada é analisado', passadaD.analisados === 0, passadaD.analisados)
    conferir(
      'os 3 continuam contados como pendentes',
      passadaD.pendentes === POSTS_DE_TESTE && passadaD.restantes === POSTS_DE_TESTE,
      passadaD,
    )
    conferir(
      'e a passada explica por que parou',
      passadaD.avisos.some((a) => a.includes('tempo')),
      passadaD.avisos,
    )
    conferir(
      'restantesDaPassada concorda com o que o serviço devolveu',
      restantesDaPassada(passadaD.pendentes, passadaD.analisados) === passadaD.restantes,
    )

    // ── 9. Cliente sem taxonomia: silêncio, não erro ────────────────────────
    console.log('\n9) cliente sem taxonomia é pulado em silêncio')
    const semTaxonomiaId = semTaxonomia[0]?.id
    if (semTaxonomiaId) {
      const passadaE = await classificarHistorico(semTaxonomiaId, { desde })
      conferir('nada é analisado', passadaE.analisados === 0 && passadaE.pendentes === 0)
      conferir(
        'e o motivo é dito em português, sem virar erro',
        passadaE.avisos.some((a) => a.includes('pilares aprovados')),
        passadaE.avisos,
      )
    } else {
      console.log('   (todos os projetos deste banco têm taxonomia — caso conferido no vitest)')
    }

    console.log(
      `\n[e2e] tetos em uso: ${LIMITE_POR_PROJETO}/projeto no cron, ${LIMITE_DA_UI} por clique na aba Marca, orçamento de ${ORCAMENTO_DA_RODADA_MS / 1000}s`,
    )
  } finally {
    console.log('')
    for (const passo of limpeza.reverse()) {
      await passo().catch((e) => console.error('[cleanup] falhou:', e))
    }
    await db.$disconnect()
  }

  console.log(falhas === 0 ? '\n✅ tudo certo' : `\n❌ ${falhas} conferência(s) falharam`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('\n💥 erro no e2e:', error)
  process.exit(1)
})
