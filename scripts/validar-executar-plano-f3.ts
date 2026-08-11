/**
 * E2E da execução do plano de conteúdo (F3, fatia A2) — pelo SERVIÇO.
 *
 * As rotas do MCP exigem OAuth, então quem é exercitado aqui é o que as tools
 * embrulham: `executar-plano.ts`, `reconciliar.ts` e `regenerar.ts` — o mesmo
 * código, sem HTTP. É o protocolo da casa (`validar-plano-f3.ts`,
 * `.tmp-test-improve-e2e.ts`).
 *
 * O que este script PROVA:
 *  1. a 1ª chamada de `executarPlano` devolve a conta e **não executa nada** —
 *     nenhuma Generation nasce, nenhum job entra na fila, nenhum crédito sai;
 *  2. o corte por orçamento de tempo deixa o item intacto e o CONTA no relato;
 *  3. a 2ª chamada, com `confirmar: true`, ENFILEIRA o item de IA (Generation
 *     PROCESSING + GenerationJob PENDING) e RENDERIZA o item de modelo;
 *  4. um item que falha não derruba os outros;
 *  5. a reconciliação move a situação lendo a arte — inclusive o caminho
 *     `na-fila → gerando → pronto`, que não tem atalho na tabela;
 *  6. `regenerarItem` grava o motivo e vira sinal de aprendizado nas duas
 *     formas (feedback da arte quando ela existe; item-de-plano quando não).
 *
 * Protocolo de segurança:
 *  - projeto 8 (Lagosta Criativa) e horários a +7 dias. O plano não cria post
 *    nenhum, então nada chega ao Zernio por construção;
 *  - cleanup completo no fim, inclusive quando algo falha no meio: plano,
 *    artes, jobs, páginas, sinais, contador do modelo e o saldo de créditos;
 *  - 🔴 recusa rodar contra PRODUÇÃO (ver `garantirBancoDeDev`).
 *
 * USO
 *   npx tsx scripts/dev-db.ts npx tsx scripts/validar-executar-plano-f3.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// `errors.ts` não tem dependência nenhuma — importar estático aqui é seguro.
// `@/lib/db` e os serviços, não: abrem conexão no import, e por isso só entram
// DEPOIS do guard, por import dinâmico dentro do `main()`.
import { CreativeError } from '@/lib/creatives/errors'

const PROJECT_ID = 8

/**
 * 🔴 O guard que falta quando alguém roda o script "na mão".
 *
 * `npx tsx scripts/validar-executar-plano-f3.ts` sem o runner carrega o `.env`,
 * que aponta para PRODUÇÃO — e este script ESCREVE (e gasta crédito). A
 * comparação é pelo COMPUTE (primeiro rótulo do host, sem o sufixo `-pooler`),
 * nunca pelo host inteiro: `ep-x-pooler.…` e `ep-x.…` são a MESMA instância.
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
      console.error('  Rode assim:  npx tsx scripts/dev-db.ts npx tsx scripts/validar-executar-plano-f3.ts\n')
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

function emBRT(offsetDias: number, hora: string): string {
  const d = new Date(Date.now() + offsetDias * 24 * 3600_000)
  const dia = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return `${dia} ${hora}`
}

function apenasDia(offsetDias: number): string {
  const d = new Date(Date.now() + offsetDias * 24 * 3600_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Camada de texto no formato que o editor e o render engine leem. */
function camadaDeTexto(
  id: string,
  nome: string,
  conteudo: string,
  x: number,
  y: number,
  fontSize: number,
) {
  return {
    id,
    type: 'text',
    name: nome,
    visible: true,
    locked: false,
    order: 0,
    content: conteudo,
    position: { x, y },
    size: { width: 800, height: Math.round(fontSize * 1.2 * 2) },
    style: {
      fontSize,
      fontFamily: 'Inter',
      fontWeight: '700',
      fontStyle: 'normal',
      color: '#FFFFFF',
      textAlign: 'left',
      lineHeight: 1.2,
      textTransform: 'none',
    },
    textboxConfig: {
      textMode: 'auto-wrap-fixed',
      autoWrap: { lineHeight: 1.2, breakMode: 'word', autoExpand: false },
    },
  }
}

