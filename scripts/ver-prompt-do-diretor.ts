/**
 * Mostra o BRIEFING que o diretor de arte escreveria para uma peça real —
 * sem gerar imagem, sem tocar no banco, sem gastar crédito. Uma chamada do
 * planejador (`gpt-5.2`, centavos) por rodada.
 *
 * É o dry-run da religação de 08/09/2026: monta EXATAMENTE o que o runner
 * monta (foto + manual como imagens; a referência escolhida só para o
 * diretor; leitura medida da foto; catálogo do acervo) e imprime o resultado.
 *
 *   npx dotenv-cli -e .env -- npx tsx scripts/ver-prompt-do-diretor.ts --projeto 11
 *   npx dotenv-cli -e .env -- npx tsx scripts/ver-prompt-do-diretor.ts --projeto 11 \
 *     --foto <driveFileId> --referencia <generationId> \
 *     --copy "Happy Hour" --copy "Brinde com descontos especiais" --copy "Seg a Sáb - 16h às 19h"
 *
 * Sem `--foto`, usa a última foto do acervo que entrou numa arte-ia do projeto
 * (`PhotoUsage`); sem `--copy`, a copy dessa arte. Sem `--referencia`, a porta
 * é a do manual. `--rodadas N` repete para ver a variação entre rodadas.
 * Saída também em `.tmp-diretor/<projeto>-<hora>.txt`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { db } from '../src/lib/db'
import { loadBrandContext } from '../src/lib/brand/brand-context'
import { getBrandReferenceCard } from '../src/lib/ai/brand-reference-card'
import { fetchImageSource } from '../src/lib/ai/fetch-image-source'
import { decodificarGuia } from '../src/lib/ai/carousel-guide-decoder'
import { planejarArte, type ReferenciaDoPlanoDeGeracao } from '../src/lib/ai/diretor-de-arte'
import { resumirCatalogoDaFoto, resumirMapaDeCalma } from '../src/lib/ai/leitura-da-foto'
import { estimarAssunto, mapaDeCalma } from '../src/lib/compositor/mapa-de-calma'
import { lerFotoComoCover } from '../src/lib/creatives/halo/halo-medicao'
import { lerCatalogoDoProjeto } from '../src/lib/creatives/acervo'
import { copyComCaixaDaMarca } from '../src/lib/ai/image-prompt-builder'
import { assinaturaTipografica } from '../src/lib/ai/assinatura-tipografica'
import { logoModePadraoPara } from '../src/lib/ai/logo-compositor'
import { modeloLivre } from '../src/lib/ai/modelo-livre'

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function args(nome: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === `--${nome}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

async function main() {
  const projectId = Number(arg('projeto'))
  if (!projectId) throw new Error('--projeto <id> é obrigatório')
  const formato = (arg('formato') as 'story' | 'feed' | 'quadrado' | undefined) ?? 'story'
  const finalSize = formato === 'story' ? { width: 1088, height: 1936 } : formato === 'feed' ? { width: 1088, height: 1360 } : { width: 1088, height: 1088 }
  const rodadas = Number(arg('rodadas') ?? '1')

  const brand = await loadBrandContext(projectId)
  if (!brand) throw new Error(`projeto ${projectId} sem identidade`)

  // ── A foto e a copy ──
  let driveFileId = arg('foto')
  let copy = args('copy')
  if (!driveFileId || copy.length === 0) {
    const uso = await db.photoUsage.findFirst({
      where: { projectId, origem: 'arte-ia', generationId: { not: null } },
      orderBy: { usedAt: 'desc' },
    })
    if (!uso) throw new Error('nenhuma foto do acervo usada em arte-ia neste projeto — passe --foto e --copy')
    driveFileId ??= uso.driveFileId
    if (copy.length === 0 && uso.generationId) {
      const g = await db.generation.findUnique({ where: { id: uso.generationId }, select: { fieldValues: true } })
      const fv = (g?.fieldValues ?? {}) as Record<string, unknown>
      const bruto = fv.textos ?? fv.textosLivres ?? fv.slotValues ?? fv.copy
      copy = Array.isArray(bruto) ? bruto.map(String) : bruto && typeof bruto === 'object' ? Object.values(bruto as Record<string, unknown>).map(String) : []
      console.log(`copy da arte ${uso.generationId}: ${JSON.stringify(copy)}`)
    }
  }
  if (copy.length === 0) throw new Error('sem copy — passe --copy')
  const foto = await fetchImageSource(`/api/google-drive/image/${driveFileId}`)
  console.log(`foto ${driveFileId}: ${(foto.buffer.length / 1024).toFixed(0)} KB`)

  // ── O manual ──
  const card = await getBrandReferenceCard(brand)
  if (!card || card.origem !== 'manual-designer') console.warn('⚠️ projeto sem manual (brandManualUrl) — o diretor recebe o card gerado')

  // ── A referência escolhida à mão (só o diretor vê) ──
  const referenciaId = arg('referencia')
  let referencia: { buffer: Buffer; textos: string[] } | null = null
  if (referenciaId) {
    const g = await db.generation.findUnique({ where: { id: referenciaId }, select: { resultUrl: true } })
    if (!g?.resultUrl) throw new Error(`referência ${referenciaId} sem arte`)
    const img = await fetchImageSource(g.resultUrl)
    const lida = await decodificarGuia(img.buffer, { nomeDaMarca: brand.projectName, semPosicoes: modeloLivre(projectId) }).catch(() => null)
    referencia = { buffer: img.buffer, textos: lida?.textos ?? [] }
    console.log(`referência ${referenciaId}: textos lidos = ${JSON.stringify(referencia.textos)}`)
  }

  // ── Leitura medida + catálogo ──
  const cinza = await lerFotoComoCover(foto.buffer, finalSize)
  const mapa = mapaDeCalma(cinza)
  const leituraDaFoto = resumirMapaDeCalma(mapa, estimarAssunto(mapa))
  let catalogoDaFoto: string | null = null
  try {
    const { todas } = await lerCatalogoDoProjeto(projectId)
    catalogoDaFoto = resumirCatalogoDaFoto(todas.find((i) => i.driveFileId === driveFileId) ?? null)
  } catch (e) {
    console.warn('catálogo não lido:', e instanceof Error ? e.message : e)
  }
  console.log(`\n${leituraDaFoto}\n${catalogoDaFoto ?? '(foto sem entrada no catálogo)'}\n`)

  const logoCompor = logoModePadraoPara(projectId) === 'compor'
  const referencias: ReferenciaDoPlanoDeGeracao[] = [{ indice: 1, papel: 'subject', buffer: foto.buffer }]
  if (card) referencias.push({ indice: 2, papel: 'brand-card', rotulo: card.origem === 'manual-designer' ? 'manual oficial de identidade' : null, buffer: card.buffer })
  if (referencia) referencias.push({ indice: 0, papel: 'style-guide', buffer: referencia.buffer, estiloLivre: modeloLivre(projectId), visivelAoGerador: false })

  mkdirSync('.tmp-diretor', { recursive: true })
  for (let r = 1; r <= rodadas; r++) {
    const t0 = Date.now()
    const plano = await planejarArte({
      copy: copyComCaixaDaMarca(copy, brand),
      pedido: arg('pedido') ?? '',
      brand,
      referencias,
      formato,
      alturaPx: finalSize.height,
      instrucaoImagem: arg('ajuste') ?? null,
      logoCompor,
      assinaturaTipografica: assinaturaTipografica(projectId),
      leituraDaFoto,
      catalogoDaFoto,
      textosDaReferencia: referencia?.textos ?? null,
    })
    if (!plano) {
      console.error(`rodada ${r}: o diretor NÃO respondeu (cairia no molde da porta)`)
      continue
    }
    const cabecalho = `── rodada ${r} · ${plano.modelo} · ${(plano.ms / 1000).toFixed(1)}s · ${plano.tentativas} tentativa(s) · ${plano.prompt.length} chars · canto: ${plano.cantoDaMarca ?? '—'}\nLEITURA: ${plano.leitura ?? '—'}\n`
    console.log(`\n${cabecalho}\n${plano.prompt}\n`)
    const arquivo = `.tmp-diretor/${projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}-r${r}.txt`
    writeFileSync(arquivo, `${cabecalho}\n${plano.prompt}\n`)
    console.log(`(gravado em ${arquivo}, ${((Date.now() - t0) / 1000).toFixed(1)}s no total)`)
  }
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
