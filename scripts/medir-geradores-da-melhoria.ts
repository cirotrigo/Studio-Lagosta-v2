/**
 * A bancada dos GERADORES da melhoria (17/11/2026): a mesma arte, o mesmo
 * pedido e o MESMO prompt do diretor de arte, uma geração no gpt-image e uma
 * no Nano Banana, cada uma com a recomposição do seu caminho em produção
 * (`preservar-foto.ts` no OpenAI, `recompor-por-zona.ts` no Gemini).
 *
 * Por caso e por gerador grava: quanto da arte o gerador mexeu, quanto a FOTO
 * diferia da origem fora das zonas (na peça como veio e na peça final), a
 * área que ficou alterada, o desfecho (pronta, reprovada, "não entrou"), a
 * conferência de texto, o tempo e os tokens. E monta uma folha de contato:
 * origem | OpenAI | Gemini.
 *
 * Espelha o essencial do runner (`creative-improvement-runner.ts`) sem fila,
 * sem retentativa e sem gravar nada: não escreve no banco, não sobe arquivo e
 * não cobra crédito. O custo é a fatura das APIs: uma geração por caso e por
 * gerador, mais o diretor de arte e a conferência por visão.
 *
 * 🔴 Roda contra o banco de DESENVOLVIMENTO. Sem o runner `dev-db.ts` o
 * `DATABASE_URL` é o do `.env` (produção) e o script se recusa.
 *
 * Uso:
 *   npm run db:dev:status
 *   npx tsx scripts/dev-db.ts npx tsx scripts/medir-geradores-da-melhoria.ts --casos=casos.json              # lista, não gera
 *   npx tsx scripts/dev-db.ts npx tsx scripts/medir-geradores-da-melhoria.ts --casos=casos.json --confirmar
 *   ... --confirmar --so=nome-do-caso      # um caso só
 *   ... --confirmar --geradores=gemini     # um gerador só
 *   ... --confirmar --reaproveitar         # não gera: recalcula a partir das peças já salvas (calibrar limiar sem pagar)
 *
 * `casos.json`: [{ "nome": "byrock-ondas", "projectId": 7, "modo": "refinar",
 *   "pedido": "troque o tracejado por ondas sonoras",
 *   "generationId": "cm..."  |  "arquivo": "/caminho/arte.png" }]
 * Com `arquivo` (arte que não está no banco de dev) a régua de texto sai da
 * própria arte, por visão, como no runner.
 */
import 'dotenv/config'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { computeDe } from '../src/lib/compute-do-banco'
import type { GeradorDaMelhoria } from '../src/lib/ai/gerador-da-melhoria'
import type { ModoDaMelhoria } from '../src/lib/ai/modo-da-melhoria'
import type { ReferenceImage } from '../src/lib/ai/openai-image-client'
import type { ImagemDoPlano } from '../src/lib/ai/diretor-de-arte'

interface Caso {
  nome: string
  projectId: number
  modo: ModoDaMelhoria
  pedido: string
  generationId?: string
  arquivo?: string
}

const SAIDA = path.join(process.cwd(), '.tmp-medicao-geradores')

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
}

/** O `DATABASE_URL` em uso é o do `.env`? Então é produção, e a medição não roda. */
function recusarProducao(): void {
  const linha = readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))
  const producao = linha ? computeDe(linha.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')) : null
  const emUso = computeDe(process.env.DATABASE_URL ?? '')
  if (!emUso || emUso === producao) {
    console.error('✗ Este script roda contra o banco de DESENVOLVIMENTO: npx tsx scripts/dev-db.ts npx tsx scripts/medir-geradores-da-melhoria.ts …')
    process.exit(1)
  }
  console.log(`banco: ${emUso} (desenvolvimento)`)
}

const jpg = (buf: Buffer) => sharp(buf).jpeg({ quality: 90 }).toBuffer()

