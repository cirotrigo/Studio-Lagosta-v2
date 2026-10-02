/**
 * "Esta Generation é um VÍDEO exportado do editor?" — a parte PURA da proteção
 * do vídeo contra a limpeza de 90 dias.
 *
 * Por que existe (02/10/2026): o export de vídeo grava `fieldValues.isVideo`,
 * `fieldValues.videoUrl` (o MP4 no Blob) e o backup do Drive em
 * `fieldValues.driveBackupUrl` — NÃO na coluna `googleDriveBackupUrl`. A
 * limpeza lia a coluna, concluía "arte sem backup", reenviava o MP4 ao Drive
 * pelo uploader de IMAGEM (PNG) e trocava `resultUrl` e as mídias dos posts por
 * um link lh3 de imagem que responde 404. Medido em produção: 12 vídeos
 * afetados, um story falhou em 12/09.
 *
 * 🔴 O filtro é no CÓDIGO, nunca no `where` do Prisma: filtro Json descarta a
 * linha que não TEM o campo (a maioria — toda arte que não é vídeo), e a
 * limpeza deixaria de limpar quase tudo em silêncio.
 *
 * Sem Prisma, de propósito: é o que deixa a regra ter teste sem banco.
 */

/** `fieldValues` como objeto; aceita a string JSON (até dupla-codificada). */
function comoObjeto(fieldValues: unknown): Record<string, unknown> | null {
  let valor = fieldValues
  for (let i = 0; i < 2 && typeof valor === 'string'; i++) {
    try {
      valor = JSON.parse(valor)
    } catch {
      return null
    }
  }
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

/**
 * Só o booleano `true` conta (`isVideo` ou o `videoExport` que a fila grava
 * junto). A string "true" não é o que nenhum produtor escreve.
 */
export function ehGeracaoDeVideo(fieldValues: unknown): boolean {
  const fv = comoObjeto(fieldValues)
  return fv !== null && (fv.isVideo === true || fv.videoExport === true)
}

/** O MP4 que o export registrou (`fieldValues.videoUrl`), ou null. */
export function videoUrlRegistrado(fieldValues: unknown): string | null {
  const url = comoObjeto(fieldValues)?.videoUrl
  return typeof url === 'string' && url.trim() !== '' ? url : null
}
