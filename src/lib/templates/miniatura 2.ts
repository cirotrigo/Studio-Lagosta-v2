import { put } from '@vercel/blob'

/**
 * A miniatura do template vai para o BLOB — nunca para dentro da coluna.
 *
 * 🔴 Quem produzia base64 era o botão SALVAR do editor: ele gera a miniatura no
 * navegador (`stage.toDataURL`, JPEG 300px) e mandava a data URL inteira no PUT.
 * Medido em 05/09/2026: 130 de 130 miniaturas eram base64, 6,86 MB de coluna —
 * e a listagem da aba de Templates devolve a coluna inteira, então cada abertura
 * da aba baixava aquilo (1.492 KB só no projeto 4).
 *
 * Por isso a troca mora na PORTA DE ENTRADA (o PUT e o POST de template), não em
 * quem chama: qualquer superfície que grave `thumbnailUrl` — editor, sync do
 * desktop, script — passa por aqui. Fechar só a rota `generate-thumbnail`, que
 * é o caminho MENOS usado, não teria tirado uma linha base64 do banco.
 *
 * O caminho é estável (`templates/thumbnails/<id>.<ext>`): salvar de novo
 * SOBRESCREVE (`allowOverwrite`) em vez de acumular arquivo órfão a cada
 * Ctrl+S — e sem `addRandomSuffix`, que no v2 já é o padrão.
 */
const EXTENSAO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function ehMiniaturaEmbutida(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.startsWith('data:')
}

/**
 * Devolve a URL da miniatura no Blob. Valor que já é URL passa intacto.
 *
 * Falha de upload devolve o valor ORIGINAL: miniatura pesada é melhor que card
 * em branco, e a rodada seguinte tenta de novo. O erro sai no log.
 */
export async function guardarMiniatura(valor: string, templateId: number): Promise<string> {
  if (!ehMiniaturaEmbutida(valor)) return valor

  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(valor)
  const tipo = m?.[1]?.toLowerCase()
  const ext = tipo ? EXTENSAO[tipo] : undefined
  if (!m || !ext) {
    console.warn('[miniatura] data URL de tipo desconhecido no template', templateId)
    return valor
  }

  try {
    const blob = await put(`templates/thumbnails/${templateId}.${ext}`, Buffer.from(m[2], 'base64'), {
      access: 'public',
      contentType: tipo,
      // 🔴 O @vercel/blob v2 RECUSA gravar no mesmo caminho por padrão. Sem
      // isto, o primeiro Ctrl+S subiria e o segundo cairia no catch abaixo,
      // devolvendo a data URL — a coluna voltaria a engordar em silêncio.
      allowOverwrite: true,
    })
    return blob.url
  } catch (erro) {
    console.error('[miniatura] falha ao subir a miniatura do template', templateId, erro)
    return valor
  }
}