async function main() {
  recusarProducao()
  const arquivoDeCasos = arg('casos')
  if (!arquivoDeCasos || !existsSync(arquivoDeCasos)) throw new Error('--casos=<arquivo.json> é obrigatório')
  const so = arg('so')
  const todos = JSON.parse(readFileSync(arquivoDeCasos, 'utf8')) as Caso[]
  const casos = todos.filter((c) => !so || c.nome === so)
  const geradores = (arg('geradores') ?? 'openai,gemini').split(',') as GeradorDaMelhoria[]
  const reaproveitar = process.argv.includes('--reaproveitar')

  console.log(`\n${casos.length} caso(s) × ${geradores.join(' + ')} = ${casos.length * geradores.length} geração(ões)\n`)
  for (const c of casos) console.log(`  ${c.nome.padEnd(28)} projeto ${String(c.projectId).padEnd(3)} ${c.modo.padEnd(12)} ${c.generationId ?? c.arquivo}\n    "${c.pedido}"`)
  if (!process.argv.includes('--confirmar')) {
    console.log('\nDRY-RUN. Com --confirmar gera e escreve em .tmp-medicao-geradores/.')
    return
  }

  const { db } = await import('../src/lib/db')
  const { loadImprovementAssets } = await import('../src/lib/ai/improvement-assets-loader')
  const { fetchImageSource } = await import('../src/lib/ai/fetch-image-source')
  const { loadExpectedTextsForGeneration, transcreverTextosDaArte, verifyImageTexts } = await import('../src/lib/ai/creative-text-verification')
  const { semTextosDaMarca } = await import('../src/lib/ai/text-comparison')
  const { aplicarCaixaDaOrigem, caixaTrocada, CAIXA_DA_MANCHETE } = await import('../src/lib/ai/caixa-da-copy')
  const { melhoriaCompoeLogo } = await import('../src/lib/ai/logo-na-melhoria')
  const { getBrandReferenceCard } = await import('../src/lib/ai/brand-reference-card')
  const { renderTypeSpecimen } = await import('../src/lib/ai/type-specimen')
  const { planejarMelhoria } = await import('../src/lib/ai/diretor-de-arte')
  const { gerarMelhoria, modeloDaMelhoria } = await import('../src/lib/ai/gerador-da-melhoria')
  const { qualidadePadraoPara } = await import('../src/lib/ai/qualidade-arte')
  const { inferFormatFromDimensions, OPENAI_INPUT_SIZE, FINAL_OUTPUT_SIZE } = await import('../src/lib/ai/creative-improvement-format')
  const { deslocamentoDaFoto, preservarFotoDaOrigem, TETO_DA_MASCARA } = await import('../src/lib/ai/preservar-foto')
  const { mudancaNaoEntrou, recomporPorZona } = await import('../src/lib/ai/recompor-por-zona')

  mkdirSync(SAIDA, { recursive: true })
  // Rodada parcial (`--so`, `--geradores`) não apaga o que já foi medido: geração paga não se repete.
  const arquivoDeResultados = path.join(SAIDA, 'resultados.json')
  const anteriores = existsSync(arquivoDeResultados) ? (JSON.parse(readFileSync(arquivoDeResultados, 'utf8')) as Array<Record<string, unknown>>) : []
  const resultados = anteriores.filter((r) => !casos.some((c) => c.nome === r.caso) || !geradores.includes(r.gerador as GeradorDaMelhoria))

  for (const caso of casos) {
    const pasta = path.join(SAIDA, caso.nome)
    mkdirSync(pasta, { recursive: true })
    console.log(`\n== ${caso.nome} (${caso.modo})`)
    const assets = await loadImprovementAssets(caso.projectId, { selectedLogoIds: [], selectedElementIds: [] })
    if (melhoriaCompoeLogo(caso.projectId)) console.warn('  ⚠ projeto em `compor`: o prompt dos dois geradores não é o mesmo (o OpenAI reserva o canto da logo); esta bancada manda a logo como referência aos dois')

    let origem: Buffer
    let textos: string[] = []
    if (caso.generationId) {
      const g = await db.generation.findUnique({ where: { id: caso.generationId }, select: { resultUrl: true } })
      if (!g?.resultUrl) throw new Error(`${caso.nome}: Generation ${caso.generationId} não está no banco de dev (ou não tem imagem)`)
      origem = (await fetchImageSource(g.resultUrl)).buffer
      textos = await loadExpectedTextsForGeneration(caso.generationId)
    } else {
      origem = readFileSync(caso.arquivo!)
    }
    const format0 = await sharp(origem).metadata()
    const format = inferFormatFromDimensions(format0.width ?? 0, format0.height ?? 0)
    const size = OPENAI_INPUT_SIZE[format]
    const finalSize = FINAL_OUTPUT_SIZE[format]
    // Como o runner (`ensureUnderLimit`): nada acima de 4 MB vai ao gerador.
    if (origem.length > 4 * 1024 * 1024) origem = await sharp(origem).jpeg({ quality: 90 }).toBuffer()
    const logoBruta = assets.logos[0] ? (await fetchImageSource(assets.logos[0].fileUrl)).buffer : null
    const logo = logoBruta ? await sharp(logoBruta).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).png().toBuffer() : null

    const meta = await sharp(origem).metadata()

    // A régua e a caixa, como no runner.
    const transcricaoDaOrigem = await transcreverTextosDaArte(origem).catch(() => [] as string[])
    let regua: 'banco' | 'visao' | 'nenhuma' = textos.length > 0 ? 'banco' : 'nenhuma'
    if (textos.length === 0) {
      const textosDaLogo = logo ? await transcreverTextosDaArte(logo).catch(() => [] as string[]) : []
      textos = semTextosDaMarca(transcricaoDaOrigem, { nomeDaMarca: assets.brand?.projectName ?? '', textosDaLogo }).regua
      if (textos.length > 0) regua = 'visao'
    }
    let textosParaPrompt = aplicarCaixaDaOrigem(textos, transcricaoDaOrigem, CAIXA_DA_MANCHETE.get(caso.projectId))

    // As mesmas referências para os dois: logo, manual da marca (fora do refinar) e prancha tipográfica.
    const references: ReferenceImage[] = []
    if (logo) references.push({ buffer: logo, mimeType: 'image/png', role: 'logo', label: assets.logos[0].name })
    let brandCard: Buffer | null = null
    if (caso.modo !== 'refinar') {
      const card = await getBrandReferenceCard(assets.brand).catch(() => null)
      if (card) {
        brandCard = card.buffer
        references.push({ buffer: card.buffer, mimeType: card.mimeType, role: 'brand-card', label: card.origem === 'manual-designer' ? 'manual oficial de identidade' : 'card da marca' })
      }
    }
    const prancha = await renderTypeSpecimen(assets.brand).catch(() => null)
    if (prancha) references.push({ buffer: prancha, mimeType: 'image/png', role: 'type-specimen', label: 'alfabetos oficiais da marca' })

    const imagens: ImagemDoPlano[] = [{ indice: 1, papel: 'origem', buffer: origem }]
    references.forEach((ref, i) => {
      const papel: ImagemDoPlano['papel'] = ref.role === 'logo' ? 'logo' : ref.role === 'brand-card' ? 'manual' : 'prancha'
      imagens.push({ indice: i + 2, papel, rotulo: ref.label ?? null, buffer: papel === 'manual' && brandCard ? brandCard : undefined })
    })
    const arquivoDoPlano = path.join(pasta, 'plano.json')
    const plano: { prompt: string; copyFinal: string[] } | null = reaproveitar && existsSync(arquivoDoPlano) ? JSON.parse(readFileSync(arquivoDoPlano, 'utf8')) : await planejarMelhoria({
      modo: caso.modo,
      imagens,
      brand: assets.brand,
      copy: textosParaPrompt,
      arteSemTexto: textos.length === 0,
      pedido: caso.pedido,
      instrucaoImagem: null,
      formato: format,
      logoCompor: false,
      artDirection: assets.artDirection,
    })
    if (!plano) console.warn('  ⚠ diretor de arte indisponível: os dois geradores recebem o prompt montado por código')
    let copyMudou = false
    if (plano && caso.modo === 'refinar' && (plano.copyFinal.length !== textosParaPrompt.length || plano.copyFinal.some((t, i) => t !== textosParaPrompt[i]))) {
      copyMudou = true
      textosParaPrompt = plano.copyFinal
      textos = plano.copyFinal
    }
    if (plano) writeFileSync(arquivoDoPlano, JSON.stringify({ prompt: plano.prompt, copyFinal: plano.copyFinal }, null, 2))
    writeFileSync(path.join(pasta, 'prompt.txt'), plano?.prompt ?? '(prompt montado por código)')
    writeFileSync(path.join(pasta, 'origem.jpg'), await jpg(origem))

    /** Quanto a peça difere da origem, pela mesma régua nos dois geradores (o mapa de zonas). */
    const medir = async (peca: Buffer) => {
      const r = await recomporPorZona(origem, peca, { tamanho: finalSize })
      return { area: r.fracaoDasZonas, fotoFora: r.diferencaForaAntes }
    }

    const quadros: Array<{ titulo: string; legenda: string; imagem: Buffer }> = [{ titulo: caso.nome, legenda: `origem · ${caso.modo}`, imagem: origem }]
    const porGerador = await Promise.all(
      geradores.map(async (gerador) => {
        const linha: Record<string, unknown> = { caso: caso.nome, projectId: caso.projectId, modo: caso.modo, pedido: caso.pedido, gerador, modelo: modeloDaMelhoria(gerador), regua, textos: textos.length }
        const tier = copyMudou ? 'medium' : qualidadePadraoPara({ temAjusteDeFoto: false, modo: caso.modo })
        if (gerador === 'openai') linha.tier = tier
        const t0 = Date.now()
        try {
          let uso: { tokensDeEntrada?: number; tokensDeSaida?: number } = {}
          const salva = ['png', 'jpg'].map((ext) => path.join(pasta, `${gerador}-bruta.${ext}`)).find((f) => existsSync(f))
          const anterior = anteriores.find((r) => r.caso === caso.nome && r.gerador === gerador)
          if (reaproveitar && !salva) throw new Error('--reaproveitar: não há peça salva deste gerador')
          const bruta = reaproveitar ? readFileSync(salva!) : await gerarMelhoria(gerador, {
            imageBuffer: origem,
            mimeType: `image/${meta.format === 'jpeg' ? 'jpeg' : 'png'}`,
            userRequest: caso.pedido,
            size,
            references,
            brandColors: assets.colors,
            artDirection: assets.artDirection,
            brand: assets.brand,
            expectedTexts: textosParaPrompt,
            arteSemTexto: textos.length === 0,
            promptPronto: plano?.prompt ?? null,
            quality: tier,
            timeoutMs: 280_000,
            aoConcluir: (u) => (uso = u),
          })
          linha.segundos = reaproveitar ? anterior?.segundos : Math.round((Date.now() - t0) / 1000)
          linha.tokensDeEntrada = reaproveitar ? anterior?.tokensDeEntrada : (uso.tokensDeEntrada ?? null)
          linha.tokensDeSaida = reaproveitar ? anterior?.tokensDeSaida : (uso.tokensDeSaida ?? null)
          if (!reaproveitar) writeFileSync(path.join(pasta, `${gerador}-bruta.png`), await sharp(bruta).png().toBuffer())
          const mBruta = await medir(bruta)
          linha.areaMexidaPeloGerador = Number(mBruta.area.toFixed(3))
          linha.fotoForaDasZonasBruta = Number(mBruta.fotoFora.toFixed(1))

          // A recomposição e as guardas do caminho de produção de cada gerador.
          let final: Buffer | null = null
          let desfecho = 'pronta'
          const deslocamento = async () => {
            const d = await deslocamentoDaFoto(origem, bruta)
            linha.fotoDeslocada = d.deslocada
            return d.deslocada ? `reprovada: a IA tirou o assunto da foto do lugar (${d.deslocados} de ${d.ladrilhos} pedaços)` : null
          }
          if (gerador === 'gemini') {
            const reprova = await deslocamento()
            if (reprova) desfecho = reprova
            else {
              const r = await recomporPorZona(origem, bruta, { tamanho: finalSize, logo })
              linha.logo = r.logo
              if (r.fracaoDasZonas > TETO_DA_MASCARA) desfecho = `reprovada: a IA mexeu em ${Math.round(r.fracaoDasZonas * 100)}% da arte`
              else if (mudancaNaoEntrou(r.fracaoDasZonas)) desfecho = 'não entrou: o gerador devolveu a arte como estava'
              else final = r.buffer
            }
          } else if (caso.modo === 'redesenhar') {
            const reprova = await deslocamento()
            if (reprova) desfecho = reprova
            else final = await sharp(bruta).resize(finalSize.width, finalSize.height, { fit: 'cover' }).png().toBuffer()
          } else {
            const coresDaMarca = assets.colors.map((c) => c.hexCode)
            const r = await preservarFotoDaOrigem(origem, bruta, { coresDaMarca, tamanho: finalSize })
            linha.fotoRecusada = Number(r.fracaoRecusada.toFixed(3))
            if (r.fracaoDaMascara > TETO_DA_MASCARA) desfecho = `reprovada: a IA mexeu em ${Math.round(r.fracaoDaMascara * 100)}% da arte, e só o texto podia mudar`
            else if (mudancaNaoEntrou(r.fracaoDaMascara))
              desfecho = !mudancaNaoEntrou(r.fracaoRecusada) ? `não entrou: a recomposição devolveu ${Math.round(r.fracaoRecusada * 100)}% à origem (a mudança não é texto)` : 'não entrou: o gerador devolveu a arte como estava'
            else final = r.buffer
          }

          if (final) {
            writeFileSync(path.join(pasta, `${gerador}-final.jpg`), await jpg(final))
            const mFinal = await medir(final)
            linha.areaAlteradaNaFinal = Number(mFinal.area.toFixed(3))
            linha.fotoForaDasZonasFinal = Number(mFinal.fotoFora.toFixed(1))
            if (textos.length > 0) {
              const check = await verifyImageTexts(final, textos, [], assets.brand?.projectName ?? null, transcricaoDaOrigem.length > 0 ? transcricaoDaOrigem : origem)
              const trocas = check.passed && caso.modo === 'rediagramar' ? caixaTrocada(transcricaoDaOrigem, check.extracted) : []
              linha.texto = !check.passed ? `faltou ${check.missing.length}: ${check.missing.slice(0, 2).join(' | ')}` : trocas.length > 0 ? `caixa trocada em ${trocas.length}` : 'ok'
              if (check.blocosAMais.comDado.length > 0) linha.textoAMais = check.blocosAMais.comDado
              if (linha.texto !== 'ok') desfecho = `reprovada: texto divergente (${linha.texto})`
            } else {
              linha.texto = 'sem régua'
            }
          }
          linha.desfecho = desfecho
          quadros.push({
            titulo: `${gerador} · ${linha.modelo}`,
            legenda: `${desfecho.slice(0, 60)} · ${linha.segundos}s`,
            imagem: final ?? bruta,
          })
        } catch (erro) {
          linha.segundos ??= Math.round((Date.now() - t0) / 1000)
          linha.desfecho = `erro: ${(erro as Error).message.slice(0, 200)}`
        }
        console.log(`  ${gerador.padEnd(7)} ${String(linha.segundos).padStart(4)}s  ${linha.desfecho}  | mexeu ${linha.areaMexidaPeloGerador ?? '-'} foto bruta ${linha.fotoForaDasZonasBruta ?? '-'} final ${linha.fotoForaDasZonasFinal ?? '-'} texto ${linha.texto ?? '-'}`)
        return linha
      }),
    )
    resultados.push(...porGerador)
    writeFileSync(arquivoDeResultados, JSON.stringify(resultados, null, 2))

    // A linha da folha: origem | um quadro por gerador, com a legenda embaixo.
    const alt = 640
    const larg = Math.round((alt * (meta.width ?? 1080)) / (meta.height ?? 1920))
    const celula = 400
    const itens = await Promise.all(
      quadros.map(async (q, i) => {
        const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        const legenda = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${celula}" height="52"><text x="0" y="18" font-family="Helvetica" font-size="15" font-weight="700" fill="#fff">${esc(q.titulo)}</text><text x="0" y="40" font-family="Helvetica" font-size="12" fill="#bbb">${esc(q.legenda)}</text></svg>`,
        )
        return [
          { input: await sharp(q.imagem).resize(larg, alt, { fit: 'cover' }).toBuffer(), left: 12 + i * (celula + 12), top: 12 },
          { input: legenda, left: 12 + i * (celula + 12), top: alt + 18 },
        ]
      }),
    )
    writeFileSync(
      path.join(pasta, 'linha.png'),
      await sharp({ create: { width: 12 + 3 * (celula + 12), height: alt + 80, channels: 3, background: '#111111' } }).composite(itens.flat()).png().toBuffer(),
    )
  }

  // Folha de contato: uma linha por caso, na ordem do arquivo de casos.
  const linhasDaFolha = todos.map((c) => path.join(SAIDA, c.nome, 'linha.png')).filter((f) => existsSync(f)).map((f) => readFileSync(f))
  if (linhasDaFolha.length > 0) {
    const metas = await Promise.all(linhasDaFolha.map((l) => sharp(l).metadata()))
    let y = 0
    const composicao = linhasDaFolha.map((l, i) => {
      const item = { input: l, left: 0, top: y }
      y += metas[i].height ?? 0
      return item
    })
    writeFileSync(path.join(SAIDA, 'folha.jpg'), await sharp({ create: { width: metas[0].width ?? 0, height: y, channels: 3, background: '#111111' } }).composite(composicao).jpeg({ quality: 82 }).toBuffer())
  }

  const cab = '| caso | modo | gerador | desfecho | mexeu | foto bruta | foto final | área final | texto | s | tokens (ent/saída) |\n|---|---|---|---|---|---|---|---|---|---|---|'
  const pct = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '–')
  const num = (v: unknown) => (typeof v === 'number' ? String(v).replace('.', ',') : '–')
  const ordem = todos.map((c) => c.nome)
  const tabela = [...resultados]
    .sort((a, b) => ordem.indexOf(String(a.caso)) - ordem.indexOf(String(b.caso)) || String(b.gerador).localeCompare(String(a.gerador)))
    .map((r) => `| ${r.caso} | ${r.modo} | ${r.gerador}${r.tier ? ` (${r.tier})` : ''} | ${r.desfecho} | ${pct(r.areaMexidaPeloGerador)} | ${num(r.fotoForaDasZonasBruta)} | ${num(r.fotoForaDasZonasFinal)} | ${pct(r.areaAlteradaNaFinal)} | ${r.texto ?? '–'} | ${r.segundos} | ${r.tokensDeEntrada ?? '–'}/${r.tokensDeSaida ?? '–'} |`)
    .join('\n')
  writeFileSync(path.join(SAIDA, 'tabela.md'), `${cab}\n${tabela}\n`)
  console.log(`\n${cab}\n${tabela}\n\nArquivos em ${SAIDA}/`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
