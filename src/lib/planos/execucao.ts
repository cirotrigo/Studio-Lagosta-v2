/**
 * Execução de um plano de conteúdo (F3) — o contrato PURO.
 *
 * Aqui moram as decisões que dá para conferir sem banco: a conta de crédito
 * que o gate mostra antes de gastar, o mapeamento da copy do item para os
 * campos do modelo, a trilha de geração que cada item pede, o orçamento de
 * tempo da invocação e a leitura de "o que a arte virou" na reconciliação.
 *
 * ⚠️ Este módulo NÃO importa `@/lib/db` (que **lança no import** sem
 * `DATABASE_URL`) nem nada que o puxe — é o que o torna testável. Mesma razão
 * de `vocabulario.ts`, `page-layers.ts` e `learning-scope.ts`. Quem toca o
 * banco é `executar-plano.ts` e `reconciliar.ts`.
 */

import {
  STATUS_DO_ITEM,
  transicaoPermitida,
  type StatusDoItem,
  type ViaDoItem,
} from '@/lib/planos/vocabulario'

// ── Orçamento de tempo ──────────────────────────────────────────────────────

/**
 * Até quando a execução pode PEGAR mais trabalho síncrono.
 *
 * A rota `/api/mcp` tem `maxDuration = 300`. A via de template renderiza dentro
 * da invocação (não há fila para ela), e um render de story com fontes de
 * projeto leva alguns segundos — a folga de 90s existe para o render que já
 * começou terminar e a resposta ser escrita. É o mesmo raciocínio dos 240/300
 * da reconciliação de catálogos, com folga maior porque aqui o trabalho em voo
 * é gravado no banco só no fim.
 *
 * 🔴 Quem corta por tempo PRECISA dizer quanto ficou de fora. Cortar em
 * silêncio é como o teto de cobertura vira mentira — a resposta sempre traz
 * `faltaram` e o convite para chamar de novo.
 */
export const ORCAMENTO_DE_RENDER_MS = 210_000

/** `true` enquanto ainda cabe começar mais um render nesta invocação. */
export function cabeMaisUmRender(decorridoMs: number, orcamentoMs = ORCAMENTO_DE_RENDER_MS): boolean {
  return decorridoMs < orcamentoMs
}

// ── A conta do gate de crédito ──────────────────────────────────────────────

export interface ItemParaConta {
  id: string
  via: ViaDoItem
}

export interface ContaDaExecucao {
  /** Quantos itens entram nesta execução. */
  total: number
  /** Destes, quantos nascem de uma chamada paga do modelo. */
  porIA: number
  /** E quantos saem de um modelo do cliente — custo de API de imagem ZERO. */
  porModelo: number
  /** Créditos por arte de IA, como o admin configurou hoje. */
  custoUnitario: number
  /** O total estimado. Zero quando a leva inteira é por modelo. */
  creditos: number
  /** `null` quando não deu para ler o saldo — informa, nunca inventa. */
  saldo: number | null
  /** `null` junto com o saldo desconhecido: sem saldo não há veredito. */
  saldoSuficiente: boolean | null
  /** Quanto falta, quando falta. */
  faltam: number
  /** A frase pronta para a pessoa ler antes de dizer sim. */
  resumo: string
}

/**
 * A conta que a PRIMEIRA chamada de `executar-plano` devolve.
 *
 * O custo unitário é o de `ai_art_generation` (a arte com copy, que é o caso
 * normal de um item de plano). A trilha `imagem` — item de IA sem copy — cobra
 * pela tabela do Gemini e pode sair um pouco diferente; por isso o resumo diz
 * "≈" e nunca promete o centavo. Errar para MENOS aqui seria pior: a pessoa
 * confirmaria uma conta que não era a dela.
 *
 * Saldo insuficiente **informa, não explode**: quem decide é quem está
 * conversando, e a recusa de verdade acontece lá na frente, no serviço de
 * geração, que é quem sabe cobrar.
 */
