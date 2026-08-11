/**
 * E2E do plano de conteúdo (F3, fatia A1) — pelo SERVIÇO, contra o banco.
 *
 * As rotas exigem sessão do Clerk, então quem é exercitado aqui é
 * `src/lib/planos/plano-service.ts` — o mesmo código que as rotas e as tools do
 * MCP embrulham. É o protocolo que a casa já usa (`.tmp-test-improve-e2e.ts`):
 * o teste importa o serviço e roda o caminho real, sem HTTP.
 *
 * Protocolo de segurança:
 *  - projeto 8 (Lagosta Criativa), post `publishType: REMINDER` e +7 dias — o
 *    executor ignora REMINDER em todas as filas, então nada chega ao Zernio;
 *  - cleanup completo no fim, inclusive quando algo falha no meio;
 *  - 🔴 recusa rodar contra PRODUÇÃO (ver `garantirBancoDeDev` abaixo).
 *
 * USO
 *   npx tsx scripts/dev-db.ts npx tsx scripts/validar-plano-f3.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// `errors.ts` não tem dependência nenhuma — importar estático aqui é seguro.
// `@/lib/db` e o serviço, não: eles abrem conexão no import, e por isso só
// entram DEPOIS do guard, por import dinâmico dentro do `main()`.
import { CreativeError } from '@/lib/creatives/errors'

const PROJECT_ID = 8

/**
 * 🔴 O guard que falta quando alguém roda o script "na mão".
 *
 * `npx tsx scripts/validar-plano-f3.ts` sem o runner carrega o `.env`, que
 * aponta para PRODUÇÃO — e este script ESCREVE. O `scripts/dev-db.ts` já
 * recusa produção, mas ele só protege quem lembra de usá-lo; a mesma comparação
 * repetida aqui protege quem não lembrou.
 *
 * A comparação é pelo COMPUTE (primeiro rótulo do host, sem o sufixo
 * `-pooler`), nunca pelo host inteiro: `ep-x-pooler.…` e `ep-x.…` são a MESMA
 * instância, e comparar host deixaria passar a URL direta de produção.
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
      console.error('  Rode assim:  npx tsx scripts/dev-db.ts npx tsx scripts/validar-plano-f3.ts\n')
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

/** Roda algo que DEVE falhar e devolve o código do erro de domínio. */
async function codigoDoErro(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (error) {
    return error instanceof CreativeError ? error.code : `erro inesperado: ${String(error)}`
  }
}

function emBRT(offsetDias: number, hora: string): string {
  const d = new Date(Date.now() + offsetDias * 24 * 3600_000)
  const dia = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return `${dia} ${hora}`
}

