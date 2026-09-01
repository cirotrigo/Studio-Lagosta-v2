/**
 * Mede se a melhoria com PEDIDO VAZIO preserva a fotografia.
 *
 * O defeito (relatado pelo Ciro em 01/09/2026): pedir a melhoria sem escrever
 * nada e o modelo trocar a foto — no slide 5 do carrossel de quinta, duas
 * taças de vinho viraram bife com chopp, com horário e endereço INVENTADOS.
 *
 * 🔴 A primeira tentativa de conserto foi por REGRA e falhou. A regra 8 ("a
 * fotografia é intocável… não substitua a imagem… pixel por pixel") estava no
 * ar às 15:43 e as melhorias das 17:16-17:18 trocaram a foto assim mesmo.
 * Medido nas 8 melhorias do dia: 6 alteraram a fotografia, em AMBOS os tiers
 * (2 de 3 no `high`, 4 de 5 no `low`) — o tier não é a variável.
 *
 * A hipótese deste script é a oposta da que falhou: o problema não é falta de
 * regra, é EXCESSO de instrução. Com o pedido vazio, a seção
 * `[PEDIDO DO CLIENTE]` some e as ~100 linhas da direção de arte — "busque
 * aparência profissional de fotografia gastronômica", "priorize texturas",
 * "iluminação quente", "acabamento cinematográfico" — ficam sendo a única
 * instrução ativa. O modelo faz o que elas mandam: recompõe a peça.
 *
 * Variantes:
 *   A (controle) — o prompt de produção, como está hoje.
 *   B (mínimo)   — só o mapa das imagens, a identidade e a fidelidade. A
 *                  direção de arte inteira SAI.
 *
 * Uso:
 *   npx tsx scripts/medir-fidelidade-da-melhoria.ts <generationId>
 *   npx tsx scripts/medir-fidelidade-da-melhoria.ts <generationId> --confirmar
 *
 * Sem `--confirmar` NÃO gasta: escreve os dois prompts em disco para leitura.
 * Com ele, roda `rodadas` por variante (padrão 2 — n=1 não separa o efeito do
 * acaso, e este modelo não expõe seed). Não toca no banco e não cobra crédito;
 * o custo é a fatura da OpenAI (~US$ 0,008/rodada em `low`).
 */
import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'

const db = new PrismaClient()
const SAIDA = path.join(process.cwd(), '.tmp-fidelidade')

async function main() {
  const genId = process.argv[2]
  const confirmar = process.argv.includes('--confirmar')
  const rodadas = Number(process.argv.find((a) => a.startsWith('--rodadas='))?.split('=')[1] ?? 2)
  if (!genId) throw new Error('uso: npx tsx scripts/medir-fidelidade-da-melhoria.ts <generationId> [--confirmar]')

  const { buildPromptSections } = await import('../src/lib/ai/openai-image-client')
  const { loadBrandContext } = await import('../src/lib/brand/brand-context')

  const origem = await db.generation.findUnique({
    where: { id: genId },
    select: { id: true, projectId: true, resultUrl: true, templateName: true },
  })
  if (!origem?.resultUrl) throw new Error('geração sem imagem')
  const brand = await loadBrandContext(origem.projectId)

  const comum = {
    userRequest: '',
    references: [],
    brandColors: brand?.colors ?? [],
    artDirection: brand?.artDirection ?? null,
    brand,
    expectedTexts: [],
    instrucaoImagem: null,
  }

  // A — o prompt de produção
  const promptA = buildPromptSections(comum).map((s) => s.content).join('\n\n')

  // B — mínimo: fora a direção de arte, que é o convite a recompor
  const promptB = buildPromptSections(comum)
    .filter((s) => s.id !== 'direcao')
    .map((s) => s.content)
    .join('\n\n')

  mkdirSync(SAIDA, { recursive: true })
  writeFileSync(path.join(SAIDA, 'prompt-A-controle.txt'), promptA)
  writeFileSync(path.join(SAIDA, 'prompt-B-minimo.txt'), promptB)

  console.log(`origem: ${origem.templateName ?? origem.id} (projeto ${origem.projectId})`)
  console.log(`A (controle): ${promptA.length} chars`)
  console.log(`B (mínimo):   ${promptB.length} chars  (−${Math.round((1 - promptB.length / promptA.length) * 100)}%)`)
  console.log(`prompts escritos em ${SAIDA}/`)

  if (!confirmar) {
    console.log(`\nDRY-RUN. Com --confirmar: ${rodadas * 2} rodadas ≈ US$ ${(rodadas * 2 * 0.008).toFixed(3)} (tier low).`)
    return
  }

  const { fetchImageSource } = await import('../src/lib/ai/fetch-image-source')
  const { improveCreative } = await import('../src/lib/ai/openai-image-client')
  const { transcreverTextosDaArte } = await import('../src/lib/ai/creative-text-verification')
  const sharp = (await import('sharp')).default
  const src = await fetchImageSource(origem.resultUrl)
  writeFileSync(path.join(SAIDA, 'origem.jpg'), await sharp(src.buffer).jpeg({ quality: 92 }).toBuffer())

  // A régua sai da própria arte, como o runner faz agora.
  const regua = await transcreverTextosDaArte(src.buffer)
  console.log(`\nrégua por visão — ${regua.length} bloco(s) lidos da arte original:`)
  regua.forEach((t) => console.log(`   • ${t}`))

  const pedido = process.env.PEDIDO ?? ''
  if (pedido) console.log(`\npedido: "${pedido}"`)

  for (const enxuto of [false, true]) {
    const nome = enxuto ? 'enxuto' : 'completo'
    for (let i = 1; i <= rodadas; i++) {
      const t0 = Date.now()
      const buf = await improveCreative({
        imageBuffer: src.buffer,
        mimeType: src.contentType,
        userRequest: pedido,
        size: '1088x1360',
        brandColors: brand?.colors ?? [],
        artDirection: brand?.artDirection ?? null,
        brand,
        expectedTexts: regua,
        instrucaoImagem: null,
        quality: 'low',
        enxuto,
      })
      const arq = path.join(SAIDA, `${nome}-${i}.jpg`)
      writeFileSync(arq, await sharp(buf).jpeg({ quality: 92 }).toBuffer())
      console.log(`  ${nome} ${i}/${rodadas} → ${path.basename(arq)} (${Math.round((Date.now() - t0) / 1000)}s)`)
    }
  }
  console.log(`\nImagens em ${SAIDA}/`)
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => db.$disconnect())
