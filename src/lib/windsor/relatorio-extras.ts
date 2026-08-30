/**
 * Blocos do relatório semanal que só o Windsor enxerga: anúncios (Meta Ads)
 * e avaliações do Google Meu Negócio.
 *
 * Cada bloco devolve STRING pronta para o WhatsApp ou null (sem dado, sem
 * chave, ou falha) — o relatório sai inteiro do mesmo jeito, com o que
 * houver. A régua dos anúncios é a decidida em 30/08/2026 no Farol:
 * frequência ≥ 3,5 troca o criativo; CTR < 0,5% fora de awareness troca a
 * mensagem; CPC > R$ 2 fora de awareness pausa e replaneja.
 */
import { ADS_ACCOUNT_NAME_PARA_PROJETO, GMB_POR_PROJETO } from './contas'
import { isWindsorConfigured, num, texto, windsorGet } from './client'

const rBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Anúncios dos clientes ativos — últimos 7 dias, com a régua de alertas. */
export async function blocoAnunciosDaSemana(): Promise<string | null> {
  if (!isWindsorConfigured()) return null
  let linhas: Array<Record<string, unknown>>
  try {
    linhas = await windsorGet('facebook', {
      fields: ['account_name', 'campaign', 'campaign_status', 'campaign_objective', 'spend', 'frequency', 'ctr', 'cpc', 'reach'],
      datePreset: 'last_7d',
    })
  } catch (erro) {
    console.error('[relatorio-semanal] bloco de anúncios falhou (seguindo sem ele):', erro)
    return null
  }

  const porCliente = new Map<string, { gasto: number; campanhas: number; alertas: string[] }>()
  for (const l of linhas) {
    const conta = texto(l.account_name)
    const cliente = conta ? ADS_ACCOUNT_NAME_PARA_PROJETO[conta] : undefined
    if (!cliente || !texto(l.campaign)) continue
    let c = porCliente.get(cliente.nome)
    if (!c) {
      c = { gasto: 0, campanhas: 0, alertas: [] }
      porCliente.set(cliente.nome, c)
    }
    c.gasto += num(l.spend)
    c.campanhas++
    const nomeCampanha = (texto(l.campaign) ?? '').slice(0, 40)
    const awareness = /AWARENESS/.test(texto(l.campaign_objective) ?? '')
    const freq = num(l.frequency)
    const ctr = num(l.ctr)
    const cpc = num(l.cpc)
    if (freq >= 3.5) c.alertas.push(`"${nomeCampanha}" freq ${n1.format(freq)} — trocar criativo`)
    else if (!awareness && ctr > 0 && ctr < 0.005) c.alertas.push(`"${nomeCampanha}" CTR ${n1.format(ctr * 100)}% — mensagem fraca`)
    else if (!awareness && cpc > 2) c.alertas.push(`"${nomeCampanha}" CPC ${rBRL.format(cpc)} — caro`)
  }
  if (!porCliente.size) return null

  const partes = ['\n📣 *Anúncios (7 dias)*']
  for (const [nome, c] of porCliente) {
    partes.push(`*${nome}* — ${rBRL.format(c.gasto)} em ${c.campanhas} campanha(s)`)
    for (const a of c.alertas) partes.push(`  ⚠️ ${a}`)
  }
  // Cliente ativo SEM campanha rodando também é informação
  const comCampanha = new Set(porCliente.keys())
  const semCampanha = Object.values(ADS_ACCOUNT_NAME_PARA_PROJETO)
    .map((c) => c.nome)
    .filter((nome) => !comCampanha.has(nome))
  if (semCampanha.length) partes.push(`  💤 Sem campanha na semana: ${[...new Set(semCampanha)].join(', ')}`)
  return partes.join('\n')
}

/** Avaliações do Google — novas na semana e negativas sem resposta. */
export async function blocoAvaliacoesDaSemana(): Promise<string | null> {
  if (!isWindsorConfigured()) return null
  let linhas: Array<Record<string, unknown>>
  try {
    linhas = await windsorGet('google_my_business', {
      fields: ['account_name', 'review_id', 'review_star_rating', 'review_reply_comment', 'review_create_time'],
      datePreset: 'last_7d',
    })
  } catch (erro) {
    console.error('[relatorio-semanal] bloco de avaliações falhou (seguindo sem ele):', erro)
    return null
  }

  const ESTRELAS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
  const porLocal = new Map<string, { novas: number; cinco: number; negativasSemResposta: number }>()
  for (const l of linhas) {
    if (!texto(l.review_id)) continue
    const local = GMB_POR_PROJETO.find((g) => g.accountName === texto(l.account_name))
    if (!local) continue
    let c = porLocal.get(local.nome)
    if (!c) {
      c = { novas: 0, cinco: 0, negativasSemResposta: 0 }
      porLocal.set(local.nome, c)
    }
    const estrelas = ESTRELAS[texto(l.review_star_rating) ?? ''] ?? 0
    c.novas++
    if (estrelas === 5) c.cinco++
    if (estrelas >= 1 && estrelas <= 3 && !texto(l.review_reply_comment)) c.negativasSemResposta++
  }
  if (!porLocal.size) return null

  const partes = ['\n⭐ *Google (7 dias)*']
  for (const [nome, c] of porLocal) {
    const negativa = c.negativasSemResposta ? ` · 🔴 ${c.negativasSemResposta} negativa(s) SEM resposta` : ''
    partes.push(`*${nome}* — ${c.novas} nova(s), ${c.cinco} com 5★${negativa}`)
  }
  partes.push('  _5★ com texto são matéria de prova social — colher no Farol._')
  return partes.join('\n')
}
