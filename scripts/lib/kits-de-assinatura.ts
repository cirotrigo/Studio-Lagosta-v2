/**
 * Os KITS DE ASSINATURA por cliente — o que `criar-pagina-de-assinatura.ts`
 * grava como página de assinatura (estilo por papel) e `Project.assinatura`
 * (números). Tudo LIDO do `PADRAO.md` / `gerar.py` do canvas de design de
 * cada cliente (design-canvas/<cliente>-…), nunca inventado; onde um valor
 * foi inferido, o comentário diz.
 *
 * Fonte de cada papel = `CustomFont.fontFamily` cadastrada no projeto — o
 * script confere e recusa fonte que não existe.
 */
import type { NumerosDaAssinatura } from '@/lib/compositor/assinatura'
import type { Formato } from '@/lib/compositor/spec'

export interface PapelDoKit {
  fontFamily: string
  fontSize: number
  lineHeight: number
  /** em → px é feito aqui, no tamanho do papel. */
  trackingEm?: number
  textTransform?: 'uppercase'
  color: string
  exemplo: string
  /** `false` = a camada nasce SEM sombra (a página é a verdade; o compositor respeita). */
  sombra?: false
  /** Fundo de texto que a equipe deixou na página — vira o halo daquele papel. */
  fundo?: { cor: string; fit: 'caixa' | 'texto'; opacidade: number; padding: number; blur: number; raio?: number }
  align?: 'left' | 'center' | 'right'
}

export interface KitDeAssinatura {
  formatos: Partial<Record<Formato, Record<'pre' | 'headline' | 'apoio' | 'cta' | 'servico', PapelDoKit | null>>>
  logo: { largura: number } | null
  fundo: string
  numeros: Partial<NumerosDaAssinatura> & { geometria?: Partial<Record<Formato, Partial<NumerosDaAssinatura['geometria']['story']>>> }
}

const LARANJA = '#FF6B00'
const BRANCO = '#FFFFFF'
const CINZA = '#CFCFCF'

/**
 * Lagosta Criativa — `design-canvas/lagosta-padrao/PADRAO.md` §3 e §5.
 * Pré-título Yanone Bold caixa alta tracking 0,22em · headline Lobster Title
 * Case laranja · apoio Coolvetica Rg branca · CTA Yanone Bold caixa alta com
 * "→" · logo a 236px (22% do quadro, MEDIDO nas três artes aprovadas).
 * A faixa de tinta (0,26–0,58 texto, 0,12–0,30 marca) é a decisão do Ciro de
 * 02/09/2026 (§5.0): a mancha nunca vira marcação.
 */
const lagosta = (escala: number) => ({
  pre: { fontFamily: 'YanoneKaffeesatz Bold', fontSize: Math.round(30 * escala), lineHeight: 1.05, trackingEm: 0.22, textTransform: 'uppercase' as const, color: LARANJA, exemplo: 'Produção de conteúdo', sombra: false as const, fundo: { cor: '#000000', fit: 'texto' as const, opacidade: 1, padding: Math.round(113 * escala), blur: Math.round(374 * escala) } },
  headline: { fontFamily: 'Lobster', fontSize: Math.round(96 * escala), lineHeight: 0.94, color: LARANJA, exemplo: 'Foto Nova a Cada\nQuinze Dias', sombra: false as const, fundo: { cor: '#111111', fit: 'texto' as const, opacidade: 0.7, padding: 60, blur: 110 } },
  apoio: { fontFamily: 'Coolvetica Rg', fontSize: Math.round(42 * escala), lineHeight: 1.14, color: BRANCO, exemplo: 'O executivo muda de cardápio,\na produção acompanha.', sombra: false as const, fundo: { cor: '#111111', fit: 'texto' as const, opacidade: 0.7, padding: 60, blur: 110 } },
  cta: { fontFamily: 'YanoneKaffeesatz Bold', fontSize: Math.round(32 * escala), lineHeight: 1.05, trackingEm: 0.1, textTransform: 'uppercase' as const, color: LARANJA, exemplo: '→ Conheça nossos pacotes', sombra: false as const, fundo: { cor: '#111111', fit: 'texto' as const, opacidade: 0.92, padding: 60, blur: 223 } },
  servico: { fontFamily: 'Coolvetica Rg', fontSize: Math.round(30 * escala), lineHeight: 1.1, trackingEm: 0.04, color: CINZA, exemplo: 'lagostacriativa.com.br · @lagostacriativa', sombra: false as const, fundo: { cor: '#111111', fit: 'texto' as const, opacidade: 0.7, padding: 60, blur: 110 } },
})

