/**
 * Prancha tipográfica — o alfabeto COMPLETO de cada fonte oficial do projeto,
 * desenhado com os arquivos reais (CustomFont) e enviado como referência
 * (`role: 'type-specimen'`) na trilha `arte`.
 *
 * Por que existe: o modelo de imagem DESENHA as letras e nunca recebe os
 * arquivos de fonte — a única fonte de letra que ele vê é IMAGEM, e o card/
 * manual mostra uma linha curta por fonte (~12 glifos, quase tudo minúscula).
 * Todo glifo que ele nunca viu é inventado de novo a cada rodada; foi assim
 * que duas artes do Quintal saíram em 11/08/2026 com duas "Domani" diferentes.
 * A prancha mostra caixa alta, caixa baixa, acentos e números de cada família.
 * Caixa alta entra INCLUSIVE nas fontes que nunca são compostas em caps
 * (decisão do Ciro, 11/08/2026): a inicial maiúscula aparece em qualquer
 * Title Case, e sem a linha de caps o modelo inventa justamente a letra mais
 * visível da headline.
 *
 * REGRA DURA: só entra na prancha família presente no GlobalFonts depois de
 * `registerProjectFonts`. Família em fallback desenharia outra letra (ou nada,
 * na Vercel) e a prancha ensinaria o formato ERRADO com selo de oficial —
 * pior que não enviar prancha nenhuma. Projeto sem fonte registrada devolve
 * null e a geração segue como antes.
 */

import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import type { BrandContext } from '@/lib/brand/brand-context'
import { db } from '@/lib/db'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'

const LARGURA = 1080
const MARGEM = 48
/** Famílias demais espremem o corpo dos glifos — e é o corpo que ensina. */
const MAX_FAMILIAS = 4
const CACHE_DIR = '/tmp/studio-lagosta-type-specimen'
/** Versão do desenho — mudou o layout ou a escolha de famílias, invalida o cache. */
const VERSAO = 2

const LINHAS_DE_AMOSTRA = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  'ÁÂÃÉÊÍÓÔÕÚÇ áâãéêíóôõúç',
  '0123456789 !?&,.–-()',
] as const

interface FamiliaNaPrancha {
  familia: string
  papel: string | null
}

/**
 * Esqueleto da família: o nome sem os sufixos de peso/estilo. "Acumin Pro
 * Book", "Acumin Pro Thin" → "acumin pro"; "Metrisch BoldItalic" → "metrisch".
 * É o que agrupa pesos irmãos — eles compartilham o desenho da letra, e a vaga
 * na prancha vale mais para um esqueleto que o modelo ainda não viu.
 */
function baseDaFamilia(familia: string): string {
  const SUFIXO =
    /^(thin|extralight|light|book|regular|medium|semibold|bold|extrabold|black|heavy|italic|oblique)+$/i
  const tokens = familia.trim().split(/\s+/)
  while (tokens.length > 1 && SUFIXO.test(tokens[tokens.length - 1])) tokens.pop()
  return tokens.join(' ').toLowerCase()
}

/**
 * Papel de cada família da lista, atribuído no máximo UMA vez — sem isso, a
 * base compartilhada faria "Acumin Pro Thin" e "Acumin Pro Semibold" saírem
 * as duas rotuladas de corpo. Match exato primeiro, esqueleto depois.
 */
function atribuirPapeis(brand: BrandContext, familias: string[]): Map<string, string> {
  const porPapel: Array<[string, string | null]> = [
    ['título', brand.fonts.title],
    ['subtítulo', brand.fonts.subtitle],
    ['corpo', brand.fonts.body],
  ]
  const mapa = new Map<string, string>()
  for (const [papel, desejada] of porPapel) {
    if (!desejada) continue
    const exata = familias.find(
      (f) => !mapa.has(f) && f.toLowerCase() === desejada.toLowerCase(),
    )
    const alvo =
      exata ?? familias.find((f) => !mapa.has(f) && baseDaFamilia(f) === baseDaFamilia(desejada))
    if (alvo) mapa.set(alvo, papel)
  }
  return mapa
}

/**
 * Papéis primeiro (título, subtítulo, corpo), depois UM representante de cada
 * esqueleto ainda não mostrado, e só então pesos extras — era o preenchimento
 * alfabético cru que deixava a Mortella do By Rock fora da prancha enquanto
 * quatro pesos de Metrisch entravam.
 */
function escolherFamilias(brand: BrandContext, candidatas: string[]): FamiliaNaPrancha[] {
  const escolhidas: FamiliaNaPrancha[] = []
  const usadas = new Set<string>()
  const basesUsadas = new Set<string>()
  const add = (familia: string, papel: string | null) => {
    if (escolhidas.length >= MAX_FAMILIAS || usadas.has(familia.toLowerCase())) return
    usadas.add(familia.toLowerCase())
    basesUsadas.add(baseDaFamilia(familia))
    escolhidas.push({ familia, papel })
  }

  const porPapel: Array<[string, string | null]> = [
    ['título', brand.fonts.title],
    ['subtítulo', brand.fonts.subtitle],
    ['corpo', brand.fonts.body],
  ]
  for (const [papel, desejada] of porPapel) {
    if (!desejada) continue
    // Cadastro de papel sem o sufixo do peso ("Acumin Pro" × arquivo "Acumin
    // Pro Book") casa pelo esqueleto, para o rótulo do papel não se perder.
    const exata = candidatas.find((c) => c.toLowerCase() === desejada.toLowerCase())
    const escolhida =
      exata ?? candidatas.find((c) => baseDaFamilia(c) === baseDaFamilia(desejada))
    if (escolhida) add(escolhida, papel)
  }
  for (const c of candidatas) {
    if (!basesUsadas.has(baseDaFamilia(c))) add(c, null)
  }
  for (const c of candidatas) add(c, null)
  return escolhidas
}

