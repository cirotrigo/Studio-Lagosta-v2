/**
 * Mede o que a trilha `imagem` (cena SEM texto) entrega, em dois eixos:
 *
 *   - RESOLUÇÃO — 1K, 2K e 4K do mesmo modelo Gemini;
 *   - MODELO    — `nano-banana-2` (Gemini) contra `gpt-image-2` (OpenAI).
 *
 * POR QUE ESTE SCRIPT EXISTE
 *
 * A finalização reduzia TODA geração ao tamanho exato de publicação. Esse resize
 * é da trilha `arte` e lá está certo — nasceu para normalizar os múltiplos de 16
 * do gpt-image (1088 → 1080, downscale de 0,7%) e seu propósito documentado era
 * PARAR DE FAZER UPSCALE (`creative-improvement-format.ts:9`). A trilha `imagem`
 * caiu nele por herança, no mesmo commit que expôs `resolution` (`6a15cb62`,
 * 09/08/2026). Medido em 12/08: o `nano-banana-pro` em 4K devolve 3072x5504
 * (16,9 MP) e era gravado em 1080x1920 — 87,7% dos pixels no lixo.
 *
 * ⚠️ NÃO TOCA NO BANCO E NÃO GASTA CRÉDITO DO STUDIO.
 *
 * Chama `generateImageWithGemini`/`runImageEdit` direto, que é exatamente o que
 * `generateOnce` faz — pulando Generation, fila durável, dedução de créditos,
 * sinais de aprendizado e upload para Blob/Drive. O único acesso ao banco é a
 * LEITURA opcional de `--da-geracao`. O que ele gasta é a FATURA do provider:
 * por isso a primeira chamada não gera nada, imprime o plano e o custo, e só
 * `--confirmar` executa. (Mesmo contrato mecânico do `executar-plano`.)
 *
 * ⚠️ LIMITE HONESTO: nenhum dos dois clientes expõe seed, então as imagens NÃO
 * são a mesma cena. O prompt e as referências são byte-idênticos, mas a
 * composição varia — e a variância do laplaciano mede a CENA quando há uma
 * repetição só. Com `--repeticoes 3` a média fica utilizável; com 1, decida
 * pelo recorte 1:1.
 *
 * USO
 *   # o plano e a conta, sem gastar nada:
 *   npx tsx scripts/medir-resolucao-trilha-imagem.ts --da-geracao <generationId>
 *
 *   # eixo RESOLUÇÃO (1K/2K/4K no nano-banana-pro):
 *   npx tsx scripts/medir-resolucao-trilha-imagem.ts --da-geracao <id> --confirmar
 *
 *   # eixo MODELO (nano-banana-2 × gpt-image-2, ambos sem texto):
 *   npx tsx scripts/medir-resolucao-trilha-imagem.ts --da-geracao <id> \
 *     --modelos nano-banana-2,gpt-image-2 --resolucoes 2K --confirmar
 *
 *   # prompt e referência à mão (sem banco nenhum):
 *   npx tsx scripts/medir-resolucao-trilha-imagem.ts \
 *     --prompt-arquivo prompt.txt --ref foto.jpg:subject --ref salao.jpg:anchor-ambient
 *
 * SAÍDA
 *   <saida>/nativo-<variante>-r<n>.jpg   o que o modelo devolveu, intocado
 *   <saida>/final-<variante>-r<n>.jpg    normalizado em 1080, para comparar
 *   <saida>/resultado.json               todas as medições
 *   <saida>/comparacao.html              recortes 1:1 lado a lado, autocontido
 */
// Carrega o `.env` (produção) — é de onde vêm as chaves do Gemini/OpenAI e as
// credenciais do Drive. Convenção da casa (`analyze-drive-images.ts:21`), e
// não `dotenv-cli`, que cai em silêncio no arquivo seguinte quando o `-e`
// aponta para um que não existe.
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import sharp from 'sharp'

