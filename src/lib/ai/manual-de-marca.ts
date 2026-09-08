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
 * 1080 de largura; a ALTURA é a do conteúdo, recortada no fim (até 3000px, o
 * teto abaixo do qual a referência não é reduzida — MAX_REF_DIM do runner).
 *
 * REDESENHADO EM 08/09/2026 como um DESIGN SYSTEM em 16:9 (3000x1688), depois
 * de dois dias de teste direto na API (foto + manual + copy, prompt curto):
 *  - Era vertical (1080x1920) "para o gpt-image receber no formato do story".
 *    Não é razão técnica: a referência é uma imagem qualquer, e o único limite
 *    é o lado maior até 3000px antes de reduzir (MAX_REF_DIM do runner). Em
 *    16:9 cabem mais pixels e um grid de painéis.
 *  - A LOGO era desenhada sobre uma caixa escura arredondada quando tinha
 *    traço claro, e em 4 de 8 peças o modelo copiou a CAIXA junto com a marca.
 *    Agora ela mora num PAINEL inteiro cinza médio — o único fundo em que as
 *    logos brancas (Quintal, TERO, Bacana) e as pretas (Vix, By Rock) leem ao
 *    mesmo tempo (regra da casa desde 10/08) — e painel de página não é
 *    "contêiner da logo" para o modelo copiar.
 *  - Os ELEMENTOS ficavam numa faixa da cor escura DA MARCA: no By Rock a cor
 *    escura é o vermelho, os ícones são vermelhos, e nenhum leu. Cada elemento
 *    agora tem o próprio ladrilho, claro ou escuro pelo que ELE precisa
 *    (`fundoDoLadrilho`), e foto/asset de campanha ficam de fora.
 *  - A prosa de "como a marca usa" SAIU (decisão do Ciro): texto longo numa
 *    imagem é lido mal; ele vai no PROMPT por `formatarEstiloParaPrompt`.
 *  - Os ALFABETOS oficiais entraram, desenhados aqui numa grade 2x2 na
 *    largura do painel (`familiasDaPrancha`) — embutir a prancha vertical
 *    reduzida deixava a letra pequena demais.
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
import { familiasDaPrancha, LINHAS_DE_AMOSTRA } from '@/lib/ai/type-specimen'
import sharp from 'sharp'

export const MANUAL_W = 3000
export const MANUAL_H = 1688
/** Margem externa e calha entre painéis. */
const M = 72
const G = 48
const PAGINA = '#F4F1EB'
const TINTA = '#1E1B17'
const TINTA_FRACA = '#6B6558'
/** Ladrilho claro / painel escuro NEUTROS — nunca a cor da marca (By Rock). */
const CLARO = '#F7F4EE'
const ESCURO = '#1F1E1C'
/**
 * Fundo do painel da logo. Cinza médio, e não a cor escura da marca nem o creme
 * da página: metade das logos da carteira é branca (luminância 255) e a outra
 * metade é preta ou colorida — só o cinza médio serve às duas de uma vez.
 */
const CINZA_MEDIO = '#8E8B85'

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
  /**
   * Todas as logos do projeto (tabela Logo). A principal (`isProjectLogo`)
   * vai grande; as outras viram a faixa de VARIAÇÕES — versões em cor,
   * negativa, ícone isolado (as quatro bolas "Q" do Seu Quinto, os treze
   * arquivos do Quintal). Logo de PARCEIRO cadastrada na mesma tabela
   * (Lagunitas, EHR, Samba do Canto) fica fora por nome — não é identidade.
   */
  logos?: Array<{ name: string; fileUrl: string; isProjectLogo: boolean }>
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


