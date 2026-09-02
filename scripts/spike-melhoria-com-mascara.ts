/**
 * SPIKE F5 (02/09/2026): rediagramar o texto SEM regenerar a fotografia.
 *
 * `images.edit` aceita uma MÁSCARA: a área transparente é a única que o modelo
 * pode redesenhar, o resto sai pixel por pixel. A hipótese: com a máscara
 * cobrindo só as faixas onde o texto pode pousar, a melhoria vira o que o
 * Ciro descreveu ("apenas diagramar e posicionar melhor os textos") por
 * construção — a foto fora da máscara é intocável de verdade.
 *
 * A máscara sai das CAIXAS DE TEXTO da página (`Page.layers`) da arte de
 * origem, crescidas por uma margem, unidas em faixas (topo / rodapé), mais uma
 * faixa alternativa do lado calmo da foto para o modelo poder MOVER o texto.
 *
 * Mede: (a) a foto fora da máscara mudou? (diferença de pixels, tem de ser 0);
 * (b) a régua e o texto A MAIS, com a verificação de produção. Não toca no
 * banco nem em crédito; só a fatura da OpenAI. Dry-run escreve só a máscara.
 *
 * Uso:
 *   npx tsx scripts/spike-melhoria-com-mascara.ts <generationId>
 *   npx tsx scripts/spike-melhoria-com-mascara.ts <generationId> --confirmar [--rodadas=2] [--tier=low]
 */
import { PrismaClient } from '@prisma/client'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const db = new PrismaClient()
const SAIDA = path.join(process.cwd(), '.tmp-spike-mascara')

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1]
}

