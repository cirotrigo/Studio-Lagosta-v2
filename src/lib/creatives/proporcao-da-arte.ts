/**
 * Aviso de proporção para arte importada: o Instagram corta ou põe faixa em
 * imagem fora de 9:16 (story), 4:5 (feed) ou 1:1. O ChatGPT, por exemplo,
 * entrega 1024x1536 (2:3) — vira STORY em `classificarFormato`, mas não é 9:16.
 * Avisa; nunca corta (cortar em silêncio come a faixa do texto).
 */

/** Mesma tolerância de `checarProporcao` (creative-qa): 2%. */
const TOLERANCIA = 0.02

/**
 * O formato em que a arte vai entrar — os MESMOS cortes de `classificarFormato`
 * (arte-enviada.ts), repetidos porque aquele módulo importa o Prisma.
 */
function alvoDoFormato(razao: number): { nome: string; razao: number } {
  if (razao >= 1.5) return { nome: 'story (9:16)', razao: 16 / 9 }
  if (razao > 1.05) return { nome: 'feed (4:5)', razao: 5 / 4 }
  if (razao >= 0.95) return { nome: 'quadrado (1:1)', razao: 1 }
  return { nome: 'feed (4:5)', razao: 5 / 4 }
}

export function avisoDeProporcao(width: number, height: number): string | null {
  if (!width || !height) return null
  const razao = height / width
  const alvo = alvoDoFormato(razao)
  if (Math.abs(alvo.razao - razao) / alvo.razao <= TOLERANCIA) return null
  return `A imagem tem ${width}x${height} e vai entrar como ${alvo.nome}, mas não está nessa proporção. No Instagram ela vai sair cortada ou com faixa — confira a prévia antes de aprovar, ou gere de novo na proporção certa.`
}
