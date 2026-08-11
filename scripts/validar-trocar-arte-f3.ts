/**
 * Validação ponta a ponta de `trocarArteDoPost` (F3 — fatia A0), contra o
 * BRANCH DE DESENVOLVIMENTO do Neon.
 *
 * Pelo SERVIÇO, não pela rota nem pela tool: as duas exigem sessão/OAuth, e o
 * que precisa ser provado é o comportamento do miolo — é o mesmo protocolo do
 * teste E2E da melhoria com IA (projeto 8, `publishType: REMINDER`, +7 dias,
 * cleanup completo).
 *
 * ⚠️ **NUNCA contra produção.** `DATABASE_URL=… npx prisma …` NÃO funciona (o
 * CLI do Prisma ignora a variável inline e usa o `.env`, que é PRODUÇÃO), e
 * `import 'dotenv/config'` sozinho carrega justamente esse `.env`. Por isso
 * este script resolve o banco à mão, na ordem `.env` → `.env.development.local`,
 * e ABORTA se o compute resolvido for o mesmo da produção — a mesma comparação
 * por endpoint que `scripts/dev-db.ts` faz. Rodar por dentro do runner
 * (`npx tsx scripts/dev-db.ts npx tsx scripts/validar-trocar-arte-f3.ts`)
 * também funciona: o guard daqui simplesmente confirma o que ele já garantiu.
 *
 * O QUE ELE PROVA
 *   1. troca por generationId num rascunho de imagem única;
 *   2. troca de UM slide num carrossel de 3 — com a CONTAGEM antes/depois, que
 *      é o defeito histórico (o runner da melhoria gravava `mediaUrls: [nova]`
 *      e apagava os outros slides em silêncio);
 *   3. recusa em post aprovado (SCHEDULED);
 *   4. recusa com índice fora do post.
 *
 * O caminho por `pageId` fica de fora de propósito: ele renderiza a página
 * (canvas + upload para o Blob), o que sairia do banco de dev e escreveria no
 * Blob de produção — este script é para rodar sem efeito colateral nenhum fora
 * do branch.
 *
 * USO
 *   npx tsx scripts/validar-trocar-arte-f3.ts
 *   npx tsx scripts/validar-trocar-arte-f3.ts 6      # outro projeto
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const

function parseEnvFile(caminho: string): Record<string, string> {
  if (!existsSync(caminho)) return {}
  const out: Record<string, string> = {}
  for (const linhaCrua of readFileSync(caminho, 'utf8').split('\n')) {
    const linha = linhaCrua.trim()
    if (!linha || linha.startsWith('#')) continue
    const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/** Identidade do compute no Neon — `-pooler` e direto são a MESMA instância. */
function endpointDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}

function abortar(titulo: string, linhas: string[]): never {
  console.error(`\n✗ ${titulo}\n`)
  for (const l of linhas) console.error(`  ${l}`)
  console.error('')
  process.exit(1)
}

function apontarParaODev(): string {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  const dev = parseEnvFile(resolve(ROOT, '.env.development.local'))

  if (!dev.DATABASE_URL) {
    abortar('.env.development.local não define DATABASE_URL.', [
      'Sem ele este script cairia no .env, que é PRODUÇÃO.',
      'Rode  npm run db:dev:setup  antes.',
    ])
  }

  // O resto do ambiente (Blob, chaves) vem do .env; só o banco é substituído.
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]

  const alvo = endpointDe(process.env.DATABASE_URL)
  const producao = new Set(
    DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null),
  )
  if (!alvo || producao.has(alvo)) {
    abortar('O banco resolvido é o de PRODUÇÃO.', [
      `DATABASE_URL aponta para o compute ${alvo ?? '(ilegível)'}.`,
      'Este script escreve posts e sinais — só roda contra o branch de dev.',
    ])
  }
  return alvo
}

const ENDPOINT = apontarParaODev()

const PROJETO = Number(process.argv[2]) || 8
const MARCA = `[F3-TROCA-ARTE ${new Date().toISOString()}]`

