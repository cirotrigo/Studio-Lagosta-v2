/**
 * O MANUAL DE MARCA GERADO — a imagem de referência que o gpt-image recebe
 * como `brand-card`, desenhada pelo Studio com as fontes REAIS do projeto
 * (05/09/2026).
 *
 * Por que existe: o manual do Espeto Gaúcho cadastrado à mão dizia Roadhawk,
 * Coolvetica e Montserrat enquanto as fontes do projeto (e a prancha) dizem
 * Bevan, Caveat e Barlow Condensed — duas verdades para a mesma marca, e o
 * gerador lia a errada. E o card automático antigo (`brand-reference-card.ts`)
 * mostra logo, paleta e três amostras de fonte, mas nada dos SEPARADORES,
 * ÍCONES e ORNAMENTOS que fazem uma peça parecer da marca — que é justamente o
 * que o Ciro pediu para o modelo poder "fazer artes mais criativas".
 *
 * O manual junta três fontes de verdade, todas do banco:
 *  - `BrandContext`: logo oficial, paleta, fontes por papel;
 *  - `BrandDNA.estiloDasReferencias`: o estilo lido das peças aprovadas
 *    (`analise-de-referencias.ts`) — decide quais separadores e ícones
 *    desenhar e o texto de "como a marca usa";
 *  - `Element`: os assets gráficos que a equipe subiu na aba Assets (ícones,
 *    selos, ornamentos) — entram como IMAGEM, na versão oficial.
 *
 * 1080x1920, para o gpt-image receber no mesmo formato da peça de story.
 */

import type { BrandContext } from '@/lib/brand/brand-context'
import {
  nomeDoIcone,
  nomeDoSeparador,
  type EstiloDasReferencias,
  type Icone,
  type Separador,
} from '@/lib/brand/estilo-das-referencias'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'

export const MANUAL_W = 1080
export const MANUAL_H = 1920

export interface ElementoDoManual {
  name: string
  fileUrl: string
  /** `Element.category` — `icones` e `graficos` são desenhados em grupos próprios. */
  categoria?: string | null
}

export interface ManualDeMarcaArgs {
  brand: BrandContext
  estilo: EstiloDasReferencias | null
  /** Até 8 elementos da aba Assets. */
  elementos: ElementoDoManual[]
}

type Ctx = import('@napi-rs/canvas').SKRSContext2D

const quote = (family: string) => `"${family.replace(/"/g, '')}", sans-serif`

