/**
 * Monta a PÁGINA DE REVISÃO DE COPY de stories, para qualquer cliente do Studio.
 *
 * O padrão nasceu na Real Gelateria (15/09/2026, "Copy dos Stories da Real"):
 * antes de produzir arte ou animação, a copy proposta vira uma página com a
 * prévia de cada story na marca do cliente, e o Ciro edita, aprova, pede
 * mudança ou descarta. As respostas ficam no banco da página (capability `db`
 * do artifact) e são lidas antes de seguir. O passo a passo está em
 * `.claude/skills/revisar-copy/SKILL.md`.
 *
 * Do Studio, só LEITURA (nada é gravado no banco nem no Blob):
 *  - fonte, tamanho, entrelinha, tracking, caixa, cor e lugar de cada papel,
 *    margem e safe area: a página de assinatura de story, lida por
 *    `carregarAssinatura`, a mesma que o compositor usa;
 *  - a cor dos [colchetes]: `destaqueDoPapel`, a regra do compositor;
 *  - os arquivos das fontes (`CustomFont`) e a logo (da variante ou `Logo`);
 *  - a caixa da manchete: `CAIXA_DA_MANCHETE`;
 *  - a foto de prévia: miniatura do Drive, URL ou arquivo local.
 * Do JSON, escrito pelo Claude depois de ler o DNA e a base: a copy por papel,
 * a origem de cada texto, os fatos da base, as palavras vetadas e as listas de
 * CTA e pré-título aprovados. O formato está em `exemplo-carteira.json`.
 *
 *   npx tsx scripts/revisao-de-copy/montar-pagina.ts <propostas.json> [--saida <arquivo.html>]
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { db } from '@/lib/db'
import { CAIXA_DA_MANCHETE } from '@/lib/ai/caixa-da-copy'
import { carregarAssinatura, paginasDeAssinatura } from '@/lib/compositor/compor'
import { destaqueDoPapel } from '@/lib/compositor/destaques'
import { FONT_CONFIG } from '@/lib/font-config'
import type { Papel } from '@/lib/compositor/spec'
import { fetchBuffer } from '@/lib/posts/register-project-fonts'
import { googleDriveService } from '@/server/google-drive-service'

const W = 1080
const H = 1920
const TETO = 15.5 * 1024 * 1024 // o artifact aceita até 16 MB, com fontes e fotos embutidas
const PAPEIS: Papel[] = ['pre', 'headline', 'headline2', 'apoio', 'servico', 'cta']
const ID_VALIDO = /^[A-Za-z0-9_.~:@+-]{1,120}$/ // vira segmento de caminho no banco do artifact
const MODELO = path.resolve(process.cwd(), 'scripts/revisao-de-copy/modelo.html')
const FORMATO_DA_FONTE: Record<string, [string, string]> = {
  '.otf': ['font/otf', 'opentype'],
  '.ttf': ['font/ttf', 'truetype'],
  '.woff': ['font/woff', 'woff'],
  '.woff2': ['font/woff2', 'woff2'],
}

interface Foto {
  driveFileId?: string
  url?: string
  arquivo?: string
  rotulo?: string
}

interface StoryProposta {
  id: string
  projectId: number
  ordem?: number
  titulo: string
  uso?: string
  /** Id da página de assinatura de story, ou trecho único do nome. Sem ela, a primeira variante. */
  variante?: string
  /** Força todos os blocos no topo ou no rodapé (ex.: a faixa calma de um vídeo). */
  posicao?: 'topo' | 'rodape'
  alinhamento?: 'esquerda' | 'centro' | 'direita'
  foto: Foto
  copy: Partial<Record<Papel, string>>
  origem?: Partial<Record<Papel, string>>
  /** Entradas da base que sustentam preço, horário, data ou mecânica. */
  fatos?: string[]
  campanha?: string
  confirmar?: string[]
  nota?: string
  ficha?: { rotulo: string; valor: string | string[] }[]
  /** Palavra vetada que esta peça pode usar (ex.: "sorvete" no Dia do Sorvete). */
  permitir?: string[]
}

