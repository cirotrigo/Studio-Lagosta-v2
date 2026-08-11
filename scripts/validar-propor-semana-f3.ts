/**
 * E2E de `propor-semana` (F3, fatia B2) — pelo SERVIÇO, contra o banco.
 *
 * As rotas e o conector MCP exigem sessão (Clerk/OAuth), então quem é
 * exercitado aqui é `src/lib/planos/propor-semana.ts` — o mesmo código que a
 * tool embrulha. É o protocolo da casa (`validar-plano-f3.ts`,
 * `.tmp-test-improve-e2e.ts`): o teste importa o serviço e roda o caminho real,
 * sem HTTP.
 *
 * O QUE ESTE TESTE PRECISA PROVAR (é o contrato do produto):
 *   1. a leva nasce PERSISTIDA, com item, horário e assunto;
 *   2. **nenhuma Generation e nenhum GenerationJob** foram criados;
 *   3. **nenhum crédito saiu** da conta do dono;
 *   4. cada item carrega o `sugestaoId` do SLOT que o originou;
 *   5. montar duas vezes **não duplica sinal** de aprendizado;
 *   6. o cold start sai ROTULADO, e sem inventar estatística.
 *
 * Protocolo de segurança:
 *  - projeto 8 (Lagosta Criativa); nada aqui cria post, então nada chega ao
 *    Zernio — os itens de plano são intenção, não publicação;
 *  - cleanup completo no fim, inclusive quando algo falha no meio (planos,
 *    pilares de teste e os sinais gravados durante a janela do teste);
 *  - 🔴 recusa rodar contra PRODUÇÃO (ver `garantirBancoDeDev` abaixo).
 *
 * USO
 *   npx tsx scripts/dev-db.ts npx tsx scripts/validar-propor-semana-f3.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// `errors.ts` não tem dependência nenhuma — importar estático aqui é seguro.
// `@/lib/db` e o serviço, não: eles abrem conexão no import, e por isso só
// entram DEPOIS do guard, por import dinâmico dentro do `main()`.
import { CreativeError } from '@/lib/creatives/errors'

const PROJECT_ID = 8

/**
 * O cliente que ainda não tem rotina, para provar o cold start de verdade.
 *
 * Ele existe no banco (é o projeto pessoal do Ciro), não publicou nada na
 * janela e nem pasta de acervo tem — as duas degradações que a montagem precisa
 * saber atravessar. `propor-semana` não cria post nem arte em projeto nenhum,
 * então mexer aqui é tão inofensivo quanto no projeto do protocolo; o plano e
 * os sinais criados são apagados no fim.
 */
const PROJETO_SEM_ROTINA = 9

/**
 * 🔴 O guard que falta quando alguém roda o script "na mão".
 *
 * `npx tsx scripts/validar-propor-semana-f3.ts` sem o runner carrega o `.env`,
 * que aponta para PRODUÇÃO — e este script ESCREVE. A comparação é pelo
 * COMPUTE (primeiro rótulo do host, sem o sufixo `-pooler`), nunca pelo host
 * inteiro: `ep-x-pooler.…` e `ep-x.…` são a MESMA instância.
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
      console.error('  Rode assim:  npx tsx scripts/dev-db.ts npx tsx scripts/validar-propor-semana-f3.ts\n')
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

/** Os pilares de teste — apagados no fim. Nomes que não existem em cliente real. */
const PILARES_DE_TESTE = [
  { slug: 'e2e-almoco', nome: 'E2E Almoço' },
  { slug: 'e2e-happy', nome: 'E2E Happy hour' },
  { slug: 'e2e-delivery', nome: 'E2E Delivery' },
  { slug: 'e2e-bastidores', nome: 'E2E Bastidores' },
]