function hexLuminancia(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return 128
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A cor de destaque: a primeira do estilo, senão a mais saturada da paleta, senão preto. */
function corDeDestaque(brand: BrandContext, estilo: EstiloDasReferencias | null): string {
  // A primeira cor lida costuma ser o BRANCO do texto principal — não serve
  // de destaque sobre o fundo claro do manual. Vale a primeira cor viva.
  const viva = (hex: string) => {
    const l = hexLuminancia(hex)
    return l > 40 && l < 200
  }
  const doEstilo = estilo?.coresDeDestaque.find((c) => /^#[0-9a-f]{6}$/i.test(c.hex) && viva(c.hex))?.hex
  if (doEstilo) return doEstilo
  const candidatas = brand.colors.filter((c) => {
    const l = hexLuminancia(c.hexCode)
    return l > 40 && l < 200
  })
  return candidatas[0]?.hexCode ?? brand.colors[0]?.hexCode ?? '#111111'
}

/** Fundo escuro da marca (a cor mais escura da paleta), para as amostras em branco. */
function corDeFundoEscura(brand: BrandContext): string {
  const escura = [...brand.colors].sort((a, b) => hexLuminancia(a.hexCode) - hexLuminancia(b.hexCode))[0]
  return escura && hexLuminancia(escura.hexCode) < 90 ? escura.hexCode : '#171512'
}

/** Um rótulo de UMA linha que cabe na largura; o excedente vira "…". */
function rotuloDeUmaLinha(ctx: Ctx, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto
  let t = texto
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function titulo(ctx: Ctx, texto: string, y: number, cor = '#6B6558') {
  ctx.fillStyle = cor
  ctx.font = '600 22px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(texto.toUpperCase(), 56, y)
  ctx.strokeStyle = cor
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(56 + ctx.measureText(texto.toUpperCase()).width + 16, y + 11)
  ctx.lineTo(MANUAL_W - 56, y + 11)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** Quebra texto em linhas que cabem na largura (sem hifenizar). */
function quebrar(ctx: Ctx, texto: string, largura: number): string[] {
  const palavras = texto.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p
    if (ctx.measureText(tentativa).width <= largura || !atual) atual = tentativa
    else {
      linhas.push(atual)
      atual = p
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

/* ── separadores desenhados a traço ─────────────────────────────────────── */

function desenharSeparador(ctx: Ctx, tipo: Separador, x: number, y: number, w: number, cor: string) {
  ctx.save()
  ctx.strokeStyle = cor
  ctx.fillStyle = cor
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  const cx = x + w / 2
  switch (tipo) {
    case 'filete-fino':
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
      break
    case 'filete-duplo':
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + w, y - 5); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x + w, y + 5); ctx.stroke()
      break
    case 'pontilhado':
      for (let px = x; px <= x + w; px += 14) { ctx.beginPath(); ctx.arc(px, y, 2.5, 0, Math.PI * 2); ctx.fill() }
      break
    case 'tracejado':
      ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
      break
    case 'sublinhado-manuscrito':
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(x, y + 4)
      ctx.bezierCurveTo(x + w * 0.3, y - 8, x + w * 0.6, y + 10, x + w, y - 2)
      ctx.stroke()
      break
    case 'linha-com-losango':
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx - 14, y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 14, y); ctx.lineTo(x + w, y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, y - 8); ctx.lineTo(cx + 8, y); ctx.lineTo(cx, y + 8); ctx.lineTo(cx - 8, y); ctx.closePath(); ctx.fill()
      break
    case 'linha-com-ponto':
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx - 12, y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 12, y); ctx.lineTo(x + w, y); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, y, 5, 0, Math.PI * 2); ctx.fill()
      break
    case 'barra-vertical':
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(cx, y - 22); ctx.lineTo(cx, y + 22); ctx.stroke()
      break
    case 'seta-curva':
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + 14)
      ctx.quadraticCurveTo(x + w * 0.5, y - 26, x + w * 0.8, y + 2)
      ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + w * 0.8, y + 2); ctx.lineTo(x + w * 0.72, y - 10); ctx.moveTo(x + w * 0.8, y + 2); ctx.lineTo(x + w * 0.66, y + 4); ctx.stroke()
      break
    case 'moldura-fina':
      ctx.lineWidth = 2
      ctx.strokeRect(x, y - 22, w, 44)
      break
    case 'pill':
      ctx.beginPath(); ctx.roundRect(cx - 90, y - 18, 180, 36, 18); ctx.fill()
      ctx.fillStyle = hexLuminancia(cor) > 150 ? '#111111' : '#FFFFFF'
      ctx.font = '600 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('PALAVRA', cx, y)
      break
    case 'tag-de-cor':
      ctx.beginPath(); ctx.roundRect(cx - 100, y - 20, 200, 40, 6); ctx.fill()
      ctx.fillStyle = hexLuminancia(cor) > 150 ? '#111111' : '#FFFFFF'
      ctx.font = '700 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('CHAMADA', cx, y)
      break
  }
  ctx.restore()
}

/* ── ícones a traço (fallback quando a marca não subiu o asset) ──────────── */

