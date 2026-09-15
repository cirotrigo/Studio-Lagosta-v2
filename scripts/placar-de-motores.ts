/**
 * Placar de "gostei" x "preciso melhorar" por CLIENTE e por MOTOR de arte.
 *
 * É a evidência por trás de `PREFERENCIA_POR_PROJETO`
 * (`src/lib/creatives/forma-de-arte.ts`), que decide qual forma de arte propor
 * a quem pede uma peça. A lista de lá é DECLARADA à mão de propósito; este
 * script existe para revisitá-la sem chutar — e para mostrar quando ela ficou
 * velha.
 *
 * 🔴 COMO LER, porque o número engana de três jeitos:
 *
 *  1. **"gostei" é subnotificado.** Quem aprova a arte agenda e segue; quem
 *     reprova clica. A coluna da direita mede "quantas vezes precisou de
 *     correção", NÃO taxa de aprovação. Não compare com 50%.
 *  2. **Motor sem sinal não é motor ruim.** Em 09/09/2026 o compositor tinha
 *     ZERO sinais e era o que produzia a carteira inteira. Ausência aqui quase
 *     sempre significa "ninguém clicou", não "ninguém usou".
 *  3. **Uma leva ruim marca o motor para sempre.** Os 32 "melhorar" de modelo
 *     no TERO são todos de 17/08/2026, dos templates cujo lockup já nascia
 *     colidindo — defeito consertado. Olhe a coluna de DATAS antes de condenar.
 *
 * SOMENTE LEITURA — nenhuma escrita, nenhuma chamada de modelo, nenhum
 * crédito. Pode rodar contra produção.
 *
 * USO
 *   npx tsx scripts/placar-de-motores.ts
 *   npx tsx scripts/placar-de-motores.ts --dias 60
 *   npx tsx scripts/placar-de-motores.ts --projeto 3
 */
import { db } from '@/lib/db'
import { PREFERENCIA_POR_PROJETO, PADRAO } from '@/lib/creatives/forma-de-arte'

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** O `source` da Generation, traduzido para o motor que a equipe reconhece. */
function motorDe(source: string): string {
  if (source === 'arte-ia') return 'IA'
  if (source === 'arte-rapida') return 'modelo'
  if (source === 'compositor') return 'compositor'
  if (source === 'arte-enviada') return 'canvas/upload'
  if (source === 'ajuste-arte') return 'ajuste no chat'
  if (source === 'ai_improvement') return 'melhoria com IA'
  return source
}

interface Celula {
  ok: number
  nao: number
  primeiro: Date | null
  ultimo: Date | null
}

async function main() {
  const dias = Number(arg('dias') ?? 0)
  const projeto = arg('projeto') ? Number(arg('projeto')) : undefined
  const desde = dias > 0 ? new Date(Date.now() - dias * 86_400_000) : undefined

  const sinais = await db.learningSignal.findMany({
    where: {
      tipo: 'arte',
      generationId: { not: null },
      ...(projeto ? { projectId: projeto } : {}),
      ...(desde ? { decididoEm: { gte: desde } } : {}),
    },
    select: { projectId: true, generationId: true, escolhido: true, decididoEm: true },
    orderBy: { decididoEm: 'desc' },
    take: 5000,
  })

  if (sinais.length === 0) {
    console.log('Nenhum feedback de arte no período. O placar vive de alguém clicar em "gostei" / "preciso melhorar".')
    await db.$disconnect()
    return
  }

  const gens = await db.generation.findMany({
    where: { id: { in: sinais.map((s) => s.generationId!) } },
    select: { id: true, fieldValues: true },
  })
  const sourceDe = new Map<string, string>()
  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    sourceDe.set(g.id, motorDe(String(fv.source ?? 'desconhecido')))
  }

  const projetos = await db.project.findMany({ select: { id: true, name: true } })
  const nome = new Map(projetos.map((p) => [p.id, p.name]))

  const placar = new Map<string, Celula>()
  for (const s of sinais) {
    const escolhido = (s.escolhido ?? {}) as Record<string, unknown>
    const veredito = String(escolhido.veredito ?? '')
    if (veredito !== 'gostei' && veredito !== 'melhorar') continue

    const chave = `${s.projectId} :: ${sourceDe.get(s.generationId!) ?? 'sem arte'}`
    const c = placar.get(chave) ?? { ok: 0, nao: 0, primeiro: null, ultimo: null }
    if (veredito === 'gostei') c.ok += 1
    else c.nao += 1
    if (!c.ultimo || s.decididoEm > c.ultimo) c.ultimo = s.decididoEm
    if (!c.primeiro || s.decididoEm < c.primeiro) c.primeiro = s.decididoEm
    placar.set(chave, c)
  }

  const dia = (d: Date | null) =>
    d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) : '--'

  const porProjeto = new Map<number, Array<{ motor: string } & Celula>>()
  for (const [chave, c] of placar) {
    const [pid, motor] = chave.split(' :: ')
    const lista = porProjeto.get(Number(pid)) ?? []
    lista.push({ motor, ...c })
    porProjeto.set(Number(pid), lista)
  }

  const ids = [...porProjeto.keys()].sort((a, b) => (nome.get(a) ?? '').localeCompare(nome.get(b) ?? ''))
  for (const pid of ids) {
    const pref = PREFERENCIA_POR_PROJETO[pid] ?? PADRAO
    const declarado = PREFERENCIA_POR_PROJETO[pid] ? pref.primeira : `${PADRAO.primeira} (padrão, sem linha na lista)`
    console.log(`\n${nome.get(pid) ?? pid}  —  hoje eu proponho: ${declarado}`)
    const linhas = porProjeto.get(pid)!.sort((a, b) => b.ok + b.nao - (a.ok + a.nao))
    for (const l of linhas) {
      const total = l.ok + l.nao
      const janela = l.primeiro && l.ultimo && dia(l.primeiro) !== dia(l.ultimo)
        ? `${dia(l.primeiro)} a ${dia(l.ultimo)}`
        : dia(l.ultimo)
      console.log(`   ${l.motor.padEnd(16)} gostei ${String(l.ok).padStart(3)}   melhorar ${String(l.nao).padStart(3)}   (${total} sinais, ${janela})`)
    }
  }

  console.log(`\n${sinais.length} sinais lidos${desde ? ` nos últimos ${dias} dias` : ''}.`)
  console.log('Motor ausente = ninguém clicou, não "ninguém usou". Leia o cabeçalho deste arquivo antes de mexer na lista.')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