export function calcularConta(entrada: {
  itens: ItemParaConta[]
  custoUnitario: number
  saldo: number | null
}): ContaDaExecucao {
  const porIA = entrada.itens.filter((i) => i.via === 'ia').length
  const porModelo = entrada.itens.length - porIA
  const custoUnitario = Math.max(0, Math.floor(entrada.custoUnitario || 0))
  const creditos = porIA * custoUnitario
  const saldo = typeof entrada.saldo === 'number' && Number.isFinite(entrada.saldo) ? entrada.saldo : null
  const saldoSuficiente = saldo === null ? null : saldo >= creditos
  const faltam = saldo === null ? 0 : Math.max(0, creditos - saldo)

  return {
    total: entrada.itens.length,
    porIA,
    porModelo,
    custoUnitario,
    creditos,
    saldo,
    saldoSuficiente,
    faltam,
    resumo: frasearConta({ total: entrada.itens.length, porIA, porModelo, custoUnitario, creditos, saldo, faltam }),
  }
}

function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`
}

function frasearConta(c: {
  total: number
  porIA: number
  porModelo: number
  custoUnitario: number
  creditos: number
  saldo: number | null
  faltam: number
}): string {
  if (c.total === 0) return 'Nenhum item para produzir.'

  const partes: string[] = []
  if (c.porIA > 0) {
    partes.push(
      `${plural(c.porIA, 'arte', 'artes')} pela IA (≈ ${plural(c.creditos, 'crédito', 'créditos')}, ` +
        `${c.custoUnitario} por arte)`,
    )
  }
  if (c.porModelo > 0) {
    partes.push(`${plural(c.porModelo, 'arte', 'artes')} montadas em modelo do cliente (sem custo)`)
  }

  let frase = `${plural(c.total, 'item', 'itens')}: ${partes.join(' e ')}.`

  if (c.creditos === 0) {
    frase += ' Esta leva não gasta crédito nenhum.'
    return frase
  }
  if (c.saldo === null) {
    frase += ' Não consegui ler o saldo de créditos deste cliente.'
    return frase
  }
  frase += ` Saldo hoje: ${plural(c.saldo, 'crédito', 'créditos')}`
  frase += c.faltam > 0 ? ` — faltam ${c.faltam}.` : '.'
  return frase
}

// ── A copy do item nos campos do modelo ─────────────────────────────────────

/** O que a página-modelo oferece para receber texto. */
export interface CampoDeTexto {
  layerId: string
  name?: string | null
}

export interface MapaDeCopy {
  /** Pronto para o `slotValues` de `createArteRapida` (chave = id da camada). */
  slotValues: Record<string, string>
  /**
   * Camadas de texto do modelo que a copy NÃO cobriu — para OCULTAR na arte.
   * Deixá-las com o texto do modelo publicava placeholder como se fosse
   * conteúdo ("TERÇA A SEXTA…" numa peça que nem fala de horário — relatado
   * pelo Ciro em 13/08/2026).
   */
  ocultar: string[]
  /** O que quem chamou precisa repassar — nunca derruba a leva. */
  avisos: string[]
}

/**
 * Casa a copy do item com os campos de texto do modelo, POSICIONALMENTE.
 *
 * ⚠️ Simplificação conhecida: o item guarda `copyProposta` como uma lista de
 * blocos (headline, apoio, CTA) e o modelo tem campos com nome próprio
 * ("Pré-título", "Rodapé"). Casar por posição acerta o caso normal — a copy é
 * escrita olhando os campos que `escolher-modelo` devolveu, na mesma ordem —
 * e erra quando alguém reordena a copy sem olhar o modelo. Casar por NOME
 * exigiria que a copy carregasse o nome do campo, o que é uma mudança de
 * contrato do item (F3/B).
 *
 * Contagem diferente NUNCA derruba o item: preenche o que couber e avisa. Um
 * bloco a mais é copy que não aparece; um campo a mais é OCULTADO — o texto
 * do modelo é placeholder, e publicá-lo mentia na peça. A exceção é o item
 * SEM texto nenhum: aí a arte sai inteira com os textos do modelo, que é o
 * único conteúdo que existe.
 *
 * A chave é o `layerId` e não o nome: nome se repete entre camadas (o próprio
 * `textosDaPagina` desempata com `#2`), e `createArteRapida` casa por id ou
 * nome — com id não há ambiguidade.
 */