function desenharIcone(ctx: Ctx, tipo: Icone, cx: number, cy: number, r: number, cor: string) {
  ctx.save()
  ctx.strokeStyle = cor
  ctx.fillStyle = cor
  ctx.lineWidth = Math.max(3, r * 0.14)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  switch (tipo) {
    case 'relogio':
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.55); ctx.lineTo(cx, cy); ctx.lineTo(cx + r * 0.4, cy + r * 0.25); ctx.stroke()
      break
    case 'calendario':
      ctx.beginPath(); ctx.roundRect(cx - r, cy - r * 0.8, 2 * r, 1.7 * r, r * 0.15); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx - r, cy - r * 0.3); ctx.lineTo(cx + r, cy - r * 0.3); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy - r * 1.05); ctx.lineTo(cx - r * 0.5, cy - r * 0.55); ctx.moveTo(cx + r * 0.5, cy - r * 1.05); ctx.lineTo(cx + r * 0.5, cy - r * 0.55); ctx.stroke()
      break
    case 'pin-de-mapa':
      ctx.beginPath(); ctx.moveTo(cx, cy + r)
      ctx.bezierCurveTo(cx - r * 1.1, cy - r * 0.1, cx - r * 0.7, cy - r, cx, cy - r)
      ctx.bezierCurveTo(cx + r * 0.7, cy - r, cx + r * 1.1, cy - r * 0.1, cx, cy + r)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(cx, cy - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill()
      break
    case 'telefone':
      ctx.beginPath(); ctx.roundRect(cx - r * 0.5, cy - r, r, 2 * r, r * 0.2); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy + r * 0.7, r * 0.08, 0, Math.PI * 2); ctx.fill()
      break
    case 'garfo-e-faca':
      ctx.beginPath(); ctx.moveTo(cx - r * 0.4, cy - r); ctx.lineTo(cx - r * 0.4, cy + r); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx - r * 0.7, cy - r); ctx.lineTo(cx - r * 0.7, cy - r * 0.3); ctx.moveTo(cx - r * 0.1, cy - r); ctx.lineTo(cx - r * 0.1, cy - r * 0.3); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy + r); ctx.lineTo(cx + r * 0.5, cy - r); ctx.quadraticCurveTo(cx + r * 0.95, cy - r * 0.5, cx + r * 0.5, cy); ctx.stroke()
      break
    case 'taca':
      ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r); ctx.lineTo(cx + r * 0.6, cy - r); ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.1, cx, cy + r * 0.15); ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.1, cx - r * 0.6, cy - r); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.15); ctx.lineTo(cx, cy + r); ctx.moveTo(cx - r * 0.4, cy + r); ctx.lineTo(cx + r * 0.4, cy + r); ctx.stroke()
      break
    case 'caneca':
      ctx.beginPath(); ctx.roundRect(cx - r * 0.8, cy - r * 0.8, r * 1.3, r * 1.7, r * 0.1); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx + r * 0.6, cy + r * 0.05, r * 0.4, -Math.PI / 2, Math.PI / 2); ctx.stroke()
      break
    case 'chama':
      ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.bezierCurveTo(cx - r * 1.1, cy + r * 0.2, cx - r * 0.2, cy - r * 0.3, cx, cy - r)
      ctx.bezierCurveTo(cx + r * 0.2, cy - r * 0.3, cx + r * 1.1, cy + r * 0.2, cx, cy + r); ctx.fill()
      break
    case 'espeto':
      ctx.beginPath(); ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy - r); ctx.stroke()
      for (const t of [0.25, 0.5, 0.75]) { const px = cx - r + 2 * r * t; const py = cy + r - 2 * r * t; ctx.beginPath(); ctx.arc(px, py, r * 0.22, 0, Math.PI * 2); ctx.fill() }
      break
    case 'pessoas':
      for (const dx of [-r * 0.55, r * 0.55]) { ctx.beginPath(); ctx.arc(cx + dx, cy - r * 0.45, r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + dx, cy + r * 0.55, r * 0.55, Math.PI, 0); ctx.fill() }
      break
    case 'mao':
      ctx.beginPath(); ctx.roundRect(cx - r * 0.6, cy - r * 0.2, r * 1.2, r * 1.1, r * 0.25); ctx.fill()
      ctx.beginPath(); ctx.roundRect(cx - r * 0.75, cy - r, r * 0.3, r * 1.2, r * 0.15); ctx.fill()
      ctx.beginPath(); ctx.roundRect(cx + r * 0.45, cy - r * 0.95, r * 0.3, r * 1.1, r * 0.15); ctx.fill()
      break
    case 'estrela':
      ctx.beginPath()
      for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 === 0 ? r : r * 0.45; ctx.lineTo(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)) }
      ctx.closePath(); ctx.fill()
      break
    case 'coracao':
      ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.9)
      ctx.bezierCurveTo(cx - r * 1.4, cy - r * 0.2, cx - r * 0.5, cy - r * 1.1, cx, cy - r * 0.4)
      ctx.bezierCurveTo(cx + r * 0.5, cy - r * 1.1, cx + r * 1.4, cy - r * 0.2, cx, cy + r * 0.9); ctx.fill()
      break
    case 'seta':
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx + r * 0.4, cy - r * 0.6); ctx.lineTo(cx + r, cy); ctx.lineTo(cx + r * 0.4, cy + r * 0.6); ctx.stroke()
      break
    case 'folha':
      ctx.beginPath(); ctx.moveTo(cx - r, cy + r); ctx.quadraticCurveTo(cx - r, cy - r, cx + r, cy - r); ctx.quadraticCurveTo(cx + r, cy + r, cx - r, cy + r); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r * 0.6, cy - r * 0.6); ctx.stroke()
      break
    case 'sol':
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke()
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke() }
      break
    case 'nenhum':
      break
  }
  ctx.restore()
}

