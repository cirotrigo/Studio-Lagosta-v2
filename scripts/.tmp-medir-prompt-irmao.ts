/**
 * Leitura-só, SEM chamar API de imagem: monta o prompt que um slide IRMÃO do
 * carrossel receberia hoje (By Rock, projeto 7) e mede onde cada bloco cai.
 *
 * Serve para responder por medida, não por hipótese: o LOOK SPINE e a
 * descrição decodificada do guia chegam ao modelo em que posição do prompt?
 */
import * as fs from 'fs'
import { buildArtePrompt, buildReferencePreamble } from '../src/lib/ai/image-prompt-builder'
import { loadBrandContext } from '../src/lib/brand/brand-context'
import { db } from '../src/lib/db'

// Descrição típica que o carousel-guide-decoder produziria para o guia do By
// Rock (formato real da função descricaoDoGuia).
const GUIA_DECODIFICADO = [
  '- Bloco de texto: canto inferior esquerdo, começando a ~62% da altura, margem de ~8% da largura, alinhado à esquerda.',
  '- Níveis de texto (repita a MESMA estrutura, trocando só as palavras):',
  '  1. título — "O QUE ROLA" · cor branco · caixa alta · o maior',
  '  2. subtítulo — "na segunda do rock" · cor vermelho · caixa baixa · metade do título',
  '- Elementos gráficos: onda sonora vermelha horizontal logo abaixo do subtítulo, ocupando ~40% da largura.',
  '- Véu de leitura: gradiente escuro de baixo para cima, densidade média.',
  '- Tratamento da foto: quente, alto contraste, sombras fechadas.',
].join('\n')

async function main() {
  const brand = await loadBrandContext(7)
  if (!brand) throw new Error('projeto 7 não encontrado')

  const refs = [
    { role: 'subject' as const, label: 'slide 3' },
    { role: 'series-guide' as const, label: 'guia aprovado' },
    { role: 'brand-card' as const },
  ]

  const preamble = buildReferencePreamble(refs)
  const body = buildArtePrompt({
    copy: ['SEGUNDA DO ROCK', 'com a banda da casa'],
    brand,
    refs,
    instrucaoImagem: null,
    blocoLogo:
      '[LOGO — DO NOT DRAW]\n⛔ Do NOT draw, letter or reproduce any logo…\nReserve the lower-right corner…',
    carrossel: {
      slideOrder: 3,
      totalSlides: 4,
      ehGuia: false,
      temGuia: true,
      descricaoDoGuia: GUIA_DECODIFICADO,
      elementosDoGuia: ["onda sonora vermelha horizontal logo abaixo do subtítulo, ocupando ~40% da largura"],
    },
  })
  const prompt = `${preamble}\n\n${body}`
  fs.writeFileSync('/tmp/prompt-irmao-simulado.txt', prompt)

  const total = prompt.length
  const marcos: Array<[string, string]> = [
    ['FIDELIDADE À FOTO', '[FIDELIDADE À FOTO]'],
    ['COPY verbatim', '[COPY — REPRODUZIR VERBATIM'],
    ['REGRAS DE COMPOSIÇÃO', '[REGRAS DE COMPOSIÇÃO]'],
    ['IDENTIDADE (DNA)', `[IDENTIDADE — ${brand.projectName}]`],
    ['TIPOGRAFIA TRAVADA', '[TIPOGRAFIA TRAVADA'],
    ['LOOK SPINE', '[LOOK SPINE'],
    ['item 6 (elementos gráficos)', '6. ELEMENTOS GRÁFICOS'],
    ['guia decodificado', 'O QUE O GUIA FAZ'],
    ['linha da onda sonora', 'onda sonora vermelha horizontal'],
  ]

  console.log(`prompt do IRMÃO: ${total} chars\n`)
  console.log('bloco                        | início | % do prompt')
  console.log('-----------------------------|--------|------------')
  for (const [nome, agulha] of marcos) {
    const i = prompt.indexOf(agulha)
    const pct = i < 0 ? '—' : `${((i / total) * 100).toFixed(0)}%`
    console.log(`${nome.padEnd(28)} | ${String(i).padStart(6)} | ${pct}`)
  }

  const iDna = prompt.indexOf(`[IDENTIDADE — ${brand.projectName}]`)
  const iLock = prompt.indexOf('[TIPOGRAFIA TRAVADA')
  console.log(`\nbloco de DNA: ${iLock - iDna} chars (${(((iLock - iDna) / total) * 100).toFixed(0)}% do prompt)`)

  // Quantas vezes o elemento gráfico é citado, e onde
  const ocorrencias = [...prompt.matchAll(/onda sonora/gi)].map((m) => m.index ?? -1)
  console.log(`"onda sonora" aparece ${ocorrencias.length}x, nas posições: ${ocorrencias.join(', ')}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