import { generateImageWithGemini } from '../src/lib/ai/gemini-image-client'
import { runImageEdit } from '../src/lib/ai/openai-image-client'
import { googleDriveService } from '../src/server/google-drive-service'

// ── Constantes espelhadas da produção ────────────────────────────────────────
// Deliberadamente COPIADAS, não importadas: os módulos de origem puxam `@/`,
// Prisma e o SDK de IA. O que importa é que os números batam — e eles estão
// anotados com a origem para a divergência ser visível na próxima leitura.

/** `creative-generation-service.ts:55-58` + `creative-improvement-format.ts` */
const FORMATOS = {
  story: { aspectRatio: '9:16', final: { width: 1080, height: 1920 }, openaiSize: '1088x1936' },
  feed: { aspectRatio: '4:5', final: { width: 1080, height: 1350 }, openaiSize: '1088x1360' },
  quadrado: { aspectRatio: '1:1', final: { width: 1080, height: 1080 }, openaiSize: '1088x1088' },
} as const
type Formato = keyof typeof FORMATOS

/** `creative-generation-runner.ts:54,57` */
const MAX_INPUT_DIM = 4000
const MAX_REF_DIM = 3000

/**
 * Preço OFICIAL por imagem, levantado em 12/08/2026, e o custo em créditos que
 * o Studio cobra (`image-models-config.ts` + `feature-config.ts`).
 *
 * O gpt-image-2 é cobrado por tamanho e qualidade, não por "resolução": o valor
 * abaixo é o de `high` nos tamanhos de 1088 que a casa usa.
 */
const PRECO: Record<string, { usd: Record<string, number>; creditos: Record<string, number> }> = {
  'nano-banana-2': { usd: { '1K': 0.101, '2K': 0.101, '4K': 0.101 }, creditos: { '1K': 10, '2K': 10, '4K': 10 } },
  'nano-banana-pro': { usd: { '1K': 0.134, '2K': 0.134, '4K': 0.24 }, creditos: { '1K': 15, '2K': 15, '4K': 30 } },
  'gpt-image-2': { usd: { high: 0.165 }, creditos: { high: 25 } },
}

/** Comercial de 11/08 (R$ 5,1573) + IOF 3,5% + spread de cartão ~2%. */
const CAMBIO_PADRAO = 5.4446

const RESOLUCOES_VALIDAS = ['1K', '2K', '4K'] as const
type Resolucao = (typeof RESOLUCOES_VALIDAS)[number]

const ehGpt = (modelo: string) => modelo.startsWith('gpt-image')

/** Uma combinação concreta a gerar. */
interface Variante {
  rotulo: string
  modelo: string
  /** null no gpt-image, que é dirigido por `size`, não por resolução. */
  resolucao: Resolucao | null
  usd: number
  creditos: number
}

// ── Argumentos ───────────────────────────────────────────────────────────────

interface Opcoes {
  daGeracao: string | null
  promptArquivo: string | null
  promptTexto: string | null
  refs: Array<{ origem: string; papel: string }>
  formato: Formato
  modelos: string[]
  resolucoes: Resolucao[]
  repeticoes: number
  saida: string
  cambio: number
  confirmar: boolean
}

