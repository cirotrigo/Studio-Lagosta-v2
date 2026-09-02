/**
 * A bancada de medição da melhoria — a MESMA peça, o MESMO prompt, n rodadas,
 * por cliente (F4, 02/09/2026).
 *
 * Para cada cliente escolhe 1 story + 1 feed recentes COM régua no banco
 * (arte de modelo, do canvas ou de IA que gravou `textos`/`slotValues`),
 * roda a melhoria de produção (`improveCreative`, o prompt real) `--rodadas`
 * vezes no tier pedido, confere cada resultado com a MESMA verificação por
 * visão da produção (régua, texto A MAIS, números) e monta uma folha de
 * contato por cliente: origem | rodada 1 | rodada 2. É a folha que o Ciro
 * julga no olho — foto intacta? serviço no rodapé? palavra-chave destacada?
 *
 * Não toca no banco e não cobra crédito: o custo é a fatura da OpenAI
 * (~US$ 0,008 por rodada em `low`, 0,045 em `medium`). Dry-run por padrão.
 *
 * Uso:
 *   npx tsx scripts/medir-melhoria-da-carteira.ts                 # lista as peças e a conta
 *   npx tsx scripts/medir-melhoria-da-carteira.ts --confirmar     # roda (low, 2 rodadas)
 *   npx tsx scripts/medir-melhoria-da-carteira.ts --confirmar --tier=medium --projetos=2,7 --rodadas=2
 *   npx tsx scripts/medir-melhoria-da-carteira.ts --confirmar --gen=<id>   # uma peça só
 */
import { PrismaClient } from '@prisma/client'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const db = new PrismaClient()
const SAIDA = path.join(process.cwd(), '.tmp-medicao-carteira')
const CUSTO: Record<string, number> = { low: 0.008, medium: 0.045, high: 0.165 }

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1]
}