export function mapearCopyParaSlots(campos: CampoDeTexto[], copy: string[]): MapaDeCopy {
  const blocos = (copy ?? [])
    .filter((b): b is string => typeof b === 'string')
    .map((b) => b.trim())
    .filter(Boolean)
  const alvos = (campos ?? []).filter((c) => c && typeof c.layerId === 'string' && c.layerId)

  const slotValues: Record<string, string> = {}
  const ocultar: string[] = []
  const avisos: string[] = []

  if (blocos.length === 0) {
    if (alvos.length > 0) {
      avisos.push('Este item não tem texto próprio — a arte sai com os textos que já estão no modelo.')
    }
    return { slotValues, ocultar, avisos }
  }

  if (alvos.length === 0) {
    avisos.push(
      `O modelo escolhido não tem campo de texto para receber a copy — ${plural(blocos.length, 'bloco', 'blocos')} ` +
        'não ficaram na arte.',
    )
    return { slotValues, ocultar, avisos }
  }

  const usados = Math.min(blocos.length, alvos.length)
  for (let i = 0; i < usados; i++) slotValues[alvos[i].layerId] = blocos[i]

  if (blocos.length > alvos.length) {
    const sobrando = blocos.slice(alvos.length)
    avisos.push(
      `A copy tem ${blocos.length} blocos e o modelo tem ${alvos.length} ${
        alvos.length === 1 ? 'campo' : 'campos'
      } de texto — ${sobrando.length === 1 ? 'sobrou' : 'sobraram'} ` +
        `${sobrando.map((b) => `"${b.slice(0, 40)}"`).join(', ')}.`,
    )
  } else if (alvos.length > blocos.length) {
    const restantes = alvos.slice(blocos.length)
    ocultar.push(...restantes.map((c) => c.layerId))
    avisos.push(
      `O modelo tem mais campos de texto que a copy do item — ${restantes
        .map((c) => `"${c.name || c.layerId}"`)
        .join(', ')} ${restantes.length === 1 ? 'ficou oculto' : 'ficaram ocultos'} na arte.`,
    )
  }

  return { slotValues, ocultar, avisos }
}

// ── Referências de imagem de um item ────────────────────────────────────────

/** Os papéis que o USUÁRIO pode dar (brand-card, logo etc. são do sistema). */
export const PAPEIS_DE_REFERENCIA = ['subject', 'anchor-ambient', 'anchor-dish', 'style'] as const
export type PapelDeReferencia = (typeof PAPEIS_DE_REFERENCIA)[number]

/** A mesma forma que `startArtGeneration` recebe em `referencias[]`. */
export interface ReferenciaDoItem {
  role: PapelDeReferencia
  driveFileId?: string
  url?: string
  label?: string
}

/**
 * Tetos por papel — os MESMOS de `startArtGeneration` (1 prato, 3 âncoras,
 * 2 estilo; "refs demais causam deriva visual"). Validar aqui, na criação do
 * item, é o que faz a recusa acontecer de graça, e não dias depois na
 * execução paga.
 */
export const TETOS_DE_REFERENCIA = { subject: 1, anchors: 3, style: 2 } as const
export const MAX_REFERENCIAS_POR_ITEM =
  TETOS_DE_REFERENCIA.subject + TETOS_DE_REFERENCIA.anchors + TETOS_DE_REFERENCIA.style

/**
 * Valida uma lista vinda de fora (tool, rota, UI). Devolve a lista normalizada
 * ou o motivo da recusa — quem chama decide o formato do erro (o serviço
 * embrulha em CreativeError; este módulo é puro e não conhece HTTP).
 */
export interface ReferenciasValidadas {
  ok: boolean
  referencias: ReferenciaDoItem[]
  /** Presente quando `ok` é false — sem união discriminada, que este tsconfig (`strict: false`) não estreita. */
  motivo?: string
}