type Papeis = Record<'pre' | 'headline' | 'apoio' | 'cta' | 'servico', PapelDoKit | null> & { headline2?: PapelDoKit }
const P = (fontFamily: string, fontSize: number, lineHeight: number, color: string, exemplo: string, extra: Partial<PapelDoKit> = {}): PapelDoKit => ({ fontFamily, fontSize, lineHeight, color, exemplo, ...extra })
const UP = { textTransform: 'uppercase' as const }
/** Safe area do editor (CANVAS_MARGIN): abaixo disso o autofix acusa "fora da área segura". */
const geo = (margemH: number, safeTopo: number, safeRodape: number, escalaDeFonte: number, gap = 14) => ({
  margemH,
  safeTopo: Math.max(120, safeTopo),
  safeRodape: Math.max(100, safeRodape),
  gapEntreBlocos: gap,
  escalaDeFonte,
})

// Tudo abaixo foi LIDO das páginas de assinatura ajustadas pelo Ciro em
// 03/09/2026 (fonte, tamanho, cor, caixa, sombra e fundo de texto por papel).
// `headline2` é a SEGUNDA VOZ da manchete: a última linha sai nela.

const real: Papeis = {
  pre: P('StageGrotesk Medium', 28, 1.2, '#CFE5D6', 'Quarta do crepe', { trackingEm: 0.24, ...UP, sombra: false, fundo: { cor: '#1e2e28', fit: 'texto', opacidade: 0.78, padding: 106, blur: 175 } }),
  headline: P('Branley GC', 84, 0.9, '#F3EADC', 'A Vitrine Vende\nPelos Olhos', { sombra: false, fundo: { cor: '#ffffff', fit: 'caixa', opacidade: 1, padding: 10, blur: 0 } }),
  apoio: P('StageGrotesk Thin', 34, 1.0, '#283D36', 'Sabor por sabor, com a luz que\na cuba tem no balcão', { trackingEm: 0.015, sombra: false, fundo: { cor: '#f6f0e4', fit: 'texto', opacidade: 1, padding: 200, blur: 246 } }),
  cta: null,
  servico: P('StageGrotesk Regular', 32, 1.25, '#283D36', 'Todos os dias, das 12h às 22h', { trackingEm: 0.02, sombra: false, fundo: { cor: '#ffffff', fit: 'caixa', opacidade: 1, padding: 10, blur: 0 } }),
}
const realFeed: Papeis = {
  pre: P('StageGrotesk Medium', 28, 1.0, '#CFE5D6', 'Quarta do crepe', { trackingEm: 0.24, ...UP, fundo: { cor: '#1c2b26', fit: 'texto', opacidade: 0.7, padding: 95, blur: 110 } }),
  headline: P('Branley GC', 88, 1.0, '#F3EADC', 'A Vitrine Vende\nPelos Olhos', { fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('StageGrotesk Thin', 34, 1.0, '#F3EADC', 'Sabor por sabor, com a luz que\na cuba tem no balcão.', { trackingEm: 0.015, fundo: { cor: '#1c2b26', fit: 'texto', opacidade: 0.7, padding: 148, blur: 110 } }),
  cta: null,
  servico: P('StageGrotesk Regular', 31, 1.25, '#F3EADC', 'Todos os dias, das 12h às 22h', { trackingEm: 0.02, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}

const quintal: Papeis = {
  pre: null,
  headline: P('DomaniCP', 87, 1.02, '#F5F0E8', 'Terça no', { align: 'center', fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 98, blur: 497 } }),
  headline2: P('Amithen', 124, 1.02, '#F5F0E8', 'Quintal', { align: 'center', fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Acumin Pro Thin', 40, 1.3, '#F5F0E8', 'Parrilla de verdade, no fogo\nde chão, a semana inteira.', { align: 'center', fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  cta: null,
  servico: P('Acumin Pro Semibold', 30, 1.0, '#F5F0E8', 'Terça a domingo, das 11h às 00h', { ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 10, blur: 169 } }),
}

const tero: Papeis = {
  pre: P('Montserrat', 60, 1.25, '#F8F2F0', 'Happy hour', { trackingEm: 0.114, ...UP, align: 'center', fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 95, blur: 365 } }),
  headline: P('Didot HTF B06 Bold', 80, 0.91, '#EF7B4F', 'BRASA E VINHO', { ...UP, align: 'center', fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Montserrat', 30, 1.3, '#F8F2F0', 'Cortes na brasa e taças em dobro,\nde terça a sexta', { trackingEm: 0.07, ...UP, align: 'center', fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  cta: P('Didot HTF B06 Bold', 30, 1.2, '#EF7B4F', 'Reserve pelo direct', { trackingEm: 0.1, ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 75, blur: 238 } }),
  servico: P('Montserrat', 36, 1.2, '#F8F2F0', 'Terça a sexta, das 17h às 20h', { trackingEm: 0.052, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}
const teroFeed: Papeis = {
  pre: P('Montserrat', 47, 1.25, '#F8F2F0', 'Happy hour', { trackingEm: 0.146, ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 81, blur: 365 } }),
  headline: P('Didot HTF B06 Bold', 80, 0.91, '#EF7B4F', 'BRASA\nE VINHO', { ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Montserrat', 30, 1.0, '#F8F2F0', 'Cortes na brasa e taças em dobro,\nde terça a sexta.', { trackingEm: 0.07, ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 60, blur: 238 } }),
  cta: null,
  servico: null,
}

const seuQuinto: Papeis = {
  pre: P('The Kathy', 60, 1.0, '#FFFFFF', 'Seu Quinto', { align: 'center', fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 96, blur: 465 } }),
  headline: P('Bonoco2023', 76, 1.0, '#FFFFFF', 'SEG COMEÇA\nCOM GOSTO', { trackingEm: -0.013, ...UP, align: 'center', fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Bonoco2023', 42, 1.16, '#ffffff', 'PORÇÃO PRA DIVIDIR\nE CHOPE GELADO', { ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 82, blur: 311 } }),
  cta: null,
  servico: P('Bonoco2023', 35, 1.16, '#FAA61A', 'TERÇA A DOMINGO, A PARTIR DAS 17H', { ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}
const seuQuintoFeed: Papeis = {
  pre: P('The Kathy', 60, 1.1, '#FFFFFF', 'Seu Quinto'),
  headline: P('Bonoco2023', 72, 0.97, '#FFFFFF', 'SEG COMEÇA\nCOM GOSTO', { trackingEm: -0.014, ...UP }),
  apoio: P('Bonoco2023', 42, 1.16, '#FAA61A', 'PORÇÃO PRA DIVIDIR\nE CHOPE GELADO', UP),
  cta: P('The Kathy', 54, 1.1, '#FFFFFF', 'Vem pra cá'),
  servico: P('Bonoco2023', 46, 1.16, '#FFFFFF', 'TERÇA A DOMINGO, A PARTIR DAS 17H', UP),
}

const bacana: Papeis = {
  pre: P('Montserrat', 64, 1.0, '#FFFFFF', 'ALMOÇO DE', { ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 102, blur: 329 } }),
  headline: P('Cannon medium', 72, 1.0, '#FFFFFF', 'SÁBADO', { trackingEm: 0.014, ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Cannon book', 30, 1.35, '#FFFFFF', 'Churrasco na brasa, espaço kids\ne chope gelado o dia todo.', { ...UP, align: 'center', fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 17, blur: 223 } }),
  cta: null,
  servico: P('Cannon bold', 32, 1.15, '#FFFFFF', 'SÁBADO, DAS 12H ÀS 17H', { trackingEm: 0.06, ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 78, blur: 311 } }),
}
const bacanaFeed: Papeis = {
  pre: P('Cannon book', 64, 1.0, '#FFFFFF', 'ALMOÇO DE', { trackingEm: 0.04, ...UP }),
  headline: P('Cannon extrabold', 72, 1.04, '#FFFFFF', 'SÁBADO', { trackingEm: 0.01, ...UP }),
  apoio: P('Cannon book', 34, 1.35, '#FFFFFF', 'Churrasco na brasa, espaço kids\ne chope gelado o dia todo.'),
  cta: null,
  servico: P('Cannon bold', 32, 1.15, '#FFFFFF', 'SÁBADO, DAS 12H ÀS 17H', { trackingEm: 0.06, ...UP }),
}

const espeto: Papeis = {
  pre: P('Barlow Condensed SemiBold', 30, 1.2, '#F4301A', 'Churrasco em família', { trackingEm: 0.15, ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 116, blur: 423 } }),
  headline: P('Bevan', 76, 0.95, '#FFFFFF', 'RODÍZIO\nCOMPLETO', { ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Caveat SemiBold', 54, 1.02, '#FDC700', 'Espeto a espeto, do jeito\nque o gaúcho faz.', { fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  cta: P('Caveat SemiBold', 60, 1.02, '#F4301A', 'Vem pro Espeto!', { fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 95, blur: 365 } }),
  servico: P('Barlow Condensed SemiBold', 34, 1.05, '#FFFFFF', 'Todos os dias, das 11h30 às 23h', { ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}
const espetoFeed: Papeis = {
  pre: P('Barlow Condensed SemiBold', 30, 1.2, '#F4301A', 'Churrasco em família', { trackingEm: 0.15, ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 108, blur: 356 } }),
  headline: P('Bevan', 88, 0.95, '#FFFFFF', 'RODÍZIO\nCOMPLETO', { ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Caveat SemiBold', 50, 1.02, '#FDC700', 'Espeto a espeto, do jeito\nque o gaúcho faz.', { fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 97, blur: 356 } }),
  cta: P('Caveat SemiBold', 58, 1.02, '#F4301A', 'Vem pro Espeto!', { fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  servico: P('Barlow Condensed SemiBold', 34, 1.05, '#FFFFFF', 'Todos os dias, das 11h30 às 23h', { fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}

const byRock: Papeis = {
  pre: null,
  headline: P('MortellaDisplay ExtraBold', 92, 0.8, '#FFFFFF', 'SÁBADO\nTEM SAMBA', { trackingEm: 0.011, ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 98, blur: 365 } }),
  apoio: P('Metrisch Light', 36, 1.0, '#CCCCCC', 'RODA DE SAMBA AO VIVO\nE CHOPE EM DOBRO ATÉ AS 20H', { trackingEm: 0.028, ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  cta: P('Metrisch BookItalic', 30, 1.0, '#FFFFFF', 'Chama a galera', { ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 94, blur: 238 } }),
  servico: P('Metrisch ExtraBoldItalic', 35, 1.0, '#dc0909', 'Sábado, a partir das 16h', { ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}
const byRockFeed: Papeis = {
  pre: null,
  headline: P('MortellaDisplay ExtraBold', 86, 0.8, '#FFFFFF', 'SÁBADO\nTEM SAMBA', { ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 95, blur: 365 } }),
  apoio: P('Metrisch Light', 33, 1.0, '#CCCCCC', 'RODA DE SAMBA AO VIVO\nE CHOPE EM DOBRO ATÉ AS 20H', { trackingEm: 0.006, ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  cta: P('Metrisch BookItalic', 30, 1.0, '#FFFFFF', 'Chama a galera', { ...UP, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 86, blur: 294 } }),
  servico: P('Metrisch Medium', 35, 1.0, '#dc0909', 'Sábado, a partir das 16h', { ...UP, fundo: { cor: '#111111', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}

const wineVix: Papeis = {
  pre: P('Lato Bold', 30, 1.2, '#F9F7F2', 'Harmonização', { trackingEm: 0.14, ...UP, fundo: { cor: '#3c191d', fit: 'texto', opacidade: 1, padding: 183, blur: 347 } }),
  headline: P('PlayfairDisplay SemiBoldItalic', 84, 0.9, '#FCE77B', 'A Adega Abre\na Semana', { fundo: { cor: '#722f37', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('Lato Thin', 30, 1.18, '#F9F7F2', 'TAÇA EM DOBRO NOS RÓTULOS\nSELECIONADOS DA SEMANA', { trackingEm: 0.053, ...UP, fundo: { cor: '#722f37', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  cta: P('PlayfairDisplay MediumItalic', 36, 1.2, '#FCE77B', 'Reserve sua mesa', { align: 'right', fundo: { cor: '#4e2026', fit: 'texto', opacidade: 1, padding: 200, blur: 486 } }),
  servico: P('Lato Light', 32, 1.2, '#F9F7F2', 'TERÇA A SÁBADO, DAS 18H ÀS 23H', { trackingEm: 0.1, ...UP, align: 'right', fundo: { cor: '#722f37', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}

const emporio: Papeis = {
  pre: P('TrajanPro Regular', 43, 1.0, '#FFFFFF', 'Quarta da pizza', { trackingEm: 0.023, align: 'center', fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 150, blur: 444 } }),
  headline: P('TrajanPro Bold', 58, 1.0, '#CAB371', 'CAFÉ DE MÉTODO', { align: 'center', fundo: { cor: '#4d5d75', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('TrajanPro Regular', 38, 1.0, '#CAB371', 'Grãos selecionados, passados\nna hora, do jeito da casa.', { fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 108, blur: 374 } }),
  cta: null,
  servico: P('FRZQUADB', 36, 1.0, '#FFFFFF', 'Segunda a sábado, das 8h às 20h', { fundo: { cor: '#4d5d75', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
}
const emporioFeed: Papeis = {
  pre: P('TrajanPro Regular', 37, 1.0, '#CAB371', 'Quarta da pizza', { fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 116, blur: 444 } }),
  headline: P('TrajanPro Bold', 62, 1.0, '#FFFFFF', 'CAFÉ DE MÉTODO', { fundo: { cor: '#4d5d75', fit: 'texto', opacidade: 0.7, padding: 60, blur: 110 } }),
  apoio: P('TrajanPro Regular', 30, 1.3, '#CAB371', 'Grãos selecionados, passados\nna hora, do jeito da casa.', { trackingEm: 0.027, fundo: { cor: '#000000', fit: 'texto', opacidade: 1, padding: 81, blur: 384 } }),
  cta: null,
  servico: null,
}

export const KITS_DE_ASSINATURA: Record<number, KitDeAssinatura> = {
  1: { formatos: { story: real, feed: realFeed }, logo: { largura: 151 }, fundo: '#283D36', numeros: { mancha: '#283D36', fundo: '#283D36', halo: { faixaTexto: [0.4, 0.8], faixaMarca: [0.3, 0.6], raioTexto: 150, raioMarca: 150 }, logo: { largura: 151 }, geometria: { story: geo(96, 250, 350, 1), feed: geo(96, 120, 100, 88 / 96), quadrado: geo(96, 120, 100, 0.85, 12) } } },
  2: { formatos: { story: quintal }, logo: { largura: 238 }, fundo: '#1F1B16', numeros: { mancha: '#1F1B16', fundo: '#1F1B16', halo: { faixaTexto: [0.3, 0.9], faixaMarca: [0.2, 0.5], raioTexto: 130, raioMarca: 130 }, logo: { largura: 238 }, geometria: { story: geo(92, 200, 172, 1), feed: geo(92, 120, 104, 0.875), quadrado: geo(92, 120, 104, 0.85, 12) } } },
  3: { formatos: { story: tero, feed: teroFeed }, logo: { largura: 198 }, fundo: '#130D0A', numeros: { mancha: '#130D0A', fundo: '#130D0A', halo: { faixaTexto: [0.3, 0.85], faixaMarca: [0.2, 0.6], raioTexto: 96, raioMarca: 96 }, logo: { largura: 198 }, geometria: { story: geo(96, 120, 100, 1), feed: geo(96, 120, 110, 1), quadrado: geo(96, 120, 110, 0.9, 12) } } },
  4: { formatos: { story: seuQuinto, feed: seuQuintoFeed }, logo: { largura: 118 }, fundo: '#0E0B08', numeros: { mancha: '#0E0B08', fundo: '#0E0B08', halo: { faixaTexto: [0.5, 0.9], faixaMarca: [0, 0], raioTexto: 103, raioMarca: 60 }, logo: { largura: 118 }, geometria: { story: geo(88, 200, 180, 1), feed: geo(88, 120, 100, 1), quadrado: geo(88, 120, 100, 0.9, 12) } } },
  5: { formatos: { story: bacana, feed: bacanaFeed }, logo: { largura: 200 }, fundo: '#1A1410', numeros: { mancha: '#1A1410', fundo: '#1A1410', halo: { faixaTexto: [0.4, 0.85], faixaMarca: [0.3, 0.6], raioTexto: 112, raioMarca: 132 }, logo: { largura: 200 }, geometria: { story: geo(84, 200, 150, 1), feed: geo(84, 120, 100, 1), quadrado: geo(84, 120, 100, 0.9, 12) } } },
  6: { formatos: { story: espeto, feed: espetoFeed }, logo: { largura: 145 }, fundo: '#2B1A12', numeros: { mancha: '#170E09', fundo: '#2B1A12', halo: { faixaTexto: [0.42, 0.86], faixaMarca: [0.14, 0.3], raioTexto: 152, raioMarca: 120 }, logo: { largura: 145 }, geometria: { story: geo(90, 120, 100, 1), feed: geo(90, 120, 104, 1), quadrado: geo(90, 120, 104, 0.9, 12) } } },
  7: { formatos: { story: byRock, feed: byRockFeed }, logo: { largura: 136 }, fundo: '#111111', numeros: { mancha: '#111111', fundo: '#111111', halo: { faixaTexto: [0.4, 0.85], faixaMarca: [0.3, 0.6], raioTexto: 158, raioMarca: 158 }, logo: { largura: 136 }, geometria: { story: geo(72, 140, 100, 1), feed: geo(72, 120, 100, 1), quadrado: geo(72, 120, 100, 0.9, 12) } } },
  8: {
    formatos: { story: lagosta(1), feed: lagosta(84 / 96) },
    logo: { largura: 236 },
    fundo: '#0B0B0B',
    numeros: {
      mancha: '#0B0B0B',
      fundo: '#0B0B0B',
      halo: { faixaTexto: [0.26, 0.58], faixaMarca: [0.12, 0.3], raioTexto: 190, raioMarca: 96 },
      logo: { largura: 236 },
      geometria: {
        story: { margemH: 92, safeTopo: 188, safeRodape: 224, gapEntreBlocos: 14, escalaDeFonte: 1 },
        feed: { margemH: 92, safeTopo: 120, safeRodape: 104, gapEntreBlocos: 14, escalaDeFonte: 84 / 96 },
        quadrado: { margemH: 92, safeTopo: 120, safeRodape: 104, gapEntreBlocos: 12, escalaDeFonte: 0.85 },
      },
    },
  },
  11: { formatos: { story: wineVix }, logo: { largura: 148 }, fundo: '#241A16', numeros: { mancha: '#240000', fundo: '#241A16', halo: { faixaTexto: [0.3, 0.85], faixaMarca: [0, 0], raioTexto: 150, raioMarca: 60 }, logo: { largura: 148 }, geometria: { story: geo(96, 200, 150, 1), feed: geo(96, 120, 100, 0.875), quadrado: geo(96, 120, 100, 0.85, 12) } } },
  12: { formatos: { story: emporio, feed: emporioFeed }, logo: { largura: 200 }, fundo: '#2C3445', numeros: { mancha: '#2C3445', fundo: '#2C3445', halo: { faixaTexto: [0.46, 0.76], faixaMarca: [0.4, 0.8], raioTexto: 96, raioMarca: 96 }, logo: { largura: 200 }, geometria: { story: geo(88, 184, 184, 1), feed: geo(88, 120, 100, 84 / 96), quadrado: geo(88, 120, 100, 0.85, 12) } } },
}