async function pecasDoProjeto(projectId: number, quantas: { story: number; feed: number }) {
  const gens = await db.generation.findMany({
    where: { projectId, status: 'COMPLETED', resultUrl: { not: null }, sourceGenerationId: null },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: { id: true, resultUrl: true, templateName: true, fieldValues: true, createdAt: true, Template: { select: { type: true } } },
  })
  const { extractExpectedTexts } = await import('../src/lib/ai/creative-text-verification')
  const escolhidas: Array<{ id: string; resultUrl: string; nome: string; textos: string[]; formato: 'story' | 'feed' }> = []
  const falta = { ...quantas }
  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    const textos = extractExpectedTexts(fv)
    if (textos.length === 0) continue
    // O formato sai do que está GRAVADO (format/formato/finalSize) ou do tipo
    // do template; o nome ("Arte Rápida") não diz nada.
    const formato = String(fv.format ?? fv.formato ?? '').toLowerCase()
    const finalSize = String(fv.finalSize ?? '')
    const ehStory = formato
      ? formato.includes('story')
      : finalSize
        ? /x19/.test(finalSize)
        : g.Template?.type === 'STORY'
    const chave = ehStory ? 'story' : 'feed'
    if (falta[chave] <= 0) continue
    falta[chave]--
    escolhidas.push({ id: g.id, resultUrl: g.resultUrl!, nome: g.templateName ?? g.id, textos, formato: chave })
    if (falta.story <= 0 && falta.feed <= 0) break
  }
  return escolhidas
}

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const tier = (arg('tier') ?? 'low') as 'low' | 'medium' | 'high'
  const rodadas = Number(arg('rodadas') ?? 2)
  const genUnica = arg('gen')
  const projetosArg = arg('projetos')

  const projetos = await db.project.findMany({
    where: projetosArg ? { id: { in: projetosArg.split(',').map(Number) } } : {},
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  const plano: Array<{ projectId: number; nome: string; pecas: Awaited<ReturnType<typeof pecasDoProjeto>> }> = []
  for (const p of projetos) {
    if (genUnica) {
      const g = await db.generation.findFirst({ where: { id: genUnica, projectId: p.id }, select: { id: true, resultUrl: true, templateName: true, fieldValues: true } })
      if (!g?.resultUrl) continue
      const { extractExpectedTexts } = await import('../src/lib/ai/creative-text-verification')
      plano.push({ projectId: p.id, nome: p.name, pecas: [{ id: g.id, resultUrl: g.resultUrl, nome: g.templateName ?? g.id, textos: extractExpectedTexts(g.fieldValues), formato: 'story' }] })
      continue
    }
    const pecas = await pecasDoProjeto(p.id, { story: 1, feed: 1 })
    if (pecas.length > 0) plano.push({ projectId: p.id, nome: p.name, pecas })
  }

  const totalPecas = plano.reduce((t, p) => t + p.pecas.length, 0)
  console.log(`\n${plano.length} cliente(s), ${totalPecas} peça(s), ${rodadas} rodada(s) em ${tier} ≈ US$ ${(totalPecas * rodadas * (CUSTO[tier] ?? 0.008)).toFixed(2)}\n`)
  for (const p of plano) for (const x of p.pecas) console.log(`  ${p.nome.padEnd(22)} ${x.formato.padEnd(5)} ${x.nome.slice(0, 40).padEnd(40)} ${x.textos.length} bloco(s)  ${x.id}`)
  if (!confirmar) {
    console.log('\nDRY-RUN. Com --confirmar roda e escreve as folhas em .tmp-medicao-carteira/<cliente>/.')
    return
  }

  const { improveCreative } = await import('../src/lib/ai/openai-image-client')
  const { verifyImageTexts, transcreverTextosDaArte } = await import('../src/lib/ai/creative-text-verification')
  const { aplicarCaixaDaOrigem, CAIXA_DA_MANCHETE } = await import('../src/lib/ai/caixa-da-copy')
  const { melhoriaCompoeLogo, finalizarLogoDaMelhoria } = await import('../src/lib/ai/logo-na-melhoria')
  const { loadImprovementAssets } = await import('../src/lib/ai/improvement-assets-loader')
  const { fetchImageSource } = await import('../src/lib/ai/fetch-image-source')
  const sharp = (await import('sharp')).default

  const resumo: Array<Record<string, unknown>> = []
  for (const p of plano) {
    const assets = await loadImprovementAssets(p.projectId, { selectedLogoIds: [], selectedElementIds: [] })
    const compoe = melhoriaCompoeLogo(p.projectId) && assets.logos.length > 0
    const logoBuffer = compoe ? (await fetchImageSource(assets.logos[0].fileUrl)).buffer : null
    const pasta = path.join(SAIDA, `${p.projectId}-${p.nome.replace(/[^\w]+/g, '-').toLowerCase()}`)
    mkdirSync(pasta, { recursive: true })
    for (const peca of p.pecas) {
      const src = await fetchImageSource(peca.resultUrl)
      const meta = await sharp(src.buffer).metadata()
      const ehStory = (meta.height ?? 0) / (meta.width ?? 1) > 1.5
      const size = ehStory ? '1088x1936' : '1088x1360'
      const origemJpg = await sharp(src.buffer).jpeg({ quality: 90 }).toBuffer()
      // Como a produção: a caixa da origem manda no prompt.
      const transcricaoDaOrigem = await transcreverTextosDaArte(src.buffer).catch(() => [] as string[])
      const textosParaPrompt = aplicarCaixaDaOrigem(peca.textos, transcricaoDaOrigem, CAIXA_DA_MANCHETE.get(p.projectId))
      writeFileSync(path.join(pasta, `${peca.formato}-origem.jpg`), origemJpg)
      const quadros: Buffer[] = [origemJpg]
      const linhas: string[] = ['origem']
      for (let r = 1; r <= rodadas; r++) {
        const t0 = Date.now()
        try {
          let buf = await improveCreative({
            imageBuffer: src.buffer, mimeType: src.contentType, userRequest: '', size,
            brandColors: assets.colors, artDirection: assets.artDirection, brand: assets.brand,
            expectedTexts: textosParaPrompt, instrucaoImagem: null, arteSemTexto: false,
            fatosDoCliente: assets.fatos, quality: tier, logoCompor: compoe,
          })
          if (compoe && logoBuffer) {
            const ehStory2 = (meta.height ?? 0) / (meta.width ?? 1) > 1.5
            buf = (await finalizarLogoDaMelhoria(buf, logoBuffer, ehStory2 ? 'STORY' : 'FEED_PORTRAIT')).buffer
          }
          const check = await verifyImageTexts(buf, peca.textos, [], assets.brand?.projectName ?? null, transcricaoDaOrigem.length ? transcricaoDaOrigem : src.buffer)
          const jpg = await sharp(buf).jpeg({ quality: 90 }).toBuffer()
          writeFileSync(path.join(pasta, `${peca.formato}-r${r}.jpg`), jpg)
          quadros.push(jpg)
          const veredito = `${check.passed ? 'régua OK' : `faltou ${check.missing.length}`}${check.blocosAMais.comDado.length ? ` · A MAIS c/ dado: ${check.blocosAMais.comDado.join(' | ')}` : ''}${check.numerosNaoEsperados.length ? ` · nº: ${check.numerosNaoEsperados.join(',')}` : ''}`
          linhas.push(`r${r}: ${veredito} (${Math.round((Date.now() - t0) / 1000)}s)`)
          resumo.push({ cliente: p.nome, peca: peca.nome, formato: peca.formato, rodada: r, tier, passed: check.passed, missing: check.missing, aMaisComDado: check.blocosAMais.comDado, aMaisSemDado: check.blocosAMais.semDado, numeros: check.numerosNaoEsperados, segundos: Math.round((Date.now() - t0) / 1000) })
          console.log(`  ${p.nome} ${peca.formato} ${veredito}`)
        } catch (e) {
          linhas.push(`r${r}: FALHOU ${(e as Error).message}`)
          resumo.push({ cliente: p.nome, peca: peca.nome, formato: peca.formato, rodada: r, tier, erro: (e as Error).message })
          console.log(`  ${p.nome} ${peca.formato} r${r} FALHOU: ${(e as Error).message}`)
        }
      }
      // Folha de contato: origem | r1 | r2, mesma altura.
      const alt = 900
      const redimensionados = await Promise.all(quadros.map((q) => sharp(q).resize({ height: alt }).toBuffer()))
      const metas = await Promise.all(redimensionados.map((q) => sharp(q).metadata()))
      const larg = metas.reduce((t, m) => t + (m.width ?? 0) + 12, 12)
      let x = 12
      const composicao = metas.map((m, i) => { const item = { input: redimensionados[i], left: x, top: 12 }; x += (m.width ?? 0) + 12; return item })
      const folha = await sharp({ create: { width: larg, height: alt + 24, channels: 3, background: '#111111' } }).composite(composicao).jpeg({ quality: 85 }).toBuffer()
      writeFileSync(path.join(pasta, `${peca.formato}-folha.jpg`), folha)
      writeFileSync(path.join(pasta, `${peca.formato}-vereditos.txt`), linhas.join('\n'))
    }
  }
  writeFileSync(path.join(SAIDA, `resumo-${tier}.json`), JSON.stringify(resumo, null, 2))
  const ok = resumo.filter((r) => r.passed).length
  const aMais = resumo.filter((r) => Array.isArray(r.aMaisComDado) && (r.aMaisComDado as string[]).length > 0).length
  console.log(`\n${resumo.length} rodadas: régua OK em ${ok}, texto a mais com dado em ${aMais}. Folhas em ${SAIDA}/`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