export function validarReferencias(bruto: unknown): ReferenciasValidadas {
  if (bruto === null || bruto === undefined) return { ok: true, referencias: [] }
  if (!Array.isArray(bruto)) return { ok: false, referencias: [], motivo: 'As referências precisam ser uma lista.' }
  if (bruto.length > MAX_REFERENCIAS_POR_ITEM) {
    return { ok: false, referencias: [], motivo: `No máximo ${MAX_REFERENCIAS_POR_ITEM} referências por item (1 cena + 3 âncoras + 2 estilo).` }
  }

  const referencias: ReferenciaDoItem[] = []
  for (const [i, item] of bruto.entries()) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, referencias: [], motivo: `A referência ${i + 1} não tem forma de referência.` }
    }
    const r = item as Record<string, unknown>
    const role = typeof r.role === 'string' ? (r.role.trim() as PapelDeReferencia) : null
    if (!role || !PAPEIS_DE_REFERENCIA.includes(role)) {
      return {
        ok: false,
        referencias: [],
        motivo: `Papel desconhecido na referência ${i + 1}: "${String(r.role ?? '')}". Use subject, anchor-ambient, anchor-dish ou style.`,
      }
    }
    const driveFileId = typeof r.driveFileId === 'string' ? r.driveFileId.trim() : ''
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    // OU/OU, como no serviço de geração: as duas juntas seriam ambíguas e
    // nenhuma das duas é referência de nada.
    if ((driveFileId.length > 0) === (url.length > 0)) {
      return { ok: false, referencias: [], motivo: `A referência ${i + 1} leva OU driveFileId OU url — exatamente um dos dois.` }
    }
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 200) : undefined
    referencias.push({
      role,
      ...(driveFileId ? { driveFileId } : {}),
      ...(url ? { url } : {}),
      ...(label ? { label } : {}),
    })
  }

  const porPapel = (p: PapelDeReferencia) => referencias.filter((r) => r.role === p).length
  if (porPapel('subject') > TETOS_DE_REFERENCIA.subject) {
    return { ok: false, referencias: [], motivo: 'Só 1 foto de cena (subject) por item.' }
  }
  if (porPapel('anchor-ambient') + porPapel('anchor-dish') > TETOS_DE_REFERENCIA.anchors) {
    return { ok: false, referencias: [], motivo: `No máximo ${TETOS_DE_REFERENCIA.anchors} fotos-âncora por item.` }
  }
  if (porPapel('style') > TETOS_DE_REFERENCIA.style) {
    return { ok: false, referencias: [], motivo: `No máximo ${TETOS_DE_REFERENCIA.style} referências de estilo por item.` }
  }

  return { ok: true, referencias }
}

/**
 * Lê a coluna Json do banco. DEFENSIVO por contrato (padrão `page-layers`):
 * linha antiga sem coluna, lixo gravado por caminho futuro — tudo vira lista
 * vazia, nunca erro, porque quem chama está no meio de uma execução paga.
 * A entrada que ainda não existia é filtrada item a item, não descartada em
 * bloco: uma referência estragada não pode sumir com as outras.
 */
export function lerReferenciasDoItem(json: unknown): ReferenciaDoItem[] {
  if (!Array.isArray(json)) return []
  const resultado = validarReferencias(json)
  if (resultado.ok) return resultado.referencias
  const umaAUma: ReferenciaDoItem[] = []
  for (const item of json) {
    const r = validarReferencias([item])
    if (r.ok && r.referencias.length > 0) umaAUma.push(r.referencias[0])
  }
  return umaAUma
}

/** A CENA da lista — é ela que vira o espelho `fotoUrl`/`fotoDriveId`. */
export function cenaDasReferencias(referencias: ReferenciaDoItem[]): ReferenciaDoItem | null {
  return referencias.find((r) => r.role === 'subject') ?? referencias[0] ?? null
}

// ── A trilha de geração de um item de IA ────────────────────────────────────

export type TrilhaDeGeracao = 'arte' | 'imagem'

export interface PedidoDeGeracao {
  trilha: TrilhaDeGeracao
  /** Instrução em português — o `pedido` do serviço de geração: a direção gravada no item ou, sem ela, o tema. */
  pedido: string
  copy: string[]
  /** Papel da foto do item, quando ela existe. */
  papelDaFoto: 'subject' | 'anchor-ambient'
  /**
   * A lista completa de referências do item, quando ele tem uma. Presente,
   * ela VENCE o par espelho (`papelDaFoto` + foto única) — o executor manda a
   * lista inteira para a geração. `null` = item anterior à coluna, caminho
   * antigo.
   */
  referencias: ReferenciaDoItem[] | null
  /** Ajuste autorizado na foto (`instrucaoImagem`); nulo = foto intocada. */
  instrucaoImagem: string | null
  /** Cliente citado na peça — a logo dele é composta na arte (co-branding). */
  marcaDoClienteProjectId: number | null
}

