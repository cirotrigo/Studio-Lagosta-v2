/**
 * Executar um plano de conteúdo (F3) — o ÚNICO ponto da fatia que gasta.
 *
 * Tudo o mais no plano é intenção: montar a leva, editar item, reprovar com
 * motivo. Aqui a intenção vira arte, e por isso o gate de crédito é mecânico:
 * a primeira chamada **não produz nada** e devolve a conta; só a segunda, com
 * `confirmar: true`, toca.
 *
 * As duas vias não se parecem, e é de propósito:
 *
 *  - **`ia`** vai para a FILA DURÁVEL (F0.3). O MCP só enfileira, nunca
 *    dispara: lá uma invocação carrega várias tools (o batch JSON-RPC resolve
 *    com `Promise.all`) e disparar N gerações sob o mesmo `maxDuration` é
 *    exatamente o que a fila veio matar. Quem executa é
 *    `/api/cron/generation-jobs`, de minuto em minuto.
 *  - **`template`** renderiza AQUI, em sequência. Não existe `GenerationJobKind`
 *    para render de modelo e criar um seria migration — mas o render é barato
 *    (zero chamada paga) e cabe na invocação. O que não cabe fica para a
 *    próxima chamada, e a resposta SEMPRE diz quantos ficaram: teto de
 *    cobertura que não aparece no relato é teto que mente.
 *
 * Um item que falha não derruba os outros (`executados[]` / `falhas[]`, como em
 * `upload-creative`).
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { getFeatureCost } from '@/lib/credits/settings'
import { createArteRapida } from '@/lib/creatives/arte-rapida'
import { startArtGeneration } from '@/lib/ai/creative-generation-service'
import { enfileirarArte } from '@/lib/ai/generation-queue'
import { lerCamadas } from '@/lib/posts/page-layers'
import { MENOS_USADO_PRIMEIRO } from '@/lib/aprendizado/uso-de-modelo'
import { lerPlano, transicionarItem, atualizarItem, statusDoItem } from '@/lib/planos/plano-service'
import { progressoDoPlano, type StatusDoItem, type ViaDoItem } from '@/lib/planos/vocabulario'
import {
  ORCAMENTO_DE_RENDER_MS,
  cabeMaisUmRender,
  caminhoAte,
  calcularConta,
  decidirGeracao,
  ehRecusa,
  itemExecutavel,
  mapearCopyParaSlots,
  motivoDeNaoExecutar,
  type CampoDeTexto,
  type ContaDaExecucao,
} from '@/lib/planos/execucao'

export interface ExecutarPlanoInput {
  projectId: number
  planoId: string
  /** Subconjunto da leva. Vazio/ausente = todos os itens executáveis. */
  itemIds?: string[]
  /** Sem isto, NADA acontece: a resposta é só a conta. */
  confirmar?: boolean
  /** Quem paga — id do CLERK (`user_…`). */
  actorClerkId: string
  /**
   * `User.id` INTERNO de quem paga, só para LER o saldo.
   *
   * 🔴 Nunca use `getUserCredits`/`getUserFromClerkId` aqui: os dois CRIAM o
   * User quando ele não existe, e é exatamente assim que nascem os "Users
   * fantasma" que já existem neste banco. Ler saldo é leitura.
   */
  donoUserId?: string | null
  /** `User.id` INTERNO de quem decidiu — auditoria, nunca o clerkId. */
  decididoPor?: string | null
  /** Só para teste: encurta o orçamento de tempo do render em sequência. */
  orcamentoMs?: number
}

export interface ItemExecutado {
  itemId: string
  tema: string | null
  via: ViaDoItem
  situacao: StatusDoItem
  generationId?: string
  pageId?: string
  arte?: string
  /** O que o chat precisa repassar (copy que não coube, foto não aplicada…). */
  avisos?: string[]
}

export interface ItemComFalha {
  itemId: string
  tema: string | null
  via: ViaDoItem
  motivo: string
}

export interface ItemIgnorado {
  itemId: string
  tema: string | null
  motivo: string
}

