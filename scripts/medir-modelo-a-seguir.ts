/**
 * Mede se o MODELO escolhido à mão passa a mandar na diagramação da peça — e
 * se a headline para de sair em caixa alta contra a vontade da marca.
 *
 * POR QUE
 *
 * Relatado pelo Ciro em 16/08/2026, na Real Gelateria: escolheu um modelo na
 * bancada, a arte saiu com outra diagramação e a headline em CAIXA ALTA contra
 * o "caixa alta moderada ou Title Case" do DNA e contra o Title Case do próprio
 * modelo. O diagnóstico achou três causas somadas:
 *
 * 1. `buildTypographyLock` mandava "caixa alta" para TODA marca — linha curta e
 *    imperativa aos 36% do prompt, contra a regra da marca aos 62%, enterrada
 *    em 9.180 caracteres de DNA (54% do prompt).
 * 2. O papel `style` promete só clima: "tonal register, luminosity and graphic
 *    mood". Nunca prometeu layout — e era esse o papel que a escolha da bancada
 *    usava. O `generationId` que a distinguiria morria no schema da rota.
 * 3. A regra aprendida do DNA ("título na parte superior, serviço no rodapé")
 *    jogava a manchete para o topo, contra um modelo que a põe embaixo.
 *
 * O conserto criou o papel `style-guide` (manda no layout, é decodificado por
 * visão como o slide-guia do carrossel), tirou a caixa do lock e passou a
 * omitir `visualStyle`/`composition` do DNA quando há modelo — mesmo precedente
 * do slide irmão. Este script mede o ANTES contra o DEPOIS.
 *
 * ⚠️ NÃO TOCA NO BANCO E NÃO GASTA CRÉDITO DO STUDIO.
 *
 * Lê uma `Generation` real, reconstrói as referências e chama `runImageEdit`
 * direto — pula Generation nova, fila durável, dedução, sinais de aprendizado e
 * upload. O que gasta é a FATURA da OpenAI: a primeira chamada imprime o plano
 * e a conta, e só `--confirmar` executa.
 *
 * ⚠️ **Não chama `escolherReferenciaDeEstilo`** — aquilo é um RODÍZIO, e pedir
 * uma referência aqui marcaria uso, mudando qual arte a próxima geração de
 * verdade receberia. A referência vem da que já está gravada na origem.
 *
 * ⚠️ O gpt-image não expõe seed: as duas peças são composições diferentes. Isso
 * basta para o que se mede aqui (a caixa das letras e ONDE o bloco de texto
 * pousa são decisões, não ruído), mas não para julgar nitidez ou gosto. Rode
 * `--repeticoes 2` antes de tratar um caso isolado como prova.
 *
 * USO
 *   # o plano e a conta, sem gastar nada:
 *   npx tsx scripts/medir-modelo-a-seguir.ts --da-geracao <generationId>
 *
 *   # executar antes × depois:
 *   npx tsx scripts/medir-modelo-a-seguir.ts --da-geracao <id> --confirmar
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
import { decodificarGuia } from '../src/lib/ai/carousel-guide-decoder'
import { instrucaoLogoPeloModelo } from '../src/lib/ai/logo-compositor'
import {
  buildArtePrompt,
  buildReferencePreamble,
  type ArtReferenceRole,
} from '../src/lib/ai/image-prompt-builder'
import { googleDriveService } from '../src/server/google-drive-service'

// ── Constantes espelhadas do runner (`creative-generation-runner.ts:54,57`) ──
const MAX_INPUT_DIM = 4000
const MAX_REF_DIM = 3000

const PRECO_USD: Record<string, number> = { high: 0.165, medium: 0.045, low: 0.008 }
/** Comercial de 11/08 (R$ 5,1573) + IOF 3,5% + spread de cartão ~2%. */
const CAMBIO_PADRAO = 5.4446

type Qualidade = 'low' | 'medium' | 'high'
type Braco = 'antes' | 'depois'

interface Opcoes {
  daGeracao: string | null
  qualidade: Qualidade
  repeticoes: number
  saida: string
  cambio: number
  confirmar: boolean
}