export interface RecusaDeGeracao {
  motivo: string
}

/**
 * Decide como um item de IA vira geração — ou por que ele não pode virar.
 *
 * Duas trilhas, e elas nunca se misturam (regra da casa):
 *
 *  - com copy → trilha `arte`: a peça com os textos desenhados, que EXIGE uma
 *    foto real como cena (papel `subject`). Item de IA com texto e sem foto é
 *    recusado aqui, e não lá na frente com um erro de baixo nível;
 *  - sem copy → trilha `imagem`: a cena sem texto nenhum, que exige a descrição
 *    do que gerar. O tema do item é essa descrição; sem tema não há pedido, e
 *    o serviço recusaria de qualquer jeito.
 */
export function decidirGeracao(item: {
  tema?: string | null
  copyProposta?: string[] | null
  fotoUrl?: string | null
  fotoDriveId?: string | null
  /** A coluna Json do item, crua — é lida aqui com `lerReferenciasDoItem`. */
  referencias?: unknown
  direcao?: string | null
  ajusteDaFoto?: string | null
  clienteProjectId?: number | null
}): PedidoDeGeracao | RecusaDeGeracao {
  const copy = (item.copyProposta ?? [])
    .filter((b): b is string => typeof b === 'string')
    .map((b) => b.trim())
    .filter(Boolean)
  const tema = item.tema?.trim() ?? ''
  // A direção adicional é o briefing que a pessoa escreveu; o tema é só o
  // assunto. Até 23/08/2026 o tema ia como pedido e a direção morria no
  // navegador — ver a coluna `direcao` do ItemDePlano.
  const pedido = item.direcao?.trim() || tema
  const instrucaoImagem = item.ajusteDaFoto?.trim() || null
  const marcaDoClienteProjectId =
    typeof item.clienteProjectId === 'number' &&
    Number.isInteger(item.clienteProjectId) &&
    item.clienteProjectId > 0
      ? item.clienteProjectId
      : null
  const lista = lerReferenciasDoItem(item.referencias)
  const referencias = lista.length > 0 ? lista : null
  const temFoto = !!(item.fotoUrl?.trim() || item.fotoDriveId?.trim())
  // Com lista, a cena tem de estar NELA — o espelho é derivado dela e não
  // pode salvá-la de si mesma (lista só de âncoras + espelho antigo criaria
  // uma cena que a pessoa acabou de tirar).
  const temCena = referencias ? referencias.some((r) => r.role === 'subject') : temFoto

  if (copy.length > 0) {
    if (!temCena) {
      return {
        motivo:
          'A arte por IA com texto precisa de uma foto real do cliente como cena — escolha a foto do item antes de produzir.',
      }
    }
    return { trilha: 'arte', pedido, copy, papelDaFoto: 'subject', referencias, instrucaoImagem, marcaDoClienteProjectId }
  }

  if (!pedido) {
    return {
      motivo:
        'Este item não tem texto nem tema — sem um dos dois não dá para dizer à IA o que produzir.',
    }
  }
  // A trilha `imagem` produz cena sem texto: não leva ajuste de foto nem
  // logomarca — ela É a fotografia. A cena escolhida vira âncora de ambiente
  // (o papel que a trilha aceita como "reproduza este LUGAR").
  return {
    trilha: 'imagem',
    pedido,
    copy: [],
    papelDaFoto: 'anchor-ambient',
    referencias: referencias
      ? referencias.map((r) => (r.role === 'subject' ? { ...r, role: 'anchor-ambient' as const } : r))
      : null,
    instrucaoImagem: null,
    marcaDoClienteProjectId: null,
  }
}

export function ehRecusa(r: PedidoDeGeracao | RecusaDeGeracao): r is RecusaDeGeracao {
  return typeof (r as RecusaDeGeracao).motivo === 'string'
}

// ── Reconciliação: o que a arte virou ───────────────────────────────────────

/** O `GenerationStatus` do banco, como texto (o enum tem só estes três). */
export type StatusDaArte = 'PROCESSING' | 'COMPLETED' | 'FAILED'