function lerOpcoes(argv: string[]): Opcoes {
  const o: Opcoes = {
    daGeracao: null,
    promptArquivo: null,
    promptTexto: null,
    refs: [],
    formato: 'story',
    modelos: ['nano-banana-pro'],
    resolucoes: ['1K', '2K', '4K'],
    repeticoes: 1,
    saida: path.join(process.cwd(), '.tmp-medicao-resolucao'),
    cambio: CAMBIO_PADRAO,
    confirmar: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const proximo = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`Faltou o valor de ${a}`)
      return v
    }
    switch (a) {
      case '--da-geracao':
        o.daGeracao = proximo()
        break
      case '--prompt-arquivo':
        o.promptArquivo = proximo()
        break
      case '--prompt':
        o.promptTexto = proximo()
        break
      case '--ref': {
        // "caminho.jpg:subject" — o papel é opcional e só muda o teto de
        // redimensionamento da entrada, como no runner.
        const bruto = proximo()
        const corte = bruto.lastIndexOf(':')
        const temPapel = corte > 1 && /^[a-z-]+$/.test(bruto.slice(corte + 1))
        o.refs.push({
          origem: temPapel ? bruto.slice(0, corte) : bruto,
          papel: temPapel ? bruto.slice(corte + 1) : 'subject',
        })
        break
      }
      case '--formato': {
        const v = proximo()
        if (!(v in FORMATOS)) throw new Error(`Formato inválido: ${v}`)
        o.formato = v as Formato
        break
      }
      case '--modelo':
      case '--modelos':
        o.modelos = proximo()
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
          .map((m) => {
            if (!PRECO[m]) throw new Error(`Modelo sem preço conhecido: ${m}. Use ${Object.keys(PRECO).join(', ')}.`)
            return m
          })
        break
      case '--resolucoes':
        o.resolucoes = proximo()
          .split(',')
          .map((r) => r.trim().toUpperCase())
          .map((r) => {
            if (!RESOLUCOES_VALIDAS.includes(r as Resolucao)) throw new Error(`Resolução inválida: ${r}`)
            return r as Resolucao
          })
        break
      case '--repeticoes':
        o.repeticoes = Math.max(1, Number(proximo()))
        break
      case '--saida':
        o.saida = path.resolve(proximo())
        break
      case '--cambio':
        o.cambio = Number(proximo())
        break
      case '--confirmar':
        o.confirmar = true
        break
      default:
        throw new Error(`Argumento desconhecido: ${a}`)
    }
  }
  return o
}

/**
 * Produto modelo × resolução. O gpt-image entra UMA vez por modelo: ele não tem
 * eixo de resolução, é dirigido por `size` — inventar três variantes dele daria
 * três chamadas pagas idênticas.
 */
function montarVariantes(o: Opcoes): Variante[] {
  const varios = o.modelos.length > 1
  const out: Variante[] = []
  for (const modelo of o.modelos) {
    if (ehGpt(modelo)) {
      out.push({
        rotulo: varios ? modelo : `${modelo}-high`,
        modelo,
        resolucao: null,
        usd: PRECO[modelo].usd.high,
        creditos: PRECO[modelo].creditos.high,
      })
      continue
    }
    for (const resolucao of o.resolucoes) {
      out.push({
        rotulo: varios ? `${modelo} ${resolucao}` : resolucao,
        modelo,
        resolucao,
        usd: PRECO[modelo].usd[resolucao],
        creditos: PRECO[modelo].creditos[resolucao],
      })
    }
  }
  return out
}

// ── Entradas ─────────────────────────────────────────────────────────────────

interface RefCarregada {
  buffer: Buffer
  mimeType: string
  papel: string
  descricao: string
}

/**
 * Lê prompt e referências de uma Generation existente. SOMENTE LEITURA — e é
 * o modo preferido, porque reproduz uma peça REAL: `fieldValues` guarda o
 * `{prompt, refs, params}` de toda geração, no sucesso e na falha.
 */
