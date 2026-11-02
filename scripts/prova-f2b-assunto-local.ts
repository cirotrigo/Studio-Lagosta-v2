/**
 * PROVA LOCAL da F2b (02/11/2026), ZERO ESCRITA: compõe a referência do Brunch com outras fotos, em memória, e mostra a
 * janela assistida. Só LÊ: a página e a assinatura no banco, metadados e miniaturas no Drive, as fotos por URL lh3. Paga
 * uma chamada de visão por foto. Não importa `aprovarReferencia` nem `persist`; as caixas vêm da visão NA HORA e NÃO são
 * gravadas; `provar: true` devolve o PNG antes da pasta e da persistência (`persistido: null`, conferido abaixo).
 *
 * Fotos por `url` lh3, nunca `driveFileId`: `carregarFoto` por id pode escrever o cache do Blob.
 *
 * USO (no terminal do Ciro, no worktree):
 *   npx tsx --env-file=.env scripts/prova-f2b-assunto-local.ts --fotos id1,id2,id3
 * Saída em SAIDA (abaixo): um PNG por peça, `prova-f2b-lado-a-lado.png` e `prova-f2b.md`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import sharp from 'sharp'
import { db } from '../src/lib/db'
import { comporPeca, type AssistenciaDoAssunto } from '../src/lib/compositor/compor'
import { camadaDaFotoDaPagina } from '../src/lib/compositor/arquetipos/da-pagina'
import { compilarReferencia, type LeituraDaReferencia } from '../src/lib/compositor/arquetipos/referencia'
import { impressaoDoArquetipo } from '../src/lib/compositor/arquetipos/impressao'
import { fonteDaFoto, fracaoVisivelDoAssunto } from '../src/lib/compositor/assunto-da-foto'
import { pisoDoProjetoDe } from '../src/lib/compositor/geometria'
import type { LeitorDeReferencias } from '../src/lib/compositor/referencias'
import { assuntoEfetivoDaFoto, type AssuntoEfetivo } from '../src/lib/creatives/assunto-da-foto-efetivo'
import { lerCaixaDaVisao, montarPromptDaCaixa } from '../src/lib/creatives/catalogo-de-fotos'
import { baixarMiniatura } from '../src/lib/creatives/reconciliar-catalogo'
import { versaoDaPagina } from '../src/lib/creatives/revisao/versao'
import { parsePageLayers } from '../src/lib/posts/page-layers'
import { googleDriveService } from '../src/server/google-drive-service'
import type { Layer } from '../src/types/template'

const PROJETO = 12
const PAGINA = 'cmvvab24y0003sw7cwiaizw9d' // Ref 02 · Brunch Empório
const FOTO_PADRAO = '1NBT2gX-L2CAIyuUxbw-jVI55OV57SkkE' // Cafeteria-dsc00545.jpg (a da prova F1)
const SAIDA = resolve(homedir(), 'Documents/Studio-Lagosta-v2/human-output/relatorios/editor-madrugada-2026-10-24/direcao-por-referencia-2026-10-30/f2b-assunto')
const BLOCOS = [
  { papel: 'headline', linhas: ['Brunch de domingo'] },
  { papel: 'apoio', linhas: ['Das 9h às 13h, com café coado'] },
]
const lh3 = (id: string, lado = 'w2000') => `https://lh3.googleusercontent.com/d/${id}=${lado}`
const fmt = (n: number, casas = 3) => n.toFixed(casas).replace('.', ',')

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function dimensoesDe(id: string) {
  const arquivo = (await googleDriveService.getFileMetadata(id, 'imageMediaMetadata(width,height,rotation)')) as { imageMediaMetadata?: { width?: number; height?: number; rotation?: number } }
  const { width, height, rotation = 0 } = arquivo.imageMediaMetadata ?? {}
  if (!width || !height) throw new Error(`${id}: o Drive não deu as dimensões`)
  return { armazenadas: { width, height }, rotation, dimensoes: rotation % 2 !== 0 ? { width: height, height: width } : { width, height } }
}

async function main() {
  const ids = (argumento('fotos') ?? FOTO_PADRAO).split(',').map((s) => s.trim()).filter(Boolean)
  mkdirSync(SAIDA, { recursive: true })
  const [page, projeto] = await Promise.all([
    db.page.findUnique({ where: { id: PAGINA }, select: { id: true, name: true, width: true, height: true, tags: true, layers: true, background: true } }),
    db.project.findUnique({ where: { id: PROJETO }, select: { assinatura: true } }),
  ])
  if (!page || !projeto) throw new Error('página ou projeto não encontrados')
  const camadas = parsePageLayers(page.layers) as unknown as Layer[]
  const pageVersion = versaoDaPagina(page)
  if (!pageVersion) throw new Error('camadas ilegíveis')
  const urlDaReferencia = camadaDaFotoDaPagina(camadas, page)?.fileUrl
  const idDaReferencia = fonteDaFoto({ url: urlDaReferencia }).id
  if (!idDaReferencia) throw new Error('a foto da referência não tem id do Drive')

  const visao = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!).getGenerativeModel({
    model: process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  })
  const caixaDe = async (id: string) => {
    const miniatura = await baixarMiniatura(id, 512)
    const resposta = await visao.generateContent([montarPromptDaCaixa({}), { inlineData: { mimeType: 'image/jpeg', data: miniatura.toString('base64') } }])
    const lida = lerCaixaDaVisao(JSON.parse(resposta.response.text()).caixaDoAssunto)
    if (lida === undefined) throw new Error(`${id}: a visão devolveu uma caixa inválida`)
    return { caixa: lida.caixa, miniatura }
  }

  const linhas: string[] = ['# Prova local da F2b (zero escrita)', '', `Página ${page.name} (\`${PAGINA}\`), versão \`${pageVersion}\`.`, '', '## Insumos', '', '| Foto | URL | Caixa da visão (NÃO gravada) | Dimensões | rotation | Proporção =s512 × s1920 |', '|---|---|---|---|---|---|']
  const mapa = new Map<string, AssuntoEfetivo>()
  const medidas = new Map<string, Awaited<ReturnType<typeof dimensoesDe>>>()
  for (const id of [idDaReferencia, ...ids]) {
    const [{ caixa, miniatura }, medida] = await Promise.all([caixaDe(id), dimensoesDe(id)])
    medidas.set(id, medida)
    mapa.set(id, assuntoEfetivoDaFoto({ caixaDoAssunto: caixa, caixaAnalisadaEm: 'prova-local' }, null))
    // A conferência de orientação: a rotation ímpar tem de bater com a proporção da miniatura e da cópia renderizadas.
    const copia = Buffer.from(await (await fetch(lh3(id, 's1920'))).arrayBuffer())
    const [mm, mc] = await Promise.all([sharp(miniatura).metadata(), sharp(copia).metadata()])
    linhas.push(`| \`${id}\` | \`${lh3(id)}\` | \`${JSON.stringify(caixa)}\` | ${medida.armazenadas.width}×${medida.armazenadas.height} → ${medida.dimensoes.width}×${medida.dimensoes.height} | ${medida.rotation} | ${fmt(mm.width! / mm.height!)} × ${fmt(mc.width! / mc.height!)} |`)
  }

  const caixaDaReferencia = mapa.get(idDaReferencia)!.caixa
  if (!caixaDaReferencia) throw new Error('a visão não localizou o assunto da foto da referência')
  const pisos = pisoDoProjetoDe(projeto.assinatura)
  const compilada = compilarReferencia({ id: page.id, name: page.name, width: page.width, height: page.height, tags: page.tags, layers: camadas }, { pageVersion, versao: 1, assunto: { caixa: caixaDaReferencia, dimensoes: medidas.get(idDaReferencia)!.dimensoes }, piso: pisos.story })
  if (!compilada.ok) throw new Error(JSON.stringify(compilada))
  const { definicao, leitura } = compilada as { definicao: Parameters<typeof impressaoDoArquetipo>[0]; leitura: LeituraDaReferencia }
  const impressao = impressaoDoArquetipo(definicao)
  linhas.push('', `Revisão compilada em memória: \`${definicao.id}@${definicao.versao}\`, impressão \`${impressao}\`, assunto \`${JSON.stringify(leitura.assunto)}\`.`, '', '## Peças', '', '| Foto | Estado | Alvo | Obtido (centro; ocupação) | Erro (dx; dy; ocupação) | Janela vencedora | Assunto visível | Ajustes | Zoom; escala |', '|---|---|---|---|---|---|---|---|---|')

  const leitor = { referenciaDeLayout: { findMany: async () => [{ arquetipoId: definicao.id, versao: definicao.versao, impressao, definicao }] } } as unknown as LeitorDeReferencias
  const pngs: Buffer[] = []
  for (const id of ids) {
    const c = await comporPeca({ projectId: PROJETO, formato: 'story', foto: { url: lh3(id) }, arquetipo: { id: definicao.id }, blocos: BLOCOS, nome: 'Prova F2b', tema: 'brunch' }, { canal: 'claude-code', provar: true, assuntosDoCatalogo: mapa, leitorDeReferencias: leitor })
    if (c.persistido !== null || !c.prova) throw new Error('a prova teria gravado: parando')
    writeFileSync(resolve(SAIDA, `prova-f2b-${id}.png`), c.prova)
    pngs.push(c.prova)
    const a = c.diagnostico.posicao.assistencia as AssistenciaDoAssunto
    const v = a.candidatas?.find((x) => x.chave === a.vencedora)
    const visivel = c.diagnostico.assunto ? fracaoVisivelDoAssunto(c.diagnostico.assunto, { width: 1080, height: 1920 }) : null
    linhas.push(`| \`${id}\` | ${a.estado}${a.motivo ? ` (${a.motivo})` : ''} | \`${JSON.stringify(a.alvo ?? null)}\` | ${v ? `${fmt(v.obtido.centro.x)}, ${fmt(v.obtido.centro.y)}; ${fmt(v.obtido.ocupacao)}` : '—'} | ${v ? `${fmt(v.erro.dx)}; ${fmt(v.erro.dy)}; ${fmt(v.erro.ocupacao)}` : '—'} | \`${JSON.stringify(v?.janela ?? c.diagnostico.posicao.crop)}\` | ${visivel === null ? '—' : fmt(visivel, 2)} | ${v?.ajustes.join(', ') || '—'} | ${v ? `${fmt(v.zoom, 2)}; ${fmt(v.escala, 2)}` : '—'} |`)
    console.log(id, a.estado, c.diagnostico.avisos)
  }

  // O aceite visual: o render aprovado da Brunch (relatório da F0) ao lado das peças.
  const brunch = resolve(SAIDA, '../f0-emporio-fonseca/ajustada-B-brunch-v2.jpg')
  const alturas = await Promise.all([...(existsSync(brunch) ? [brunch] : []), ...pngs].map((p) => sharp(p).resize({ width: 540, height: 960, fit: 'fill' }).png().toBuffer()))
  const largura = 540 * alturas.length + 20 * (alturas.length - 1)
  await sharp({ create: { width: largura, height: 960, channels: 3, background: '#ffffff' } })
    .composite(alturas.map((input, i) => ({ input, left: i * 560, top: 0 })))
    .png()
    .toFile(resolve(SAIDA, 'prova-f2b-lado-a-lado.png'))
  writeFileSync(resolve(SAIDA, 'prova-f2b.md'), `${linhas.join('\n')}\n`)
  console.log(`Saída em ${SAIDA}`)
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error('ERRO', e?.code, e?.message, JSON.stringify(e?.details ?? null)?.slice(0, 2000))
  await db.$disconnect()
  process.exit(1)
})
