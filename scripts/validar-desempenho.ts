/**
 * Valida a ponte de desempenho (público → proposta) sem escrever nada.
 *
 * Parte A: casos sintéticos das travas de honestidade (amostra pequena cala,
 * campeão exige vantagem real, legenda com preço não é citada).
 * Parte B: o bloco REAL de alguns clientes, lido da InstagramFeed de
 * produção — leitura pura; NUNCA passa por sugerir-posts/propor-semana
 * (registrariam LearningSignal).
 *
 *   npx tsx scripts/validar-desempenho.ts
 */
import { db } from '../src/lib/db'
import {
  montarResumoDesempenho,
  desempenhoParaPrompt,
  desempenhoDoProjeto,
  trechoCitavel,
  type PostMedido,
} from '../src/lib/aprendizado/desempenho'

let falhas = 0
function confere(nome: string, ok: boolean, detalhe?: string) {
  console.log(`${ok ? '✓' : '✗'} ${nome}${!ok && detalhe ? ` — ${detalhe}` : ''}`)
  if (!ok) falhas++
}

function post(p: Partial<PostMedido>): PostMedido {
  return {
    mediaType: 'CAROUSEL_ALBUM',
    caption: 'Legenda comum de teste',
    reach: 1000,
    engagement: 50,
    saved: 0,
    publishedAt: new Date(),
    ...p,
  }
}

async function parteA() {
  console.log('A. Travas de honestidade (sintético)\n')

  confere('amostra < 5 → bloco NENHUM', montarResumoDesempenho([post({}), post({}), post({})]) === null)

  // Campeão exige ≥3 por formato E vantagem ≥1,5×
  const semVantagem = montarResumoDesempenho([
    ...Array.from({ length: 4 }, () => post({ mediaType: 'VIDEO', reach: 1200 })),
    ...Array.from({ length: 4 }, () => post({ mediaType: 'CAROUSEL_ALBUM', reach: 1000 })),
  ])
  confere('vantagem 1,2× NÃO vira campeão', semVantagem?.formatoCampeao === null)

  const comVantagem = montarResumoDesempenho([
    ...Array.from({ length: 4 }, () => post({ mediaType: 'VIDEO', reach: 3000 })),
    ...Array.from({ length: 4 }, () => post({ mediaType: 'CAROUSEL_ALBUM', reach: 1000 })),
  ])
  confere(
    'vantagem 3× vira campeão (reel/vídeo)',
    comVantagem?.formatoCampeao?.formato === 'reel/vídeo' && comVantagem.formatoCampeao.razao === 3,
  )

  const poucoDoSegundo = montarResumoDesempenho([
    ...Array.from({ length: 5 }, () => post({ mediaType: 'VIDEO', reach: 5000 })),
    ...Array.from({ length: 2 }, () => post({ mediaType: 'CAROUSEL_ALBUM', reach: 100 })),
  ])
  confere('segundo formato com 2 posts NÃO sustenta campeão', poucoDoSegundo?.formatoCampeao === null)

  const seis = montarResumoDesempenho(Array.from({ length: 6 }, (_, i) => post({ reach: 100 + i })))
  confere('com 6 posts, "piores" cala (mínimo 8)', seis !== null && seis.piores.length === 0)

  confere(
    'legenda com preço NÃO é citada',
    trechoCitavel('Picanha por R$ 89,90 só hoje!') === '(legenda com dado comercial — não citada)',
  )
  confere(
    'legenda com horário NÃO é citada',
    trechoCitavel('Funcionamos das 11h às 23h todos os dias') === '(legenda com dado comercial — não citada)',
  )
  confere('legenda limpa é citada pela primeira linha', trechoCitavel('Sabor que abraça\nsegunda linha') === '"Sabor que abraça"')

  const bloco = comVantagem ? desempenhoParaPrompt(comVantagem) : ''
  confere('bloco avisa que é inclinação, não regra', bloco.includes('INCLINAÇÃO, nunca como regra'))
  confere('bloco reforça que dado factual vem SÓ da base', bloco.includes('SÓ da base'))
}

async function parteB() {
  console.log('\nB. Blocos reais (leitura pura da InstagramFeed)\n')
  const projetos = await db.project.findMany({
    where: { id: { in: [2, 4, 5, 11] } },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })
  for (const p of projetos) {
    const d = await desempenhoDoProjeto(p.id)
    console.log(`— ${p.name}:`)
    if (!d) {
      console.log('  (amostra pequena demais — bloco cala, como deve)\n')
      continue
    }
    for (const l of d.linhas) console.log(`  ${l}`)
    console.log(`  [bloco de prompt: ${d.bloco.length} chars]\n`)
  }
}

async function main() {
  await parteA()
  await parteB()
  console.log(falhas === 0 ? 'Tudo verde.' : `${falhas} falha(s).`)
  process.exit(falhas === 0 ? 0 : 1)
}
main()