function apenasDia(offsetDias: number): string {
  const d = new Date(Date.now() + offsetDias * 24 * 3600_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

async function main() {
  // Import DEPOIS do guard: `@/lib/db` abre conexão já no import do módulo.
  const { db } = await import('@/lib/db')
  const {
    arquivarPlano,
    atualizarItem,
    criarPlano,
    lerPlano,
    listarPlanos,
    planoAtivo,
    transicionarItem,
  } = await import('@/lib/planos/plano-service')

  const limpeza: Array<() => Promise<void>> = []

  try {
    const projeto = await db.project.findUniqueOrThrow({
      where: { id: PROJECT_ID },
      select: { id: true, name: true, userId: true },
    })
    console.log(`[e2e] projeto: ${projeto.name} (user interno ${projeto.userId})\n`)

    // ── 1. Criar a leva: 3 itens (2 template, 1 ia) ─────────────────────────
    console.log('1) criar plano com 3 itens')
    const { plano, avisos } = await criarPlano({
      projectId: PROJECT_ID,
      titulo: 'E2E F3 — apagar',
      inicio: apenasDia(7),
      fim: apenasDia(13),
      origem: 'propor-semana',
      versao: 'plano-v1',
      criadoPor: projeto.userId,
      itens: [
        {
          quando: emBRT(7, '11:30'),
          tema: 'almoço executivo',
          copyProposta: ['ALMOÇO EXECUTIVO', 'Terça a sexta'],
          formato: 'story',
          via: 'template',
          sourcePageId: 'pagina-de-teste-e2e',
          motivoDoSlot: 'terça 11:30 é horário típico deste cliente',
        },
        {
          quando: emBRT(9, '19:00'),
          tema: 'happy hour',
          copyProposta: ['HAPPY HOUR'],
          formato: 'feed',
          via: 'template',
          escopo: 'campanha',
          campaignId: 'campanha-inexistente-de-proposito',
        },
        {
          // Fora da janela DE PROPÓSITO: tem de virar AVISO, nunca erro.
          quando: emBRT(20, '20:00'),
          tema: 'peça de IA',
          copyProposta: ['NOITE DE VINHOS'],
          formato: 'quadrado',
          via: 'ia',
        },
      ],
    })
    limpeza.push(async () => {
      await db.planoDeConteudo.deleteMany({ where: { id: plano.id } })
      console.log('[cleanup] plano (e itens, por cascade) apagado')
    })

    conferir('o plano nasceu com 3 itens', plano.itens.length === 3)
    conferir('todo item nasce "proposto"', plano.itens.every((i) => i.status === 'proposto'))
    conferir(
      'a via padrão é template e a de IA foi respeitada',
      plano.itens.filter((i) => i.via === 'template').length === 2 &&
        plano.itens.filter((i) => i.via === 'ia').length === 1,
    )
    conferir('o escopo de aprendizado é por item', plano.itens[1].escopo === 'CAMPANHA')
    conferir(
      'item fora da janela vira AVISO, não erro',
      avisos.length === 1 && avisos[0].includes('fora da janela'),
      avisos,
    )
    conferir('o progresso agregado é legível', plano.progresso.frase === '3 propostas', plano.progresso.frase)

    // ── 2. Ler ──────────────────────────────────────────────────────────────
    console.log('\n2) ler o plano')
    const lido = await lerPlano(PROJECT_ID, plano.id)
    conferir('lerPlano devolve os itens em ordem', lido.itens.map((i) => i.ordem).join(',') === '0,1,2')

    const ativo = await planoAtivo(PROJECT_ID)
    conferir('planoAtivo encontra a leva', ativo?.id === plano.id)

    const lista = await listarPlanos(PROJECT_ID, { status: 'ativo', limite: 5 })
    conferir('listarPlanos traz a leva com o total', lista.some((p) => p.id === plano.id && p.totalDeItens === 3))

    const deOutroProjeto = await codigoDoErro(() => lerPlano(PROJECT_ID + 1, plano.id))
    conferir('plano de outro cliente é 404, não 403', deOutroProjeto === 'PLANO_NAO_ENCONTRADO', deOutroProjeto)

    // ── 3. Editar um item proposto ──────────────────────────────────────────
    console.log('\n3) editar um item proposto')
    const alvo = lido.itens[0]
    const editado = await atualizarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: alvo.id,
      patch: { copyProposta: ['ALMOÇO EXECUTIVO', 'R$ 49,90'], quando: emBRT(8, '11:00') },
      decididoPor: projeto.userId,
    })
    conferir('a copy mudou', editado.item.copyProposta.join('|') === 'ALMOÇO EXECUTIVO|R$ 49,90')
    conferir('editar devolve o item a "editado"', editado.item.status === 'editado')
    conferir('horário dentro da janela não gera aviso', editado.avisos.length === 0, editado.avisos)

    const foraDaJanela = await atualizarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: alvo.id,
      patch: { quando: emBRT(30, '11:00') },
    })
    conferir('horário fora da janela avisa e grava', foraDaJanela.avisos.length === 1, foraDaJanela.avisos)
    await atualizarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: alvo.id,
      patch: { quando: emBRT(8, '11:00') },
    })

    const itemDeOutroPlano = await codigoDoErro(() =>
      atualizarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: 'item-que-nao-existe', patch: { tema: 'x' } }),
    )
    conferir('item inexistente é 404', itemDeOutroPlano === 'ITEM_NAO_ENCONTRADO', itemDeOutroPlano)

    // ── 4. Recusar edição de item que já está gerando ───────────────────────
    console.log('\n4) recusar edição de item em geração')
    await transicionarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: alvo.id, para: 'aprovado' })
    await transicionarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: alvo.id, para: 'na-fila' })
    await transicionarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: alvo.id, para: 'gerando' })

    const recusa = await codigoDoErro(() =>
      atualizarItem({
        projectId: PROJECT_ID,
        planoId: plano.id,
        itemId: alvo.id,
        patch: { copyProposta: ['NÃO PODE'] },
      }),
    )
    conferir('item gerando recusa edição', recusa === 'ITEM_NAO_EDITAVEL', recusa)

    const voltaAtras = await codigoDoErro(() =>
      transicionarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: alvo.id, para: 'editado' }),
    )
    conferir('transição para trás é recusada', voltaAtras === 'TRANSICAO_INVALIDA', voltaAtras)

    // ── 5. Uma arte e um post REAIS, para o item apontar ────────────────────
    console.log('\n5) arte + post (REMINDER, +7 dias — nada chega ao Zernio)')
    const template = await db.template.findFirstOrThrow({
      where: { projectId: PROJECT_ID },
      select: { id: true },
    })
    const generation = await db.generation.create({
      data: {
        templateId: template.id,
        projectId: PROJECT_ID,
        status: 'COMPLETED',
        fieldValues: { source: 'e2e-plano-f3' },
        templateName: 'E2E F3 — apagar',
        projectName: projeto.name,
        createdBy: projeto.userId,
        resultUrl: 'https://exemplo.invalido/e2e-f3.png',
      },
    })
    limpeza.push(async () => {
      await db.generation.deleteMany({ where: { id: generation.id } })
      console.log('[cleanup] generation de teste apagada')
    })

    const post = await db.socialPost.create({
      data: {
        projectId: PROJECT_ID,
        userId: projeto.userId,
        postType: 'STORY',
        caption: 'E2E F3 — apagar',
        mediaUrls: ['https://exemplo.invalido/e2e-f3.png'],
        scheduleType: 'SCHEDULED',
        scheduledDatetime: new Date(Date.now() + 7 * 24 * 3600_000),
        status: 'SCHEDULED',
        publishType: 'REMINDER',
        generationId: generation.id,
        renderStatus: 'NOT_NEEDED',
      },
    })
    limpeza.push(async () => {
      await db.postLog.deleteMany({ where: { postId: post.id } }).catch(() => null)
      await db.postRetry.deleteMany({ where: { postId: post.id } }).catch(() => null)
      await db.socialPost.deleteMany({ where: { id: post.id } })
      console.log('[cleanup] post de teste apagado')
    })
    console.log(`   generation ${generation.id} / post ${post.id}`)

    const pronto = await transicionarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: alvo.id,
      para: 'pronto',
      generationId: generation.id,
    })
    conferir('gerando → pronto grava a arte', pronto.status === 'pronto' && pronto.generationId === generation.id)

    const agendado = await transicionarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: alvo.id,
      para: 'agendado',
      postId: post.id,
    })
    conferir('pronto → agendado grava o post', agendado.status === 'agendado' && agendado.postId === post.id)

    const depoisDeAgendado = await codigoDoErro(() =>
      transicionarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: alvo.id, para: 'na-fila' }),
    )
    conferir('agendado é terminal', depoisDeAgendado === 'TRANSICAO_INVALIDA', depoisDeAgendado)

    // ── 6. Reprovar com motivo não é beco ───────────────────────────────────
    console.log('\n6) reprovar com motivo, e voltar')
    const outro = lido.itens[1]
    const reprovado = await transicionarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: outro.id,
      para: 'reprovado',
      motivo: 'a foto não é do salão real',
    })
    conferir('o motivo da reprovação fica gravado', reprovado.motivoReprovacao === 'a foto não é do salão real')
    const corrigido = await atualizarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: outro.id,
      patch: { tema: 'happy hour (corrigido)' },
    })
    conferir('reprovado volta a ser editável', corrigido.item.status === 'editado')

    // ── 7. Arquivar: edição recusa, transição continua ──────────────────────
    console.log('\n7) arquivar a leva')
    const arquivado = await arquivarPlano(PROJECT_ID, plano.id)
    conferir('o plano ficou arquivado', arquivado.status === 'arquivado')
    conferir('planoAtivo já não devolve esta leva', (await planoAtivo(PROJECT_ID))?.id !== plano.id)

    const edicaoEmArquivado = await codigoDoErro(() =>
      atualizarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: outro.id, patch: { tema: 'x' } }),
    )
    conferir('plano arquivado recusa edição de item', edicaoEmArquivado === 'PLANO_ARQUIVADO', edicaoEmArquivado)

    const terceiro = lido.itens[2]
    await transicionarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: terceiro.id, para: 'aprovado' })
    await transicionarItem({ projectId: PROJECT_ID, planoId: plano.id, itemId: terceiro.id, para: 'na-fila' })
    const emVoo = await transicionarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: terceiro.id,
      para: 'erro',
      erro: 'a geração falhou no teste',
    })
    conferir(
      'geração em voo termina mesmo com o plano arquivado',
      emVoo.status === 'erro' && emVoo.erro === 'a geração falhou no teste',
    )
    const retomado = await transicionarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: terceiro.id,
      para: 'na-fila',
    })
    conferir('sair do erro limpa a mensagem antiga', retomado.erro === null)

    // ── 8. Cascade: apagar o plano leva os itens, e MAIS NADA ───────────────
    console.log('\n8) apagar o plano (cascade) sem tocar no que ele produziu')
    await db.planoDeConteudo.delete({ where: { id: plano.id } })

    const itensRestantes = await db.itemDePlano.count({ where: { planoId: plano.id } })
    conferir('os itens foram junto (FK com cascade)', itensRestantes === 0, itensRestantes)

    const postVivo = await db.socialPost.findUnique({ where: { id: post.id }, select: { id: true } })
    conferir('o POST apontado sobreviveu (sem FK)', postVivo?.id === post.id)

    const arteViva = await db.generation.findUnique({ where: { id: generation.id }, select: { id: true } })
    conferir('a ARTE apontada sobreviveu (sem FK)', arteViva?.id === generation.id)

    const planoSumiu = await codigoDoErro(() => lerPlano(PROJECT_ID, plano.id))
    conferir('o plano apagado é 404', planoSumiu === 'PLANO_NAO_ENCONTRADO', planoSumiu)
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