export interface ResultadoDaExecucao {
  planoId: string
  titulo: string | null
  conta: ContaDaExecucao
  /** Presente só na PRIMEIRA chamada — é o gate. */
  confirmacaoNecessaria?: true
  mensagem: string
  executados: ItemExecutado[]
  falhas: ItemComFalha[]
  ignorados: ItemIgnorado[]
  /** Itens de modelo que não couberam no tempo desta chamada. */
  faltaram?: number
  progresso?: ReturnType<typeof progressoDoPlano>
  avisos?: string[]
}

type ItemDoPlano = Awaited<ReturnType<typeof lerPlano>>['itens'][number]

/**
 * O que a produção de UM item precisa saber do chamador — subconjunto de
 * `ExecutarPlanoInput`, para a rota da bancada (que produz um item por vez)
 * não ter de inventar campos que não usa.
 */
interface ContextoDeProducao {
  projectId: number
  planoId: string
  decididoPor?: string | null
}

/** Saldo de créditos por LEITURA — `null` quando não há linha ou não deu. */
async function lerSaldo(donoUserId: string | null | undefined): Promise<number | null> {
  if (!donoUserId) return null
  try {
    const linha = await db.creditBalance.findUnique({
      where: { userId: donoUserId },
      select: { creditsRemaining: true },
    })
    return linha ? linha.creditsRemaining : null
  } catch (erro) {
    console.error('[planos] não deu para ler o saldo de créditos:', erro)
    return null
  }
}