async function main() {
  // Import DEPOIS do guard: `@/lib/db` abre conexão já no import do módulo.
  const { db } = await import('@/lib/db')
  const { proporSemana } = await import('@/lib/planos/propor-semana')
  const { ROTULO_DE_COLD_START } = await import('@/lib/planos/proposta-de-semana')
  const { lerPlano, arquivarPlano } = await import('@/lib/planos/plano-service')
  const { fecharDicaDeCopyDoItem, registrarDicasDeCopy } = await import(
    '@/lib/aprendizado/sinal-de-copy-do-plano'
  )

  const limpeza: Array<() => Promise<void>> = []
  const marcoInicial = new Date()

  try {
    const projeto = await db.project.findUniqueOrThrow({
      where: { id: PROJECT_ID },
      select: { id: true, name: true, userId: true },
    })
    console.log(`[e2e] projeto: ${projeto.name} (user interno ${projeto.userId})\n`)

    // ── 0. Taxonomia de teste ────────────────────────────────────────────────
    console.log('0) taxonomia de teste (4 pilares aprovados)')
    for (const [i, p] of PILARES_DE_TESTE.entries()) {
      await db.contentPillar.upsert({
        where: { projectId_slug: { projectId: PROJECT_ID, slug: p.slug } },
        create: { projectId: PROJECT_ID, slug: p.slug, nome: p.nome, ordem: i, aprovado: true, origem: 'humano' },
        update: { nome: p.nome, ordem: i, aprovado: true },
      })
    }
    limpeza.push(async () => {
      await db.contentPillar.deleteMany({
        where: { projectId: PROJECT_ID, slug: { in: PILARES_DE_TESTE.map((p) => p.slug) } },
      })
      console.log('[cleanup] pilares de teste apagados')
    })
    console.log('  ✓ 4 pilares aprovados')

    // ── 1. O retrato de antes ────────────────────────────────────────────────
    const antes = {
      sinais: await db.learningSignal.count({ where: { projectId: PROJECT_ID } }),
      geracoes: await db.generation.count({ where: { projectId: PROJECT_ID } }),
      jobs: await db.generationJob.count({}),
      creditos:
        (await db.creditBalance.findUnique({
          where: { userId: projeto.userId },
          select: { creditsRemaining: true },
        }))?.creditsRemaining ?? null,
      posts: await db.socialPost.count({ where: { projectId: PROJECT_ID } }),
    }
    console.log(
      `\n[antes] sinais=${antes.sinais} generations=${antes.geracoes} jobs=${antes.jobs} créditos=${antes.creditos} posts=${antes.posts}`,
    )

    // ── 2. Montar a semana ───────────────────────────────────────────────────
    console.log('\n1) montar a semana (1ª chamada)')
    const r1 = await proporSemana({
      projectId: PROJECT_ID,
      dias: 7,
      maxItens: 5,
      titulo: 'E2E propor-semana — apagar',
      criadoPor: projeto.userId,
    })
    limpeza.push(async () => {
      await db.planoDeConteudo.deleteMany({ where: { id: r1.plano.id } })
      console.log('[cleanup] plano da 1ª chamada apagado (itens por cascade)')
    })

    console.log(
      `   plano ${r1.plano.id} — ${r1.plano.itens.length} item(ns); cadência ofereceu ${r1.slotsDaCadencia}; semeados ${r1.itensSemeados}`,
    )
    for (const item of r1.plano.itens) {
      console.log(
        `   · ${item.quando?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | ${item.tema ?? 'sem tema'} | via ${item.via} | ${item.motivoDoSlot ?? ''}`,
      )
    }
    if (r1.avisos.length > 0) console.log('   avisos:', r1.avisos)

    conferir('a leva nasceu com itens', r1.plano.itens.length > 0, r1.plano.itens.length)
    conferir(
      'todo item nasce "proposto" — nada foi produzido',
      r1.plano.itens.every((i) => i.status === 'proposto'),
    )
    conferir('a leva ficou persistida', (await lerPlano(PROJECT_ID, r1.plano.id)).itens.length === r1.plano.itens.length)
    conferir('a origem diz de onde veio', r1.plano.origem === 'propor-semana')

    // ── 3. O que NÃO pode ter acontecido ─────────────────────────────────────
    console.log('\n2) nada foi produzido e nada foi cobrado')
    const depois = {
      geracoes: await db.generation.count({ where: { projectId: PROJECT_ID } }),
      jobs: await db.generationJob.count({}),
      creditos:
        (await db.creditBalance.findUnique({
          where: { userId: projeto.userId },
          select: { creditsRemaining: true },
        }))?.creditsRemaining ?? null,
      posts: await db.socialPost.count({ where: { projectId: PROJECT_ID } }),
    }
    conferir('nenhuma Generation foi criada', depois.geracoes === antes.geracoes, {
      antes: antes.geracoes,
      depois: depois.geracoes,
    })
    conferir('nenhum GenerationJob foi enfileirado', depois.jobs === antes.jobs, {
      antes: antes.jobs,
      depois: depois.jobs,
    })
    conferir('nenhum crédito saiu', depois.creditos === antes.creditos, {
      antes: antes.creditos,
      depois: depois.creditos,
    })
    conferir('nenhum post foi criado (proposta não agenda)', depois.posts === antes.posts, {
      antes: antes.posts,
      depois: depois.posts,
    })

    // ── 4. Assunto por item: variedade ───────────────────────────────────────
    console.log('\n3) o assunto de cada item')
    const temas = r1.plano.itens.map((i) => i.tema).filter((t): t is string => !!t)
    conferir('todo item recebeu um assunto', temas.length === r1.plano.itens.length, temas)
    const ate4 = temas.slice(0, PILARES_DE_TESTE.length)
    conferir(
      'nenhum assunto se repete enquanto há pilar não usado',
      new Set(ate4).size === ate4.length,
      ate4,
    )
    conferir(
      'os assuntos saem da taxonomia aprovada',
      temas.every((t) => PILARES_DE_TESTE.some((p) => p.nome === t)),
      temas,
    )

    // ── 5. O vínculo com a sugestão de horário ───────────────────────────────
    console.log('\n4) cada item carrega o sinal do horário que o originou')
    const comSugestao = r1.plano.itens.filter((i) => !!i.sugestaoId)
    conferir(
      'todo item aponta para a sugestão de slot',
      comSugestao.length === r1.plano.itens.length,
      `${comSugestao.length}/${r1.plano.itens.length}`,
    )
    const sinaisDeSlot = await db.learningSignal.findMany({
      where: { id: { in: comSugestao.map((i) => i.sugestaoId!) } },
      select: { id: true, tipo: true, sugeridoEm: true, desfecho: true, servico: true },
    })
    conferir(
      'os sinais apontados existem, são de slot e estão EM ABERTO',
      sinaisDeSlot.length === comSugestao.length &&
        sinaisDeSlot.every((s) => s.tipo === 'slot' && !!s.sugeridoEm && s.desfecho === null),
      sinaisDeSlot,
    )

    // ── 6. Cold start rotulado ───────────────────────────────────────────────
    console.log('\n5) o cold start (ou a rotina) sai rotulado com honestidade')
    if (r1.coldStart) {
      console.log('   [caminho] este cliente não tem rotina na janela — grade-semente')
      conferir(
        'todo item semeado diz que é ponto de partida',
        r1.plano.itens.every((i) => (i.motivoDoSlot ?? '').includes(ROTULO_DE_COLD_START)),
        r1.plano.itens.map((i) => i.motivoDoSlot),
      )
      conferir(
        'a resposta avisa em português que é ponto de partida',
        r1.mensagem.toLowerCase().includes('ponto de partida') &&
          r1.avisos.some((a) => a.includes(ROTULO_DE_COLD_START)),
        { mensagem: r1.mensagem, avisos: r1.avisos },
      )
      conferir(
        'o motivo NÃO inventa estatística sobre o cliente',
        r1.plano.itens.every((i) => !/costuma|ocasi|\dx/i.test(i.motivoDoSlot ?? '')),
        r1.plano.itens.map((i) => i.motivoDoSlot),
      )
    } else {
      console.log('   [caminho] este cliente tem rotina — motivos vindos da cadência')
      conferir(
        'todo item explica o horário',
        r1.plano.itens.every((i) => (i.motivoDoSlot ?? '').length > 0),
        r1.plano.itens.map((i) => i.motivoDoSlot),
      )
      conferir(
        'nenhum item foi rotulado como ponto de partida',
        r1.plano.itens.every((i) => !(i.motivoDoSlot ?? '').includes(ROTULO_DE_COLD_START)),
      )
    }

    // ── 7. Montar de novo NÃO duplica sinal ──────────────────────────────────
    console.log('\n6) montar de novo não duplica sinal de aprendizado')
    const sinaisApos1 = await db.learningSignal.count({ where: { projectId: PROJECT_ID } })
    console.log(`   sinais: ${antes.sinais} → ${sinaisApos1} (a 1ª chamada emitiu ${sinaisApos1 - antes.sinais})`)

    const r2 = await proporSemana({
      projectId: PROJECT_ID,
      dias: 7,
      maxItens: 5,
      titulo: 'E2E propor-semana (2ª) — apagar',
      criadoPor: projeto.userId,
    })
    limpeza.push(async () => {
      await db.planoDeConteudo.deleteMany({ where: { id: r2.plano.id } })
      console.log('[cleanup] plano da 2ª chamada apagado (itens por cascade)')
    })

    const sinaisApos2 = await db.learningSignal.count({ where: { projectId: PROJECT_ID } })
    conferir(
      'a 2ª montagem não gravou nenhum sinal novo',
      sinaisApos2 === sinaisApos1,
      { apos1: sinaisApos1, apos2: sinaisApos2 },
    )
    conferir(
      'a 2ª montagem propõe os MESMOS horários',
      r2.plano.itens.map((i) => i.quando?.toISOString()).join('|') ===
        r1.plano.itens.map((i) => i.quando?.toISOString()).join('|'),
      { r1: r1.plano.itens.map((i) => i.quando), r2: r2.plano.itens.map((i) => i.quando) },
    )
    conferir(
      'os itens da 2ª leva apontam para os MESMOS sinais de horário',
      r2.plano.itens.map((i) => i.sugestaoId).join('|') === r1.plano.itens.map((i) => i.sugestaoId).join('|'),
    )

    // ── 7b. Cold start, no cliente que ainda não tem rotina ──────────────────
    console.log('\n6b) cold start: cliente sem rotina e sem acervo')
    for (const [i, p] of PILARES_DE_TESTE.entries()) {
      await db.contentPillar.upsert({
        where: { projectId_slug: { projectId: PROJETO_SEM_ROTINA, slug: p.slug } },
        create: {
          projectId: PROJETO_SEM_ROTINA,
          slug: p.slug,
          nome: p.nome,
          ordem: i,
          aprovado: true,
          origem: 'humano',
        },
        update: { nome: p.nome, ordem: i, aprovado: true },
      })
    }
    limpeza.push(async () => {
      await db.contentPillar.deleteMany({
        where: { projectId: PROJETO_SEM_ROTINA, slug: { in: PILARES_DE_TESTE.map((p) => p.slug) } },
      })
      await db.learningSignal.deleteMany({
        where: { projectId: PROJETO_SEM_ROTINA, createdAt: { gte: marcoInicial } },
      })
      console.log('[cleanup] pilares e sinais do cliente sem rotina apagados')
    })

    const frio = await proporSemana({
      projectId: PROJETO_SEM_ROTINA,
      dias: 7,
      maxItens: 5,
      titulo: 'E2E cold start — apagar',
      criadoPor: projeto.userId,
    })
    limpeza.push(async () => {
      await db.planoDeConteudo.deleteMany({ where: { id: frio.plano.id } })
      console.log('[cleanup] plano do cold start apagado')
    })
    for (const item of frio.plano.itens) {
      console.log(
        `   · ${item.quando?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} | ${item.tema ?? 'sem tema'} | ${item.motivoDoSlot ?? ''}`,
      )
    }
    console.log('   avisos:', frio.avisos)

    conferir('o cold start foi reconhecido', frio.coldStart === true)
    conferir('a leva-semente tem itens', frio.plano.itens.length === 5, frio.plano.itens.length)
    conferir(
      'todo item semeado diz que é ponto de partida',
      frio.plano.itens.every((i) => (i.motivoDoSlot ?? '').includes(ROTULO_DE_COLD_START)),
      frio.plano.itens.map((i) => i.motivoDoSlot),
    )
    conferir(
      'a resposta avisa, em português, que é ponto de partida',
      frio.mensagem.toLowerCase().includes('ponto de partida') &&
        frio.avisos.some((a) => a.includes(ROTULO_DE_COLD_START)),
      { mensagem: frio.mensagem, avisos: frio.avisos },
    )
    conferir(
      'o motivo NÃO inventa estatística sobre o cliente',
      frio.plano.itens.every((i) => !/costuma|ocasi|\dx/i.test(i.motivoDoSlot ?? '')),
      frio.plano.itens.map((i) => i.motivoDoSlot),
    )
    const temasFrios = frio.plano.itens.map((i) => i.tema)
    conferir(
      'assunto diferente em cada post enquanto há pilar livre',
      new Set(temasFrios.slice(0, PILARES_DE_TESTE.length)).size === PILARES_DE_TESTE.length,
      temasFrios,
    )
    conferir(
      'acervo indisponível vira AVISO, não erro',
      frio.avisos.some((a) => a.toLowerCase().includes('acervo')),
      frio.avisos,
    )
    conferir(
      'os horários semeados foram registrados como sugestão',
      frio.plano.itens.every((i) => !!i.sugestaoId),
      frio.plano.itens.map((i) => i.sugestaoId),
    )
    const sinaisFrios = await db.learningSignal.count({ where: { projectId: PROJETO_SEM_ROTINA } })
    const frio2 = await proporSemana({
      projectId: PROJETO_SEM_ROTINA,
      dias: 7,
      maxItens: 5,
      titulo: 'E2E cold start (2ª) — apagar',
      criadoPor: projeto.userId,
    })
    limpeza.push(async () => {
      await db.planoDeConteudo.deleteMany({ where: { id: frio2.plano.id } })
      console.log('[cleanup] plano do cold start (2ª) apagado')
    })
    conferir(
      'semear duas vezes não duplica sinal',
      (await db.learningSignal.count({ where: { projectId: PROJETO_SEM_ROTINA } })) === sinaisFrios,
    )

    // ── 7c. A copy proposta fecha como DESFECHO, não como decisão nova ───────
    //
    // É o ponto onde a contagem dupla nasceria: o card manda a copy no "Gerar",
    // e um item que recebeu dica precisa FECHAR aquela proposta em vez de abrir
    // uma escolha absoluta. Com a dica de copy ainda em esqueleto, o caminho é
    // exercitado plantando a proposta à mão — o que importa é a máquina.
    console.log('\n6c) a copy proposta fecha por comparação, não por declaração')
    const itemComDica = r1.plano.itens[0]
    const ancora = itemComDica.sugestaoId ?? undefined
    const propostos = ['NOITE DE CORTES', 'Terça a domingo, das 18h']
    const registrados = await registrarDicasDeCopy({
      projectId: PROJECT_ID,
      servico: 'propor-semana',
      versao: 'propor-semana-v1/e2e',
      dicas: [{ ancora: ancora ?? '', blocos: propostos, tema: itemComDica.tema }],
    })
    conferir('a dica de copy foi registrada como sugestão emitida', registrados.size === 1, [...registrados])

    const igual = await fecharDicaDeCopyDoItem({
      projectId: PROJECT_ID,
      itemDePlanoId: itemComDica.id,
      copyFinal: [...propostos],
    })
    conferir('copy usada como veio fecha a dica', igual === 'fechada', igual)
    const sinalDaCopy = await db.learningSignal.findFirst({
      where: { projectId: PROJECT_ID, tipo: 'copy', createdAt: { gte: marcoInicial } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, desfecho: true, sugeridoEm: true },
    })
    conferir(
      'o desfecho gravado é "aceita-como-veio" e a proposta continua sendo proposta',
      sinalDaCopy?.desfecho === 'aceita-como-veio' && !!sinalDaCopy?.sugeridoEm,
      sinalDaCopy,
    )

    const editada = await fecharDicaDeCopyDoItem({
      projectId: PROJECT_ID,
      itemDePlanoId: itemComDica.id,
      copyFinal: ['NOITE DE CORTES', 'Terça a sábado, das 19h'],
    })
    conferir('copy editada depois REVISA o desfecho', editada === 'fechada', editada)
    conferir(
      'evidência mais forte sobrescreve: virou "editada"',
      (
        await db.learningSignal.findUnique({
          where: { id: sinalDaCopy!.id },
          select: { desfecho: true },
        })
      )?.desfecho === 'editada',
    )

    const semDica = await fecharDicaDeCopyDoItem({
      projectId: PROJETO_SEM_ROTINA,
      itemDePlanoId: frio.plano.itens[1].id,
      copyFinal: ['ESCRITA NA MÃO'],
    })
    conferir('item sem dica devolve "sem-dica" (a rota cai na escolha absoluta)', semDica === 'sem-dica', semDica)

    const umaLinhaSo = await db.learningSignal.count({
      where: { projectId: PROJECT_ID, tipo: 'copy', createdAt: { gte: marcoInicial } },
    })
    conferir('a mesma copy virou UMA linha, não duas com sentidos opostos', umaLinhaSo === 1, umaLinhaSo)

    // ── 8. Higiene: o plano é arquivável e o projeto é o dono ────────────────
    console.log('\n7) higiene')
    const arquivado = await arquivarPlano(PROJECT_ID, r2.plano.id)
    conferir('a leva pode ser encerrada', arquivado.status === 'arquivado')
    const deOutroProjeto = await lerPlano(PROJECT_ID + 1, r1.plano.id).catch((e) =>
      e instanceof CreativeError ? e.code : String(e),
    )
    conferir('a leva de outro cliente é 404', deOutroProjeto === 'PLANO_NAO_ENCONTRADO', deOutroProjeto)
  } finally {
    console.log('')
    // Os sinais gravados DURANTE o teste — só os deste projeto e desta janela.
    limpeza.push(async () => {
      const apagados = await db.learningSignal.deleteMany({
        where: { projectId: PROJECT_ID, createdAt: { gte: marcoInicial } },
      })
      console.log(`[cleanup] ${apagados.count} sinal(is) de aprendizado do teste apagados`)
    })
    for (const passo of limpeza.reverse()) {
      await passo().catch((e) => console.error('[cleanup] falhou:', e))
    }
    await db.$disconnect()
  }

  console.log(falhas === 0 ? '\n✅ tudo certo' : `\n❌ ${falhas} conferência(s) falharam`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('\n💥 o teste explodiu:', error)
  process.exit(1)
})
