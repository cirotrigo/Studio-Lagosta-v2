/**
 * A versão do VÍDEO de uma página: a versão visual (`versaoDaPagina`: dimensões,
 * fundo e camadas) mais a trilha (`Page.audio`), canônica.
 *
 * O mesmo desenho dá a mesma versão venha ele do editor (o `designData` que a
 * gravação levou à fila) ou do banco (a página que o autosave gravou): as
 * camadas do design passam pela mesma canonicalização do PATCH da página
 * (`canonicalizeLayersForPersistence`) e o fundo segue a regra do PageSync
 * (string ou nada). É o que deixa comparar "o vídeo da agenda" com "a página
 * de agora" sem acusar desatualizado quem acabou de salvar e exportar.
 *
 * Servidor só: `versaoDaPagina` usa `node:crypto`.
 */
import { createHash } from 'node:crypto'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'

function estavel(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(estavel)
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(objeto)
        .filter((k) => objeto[k] !== undefined)
        .sort()
        .map((k) => [k, estavel(objeto[k])]),
    )
  }
  return valor
}

export interface PaginaDoVideo {
  width: number
  height: number
  background?: string | null
  layers: unknown
  audio?: unknown
}

/** `null` quando as camadas são ilegíveis — ilegível nunca vira "a mesma versão". */
export function versaoDoVideo(pagina: PaginaDoVideo): string | null {
  const visual = versaoDaPagina(pagina)
  if (!visual) return null
  const audio = JSON.stringify(estavel(pagina.audio ?? null))
  return `vv1:${createHash('sha256').update(`${visual}|${audio}`).digest('hex').slice(0, 20)}`
}

/**
 * A página COMO O EDITOR A GRAVOU no vídeo: o `designData` da fila
 * (`{ canvas, layers, audio }`) na forma da página do banco.
 */
export function paginaDoDesign(designData: unknown): PaginaDoVideo | null {
  if (!designData || typeof designData !== 'object' || Array.isArray(designData)) return null
  const d = designData as { canvas?: { width?: unknown; height?: unknown; backgroundColor?: unknown }; layers?: unknown; audio?: unknown }
  const width = Number(d.canvas?.width)
  const height = Number(d.canvas?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Array.isArray(d.layers)) return null
  return {
    width,
    height,
    background: typeof d.canvas?.backgroundColor === 'string' ? d.canvas.backgroundColor : null,
    layers: canonicalizeLayersForPersistence(d.layers),
    audio: d.audio ?? null,
  }
}
