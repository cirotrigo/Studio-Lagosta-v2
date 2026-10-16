/**
 * A VERSÃO de uma página, pelo CONTEÚDO visual.
 *
 * O revisor calcula ajustes sobre uma página; se ela mudou antes de o ajuste
 * chegar (a equipe editou, outro ajuste já entrou), aplicar os deltas às
 * cegas moveria as camadas erradas. Por isso o ajuste leva a versão da
 * revisão e o executor a confere.
 *
 * Nem `updatedAt` nem a URL da arte servem de versão: `updatedAt` muda em
 * qualquer escrita (um `update` de `order` em 30 páginas apagou o sinal de uma
 * vez em 04/09/2026 — ver `defasagem.ts`), e a mesma URL pode ter sido
 * refeita. A versão é o hash das dimensões, do fundo e das camadas, com as
 * chaves ordenadas (a ordem das chaves no JSON do banco não é estável) e sem
 * os campos `undefined` (que o JSON do banco nunca guarda).
 *
 * Módulo PURO.
 */

import { createHash } from 'node:crypto'
import { lerCamadas } from '@/lib/posts/page-layers'
import { quadroZeroEmVideo } from '@/lib/video/movimento'
import { formatoDaPagina } from '@/lib/compositor/assinatura'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'
import type { Formato } from '@/lib/compositor/spec'

/** O JSON com chaves ordenadas e sem `undefined` — a forma de todo hash daqui. Exportado (CP5b § 3.1) para não nascer uma segunda normalização. */
export function estavel(valor: unknown): unknown {
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

/**
 * `null` quando as camadas são ilegíveis — ilegível nunca vira "a mesma versão".
 *
 * `quadro.audio` é para quem compara a versão com um PNG desenhado no quadro 0:
 * a foto em MOVIMENTO só sai com o zoom quando a página é vídeo, e a música
 * decide isso (`quadroZeroEmVideo`). Só então entra no hash — página sem
 * movimento ou sem música, e quem não passa o áudio, têm a versão de sempre.
 */
export function versaoDaPagina(
  pagina: { width: number; height: number; background?: string | null; layers: unknown },
  quadro?: { audio: unknown },
): string | null {
  const { camadas, legivel } = lerCamadas(pagina.layers)
  if (!legivel) return null
  // Só o quadro 0 COM o zoom entra no hash (`estavel` tira o `undefined`): sem
  // movimento, sem música ou sem `quadro`, o PNG é o de sempre e o hash também.
  const video = quadro && quadroZeroEmVideo(camadas, quadro.audio) === true ? true : undefined
  const texto = JSON.stringify(
    estavel({ w: pagina.width, h: pagina.height, bg: pagina.background ?? null, camadas, video }),
  )
  return `v1:${createHash('sha256').update(texto).digest('hex').slice(0, 20)}`
}

/**
 * CP5a — a segunda parte da identidade da peça: o hash do contrato de copy (`Page.copyAutoral`), que muda sem tocar em
 * `layers`. `null`/`undefined` → `'sem-contrato'`. Mesmo `estavel` + sha256 da versão da página. Puro.
 */
export function copyVersionDe(copyAutoral: unknown): string {
  if (copyAutoral === null || copyAutoral === undefined) return 'sem-contrato'
  return `c1:${createHash('sha256').update(JSON.stringify(estavel(copyAutoral))).digest('hex').slice(0, 20)}`
}

export interface IdentidadeDaPagina {
  pageId: string
  /** O classificador do REVISOR (`assinatura.ts`: nome + tags + tamanho) — o que decidiu piso e canvas canônico na medida. */
  formato: Formato | null
  /** O classificador do COMPOSITOR (`compositor/formato.ts`: tags + tamanho) — trocar SÓ as tags muda este sem mudar o outro nem os hashes. */
  formatoDoCompositor: Formato
  pageVersion: string | null
  copyVersion: string
}

/**
 * CP5b § 4.1 — a identidade da peça que o registro do gate guarda: a MESMA `versaoDaPagina(page)` do revisor
 * (`revisar-arte.ts`, sem quadro de áudio — o gate mede o render de imagem; a versão com áudio é a do PNG
 * renderizado para publicação, outra pergunta), `copyVersionDe(Page.copyAutoral)` (o contrato da peça, não a
 * reconciliação da Generation — decisão 9.2) e os DOIS formatos. Puro.
 */
export function identidadeDaPagina(page: {
  id: string
  name: string
  tags: string[]
  width: number
  height: number
  background?: string | null
  layers: unknown
  copyAutoral?: unknown
}): IdentidadeDaPagina {
  return {
    pageId: page.id,
    formato: formatoDaPagina({ name: page.name, tags: page.tags, width: page.width, height: page.height }),
    formatoDoCompositor: formatoDaPaginaGravada({ tags: page.tags, width: page.width, height: page.height }),
    pageVersion: versaoDaPagina(page),
    copyVersion: copyVersionDe(page.copyAutoral),
  }
}