/**
 * Renderiza (ou serve do cache) a prancha do projeto. Null quando nenhuma
 * família oficial está registrada com arquivo — sem letra real, não há o que
 * ensinar.
 */
export async function renderTypeSpecimen(brand: BrandContext | null): Promise<Buffer | null> {
  if (!brand) return null

  const customFonts = await db.customFont.findMany({
    where: { projectId: brand.projectId },
    select: { fontFamily: true, fileUrl: true },
    orderBy: { name: 'asc' },
  })
  if (customFonts.length === 0) return null

  const key = createHash('sha1')
    .update(
      JSON.stringify({
        v: VERSAO,
        fonts: brand.fonts,
        pinadas: brand.specimenFontFamilies,
        arquivos: customFonts.map((f) => [f.fontFamily, f.fileUrl]),
      }),
    )
    .digest('hex')
    .slice(0, 16)
  const cachePath = path.join(CACHE_DIR, `${brand.projectId}-${key}.png`)
  try {
    if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath)
  } catch {
    // cache é conveniência — falha de leitura só força re-render
  }

  await registerProjectFonts(brand.projectId)
  const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas')

  // Só famílias que o registro realmente conhece — o resto desenharia em
  // fallback e ensinaria a letra errada.
  const registradas = new Set(
    GlobalFonts.families.map((f: { family: string }) => f.family.toLowerCase()),
  )
  const candidatas = customFonts
    .map((f) => f.fontFamily)
    .filter((familia) => registradas.has(familia.toLowerCase()))
  // Curadoria explícita vence a heurística: CustomFont existir não significa
  // que a marca a usa (Bacana guarda famílias legadas que camadas antigas
  // ainda referenciam e por isso não podem ser apagadas).
  const pinadas = brand.specimenFontFamilies
    .map((p) => candidatas.find((c) => c.toLowerCase() === p.trim().toLowerCase()))
    .filter((c): c is string => Boolean(c))
  const familias: FamiliaNaPrancha[] =
    pinadas.length > 0
      ? (() => {
          const papeis = atribuirPapeis(brand, pinadas)
          return pinadas
            .slice(0, MAX_FAMILIAS)
            .map((familia) => ({ familia, papel: papeis.get(familia) ?? null }))
        })()
      : escolherFamilias(brand, candidatas)
  if (familias.length === 0) return null

  const quote = (family: string) => `"${family.replace(/"/g, '')}", sans-serif`
  const larguraUtil = LARGURA - MARGEM * 2

  // Passo 1: medir. O tamanho de cada linha é ajustado até caber na largura,
  // porque a caixa alta de uma display é muito mais larga que a baixa.
  const medidor = createCanvas(8, 8).getContext('2d')
  const blocos = familias.map((f) => {
    const linhas = LINHAS_DE_AMOSTRA.map((texto) => {
      let px = 72
      while (px > 26) {
        medidor.font = `400 ${px}px ${quote(f.familia)}`
        if (medidor.measureText(texto).width <= larguraUtil) break
        px -= 2
      }
      return { texto, px }
    })
    const altura = 40 + linhas.reduce((soma, l) => soma + Math.ceil(l.px * 1.32), 0) + 28
    return { ...f, linhas, altura }
  })

  const alturaTotal = 104 + blocos.reduce((soma, b) => soma + b.altura, 0) + MARGEM
  const canvas = createCanvas(LARGURA, alturaTotal)
  const ctx = canvas.getContext('2d')

  // Fundo escuro com glifos brancos: contraste garantido em qualquer marca —
  // a mesma escolha da faixa tipográfica do brand card.
  ctx.fillStyle = '#171512'
  ctx.fillRect(0, 0, LARGURA, alturaTotal)
  ctx.textBaseline = 'top'

  ctx.fillStyle = '#9C958A'
  ctx.font = '600 26px sans-serif'
  ctx.fillText(`ALFABETOS OFICIAIS — ${brand.projectName.toUpperCase()}`, MARGEM, 44)

  let y = 104
  for (const bloco of blocos) {
    ctx.fillStyle = '#9C958A'
    ctx.font = '500 22px sans-serif'
    const rotulo = bloco.papel ? `${bloco.familia} — ${bloco.papel}` : bloco.familia
    ctx.fillText(rotulo, MARGEM, y)
    y += 40

    ctx.fillStyle = '#FFFFFF'
    for (const linha of bloco.linhas) {
      ctx.font = `400 ${linha.px}px ${quote(bloco.familia)}`
      ctx.fillText(linha.texto, MARGEM, y)
      y += Math.ceil(linha.px * 1.32)
    }
    y += 28
  }

  const buffer = canvas.toBuffer('image/png')
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(cachePath, buffer)
  } catch {
    // idem: sem cache ainda funciona
  }
  return buffer
}
