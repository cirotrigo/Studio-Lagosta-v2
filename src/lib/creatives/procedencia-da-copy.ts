/**
 * A procedência da copy de uma Generation, como o AGENDAMENTO a lê (módulo
 * PURO — o serviço `agendar.ts` arrasta o Prisma).
 *
 * `copyProposta` é o lado "antes" do diff de copy do agendamento. A regra:
 * `fieldValues.copyDeAprendizado` vence `fieldValues.slotValues`. Os
 * `slotValues` de uma Generation de `ajuste-arte` são a copy VISÍVEL (o que a
 * arte mostra); a camada que o REVISOR escondeu por ajuste mecânico não está
 * lá, e comparar isso com a página lida por `copyParaDecisao` (que conta essa
 * camada como presente) acusava o texto como ADICIONADO pela pessoa —
 * `versusProposta: 'editada'` sem plano nenhum (REV-8AD-01 da revisão do
 * Codex, 12/09/2026). `copyDeAprendizado` é a mesma copy com as ocultações
 * mecânicas contadas, gravada pelo ajuste ao lado dos `slotValues` visuais.
 *
 * `sourcePageId`: a coluna vence; o Json só é lido para linhas antigas e nunca
 * para `ajuste-arte`, em que aponta para a própria cópia ajustada.
 */
function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function lerProcedencia(
  fieldValues: unknown,
  colunaSourcePageId: string | null,
): { copyProposta: Record<string, unknown> | null; sourcePageId: string | null } {
  const fv = objeto(fieldValues) ?? {}
  const copyProposta = objeto(fv.copyDeAprendizado) ?? objeto(fv.slotValues)
  const doJson = fv.source !== 'ajuste-arte' && typeof fv.sourcePageId === 'string' ? fv.sourcePageId : null
  return { copyProposta, sourcePageId: colunaSourcePageId ?? doJson }
}