/** Separadores a mostrar: os do estilo, senão um trio neutro. */
function separadoresDoManual(estilo: EstiloDasReferencias | null): Separador[] {
  const lidos = estilo?.separadores ?? []
  return lidos.length > 0 ? lidos.slice(0, 6) : ['filete-fino', 'linha-com-ponto', 'pontilhado']
}

function iconesDoManual(estilo: EstiloDasReferencias | null): Icone[] {
  return (estilo?.icones ?? []).filter((i) => i !== 'nenhum').slice(0, 8)
}

/**
 * Renderiza o manual. Fontes reais registradas ANTES do canvas; família que
 * não registrou desenha em fallback declarado (na Vercel, família ausente
 * desenha NADA).
 */
export async function renderManualDeMarca({ brand, estilo, elementos }: ManualDeMarcaArgs): Promise<Buffer> {
  await registerProjectFonts(brand.projectId)
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const canvas = createCanvas(MANUAL_W, MANUAL_H)
  const ctx = canvas.getContext('2d') as unknown as Ctx

  const destaque = corDeDestaque(brand, estilo)
  const escura = corDeFundoEscura(brand)

  // Fundo claro no alto (logo, paleta, tipografia), escuro embaixo
  // (separadores, ícones e "como a marca usa" em branco).
  ctx.fillStyle = '#F7F4EE'
  ctx.fillRect(0, 0, MANUAL_W, MANUAL_H)

  // Cabeçalho
  ctx.fillStyle = '#6B6558'
  ctx.font = '600 24px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(`MANUAL DE IDENTIDADE — ${brand.projectName.toUpperCase()}`, 56, 40)
  ctx.font = '400 16px sans-serif'
  ctx.fillStyle = '#9C958A'
  ctx.fillText('gerado pelo Studio a partir das fontes cadastradas e das peças aprovadas', 56, 72)

  // Logo
  let y = 120
  if (brand.logoUrl) {
    try {
      const { buffer } = await fetchImageSource(brand.logoUrl)
      const img = await loadImage(buffer)
      const maxW = 400
      const maxH = 170
      const s = Math.min(maxW / img.width, maxH / img.height, 1)
      const w = img.width * s
      const h = img.height * s
      // Logo com traço branco some no claro (o selo do Espeto tem o arco de
      // texto em branco e o boi em vermelho — a MÉDIA não denuncia): caixa da
      // cor escura da marca atrás dela quando 1/4 dos pixels opacos são claros.
      const { claros, escuros } = await fracoesDeLuminancia(buffer).catch(() => ({ claros: 0, escuros: 0 }))
      if (claros > 0.08 && escuros < 0.5) {
        ctx.fillStyle = escura
        ctx.beginPath(); ctx.roundRect((MANUAL_W - w) / 2 - 36, y - 20, w + 72, h + 40, 18); ctx.fill()
      }
      ctx.drawImage(img, (MANUAL_W - w) / 2, y + (maxH - h) / 2, w, h)
    } catch (erro) {
      console.warn('[manual-de-marca] logo não carregou:', erro)
    }
  }
  y = 318

  // Paleta
  titulo(ctx, 'Paleta', y)
  y += 44
  const colors = brand.colors.slice(0, 6)
  if (colors.length) {
    const sw = 120
    const gap = 24
    const total = colors.length * sw + (colors.length - 1) * gap
    let x = (MANUAL_W - total) / 2
    for (const c of colors) {
      ctx.fillStyle = c.hexCode
      ctx.beginPath(); ctx.roundRect(x, y, sw, 72, 14); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = '#3A362F'; ctx.font = '500 16px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name, x + sw / 2, y + 80)
      ctx.fillStyle = '#8A8475'; ctx.font = '400 14px monospace'
      ctx.fillText(c.hexCode.toUpperCase(), x + sw / 2, y + 100)
      ctx.textAlign = 'left'
      x += sw + gap
    }
  }
  y += 140

  // Tipografia por papel, com as fontes REAIS
  titulo(ctx, 'Tipografia (fontes reais do projeto)', y)
  y += 48
  const caixaAlta = estilo?.caixaDaManchete === 'alta'
  if (brand.fonts.title) {
    ctx.fillStyle = '#171512'
    ctx.font = `700 70px ${quote(brand.fonts.title)}`
    ctx.fillText(caixaAlta ? 'MANCHETE DA PEÇA' : 'Manchete da peça', 56, y)
    ctx.fillStyle = destaque
    ctx.fillText(caixaAlta ? 'EM DUAS VOZES' : 'em duas vozes', 56, y + 74)
    ctx.fillStyle = '#8A8475'; ctx.font = '400 16px sans-serif'
    ctx.fillText(rotuloDeUmaLinha(ctx, `${brand.fonts.title} — manchete${estilo ? ` · ${estilo.tipografia.manchete}` : ''}`, MANUAL_W - 112), 56, y + 178)
    y += 208
  }
  const sub = brand.fonts.subtitle ?? brand.fonts.body
  if (sub) {
    ctx.fillStyle = destaque
    ctx.font = `500 46px ${quote(sub)}`
    ctx.fillText('Destaque ou apoio da peça', 56, y)
    ctx.fillStyle = '#8A8475'; ctx.font = '400 16px sans-serif'
    ctx.fillText(rotuloDeUmaLinha(ctx, `${sub} — apoio/destaque${estilo ? ` · ${estilo.tipografia.destaque}` : ''}`, MANUAL_W - 112), 56, y + 56)
    y += 92
  }
  if (brand.fonts.body) {
    ctx.fillStyle = '#171512'
    ctx.font = `400 30px ${quote(brand.fonts.body)}`
    ctx.fillText('SEG A SEX, DAS 11H30 ÀS 15H · RUA EXEMPLO, 123 - BAIRRO', 56, y)
    ctx.fillStyle = '#8A8475'; ctx.font = '400 16px sans-serif'
    ctx.fillText(rotuloDeUmaLinha(ctx, `${brand.fonts.body} — serviço: horário, endereço, CTA${estilo ? ` · ${estilo.tipografia.servico}` : ''}`, MANUAL_W - 112), 56, y + 40)
    y += 84
  }

  // Faixa escura: separadores, ícones/elementos, como a marca usa
  const topoEscuro = y + 12
  ctx.fillStyle = escura
  ctx.fillRect(0, topoEscuro, MANUAL_W, MANUAL_H - topoEscuro)
  y = topoEscuro + 36

  titulo(ctx, 'Separadores', y, '#CFC8BC')
  y += 56
  const seps = separadoresDoManual(estilo)
  const colunas = 3
  const colW = (MANUAL_W - 112 - 24 * (colunas - 1)) / colunas
  seps.forEach((s, i) => {
    const col = i % colunas
    const row = Math.floor(i / colunas)
    const x = 56 + col * (colW + 24)
    const yy = y + row * 78
    desenharSeparador(ctx, s, x + 16, yy + 20, colW - 32, destaque)
    ctx.fillStyle = '#CFC8BC'; ctx.font = '400 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(rotuloDeUmaLinha(ctx, nomeDoSeparador(s), colW - 32), x + 16, yy + 50)
  })
  y += Math.ceil(seps.length / colunas) * 78 + 12

  // Ícones e gráficos: os ASSETS da aba Assets em primeiro lugar (são a
  // versão oficial); a traço só quando a marca não subiu nenhum.
  const iconesOficiais = elementos.filter((e) => (e.categoria ?? '').toLowerCase() === 'icones').slice(0, 8)
  const graficosOficiais = elementos.filter((e) => (e.categoria ?? '').toLowerCase() !== 'icones').slice(0, 8)
  const desenharElementos = async (lista: ElementoDoManual[], porLinha: number, slotH: number) => {
    const slotW = (MANUAL_W - 112) / porLinha
    let desenhados = 0
    for (const el of lista) {
      try {
        const { buffer } = await fetchImageSource(el.fileUrl)
        // Asset exportado numa prancha grande (filete de 2px num PNG de 1080)
        // vira nada no slot: recorta a borda transparente antes de escalar.
        const aparado = await aparar(buffer)
        const img = await loadImage(aparado)
        const s = Math.min((slotW - 24) / img.width, (slotH - 24) / img.height)
        const w = img.width * s
        // Filete de 1px reduzido some no slot: um traço fino continua fino,
        // mas visível.
        const h = Math.max(img.height * s, 3)
        const x = 56 + (desenhados % porLinha) * slotW
        const yy = y + Math.floor(desenhados / porLinha) * (slotH + 30)
        ctx.drawImage(img, x + (slotW - w) / 2, yy + (slotH - 24 - h) / 2, w, h)
        ctx.fillStyle = '#9C958A'; ctx.font = '400 12px sans-serif'; ctx.textAlign = 'center'
        const rotulo = el.name.replace(/\.(png|jpe?g|webp|svg)$/i, '')
        ctx.fillText(rotulo.length > 18 ? `${rotulo.slice(0, 17)}…` : rotulo, x + slotW / 2, yy + slotH - 14)
        ctx.textAlign = 'left'
        desenhados++
      } catch (erro) {
        console.warn(`[manual-de-marca] elemento "${el.name}" não carregou:`, erro instanceof Error ? erro.message : erro)
      }
    }
    if (desenhados > 0) y += Math.ceil(desenhados / porLinha) * (slotH + 30) + 8
    return desenhados
  }
  let iconesDesenhados = 0
  if (iconesOficiais.length) {
    titulo(ctx, 'Ícones oficiais (arquivos da marca — use estes, nesta forma)', y, '#CFC8BC')
    y += 56
    iconesDesenhados = await desenharElementos(iconesOficiais, 8, 104)
  }
  if (graficosOficiais.length) {
    titulo(ctx, 'Elementos gráficos oficiais (separadores, barras, símbolo)', y, '#CFC8BC')
    y += 56
    await desenharElementos(graficosOficiais.slice(0, 5), 5, 76)
  }
  const icones = iconesDoManual(estilo)
  if (icones.length && iconesDesenhados === 0) {
    const perRow = 8
    titulo(ctx, 'Ícones que a marca usa (a traço, na cor de destaque)', y, '#CFC8BC')
    y += 56
    icones.forEach((ic, i) => {
      const cx = 56 + (i % perRow) * ((MANUAL_W - 112) / perRow) + (MANUAL_W - 112) / perRow / 2
      const cy = y + 38
      desenharIcone(ctx, ic, cx, cy, 26, destaque)
      ctx.fillStyle = '#9C958A'; ctx.font = '400 12px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(nomeDoIcone(ic), cx, cy + 46)
      ctx.textAlign = 'left'
    })
    y += 110
  }

  // Como a marca usa — o resumo lido das peças aprovadas
  if (estilo) {
    titulo(ctx, 'Como a marca usa (lido nas peças aprovadas)', y, '#CFC8BC')
    y += 48
    ctx.fillStyle = '#F2EEE6'
    ctx.font = '400 19px sans-serif'
    const largura = MANUAL_W - 112
    const paragrafos = [
      estilo.resumo,
      `Diagramação: ${estilo.diagramacao}`,
      `Foto: ${estilo.tratamentoDaFoto}`,
      `Logo: ${estilo.logo}`,
      estilo.evitar.length ? `Nunca: ${estilo.evitar.join('; ')}.` : '',
    ].filter(Boolean)
    for (const p of paragrafos) {
      const linhas = quebrar(ctx, p, largura)
      const visiveis = linhas.slice(0, 3)
      if (linhas.length > 3) visiveis[2] = rotuloDeUmaLinha(ctx, `${visiveis[2]} ${linhas.slice(3).join(' ')}`, largura)
      for (const linha of visiveis) {
        if (y > MANUAL_H - 50) break
        ctx.fillText(linha, 56, y)
        y += 26
      }
      y += 8
      if (y > MANUAL_H - 50) break
    }
  }

  return canvas.toBuffer('image/png')
}

/** Recorta a moldura transparente de um PNG; devolve o original se não der. */
async function aparar(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default
    return await sharp(buffer).trim({ threshold: 10 }).png().toBuffer()
  } catch {
    return buffer
  }
}

/**
 * Frações dos pixels OPACOS claros (>200) e escuros (<70) — para saber se a
 * logo tem traço branco (precisa de caixa escura atrás) e se ela mesma é
 * escura (aí a caixa a engoliria).
 */
async function fracoesDeLuminancia(buffer: Buffer): Promise<{ claros: number; escuros: number }> {
  const sharp = (await import('sharp')).default
  const s = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data, info } = s
  let claros = 0
  let escuros = 0
  let n = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3]
    if (a < 40) continue
    n++
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (l > 200) claros++
    else if (l < 70) escuros++
  }
  return n ? { claros: claros / n, escuros: escuros / n } : { claros: 0, escuros: 0 }
}