export async function executarPlano(input: ExecutarPlanoInput): Promise<ResultadoDaExecucao> {
  const plano = await lerPlano(input.projectId, input.planoId)

  const pedidos = (input.itemIds ?? []).map((id) => String(id).trim()).filter(Boolean)
  const pedidosSet = new Set(pedidos)
  const avisos: string[] = []

  if (pedidos.length > 0) {
    const existentes = new Set(plano.itens.map((i) => i.id))
    const desconhecidos = pedidos.filter((id) => !existentes.has(id))
    if (desconhecidos.length > 0) {
      avisos.push(`${desconhecidos.length} item(ns) pedidos não existem neste plano e foram ignorados.`)
    }
  }

  const candidatos = pedidos.length > 0 ? plano.itens.filter((i) => pedidosSet.has(i.id)) : plano.itens

  const elegiveis: ItemDoPlano[] = []
  const ignorados: ItemIgnorado[] = []
  let emVoo = 0
  for (const item of candidatos) {
    const situacao = statusDoItem(item)
    /**
     * Carrossel não passa por aqui: a série exige a confirmação HUMANA do
     * estilo entre o guia e os irmãos ("gerar seis slides no estilo errado
     * custa seis vezes mais que perguntar"), e este executor é justamente o
     * caminho sem gente no meio. Quem gera a série é a bancada — o item fica
     * na fila da equipe, com o motivo dito.
     */
    if ((item as { slides?: unknown }).slides) {
      ignorados.push({
        itemId: item.id,
        tema: item.tema,
        motivo: 'Carrossel se produz pela bancada — o estilo do guia precisa da confirmação de alguém.',
      })
      continue
    }
    if (itemExecutavel(situacao)) {
      elegiveis.push(item)
      continue
    }
    if (situacao === 'na-fila' || situacao === 'gerando') emVoo += 1
    ignorados.push({ itemId: item.id, tema: item.tema, motivo: motivoDeNaoExecutar(situacao) })
  }

  if (emVoo > 0) {
    // A reconciliação é de `ver-plano`, não daqui: executar não pode mexer na
    // situação de item que não vai tocar. Mas quem chamou precisa saber que a
    // situação em mãos pode estar velha — arte que já falhou volta a ser
    // executável assim que o plano for lido.
    avisos.push(
      `${emVoo} item(ns) ainda constam em produção. Use ver-plano para atualizar a situação — o que já terminou sai da fila e o que falhou volta a poder ser produzido.`,
    )
  }

  const custoUnitario = await getFeatureCost('ai_art_generation')
  const saldo = await lerSaldo(input.donoUserId)
  const conta = calcularConta({
    itens: elegiveis.map((i) => ({ id: i.id, via: (i.via as ViaDoItem) ?? 'template' })),
    custoUnitario,
    saldo,
  })

  // ── 1ª chamada: a conta, e mais nada ──────────────────────────────────────
  if (!input.confirmar) {
    return {
      planoId: plano.id,
      titulo: plano.titulo,
      conta,
      confirmacaoNecessaria: true,
      mensagem:
        elegiveis.length === 0
          ? 'Não há item para produzir agora. Nada foi feito e nada foi cobrado.'
          : `${conta.resumo} Nada foi produzido ainda: mostre esta conta à pessoa e só chame de novo com confirmar: true depois do sim dela.`,
      executados: [],
      falhas: [],
      ignorados,
      ...(avisos.length > 0 ? { avisos } : {}),
    }
  }

  // ── 2ª chamada: executa ───────────────────────────────────────────────────
  const executados: ItemExecutado[] = []
  const falhas: ItemComFalha[] = []
  const orcamento = input.orcamentoMs ?? ORCAMENTO_DE_RENDER_MS
  const comecou = Date.now()

  // A IA primeiro: enfileirar custa milissegundos, e assim um corte por tempo
  // só atinge o render de modelo — que é o trabalho barato de retomar.
  const porIA = elegiveis.filter((i) => i.via === 'ia')
  const porModelo = elegiveis.filter((i) => i.via !== 'ia')

  let semCredito = false
  for (const item of porIA) {
    if (semCredito) {
      falhas.push({
        itemId: item.id,
        tema: item.tema,
        via: 'ia',
        motivo: 'Não há crédito suficiente para produzir esta arte.',
      })
      continue
    }
    try {
      const executado = await enfileirarItemDeIA(item, input)
      executados.push(executado)
    } catch (erro) {
      const motivo = mensagemDoErro(erro)
      if (erro instanceof CreativeError && erro.code === 'CREDITOS_INSUFICIENTES') semCredito = true
      falhas.push({ itemId: item.id, tema: item.tema, via: 'ia', motivo })
      await marcarErro(input, item, motivo)
    }
  }

  let faltaram = 0
  for (const item of porModelo) {
    if (!cabeMaisUmRender(Date.now() - comecou, orcamento)) {
      faltaram += 1
      continue
    }
    try {
      const executado = await renderizarItemDeModelo(item, input)
      executados.push(executado)
    } catch (erro) {
      const motivo = mensagemDoErro(erro)
      falhas.push({ itemId: item.id, tema: item.tema, via: 'template', motivo })
      await marcarErro(input, item, motivo)
    }
  }

  const depois = await lerPlano(input.projectId, input.planoId)

  return {
    planoId: plano.id,
    titulo: plano.titulo,
    conta,
    mensagem: frasearExecucao(executados.length, falhas.length, faltaram),
    executados,
    falhas,
    ignorados,
    ...(faltaram > 0 ? { faltaram } : {}),
    progresso: depois.progresso,
    ...(avisos.length > 0 ? { avisos } : {}),
  }
}

function frasearExecucao(feitos: number, falhou: number, faltaram: number): string {
  const partes: string[] = []
  partes.push(feitos === 1 ? '1 arte encaminhada' : `${feitos} artes encaminhadas`)
  if (falhou > 0) partes.push(falhou === 1 ? '1 falhou' : `${falhou} falharam`)
  let frase = `${partes.join(', ')}.`
  if (faltaram > 0) {
    frase +=
      ` ${faltaram} ${faltaram === 1 ? 'item ficou' : 'itens ficaram'} para depois — não coube no tempo desta chamada.` +
      ' Chame executar-plano de novo com confirmar: true para continuar de onde parou.'
  }
  return frase
}

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof CreativeError) return erro.message
  if (erro instanceof Error) return erro.message
  return String(erro)
}

/**
 * Move a situação do item, caminhando quando não há transição direta.
 *
 * Nunca lança: o registro da situação é contabilidade do plano, e a arte que
 * acabou de nascer não pode sumir porque a coluna não pôde ser escrita.
 */
