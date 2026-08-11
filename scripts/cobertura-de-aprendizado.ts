/**
 * Cobertura do aprendizado por cliente — quanto do que foi publicado o sistema
 * consegue de fato APRENDER, e quão VELHO é esse material.
 *
 * Existe por causa de duas perguntas do Ciro em 11/08/2026:
 *
 *  1. "as artes estavam sendo feitas fora do Studio, então talvez seja melhor
 *     começar do zero" — a resposta depende de quanto do histórico tem texto
 *     legível no banco, e isso só se sabe medindo;
 *  2. "treinar com post de mais de 40 dias talvez não seja eficaz, porque
 *     campanha, cardápio e horário mudaram" — a resposta depende de quanto do
 *     corpus é recente, e isso também só se sabe medindo.
 *
 * O que a primeira medição (11/08/2026) mostrou: **15% de cobertura no
 * conjunto** — 809 posts com texto de ~5.400 publicados em 180 dias. A rota
 * externa (`/api/external/posts`) aceita só `mediaUrls` e `caption`; peça
 * montada fora do Studio entra sem `slotValues`, sem `pageId` e sem
 * `generationId`, e a copy fica presa dentro do PNG. Por isso a cobertura é o
 * KPI da migração para a bancada: ela só sobe quando o trabalho migra.
 *
 * SOMENTE LEITURA — nenhuma escrita, nenhuma chamada de modelo. Pode rodar
 * contra produção.
 *
 * USO
 *   npx tsx scripts/cobertura-de-aprendizado.ts
 *   npx tsx scripts/cobertura-de-aprendizado.ts --dias 90
 *   npx tsx scripts/cobertura-de-aprendizado.ts --json
 */
import { db } from '../src/lib/db'
import { textoDoPost } from '../src/lib/aprendizado/textos-do-post'

/** Janela de análise. 180 dias é o mesmo padrão de `montarPerfil`. */
const DIAS_PADRAO = 180

/**
 * Fronteira do "recente". 40 dias é o número que o Ciro levantou: além disso,
 * campanha, cardápio e horário do cliente já podem ter mudado.
 */
const DIAS_RECENTE = 40
const DIAS_MEIO = 90

interface LinhaDeCobertura {
  projectId: number
  cliente: string
  publicados: number
  comTexto: number
  cobertura: number
  /** Vínculo com o Studio (`pageId` ou `generationId`): a arte nasceu aqui. */
  doStudio: number
  /** Do corpus COM TEXTO, quantos em cada faixa de idade. */
  recente: number
  meio: number
  antigo: number
  /** Fração do corpus com texto que está dentro da janela recente. */
  fracaoRecente: number
}

