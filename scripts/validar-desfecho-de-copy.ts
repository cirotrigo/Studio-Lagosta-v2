/**
 * E2E do desfecho de copy nas superfícies — pelo SERVIÇO, contra o banco.
 *
 * A PROVA que importa: uma peça nascida de um item de plano tem uma DICA DE
 * COPY em aberto (`propor-semana` a registrou como sugestão emitida). Quando
 * alguém corrige o texto dela — no chat por `ajustar-arte`, no editor pelo
 * autosave —, o que precisa acontecer é o FECHAMENTO daquela proposta, nunca a
 * abertura de uma decisão nova. Duas linhas sobre o mesmo texto, uma delas
 * rotulada "ninguém propôs nada", inflam o denominador do KPI e fazem a taxa de
 * aceitação virar ficção. É o mesmo defeito que a F1 já corrigiu uma vez nos
 * slots (`e3236624`): **um sinal por proposta, nunca dois com rótulos opostos.**
 *
 * As rotas exigem sessão do Clerk, então quem é exercitado aqui é o serviço —
 * `ajustarArte` (o caminho real do chat, com render e Generation de verdade) e
 * `fecharDicaDeCopyDaPagina` (o resolvedor que a rota do editor embrulha).
 *
 * Protocolo de segurança:
 *  - projeto 8 (Lagosta Criativa); nada é agendado nem publicado — o teste não
 *    cria post, e por isso nada chega ao Zernio;
 *  - cleanup completo no fim, inclusive quando algo falha no meio (páginas,
 *    template, plano, Generations, sinais e os PNGs no Blob);
 *  - 🔴 recusa rodar contra PRODUÇÃO (ver `garantirBancoDeDev` abaixo).
 *
 * ⚠️ Não gasta crédito de imagem: `ajustarArte` renderiza no canvas local
 * (napi-rs) e só sobe o PNG para o Blob.
 *
 * USO
 *   npx tsx scripts/dev-db.ts npx tsx scripts/validar-desfecho-de-copy.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ID = 8

/**
 * 🔴 O guard que falta quando alguém roda o script "na mão".
 *
 * `npx tsx scripts/validar-desfecho-de-copy.ts` sem o runner carrega o `.env`,
 * que aponta para PRODUÇÃO — e este script ESCREVE. O `scripts/dev-db.ts` já
 * recusa produção, mas ele só protege quem lembra de usá-lo.
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
      console.error(
        '  Rode assim:  npx tsx scripts/dev-db.ts npx tsx scripts/validar-desfecho-de-copy.ts\n',
      )
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

/** A copy que a dica propôs — e o texto inicial das duas páginas de teste. */
const PROPOSTA = ['NOITE DE CORTES', 'Terça a domingo, das 18h']

function camadasDeTexto(blocos: string[]) {
  return blocos.map((texto, i) => ({
    id: `txt-${i + 1}`,
    type: 'text',
    name: i === 0 ? 'Titulo' : `Apoio ${i}`,
    visible: true,
    locked: false,
    order: i,
    content: texto,
    position: { x: 80, y: 400 + i * 260 },
    size: { width: 920, height: 220 },
    style: {
      fontSize: i === 0 ? 96 : 48,
      fontFamily: 'Arial',
      fontWeight: i === 0 ? '700' : '400',
      color: '#FFFFFF',
      textAlign: 'left',
      lineHeight: 1.1,
    },
    textboxConfig: {
      textMode: 'auto-wrap-fixed',
      autoWrap: { lineHeight: 1.1, breakMode: 'word', autoExpand: false },
    },
  }))
}