async function mover(
  input: ContextoDeProducao,
  item: ItemDoPlano,
  para: StatusDoItem,
  extras: { erro?: string; generationId?: string; pageId?: string } = {},
): Promise<StatusDoItem> {
  const de = statusDoItem(item)
  const passos = caminhoAte(de, para)
  if (!passos || passos.length === 0) return de
  try {
    for (const passo of passos) {
      await transicionarItem({
        projectId: input.projectId,
        planoId: input.planoId,
        itemId: item.id,
        para: passo,
        decididoPor: input.decididoPor ?? undefined,
        // Os vínculos e o motivo só acompanham o passo FINAL — um `na-fila`
        // intermediário não é o momento em que a arte apareceu.
        ...(passo === para
          ? {
              erro: extras.erro,
              generationId: extras.generationId,
              pageId: extras.pageId,
            }
          : {}),
      })
    }
    return para
  } catch (erro) {
    console.error(`[planos] não deu para mover o item ${item.id} para "${para}":`, erro)
    return de
  }
}

async function marcarErro(input: ContextoDeProducao, item: ItemDoPlano, motivo: string): Promise<void> {
  await mover(input, item, 'erro', { erro: motivo })
}

/**
 * Item de IA: cria a Generation, põe na fila e marca o item como "na fila".
 *
 * 🔴 **Não chama `dispararJobAgora`.** A regra da casa é literal: as rotas HTTP
 * enfileiram E disparam; o MCP SÓ enfileira, porque lá uma invocação carrega
 * várias tools. `confirmar-estilo-carrossel` dispara até 6 e foi esse o caso
 * que fez a fila durável existir.
 */
async function enfileirarItemDeIA(item: ItemDoPlano, input: ExecutarPlanoInput): Promise<ItemExecutado> {
  const pedido = decidirGeracao({
    tema: item.tema,
    copyProposta: item.copyProposta,
    fotoUrl: item.fotoUrl,
    fotoDriveId: item.fotoDriveId,
  })
  if (ehRecusa(pedido)) {
    throw new CreativeError('ITEM_INCOMPLETO', pedido.motivo, 400)
  }

  // O id do Drive tem precedência sobre a URL: é o que `buscar-fotos` devolve e
  // o que sobrevive à troca de host do Blob. A URL só entra quando é a única.
  const foto = item.fotoDriveId?.trim()
    ? { driveFileId: item.fotoDriveId.trim() }
    : item.fotoUrl?.trim()
      ? { url: item.fotoUrl.trim() }
      : null

  const started = await startArtGeneration({
    projectId: input.projectId,
    track: pedido.trilha,
    pedido: pedido.pedido || undefined,
    copy: pedido.copy.length > 0 ? pedido.copy : undefined,
    formato: (item.formato as 'story' | 'feed' | 'quadrado') ?? 'story',
    referencias: foto ? [{ role: pedido.papelDaFoto, ...foto }] : [],
    actorClerkId: input.actorClerkId,
    // Mesma janela de `gerar-imagem`: o modelo repetindo a tool no chat não
    // pode virar segunda cobrança.
    dedupeWindowMinutes: 10,
  })

  if (!started.reused && started.runnerArgs) {
    await enfileirarArte(started.runnerArgs)
  }

  const situacao = await mover(input, item, 'na-fila', { generationId: started.jobGenerationId })

  return {
    itemId: item.id,
    tema: item.tema,
    via: 'ia',
    situacao,
    generationId: started.jobGenerationId,
    ...(started.reused ? { avisos: ['Já havia uma geração idêntica em andamento — esta reaproveita aquela.'] } : {}),
  }
}

/** O `Template.type` que corresponde a cada formato de item. */
const TIPO_POR_FORMATO: Record<string, 'STORY' | 'FEED' | 'SQUARE'> = {
  story: 'STORY',
  feed: 'FEED',
  quadrado: 'SQUARE',
}

