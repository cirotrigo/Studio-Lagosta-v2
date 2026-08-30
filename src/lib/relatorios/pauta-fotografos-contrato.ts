/**
 * O CONTRATO da pauta de fotografia — o que ela decide, separado de como ela
 * coleta e envia (`pauta-fotografos.ts`).
 *
 * Módulo PURO de propósito: sem Prisma, sem Drive, sem rede — `@/lib/db` lança
 * no import sem `DATABASE_URL`, e a priorização e os textos são justamente o
 * que precisa ser testável sozinho. Mesmo precedente de `reconciliacao.ts` e
 * `proposta-de-semana.ts`.
 *
 * A pauta nasceu do brief manual de 30/08/2026 (ver
 * docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md, F5.1). A versão semanal é
 * deliberadamente mais SECA que o brief editorial: só o que os dados afirmam
 * — pilar sem foto, busca que morreu, cobertura magra, curadoria pendente.
 * Sugestão de cena é trabalho de gente, não de cron.
 */

export interface PilarDaPauta {
  nome: string
  /** Fotos do catálogo que casam com o assunto (por palavra — presença, não qualidade). */
  casaveis: number
  /** % do acervo do cliente. */
  pctDoAcervo: number
  /** Quantas fotos DESTACADAS casam com o assunto. */
  destacadasQueCasam: number
}

export interface TemaRejeitado {
  tema: string
  fechadas: number
  trocadas: number
  expiradas: number
}

export interface ClienteDaPauta {
  projectId: number
  nome: string
  totalDoAcervo: number
  totalDestacadas: number
  pilares: PilarDaPauta[]
  temasRejeitados: TemaRejeitado[]
  /** true quando o catálogo não pôde ser lido — o cliente sai da pauta com uma linha honesta. */
  semCatalogo?: boolean
}

export interface PautaDeFotografia {
  /** 'AAAA-MM-DD' em Brasília. */
  geradaEm: string
  clientes: ClienteDaPauta[]
}

export type TipoDePrioridade = 'falta-no-acervo' | 'busca-morta' | 'cobertura-magra'

export interface PrioridadeDaPauta {
  tipo: TipoDePrioridade
  cliente: string
  assunto: string
  detalhe: string
}

/**
 * Abaixo disto um assunto conta como MAGRO. Absoluto, não percentual, de
 * propósito: com limiar percentual metade dos pilares da carteira entraria
 * toda semana (26–44% é o normal dos acervos reais) e a pauta viraria ruído
 * que ninguém lê — o mergulho fino fica nos scripts e no brief editorial.
 */
export const MINIMO_DE_FOTOS_POR_PILAR = 15

export type SituacaoDoPilar = 'zero' | 'magro' | 'ok'

export function situacaoDoPilar(casaveis: number): SituacaoDoPilar {
  if (casaveis <= 0) return 'zero'
  if (casaveis < MINIMO_DE_FOTOS_POR_PILAR) return 'magro'
  return 'ok'
}

/** Pilar com foto no acervo e nenhuma destacada — resolve com estrela, não com câmera. */
export function curadoriaPendente(p: PilarDaPauta): boolean {
  return p.casaveis > 0 && p.destacadasQueCasam === 0
}

/**
 * As prioridades da semana, na ordem da evidência: pilar SEM foto no acervo
 * (a lacuna absoluta) → busca que morreu (a equipe procurou e nada serviu) →
 * cobertura magra. Dentro de cada faixa, mantém a ordem dos clientes.
 */
export function prioridadesDaPauta(pauta: PautaDeFotografia): PrioridadeDaPauta[] {
  const zeros: PrioridadeDaPauta[] = []
  const mortas: PrioridadeDaPauta[] = []
  const magros: PrioridadeDaPauta[] = []

  for (const c of pauta.clientes) {
    if (c.semCatalogo) continue
    for (const p of c.pilares) {
      const s = situacaoDoPilar(p.casaveis)
      if (s === 'zero') {
        zeros.push({
          tipo: 'falta-no-acervo',
          cliente: c.nome,
          assunto: p.nome,
          detalhe: `nenhuma foto do assunto num acervo de ${c.totalDoAcervo}`,
        })
      } else if (s === 'magro') {
        magros.push({
          tipo: 'cobertura-magra',
          cliente: c.nome,
          assunto: p.nome,
          detalhe: `${p.casaveis} foto(s) — abaixo do mínimo de ${MINIMO_DE_FOTOS_POR_PILAR}`,
        })
      }
    }
    for (const t of c.temasRejeitados) {
      mortas.push({
        tipo: 'busca-morta',
        cliente: c.nome,
        assunto: t.tema,
        detalhe: `${t.fechadas} busca(s) e nenhuma foto serviu (${t.trocadas} trocada(s), ${t.expiradas} expirada(s))`,
      })
    }
  }

  return [...zeros, ...mortas, ...magros]
}

