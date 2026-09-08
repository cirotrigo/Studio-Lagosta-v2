import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { put } from '@vercel/blob'

/** Bytes exatos: nenhuma recodificação, correção de cor ou composição neste registro. */
export async function registrarEtapasDoTom(
  generationId: string,
  etapas: { referencia: Buffer; antes: Buffer; depois: Buffer; aplicado: boolean; tentativa: number },
) {
  const signal = AbortSignal.timeout(8_000)
  const imagens = await Promise.all(['referencia', 'antes', 'depois'].map(async (nome) => {
    const buffer = etapas[nome as 'referencia' | 'antes' | 'depois']
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    try {
      const meta = await sharp(buffer).metadata()
      const formato = meta.format ?? 'bin'
      const contentType = formato === 'jpeg' ? 'image/jpeg' : formato === 'png' ? 'image/png' : 'application/octet-stream'
      const blob = await put(`arte-ia/etapas/${generationId}/${nome}.${formato}`, buffer, {
        access: 'public', contentType, addRandomSuffix: true, abortSignal: signal,
      })
      return { etapa: nome, estado: 'salvo', url: blob.url, sha256, bytes: buffer.length, largura: meta.width, altura: meta.height }
    } catch {
      return { etapa: nome, estado: 'falhou', sha256, bytes: buffer.length }
    }
  }))
  return {
    versao: '2026-09-08.1',
    aplicado: etapas.aplicado,
    tentativa: etapas.tentativa,
    referencia: 'foto preparada usada no casamento de tom',
    momento: 'antes de redimensionar e compor marcas e documentos',
    estado: imagens.every(i => i.estado === 'salvo') ? 'completo' : 'incompleto',
    imagens,
  }
}
