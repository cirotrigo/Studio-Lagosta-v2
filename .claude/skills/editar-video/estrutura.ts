/**
 * A estrutura padrão de um projeto de vídeo e a regra que decide para onde cada
 * arquivo vai. Módulo PURO (sem disco): é o que o autoteste confere.
 */
import { basename, extname } from 'node:path'

export const PASTAS = {
  briefing: '00_BRIEFING',
  bruto: '01_BRUTO',
  proxies: '02_PROXIES',
  decupagem: '03_DECUPAGEM',
  davinci: '04_DAVINCI',
  trilhas: '05_AUDIO/Trilhas',
  sfx: '05_AUDIO/Efeitos Sonoros',
  locucao: '05_AUDIO/Locucao',
  logo: '06_ELEMENTOS/Logo',
  motion: '06_ELEMENTOS/Motion',
  fotos: '06_ELEMENTOS/Fotos',
  ia: '06_ELEMENTOS/IA',
  assets: '06_ELEMENTOS/Assets',
  temporarios: '07_TEMPORARIOS',
  previas: '08_EXPORTACOES/01_PREVIAS',
  aprovados: '08_EXPORTACOES/02_APROVADOS',
} as const

export const RAIZES = new Set(Object.values(PASTAS).map((p) => p.split('/')[0]))

/** Pastas que só guardam derivados: a análise e a organização nunca entram nelas. */
export const PASTAS_DERIVADAS = new Set([PASTAS.proxies, PASTAS.temporarios, '08_EXPORTACOES', '_analise'])

export const VIDEO = new Set(['.mp4', '.mov', '.mxf', '.mts', '.m2ts', '.m4v', '.avi', '.mkv', '.webm', '.insv', '.lrv'])
const AUDIO = new Set(['.wav', '.mp3', '.aif', '.aiff', '.m4a', '.flac', '.ogg', '.aac'])
const FOTO = new Set(['.jpg', '.jpeg', '.heic', '.heif', '.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.tif', '.tiff'])
const GRAFICO = new Set(['.png', '.svg', '.psd', '.ai', '.eps', '.webp', '.gif'])
const FONTE = new Set(['.ttf', '.otf', '.woff', '.woff2'])
const DOC = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.pages', '.key', '.pptx', '.xlsx', '.csv'])
const DAVINCI = new Set(['.drp', '.drt', '.drb', '.drx', '.setting', '.comp', '.cube'])
/** Arquivos que a câmera grava AO LADO do vídeo: vão junto com ele. */
const SIDECAR = new Set(['.xml', '.thm', '.bim', '.srt', '.lrf', '.xmp', '.bin'])

export type Destino = { pasta: string; motivo: string } | { duvida: string; sugestao?: string }

/**
 * Para onde vai um arquivo. `origem` é a pasta de onde ele vem, relativa ao projeto
 * ("clip", "drone/dia1", ""), usada para manter a separação por câmera dentro do bruto.
 * `alfa` = vídeo com canal alfa (ProRes 4444, PNG em mov): é motion, não bruto.
 */