async function daGeracao(
  id: string,
): Promise<{ prompt: string; refs: Array<{ origem: string; papel: string }>; formato: Formato }> {
  const { PrismaClient } = await import('../prisma/generated/client')
  const db = new PrismaClient()
  try {
    const g = await db.generation.findUnique({
      where: { id },
      select: { fieldValues: true, projectName: true, createdAt: true },
    })
    if (!g) throw new Error(`Geração não encontrada: ${id}`)
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>

    if (fv.track !== 'imagem') {
      console.warn(
        `⚠️  A geração ${id} é da trilha "${String(fv.track ?? '?')}", não "imagem". O teste vai rodar assim mesmo,\n` +
          `   mas a trilha "arte" desenha TEXTO — a medição aqui é de cena sem texto.`,
      )
    }

    const prompt = typeof fv.prompt === 'string' ? fv.prompt : ''
    if (!prompt) {
      throw new Error(`A geração ${id} não guardou o prompt em fieldValues. Use --prompt-arquivo.`)
    }

    const refsBrutas = Array.isArray(fv.referencias) ? (fv.referencias as Array<Record<string, unknown>>) : []
    const refs = refsBrutas
      .map((r) => ({
        origem: typeof r.driveFileId === 'string' ? r.driveFileId : typeof r.url === 'string' ? r.url : '',
        papel: typeof r.role === 'string' ? r.role : 'subject',
      }))
      .filter((r) => r.origem)

    const formatoBruto = typeof fv.formato === 'string' ? fv.formato : 'story'
    const formato = (formatoBruto in FORMATOS ? formatoBruto : 'story') as Formato

    console.log(
      `📄 Geração ${id} — ${g.projectName ?? 'projeto ?'}, ${g.createdAt.toISOString().slice(0, 10)}, formato ${formato}`,
    )
    return { prompt, refs, formato }
  } finally {
    await db.$disconnect()
  }
}

/** Baixa do Drive OU lê do disco, e aplica o mesmo teto do runner. */
async function carregarRef(origem: string, papel: string): Promise<RefCarregada> {
  const teto = papel === 'subject' ? MAX_INPUT_DIM : MAX_REF_DIM

  let bruto: Buffer
  let descricao: string
  const noDisco = await fs
    .access(origem)
    .then(() => true)
    .catch(() => false)

  if (noDisco) {
    bruto = await fs.readFile(origem)
    descricao = `arquivo ${path.basename(origem)}`
  } else {
    // Trata como driveFileId — é o formato que buscar-fotos devolve.
    const { stream, name } = await googleDriveService.getFileStream(origem)
    const pedacos: Buffer[] = []
    for await (const p of stream as Readable) pedacos.push(Buffer.from(p))
    bruto = Buffer.concat(pedacos)
    descricao = `Drive ${name} (${origem})`
  }

  const meta = await sharp(bruto).metadata()
  const grande = (meta.width ?? 0) > teto || (meta.height ?? 0) > teto
  const buffer = grande
    ? await sharp(bruto)
        .rotate()
        .resize({ width: teto, height: teto, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer()
    : bruto
  const mimeType = meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg'

  return {
    buffer,
    mimeType,
    papel,
    descricao: `${descricao} — ${meta.width}x${meta.height}${grande ? ` → teto ${teto}` : ''}`,
  }
}

// ── Medição ──────────────────────────────────────────────────────────────────

/**
 * Variância do laplaciano sobre a luminância: o padrão para "quanta borda
 * existe nesta imagem". Só comparável entre imagens do MESMO tamanho — por
 * isso o número que vale é o do FINAL, nunca o do nativo.
 */
async function nitidez(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  let soma = 0
  let somaQuad = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w]
      soma += lap
      somaQuad += lap * lap
      n++
    }
  }
  const media = soma / n
  return somaQuad / n - media * media
}

/** Três recortes 1:1 na vertical, iguais em todos os finais (mesmo tamanho). */
function recortes(w: number, h: number) {
  const lado = Math.min(480, w, Math.floor(h / 3))
  const left = Math.max(0, Math.floor((w - lado) / 2))
  return (['alto', 'centro', 'baixo'] as const).map((nome, i) => ({
    nome,
    left,
    top: Math.max(0, Math.min(h - lado, Math.floor(h * [0.25, 0.5, 0.75][i] - lado / 2))),
    width: lado,
    height: lado,
  }))
}

interface Medicao {
  rotulo: string
  modelo: string
  resolucao: string | null
  repeticao: number
  nativoLargura: number
  nativoAltura: number
  nativoBytes: number
  finalBytes: number
  nitidezFinal: number
  segundos: number
  usd: number
  creditos: number
  arquivoNativo: string
  arquivoFinal: string
  erro?: string
}