interface Propostas {
  pagina: { titulo: string; subtitulo?: string; exemplo?: string; descartados?: string }
  clientes: Record<string, { proibidas: string[]; ctas?: string[]; preTitulos?: string[] }>
  campanhas?: { slug: string; projectId: number; titulo: string; resumo: string; perguntas?: string[] }[]
  stories: StoryProposta[]
}

interface EstiloNaPagina {
  familia: string
  css: string
  tamanho: number
  entrelinha: number
  tracking: number
  caixa: 'uppercase' | null
  cor: string
  destaque: string
  alinhamento: 'esquerda' | 'centro' | 'direita'
  grupo: 'topo' | 'rodape'
  ordem: number
  /** px entre este papel e o anterior do mesmo lugar, como a página de assinatura desenha. */
  vao: number
  faltando: boolean
}

interface Variante {
  id: string
  nome: string
  W: number
  H: number
  margemH: number
  safeTopo: number
  safeRodape: number
  gap: number
  coluna: number
  mancha: string
  logo: { src: string; x: number; y: number; largura: number } | null
  papeis: Partial<Record<Papel, EstiloNaPagina>>
}

async function baixar(url: string): Promise<Buffer> {
  try {
    return await fetchBuffer(url)
  } catch {
    // O Blob devolve 403 com desafio anti-bot quando recebe muitas idas seguidas; uma pausa costuma bastar.
    await new Promise((r) => setTimeout(r, 3000))
    return fetchBuffer(url)
  }
}

function validar(p: Propostas): string[] {
  const erros: string[] = []
  if (!p?.pagina?.titulo) erros.push('pagina.titulo é obrigatório')
  if (!Array.isArray(p?.stories) || p.stories.length === 0) erros.push('stories está vazio')
  const vistos = new Set<string>()
  for (const s of p?.stories ?? []) {
    const onde = `story ${s.id ?? '(sem id)'}`
    if (!ID_VALIDO.test(s.id ?? '')) erros.push(`${onde}: o id só aceita letras, números e _ . ~ : @ + -`)
    if (vistos.has(s.id)) erros.push(`${onde}: id repetido`)
    vistos.add(s.id)
    if (!s.titulo) erros.push(`${onde}: titulo é obrigatório`)
    if (!Array.isArray(p.clientes?.[String(s.projectId)]?.proibidas)) {
      erros.push(`${onde}: clientes["${s.projectId}"].proibidas precisa existir. Leia o DNA e liste as palavras vetadas ([] se não houver)`)
    }
    if (!(s.foto?.driveFileId || s.foto?.url || s.foto?.arquivo)) erros.push(`${onde}: foto precisa de driveFileId, url ou arquivo`)
    const chaves = Object.keys(s.copy ?? {})
    if (chaves.length === 0) erros.push(`${onde}: copy vazia`)
    for (const k of chaves) if (!PAPEIS.includes(k as Papel)) erros.push(`${onde}: "${k}" não é papel (${PAPEIS.join(', ')})`)
    if (s.campanha && !p.campanhas?.some((k) => k.slug === s.campanha)) erros.push(`${onde}: a campanha "${s.campanha}" não está em campanhas`)
  }
  for (const k of p?.campanhas ?? []) if (!ID_VALIDO.test(k.slug ?? '')) erros.push(`campanha "${k.slug}": slug inválido`)
  return erros
}

async function fotoDePrevia(f: Foto): Promise<{ uri: string; rotulo: string }> {
  let bytes: Buffer
  let rotulo = f.rotulo ?? ''
  if (f.driveFileId) {
    const meta = (await googleDriveService.getFileMetadata(f.driveFileId, 'name, thumbnailLink')) as { name?: string; thumbnailLink?: string }
    if (!meta.thumbnailLink) throw new Error(`a foto ${f.driveFileId} do Drive não tem miniatura`)
    // A miniatura é assinada e expira: baixada aqui e embutida, nunca repassada à página.
    bytes = await baixar(meta.thumbnailLink.replace(/=s\d+$/, '=s1200'))
    rotulo ||= meta.name ?? f.driveFileId
  } else if (f.url) {
    bytes = await baixar(f.url)
    rotulo ||= path.basename(new URL(f.url).pathname)
  } else {
    bytes = await fs.readFile(f.arquivo as string)
    rotulo ||= path.basename(f.arquivo as string)
  }
  const jpg = await sharp(bytes).rotate().resize(432, 768, { fit: 'cover' }).jpeg({ quality: 74 }).toBuffer()
  return { uri: `data:image/jpeg;base64,${jpg.toString('base64')}`, rotulo }
}