async function main() {
  const { db } = await import('@/lib/db')
  const { criarPlano, lerPlano } = await import('@/lib/planos/plano-service')
  const { executarPlano } = await import('@/lib/planos/executar-plano')
  const { reconciliarPlano } = await import('@/lib/planos/reconciliar')
  const { regenerarItem } = await import('@/lib/planos/regenerar')
  const { chaveDoFeedbackDeArte } = await import('@/lib/aprendizado/feedback-de-arte')

  const limpeza: Array<() => Promise<void>> = []

  try {
    const projeto = await db.project.findUniqueOrThrow({
      where: { id: PROJECT_ID },
      select: { id: true, name: true, userId: true },
    })
    const dono = await db.user.findUniqueOrThrow({
      where: { id: projeto.userId },
      select: { id: true, clerkId: true },
    })
    console.log(`[e2e] projeto: ${projeto.name} (dono interno ${dono.id})`)

    // ── Modelo do cliente para a via template ───────────────────────────────
    //
    // Preferimos um modelo REAL do cliente — é o que o caminho de produção usa.
    // Sem nenhum (o branch de dev é copy-on-write e envelhece), o teste monta o
    // seu, com duas camadas de texto, e o apaga no fim. Depender de dado que
    // pode não existir tornaria este e2e flaky por motivo errado.
    const existente = await db.page.findFirst({
      where: { isTemplate: true, Template: { projectId: PROJECT_ID, type: 'STORY' } },
      select: { id: true, name: true, usedCount: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    })

    let modelo: { id: string; name: string; usedCount: number; lastUsedAt: Date | null }
    if (existente) {
      modelo = existente
      console.log(`[e2e] modelo do cliente: ${modelo.name} (${modelo.id})`)
      limpeza.push(async () => {
        await db.page.updateMany({
          where: { id: modelo.id },
          data: { usedCount: modelo.usedCount, lastUsedAt: modelo.lastUsedAt },
        })
        console.log('[cleanup] contador de uso do modelo restaurado')
      })
    } else {
      const template = await db.template.create({
        data: {
          name: 'E2E F3/A2 — modelo de teste',
          type: 'STORY',
          dimensions: '1080x1920',
          projectId: PROJECT_ID,
          createdBy: dono.id,
          designData: {} as never,
          dynamicFields: [] as never,
          tags: ['e2e'],
        },
      })
      const criado = await db.page.create({
        data: {
          name: 'E2E F3/A2 — página de teste',
          width: 1080,
          height: 1920,
          isTemplate: true,
          templateId: template.id,
          background: '#101010',
          tags: ['almoco-executivo'],
          layers: [
            camadaDeTexto('titulo', 'Título', 'TÍTULO DO MODELO', 140, 700, 96),
            camadaDeTexto('apoio', 'Apoio', 'linha de apoio do modelo', 140, 900, 48),
          ] as never,
        },
        select: { id: true, name: true, usedCount: true, lastUsedAt: true },
      })
      modelo = criado
      console.log(`[e2e] modelo criado para o teste: ${modelo.id} (será apagado)`)
      limpeza.push(async () => {
        await db.template.deleteMany({ where: { id: template.id } })
        console.log('[cleanup] modelo de teste (e a página dele) apagado')
      })
    }

    // ── Saldo: garante que dá para pagar a arte de IA, e devolve depois ─────
    const saldoAntes = await db.creditBalance.findUnique({
      where: { userId: dono.id },
      select: { creditsRemaining: true },
    })
    if (saldoAntes && saldoAntes.creditsRemaining < 50) {
      await db.creditBalance.update({
        where: { userId: dono.id },
        data: { creditsRemaining: 50 },
      })
      limpeza.push(async () => {
        await db.creditBalance.update({
          where: { userId: dono.id },
          data: { creditsRemaining: saldoAntes.creditsRemaining },
        })
        console.log('[cleanup] saldo de créditos restaurado')
      })
      console.log(`[e2e] saldo de dev elevado de ${saldoAntes.creditsRemaining} para 50 (será restaurado)`)
    }
    const saldoNoComeco =
      (await db.creditBalance.findUnique({ where: { userId: dono.id }, select: { creditsRemaining: true } }))
        ?.creditsRemaining ?? null

    const artesAntes = await db.generation.count({ where: { projectId: PROJECT_ID } })
    const jobsAntes = await db.generationJob.count({ where: { projectId: PROJECT_ID } })

    // ── 1. A leva ───────────────────────────────────────────────────────────
    console.log('\n1) montar a leva: 1 por modelo, 1 por IA, 1 quebrado de propósito')
    const { plano } = await criarPlano({
      projectId: PROJECT_ID,
      titulo: 'E2E F3/A2 — apagar',
      inicio: apenasDia(7),
      fim: apenasDia(13),
      origem: 'chat',
      criadoPor: dono.id,
      itens: [
        {
          quando: emBRT(7, '11:30'),
          tema: 'almoço executivo e2e',
          copyProposta: ['ALMOÇO EXECUTIVO', 'de terça a sexta'],
          formato: 'story',
          via: 'template',
          sourcePageId: modelo.id,
          motivoDoSlot: 'horário típico deste cliente',
        },
        {
          quando: emBRT(8, '18:00'),
          // Sem copy de propósito: cai na trilha `imagem`, que é a única que
          // não exige uma foto real do acervo — o teste não pode depender de
          // um arquivo específico existir no Drive deste banco.
          tema: 'salão no fim da tarde, luz quente e mesas postas',
          formato: 'story',
          via: 'ia',
        },
        {
          quando: emBRT(9, '19:00'),
          tema: 'item sem modelo (falha esperada)',
          copyProposta: ['HAPPY HOUR'],
          formato: 'story',
          via: 'template',
          // sourcePageId ausente DE PROPÓSITO
        },
      ],
    })
    limpeza.push(async () => {
      await db.planoDeConteudo.deleteMany({ where: { id: plano.id } })
      console.log('[cleanup] plano (e itens, por cascade) apagado')
    })

    const [itemModelo, itemIA, itemQuebrado] = plano.itens
    conferir('a leva nasceu com 3 itens propostos', plano.itens.every((i) => i.status === 'proposto'))

    // ── 2. A conta, sem executar nada ───────────────────────────────────────
    console.log('\n2) primeira chamada: a conta, e MAIS NADA')
    const conta = await executarPlano({
      projectId: PROJECT_ID,
      planoId: plano.id,
      actorClerkId: dono.clerkId,
      donoUserId: dono.id,
    })

    conferir('a resposta pede confirmação', conta.confirmacaoNecessaria === true)
    conferir('a conta separa IA de modelo', conta.conta.porIA === 1 && conta.conta.porModelo === 2, conta.conta)
    conferir(
      'a conta mostra o saldo lido do banco',
      conta.conta.saldo === saldoNoComeco,
      { conta: conta.conta.saldo, banco: saldoNoComeco },
    )
    conferir('nada foi produzido', conta.executados.length === 0 && conta.falhas.length === 0)
    conferir(
      '🔴 nenhuma arte nasceu',
      (await db.generation.count({ where: { projectId: PROJECT_ID } })) === artesAntes,
    )
    conferir(
      '🔴 nenhum job entrou na fila',
      (await db.generationJob.count({ where: { projectId: PROJECT_ID } })) === jobsAntes,
    )
    conferir(
      '🔴 nenhum crédito saiu',
      ((await db.creditBalance.findUnique({ where: { userId: dono.id }, select: { creditsRemaining: true } }))
        ?.creditsRemaining ?? null) === saldoNoComeco,
    )
    const aindaPropostos = await lerPlano(PROJECT_ID, plano.id)
    conferir('os itens continuam propostos', aindaPropostos.itens.every((i) => i.status === 'proposto'))

    // ── 3. Corte por orçamento de tempo ─────────────────────────────────────
    console.log('\n3) orçamento de tempo estourado: o item fica para depois, e isso é DITO')
    const cortado = await executarPlano({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemIds: [itemModelo.id],
      confirmar: true,
      actorClerkId: dono.clerkId,
      donoUserId: dono.id,
      orcamentoMs: 0,
    })
    conferir('o item ficou para depois', cortado.faltaram === 1, cortado.faltaram)
    conferir('a mensagem convida a chamar de novo', cortado.mensagem.includes('executar-plano de novo'), cortado.mensagem)
    const aposCorte = await lerPlano(PROJECT_ID, plano.id)
    conferir(
      'o item cortado não foi tocado',
      aposCorte.itens.find((i) => i.id === itemModelo.id)?.status === 'proposto',
    )

    // ── 4. Execução de verdade ──────────────────────────────────────────────
    console.log('\n4) segunda chamada com confirmar: true (isto gera arte de verdade)')
    const feito = await executarPlano({
      projectId: PROJECT_ID,
      planoId: plano.id,
      confirmar: true,
      actorClerkId: dono.clerkId,
      donoUserId: dono.id,
      decididoPor: dono.id,
    })
    console.log(`   → ${feito.mensagem}`)

    const executadoIA = feito.executados.find((e) => e.itemId === itemIA.id)
    const executadoModelo = feito.executados.find((e) => e.itemId === itemModelo.id)
    const falhouQuebrado = feito.falhas.find((f) => f.itemId === itemQuebrado.id)

    if (executadoIA?.generationId) {
      const idIA = executadoIA.generationId
      limpeza.push(async () => {
        await db.generationJob.deleteMany({ where: { generationId: idIA } })
        await db.generation.deleteMany({ where: { id: idIA } })
        console.log('[cleanup] arte de IA e job apagados')
      })
    }
    if (executadoModelo?.generationId) {
      const idArte = executadoModelo.generationId
      const idPagina = executadoModelo.pageId
      limpeza.push(async () => {
        await db.generation.deleteMany({ where: { id: idArte } })
        if (idPagina) await db.page.deleteMany({ where: { id: idPagina } })
        console.log('[cleanup] arte de modelo e página apagadas')
      })
    }

    conferir('o item de IA foi encaminhado', !!executadoIA?.generationId, feito.falhas)
    conferir('o item de IA ficou "na fila"', executadoIA?.situacao === 'na-fila', executadoIA?.situacao)

    const arteIA = executadoIA?.generationId
      ? await db.generation.findUnique({
          where: { id: executadoIA.generationId },
          select: { status: true, projectId: true },
        })
      : null
    conferir('🔴 a arte de IA está PROCESSING', arteIA?.status === 'PROCESSING', arteIA?.status)

    const job = executadoIA?.generationId
      ? await db.generationJob.findUnique({
          where: { generationId: executadoIA.generationId },
          select: { status: true, kind: true, attempts: true },
        })
      : null
    conferir('🔴 existe GenerationJob PENDING para ela', job?.status === 'PENDING', job)
    conferir('o job é de geração de ARTE e ainda não foi tentado', job?.kind === 'ARTE' && job?.attempts === 0, job)

    conferir('o item de modelo foi renderizado na hora', executadoModelo?.situacao === 'pronto', executadoModelo)
    conferir('a arte de modelo tem imagem', !!executadoModelo?.arte, executadoModelo?.arte)
    conferir(
      'o uso do modelo foi contado uma vez só',
      (await db.page.findUnique({ where: { id: modelo.id }, select: { usedCount: true } }))?.usedCount ===
        modelo.usedCount + 1,
    )

    conferir('o item quebrado falhou sozinho, sem derrubar os outros', !!falhouQuebrado, feito.falhas)
    conferir('a falha explica o que faltou', !!falhouQuebrado?.motivo.includes('modelo'), falhouQuebrado?.motivo)
    const aposExecucao = await lerPlano(PROJECT_ID, plano.id)
    conferir(
      'o item quebrado ficou marcado como falho',
      aposExecucao.itens.find((i) => i.id === itemQuebrado.id)?.status === 'erro',
    )
    conferir(
      '🔴 nenhum crédito saiu ainda (a cobrança é do runner, quando a arte sai)',
      ((await db.creditBalance.findUnique({ where: { userId: dono.id }, select: { creditsRemaining: true } }))
        ?.creditsRemaining ?? null) === saldoNoComeco,
    )

    // ── 5. Reconciliação ────────────────────────────────────────────────────
    console.log('\n5) reconciliação: o plano descobre sozinho o que a arte virou')
    if (!executadoIA?.generationId) {
      conferir('a reconciliação pôde ser testada', false, 'o item de IA não foi encaminhado')
    } else {
      const idIA = executadoIA.generationId

      // (a) a arte falhou
      await db.generation.update({
        where: { id: idIA },
        data: { status: 'FAILED', fieldValues: { error: 'O modelo recusou o pedido.' } as never },
      })
      const r1 = await reconciliarPlano(PROJECT_ID, plano.id)
      const depoisDaFalha = await lerPlano(PROJECT_ID, plano.id)
      const itemDepoisDaFalha = depoisDaFalha.itens.find((i) => i.id === itemIA.id)
      conferir('a falha da arte virou situação do item', itemDepoisDaFalha?.status === 'erro', itemDepoisDaFalha?.status)
      conferir(
        'o motivo veio em português, do registro da run',
        itemDepoisDaFalha?.erro === 'O modelo recusou o pedido.',
        itemDepoisDaFalha?.erro,
      )
      conferir('a reconciliação relatou o movimento', r1.movidos.length === 1, r1)

      // (b) item de volta em voo, arte concluída: na-fila → gerando → pronto
      await db.itemDePlano.update({ where: { id: itemIA.id }, data: { status: 'na-fila', erro: null } })
      await db.generation.update({ where: { id: idIA }, data: { status: 'COMPLETED' } })
      await reconciliarPlano(PROJECT_ID, plano.id)
      const depoisDoSucesso = await lerPlano(PROJECT_ID, plano.id)
      conferir(
        '🔴 na-fila → pronto foi percorrido (a tabela não tem atalho)',
        depoisDoSucesso.itens.find((i) => i.id === itemIA.id)?.status === 'pronto',
        depoisDoSucesso.itens.find((i) => i.id === itemIA.id)?.status,
      )

      // (c) idempotente: rodar de novo não mexe em nada
      const r3 = await reconciliarPlano(PROJECT_ID, plano.id)
      conferir('rodar de novo não move nada', r3.movidos.length === 0, r3)
    }

    // ── 6. Reprovar com motivo ──────────────────────────────────────────────
    console.log('\n6) regenerar-item: a reprovação vira transição E sinal')
    const motivoDaArte = 'o texto ficou grande demais e cobriu o prato'
    const reprovada = await regenerarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: itemModelo.id,
      motivo: motivoDaArte,
      decididoPor: dono.id,
    })
    conferir('o item voltou para edição', reprovada.situacao === 'editado', reprovada.situacao)
    const itemReprovado = await db.itemDePlano.findUnique({
      where: { id: itemModelo.id },
      select: { motivoReprovacao: true },
    })
    conferir('o motivo ficou guardado no item', itemReprovado?.motivoReprovacao === motivoDaArte, itemReprovado)

    if (executadoModelo?.generationId) {
      const chave = chaveDoFeedbackDeArte(executadoModelo.generationId)
      limpeza.push(async () => {
        await db.learningSignal.deleteMany({ where: { chave } })
        console.log('[cleanup] sinal de feedback da arte apagado')
      })
      const sinal = await db.learningSignal.findUnique({
        where: { chave },
        select: { tipo: true, desfecho: true, escolhido: true, decididoPor: true },
      })
      const escolhido = (sinal?.escolhido ?? {}) as Record<string, unknown>
      conferir('a reprovação de uma arte PRONTA virou feedback dela', sinal?.tipo === 'arte', sinal?.tipo)
      conferir('com o veredito e o motivo', escolhido.veredito === 'melhorar' && escolhido.comentario === motivoDaArte, escolhido)
      conferir('é decisão sem sugestão (fica fora do KPI de aceitação)', sinal?.desfecho === 'escolha-propria')
      conferir('assinada pelo User INTERNO', sinal?.decididoPor === dono.id, sinal?.decididoPor)
    }

    const motivoSemArte = 'esse tema já saiu semana passada'
    await regenerarItem({
      projectId: PROJECT_ID,
      planoId: plano.id,
      itemId: itemQuebrado.id,
      motivo: motivoSemArte,
      voltarPara: 'aprovado',
      decididoPor: dono.id,
    })
    limpeza.push(async () => {
      await db.learningSignal.deleteMany({
        where: { tipo: 'item-de-plano', projectId: PROJECT_ID, chave: { contains: itemQuebrado.id } },
      })
      console.log('[cleanup] sinal de item-de-plano apagado')
    })
    const sinalDoItem = await db.learningSignal.findFirst({
      where: { tipo: 'item-de-plano', chave: { contains: itemQuebrado.id } },
      select: { escolhido: true, desfecho: true, projectId: true },
    })
    const escolhidoDoItem = (sinalDoItem?.escolhido ?? {}) as Record<string, unknown>
    conferir('item SEM arte vira sinal de item-de-plano', !!sinalDoItem, sinalDoItem)
    conferir('com o motivo escrito por gente', escolhidoDoItem.motivo === motivoSemArte, escolhidoDoItem)
    conferir(
      'o item voltou aprovado, pronto para nova tentativa',
      (await db.itemDePlano.findUnique({ where: { id: itemQuebrado.id }, select: { status: true } }))?.status ===
        'aprovado',
    )

    // ── 7. Recusa de reprovar arte em produção ──────────────────────────────
    console.log('\n7) item com arte em produção não pode ser reprovado')
    await db.itemDePlano.update({ where: { id: itemIA.id }, data: { status: 'gerando' } })
    let codigo: string | null = null
    try {
      await regenerarItem({
        projectId: PROJECT_ID,
        planoId: plano.id,
        itemId: itemIA.id,
        motivo: 'não gostei',
      })
    } catch (error) {
      codigo = error instanceof CreativeError ? error.code : `inesperado: ${String(error)}`
    }
    conferir('reprovar no meio da produção é recusado', codigo === 'ITEM_NAO_REPROVAVEL', codigo)
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
