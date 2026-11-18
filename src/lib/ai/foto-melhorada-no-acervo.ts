/**
 * GANCHO: a foto melhorada que foi USADA entra no acervo do cliente.
 *
 * Chamado no ponto em que uma opção é aplicada à página
 * (`aplicarOpcaoDeFoto`). Nesta fase não faz nada: a foto fica só no Blob, na
 * trilha `foto-melhorada`.
 *
 * O que entra aqui na próxima fatia (seção 6.1 do
 * `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`): copiar a foto limpa para
 * `Fotos/IA_LAGOSTA` no Drive do cliente, com o nome que diz de onde veio, e
 * gravar a ficha no catálogo ligada à original (tratada por IA, foto de origem
 * e receita). Só a opção usada: a recusada nunca vai para a pasta do cliente.
 */
export interface FotoMelhoradaUsada {
  projectId: number
  /** A foto limpa, sem texto, no Blob. */
  fotoUrl: string
  /** A foto da página antes da troca. */
  fotoDeOrigemUrl: string
  /** Ids das receitas (`receitas-de-foto.ts`). Vazio quando o prompt veio pronto do chat. */
  receitas: string[]
  /** A arte que nasceu com a foto nova. */
  generationId: string
}

export async function registrarFotoMelhoradaNoAcervo(_foto: FotoMelhoradaUsada): Promise<void> {
  // Sem efeito de propósito. Ver o comentário do arquivo.
}