/** Uma geração, roteada pelo provider — o mesmo shape de `generateOnce`. */
async function gerar(
  v: Variante,
  prompt: string,
  refs: RefCarregada[],
  fmt: (typeof FORMATOS)[Formato],
): Promise<Buffer> {
  if (ehGpt(v.modelo)) {
    if (refs.length === 0) {
      throw new Error('gpt-image usa images.edit e exige ao menos uma referência — passe --ref')
    }
    return runImageEdit({
      images: refs.map((r, i) => ({
        buffer: r.buffer,
        mimeType: r.mimeType,
        name: `${i + 1}-${r.papel}.${r.mimeType.includes('png') ? 'png' : 'jpg'}`,
      })),
      prompt,
      size: fmt.openaiSize,
    })
  }
  const { imageBuffer } = await generateImageWithGemini({
    model: v.modelo === 'nano-banana-pro' ? 'nano-banana-pro' : 'nano-banana-2',
    prompt,
    aspectRatio: fmt.aspectRatio,
    resolution: v.resolucao ?? undefined,
    referenceImages: refs.length > 0 ? refs.map((r) => r.buffer) : undefined,
    referenceImageTypes: refs.length > 0 ? refs.map((r) => r.mimeType) : undefined,
    mode: 'generate',
  })
  return imageBuffer
}

// ── Programa ─────────────────────────────────────────────────────────────────