/**
 * O modelo pela ROTAÇÃO da casa: o menos usado primeiro (`MENOS_USADO_PRIMEIRO`,
 * com `nulls: 'first'` — em Postgres `ASC` é NULLS LAST e o nunca-usado tem de
 * vir antes), restrito ao formato do item. `null` quando o cliente não tem
 * modelo nenhum nesse formato.
 */
export async function modeloPorRotacao(
  projectId: number,
  formato: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  const tipo = TIPO_POR_FORMATO[(formato ?? 'story').trim().toLowerCase()] ?? 'STORY'
  return db.page.findFirst({
    where: { isTemplate: true, Template: { projectId, type: tipo } },
    orderBy: MENOS_USADO_PRIMEIRO,
    select: { id: true, name: true },
  })
}

/**
 * Item de modelo: monta a arte agora, em cima da página-modelo do cliente.
 *
 * Sem `sourcePageId` no item, quem escolhe é a ROTAÇÃO (o modelo menos usado
 * do formato) — a escolha explícita é da pessoa, na bancada ou no chat; a
 * ausência dela nunca mais é beco (era SEM_MODELO seco até 13/08/2026). O
 * modelo rotacionado sai em `avisos`, para quem pediu saber o que foi usado.
 *
 * `createArteRapida` já conta o uso do modelo (`registrarUsoDeModelo`) e fecha
 * a sugestão de modelo e de foto, DEPOIS de a arte existir — contar aqui de
 * novo dobraria o contador e mentiria sobre a preferência do cliente.
 */
async function renderizarItemDeModelo(
  item: ItemDoPlano,
  input: ContextoDeProducao,
): Promise<ItemExecutado> {
  let sourcePageId = item.sourcePageId?.trim()
  let avisoDeRotacao: string | null = null
  if (!sourcePageId) {
    const rotacao = await modeloPorRotacao(input.projectId, item.formato)
    if (!rotacao) {
      throw new CreativeError(
        'SEM_MODELO',
        'Este item não tem modelo escolhido e o cliente não tem modelo cadastrado neste formato — escolha um modelo ou mude a via para IA.',
        400,
      )
    }
    sourcePageId = rotacao.id
    avisoDeRotacao = `Modelo escolhido pela rotação (o menos usado do formato): "${rotacao.name}".`
  }

  const campos = await camposDeTextoDoModelo(sourcePageId)
  const { slotValues, avisos } = mapearCopyParaSlots(campos, item.copyProposta ?? [])

  const valores: Record<string, unknown> = { ...slotValues }
  if (item.fotoDriveId?.trim()) valores._driveImageId = item.fotoDriveId.trim()

  const arte = await createArteRapida({
    projectId: input.projectId,
    sourcePageId,
    slotValues: valores,
    ...(item.fotoUrl?.trim() ? { imageUrl: item.fotoUrl.trim() } : {}),
    ...(item.tema ? { name: `${item.tema} — plano` } : {}),
    decididoPor: input.decididoPor ?? null,
  })

  const situacao = await mover(input, item, 'pronto', {
    generationId: arte.generationId,
    pageId: arte.pageId,
  })

  const todos = [
    ...(avisoDeRotacao ? [avisoDeRotacao] : []),
    ...avisos,
    ...(arte.imageWarning ? [arte.imageWarning] : []),
    ...(arte.avisos ?? []),
  ]
  return {
    itemId: item.id,
    tema: item.tema,
    via: 'template',
    situacao,
    generationId: arte.generationId,
    pageId: arte.pageId,
    arte: arte.url,
    ...(todos.length > 0 ? { avisos: todos } : {}),
  }
}

// ── Um item por vez: o caminho da bancada ───────────────────────────────────

export interface GerarItemPorModeloInput {
  projectId: number
  planoId: string
  itemId: string
  /**
   * A escolha feita na tela — vence o que está gravado no item e fica
   * PERSISTIDA nele, para o chat e os outros navegadores verem a mesma
   * decisão. Ausente/nula = o que o item já tem, e sem nada a rotação decide.
   */
  sourcePageId?: string | null
  /** `User.id` INTERNO de quem decidiu — auditoria, nunca o clerkId. */
  decididoPor?: string | null
}