/** Um rótulo de UMA linha que cabe na largura; o excedente vira "…". */
function rotuloDeUmaLinha(ctx: Ctx, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto
  let t = texto
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
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
/** Rótulo de painel: caixa alta pequena com um filete fino à direita. */
function rotulo(ctx: Ctx, texto: string, x: number, y: number, w: number, cor: string) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = cor
  ctx.font = '600 18px sans-serif'
  ctx.fillText(texto, x, y)
  const tw = ctx.measureText(texto).width
  ctx.strokeStyle = cor
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + tw + 16, y + 10)
  ctx.lineTo(x + w, y + 10)
  ctx.stroke()
  ctx.restore()
}

/**
 * O que um elemento É, medido nos pixels opacos: quanto do quadro ele cobre
 * (foto cobre tudo; ícone tem transparência), quão claro e quão saturado.
 */
async function estatisticaDoElemento(
  buffer: Buffer,
): Promise<{ cobertura: number; luminancia: number; saturacao: number; cores: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let n = 0
  let lum = 0
  let sat = 0
  // Cores distintas, quantizadas a 6 bits (4 níveis por canal): elemento de
  // marca é CHAPADO — uma a três cores mais o serrilhado das bordas —, foto e
  // print de campanha têm dezenas. Foi o print do ES Week no Empório que
  // passou pela cobertura (tinha borda transparente) e entrou como "elemento".
  const bins = new Set<number>()
  const total = info.width * info.height
  for (let p = 0; p < data.length; p += info.channels) {
    if (data[p + 3] < 128) continue
    const r = data[p], g = data[p + 1], b = data[p + 2]
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    sat += max === 0 ? 0 : (max - min) / max
    bins.add(((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6))
    n++
  }
  return { cobertura: total ? n / total : 0, luminancia: n ? lum / n : 0, saturacao: n ? sat / n : 0, cores: bins.size }
}

/** Foto ou print, não elemento: cobre o quadro inteiro OU tem cor demais. */
function pareceFotoOuPrint(e: { cobertura: number; cores: number }): boolean {
  return e.cobertura > 0.97 || e.cores > 14
}

/**
 * Ladrilho claro só para elemento ESCURO e sem cor (preto sobre creme);
 * qualquer outro — branco, creme, vermelho, dourado, verde — lê no escuro
 * neutro. Era a faixa da cor escura da marca que engolia os ícones vermelhos
 * do By Rock; o escuro NEUTRO não tem matiz para competir.
 */
function fundoDoLadrilho(e: { luminancia: number; saturacao: number }): string {
  return e.luminancia < 110 && e.saturacao < 0.35 ? CLARO : ESCURO
}

/** Logo cadastrada no projeto que NÃO é da marca — patrocinador, parceiro, selo de terceiro. */
const LOGO_DE_PARCEIRO = /lagunitas|ehr|samba|pega leve|copo|tripadvisor|heineken|coca/i

export async function renderManualDeMarca({ brand, estilo, elementos, logos = [] }: ManualDeMarcaArgs): Promise<Buffer> {
  await registerProjectFonts(brand.projectId)
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const canvas = createCanvas(MANUAL_W, MANUAL_H)
  const ctx = canvas.getContext('2d') as unknown as Ctx
  const destaque = corDeDestaque(brand, estilo)
  const quote = (family: string) => `"${family.replace(/"/g, '')}", sans-serif`

  ctx.fillStyle = PAGINA
  ctx.fillRect(0, 0, MANUAL_W, MANUAL_H)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  // Cabeçalho
  ctx.fillStyle = TINTA_FRACA
  ctx.font = '600 22px sans-serif'
  ctx.fillText(`DESIGN SYSTEM — ${brand.projectName.toUpperCase()}`, M, 34)
  ctx.font = '400 16px sans-serif'
  ctx.fillText('gerado pelo Studio · logotipo, paleta, tipografia e elementos oficiais do projeto', M, 64)

  // ── Linha 1: logotipo · paleta · elementos ─────────────────────────────
  const y1 = 108
  const h1 = 590
  const logoX = M
  const logoW = 900
  const palX = logoX + logoW + G
  const palW = 620
  const elX = palX + palW + G
  const elW = MANUAL_W - M - elX

  // Logotipo: o painel INTEIRO é cinza médio — região de página, não caixa.
  ctx.fillStyle = CINZA_MEDIO
  ctx.fillRect(logoX, y1, logoW, h1)
  const variacoes = (() => {
    const vistas = new Set<string>()
    return logos
      .filter((l) => {
        if (l.fileUrl === brand.logoUrl || vistas.has(l.fileUrl) || LOGO_DE_PARCEIRO.test(l.name)) return false
        vistas.add(l.fileUrl)
        return true
      })
      .slice(0, 7)
  })()
  rotulo(ctx, variacoes.length ? 'LOGOTIPO E VARIAÇÕES' : 'LOGOTIPO', logoX + 28, y1 + 24, logoW - 56, '#FFFFFF')
  const faixaVar = variacoes.length ? 168 : 0
  if (brand.logoUrl) {
    try {
      const { buffer } = await fetchImageSource(brand.logoUrl)
      const img = await loadImage(buffer)
      const maxW = logoW - 200
      const maxH = h1 - 120 - faixaVar
      const s = Math.min(maxW / img.width, maxH / img.height, 1.6)
      const w = img.width * s
      const h = img.height * s
      ctx.drawImage(img, logoX + (logoW - w) / 2, y1 + 64 + (maxH - h) / 2, w, h)
    } catch (erro) {
      console.warn('[manual-de-marca] logo não carregou:', erro)
    }
  }
  if (variacoes.length) {
    // Faixa de variações sobre o MESMO cinza, separada por um filete —
    // continua sem caixa em volta de marca nenhuma.
    const yv = y1 + h1 - faixaVar
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(logoX + 28, yv); ctx.lineTo(logoX + logoW - 28, yv); ctx.stroke()
    const slot = (logoW - 56 - 12 * (variacoes.length - 1)) / variacoes.length
    const alt = faixaVar - 44
    for (let i = 0; i < variacoes.length; i++) {
      try {
        const { buffer } = await fetchImageSource(variacoes[i].fileUrl)
        const img = await loadImage(await aparar(buffer))
        const sc = Math.min((slot - 16) / img.width, (alt - 16) / img.height)
        const w = img.width * sc
        const h = img.height * sc
        const x = logoX + 28 + i * (slot + 12)
        ctx.drawImage(img, x + (slot - w) / 2, yv + 14 + (alt - h) / 2, w, h)
        ctx.fillStyle = '#EDEAE4'; ctx.font = '400 11px sans-serif'; ctx.textAlign = 'center'
        const nome = variacoes[i].name.replace(/\.(png|jpe?g|webp|svg)$/i, '')
        ctx.fillText(nome.length > 18 ? `${nome.slice(0, 17)}…` : nome, x + slot / 2, yv + faixaVar - 24)
        ctx.textAlign = 'left'
      } catch (erro) {
        console.warn(`[manual-de-marca] variação "${variacoes[i].name}" não carregou:`, erro instanceof Error ? erro.message : erro)
      }
    }
  }

  // Paleta: 2 colunas, nome e hex embaixo
  rotulo(ctx, 'PALETA', palX, y1 + 24, palW, TINTA_FRACA)
  {
    const cores = brand.colors.slice(0, 6)
    const sw = (palW - 24) / 2
    const sh = 104
    cores.forEach((c, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = palX + col * (sw + 24)
      const y = y1 + 68 + row * (sh + 66)
      ctx.fillStyle = c.hexCode
      ctx.beginPath(); ctx.roundRect(x, y, sw, sh, 12); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = TINTA; ctx.font = '500 17px sans-serif'
      ctx.fillText(rotuloDeUmaLinha(ctx, c.name, sw), x, y + sh + 10)
      ctx.fillStyle = TINTA_FRACA; ctx.font = '400 15px monospace'
      ctx.fillText(c.hexCode.toUpperCase(), x, y + sh + 34)
    })
  }

  // Elementos: um ladrilho por elemento, fundo pelo contraste DELE.
  rotulo(ctx, 'ÍCONES E ELEMENTOS OFICIAIS', elX, y1 + 24, elW, TINTA_FRACA)
  {
    const tile = 120
    const gap = 12
    const porLinha = Math.floor((elW + gap) / (tile + gap))
    const LINHAS = 3
    // Fluxo com quebra: ícone ocupa um quadrado; elemento GRÁFICO (filete,
    // onda, barra) ocupa dois de largura — as ondas do By Rock são finas e
    // compridas, e num quadrado viravam um risco invisível.
    let cx = 0
    let linha = 0
    let desenhados = 0
    for (const el of elementos) {
      if (linha >= LINHAS) break
      try {
        const { buffer } = await fetchImageSource(el.fileUrl)
        const bruto = await estatisticaDoElemento(buffer)
        if (pareceFotoOuPrint(bruto)) continue
        const aparado = await aparar(buffer)
        const img = await loadImage(aparado)
        const largo = (el.categoria ?? '').toLowerCase() !== 'icones' && img.width > img.height * 1.6
        const w0 = largo ? tile * 2 + gap : tile
        if (cx + w0 > porLinha * (tile + gap) - gap) { cx = 0; linha++; if (linha >= LINHAS) break }
        const x = elX + cx
        const y = y1 + 68 + linha * (tile + gap + 30)
        ctx.fillStyle = fundoDoLadrilho(bruto)
        ctx.beginPath(); ctx.roundRect(x, y, w0, tile, 10); ctx.fill()
        const s = Math.min((w0 - 32) / img.width, (tile - 32) / img.height)
        const w = img.width * s
        const h = Math.max(img.height * s, 3)
        ctx.drawImage(img, x + (w0 - w) / 2, y + (tile - h) / 2, w, h)
        ctx.fillStyle = TINTA_FRACA; ctx.font = '400 12px sans-serif'; ctx.textAlign = 'center'
        const nome = el.name.replace(/\.(png|jpe?g|webp|svg)$/i, '')
        ctx.fillText(nome.length > (largo ? 40 : 20) ? `${nome.slice(0, largo ? 39 : 19)}…` : nome, x + w0 / 2, y + tile + 8)
        ctx.textAlign = 'left'
        cx += w0 + gap
        desenhados++
      } catch (erro) {
        console.warn(`[manual-de-marca] elemento "${el.name}" não carregou:`, erro instanceof Error ? erro.message : erro)
      }
    }
    // Sem arquivo oficial nenhum: os ícones a traço que a leitura das peças
    // encontrou, na cor de destaque, em ladrilho escuro.
    if (desenhados === 0) {
      const icones = iconesDoManual(estilo)
      icones.forEach((ic, i) => {
        const x = elX + (i % porLinha) * (tile + gap)
        const y = y1 + 68 + Math.floor(i / porLinha) * (tile + gap + 30)
        ctx.fillStyle = ESCURO
        ctx.beginPath(); ctx.roundRect(x, y, tile, tile, 10); ctx.fill()
        desenharIcone(ctx, ic, x + tile / 2, y + tile / 2, 34, destaque)
        ctx.fillStyle = TINTA_FRACA; ctx.font = '400 12px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(nomeDoIcone(ic), x + tile / 2, y + tile + 8)
        ctx.textAlign = 'left'
      })
      if (icones.length === 0) {
        ctx.fillStyle = TINTA_FRACA; ctx.font = '400 16px sans-serif'
        ctx.fillText('Este projeto não tem elementos gráficos cadastrados.', elX, y1 + 72)
      }
    }
  }

  // ── Linha 2: tipografia · alfabetos ────────────────────────────────────
  const y2 = y1 + h1 + G
  const h2 = MANUAL_H - M - y2
  const tipX = M
  const tipW = 1330
  const alfX = tipX + tipW + G
  const alfW = MANUAL_W - M - alfX

  // Tipografia por papel, com as fontes REAIS
  rotulo(ctx, 'TIPOGRAFIA', tipX, y2, tipW, TINTA_FRACA)
  {
    let y = y2 + 60
    const caixaAlta = estilo?.caixaDaManchete === 'alta'
    if (brand.fonts.title) {
      // SEM peso na fonte: o nome da família já carrega o peso do arquivo
      // ("PlayfairDisplay BoldItalic", "Metrisch ExtraBold") e pedir 700 a
      // uma família de um peso só (Amithen, Caveat) engrossa e borra o traço
      // — o Ciro viu a Amithen do Quintal "sem definição, como se tivesse
      // negrito aplicado" (08/09/2026). Os alfabetos, em 400, saem limpos.
      //
      // DUAS VOZES são duas FONTES quando a marca tem fonte de subtítulo: a
      // linha 1 na de título e a 2 na de subtítulo (Amithen → DomaniCP no
      // Quintal), que é como as peças aprovadas intercalam.
      const fonteLinha1 = brand.fonts.title
      const fonteLinha2 = brand.fonts.subtitle ?? brand.fonts.title
      const linha1 = caixaAlta ? 'MANCHETE DA PEÇA' : 'Manchete da peça'
      const linha2 = caixaAlta ? 'EM DUAS VOZES' : 'em duas vozes'
      const segunda = brand.colors.map((c) => c.hexCode).find((h) => h.toLowerCase() !== destaque.toLowerCase() && hexLuminancia(h) < 200) ?? TINTA
      const efeito = estilo?.efeitoDaManchete ?? 'nenhum'
      const desenharManchete = (texto: string, cor: string, sombra: string, yy: number) => {
        ctx.save()
        if (efeito === 'sombra-dura') {
          ctx.fillStyle = sombra
          ctx.fillText(texto, tipX + 8, yy + 8)
        } else if (efeito === 'sombra-suave') {
          ctx.shadowColor = 'rgba(0,0,0,0.45)'
          ctx.shadowBlur = 14
          ctx.shadowOffsetY = 4
        } else if (efeito === 'contorno') {
          ctx.lineWidth = 6
          ctx.lineJoin = 'round'
          ctx.strokeStyle = sombra
          ctx.strokeText(texto, tipX, yy)
        }
        ctx.fillStyle = cor
        ctx.fillText(texto, tipX, yy)
        ctx.restore()
      }
      ctx.font = `92px ${quote(fonteLinha1)}`
      desenharManchete(linha1, efeito === 'nenhum' ? TINTA : destaque, segunda, y)
      ctx.font = `92px ${quote(fonteLinha2)}`
      desenharManchete(linha2, efeito === 'nenhum' ? destaque : segunda, destaque, y + 100)
      ctx.fillStyle = TINTA_FRACA; ctx.font = '400 16px sans-serif'
      const vozes = fonteLinha2 !== fonteLinha1 ? `${fonteLinha1} + ${fonteLinha2}` : fonteLinha1
      ctx.fillText(rotuloDeUmaLinha(ctx, `${vozes} — manchete${estilo ? ` · ${estilo.tipografia.manchete}` : ''}`, tipW), tipX, y + 214)
      y += 250
    }
    const sub = brand.fonts.subtitle ?? brand.fonts.body
    if (sub) {
      ctx.fillStyle = destaque
      ctx.font = `56px ${quote(sub)}`
      ctx.fillText('Destaque ou apoio da peça', tipX, y)
      ctx.fillStyle = TINTA_FRACA; ctx.font = '400 16px sans-serif'
      ctx.fillText(rotuloDeUmaLinha(ctx, `${sub} — apoio/destaque${estilo ? ` · ${estilo.tipografia.apoio}` : ''}`, tipW), tipX, y + 72)
      y += 108
    }
    if (brand.fonts.body) {
      ctx.fillStyle = TINTA
      ctx.font = `40px ${quote(brand.fonts.body)}`
      // Amostra sem cara de DADO: a linha antiga era "SEG A SEX, DAS 11H30 ÀS
      // 15H · RUA EXEMPLO, 123", que é exatamente o que um modelo copia.
      ctx.fillText('DIA DA SEMANA · HORÁRIO · ENDEREÇO', tipX, y)
      ctx.fillStyle = TINTA_FRACA; ctx.font = '400 16px sans-serif'
      ctx.fillText(rotuloDeUmaLinha(ctx, `${brand.fonts.body} — serviço: horário, endereço, CTA${estilo ? ` · ${estilo.tipografia.servico}` : ''}`, tipW), tipX, y + 54)
      y += 90
    }
    // Separadores: faixa escura neutra ao pé do painel
    const sepH = 150
    const sepY = y2 + h2 - sepH
    ctx.fillStyle = ESCURO
    ctx.fillRect(tipX, sepY, tipW, sepH)
    rotulo(ctx, 'SEPARADORES', tipX + 28, sepY + 22, tipW - 56, '#CFC8BC')
    const seps = separadoresDoManual(estilo)
    const colW = (tipW - 56 - 24 * 2) / 3
    seps.slice(0, 3).forEach((sp, i) => {
      const x = tipX + 28 + i * (colW + 24)
      desenharSeparador(ctx, sp, x + 12, sepY + 78, colW - 24, destaque)
      ctx.fillStyle = '#CFC8BC'; ctx.font = '400 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(rotuloDeUmaLinha(ctx, nomeDoSeparador(sp), colW - 24), x + 12, sepY + 108)
    })
  }

  // Alfabetos oficiais: grade 2x2 das famílias, desenhadas na largura do painel
  ctx.fillStyle = ESCURO
  ctx.fillRect(alfX, y2, alfW, h2)
  rotulo(ctx, 'ALFABETOS OFICIAIS (arquivos de fonte do projeto)', alfX + 28, y2 + 24, alfW - 56, '#CFC8BC')
  try {
    const familias = await familiasDaPrancha(brand, 6)
    const cols = 2
    const rows = Math.max(1, Math.ceil(familias.length / cols))
    const padX = 28
    const cellW = (alfW - padX * 2 - 24) / cols
    const cellH = (h2 - 72 - 24) / rows
    familias.forEach((f, i) => {
      const cx = alfX + padX + (i % cols) * (cellW + 24)
      const cy = y2 + 72 + Math.floor(i / cols) * (cellH + 24)
      // Corpo: o maior que faz a linha mais larga caber na célula E as quatro
      // linhas caberem na altura.
      let px = 60
      const cabe = () => {
        ctx.font = `400 ${px}px ${quote(f.familia)}`
        const larg = Math.max(...LINHAS_DE_AMOSTRA.map((t) => ctx.measureText(t).width))
        return larg <= cellW - 8 && 30 + LINHAS_DE_AMOSTRA.length * px * 1.28 <= cellH
      }
      while (px > 14 && !cabe()) px -= 2
      ctx.fillStyle = '#9C958A'; ctx.font = '500 16px sans-serif'
      ctx.fillText(f.papel ? `${f.familia} — ${f.papel}` : f.familia, cx, cy)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `400 ${px}px ${quote(f.familia)}`
      let ly = cy + 30
      for (const linha of LINHAS_DE_AMOSTRA) {
        ctx.fillText(linha, cx, ly)
        ly += Math.ceil(px * 1.28)
      }
    })
    if (familias.length === 0) {
      ctx.fillStyle = '#9C958A'; ctx.font = '400 16px sans-serif'
      ctx.fillText('Nenhuma fonte registrada com arquivo neste projeto.', alfX + 28, y2 + 80)
    }
  } catch (erro) {
    console.warn('[manual-de-marca] alfabetos não entraram:', erro instanceof Error ? erro.message : erro)
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