/**
 * Para onde um item em voo deve ir, lendo a arte dele.
 *
 * Ninguém avisa o plano quando uma geração termina: a fila durável (F0.3) não
 * conhece plano nenhum, e é de propósito — lá mora COMO o trabalho roda. Quem
 * junta as duas pontas é esta leitura, no mesmo espírito da atribuição por
 * RECONCILIAÇÃO de `sinal-de-modelo.ts`.
 *
 * `null` significa "nada a fazer": item que não está em voo, arte que sumiu
 * (apagar a arte não pode mover o item para lugar nenhum) ou situação que já
 * é a certa.
 */
export function situacaoPelaArte(
  situacaoAtual: StatusDoItem,
  statusDaArte: StatusDaArte | null | undefined,
): StatusDoItem | null {
  if (situacaoAtual !== 'na-fila' && situacaoAtual !== 'gerando') return null
  if (!statusDaArte) return null

  const destino: StatusDoItem =
    statusDaArte === 'COMPLETED' ? 'pronto' : statusDaArte === 'FAILED' ? 'erro' : 'gerando'
  return destino === situacaoAtual ? null : destino
}

/**
 * O caminho de transições de `de` até `para`, respeitando o vocabulário.
 *
 * 🔴 Existe porque a tabela de transições NÃO tem atalho: `na-fila` → `pronto`
 * é inválido (o item passa por `gerando`), e a reconciliação encontra
 * exatamente esse caso toda vez que o cron da fila termina a arte antes de
 * alguém abrir o plano. Forçar o pulo exigiria mexer na tabela de A1 e apagaria
 * do registro por onde o item passou; caminhar é fiel ao que aconteceu.
 *
 * Busca em largura sobre um grafo de 9 nós, na ordem de `STATUS_DO_ITEM` —
 * determinística, para o mesmo par sempre dar o mesmo caminho. `[]` quando já
 * está no destino; `null` quando não há caminho (`agendado` é terminal).
 */
export function caminhoAte(de: StatusDoItem, para: StatusDoItem): StatusDoItem[] | null {
  if (de === para) return []
  if (transicaoPermitida(de, para)) return [para]

  const anterior = new Map<StatusDoItem, StatusDoItem>()
  const vistos = new Set<StatusDoItem>([de])
  const fila: StatusDoItem[] = [de]

  while (fila.length > 0) {
    const atual = fila.shift() as StatusDoItem
    for (const proximo of STATUS_DO_ITEM) {
      if (proximo === atual || vistos.has(proximo)) continue
      if (!transicaoPermitida(atual, proximo)) continue
      vistos.add(proximo)
      anterior.set(proximo, atual)
      if (proximo === para) {
        const caminho: StatusDoItem[] = []
        let cursor: StatusDoItem | undefined = para
        while (cursor && cursor !== de) {
          caminho.unshift(cursor)
          cursor = anterior.get(cursor)
        }
        return caminho
      }
      fila.push(proximo)
    }
  }
  return null
}

// ── Elegibilidade ───────────────────────────────────────────────────────────

/**
 * As situações que `executar-plano` produz.
 *
 * `reprovado` fica de FORA de propósito, mesmo tendo sido listado como
 * editável: produzir de novo o que alguém acabou de recusar, sem que nada
 * tenha mudado, é gastar crédito para repetir o erro. O caminho é
 * `regenerar-item`, que devolve o item à fila com o motivo registrado.
 */
const EXECUTAVEIS: StatusDoItem[] = ['proposto', 'editado', 'aprovado', 'erro']

export function itemExecutavel(status: StatusDoItem): boolean {
  return EXECUTAVEIS.includes(status)
}

/** Por que este item ficou de fora desta execução. */
export function motivoDeNaoExecutar(status: StatusDoItem): string {
  if (status === 'agendado') return 'já virou post na agenda'
  if (status === 'pronto') return 'a arte já está pronta'
  if (status === 'gerando') return 'a arte já está sendo produzida'
  if (status === 'na-fila') return 'já está na fila de produção'
  if (status === 'reprovado') {
    return 'foi reprovado — use regenerar-item para devolvê-lo à fila antes de produzir'
  }
  return `situação inesperada: ${status}`
}