/**
 * Monta UM item do plano sobre um modelo do cliente — o "Gerar" da via
 * template na bancada, que até 13/08/2026 não existia (o card mandava gerar
 * por IA "mesmo assim", com preço, ou esperar o executar-plano do chat).
 *
 * Render síncrono na invocação, como no executar-plano: zero chamada paga de
 * imagem. A falha MARCA o item como erro antes de propagar — a equipe vê o
 * motivo em qualquer navegador, não só no card de quem clicou.
 */
export async function gerarItemPorModelo(input: GerarItemPorModeloInput): Promise<ItemExecutado> {
  const plano = await lerPlano(input.projectId, input.planoId)
  const item = plano.itens.find((i) => i.id === input.itemId)
  if (!item) {
    throw new CreativeError('ITEM_NAO_ENCONTRADO', 'Este item não existe neste plano.', 404)
  }
  if ((item as { slides?: unknown }).slides) {
    throw new CreativeError(
      'CARROSSEL_SEM_MODELO',
      'Carrossel não é montado sobre modelo — a série nasce por IA, slide a slide.',
      400,
    )
  }
  const situacao = statusDoItem(item)
  if (!itemExecutavel(situacao)) {
    throw new CreativeError(
      'ITEM_NAO_EXECUTAVEL',
      `Não dá para produzir agora: ${motivoDeNaoExecutar(situacao)}.`,
      409,
    )
  }

  /**
   * A escolha da tela e a via corrigida ficam no ITEM antes do render: é o que
   * faz o plano contar qual caminho as pessoas realmente usam (mesma razão do
   * `via: 'ia'` que o Gerar por IA relata) — e o que deixa a escolha visível
   * aos outros navegadores mesmo se o render logo abaixo falhar.
   */
  const escolhido = input.sourcePageId?.trim() || null
  const patch: { sourcePageId?: string; via?: 'template' } = {}
  if (escolhido && escolhido !== item.sourcePageId?.trim()) patch.sourcePageId = escolhido
  if ((item.via ?? 'template') !== 'template') patch.via = 'template'

  let atual: ItemDoPlano = item
  if (Object.keys(patch).length > 0) {
    const r = await atualizarItem({
      projectId: input.projectId,
      planoId: input.planoId,
      itemId: input.itemId,
      patch,
      decididoPor: input.decididoPor ?? undefined,
    })
    atual = { ...item, ...r.item }
  }

  const ctx: ContextoDeProducao = {
    projectId: input.projectId,
    planoId: input.planoId,
    decididoPor: input.decididoPor ?? null,
  }
  try {
    return await renderizarItemDeModelo(atual, ctx)
  } catch (erro) {
    await marcarErro(ctx, atual, mensagemDoErro(erro))
    throw erro
  }
}

/**
 * Os campos de texto de uma página-modelo, na ordem em que estão nas camadas.
 *
 * 🔴 A leitura passa por `lerCamadas` (`page-layers.ts`), nunca pelo
 * `parseLayers` de `arte-rapida.ts`: aquele decodifica UM nível e devolve `[]`
 * em silêncio na string dupla-codificada que existe no legado do PageSync —
 * aqui isso viraria "o modelo não tem campo de texto" e a copy inteira do item
 * sumiria da arte sem que ninguém soubesse.
 */
async function camposDeTextoDoModelo(pageId: string): Promise<CampoDeTexto[]> {
  const page = await db.page.findUnique({ where: { id: pageId }, select: { layers: true } })
  if (!page) {
    throw new CreativeError('MODELO_NAO_ENCONTRADO', 'O modelo escolhido para este item não existe mais.', 404)
  }
  const { camadas, legivel } = lerCamadas(page.layers)
  if (!legivel) {
    throw new CreativeError(
      'MODELO_ILEGIVEL',
      'Não consegui ler as camadas do modelo escolhido — abra a arte no editor para conferir.',
      422,
    )
  }
  return camadas
    .filter((c) => c?.type === 'text')
    .map((c) => ({ layerId: String(c.id ?? ''), name: typeof c.name === 'string' ? c.name : null }))
    .filter((c) => !!c.layerId)
}
