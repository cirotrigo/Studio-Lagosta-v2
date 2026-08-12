/**
 * Mede se o tier `medium` do gpt-image serve para a trilha `arte` — a peça COM
 * o texto desenhado.
 *
 * POR QUE
 *
 * `runImageEdit` cravava `quality: 'high'` desde sempre, e ninguém questionou:
 * é o caminho mais caro do sistema (25 créditos e US$ 0,165 por peça). Pela
 * tabela de preços do repo, conferida com a doc oficial em maio/2026, o mesmo
 * tamanho em `medium` custa **US$ 0,045 — 73% menos**, e em `low`, US$ 0,008.
 *
 * A pergunta não é de gosto, é binária: **o lettering sobrevive?** Texto pequeno
 * é o primeiro a borrar quando o tier cai, e a trilha `arte` já tem o juiz certo
 * embutido — `verifyImageTexts`, a MESMA verificação por visão que a produção
 * roda ao final de cada geração. Este script a reusa, sem reimplementar régua
 * nenhuma: o veredito aqui é o veredito de lá.
 *
 * ⚠️ NÃO TOCA NO BANCO E NÃO GASTA CRÉDITO DO STUDIO.
 *
 * Reproduz a geração a partir de uma `Generation` real (leitura), chama
 * `runImageEdit` direto e verifica com `verifyImageTexts`. Pula Generation nova,
 * fila durável, dedução de créditos, sinais de aprendizado e upload. O que gasta
 * é a FATURA da OpenAI — por isso a primeira chamada não gera nada, imprime o
 * plano e o custo, e só `--confirmar` executa.
 *
 * ⚠️ **Não chama `escolherReferenciaDeEstilo`.** Aquilo é um RODÍZIO: pedir uma
 * referência aqui marcaria uso e mudaria qual arte a próxima geração de verdade
 * receberia. A referência de estilo vem do `styleRefId` que ficou gravado na
 * geração de origem — a mesma imagem, sem mexer na fila.
 *
 * ⚠️ Uma repetição por tier e sem seed: as peças são DIFERENTES. Para o texto
 * isso importa pouco (ou os cinco blocos saem legíveis, ou não), mas para
 * nitidez e composição vale o mesmo aviso de sempre — use `--repeticoes 3`
 * antes de tratar número como evidência.
 *
 * USO
 *   # o plano e a conta, sem gastar nada:
 *   npx tsx scripts/medir-qualidade-trilha-arte.ts --da-geracao <generationId>
 *
 *   # executar (high × medium):
 *   npx tsx scripts/medir-qualidade-trilha-arte.ts --da-geracao <id> --confirmar
 *
 *   # incluir o tier low (US$ 0,008; provavelmente reprova no texto):
 *   npx tsx scripts/medir-qualidade-trilha-arte.ts --da-geracao <id> \
 *     --qualidades high,medium,low --confirmar
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import sharp from 'sharp'

import { runImageEdit, type RawEditImage } from '../src/lib/ai/openai-image-client'
import { verifyImageTexts, extractExpectedTexts } from '../src/lib/ai/creative-text-verification'
import { loadBrandContext } from '../src/lib/brand/brand-context'
import { getBrandReferenceCard } from '../src/lib/ai/brand-reference-card'
import { renderTypeSpecimen } from '../src/lib/ai/type-specimen'
import { fetchImageSource } from '../src/lib/ai/fetch-image-source'
import { googleDriveService } from '../src/server/google-drive-service'

// ── Constantes espelhadas do runner (`creative-generation-runner.ts:54,57`) ──
const MAX_INPUT_DIM = 4000
const MAX_REF_DIM = 3000

/**
 * Preço OFICIAL por imagem no tamanho de story (1088x1936), da tabela do repo.
 *
 * ⚠️ `medium` e `low` só existem na tabela nos tamanhos 1024×*; o valor abaixo é
 * o do bucket vizinho — a MESMA suposição já anotada nas entradas 1088 do
 * `high` em `cost-estimates.ts`. Se a fatura real divergir, é aqui que se
 * corrige.
 */
