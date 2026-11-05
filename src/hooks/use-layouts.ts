import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'

/** Uma caixa em frações da peça (x/w da largura, y/h da altura) — a referência do papel no arquétipo. */
export interface CaixaDoLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutDaVitrine {
  id: string
  versao: number
  nome: string
  codigoTaxonomico: string
  formatos: Array<'story' | 'feed'>
  disponibilidade: 'disponivel' | 'indisponivel'
  motivo?: string
  /** #15: `liso-claro` = layout SEM foto (fundo liso claro da marca). #8: `foto-em-caixa` = foto numa caixa, texto no fundo da marca. Ausente (vitrine antiga) = de foto. */
  fundo?: 'foto' | 'liso-claro' | 'foto-em-caixa'
  /** #8: a caixa da foto por formato (frações), só no `foto-em-caixa`. */
  caixaDaFoto?: Partial<Record<'story' | 'feed', CaixaDoLayout>>
  /** #9: a máscara da caixa por formato (o topo em arco), com o path 0–100 que a peça grava — a prévia o desenha na caixa. */
  mascaraDaFoto?: Partial<Record<'story' | 'feed', { tipo: 'arco-janela'; raio: number; path: string }>>
  /** `porItem`: um acento por item da lista (o fio acima de cada item do #15). `ancoradoA: 'peca'`: as cantoneiras do #16. */
  elementos: Array<{ id: string; tipo: string; opcional: boolean; presoA?: string; ancoradoA?: 'peca'; porItem?: boolean }>
  papeis: Array<{
    papel: string
    obrigatorio: boolean
    ordemDeLeitura: number
  }>
  geometria: Partial<Record<'story' | 'feed', Record<string, CaixaDoLayout>>>
}

export interface VitrineDeLayouts {
  arquetipos: LayoutDaVitrine[]
  assinatura: { disponivel: boolean; motivo?: string }
}

export interface PedidoDePaginaDeLayout {
  templateId: number
  arquetipo: { id: string; versao?: number }
  aPartirDaPagina: string
  fotoUrl?: string
}

export interface PaginaDeLayoutCriada {
  pageId: string
  placeholders: string[]
  foraDoLayout: Array<{
    camada: string
    nome: string
    motivo: string
    papel?: string
  }>
  avisos: string[]
}

const rota = (templateId: number) => `/api/templates/${templateId}/pages/from-layout`

export function useLayouts(templateId: number | null) {
  return useQuery<VitrineDeLayouts>({
    queryKey: ['layouts', templateId],
    queryFn: () => api.get(rota(templateId!)),
    enabled: templateId !== null,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

/**
 * Cria a página NOVA do layout (a origem não muda). Só o POST: abrir a página é `useAbrirPaginaCriada`, que pode
 * falhar e ser repetido sozinho — repetir a criação duplicaria a página.
 */
export function useCriarPaginaDeLayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, ...pedido }: PedidoDePaginaDeLayout) =>
      api.post<PaginaDeLayoutCriada>(rota(templateId), pedido),
    onError: (erro, { templateId }) => {
      // 422 pode ser a assinatura que sumiu: a vitrine recarrega e o card passa a dizer o motivo.
      if (erro instanceof ApiError && erro.status === 422)
        queryClient.invalidateQueries({ queryKey: ['layouts', templateId] })
    },
  })
}

/**
 * Recarrega a lista de páginas (a MESMA chave e o mesmo GET de `usePages`) e só resolve quando a página criada está
 * nela — antes disso, navegar para o id faria o editor cair na primeira página. Lança quando o GET falha ou a página
 * não veio (rodada 1, P2-2: o `invalidateQueries` engolia a falha da recarga). Só GET: nunca cria de novo.
 */
export function useAbrirPaginaCriada() {
  const queryClient = useQueryClient()
  return async (templateId: number, pageId: string) => {
    const paginas = await queryClient.fetchQuery<Array<{ id: string }>>({
      queryKey: ['pages', templateId],
      queryFn: () => api.get(`/api/templates/${templateId}/pages`),
      staleTime: 0,
    })
    if (!Array.isArray(paginas) || !paginas.some((p) => p.id === pageId)) {
      throw new Error('a lista de páginas recarregou sem a página criada')
    }
  }
}
