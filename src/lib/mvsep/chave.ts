/**
 * Chave da API da MVSEP. Vem só do ambiente: sem a variável, quem chama falha
 * com um erro claro em vez de bater na MVSEP com chave nenhuma (ou com uma
 * chave escrita no código, como já foi o caso).
 */
export function chaveDaMvsep(): string {
  const chave = process.env.MVSEP_API_KEY?.trim()
  if (!chave) {
    throw new Error('MVSEP_API_KEY não está definida no ambiente; a separação de stems não pode rodar sem ela.')
  }
  return chave
}
