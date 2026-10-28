/**
 * Presença de grade de fotos nas camadas, para quem NÃO é o editor (bake, halo, defasagem, agendar e o aviso do
 * modal). Puro: sem React, DOM, banco ou rede. Aceita as camadas cruas da página (string JSON ou array).
 */
import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import { celulaVazia, metadadoDeGrade } from './conferir'

/** Tem `metadata.grade` (mesmo malformado): a camada não é tratada como foto comum */
export const vinculadaAGrade = (l: unknown) => ((l as { metadata?: { grade?: unknown } } | null)?.metadata?.grade ?? null) !== null

/** Alguma célula de grade desenhada (`visible !== false`) nas camadas? Ilegível responde `false`. */
export function temGradeVisivel(camadasRaw: unknown): boolean {
  const { camadas, legivel } = lerCamadas(camadasRaw)
  return legivel && (camadas as Layer[]).some((l) => l && l.visible !== false && vinculadaAGrade(l))
}

/**
 * G4.6: células de grade desenhadas SEM foto (`fileUrl` ausente ou `''`, a mesma célula vazia do roundtrip do
 * schema) e em quantas grades. Ilegível conta zero (quem agenda não é bloqueado por isto).
 */
export function celulasVaziasVisiveis(camadasRaw: unknown): { vazias: number; grades: number } {
  const { camadas, legivel } = lerCamadas(camadasRaw)
  if (!legivel) return { vazias: 0, grades: 0 }
  const grades = new Set<string>()
  let vazias = 0
  for (const l of camadas as Layer[]) {
    if (!l || l.visible === false || !vinculadaAGrade(l) || !celulaVazia(l.fileUrl)) continue
    vazias++
    grades.add(String(metadadoDeGrade(l)?.id ?? l.id))
  }
  return { vazias, grades: grades.size }
}

/** O aviso ao agendar (avisa, não bloqueia): "A grade tem N células vazias…"; `null` quando não há. */
export function avisoDeCelulasVazias(camadasRaw: unknown): string | null {
  const { vazias, grades } = celulasVaziasVisiveis(camadasRaw)
  if (vazias === 0) return null
  const quantas = vazias === 1 ? '1 célula vazia' : `${vazias} células vazias`
  return `${grades > 1 ? 'As grades têm' : 'A grade tem'} ${quantas}: ${vazias === 1 ? 'ela sai' : 'elas saem'} sem foto na arte publicada.`
}