async function main() {
  const o = lerOpcoes(process.argv.slice(2))

  let prompt = ''
  let refsSpec = o.refs
  let formato = o.formato
  let procedencia = ''

  if (o.daGeracao) {
    const d = await daGeracao(o.daGeracao)
    prompt = d.prompt
    if (refsSpec.length === 0) refsSpec = d.refs
    formato = d.formato
    procedencia = `Generation ${o.daGeracao}`
  } else if (o.promptArquivo) {
    prompt = await fs.readFile(o.promptArquivo, 'utf8')
    procedencia = `arquivo ${o.promptArquivo}`
  } else if (o.promptTexto) {
    prompt = o.promptTexto
    procedencia = 'texto na linha de comando'
  }

  const fmt = FORMATOS[formato]
  const variantes = montarVariantes(o)
  const custoUsd = variantes.reduce((s, v) => s + v.usd * o.repeticoes, 0)
  const custoCreditos = variantes.reduce((s, v) => s + v.creditos * o.repeticoes, 0)

  console.log('\n════ MEDIÇÃO — TRILHA IMAGEM (cena sem texto) ════\n')
  console.log(`  formato      ${formato} (${fmt.aspectRatio} → normalizado em ${fmt.final.width}x${fmt.final.height})`)
  console.log(`  repetições   ${o.repeticoes}`)
  console.log(`  prompt       ${prompt ? `${prompt.length} chars — ${procedencia}` : '❌ AUSENTE'}`)
  console.log(
    `  referências  ${refsSpec.length === 0 ? 'nenhuma' : refsSpec.map((r) => `${r.papel}=${r.origem}`).join(', ')}`,
  )
  console.log(`  saída        ${o.saida}\n`)
  console.log('  variantes a gerar:')
  for (const v of variantes) {
    console.log(
      `    ${v.rotulo.padEnd(24)} US$ ${v.usd.toFixed(3)}  ${String(v.creditos).padStart(3)} créditos  ` +
        `(R$ ${(v.usd * o.cambio).toFixed(2)})`,
    )
  }
  console.log(
    `\n  ${variantes.length * o.repeticoes} gerações · US$ ${custoUsd.toFixed(3)} · ` +
      `R$ ${(custoUsd * o.cambio).toFixed(2)} · ${custoCreditos} créditos (câmbio ${o.cambio})`,
  )

  if (o.modelos.some((m) => m === 'nano-banana-2') && o.resolucoes.includes('4K')) {
    console.log(
      '\n  ℹ️  nano-banana-2 declara supports4K: false (teto 2048x2048). A coluna "nativo"\n' +
        '     mostra se o parâmetro é descartado em silêncio.',
    )
  }
  if (o.modelos.some(ehGpt) && refsSpec.length === 0) {
    console.log('\n  ⚠️  gpt-image usa images.edit e EXIGE referência — a variante dele vai falhar sem --ref.')
  }
  if (!prompt) {
    console.log('\n❌ Sem prompt não há o que medir. Use --da-geracao, --prompt-arquivo ou --prompt.')
    process.exit(1)
  }
  if (!o.confirmar) {
    console.log('\n  Nada foi gerado. Repita com --confirmar para executar.\n')
    return
  }

  // Referências carregadas UMA vez: os disparos precisam receber bytes
  // idênticos, senão o modelo deixa de ser a única variável.
  const refs: RefCarregada[] = []
  for (const r of refsSpec) {
    const carregada = await carregarRef(r.origem, r.papel)
    refs.push(carregada)
    console.log(`  📎 ${carregada.papel}: ${carregada.descricao}`)
  }

  await fs.mkdir(o.saida, { recursive: true })
  const medicoes: Medicao[] = []

  // Execução INTERCALADA por rodada. Se o serviço degradar no meio da bateria,
  // o efeito se espalha por todas as variantes em vez de punir a última.
  for (let rep = 1; rep <= o.repeticoes; rep++) {
    for (const v of variantes) {
      const slug = v.rotulo.replace(/[^a-zA-Z0-9]+/g, '-')
      process.stdout.write(`\n  ⏳ ${v.rotulo} r${rep} … `)
      const t0 = Date.now()
      try {
        const bruto = await gerar(v, prompt, refs, fmt)
        const segundos = (Date.now() - t0) / 1000

        const meta = await sharp(bruto).metadata()
        const arquivoNativo = path.join(o.saida, `nativo-${slug}-r${rep}.jpg`)
        await fs.writeFile(arquivoNativo, bruto)

        // Normalização para 1080 — aqui é do MEDIDOR, para comparar maçã com
        // maçã. A produção só faz isso na trilha `arte`.
        const finalBuffer = await sharp(bruto)
          .resize(fmt.final.width, fmt.final.height, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 92 })
          .toBuffer()
        const arquivoFinal = path.join(o.saida, `final-${slug}-r${rep}.jpg`)
        await fs.writeFile(arquivoFinal, finalBuffer)

        medicoes.push({
          rotulo: v.rotulo,
          modelo: v.modelo,
          resolucao: v.resolucao,
          repeticao: rep,
          nativoLargura: meta.width ?? 0,
          nativoAltura: meta.height ?? 0,
          nativoBytes: bruto.length,
          finalBytes: finalBuffer.length,
          nitidezFinal: await nitidez(finalBuffer),
          segundos,
          usd: v.usd,
          creditos: v.creditos,
          arquivoNativo,
          arquivoFinal,
        })
        process.stdout.write(`${meta.width}x${meta.height} em ${segundos.toFixed(0)}s`)
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro)
        process.stdout.write(`❌ ${msg.slice(0, 140)}`)
        medicoes.push({
          rotulo: v.rotulo,
          modelo: v.modelo,
          resolucao: v.resolucao,
          repeticao: rep,
          nativoLargura: 0,
          nativoAltura: 0,
          nativoBytes: 0,
          finalBytes: 0,
          nitidezFinal: 0,
          segundos: (Date.now() - t0) / 1000,
          usd: v.usd,
          creditos: v.creditos,
          arquivoNativo: '',
          arquivoFinal: '',
          erro: msg,
        })
      }
    }
  }

  console.log('\n')
  relatorio(medicoes, variantes, o, fmt)

  await fs.writeFile(
    path.join(o.saida, 'resultado.json'),
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        formato,
        aspectRatio: fmt.aspectRatio,
        normalizadoEm: fmt.final,
        procedenciaDoPrompt: procedencia,
        promptChars: prompt.length,
        prompt,
        referencias: refs.map((r) => ({ papel: r.papel, descricao: r.descricao })),
        cambio: o.cambio,
        custoUsd,
        custoBrl: custoUsd * o.cambio,
        custoCreditos,
        medicoes,
      },
      null,
      2,
    ),
  )

  const caminhoHtml = path.join(o.saida, 'comparacao.html')
  await fs.writeFile(caminhoHtml, await montarComparacao(medicoes, variantes, o, fmt))

  console.log(`\n  📁 ${o.saida}`)
  console.log(`  🖼  abra:  open ${caminhoHtml}\n`)
}