async function logoDePrevia(url: string): Promise<string> {
  const png = await sharp(await baixar(url)).resize({ width: 320, withoutEnlargement: true }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

/**
 * A Montserrat vem com o repositório (assets/fonts/montserrat, um arquivo por peso) e o render a registra
 * sempre: sem CustomFont ela NÃO está faltando. Devolve o nome CSS da face do peso que o render usa
 * (sem peso, 400), ou null quando a família é do projeto ou não vem com o repositório.
 */
function fonteDoRepositorio(familia: string, peso: number | undefined, cadastradas: string[]): string | null {
  if (cadastradas.includes(familia) || familia.toLowerCase() !== 'montserrat') return null
  const alvo = peso ?? 400
  const maisPerto = FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS.map(Number).reduce((a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a))
  return `repo-Montserrat-${maisPerto}`
}

async function montarVariante(
  projectId: number,
  pagina: { id: string; nome: string },
  familias: string[],
  imagens: Record<string, string>,
): Promise<Variante> {
  const a = await carregarAssinatura(projectId, 'story', { paginas: [pagina.id] })
  const g = a.numeros.geometria.story
  const papeis: Variante['papeis'] = {}
  for (const papel of PAPEIS) {
    const e = a.papeis[papel]
    if (!e) continue
    const destaque = destaqueDoPapel({ daPagina: e.destaque, padrao: a.numeros.destaque, corDoPapel: e.color, familiaDoPapel: e.fontFamily, familias })
    const doRepositorio = fonteDoRepositorio(e.fontFamily, e.fontWeight, familias)
    papeis[papel] = {
      familia: e.fontFamily,
      css: doRepositorio ?? `p${projectId}-${e.fontFamily}`,
      tamanho: e.fontSize,
      entrelinha: e.lineHeight,
      tracking: e.letterSpacing,
      caixa: e.textTransform === 'uppercase' ? 'uppercase' : null,
      cor: e.color,
      destaque: destaque?.fill ?? e.color,
      alinhamento: e.alinhamento ?? a.alinhamento ?? 'esquerda',
      // O lugar do papel é o que a página de assinatura desenha: acima da metade, topo.
      grupo: e.caixa && e.caixa.y + e.caixa.height / 2 >= H / 2 ? 'rodape' : 'topo',
      ordem: e.caixa?.y ?? PAPEIS.indexOf(papel),
      vao: 0,
      faltando: !familias.includes(e.fontFamily) && !doRepositorio,
    }
  }
  // O vão entre papéis do mesmo lugar é o da página, como no compositor. Sobreposição de
  // desenho (a voz em script do Quintal entrando na manchete) vale até meia linha.
  for (const grupo of ['topo', 'rodape'] as const) {
    const doGrupo = PAPEIS.filter((p) => papeis[p]?.grupo === grupo).sort((x, y) => (papeis[x] as EstiloNaPagina).ordem - (papeis[y] as EstiloNaPagina).ordem)
    doGrupo.forEach((p, n) => {
      const e = papeis[p] as EstiloNaPagina
      const atual = a.papeis[p]?.caixa
      const anterior = n ? a.papeis[doGrupo[n - 1]]?.caixa : null
      if (!n) return
      e.vao = atual && anterior
        ? Math.max(-0.5 * e.tamanho * e.entrelinha, Math.min(400, Math.round(atual.y - (anterior.y + anterior.height))))
        : g.gapEntreBlocos
    })
  }
  let logo: Variante['logo'] = null
  if (a.logo?.url) {
    const chave = `logo-${a.logo.url}`
    if (!imagens[chave]) imagens[chave] = await logoDePrevia(a.logo.url)
    logo = { src: chave, x: a.logo.posicao?.x ?? W - g.margemH - a.logo.largura, y: a.logo.posicao?.y ?? g.safeTopo, largura: a.logo.largura }
  }
  return {
    id: pagina.id,
    nome: pagina.nome,
    W,
    H,
    margemH: g.margemH,
    safeTopo: g.safeTopo,
    safeRodape: g.safeRodape,
    gap: g.gapEntreBlocos,
    coluna: W - 2 * g.margemH, // a coluna útil que o compositor mede (compor.ts)
    mancha: a.numeros.mancha,
    logo,
    papeis,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const entrada = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--saida')
  if (!entrada) throw new Error('uso: npx tsx scripts/revisao-de-copy/montar-pagina.ts <propostas.json> [--saida <arquivo.html>]')
  const i = args.indexOf('--saida')
  const saida = i >= 0 ? args[i + 1] : entrada.replace(/\.json$/i, '') + '.html'
  const propostas = JSON.parse(await fs.readFile(entrada, 'utf8')) as Propostas
  const erros = validar(propostas)
  if (erros.length) throw new Error(erros.map((e) => `✗ ${e}`).join('\n'))

  const imagens: Record<string, string> = {}
  const fontesCss: string[] = []
  const fontesDoRepositorio = new Set<string>()
  const clientes: unknown[] = []
  const stories: unknown[] = []

  for (const projectId of [...new Set(propostas.stories.map((s) => s.projectId))]) {
    const projeto = await db.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        CustomFont: { select: { fontFamily: true, fileUrl: true } },
        Logo: { where: { isProjectLogo: true }, take: 1, select: { fileUrl: true } },
      },
    })
    if (!projeto) throw new Error(`o projeto ${projectId} não existe`)
    const doStory = (await paginasDeAssinatura(projectId)).paginas.filter((p) => p.formato === 'story')
    if (doStory.length === 0) throw new Error(`${projeto.name} não tem página de assinatura de story`)
    const nomes = doStory.map((p, n) => (doStory.filter((x) => x.name === p.name).length > 1 ? `${p.name} (${n + 1} de ${doStory.length})` : p.name))
    const familias = projeto.CustomFont.map((f) => f.fontFamily)
    const variantes = new Map<string, Variante>()

    for (const s of propostas.stories.filter((x) => x.projectId === projectId)) {
      const pedida = s.variante?.toLowerCase()
      const casam = pedida ? doStory.filter((p) => p.id === s.variante || p.name.toLowerCase().includes(pedida)) : [doStory[0]]
      if (casam.length !== 1) {
        throw new Error(`story ${s.id}: a variante "${s.variante}" ${casam.length ? 'é ambígua (use o id)' : 'não existe'} em ${projeto.name}. Variantes: ${doStory.map((p, n) => `${nomes[n]} [${p.id}]`).join(' · ')}`)
      }
      const pagina = casam[0]
      if (!variantes.has(pagina.id)) {
        variantes.set(pagina.id, await montarVariante(projectId, { id: pagina.id, nome: nomes[doStory.indexOf(pagina)] }, familias, imagens))
      }
      const v = variantes.get(pagina.id) as Variante
      const copy = Object.fromEntries(PAPEIS.filter((p) => typeof s.copy[p] === 'string').map((p) => [p, s.copy[p] as string]))
      const semLugar = Object.keys(copy).filter((p) => copy[p].trim() && !v.papeis[p as Papel])
      if (semLugar.length) console.warn(`  ! ${s.id}: a variante "${v.nome}" não tem ${semLugar.join(', ')}`)
      const foto = await fotoDePrevia(s.foto)
      imagens[`foto-${s.id}`] = foto.uri
      stories.push({ ...s, ordem: s.ordem ?? stories.length + 1, copy, variante: pagina.id, quadro: `foto-${s.id}`, fotoRotulo: foto.rotulo })
    }

    // Só as famílias que as variantes usadas pedem: a página inteira cabe em 16 MB.
    const usadas = new Set([...variantes.values()].flatMap((v) => Object.values(v.papeis).map((e) => e.familia)))
    const embutidas = new Set<string>()
    for (const f of projeto.CustomFont) {
      if (!usadas.has(f.fontFamily) || embutidas.has(f.fontFamily)) continue
      const [mime, formato] = FORMATO_DA_FONTE[path.extname(new URL(f.fileUrl).pathname).toLowerCase()] ?? FORMATO_DA_FONTE['.otf']
      const bytes = await baixar(f.fileUrl)
      fontesCss.push(`@font-face{font-family:"p${projectId}-${f.fontFamily}";src:url(data:${mime};base64,${bytes.toString('base64')}) format("${formato}");font-display:swap}`)
      embutidas.add(f.fontFamily)
    }
    const papeisUsados = [...variantes.values()].flatMap((v) => Object.values(v.papeis))
    for (const css of new Set(papeisUsados.map((e) => e.css).filter((c) => c.startsWith('repo-')))) {
      if (fontesDoRepositorio.has(css)) continue
      const bytes = await fs.readFile(path.resolve(process.cwd(), FONT_CONFIG.BUNDLED_MONTSERRAT_DIR, `${css.slice('repo-'.length)}.ttf`))
      fontesCss.push(`@font-face{font-family:"${css}";src:url(data:font/ttf;base64,${bytes.toString('base64')}) format("truetype");font-display:swap}`)
      fontesDoRepositorio.add(css)
    }
    const faltando = [...new Set(papeisUsados.filter((e) => e.faltando).map((e) => e.familia))]

    let logo: string | null = null
    const urlDaLogo = projeto.Logo[0]?.fileUrl
    if (urlDaLogo) {
      logo = `logo-${urlDaLogo}`
      if (!imagens[logo]) imagens[logo] = await logoDePrevia(urlDaLogo)
    } else {
      logo = [...variantes.values()].find((v) => v.logo)?.logo?.src ?? null
    }

    const extras = propostas.clientes[String(projectId)]
    clientes.push({
      projectId,
      nome: projeto.name,
      logo,
      mancha: [...variantes.values()][0].mancha,
      caixaDaManchete: CAIXA_DA_MANCHETE.get(projectId) ?? null,
      proibidas: extras.proibidas,
      ctas: extras.ctas ?? [],
      preTitulos: extras.preTitulos ?? [],
      variantes: [...variantes.values()],
    })
    console.log(`· ${projeto.name}: ${variantes.size} variante(s), ${embutidas.size} fonte(s)${faltando.length ? ` · FONTE NÃO CADASTRADA: ${faltando.join(', ')}` : ''}`)
  }

  const dados = { pagina: propostas.pagina, clientes, campanhas: propostas.campanhas ?? [], stories, quadros: imagens }
  const titulo = propostas.pagina.titulo.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  let html = await fs.readFile(MODELO, 'utf8')
  for (const [marca, valor] of [
    ['__TITULO__', titulo],
    ['__FONTES__', fontesCss.join('\n')],
    ['__DADOS__', JSON.stringify(dados).replace(/</g, '\\u003c')],
  ] as const) {
    if (!html.includes(marca)) throw new Error(`o modelo perdeu a marca ${marca}`)
    html = html.replace(marca, () => valor) // função: um "$" da copy (R$) não vira padrão de substituição
  }
  const bytes = Buffer.byteLength(html)
  if (bytes > TETO) throw new Error(`a página ficou com ${(bytes / 1048576).toFixed(1)} MB, acima do teto de 16 MB do artifact. Divida em uma página por cliente.`)
  await fs.writeFile(saida, html)
  console.log(`${saida} · ${Math.round(bytes / 1024)} KB · ${clientes.length} cliente(s) · ${stories.length} stories`)
}

main()
  .then(() => db.$disconnect().then(() => process.exit(0)))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    db.$disconnect().finally(() => process.exit(1))
  })
