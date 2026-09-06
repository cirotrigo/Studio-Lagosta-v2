/**
 * Acento — a divergência que a régua tolera de propósito (05/09/2026).
 *
 * A régua (`verifyImageTexts`) termina em `normalizeForComparison`, que tira
 * os acentos: sem isso, "R$ 9,90" contra "R$9,90" reprovaria arte certa
 * (decisão de 12/08/2026). O preço é que a arte que PERDE o acento passa com
 * ✅ — medido em 05/09/2026 no refino do Espeto Gaúcho, onde "Bora almoçar em
 * família!" saiu "familia" no Studio E no ChatGPT, com a régua verde nos dois.
 *
 * Isto é AVISO, nunca reprovação: continua sendo a mesma palavra, e quem
 * aprova decide. Módulo PURO (sem Prisma, sem SDK), como `text-comparison.ts`.
 */

/** Normalização da comparação, mas MANTENDO os diacríticos. */
function normalizeMantendoAcento(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .normalize('NFC')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\s*[·•|]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

/** Só os diacríticos fora — um code point por letra, então a POSIÇÃO se preserva. */
function semDiacriticos(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export interface DivergenciaDeAcento {
  esperado: string
  transcrito: string
}

/**
 * Blocos que a arte reproduziu com o acento ERRADO ("familia" por "família").
 *
 * Compara bloco a bloco: acha na transcrição a linha que casa SEM acento e
 * devolve o trecho correspondente COM acento quando ele difere do esperado.
 * Bloco sem acento nenhum não tem o que conferir.
 */
export function divergenciasDeAcento(esperados: string[], transcritos: string[]): DivergenciaDeAcento[] {
  const saida: DivergenciaDeAcento[] = []
  const linhas = transcritos.map((t) => normalizeMantendoAcento(t))
  for (const bloco of esperados) {
    const alvo = normalizeMantendoAcento(bloco)
    const alvoSem = semDiacriticos(alvo)
    if (!alvoSem || alvoSem === alvo) continue
    for (const linha of linhas) {
      const linhaSem = semDiacriticos(linha)
      const i = linhaSem.indexOf(alvoSem)
      if (i < 0) continue
      const trecho = linha.slice(i, i + alvoSem.length)
      if (trecho !== alvo) saida.push({ esperado: bloco, transcrito: trecho })
      break
    }
  }
  return saida
}

/** O aviso para o `fieldValues` — irmão de `numerosAlerta` e `textoAMaisAviso`. */
export function avisoDeAcento(divergencias: DivergenciaDeAcento[]): Record<string, unknown> {
  if (divergencias.length === 0) return {}
  const lista = divergencias
    .slice(0, 3)
    .map((d) => `"${d.transcrito}" no lugar de "${d.esperado}"`)
    .join(', ')
  return {
    entregueComAlerta: true,
    acentosDivergentes: divergencias.slice(0, 10),
    acentoAlerta: `A arte saiu com acento diferente da copy: ${lista}. É a mesma palavra, mas confira antes de aprovar.`,
  }
}
