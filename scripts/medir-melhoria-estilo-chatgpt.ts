/**
 * A/B da MELHORIA: o prompt de produção do Studio × um prompt CURTO no molde
 * do que o ChatGPT recebe — na MESMA arte, mesmo tier, mesma resolução.
 *
 * Nasceu em 05/09/2026 da conversa do ChatGPT "Melhorar diagramação gelato"
 * (Real Gelateria): com 8 palavras ("melhore a diagramacao, deixe no estilo
 * real gelato") e a arte do editor como única imagem, o ChatGPT devolveu uma
 * peça com serifa da marca, pills de unidade, filetes e hierarquia — que o
 * Ciro aceitou e iterou por chat. O prompt de produção do Studio, por desenho
 * (regras da casa de 04-05/09), PROÍBE justamente essa reestruturação.
 *
 * É a F0 do plano `docs/PLANO-2026-09-05-ARTES-COMO-O-CHATGPT.md`: quatro
 * peças reais, de origens diferentes (export do editor sem foto, export do
 * editor de agenda, compositor com halo, canvas com marca em `compor`), para
 * saber ONDE o prompt curto ajuda e onde ele destrói uma diagramação aprovada.
 *
 * O que mede:
 *  - o mesmo verificador de texto da produção (`verifyImageTexts`), com a copy
 *    lida pela MESMA régua da produção (banco → linhagem → visão sem a marca);
 *  - blocos a mais (com e sem dado) e luz média (a foto tem de sair como entrou);
 *  - e a folha de contato (origem | studio | curto) para o olho julgar o que
 *    número nenhum julga.
 *
 * NÃO escreve no banco, NÃO cobra crédito, NÃO registra LearningSignal. O
 * custo é a fatura da OpenAI: ~US$ 0,05 por rodada em `medium`, ~0,17 em `high`.
 *
 * Uso:
 *   npx tsx scripts/medir-melhoria-estilo-chatgpt.ts                      # dry-run: imprime os dois prompts e a conta
 *   npx tsx scripts/medir-melhoria-estilo-chatgpt.ts --confirmar
 *   npx tsx scripts/medir-melhoria-estilo-chatgpt.ts --confirmar --gen=<id> --tier=medium --rodadas=4
 *   npx tsx scripts/medir-melhoria-estilo-chatgpt.ts --confirmar --peca=winevix --so=curto
 *   npx tsx scripts/medir-melhoria-estilo-chatgpt.ts --folha                # só monta a folha de contato do que já existe
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { db } from '../src/lib/db'
import {
  runImageEdit,
  improveCreative,
  buildPromptSections,
  type RawEditImage,
  type ReferenceImage,
} from '../src/lib/ai/openai-image-client'
import {
  verifyImageTexts,
  loadExpectedTextsForGeneration,
  loadExpectedTextsDaLinhagem,
  transcreverTextosDaArte,
} from '../src/lib/ai/creative-text-verification'
import { semTextosDaMarca } from '../src/lib/ai/text-comparison'
import { loadBrandContext } from '../src/lib/brand/brand-context'
import { getBrandReferenceCard } from '../src/lib/ai/brand-reference-card'
import { renderTypeSpecimen } from '../src/lib/ai/type-specimen'
import { fetchImageSource } from '../src/lib/ai/fetch-image-source'
import { inferFormatFromDimensions, OPENAI_INPUT_SIZE } from '../src/lib/ai/creative-improvement-format'

const RAIZ = path.join(process.cwd(), '.tmp-medicao-estilo-chatgpt')
const CUSTO: Record<string, number> = { low: 0.008, medium: 0.045, high: 0.165 }

/** As quatro peças da F0 — uma por origem. */
const PECAS: Record<string, { gen: string; nota: string }> = {
  real: { gen: 'cmtojggac0010l8046i9xsg6t', nota: 'Real Gelateria · export do editor, tabela de horários, sem foto' },
  winevix: { gen: 'cmtndl3fa0003gm0a72w6bl0u', nota: 'Wine Vix · export do editor, agenda de feriado' },
  quintal: { gen: 'cmtoe7fsg0001ie04nhthf7uq', nota: 'O Quintal · compositor com halo (origem da melhoria reprovada em 05/09)' },
  tero: { gen: 'cmtgin2l4002fswymke742xyx', nota: 'TERO · canvas de design, marca em compor' },
}

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1]
}

