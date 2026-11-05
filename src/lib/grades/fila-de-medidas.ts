/**
 * Q2 · fila das medidas dos ajustes: a grade de 28 fotos não começa 28 decodificações juntas. No máximo
 * `simultaneas` em voo; cancelado o sinal, nenhuma medida nova começa (as em voo recebem o mesmo sinal e o prazo do
 * medidor). Falha fica sem resultado. Não confere a URL: quem chama passa cada resultado por `dimensoesDaFotoCarregada`.
 */
import type { MedidorDeFoto } from './medir-foto'

export const MEDIDAS_SIMULTANEAS = 2

export async function medirEmFila(
  urls: readonly string[],
  medir: MedidorDeFoto,
  { signal, simultaneas = MEDIDAS_SIMULTANEAS }: { signal?: AbortSignal; simultaneas?: number } = {},
): Promise<Map<string, Awaited<ReturnType<MedidorDeFoto>>>> {
  const fotos = new Map<string, Awaited<ReturnType<MedidorDeFoto>>>()
  let proxima = 0
  const trabalhador = async () => {
    while (proxima < urls.length && !signal?.aborted) {
      const url = urls[proxima++]
      const foto = await medir(url, { signal }).catch(() => undefined)
      if (foto) fotos.set(url, foto)
    }
  }
  await Promise.all(Array.from({ length: Math.min(simultaneas, urls.length) }, trabalhador))
  return fotos
}