async function main() {
  const genId = process.argv[2]
  const confirmar = process.argv.includes('--confirmar')
  const rodadas = Number(arg('rodadas') ?? 2)
  const tier = (arg('tier') ?? 'low') as 'low' | 'medium' | 'high'
  if (!genId) throw new Error('uso: npx tsx scripts/spike-melhoria-com-mascara.ts <generationId> [--confirmar]')

  const gen = await db.generation.findUnique({ where: { id: genId }, select: { id: true, projectId: true, resultUrl: true, templateName: true, fieldValues: true } })
  if (!gen?.resultUrl) throw new Error('geração sem imagem')
  const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
  const pageId = typeof fv.pageId === 'string' ? fv.pageId : null
  if (!pageId) throw new Error('esta arte não tem pageId no fieldValues — o spike precisa das caixas de texto da página (arte de modelo ou do canvas)')
  const page = await db.page.findUnique({ where: { id: pageId }, select: { layers: true, width: true, height: true } })
  if (!page) throw new Error('página não encontrada')

  const { lerCamadas } = await import('../src/lib/posts/page-layers')
  const camadas = lerCamadas(page.layers)
  if (!camadas.legivel) throw new Error('camadas ilegíveis')
  const textos = camadas.camadas.filter((l: any) => l.type === 'text' && l.visible !== false)
  const { uniao, agruparEmBlocos } = await import('../src/lib/creatives/halo/halo')
  const rects = textos.map((l: any) => ({ rect: { x: l.position?.x ?? 0, y: l.position?.y ?? 0, width: l.size?.width ?? 0, height: l.size?.height ?? 0 } }))
  const grupos = agruparEmBlocos(rects).map((g) => uniao(g.map((i) => i.rect))!).filter(Boolean)
  const { extractExpectedTexts, verifyImageTexts } = await import('../src/lib/ai/creative-text-verification')
  const regua = extractExpectedTexts(fv)

  const sharp = (await import('sharp')).default
  const { fetchImageSource } = await import('../src/lib/ai/fetch-image-source')
  const src = await fetchImageSource(gen.resultUrl)
  const meta = await sharp(src.buffer).metadata()
  const W = meta.width ?? page.width
  const H = meta.height ?? page.height
  const sx = W / page.width
  const sy = H / page.height
  const MARGEM = 0.06 * H

  // A máscara: opaca (preta) em tudo; TRANSPARENTE nas faixas de texto (em
  // toda a largura, para o modelo poder mover o bloco na horizontal) e na
  // faixa oposta (para poder mover na vertical).
  const faixas: Array<{ y0: number; y1: number }> = grupos.map((g) => ({ y0: Math.max(0, g.y * sy - MARGEM), y1: Math.min(H, (g.y + g.height) * sy + MARGEM) }))
  const cobreTopo = faixas.some((f) => f.y0 < H * 0.3)
  const cobreRodape = faixas.some((f) => f.y1 > H * 0.7)
  if (!cobreTopo) faixas.push({ y0: H * 0.07, y1: H * 0.32 })
  else if (!cobreRodape) faixas.push({ y0: H * 0.7, y1: H * 0.93 })
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#000"/>${faixas
    .map((f) => `<rect x="0" y="${Math.round(f.y0)}" width="${W}" height="${Math.round(f.y1 - f.y0)}" fill="#000" fill-opacity="0" />`)
    .join('')}</svg>`
  // SVG com fill-opacity 0 sobre fundo preto opaco → precisa compor: desenha o
  // fundo e depois "fura" as faixas. Faz-se em raw para garantir alpha 0.
  const mascaraRaw = Buffer.alloc(W * H * 4, 0)
  for (let i = 0; i < W * H; i++) mascaraRaw[i * 4 + 3] = 255
  for (const f of faixas) {
    for (let y = Math.max(0, Math.round(f.y0)); y < Math.min(H, Math.round(f.y1)); y++) {
      for (let x = 0; x < W; x++) mascaraRaw[(y * W + x) * 4 + 3] = 0
    }
  }
  const mascaraPng = await sharp(mascaraRaw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  mkdirSync(SAIDA, { recursive: true })
  writeFileSync(path.join(SAIDA, `${genId}-mascara.png`), mascaraPng)
  writeFileSync(path.join(SAIDA, `${genId}-mascara.svg`), svg)
  writeFileSync(path.join(SAIDA, `${genId}-origem.jpg`), await sharp(src.buffer).jpeg({ quality: 92 }).toBuffer())
  const fracao = faixas.reduce((t, f) => t + (f.y1 - f.y0), 0) / H
  console.log(`origem ${W}x${H}, ${grupos.length} bloco(s) de texto, ${faixas.length} faixa(s) editáveis = ${Math.round(fracao * 100)}% da altura; régua: ${regua.length} bloco(s)`)
  if (!confirmar) {
    console.log(`DRY-RUN — máscara em ${SAIDA}/. Com --confirmar: ${rodadas} rodada(s) em ${tier}.`)
    return
  }

  const { runImageEdit } = await import('../src/lib/ai/openai-image-client')
  const { loadImprovementAssets } = await import('../src/lib/ai/improvement-assets-loader')
  const assets = await loadImprovementAssets(gen.projectId, { selectedLogoIds: [], selectedElementIds: [] })
  const fontes = [assets.brand?.fonts.title && `títulos em ${assets.brand.fonts.title}`, assets.brand?.fonts.body && `corpo em ${assets.brand.fonts.body}`].filter(Boolean).join(', ')
  const prompt = [
    `Esta é uma arte de Instagram de ${assets.brand?.projectName ?? 'um restaurante'}. Só a área transparente da máscara pode mudar; a fotografia fora dela permanece exatamente como está.`,
    fontes && `Tipografia da marca: ${fontes}.`,
    'Rediagrame os textos dentro da área editável: melhore a hierarquia, o respiro e o destaque das palavras-chave (peso ou cor da marca), mantendo cada bloco de texto palavra por palavra:',
    ...regua.map((t) => `- "${t}"`),
    `A arte tem exatamente ${regua.length} bloco(s) de texto — nem um a mais. Não escreva horário, endereço, preço ou qualquer texto fora desta lista. Se precisar de contraste, use um véu suave e LOCAL atrás do texto, nunca uma tarja.`,
  ].filter(Boolean).join('\n')
  writeFileSync(path.join(SAIDA, `${genId}-prompt.txt`), prompt)
  const size = H / W > 1.5 ? '1088x1936' : '1088x1360'
  const origemPng = await sharp(src.buffer).resize(1088, H / W > 1.5 ? 1936 : 1360, { fit: 'cover' }).png().toBuffer()
  const mascara1088 = await sharp(mascaraPng).resize(1088, H / W > 1.5 ? 1936 : 1360, { fit: 'fill' }).png().toBuffer()

  for (let r = 1; r <= rodadas; r++) {
    const t0 = Date.now()
    const buf = await runImageEdit({
      images: [{ buffer: origemPng, mimeType: 'image/png', name: 'original.png' }],
      mask: { buffer: mascara1088, mimeType: 'image/png', name: 'mask.png' },
      prompt, size, quality: tier,
    })
    writeFileSync(path.join(SAIDA, `${genId}-mascara-r${r}.jpg`), await sharp(buf).jpeg({ quality: 92 }).toBuffer())
    // (a) a foto fora da máscara mudou? média da diferença absoluta nos pixels opacos.
    const a = await sharp(origemPng).raw().toBuffer({ resolveWithObject: true })
    const b = await sharp(buf).resize(a.info.width, a.info.height, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
    const m = await sharp(mascara1088).resize(a.info.width, a.info.height, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
    let soma = 0, n = 0
    const ch = a.info.channels, chB = b.info.channels, chM = m.info.channels
    for (let i = 0; i < a.info.width * a.info.height; i++) {
      if (m.data[i * chM + (chM - 1)] === 0) continue // área editável
      for (let c = 0; c < 3; c++) soma += Math.abs(a.data[i * ch + c] - b.data[i * chB + c])
      n += 3
    }
    const diffFora = n ? soma / n : 0
    const check = regua.length ? await verifyImageTexts(buf, regua, [], assets.brand?.projectName ?? null) : null
    console.log(`r${r}: ${Math.round((Date.now() - t0) / 1000)}s · diferença média FORA da máscara: ${diffFora.toFixed(2)} (0 = foto intacta)${check ? ` · régua ${check.passed ? 'OK' : `faltou ${check.missing.length}`}${check.blocosAMais.comDado.length ? ` · A MAIS c/ dado: ${check.blocosAMais.comDado.join(' | ')}` : ''}` : ''}`)
  }
  console.log(`\nSaída em ${SAIDA}/`)
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 }).finally(() => db.$disconnect())