export function classificar(arquivo: string, origem: string, alfa = false): Destino {
  const nome = basename(arquivo)
  const n = nome.toLowerCase()
  const o = origem.toLowerCase()
  const ext = extname(n)
  const tem = (re: RegExp) => re.test(n) || re.test(o)

  if (tem(/logo|vinheta|assinatura/)) {
    if (VIDEO.has(ext) || GRAFICO.has(ext) || FOTO.has(ext)) return { pasta: PASTAS.logo, motivo: 'nome fala em logo' }
  }
  if (VIDEO.has(ext)) {
    if (alfa || tem(/motion|lower.?third|overlay|anima/)) return { pasta: PASTAS.motion, motivo: alfa ? 'vídeo com transparência' : 'nome fala em motion' }
    if (tem(/higgsfield|kling|seedance|runway|sora|veo|\bia\b|_ia_|gerad/)) return { pasta: PASTAS.ia, motivo: 'vídeo gerado por IA' }
    if (tem(/export|render|final|aprovad|previa|prévia/)) return { duvida: 'parece um vídeo já exportado, não bruto', sugestao: PASTAS.previas }
    return { pasta: join(PASTAS.bruto, origem), motivo: 'vídeo de câmera' }
  }
  if (SIDECAR.has(ext)) return { pasta: join(PASTAS.bruto, origem), motivo: 'arquivo da câmera, vai com o vídeo' }
  if (AUDIO.has(ext)) {
    if (tem(/sfx|efeito|whoosh|swoosh|impact|riser|hit|foley|sound.?effect/)) return { pasta: PASTAS.sfx, motivo: 'efeito sonoro' }
    if (tem(/locu|voz|voice|narra|eleven|\bvo\b|_vo_/)) return { pasta: PASTAS.locucao, motivo: 'locução' }
    if (tem(/musica|música|trilha|music|song|track|bpm|envato|audiojungle/)) return { pasta: PASTAS.trilhas, motivo: 'trilha' }
    return { duvida: 'áudio sem pista se é trilha, efeito ou locução', sugestao: PASTAS.trilhas }
  }
  if (FOTO.has(ext)) {
    if (tem(/higgsfield|nano|gpt.?image|midjourney|\bia\b|_ia_|gerad/)) return { pasta: PASTAS.ia, motivo: 'imagem gerada por IA' }
    return { pasta: PASTAS.fotos, motivo: 'foto' }
  }
  if (GRAFICO.has(ext)) return { duvida: 'gráfico pode ser logo, asset ou foto', sugestao: PASTAS.assets }
  if (FONTE.has(ext)) return { pasta: join(PASTAS.assets, 'fontes'), motivo: 'fonte' }
  if (DAVINCI.has(ext)) return { pasta: PASTAS.davinci, motivo: 'arquivo do Resolve' }
  if (DOC.has(ext)) return { pasta: PASTAS.briefing, motivo: 'documento' }
  if (ext === '.json' && tem(/lottie/)) return { pasta: PASTAS.motion, motivo: 'animação Lottie' }
  return { duvida: `tipo ${ext || 'sem extensão'} desconhecido` }
}

function join(a: string, b: string) {
  return b ? `${a}/${b}` : a
}

/** Já está dentro da estrutura? Então não se move. */
export function jaOrganizado(relativo: string) {
  return RAIZES.has(relativo.split('/')[0])
}

export function autotesteEstrutura() {
  const eq = (a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`)
  }
  const pasta = (d: Destino) => ('pasta' in d ? d.pasta : `?${d.sugestao ?? ''}`)
  eq(pasta(classificar('20260921_C0095.MP4', 'clip')), '01_BRUTO/clip')
  eq(pasta(classificar('C0095M01.XML', 'clip')), '01_BRUTO/clip')
  eq(pasta(classificar('DJI_0001.MP4', '')), '01_BRUTO')
  eq(pasta(classificar('logo-animada.mov', '')), '06_ELEMENTOS/Logo')
  eq(pasta(classificar('texto.mov', '', true)), '06_ELEMENTOS/Motion')
  eq(pasta(classificar('whoosh_01.wav', '')), '05_AUDIO/Efeitos Sonoros')
  eq(pasta(classificar('locucao-v2.mp3', '')), '05_AUDIO/Locucao')
  eq(pasta(classificar('Jazz Lounge (0.30 min).wav', 'musica')), '05_AUDIO/Trilhas')
  eq(pasta(classificar('audio.wav', '')), '?05_AUDIO/Trilhas')
  eq(pasta(classificar('IMG_1234.HEIC', 'fotos')), '06_ELEMENTOS/Fotos')
  eq(pasta(classificar('selo.png', '')), '?06_ELEMENTOS/Assets')
  eq(pasta(classificar('briefing.pdf', '')), '00_BRIEFING')
  eq(pasta(classificar('Reel final v3.mp4', '')), '?08_EXPORTACOES/01_PREVIAS')
  eq(jaOrganizado('01_BRUTO/clip/C0001.MP4'), true)
  eq(jaOrganizado('clip/C0001.MP4'), false)
}