let falhas = 0
function ok(titulo: string, detalhe = '') {
  console.log(`  ✓ ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
}
function nok(titulo: string, detalhe: string) {
  falhas++
  console.log(`  ✗ ${titulo} — ${detalhe}`)
}
function conferir(titulo: string, condicao: boolean, detalhe: string) {
  condicao ? ok(titulo, detalhe) : nok(titulo, detalhe)
}

async function main() {
  console.log(`\nbanco: ${ENDPOINT} (desenvolvimento) | projeto ${PROJETO}\n`)

  // Import DEPOIS do env: `@/lib/db` lê DATABASE_URL no import e cria o cliente.
  const { db } = await import('../src/lib/db')
  const { trocarArteDoPost } = await import('../src/lib/posts/trocar-arte-do-post')
  const { CreativeError } = await import('../src/lib/creatives/errors')

  const criados: string[] = []

  const projeto = await db.project.findUnique({
    where: { id: PROJETO },
    select: { id: true, name: true, userId: true },
  })
  if (!projeto) abortar(`Projeto ${PROJETO} não existe neste banco.`, [])

  /**
   * Artes de verdade do próprio cliente, e só do Blob: assim `ingerirMidiaExterna`
   * é no-op e o teste não faz uma única chamada de rede.
   */
  const artes = await db.generation.findMany({
    where: {
      projectId: PROJETO,
      status: 'COMPLETED',
      resultUrl: { contains: '.public.blob.vercel-storage.com' },
    },
    select: { id: true, resultUrl: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })
  if (artes.length < 3) {
    abortar(`Preciso de 3 artes prontas no projeto ${PROJETO} e achei ${artes.length}.`, [
      'O branch de dev pode estar velho — `npm run db:dev:setup --recriar` o refaz.',
    ])
  }

  const daqui7Dias = new Date(Date.now() + 7 * 24 * 3600_000)
  const criarPost = async (
    midias: string[],
    status: 'DRAFT' | 'SCHEDULED',
    tipo: 'STORY' | 'CAROUSEL' = 'STORY',
  ) => {
    const post = await db.socialPost.create({
      data: {
        projectId: PROJETO,
        userId: projeto.userId,
        postType: tipo,
        caption: `${MARCA} post de validação — pode apagar`,
        mediaUrls: midias,
        scheduleType: 'SCHEDULED',
        scheduledDatetime: daqui7Dias,
        status,
        // REMINDER: mesmo que algo escape do cleanup, o sistema não publica —
        // o caminho é um lembrete no WhatsApp, que exige gente.
        publishType: 'REMINDER',
        renderStatus: 'NOT_NEEDED',
      },
      select: { id: true },
    })
    criados.push(post.id)
    return post.id
  }

  try {
    // ── 1. Rascunho de imagem única ────────────────────────────────────────
    console.log('1) troca por generationId num rascunho de imagem única')
    const postUnico = await criarPost([artes[0].resultUrl!], 'DRAFT')
    const r1 = await trocarArteDoPost({
      projectId: PROJETO,
      postId: postUnico,
      generationId: artes[1].id,
      superficie: 'agenda',
    })
    const depois1 = await db.socialPost.findUnique({
      where: { id: postUnico },
      select: { mediaUrls: true, renderStatus: true, generationId: true, nextRenderAt: true },
    })
    conferir('a arte entrou', depois1!.mediaUrls[0] === artes[1].resultUrl, depois1!.mediaUrls[0]!.slice(-40))
    conferir('continua com 1 imagem', depois1!.mediaUrls.length === 1, `${depois1!.mediaUrls.length}`)
    conferir(
      'renderStatus NOT_NEEDED (fora do alcance do cron de render)',
      depois1!.renderStatus === 'NOT_NEEDED',
      depois1!.renderStatus,
    )
    conferir('nextRenderAt limpo', depois1!.nextRenderAt === null, String(depois1!.nextRenderAt))
    conferir(
      'generationId aponta para a arte nova',
      depois1!.generationId === artes[1].id,
      String(depois1!.generationId),
    )
    conferir('a resposta diz que é rascunho', r1.mensagem.includes('rascunho'), r1.mensagem)

    // ── 2. Carrossel de 3: o caso que já quebrou ───────────────────────────
    console.log('\n2) carrossel de 3 mídias — troca só o slide do meio')
    const trio = [artes[0].resultUrl!, artes[1].resultUrl!, artes[2].resultUrl!]
    const postCarrossel = await criarPost(trio, 'DRAFT', 'CAROUSEL')
    const antes2 = await db.socialPost.findUnique({
      where: { id: postCarrossel },
      select: { mediaUrls: true },
    })
    console.log(`   contagem ANTES: ${antes2!.mediaUrls.length}`)

    const arteNova = artes[3] ?? artes[0]
    const r2 = await trocarArteDoPost({
      projectId: PROJETO,
      postId: postCarrossel,
      generationId: arteNova.id,
      indice: 1,
      superficie: 'agenda',
    })
    const depois2 = await db.socialPost.findUnique({
      where: { id: postCarrossel },
      select: { mediaUrls: true, generationId: true },
    })
    console.log(`   contagem DEPOIS: ${depois2!.mediaUrls.length}`)
    conferir(
      'o carrossel continua com 3 imagens',
      depois2!.mediaUrls.length === 3,
      `antes ${antes2!.mediaUrls.length} → depois ${depois2!.mediaUrls.length}`,
    )
    conferir('o slide 2 trocou', depois2!.mediaUrls[1] === arteNova.resultUrl, depois2!.mediaUrls[1]!.slice(-40))
    conferir('o slide 1 ficou intacto', depois2!.mediaUrls[0] === trio[0], depois2!.mediaUrls[0]!.slice(-40))
    conferir('o slide 3 ficou intacto', depois2!.mediaUrls[2] === trio[2], depois2!.mediaUrls[2]!.slice(-40))
    conferir(
      'generationId do post NÃO mudou (a troca não foi na primeira imagem)',
      depois2!.generationId === null,
      String(depois2!.generationId),
    )
    conferir('a resposta conta o que sobrou', r2.mensagem.includes('outras 2'), r2.mensagem)

    // ── 3. Post aprovado é recusado ────────────────────────────────────────
    console.log('\n3) recusa em post aprovado (SCHEDULED)')
    const postAprovado = await criarPost([artes[0].resultUrl!], 'SCHEDULED')
    try {
      await trocarArteDoPost({
        projectId: PROJETO,
        postId: postAprovado,
        generationId: artes[1].id,
      })
      nok('deveria recusar', 'a troca passou num post aprovado')
    } catch (erro) {
      const e = erro as InstanceType<typeof CreativeError>
      conferir('recusado com POST_APROVADO', e.code === 'POST_APROVADO', String(e.code))
      conferir('a mensagem ensina o caminho', /voltar-para-rascunho/.test(e.message), e.message)
    }
    const intacto = await db.socialPost.findUnique({
      where: { id: postAprovado },
      select: { mediaUrls: true },
    })
    conferir(
      'o post aprovado ficou como estava',
      intacto!.mediaUrls[0] === artes[0].resultUrl,
      intacto!.mediaUrls[0]!.slice(-40),
    )

    // ── 4. Índice inválido ─────────────────────────────────────────────────
    console.log('\n4) recusa com índice fora do post')
    try {
      await trocarArteDoPost({
        projectId: PROJETO,
        postId: postCarrossel,
        generationId: artes[0].id,
        indice: 7,
      })
      nok('deveria recusar', 'o índice 7 passou num carrossel de 3')
    } catch (erro) {
      const e = erro as InstanceType<typeof CreativeError>
      conferir('recusado com INDICE_FORA_DO_POST', e.code === 'INDICE_FORA_DO_POST', String(e.code))
    }
    const aindaTres = await db.socialPost.findUnique({
      where: { id: postCarrossel },
      select: { mediaUrls: true },
    })
    conferir('o carrossel seguiu com 3', aindaTres!.mediaUrls.length === 3, `${aindaTres!.mediaUrls.length}`)

    // ── 5. O sinal de aprendizado ficou registrado ─────────────────────────
    console.log('\n5) sinais de aprendizado')
    const sinais = await db.learningSignal.findMany({
      where: { postId: { in: criados }, tipo: 'troca-de-arte' },
      select: { postId: true, desfecho: true, sugeridoEm: true },
    })
    conferir('uma linha por troca bem-sucedida', sinais.length === 2, `${sinais.length} sinais`)
    conferir(
      'é decisão sem sugestão (fora do denominador do KPI)',
      sinais.every((s) => s.desfecho === 'escolha-propria' && s.sugeridoEm === null),
      sinais.map((s) => s.desfecho).join(', '),
    )
  } finally {
    // ── Cleanup completo ───────────────────────────────────────────────────
    console.log('\ncleanup')
    const sinaisApagados = await db.learningSignal.deleteMany({ where: { postId: { in: criados } } })
    const logsApagados = await db.postLog.deleteMany({ where: { postId: { in: criados } } })
    const postsApagados = await db.socialPost.deleteMany({ where: { id: { in: criados } } })
    console.log(
      `  posts: ${postsApagados.count}/${criados.length} | logs: ${logsApagados.count} | sinais: ${sinaisApagados.count}`,
    )
    const sobrou = await db.socialPost.count({ where: { caption: { contains: 'F3-TROCA-ARTE' } } })
    console.log(`  posts de validação restantes no banco: ${sobrou}`)
    await db.$disconnect()
  }

  console.log(falhas === 0 ? '\n✅ tudo certo\n' : `\n❌ ${falhas} conferência(s) falharam\n`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch((erro) => {
  console.error('\n✗ erro inesperado:', erro)
  process.exit(1)
})