async function medirProjeto(
  projectId: number,
  cliente: string,
  desde: Date,
): Promise<LinhaDeCobertura | null> {
  const posts = await db.socialPost.findMany({
    where: { projectId, status: 'POSTED', scheduledDatetime: { gte: desde } },
    select: {
      caption: true,
      slotValues: true,
      reminderExtraInfo: true,
      pageId: true,
      generationId: true,
      scheduledDatetime: true,
      Generation: { select: { fieldValues: true } },
    },
    take: 5000,
  })
  if (posts.length === 0) return null

  const agora = Date.now()
  let comTexto = 0
  let doStudio = 0
  let recente = 0
  let meio = 0
  let antigo = 0

  for (const p of posts) {
    if (p.pageId || p.generationId) doStudio += 1

    // O MESMO leitor que o classificador usa — se ele não acha texto aqui,
    // aquele post não entra em pilar nenhum.
    const { semTexto } = textoDoPost({
      caption: p.caption,
      slotValues: p.slotValues,
      reminderExtraInfo: p.reminderExtraInfo,
      fieldValues: p.Generation?.fieldValues ?? null,
    })
    if (semTexto) continue

    comTexto += 1
    const idadeDias = p.scheduledDatetime
      ? (agora - p.scheduledDatetime.getTime()) / 86_400_000
      : Number.POSITIVE_INFINITY
    if (idadeDias <= DIAS_RECENTE) recente += 1
    else if (idadeDias <= DIAS_MEIO) meio += 1
    else antigo += 1
  }

  return {
    projectId,
    cliente,
    publicados: posts.length,
    comTexto,
    cobertura: posts.length > 0 ? comTexto / posts.length : 0,
    doStudio,
    recente,
    meio,
    antigo,
    fracaoRecente: comTexto > 0 ? recente / comTexto : 0,
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOut = args.includes('--json')
  const iDias = args.indexOf('--dias')
  const dias = iDias >= 0 ? Number(args[iDias + 1]) || DIAS_PADRAO : DIAS_PADRAO
  const desde = new Date(Date.now() - dias * 24 * 3600_000)

  const projetos = await db.project.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })
  const linhas: LinhaDeCobertura[] = []
  for (const p of projetos) {
    const linha = await medirProjeto(p.id, p.name, desde)
    if (linha) linhas.push(linha)
  }
  linhas.sort((a, b) => b.cobertura - a.cobertura)

  if (jsonOut) {
    console.log(JSON.stringify({ dias, geradoEm: new Date().toISOString(), clientes: linhas }, null, 2))
    await db.$disconnect()
    return
  }

  console.log(`\nCobertura do aprendizado — últimos ${dias} dias\n`)
  console.log(
    'cliente'.padEnd(20) +
      'public.'.padStart(8) +
      'c/ texto'.padStart(10) +
      'cobert.'.padStart(9) +
      'do Studio'.padStart(11) +
      `  │ ≤${DIAS_RECENTE}d`.padStart(9) +
      `${DIAS_RECENTE + 1}-${DIAS_MEIO}d`.padStart(9) +
      `>${DIAS_MEIO}d`.padStart(8) +
      '  recente',
  )
  console.log('─'.repeat(96))

  for (const l of linhas) {
    console.log(
      l.cliente.slice(0, 19).padEnd(20) +
        String(l.publicados).padStart(8) +
        String(l.comTexto).padStart(10) +
        pct(l.cobertura).padStart(9) +
        pct(l.doStudio / l.publicados).padStart(11) +
        `  │ ${l.recente}`.padStart(9) +
        String(l.meio).padStart(9) +
        String(l.antigo).padStart(8) +
        `  ${pct(l.fracaoRecente)}`.padStart(9),
    )
  }

  const soma = (f: (l: LinhaDeCobertura) => number) => linhas.reduce((t, l) => t + f(l), 0)
  const pubs = soma((l) => l.publicados)
  const txt = soma((l) => l.comTexto)
  const rec = soma((l) => l.recente)
  console.log('─'.repeat(96))
  console.log(
    'TOTAL'.padEnd(20) +
      String(pubs).padStart(8) +
      String(txt).padStart(10) +
      pct(txt / Math.max(1, pubs)).padStart(9) +
      pct(soma((l) => l.doStudio) / Math.max(1, pubs)).padStart(11) +
      `  │ ${rec}`.padStart(9) +
      String(soma((l) => l.meio)).padStart(9) +
      String(soma((l) => l.antigo)).padStart(8) +
      `  ${pct(rec / Math.max(1, txt))}`.padStart(9),
  )

  console.log(
    `\nCOBERTURA é o KPI da migração para a bancada: peça montada aqui grava a copy\n` +
      `no banco; peça empurrada pela rota externa entra só com mediaUrls e caption.\n` +
      `RECENTE é o corpus que sobreviveria a um corte de ${DIAS_RECENTE} dias — se ele for\n` +
      `pequeno, cortar por idade troca dado velho por dado nenhum, e o caminho é\n` +
      `pesar por recência (como \`cadencia.ts\` já faz), não descartar.\n`,
  )

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