const PRECO_USD: Record<string, number> = { high: 0.165, medium: 0.045, low: 0.008 }
/** A trilha `arte` cobra flat, independente do tier (`feature-config.ts`). */
const CREDITOS_ARTE = 25
/** Comercial de 11/08 (R$ 5,1573) + IOF 3,5% + spread de cartão ~2%. */
const CAMBIO_PADRAO = 5.4446

type Qualidade = 'low' | 'medium' | 'high'
const QUALIDADES_VALIDAS: Qualidade[] = ['low', 'medium', 'high']

interface Opcoes {
  daGeracao: string | null
  instrucao: string | null
  qualidades: Qualidade[]
  repeticoes: number
  saida: string
  cambio: number
  confirmar: boolean
}

function lerOpcoes(argv: string[]): Opcoes {
  const o: Opcoes = {
    daGeracao: null,
    instrucao: null,
    qualidades: ['high', 'medium'],
    repeticoes: 1,
    saida: path.join(process.cwd(), '.tmp-qualidade-arte'),
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
      case '--instrucao':
        o.instrucao = proximo()
        break
      case '--qualidades':
        o.qualidades = proximo()
          .split(',')
          .map((q) => q.trim().toLowerCase() as Qualidade)
          .map((q) => {
            if (!QUALIDADES_VALIDAS.includes(q)) throw new Error(`Qualidade inválida: ${q}`)
            return q
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
  if (!o.daGeracao) throw new Error('Informe --da-geracao <generationId> (uma geração da trilha arte).')
  return o
}

/** Réplica de `sanitizeInput` do runner: EXIF + teto de dimensão, PNG preservado. */
async function sanear(buffer: Buffer, maxDim: number, preservarPng = false) {
  try {
    const meta = await sharp(buffer).metadata()
    const grande = (meta.width ?? 0) > maxDim || (meta.height ?? 0) > maxDim
    if (!grande) {
      const mime = meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg'
      return { buffer, mimeType: mime }
    }
    const p = sharp(buffer).rotate().resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    // Logo precisa do alpha: convertê-la para JPEG vira retângulo sólido.
    if (preservarPng && meta.format === 'png') return { buffer: await p.png().toBuffer(), mimeType: 'image/png' }
    return { buffer: await p.jpeg({ quality: 90 }).toBuffer(), mimeType: 'image/jpeg' }
  } catch {
    return { buffer, mimeType: 'image/jpeg' }
  }
}

async function baixarDoDrive(fileId: string): Promise<Buffer> {
  const { stream } = await googleDriveService.getFileStream(fileId)
  const pedacos: Buffer[] = []
  for await (const p of stream as Readable) pedacos.push(Buffer.from(p))
  return Buffer.concat(pedacos)
}

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
  return somaQuad / n - (soma / n) ** 2
}

interface Medicao {
  qualidade: Qualidade
  repeticao: number
  largura: number
  altura: number
  bytes: number
  segundos: number
  nitidez: number
  textoPassou: boolean | null
  textoFaltando: string[]
  textoTranscrito: string[]
  arquivo: string
  erro?: string
}

async function main() {
  const o = lerOpcoes(process.argv.slice(2))

  // ── Reconstituir a geração de origem (LEITURA) ────────────────────────────
  const { PrismaClient } = await import('../prisma/generated/client')
  const db = new PrismaClient()
  const origem = await db.generation.findUnique({
    where: { id: o.daGeracao! },
    select: { fieldValues: true, projectId: true, projectName: true },
  })
  if (!origem) throw new Error(`Geração não encontrada: ${o.daGeracao}`)
  const fv = (origem.fieldValues ?? {}) as Record<string, any>
  if (fv.track !== 'arte') {
    throw new Error(`A geração ${o.daGeracao} é da trilha "${fv.track}". Este teste é da trilha arte (peça COM texto).`)
  }
  const promptOriginal: string = fv.prompt ?? ''
  const inputSize: string = fv.inputSize ?? '1088x1936'
  const esperados = extractExpectedTexts(fv)
  if (!promptOriginal) throw new Error('A geração de origem não guardou o prompt.')
  if (esperados.length === 0) throw new Error('A geração de origem não tem textos esperados — sem eles não há o que julgar.')

  /**
   * Ajuste AUTORIZADO na foto (`instrucaoImagem`), inserido onde
   * `buildArtePrompt` o coloca: última linha do bloco [FIDELIDADE À FOTO].
   *
   * A linha é copiada verbatim do builder — testar o ajuste com outra redação
   * mediria outro prompt. Se a âncora não existir no prompt salvo, ABORTA em
   * vez de inserir no lugar errado: um teste que mede a coisa errada é pior
   * que um teste que não roda.
   */
  let prompt = promptOriginal
  if (o.instrucao) {
    const ancora = 'Se o enquadramento exigir completar bordas'
    const linhas = prompt.split('\n')
    const i = linhas.findIndex((l) => l.startsWith(ancora))
    if (i < 0) {
      throw new Error(
        'Não achei o bloco [FIDELIDADE À FOTO] no prompt salvo — o builder mudou. ' +
          'Conferir buildArtePrompt antes de inserir a exceção autorizada.',
      )
    }
    linhas.splice(
      i + 1,
      0,
      `EXCEÇÃO AUTORIZADA PELO CLIENTE — aplique EXATAMENTE este ajuste na imagem, e NADA além dele: ${o.instrucao.trim()}`,
    )
    prompt = linhas.join('\n')
  }

  // Referência de estilo: a MESMA que ficou gravada, nunca uma nova do rodízio.
  let styleUrl: string | null = null
  if (typeof fv.styleRefId === 'string' && fv.styleRefId) {
    const ref = await db.generation.findUnique({ where: { id: fv.styleRefId }, select: { resultUrl: true } })
    styleUrl = ref?.resultUrl ?? null
  }
  const brand = await loadBrandContext(origem.projectId!)
  await db.$disconnect()

  const custoUsd = o.qualidades.reduce((s, q) => s + PRECO_USD[q] * o.repeticoes, 0)

  console.log('\n════ QUALIDADE DO gpt-image NA TRILHA ARTE ════\n')
  console.log(`  origem       ${o.daGeracao} — ${origem.projectName}`)
  console.log(`  tamanho      ${inputSize}`)
  console.log(`  prompt       ${prompt.length} chars${o.instrucao ? ' (com ajuste autorizado)' : ''}`)
  if (o.instrucao) console.log(`  ajuste       "${o.instrucao}"`)
  console.log(`  textos       ${esperados.length} blocos: ${esperados.map((t) => `"${t.slice(0, 28)}"`).join(', ')}`)
  console.log(`  repetições   ${o.repeticoes}`)
  console.log(`  saída        ${o.saida}\n`)
  for (const q of o.qualidades) {
    console.log(
      `    ${q.padEnd(8)} US$ ${PRECO_USD[q].toFixed(3)}  ${CREDITOS_ARTE} créditos  (R$ ${(PRECO_USD[q] * o.cambio).toFixed(2)})`,
    )
  }
  console.log(
    `\n  ${o.qualidades.length * o.repeticoes} gerações · US$ ${custoUsd.toFixed(3)} · R$ ${(custoUsd * o.cambio).toFixed(2)}`,
  )
  console.log(
    `\n  O juiz é verifyImageTexts — a MESMA verificação por visão da produção.\n` +
      `  Passou = os ${esperados.length} blocos foram transcritos da arte.`,
  )
  if (!o.confirmar) {
    console.log('\n  Nada foi gerado. Repita com --confirmar para executar.\n')
    return
  }

  // ── Referências, na ORDEM que o prompt descreve ("Image 1 is…") ───────────
  const refs: RawEditImage[] = []
  const descricoes: string[] = []
  const empurrar = async (papel: string, buffer: Buffer, maxDim: number, png = false, comoVeio = '') => {
    const s = await sanear(buffer, maxDim, png)
    refs.push({
      buffer: s.buffer,
      mimeType: s.mimeType,
      name: `${refs.length + 1}-${papel}.${s.mimeType.includes('png') ? 'png' : 'jpg'}`,
    })
    descricoes.push(`${refs.length}. ${papel} — ${comoVeio} (${(s.buffer.length / 1024).toFixed(0)} KB)`)
  }

  for (const r of (fv.referencias ?? []) as Array<Record<string, string>>) {
    const bytes = r.driveFileId ? await baixarDoDrive(r.driveFileId) : (await fetchImageSource(r.url!)).buffer
    await empurrar(r.role, bytes, r.role === 'subject' ? MAX_INPUT_DIM : MAX_REF_DIM, false, r.label ?? r.role)
  }
  if (styleUrl) {
    await empurrar('style', (await fetchImageSource(styleUrl)).buffer, MAX_REF_DIM, false, `gravada (${fv.styleRefId})`)
  }
  const card = await getBrandReferenceCard(brand).catch(() => null)
  if (card) await empurrar('brand-card', card.buffer, MAX_REF_DIM, true, card.origem)
  const prancha = await renderTypeSpecimen(brand).catch(() => null)
  if (prancha) await empurrar('type-specimen', prancha, MAX_REF_DIM, true, 'alfabetos oficiais')
  if (brand?.logoUrl) {
    await empurrar('logo', (await fetchImageSource(brand.logoUrl)).buffer, MAX_REF_DIM, true, 'arquivo oficial')
  }

  console.log('\n  Referências reconstituídas:')
  for (const d of descricoes) console.log(`    ${d}`)
  const esperadaOrdem = (fv.refsUsadas ?? []).map((r: any) => r.role).join(' → ')
  const obtidaOrdem = descricoes.map((d) => d.split(' ')[1]).join(' → ')
  console.log(`  ordem original : ${esperadaOrdem}`)
  console.log(`  ordem obtida   : ${obtidaOrdem}`)
  if (esperadaOrdem !== obtidaOrdem) {
    console.log(
      '  ⚠️  As ordens DIVERGEM. O prompt diz "Image 1 is…, Image 2 is…" e a numeração\n' +
        '     é posicional — com a ordem trocada o modelo lê a referência errada, e o\n' +
        '     teste mediria outra coisa. Confira antes de confiar no resultado.',
    )
  }

  await fs.mkdir(o.saida, { recursive: true })
  const medicoes: Medicao[] = []

  for (let rep = 1; rep <= o.repeticoes; rep++) {
    for (const qualidade of o.qualidades) {
      process.stdout.write(`\n  ⏳ ${qualidade} r${rep} … `)
      const t0 = Date.now()
      try {
        const buffer = await runImageEdit({ images: refs, prompt, size: inputSize, quality: qualidade })
        const segundos = (Date.now() - t0) / 1000
        const meta = await sharp(buffer).metadata()
        const arquivo = path.join(o.saida, `${qualidade}-r${rep}.png`)
        await fs.writeFile(arquivo, buffer)
        process.stdout.write(`${meta.width}x${meta.height} em ${segundos.toFixed(0)}s — conferindo texto… `)

        let textoPassou: boolean | null = null
        let faltando: string[] = []
        let transcrito: string[] = []
        try {
          const check = await verifyImageTexts(buffer, esperados)
          textoPassou = check.passed
          faltando = check.missing
          transcrito = check.extracted
          process.stdout.write(check.passed ? '✅ passou' : `❌ faltou ${check.missing.length}`)
        } catch (e) {
          // Visão fora do ar nunca derruba a peça — regra da casa.
          process.stdout.write(`⚠️ visão indisponível (${e instanceof Error ? e.message.slice(0, 60) : e})`)
        }

        medicoes.push({
          qualidade,
          repeticao: rep,
          largura: meta.width ?? 0,
          altura: meta.height ?? 0,
          bytes: buffer.length,
          segundos,
          nitidez: await nitidez(buffer),
          textoPassou,
          textoFaltando: faltando,
          textoTranscrito: transcrito,
          arquivo,
        })
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro)
        process.stdout.write(`❌ ${msg.slice(0, 140)}`)
        medicoes.push({
          qualidade,
          repeticao: rep,
          largura: 0,
          altura: 0,
          bytes: 0,
          segundos: (Date.now() - t0) / 1000,
          nitidez: 0,
          textoPassou: null,
          textoFaltando: [],
          textoTranscrito: [],
          arquivo: '',
          erro: msg,
        })
      }
    }
  }

  console.log('\n')
  relatorio(medicoes, esperados, o)

  await fs.writeFile(
    path.join(o.saida, 'resultado.json'),
    JSON.stringify(
      { geradoEm: new Date().toISOString(), origem: o.daGeracao, inputSize, esperados, cambio: o.cambio, medicoes },
      null,
      2,
    ),
  )
  const html = await montarComparacao(medicoes, esperados, o)
  const caminho = path.join(o.saida, 'comparacao.html')
  await fs.writeFile(caminho, html)
  console.log(`\n  📁 ${o.saida}`)
  console.log(`  🖼  abra:  open ${caminho}\n`)
}

function relatorio(medicoes: Medicao[], esperados: string[], o: Opcoes) {
  const ok = medicoes.filter((m) => !m.erro)
  if (ok.length === 0) {
    console.log('  Nenhuma geração concluiu — veja os erros acima.')
    return
  }
  console.log('  ┌─ O VEREDITO QUE IMPORTA: o texto sobreviveu? ────────────────────')
  for (const q of o.qualidades) {
    const desta = ok.filter((m) => m.qualidade === q)
    if (desta.length === 0) continue
    const passou = desta.filter((m) => m.textoPassou === true).length
    const reprovou = desta.filter((m) => m.textoPassou === false).length
    const semJuiz = desta.filter((m) => m.textoPassou === null).length
    const faltas = [...new Set(desta.flatMap((m) => m.textoFaltando))]
    console.log(
      `  │ ${q.padEnd(8)} ${passou}/${desta.length} passaram` +
        (reprovou ? `, ${reprovou} reprovaram` : '') +
        (semJuiz ? `, ${semJuiz} sem juiz` : ''),
    )
    if (faltas.length) console.log(`  │          faltou: ${faltas.map((f) => `"${f.slice(0, 40)}"`).join(', ')}`)
  }
  console.log('  └──────────────────────────────────────────────────────────────────')

  console.log('\n  ┌─ Custo, tempo e nitidez ─────────────────────────────────────────')
  const base = ok.filter((m) => m.qualidade === o.qualidades[0])
  const nitBase = base.length ? base.reduce((s, m) => s + m.nitidez, 0) / base.length : 0
  for (const q of o.qualidades) {
    const desta = ok.filter((m) => m.qualidade === q)
    if (desta.length === 0) continue
    const nit = desta.reduce((s, m) => s + m.nitidez, 0) / desta.length
    const seg = desta.reduce((s, m) => s + m.segundos, 0) / desta.length
    const delta = nitBase > 0 ? ((nit / nitBase - 1) * 100).toFixed(1) : '—'
    const sinal = Number(delta) > 0 ? '+' : ''
    console.log(
      `  │ ${q.padEnd(8)} US$ ${PRECO_USD[q].toFixed(3)}  ${seg.toFixed(0).padStart(3)}s  ` +
        `nitidez ${nit.toFixed(1).padStart(7)} (${sinal}${delta}%)`,
    )
  }
  console.log('  └──────────────────────────────────────────────────────────────────')

  const alto = ok.filter((m) => m.qualidade === 'high' && m.textoPassou === true).length
  const medio = ok.filter((m) => m.qualidade === 'medium' && m.textoPassou === true).length
  const totalMedio = ok.filter((m) => m.qualidade === 'medium').length
  if (totalMedio > 0 && medio === totalMedio && alto > 0) {
    const economia = (1 - PRECO_USD.medium / PRECO_USD.high) * 100
    console.log(
      `\n  💰 medium passou em ${medio}/${totalMedio} e custa ${economia.toFixed(0)}% menos.\n` +
        `     Confira o texto NA IMAGEM antes de decidir: a visão diz que os blocos estão lá,\n` +
        `     não que estão bonitos. Kerning e peso de fonte não entram nesse veredito.`,
    )
  }
  if (o.repeticoes === 1) {
    console.log(
      `\n  ⚠️  Uma repetição por tier. O texto é binário e aguenta n=1 melhor que estética,\n` +
        `     mas uma peça que passa não prova que o tier passa sempre — use --repeticoes 3.`,
    )
  }
}

async function montarComparacao(medicoes: Medicao[], esperados: string[], o: Opcoes): Promise<string> {
  const ok = medicoes.filter((m) => !m.erro)
  const b64 = async (arquivo: string, rect?: { left: number; top: number; width: number; height: number }) => {
    const buf = rect
      ? await sharp(arquivo).extract(rect).jpeg({ quality: 95 }).toBuffer()
      : await sharp(arquivo).resize({ width: 340 }).jpeg({ quality: 85 }).toBuffer()
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  }

  let corpo = ''
  for (const m of ok) {
    const meta = await sharp(m.arquivo).metadata()
    const lado = Math.min(520, meta.width ?? 520)
    const left = Math.max(0, Math.floor(((meta.width ?? 0) - lado) / 2))
    // Três faixas na vertical: é onde os blocos de copy costumam morar.
    const faixas = [0.2, 0.5, 0.8].map((f) => ({
      left,
      top: Math.max(0, Math.min((meta.height ?? 0) - 300, Math.floor((meta.height ?? 0) * f - 150))),
      width: lado,
      height: 300,
    }))
    const selo =
      m.textoPassou === true
        ? '<span class="ok">texto ✅</span>'
        : m.textoPassou === false
          ? `<span class="ruim">texto ❌ faltou ${m.textoFaltando.length}</span>`
          : '<span class="neutro">sem juiz</span>'
    corpo += `<tr><th>${m.qualidade}<br><small>US$ ${PRECO_USD[m.qualidade].toFixed(3)}<br>${m.segundos.toFixed(0)}s<br>${selo}</small></th>`
    corpo += `<td><img src="${await b64(m.arquivo)}"></td>`
    for (const f of faixas) corpo += `<td><img class="faixa" src="${await b64(m.arquivo, f)}"></td>`
    corpo += '</tr>'
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>gpt-image: high × medium na trilha arte</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem; background: #111; color: #eee; }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem; }
  p.sub { color: #999; margin: 0 0 1.5rem; max-width: 70ch; }
  table { border-collapse: collapse; }
  th, td { padding: 4px; text-align: left; vertical-align: top; }
  th { color: #ccc; white-space: nowrap; }
  th small { color: #888; font-weight: 400; }
  img { display: block; border-radius: 3px; }
  img.faixa { width: 340px; image-rendering: auto; }
  .ok { color: #5ac57f; } .ruim { color: #e06a6a; } .neutro { color: #888; }
  ul { color: #bbb; }
</style></head><body>
<h1>gpt-image na trilha <code>arte</code> — o tier muda o lettering?</h1>
<p class="sub">As faixas são recortes 1:1 nas alturas onde a copy costuma ficar. O selo vem de <code>verifyImageTexts</code>, a mesma verificação por visão da produção — ele diz se os blocos ESTÃO lá, não se estão bem desenhados. Julgue o desenho com o olho.</p>
<p>Textos esperados:</p><ul>${esperados.map((t) => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')}</ul>
<table><tr><th></th><th>peça</th><th>topo</th><th>meio</th><th>base</th></tr>${corpo}</table>
</body></html>`
}

main().catch((erro) => {
  console.error('\n❌', erro instanceof Error ? erro.message : erro)
  process.exit(1)
})