function relatorio(medicoes: Medicao[], variantes: Variante[], o: Opcoes, fmt: (typeof FORMATOS)[Formato]) {
  const ok = medicoes.filter((m) => !m.erro)
  if (ok.length === 0) {
    console.log('  Nenhuma geração concluiu — veja os erros acima.')
    return
  }

  console.log('  ┌─ O QUE CADA UM DEVOLVEU (antes de qualquer resize) ──────────────')
  for (const v of variantes) {
    const desta = ok.filter((m) => m.rotulo === v.rotulo)
    if (desta.length === 0) continue
    const dims = [...new Set(desta.map((m) => `${m.nativoLargura}x${m.nativoAltura}`))].join(' / ')
    const px = desta[0].nativoLargura * desta[0].nativoAltura
    const seg = desta.reduce((s, m) => s + m.segundos, 0) / desta.length
    console.log(
      `  │ ${v.rotulo.padEnd(22)} ${dims.padEnd(13)} ${(px / 1e6).toFixed(1).padStart(4)} MP  ${seg.toFixed(0).padStart(3)}s`,
    )
  }
  console.log('  └──────────────────────────────────────────────────────────────────')

  const dimsUnicas = new Set(ok.map((m) => `${m.nativoLargura}x${m.nativoAltura}`))
  if (dimsUnicas.size === 1 && variantes.length > 1 && o.modelos.length === 1) {
    console.log(
      `\n  🔴 As ${variantes.length} variantes voltaram do MESMO tamanho (${[...dimsUnicas][0]}).\n` +
        `     O parâmetro é descartado antes do resize — o que sobra é cobrança sem contrapartida.`,
    )
  }

  console.log(`\n  ┌─ NORMALIZADO EM ${fmt.final.width}x${fmt.final.height} (onde a comparação é justa) ────`)
  const base = ok.filter((m) => m.rotulo === variantes[0].rotulo)
  const nitidezBase = base.length ? base.reduce((s, m) => s + m.nitidezFinal, 0) / base.length : 0
  for (const v of variantes) {
    const desta = ok.filter((m) => m.rotulo === v.rotulo)
    if (desta.length === 0) continue
    const nit = desta.reduce((s, m) => s + m.nitidezFinal, 0) / desta.length
    const delta = nitidezBase > 0 ? ((nit / nitidezBase - 1) * 100).toFixed(1) : '—'
    const sinal = Number(delta) > 0 ? '+' : ''
    console.log(
      `  │ ${v.rotulo.padEnd(22)} nitidez ${nit.toFixed(1).padStart(8)} (${sinal}${delta}%)  ` +
        `US$ ${v.usd.toFixed(3)}  ${String(v.creditos).padStart(3)} créditos`,
    )
  }
  console.log('  └──────────────────────────────────────────────────────────────────')

  if (o.repeticoes === 1) {
    console.log(
      '\n  ⚠️  Uma repetição por variante, e nenhum dos clientes expõe seed: as imagens são\n' +
        '     cenas DIFERENTES. A nitidez mede a CENA tanto quanto o modelo — decida pelo\n' +
        '     recorte 1:1, e use --repeticoes 3 para o número virar evidência.',
    )
  }
}