/**
 * O prompt CURTO — molde do guia oficial de prompting dos GPT Image models
 * (ordem: cena → sujeito → detalhes → restrições; copy entre aspas e
 * verbatim; referências por índice; lista de preservação explícita) e do
 * pedido real do ChatGPT. Nada de regras numeradas: quem decide a
 * diagramação é o modelo, lendo o manual da marca.
 */
function promptCurto(args: {
  nomeDaMarca: string
  temManual: boolean
  temPrancha: boolean
  copy: string[]
  temFoto: boolean
  formato: string
}): string {
  let n = 2
  const refs: string[] = []
  if (args.temManual)
    refs.push(
      `Image ${n++} is the official brand manual of ${args.nomeDaMarca}: logo, palette, typography and graphic elements. It is the ONLY source of fonts, colors and ornaments.`,
    )
  if (args.temPrancha)
    refs.push(
      `Image ${n++} is the type specimen of the brand's real fonts: shape every glyph exactly like it. Never copy its layout or sample strings.`,
    )
  const foto = args.temFoto
    ? `The photograph in Image 1 is the final scene: keep it exactly as it is (framing, light, colours, every object) — only the graphic layer changes, and it never covers the subject of the photo.`
    : `Image 1 has no photograph; keep it a typographic piece — do not add one.`
  const formato = args.formato === 'STORY' ? 'Instagram story (9:16)' : args.formato === 'SQUARE' ? 'Instagram post (1:1)' : 'Instagram feed post (4:5)'
  return [
    `You are the art director of ${args.nomeDaMarca}. Image 1 is a finished ${formato} of this brand.`,
    `Redesign its layout in the brand's own style so it looks like a piece from the brand's feed: refined hierarchy, generous white space, the brand's typefaces per level, one accent colour, delicate ornaments only where they help reading.`,
    foto,
    ...refs,
    args.copy.length > 0
      ? `COPY — render EXACTLY these blocks, verbatim, each exactly once, and nothing else:\n${args.copy.map((b) => `"${b}"`).join('\n')}`
      : `This piece has NO text and must stay without text.`,
    `No extra text, no tagline, no hashtag, no address, no phone, no price. The brand logo appears once, exactly as the official file. Do not draw a second logo. Legible on a phone screen.`,
    args.formato === 'STORY' ? `Keep the Instagram safe areas clear: nothing important in the top 1/8 and bottom 1/8 of the frame.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function luzMedia(buf: Buffer): Promise<number> {
  const s = await sharp(buf).greyscale().stats()
  return Math.round(s.channels[0].mean * 10) / 10
}

/** A régua da produção: banco → linhagem → visão descontando a marca. */
async function reguaDaPeca(genId: string, origem: Buffer, brand: { projectName: string; logoUrl: string | null }) {
  let textos = await loadExpectedTextsForGeneration(genId)
  let fonte: 'banco' | 'linhagem' | 'visao' | 'nenhuma' = textos.length ? 'banco' : 'nenhuma'
  if (textos.length === 0) {
    const l = await loadExpectedTextsDaLinhagem(genId)
    if (l.textos.length) {
      textos = l.textos
      fonte = 'linhagem'
    }
  }
  if (textos.length === 0) {
    const completa = await transcreverTextosDaArte(origem)
    const logo = brand.logoUrl ? await fetchImageSource(brand.logoUrl).catch(() => null) : null
    const textosDaLogo = logo ? await transcreverTextosDaArte(logo.buffer) : []
    const sem = semTextosDaMarca(completa, { nomeDaMarca: brand.projectName, textosDaLogo })
    textos = sem.regua
    fonte = textos.length ? 'visao' : 'nenhuma'
  }
  return { textos, fonte }
}

async function folhaDeContato(dir: string) {
  const arquivos = (await fs.readdir(dir)).filter((f) => /^(studio|curto)-\d+\.png$/.test(f)).sort()
  const studio = arquivos.filter((f) => f.startsWith('studio'))
  const curto = arquivos.filter((f) => f.startsWith('curto'))
  const W = 360
  const H = 640
  const cols = Math.max(studio.length, curto.length) + 1
  const largura = cols * (W + 12) + 12
  const altura = 2 * (H + 12) + 12
  const celulas: sharp.OverlayOptions[] = []
  const origem = await sharp(path.join(dir, 'origem.jpg')).resize(W, H, { fit: 'contain', background: '#fff' }).png().toBuffer()
  celulas.push({ input: origem, left: 12, top: 12 })
  for (const [linha, lista] of [[0, studio], [1, curto]] as Array<[number, string[]]>) {
    for (let i = 0; i < lista.length; i++) {
      const buf = await sharp(path.join(dir, lista[i])).resize(W, H, { fit: 'contain', background: '#fff' }).png().toBuffer()
      celulas.push({ input: buf, left: 12 + (i + 1) * (W + 12), top: 12 + linha * (H + 12) })
    }
  }
  await sharp({ create: { width: largura, height: altura, channels: 3, background: '#ffffff' } })
    .composite(celulas)
    .jpeg({ quality: 85 })
    .toFile(path.join(dir, 'folha-de-contato.jpg'))
}

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const soFolha = process.argv.includes('--folha')
  const tier = (arg('tier') ?? 'medium') as 'low' | 'medium' | 'high'
  const rodadas = Number(arg('rodadas') ?? 4)
  const offset = Number(arg('offset') ?? 0)
  const so = arg('so') // 'studio' | 'curto'
  const peca = arg('peca') ?? 'real'
  const genId = arg('gen') ?? PECAS[peca]?.gen
  if (!genId) throw new Error(`peça desconhecida: ${peca} (${Object.keys(PECAS).join(', ')})`)
  const saida = path.join(RAIZ, arg('gen') ? genId : peca)
  await fs.mkdir(saida, { recursive: true })

  if (soFolha) {
    await folhaDeContato(saida)
    console.log(`folha em ${path.join(saida, 'folha-de-contato.jpg')}`)
    return
  }

  const gen = await db.generation.findUnique({ where: { id: genId }, select: { id: true, projectId: true, resultUrl: true, fieldValues: true } })
  if (!gen?.resultUrl) throw new Error(`Generation ${genId} sem resultUrl`)
  const brand = await loadBrandContext(gen.projectId)
  if (!brand) throw new Error('sem brand context')

  const origem = await fetchImageSource(gen.resultUrl)
  const meta = await sharp(origem.buffer).metadata()
  const formato = inferFormatFromDimensions(meta.width ?? 1080, meta.height ?? 1920)
  const size = OPENAI_INPUT_SIZE[formato]
  const [w, h] = size.split('x').map(Number)
  const origemBuf = await sharp(origem.buffer).resize(w, h, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer()
  await fs.writeFile(path.join(saida, 'origem.jpg'), origemBuf)

  const [card, prancha, logo, regua] = await Promise.all([
    getBrandReferenceCard(brand).catch(() => null),
    renderTypeSpecimen(brand).catch(() => null),
    brand.logoUrl ? fetchImageSource(brand.logoUrl).catch(() => null) : Promise.resolve(null),
    reguaDaPeca(genId, origemBuf, brand),
  ])
  const copy = regua.textos
  // Peça sem foto = a arte é só tipografia sobre fundo liso (export de tabela).
  // Heurística barata: desvio-padrão baixo da luminância.
  const stats = await sharp(origemBuf).greyscale().stats()
  const temFoto = stats.channels[0].stdev > 45
  const source = ((gen.fieldValues ?? {}) as { source?: string }).source ?? 'editor/export'

  const pedido = 'melhore a diagramação, deixe no estilo da marca'
  const refsStudio: ReferenceImage[] = logo
    ? [{ buffer: logo.buffer, mimeType: logo.contentType || 'image/png', role: 'logo', label: 'logo oficial' }]
    : []
  const promptStudio = buildPromptSections({
    userRequest: pedido,
    references: refsStudio,
    brandColors: brand.colors.map((c) => ({ name: c.name, hexCode: c.hexCode })),
    artDirection: null,
    brand,
    expectedTexts: copy,
    arteSemTexto: copy.length === 0,
  })
    .map((s) => s.content)
    .join('\n\n')

  const imagensCurto: RawEditImage[] = [{ buffer: origemBuf, mimeType: 'image/jpeg', name: '1-origem.jpg' }]
  if (card) imagensCurto.push({ buffer: card.buffer, mimeType: card.mimeType, name: `2-manual.${card.mimeType.includes('png') ? 'png' : 'jpg'}` })
  if (prancha) imagensCurto.push({ buffer: prancha, mimeType: 'image/png', name: `${imagensCurto.length + 1}-prancha.png` })
  const promptCurtoTxt = promptCurto({ nomeDaMarca: brand.projectName, temManual: !!card, temPrancha: !!prancha, copy, temFoto, formato })

  await fs.writeFile(path.join(saida, 'prompt-studio.txt'), promptStudio)
  await fs.writeFile(path.join(saida, 'prompt-curto.txt'), promptCurtoTxt)
  await fs.writeFile(path.join(saida, 'regua.json'), JSON.stringify({ fonte: regua.fonte, copy, temFoto, formato, source }, null, 2))

  const variantes = (['studio', 'curto'] as const).filter((v) => !so || v === so)
  console.log(`[${peca}] ${PECAS[peca]?.nota ?? genId} · ${brand.projectName} · ${formato} ${size} · source=${source} · foto=${temFoto ? 'sim' : 'não'}`)
  console.log(`régua (${regua.fonte}): ${copy.length} bloco(s) ${JSON.stringify(copy).slice(0, 300)}`)
  console.log(`prompt studio: ${promptStudio.length} chars | prompt curto: ${promptCurtoTxt.length} chars | manual: ${card?.origem ?? 'não'} | prancha: ${prancha ? 'sim' : 'não'}`)
  console.log(`tier ${tier} · ${rodadas} rodada(s) × ${variantes.length} variante(s) · custo ~US$ ${(CUSTO[tier] * rodadas * variantes.length).toFixed(2)} · luz da origem ${await luzMedia(origemBuf)}`)
  if (!confirmar) {
    console.log(`\ndry-run — prompts gravados em ${saida}. Rode com --confirmar para gerar.`)
    return
  }

  const linhas: string[] = []
  for (const variante of variantes) {
    for (let r = 1; r <= rodadas; r++) {
      const t0 = Date.now()
      let buf: Buffer
      try {
        buf =
          variante === 'studio'
            ? await improveCreative({
                imageBuffer: origemBuf,
                mimeType: 'image/jpeg',
                userRequest: pedido,
                size,
                references: refsStudio,
                brandColors: brand.colors.map((c) => ({ name: c.name, hexCode: c.hexCode })),
                brand,
                expectedTexts: copy,
                arteSemTexto: copy.length === 0,
                quality: tier,
              })
            : await runImageEdit({ images: imagensCurto, prompt: promptCurtoTxt, size, quality: tier })
      } catch (e) {
        const linha = `${variante} #${r + offset}: FALHOU ${e instanceof Error ? e.message : String(e)}`
        console.log(linha)
        linhas.push(linha)
        continue
      }
      const segs = Math.round((Date.now() - t0) / 1000)
      const arquivo = path.join(saida, `${variante}-${r + offset}.png`)
      await fs.writeFile(arquivo, buf)
      let regTxt = 'sem régua'
      if (copy.length > 0) {
        try {
          const check = await verifyImageTexts(buf, copy, [], brand.projectName, origemBuf)
          regTxt = `texto ${check.passed ? 'OK' : 'FALTOU ' + JSON.stringify(check.missing)} · a mais ${JSON.stringify(check.blocosAMais)}`
        } catch (e) {
          regTxt = `visão falhou: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      const linha = `${variante} #${r + offset}: ${segs}s · ${regTxt} · luz ${await luzMedia(buf)}`
      console.log(linha)
      linhas.push(linha)
    }
  }
  await fs.appendFile(path.join(saida, 'RESULTADO.txt'), linhas.join('\n') + '\n')
  await folhaDeContato(saida)
  console.log(`folha em ${path.join(saida, 'folha-de-contato.jpg')}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