/** Clientes que não entram em nenhuma prioridade nem têm curadoria pendente. */
export function clientesSemPauta(pauta: PautaDeFotografia): string[] {
  return pauta.clientes
    .filter(
      (c) =>
        !c.semCatalogo &&
        c.temasRejeitados.length === 0 &&
        c.pilares.every((p) => situacaoDoPilar(p.casaveis) === 'ok' && !curadoriaPendente(p)),
    )
    .map((c) => c.nome)
}

function dataPorExtensoBRT(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * A legenda que acompanha o PDF no WhatsApp. CURTA de propósito: legenda de
 * mídia tem teto apertado no WhatsApp, e o detalhe mora no documento.
 */
export function legendaDoPdf(pauta: PautaDeFotografia, opcoes?: { teste?: boolean }): string {
  const prioridades = prioridadesDaPauta(pauta)
  const topo = prioridades
    .slice(0, 3)
    .map((p) => `• ${p.cliente} — ${p.assunto}`)
    .join('\n')
  const cabeca = `${opcoes?.teste ? '[TESTE] ' : ''}📸 *Pauta de fotografia da semana* (${dataPorExtensoBRT(pauta.geradaEm)})`
  if (prioridades.length === 0) {
    return `${cabeca}\n\nSem lacuna nova no acervo esta semana — a pauta completa está no PDF.`
  }
  return `${cabeca}\n\n${prioridades.length} ponto(s) na pauta. Os primeiros:\n${topo}\n\nDetalhe por cliente no PDF.`
}

/**
 * A pauta inteira como TEXTO — o fallback quando o PDF ou o upload falham.
 * Degradação honesta: melhor a pauta feia no grupo do que nenhuma.
 */
export function mensagemCompleta(pauta: PautaDeFotografia, opcoes?: { teste?: boolean }): string {
  const linhas: string[] = [
    `${opcoes?.teste ? '[TESTE] ' : ''}📸 *Pauta de fotografia da semana* (${dataPorExtensoBRT(pauta.geradaEm)})`,
    '',
  ]

  const prioridades = prioridadesDaPauta(pauta)
  if (prioridades.length > 0) {
    linhas.push('*Prioridades:*')
    prioridades.forEach((p, i) => {
      const marca =
        p.tipo === 'falta-no-acervo' ? 'FALTA NO ACERVO' : p.tipo === 'busca-morta' ? 'buscas morreram' : 'cobertura magra'
      linhas.push(`${i + 1}. *${p.cliente} — ${p.assunto}* (${marca}): ${p.detalhe}`)
    })
    linhas.push('')
  }

  const curadorias = pauta.clientes
    .filter((c) => !c.semCatalogo)
    .map((c) => ({ nome: c.nome, pendentes: c.pilares.filter(curadoriaPendente).map((p) => p.nome) }))
    .filter((c) => c.pendentes.length > 0)
  if (curadorias.length > 0) {
    linhas.push('*Curadoria pendente* (tem foto, falta destacar — resolve com a estrela no seletor):')
    for (const c of curadorias) linhas.push(`• ${c.nome}: ${c.pendentes.join(', ')}`)
    linhas.push('')
  }

  const semPauta = clientesSemPauta(pauta)
  if (semPauta.length > 0) linhas.push(`*Sem pauta urgente:* ${semPauta.join(', ')}.`)

  linhas.push('', '_Regras de sempre: ocupação moderada e sem rosto em foco; prato atual do cardápio; nada de preço na cena; priorizar verticais (9:16)._')
  return linhas.join('\n')
}