async function montarComparacao(
  medicoes: Medicao[],
  variantes: Variante[],
  o: Opcoes,
  fmt: (typeof FORMATOS)[Formato],
): Promise<string> {
  const ok = medicoes.filter((m) => !m.erro)
  const rects = recortes(fmt.final.width, fmt.final.height)

  const b64 = async (arquivo: string, rect?: { left: number; top: number; width: number; height: number }) => {
    // ⚠️ `sharp(x).extract(r).stats()` ignora o extract — mas `.extract().jpeg()
    //    .toBuffer()` MATERIALIZA o recorte, que é o que fazemos aqui.
    const buf = rect
      ? await sharp(arquivo).extract(rect).jpeg({ quality: 95 }).toBuffer()
      : await sharp(arquivo).resize({ width: 300 }).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  }

  const grupos = variantes.map((v) => ok.filter((m) => m.rotulo === v.rotulo)).filter((g) => g.length > 0)

  let corpo = ''
  for (const grupo of grupos) {
    const m = grupo[0]
    corpo += `<tr><th>${m.rotulo}<br><small>${m.nativoLargura}×${m.nativoAltura}<br>${m.segundos.toFixed(0)}s</small></th>`
    corpo += `<td><img src="${await b64(m.arquivoFinal)}" alt="${m.rotulo}"></td>`
    for (const r of rects) {
      corpo += `<td><img class="crop" src="${await b64(m.arquivoFinal, r)}" alt="${r.nome} ${m.rotulo}"></td>`
    }
    corpo += '</tr>'
  }

  const linhas = grupos
    .map((g) => {
      const nit = g.reduce((s, m) => s + m.nitidezFinal, 0) / g.length
      const seg = g.reduce((s, m) => s + m.segundos, 0) / g.length
      return `<tr><td>${g[0].rotulo}</td><td>${g[0].nativoLargura}×${g[0].nativoAltura}</td><td>${nit.toFixed(1)}</td><td>${seg.toFixed(0)}s</td><td>US$ ${g[0].usd.toFixed(3)}</td><td>${g[0].creditos}</td><td>R$ ${(g[0].usd * o.cambio).toFixed(2)}</td></tr>`
    })
    .join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Trilha imagem — comparação</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem; background: #111; color: #eee; }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem; }
  p.sub { color: #999; margin: 0 0 1.5rem; }
  table { border-collapse: collapse; margin-bottom: 2rem; }
  th, td { padding: 4px; text-align: left; vertical-align: top; }
  th { color: #ccc; font-weight: 600; white-space: nowrap; }
  th small { color: #888; font-weight: 400; }
  img { display: block; border-radius: 3px; }
  img.crop { width: ${rects[0].width}px; height: ${rects[0].height}px; image-rendering: pixelated; }
  .dados td, .dados th { border-bottom: 1px solid #333; padding: 6px 14px 6px 0; }
  .nota { color: #d9a441; max-width: 62ch; margin-top: 1.5rem; }
</style></head><body>
<h1>Trilha <code>imagem</code> — cena sem texto, ${fmt.final.width}×${fmt.final.height}</h1>
<p class="sub">Recortes em 1:1 sobre o mesmo tamanho normalizado. A coluna larga é a peça inteira, reduzida só para caber.</p>

<table class="dados">
<tr><th>variante</th><th>nativo</th><th>nitidez</th><th>tempo</th><th>fatura</th><th>créditos</th><th>R$</th></tr>
${linhas}
</table>

<table>
<tr><th></th><th>peça</th>${rects.map((r) => `<th>${r.nome}</th>`).join('')}</tr>
${corpo}
</table>

<p class="nota">${o.repeticoes === 1 ? 'Uma repetição por variante: as cenas são DIFERENTES (nenhum cliente expõe seed). Compare textura, borda e ruído — não composição.' : `${o.repeticoes} repetições por variante; a tabela mostra a média.`}</p>
</body></html>`
}

main().catch((erro) => {
  console.error('\n❌', erro instanceof Error ? erro.message : erro)
  process.exit(1)
})