function lerOpcoes(argv: string[]): Opcoes {
  const o: Opcoes = {
    daGeracao: null,
    qualidade: 'high',
    repeticoes: 1,
    saida: path.join(process.cwd(), '.tmp-modelo-a-seguir'),
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
      case '--qualidade': {
        const q = proximo().trim().toLowerCase() as Qualidade
        if (!['low', 'medium', 'high'].includes(q)) throw new Error(`Qualidade inválida: ${q}`)
        o.qualidade = q
        break
      }
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

interface Medicao {
  braco: Braco
  repeticao: number
  segundos: number
  textoPassou: boolean | null
  textoFaltando: string[]
  /** O que a visão leu na arte — é aqui que a CAIXA das letras aparece. */
  textoTranscrito: string[]
  arquivo: string
  erro?: string
}

/**
 * A caixa é medida pelo que a VISÃO transcreveu, não pela nossa intenção.
 *
 * `verifyImageTexts` compara em uppercase e sem acento (é o contrato da
 * conferência), então ele passa igual nos dois casos — de propósito. Quem
 * responde "saiu em caixa alta?" é a transcrição crua.
 */
function pareceCaixaAlta(texto: string): boolean {
  const letras = [...texto].filter((c) => /\p{L}/u.test(c))
  if (letras.length < 4) return false
  return letras.every((c) => c === c.toLocaleUpperCase('pt-BR'))
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
    throw new Error(`A geração ${o.daGeracao} é da trilha "${fv.track}". Este teste é da trilha arte.`)
  }

  const promptAntes: string = fv.prompt ?? ''
  if (!promptAntes) throw new Error('A geração de origem não guardou o prompt.')
  const inputSize: string = fv.inputSize ?? '1088x1936'
  const esperados = extractExpectedTexts(fv)
  if (esperados.length === 0) throw new Error('A geração de origem não tem textos esperados.')

  const refsOrigem = (fv.referencias ?? []) as Array<Record<string, string>>

  /**
   * A referência de estilo chega por dois caminhos, e os dois se medem aqui:
   *
   * - ESCOLHIDA À MÃO: vem em `fv.referencias` com role `style`. Vira o papel
   *   `style-guide` no braço "depois" — manda na diagramação.
   * - RODÍZIO: não está em `referencias`; só ficou o `styleRefId`. Segue como
   *   `style` nos dois braços, e o que se compara então é o resto do prompt
   *   (a caixa das letras, por exemplo).
   *
   * ⚠️ O `styleRefId` é LIDO, nunca pedido de novo: chamar
   * `escolherReferenciaDeEstilo` marcaria uso e mudaria qual arte a próxima
   * geração de verdade receberia.
   */
  let refModeloOrigem = refsOrigem.find((r) => r.role === 'style')
  const escolhidaAMao = !!refModeloOrigem
  if (!refModeloOrigem && typeof fv.styleRefId === 'string' && fv.styleRefId) {
    const { PrismaClient: PC } = await import('../prisma/generated/client')
    const db2 = new PC()
    const ref = await db2.generation.findUnique({
      where: { id: fv.styleRefId },
      select: { resultUrl: true },
    })
    await db2.$disconnect()
    if (ref?.resultUrl) {
      refModeloOrigem = { role: 'style', url: ref.resultUrl, label: 'arte aprovada desta marca' }
    }
  }
  if (!refModeloOrigem) {
    throw new Error('A geração de origem não teve referência de estilo — nem escolhida, nem do rodízio.')
  }

  const brand = await loadBrandContext(origem.projectId!)
  await db.$disconnect()

  const custoUsd = PRECO_USD[o.qualidade] * o.repeticoes * 2

  console.log('\n════ O MODELO ESCOLHIDO MANDA NA DIAGRAMAÇÃO? ════\n')
  console.log(`  origem       ${o.daGeracao} — ${origem.projectName}`)
  console.log(`  modelo       ${refModeloOrigem.label ?? 'style'} (${refModeloOrigem.url ?? refModeloOrigem.driveFileId})`)
  console.log(`  tamanho      ${inputSize} · tier ${o.qualidade}`)
  console.log(`  textos       ${esperados.map((t) => `"${t.slice(0, 26)}"`).join(', ')}`)
  console.log(`  saída        ${o.saida}\n`)
  console.log(
    escolhidaAMao
      ? '  antes   papel "style"       — combina clima, layout livre\n' +
          '  depois  papel "style-guide" — copia a diagramação, lido por visão\n'
      : '  antes   prompt gravado na geração\n' +
          '  depois  prompt do builder atual, mesmo papel "style"\n',
  )
  console.log(
    `  ${o.repeticoes * 2} gerações · US$ ${custoUsd.toFixed(3)} · R$ ${(custoUsd * o.cambio).toFixed(2)}` +
      `  (fatura da OpenAI; ZERO créditos do Studio)`,
  )

  // ── Prompt DEPOIS: o builder atual, com o modelo promovido ────────────────
  //
  // A imagem do modelo é decodificada por visão ANTES de montar o prompt —
  // exatamente como o runner faz agora.
  const bytesModelo = refModeloOrigem.driveFileId
    ? await baixarDoDrive(refModeloOrigem.driveFileId)
    : (await fetchImageSource(refModeloOrigem.url!)).buffer
  const modeloSaneado = await sanear(bytesModelo, MAX_REF_DIM)
  // Decodificar só faz sentido quando a referência VAI mandar na diagramação.
  const modeloLido = escolhidaAMao ? await decodificarGuia(modeloSaneado.buffer).catch(() => null) : null
  if (!escolhidaAMao) {
    console.log('\n  referência do RODÍZIO (não escolhida à mão): segue como "style" nos dois braços.')
  } else console.log(
    modeloLido
      ? `\n  modelo decodificado: ${
          modeloLido.elementosGraficos === null
            ? 'elementos gráficos não declarados'
            : `${modeloLido.elementosGraficos.length} elemento(s) gráfico(s)`
        }`
      : '\n  ⚠️  modelo NÃO decodificou — o teste segue só com a imagem e o MODELO SPINE',
  )

  const papeisDepois: Array<{ role: ArtReferenceRole; label?: string }> = [
    ...refsOrigem
      .filter((r) => r.role !== 'style')
      .map((r) => ({ role: r.role as ArtReferenceRole, label: r.label })),
    {
      role: (escolhidaAMao ? 'style-guide' : 'style') as ArtReferenceRole,
      label: refModeloOrigem.label ?? 'arte de referência',
    },
    { role: 'brand-card' as const },
    { role: 'type-specimen' as const, label: 'alfabetos oficiais da marca' },
    ...(fv.logoMode === 'modelo'
      ? [{ role: 'logo' as const, label: 'arquivo oficial — reproduzir fielmente' }]
      : []),
  ]

  const corpoDepois = buildArtePrompt({
    copy: esperados,
    pedido: fv.pedido || undefined,
    brand,
    refs: papeisDepois,
    instrucaoImagem: fv.instrucaoImagem ?? null,
    modelo: modeloLido
      ? { descricao: modeloLido.descricao, elementos: modeloLido.elementosGraficos }
      : null,
    // Peça avulsa com logo desenhada pelo modelo: canto livre, como no runner.
    blocoLogo: fv.logoMode === 'modelo' ? instrucaoLogoPeloModelo(null) : null,
  })
  const preambuloDepois = buildReferencePreamble(papeisDepois)
  const promptDepois = `${preambuloDepois}\n\n${corpoDepois}`

  console.log(`  prompt antes : ${promptAntes.length} chars`)
  console.log(`  prompt depois: ${promptDepois.length} chars`)
  const caixaAntes = [...promptAntes.matchAll(/caixa alta[^.\n]{0,50}/gi)].map((m) => m[0].trim())
  const caixaDepois = [...promptDepois.matchAll(/caixa alta[^.\n]{0,50}/gi)].map((m) => m[0].trim())
  console.log(`  "caixa alta" antes : ${caixaAntes.join(' | ') || '(nenhuma)'}`)
  console.log(`  "caixa alta" depois: ${caixaDepois.join(' | ') || '(nenhuma)'}`)

  if (!o.confirmar) {
    console.log('\n  Nada foi gerado. Repita com --confirmar para executar.\n')
    return
  }

  await fs.mkdir(o.saida, { recursive: true })
  await fs.writeFile(path.join(o.saida, 'prompt-antes.txt'), promptAntes)
  await fs.writeFile(path.join(o.saida, 'prompt-depois.txt'), promptDepois)

  // ── Referências, na ORDEM que cada prompt descreve ("Image 1 is…") ────────
  //
  // Os dois braços recebem as MESMAS imagens: só o papel declarado no
  // preâmbulo muda. É o que isola a variável.
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

  for (const r of refsOrigem.filter((x) => x.role !== 'style')) {
    const bytes = r.driveFileId ? await baixarDoDrive(r.driveFileId) : (await fetchImageSource(r.url!)).buffer
    await empurrar(r.role, bytes, r.role === 'subject' ? MAX_INPUT_DIM : MAX_REF_DIM, false, r.label ?? r.role)
  }
  await empurrar('modelo', bytesModelo, MAX_REF_DIM, false, refModeloOrigem.label ?? 'arte de referência')
  const card = await getBrandReferenceCard(brand).catch(() => null)
  if (card) await empurrar('brand-card', card.buffer, MAX_REF_DIM, true, card.origem)
  const prancha = await renderTypeSpecimen(brand).catch(() => null)
  if (prancha) await empurrar('type-specimen', prancha, MAX_REF_DIM, true, 'alfabetos oficiais')
  if (fv.logoMode === 'modelo' && brand?.logoUrl) {
    await empurrar('logo', (await fetchImageSource(brand.logoUrl)).buffer, MAX_REF_DIM, true, 'arquivo oficial')
  }

  console.log('\n  Referências reconstituídas:')
  for (const d of descricoes) console.log(`    ${d}`)
  const ordemOriginal = (fv.refsUsadas ?? []).map((r: any) => r.role).join(' → ')
  console.log(`  ordem original : ${ordemOriginal}`)
  console.log(`  ordem obtida   : ${descricoes.map((d) => d.split(' ')[1]).join(' → ')}`)
  console.log('  (o papel "style" da origem é o "modelo" aqui — mesma imagem, mesma posição)')

  const medicoes: Medicao[] = []
  const bracos: Array<[Braco, string]> = [
    ['antes', promptAntes],
    ['depois', promptDepois],
  ]

  for (let rep = 1; rep <= o.repeticoes; rep++) {
    for (const [braco, prompt] of bracos) {
      process.stdout.write(`\n  ⏳ ${braco} r${rep} … `)
      const t0 = Date.now()
      try {
        const buffer = await runImageEdit({ images: refs, prompt, size: inputSize, quality: o.qualidade })
        const segundos = (Date.now() - t0) / 1000
        const arquivo = path.join(o.saida, `${braco}-r${rep}.png`)
        await fs.writeFile(arquivo, buffer)
        process.stdout.write(`${segundos.toFixed(0)}s — lendo o texto… `)

        let textoPassou: boolean | null = null
        let faltando: string[] = []
        let transcrito: string[] = []
        try {
          const check = await verifyImageTexts(buffer, esperados)
          textoPassou = check.passed
          faltando = check.missing
          transcrito = check.extracted
          process.stdout.write(check.passed ? '✅ copy completa' : `❌ faltou ${check.missing.length}`)
        } catch (e) {
          // Visão fora do ar nunca derruba a peça — regra da casa.
          process.stdout.write(`⚠️ visão indisponível (${e instanceof Error ? e.message.slice(0, 60) : e})`)
        }

        medicoes.push({
          braco,
          repeticao: rep,
          segundos,
          textoPassou,
          textoFaltando: faltando,
          textoTranscrito: transcrito,
          arquivo,
        })
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro)
        process.stdout.write(`❌ ${msg.slice(0, 140)}`)
        medicoes.push({
          braco,
          repeticao: rep,
          segundos: (Date.now() - t0) / 1000,
          textoPassou: null,
          textoFaltando: [],
          textoTranscrito: [],
          arquivo: '',
          erro: msg,
        })
      }
    }
  }

  console.log('\n\n════ RESULTADO ════\n')
  for (const m of medicoes) {
    const caixaAlta = m.textoTranscrito.filter(pareceCaixaAlta)
    console.log(`  ${m.braco.padEnd(6)} r${m.repeticao}  ${m.segundos.toFixed(0)}s  ${m.arquivo || m.erro}`)
    if (m.textoTranscrito.length > 0) {
      console.log(`         transcrito: ${m.textoTranscrito.map((t) => `"${t}"`).join(', ')}`)
      console.log(
        `         em caixa alta: ${caixaAlta.length}/${m.textoTranscrito.length}` +
          (caixaAlta.length > 0 ? ` — ${caixaAlta.map((t) => `"${t}"`).join(', ')}` : ''),
      )
    }
    if (m.textoPassou === false) console.log(`         ⚠️ copy faltando: ${m.textoFaltando.join(', ')}`)
  }
  console.log(
    '\n  A CAIXA e a DIAGRAMAÇÃO se julgam OLHANDO as duas artes lado a lado com o\n' +
      '  modelo. A transcrição acima diz o que a visão leu; ela não julga layout.\n',
  )

  await fs.writeFile(
    path.join(o.saida, 'resultado.json'),
    JSON.stringify({ geradoEm: new Date().toISOString(), origem: o.daGeracao, esperados, medicoes }, null, 2),
  )
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}\n`)
  process.exit(1)
})
