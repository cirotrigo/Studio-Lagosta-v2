/**
 * Mede a melhoria com IA da carteira — SOMENTE LEITURA.
 *
 * O KPI semanal da F3 (02/09/2026): por cliente, quantas melhorias, de onde
 * veio a régua (banco/linhagem/visão/nenhuma), quantas passaram na
 * conferência, quantas saíram com aviso (texto a mais, número sem lastro,
 * texto faltando), o tier, o custo estimado na fatura da OpenAI e o veredito
 * de um clique ("gostei" / "preciso melhorar"). Sem isto "a melhoria melhora?"
 * era palpite: 3 sinais em 141 melhorias, medido em 01/09/2026.
 *
 * Uso:
 *   npx tsx scripts/medir-melhoria.ts            # últimos 7 dias
 *   npx tsx scripts/medir-melhoria.ts --dias=30
 *   npx tsx scripts/medir-melhoria.ts --projeto=2
 *
 * Não escreve nada; não gasta crédito.
 */
import { db } from '../src/lib/db'

const CUSTO_USD: Record<string, number> = { low: 0.008, medium: 0.045, high: 0.165 }

async function main() {
  const dias = Number(process.argv.find((a) => a.startsWith('--dias='))?.split('=')[1] ?? 7)
  const projetoArg = process.argv.find((a) => a.startsWith('--projeto='))?.split('=')[1]
  const desde = new Date(Date.now() - dias * 86_400_000)

  const gens = await db.generation.findMany({
    where: {
      createdAt: { gte: desde },
      fieldValues: { path: ['source'], equals: 'ai_improvement' },
      ...(projetoArg ? { projectId: Number(projetoArg) } : {}),
    },
    select: { id: true, projectId: true, status: true, createdAt: true, fieldValues: true },
    orderBy: { createdAt: 'asc' },
  })
  const projetos = await db.project.findMany({ select: { id: true, name: true } })
  const nome = Object.fromEntries(projetos.map((p) => [p.id, p.name]))

  type Linha = {
    n: number; ok: number; falhou: number; skipped: number
    regua: Record<string, number>
    textoAMais: number; numeros: number; comAviso: number
    gostei: number; melhorar: number
    tiers: Record<string, number>; usd: number
  }
  const por: Record<number, Linha> = {}
  const linha = (id: number): Linha =>
    (por[id] ??= { n: 0, ok: 0, falhou: 0, skipped: 0, regua: {}, textoAMais: 0, numeros: 0, comAviso: 0, gostei: 0, melhorar: 0, tiers: {}, usd: 0 })

  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    const l = linha(g.projectId)
    l.n++
    const tc = fv.textCheck
    if (tc === 'passed') l.ok++
    else if (tc === 'failed') l.falhou++
    else l.skipped++
    const regua = typeof fv.regua === 'string' ? fv.regua : Array.isArray(fv.textos) && fv.textos.length > 0 ? 'banco?' : 'nenhuma?'
    l.regua[regua] = (l.regua[regua] ?? 0) + 1
    if (fv.textoAMaisAlerta) l.textoAMais++
    if (fv.numerosAlerta) l.numeros++
    if (fv.entregueComAlerta || fv.textoAMaisAlerta || fv.numerosAlerta || tc === 'failed') l.comAviso++
    const tier = typeof fv.quality === 'string' ? fv.quality : 'low'
    l.tiers[tier] = (l.tiers[tier] ?? 0) + 1
    l.usd += CUSTO_USD[tier] ?? 0.008
    const veredito = (fv.feedback as { veredito?: string } | undefined)?.veredito
    if (veredito === 'gostei') l.gostei++
    else if (veredito) l.melhorar++
  }

  console.log(`\nMelhoria com IA — últimos ${dias} dias (${gens.length} melhorias)\n`)
  console.log('cliente'.padEnd(20), 'n'.padStart(4), 'ok'.padStart(4), 'falhou'.padStart(7), 'pulou'.padStart(6), 'régua'.padEnd(34), 'a mais'.padStart(7), 'núm'.padStart(4), '👍'.padStart(3), '👎'.padStart(3), 'US$'.padStart(7), 'tiers')
  const total: Linha = { n: 0, ok: 0, falhou: 0, skipped: 0, regua: {}, textoAMais: 0, numeros: 0, comAviso: 0, gostei: 0, melhorar: 0, tiers: {}, usd: 0 }
  for (const [id, l] of Object.entries(por).sort((a, b) => b[1].n - a[1].n)) {
    const regua = Object.entries(l.regua).map(([k, v]) => `${k}:${v}`).join(' ')
    const tiers = Object.entries(l.tiers).map(([k, v]) => `${k}:${v}`).join(' ')
    console.log((nome[Number(id)] ?? id).slice(0, 20).padEnd(20), String(l.n).padStart(4), String(l.ok).padStart(4), String(l.falhou).padStart(7), String(l.skipped).padStart(6), regua.padEnd(34), String(l.textoAMais).padStart(7), String(l.numeros).padStart(4), String(l.gostei).padStart(3), String(l.melhorar).padStart(3), l.usd.toFixed(2).padStart(7), tiers)
    total.n += l.n; total.ok += l.ok; total.falhou += l.falhou; total.skipped += l.skipped; total.textoAMais += l.textoAMais; total.numeros += l.numeros; total.gostei += l.gostei; total.melhorar += l.melhorar; total.usd += l.usd; total.comAviso += l.comAviso
    for (const [k, v] of Object.entries(l.regua)) total.regua[k] = (total.regua[k] ?? 0) + v
  }
  const semRegua = (total.regua['nenhuma'] ?? 0) + (total.regua['nenhuma?'] ?? 0)
  console.log('\nTOTAL'.padEnd(21), String(total.n).padStart(4), String(total.ok).padStart(4), String(total.falhou).padStart(7), String(total.skipped).padStart(6))
  console.log(`\nsem régua: ${semRegua} de ${total.n} (${total.n ? Math.round((semRegua / total.n) * 100) : 0}%) · com aviso: ${total.comAviso} · texto a mais com dado: ${total.textoAMais} · feedback: ${total.gostei + total.melhorar} de ${total.n} (${total.n ? Math.round(((total.gostei + total.melhorar) / total.n) * 100) : 0}%) · fatura ≈ US$ ${total.usd.toFixed(2)}`)
  console.log('\nLeitura: "régua" é de onde veio o texto esperado (banco = a Generation de origem tinha a copy; linhagem = veio da raiz da cadeia; visao = transcrição da própria arte; nenhuma = a peça é foto pura ou nada foi lido). "a mais" = melhorias que acrescentaram texto com DADO (endereço, hora, preço) — o alerta vermelho.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
