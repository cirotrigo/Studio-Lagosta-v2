/**
 * S4 (06/11/2026) — a CÓPIA de um modelo, para a pessoa: "Usar" (a página nasce CONTEÚDO) e "Duplicar" (outro modelo).
 * Regra de ouro (`docs/regras/modelos.md`): usar um modelo nunca altera o original.
 *
 * - Camadas por `duplicarCamadasDaPagina` (a mesma transformação do `duplicate` do editor): ids novos e `parentId`
 *   remapeado, então os grupos sobrevivem. Sem contrato (`null`): a cópia não leva `copyAutoral` — a copy é da peça.
 * - Vetor inválido na origem é recusado como o T5 recusa (422 `VETOR_INVALIDO`); nada é gravado.
 * - A Assinatura não recebe nada por aqui: o compositor carrega TODAS as páginas da pasta sem olhar `isTemplate`
 *   (`compor.ts`), então uma cópia ali viraria variante da usina. O único caminho para lá é o T5.
 *
 * Módulo PURO (sem `@/lib/db`): as rotas `modelos/[pageId]/usar` e `duplicar` chamam.
 */
import { CreativeError } from '@/lib/creatives/errors'
import { duplicarCamadasDaPagina } from '@/lib/copy-autoral/duplicacao'
import { NOME_DO_TEMPLATE_DE_ASSINATURA } from '@/lib/compositor/assinatura'
import { emBrasilia } from '@/lib/compositor/pasta-da-semana'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'
import type { Formato } from '@/lib/compositor/spec'
import { lerCamadas } from '@/lib/posts/page-layers'
import { secaoDoTemplate } from '@/lib/templates/classificar'
import { corpoDoVetorInvalido, exigirVetoresValidos } from '@/lib/vetor/guarda-de-porta'
import { VetorInvalido } from '@/lib/vetor/validar-camada'

/** A marca da página nascida de um modelo pelo "Usar": é o que deixa `moverPaginaParaSemana` levá-la para a semana. */
export const TAG_DE_MODELO = 'de-modelo'

export interface PaginaModelo {
  name: string
  width: number
  height: number
  background: string | null
  /** `Page.layers` cru (texto, às vezes duplamente codificado, ou já array). */
  layers: unknown
  tags?: string[] | null
}

export interface OpcoesDaCopia {
  modo: 'usar' | 'duplicar'
  novoId: () => string
  agora: Date
}

export interface PaginaCopiada {
  name: string
  width: number
  height: number
  background: string | null
  /** Pronto para gravar (`JSON.stringify` das camadas). */
  layers: string
  tags: string[]
  isTemplate: boolean
  thumbnail: null
}

/**
 * Tags que são do SISTEMA, não do tema: a duplicata de um modelo não as herda. `fora-do-rodizio` (T5) e `assinatura`
 * mudam o que o compositor escolhe; `compositor`/`de-modelo` dizem que a página é peça; `layout`/`arquetipo:*` são da
 * página de arquétipo; `semana:*` é da pasta; `lote-tema-*` é da família gerada que a aba arquiva.
 */
const TAGS_RESERVADAS = new Set(['fora-do-rodizio', 'assinatura', 'layout', 'compositor', TAG_DE_MODELO])
const PREFIXOS_RESERVADOS = ['semana:', 'arquetipo:', 'lote-tema-']

export const ehTagReservada = (tag: string) => TAGS_RESERVADAS.has(tag) || PREFIXOS_RESERVADOS.some((p) => tag.startsWith(p))

/** A pasta é a da Assinatura: pelo nome (o que o compositor lê) ou pela categoria/tag (o que a aba lê). */
export const ehPastaDaAssinatura = (t: { name: string; category?: string | null; tags?: string[] | null }) =>
  t.name === NOME_DO_TEMPLATE_DE_ASSINATURA || secaoDoTemplate({ id: 0, ...t }) === 'assinatura'

// unificar com formatoPeloTamanho (S2): sem tags, `formatoDaPaginaGravada` decide só pelo tamanho.
export const formatoPeloTamanhoLocal = (width: number, height: number): Formato => formatoDaPaginaGravada({ width, height })

const dd = (n: number) => String(n).padStart(2, '0')

export function copiarPaginaDeModelo(origem: PaginaModelo, opcoes: OpcoesDaCopia): PaginaCopiada {
  const { camadas, legivel } = lerCamadas(origem.layers)
  if (!legivel) throw new CreativeError('CAMADAS_ILEGIVEIS', 'As camadas deste modelo não puderam ser lidas: nada foi criado.', 422)
  try {
    exigirVetoresValidos(camadas)
  } catch (erro) {
    if (!(erro instanceof VetorInvalido)) throw erro
    const corpo = corpoDoVetorInvalido(erro)
    throw new CreativeError('VETOR_INVALIDO', corpo.error, 422, { camadas: corpo.camadas })
  }

  const { camadas: novas } = duplicarCamadasDaPagina(camadas, opcoes.novoId, null)
  const usar = opcoes.modo === 'usar'
  const b = emBrasilia(opcoes.agora)
  return {
    name: usar ? `${origem.name} · ${dd(b.dia)}/${dd(b.mes)}` : `${origem.name} (cópia)`,
    width: origem.width,
    height: origem.height,
    background: origem.background,
    layers: JSON.stringify(novas),
    tags: usar
      ? [formatoPeloTamanhoLocal(origem.width, origem.height), TAG_DE_MODELO]
      : (origem.tags ?? []).filter((t) => !ehTagReservada(t)),
    isTemplate: !usar,
    thumbnail: null,
  }
}