async function main() {
  // Import DEPOIS do guard: `@/lib/db` abre conexão já no import do módulo.
  const { db } = await import('@/lib/db')
  const { ajustarArte } = await import('@/lib/creatives/arte-rapida')
  const { criarPlano, arquivarPlano } = await import('@/lib/planos/plano-service')
  const { ancoraDaDica, registrarDicasDeCopy } = await import(
    '@/lib/aprendizado/sinal-de-copy-do-plano'
  )
  const { caiNaEscolhaPropria, fecharDicaDeCopyDaPagina } = await import(
    '@/lib/aprendizado/fechar-copy-por-pagina'
  )
  const { del } = await import('@vercel/blob')

  const limpeza: Array<() => Promise<void>> = []
  const marcoInicial = new Date()
  const blobs: string[] = []

  /** Todo sinal de copy deste projeto criado durante o teste. */
  const sinaisDeCopy = () =>
    db.learningSignal.findMany({
      where: { projectId: PROJECT_ID, tipo: 'copy', createdAt: { gte: marcoInicial } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, chave: true, desfecho: true, sugeridoEm: true, superficie: true, pageId: true },
    })

  try {
    const projeto = await db.project.findUniqueOrThrow({
      where: { id: PROJECT_ID },
      select: { id: true, name: true, userId: true },
    })
    console.log(`[e2e] projeto: ${projeto.name} (user interno ${projeto.userId})\n`)

    // ── 0. Um template e duas artes: uma DE plano, outra sem ─────────────────
    console.log('0) cenário')
    const template = await db.template.create({
      data: {
        name: 'E2E desfecho de copy — apagar',
        type: 'STORY',
        dimensions: '1080x1920',
        designData: { canvas: { width: 1080, height: 1920 } },
        projectId: PROJECT_ID,
        createdBy: projeto.userId,
      },
      select: { id: true },
    })
    limpeza.push(async () => {
      await db.template.delete({ where: { id: template.id } })
      console.log('[cleanup] template de teste apagado (páginas por cascade)')
    })

    const novaPagina = async (nome: string) =>
      db.page.create({
        data: {
          name: nome,
          width: 1080,
          height: 1920,
          background: '#101010',
          layers: camadasDeTexto(PROPOSTA) as never,
          templateId: template.id,
          order: 0,
        },
        select: { id: true },
      })

    const paginaDoPlano = await novaPagina('E2E arte de plano')
    const paginaAvulsa = await novaPagina('E2E arte avulsa')
    console.log(`  · arte de plano: ${paginaDoPlano.id}`)
    console.log(`  · arte avulsa:   ${paginaAvulsa.id}`)

    // A leva: um item ligado à página, como `executar-plano` deixaria.
    const daquiASeteDias = new Date(Date.now() + 7 * 24 * 3600_000)
    const { plano } = await criarPlano({
      projectId: PROJECT_ID,
      titulo: 'E2E desfecho de copy — apagar',
      inicio: new Date(),
      fim: daquiASeteDias,
      origem: 'e2e-desfecho-de-copy',
      criadoPor: projeto.userId,
      itens: [
        {
          ordem: 0,
          quando: daquiASeteDias,
          formato: 'story',
          via: 'template',
          copyProposta: PROPOSTA,
          tema: 'E2E',
        },
      ],
    })
    limpeza.push(async () => {
      await db.planoDeConteudo.deleteMany({ where: { id: plano.id } })
      console.log('[cleanup] plano de teste apagado (itens por cascade)')
    })
    const item = plano.itens[0]
    await db.itemDePlano.update({
      where: { id: item.id },
      data: { pageId: paginaDoPlano.id, status: 'pronto' },
    })

    // A dica EMITIDA — o que `propor-semana` grava depois de montar a leva.
    const ancora = ancoraDaDica({ sugestaoId: item.sugestaoId, quando: item.quando })
    const registradas = await registrarDicasDeCopy({
      projectId: PROJECT_ID,
      servico: 'e2e-desfecho-de-copy',
      versao: 'e2e-v1',
      dicas: [{ ancora: ancora ?? '', blocos: PROPOSTA, tema: 'E2E' }],
    })
    conferir('a dica de copy nasceu como sugestão emitida', registradas.size === 1, [...registradas])
    conferir(
      'e ela é a ÚNICA linha de copy até aqui',
      (await sinaisDeCopy()).length === 1,
      await sinaisDeCopy(),
    )

    // ── 1. Ilegível nunca vira aceitação ─────────────────────────────────────
    console.log('\n1) ilegível não vira aceitação')
    const semLer = await fecharDicaDeCopyDaPagina({
      projectId: PROJECT_ID,
      pageId: paginaDoPlano.id,
      copyFinal: null,
      superficie: 'editor',
    })
    conferir('copy final ilegível devolve "indecisa"', semLer === 'indecisa', semLer)
    conferir('e NÃO autoriza a linha paralela', caiNaEscolhaPropria(semLer) === false)
    const aindaPendente = (await sinaisDeCopy())[0]
    conferir(
      'a proposta continua pendente, sem desfecho inventado',
      aindaPendente.desfecho === null,
      aindaPendente,
    )

    // ── 2. O editor: a copy usada como veio FECHA a dica ─────────────────────
    console.log('\n2) o autosave do editor fecha a dica (não abre decisão nova)')
    const comoVeio = await fecharDicaDeCopyDaPagina({
      projectId: PROJECT_ID,
      pageId: paginaDoPlano.id,
      // O editor manda a copy por NOME de campo — a dica guarda blocos sem nome.
      copyFinal: { Titulo: PROPOSTA[0], 'Apoio 1': PROPOSTA[1] },
      decididoPor: projeto.userId,
      superficie: 'editor',
    })
    conferir('a dica fechou', comoVeio === 'fechada', comoVeio)
    conferir('e o chamador NÃO registra escolha própria', caiNaEscolhaPropria(comoVeio) === false)
    const depoisDoEditor = await sinaisDeCopy()
    conferir(
      'o desfecho calculado é "aceita-como-veio" e a proposta continua sendo proposta',
      depoisDoEditor[0].desfecho === 'aceita-como-veio' && !!depoisDoEditor[0].sugeridoEm,
      depoisDoEditor[0],
    )
    conferir('e continua sendo UMA linha de copy', depoisDoEditor.length === 1, depoisDoEditor)

    // ── 3. A PROVA: `ajustar-arte` mudando o texto de uma arte de plano ──────
    console.log('\n3) ajustar-arte numa arte de plano: UMA linha, desfecho "editada"')
    const ajustada = await ajustarArte({
      projectId: PROJECT_ID,
      pageId: paginaDoPlano.id,
      slotValues: { Titulo: 'NOITE DE CORTES NOBRES' },
      decididoPor: projeto.userId,
    })
    blobs.push(ajustada.url)
    limpeza.push(async () => {
      await db.generation.deleteMany({ where: { id: ajustada.generationId } })
    })
    console.log(`   arte ajustada: ${ajustada.url}`)

    const depoisDoAjuste = await sinaisDeCopy()
    conferir(
      '🔴 o mesmo texto virou UMA linha, não duas com sentidos opostos',
      depoisDoAjuste.length === 1,
      depoisDoAjuste,
    )
    conferir(
      'evidência mais forte sobrescreve: o desfecho virou "editada"',
      depoisDoAjuste[0].desfecho === 'editada',
      depoisDoAjuste[0],
    )
    conferir(
      'e nenhuma linha de "escolha-propria" foi aberta',
      depoisDoAjuste.every((s) => s.desfecho !== 'escolha-propria'),
      depoisDoAjuste,
    )
    conferir(
      'a linha continua sendo a PROPOSTA (tem sugeridoEm), não uma decisão nova',
      !!depoisDoAjuste[0].sugeridoEm,
      depoisDoAjuste[0],
    )

    // ── 4. O caminho SEM plano continua exatamente como era ──────────────────
    console.log('\n4) arte que não veio de leva continua sendo escolha própria')
    const semPlano = await fecharDicaDeCopyDaPagina({
      projectId: PROJECT_ID,
      pageId: paginaAvulsa.id,
      copyFinal: { Titulo: 'QUALQUER COISA' },
      superficie: 'editor',
    })
    conferir('o resolvedor devolve "sem-plano"', semPlano === 'sem-plano', semPlano)
    conferir('e SÓ esse caso autoriza a escolha absoluta', caiNaEscolhaPropria(semPlano) === true)

    const avulsa = await ajustarArte({
      projectId: PROJECT_ID,
      pageId: paginaAvulsa.id,
      slotValues: { Titulo: 'CHOPP GELADO O DIA TODO' },
      decididoPor: projeto.userId,
    })
    blobs.push(avulsa.url)
    limpeza.push(async () => {
      await db.generation.deleteMany({ where: { id: avulsa.generationId } })
    })

    const todos = await sinaisDeCopy()
    const daAvulsa = todos.filter((s) => s.pageId === paginaAvulsa.id)
    conferir('a arte avulsa gerou a sua linha', daAvulsa.length === 1, daAvulsa)
    conferir(
      'e ela é "escolha-propria", sem metade de cima',
      daAvulsa[0]?.desfecho === 'escolha-propria' && !daAvulsa[0]?.sugeridoEm,
      daAvulsa[0],
    )
    conferir('no total: 2 linhas de copy para 2 artes', todos.length === 2, todos)

    // ── 5. Higiene ───────────────────────────────────────────────────────────
    console.log('\n5) higiene')
    const arquivado = await arquivarPlano(PROJECT_ID, plano.id)
    conferir('a leva pode ser encerrada', arquivado.status === 'arquivado')
    const deOutroProjeto = await fecharDicaDeCopyDaPagina({
      projectId: PROJECT_ID + 1,
      pageId: paginaDoPlano.id,
      copyFinal: ['SEQUER OLHA'],
    })
    conferir(
      'página de outro cliente não acha item nenhum',
      deOutroProjeto === 'sem-plano',
      deOutroProjeto,
    )
  } finally {
    console.log('')
    limpeza.push(async () => {
      const apagados = await db.learningSignal.deleteMany({
        where: { projectId: PROJECT_ID, createdAt: { gte: marcoInicial } },
      })
      console.log(`[cleanup] ${apagados.count} sinal(is) de aprendizado do teste apagados`)
    })
    limpeza.push(async () => {
      // Os PNGs do render: pequenos, mas o protocolo é cleanup COMPLETO.
      for (const url of blobs) await del(url).catch(() => {})
      if (blobs.length > 0) console.log(`[cleanup] ${blobs.length} arte(s) apagada(s) do Blob`)
    })
    for (const passo of limpeza.reverse()) {
      await passo().catch((e) => console.error('[cleanup] falhou:', e))
    }
    await db.$disconnect()
  }

  console.log('')
  if (falhas > 0) {
    console.error(`✗ ${falhas} conferência(s) falharam.`)
    process.exit(1)
  }
  console.log('✓ tudo certo: um sinal por proposta, nunca dois com rótulos opostos.')
}

main().catch((erro) => {
  console.error('\n✗ o e2e explodiu:', erro)
  process.exit(1)
})
