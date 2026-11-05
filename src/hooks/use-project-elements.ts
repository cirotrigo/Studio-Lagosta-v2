import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  chavesDosElementos,
  lerElementoCriado,
  lerExclusaoConfirmada,
  lerListaDeElementos,
  mensagemDoErroDeEnvio,
  RespostaDeElementoInvalida,
  type ProjectElement,
} from '@/lib/brand/lista-de-elementos'

export type { ProjectElement }

/**
 * A consulta dos elementos do projeto (ícones, selos, ornamentos), exportada para o teste dirigir a MESMA key e a
 * mesma leitura que a tela. Estrita (CP-V2e): HTML 200, não-lista e item malformado viram ERRO, nunca lista vazia.
 */
export function consultaDosElementos(projectId: number | null | undefined) {
  return {
    queryKey: ['project-elements', projectId] as const,
    queryFn: async () => lerListaDeElementos(await api.get<unknown>(`/api/projects/${projectId}/elements`), projectId as number),
    enabled: typeof projectId === 'number' && projectId > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  }
}

export function useProjectElements(projectId: number | null | undefined) {
  return useQuery<ProjectElement[]>(consultaDosElementos(projectId))
}

/** Invalida as 3 keys que leem o endpoint, do projeto PEDIDO (o da mutação), nunca o da tela. */
export function invalidarElementosDoProjeto(queryClient: QueryClient, projectId: number) {
  return Promise.all(chavesDosElementos(projectId).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

export interface EnvioDeElemento {
  projectId: number
  file: File
}
export interface ExclusaoDeElemento {
  projectId: number
  elementId: number
}

/**
 * Envio multipart (`file` + `name`) pelo `importarElemento` do servidor. `fetch` aqui dentro, como o `use-drive`: o
 * `api.post` faz `JSON.stringify` e o `FormData` viraria `{}`; sem `Content-Type`, o navegador monta o boundary.
 * Sem nova tentativa automática; `onSettled` (sucesso OU erro) reconcilia pela nova leitura, sem repetir o pedido.
 */
export function envioDeElemento(queryClient: QueryClient) {
  return {
    mutationFn: async ({ projectId, file }: EnvioDeElemento): Promise<ProjectElement> => {
      const form = new FormData()
      form.set('file', file)
      form.set('name', file.name.replace(/\.[^/.]+$/, ''))
      const res = await fetch(`/api/projects/${projectId}/elements`, { method: 'POST', body: form })
      const texto = await res.text()
      if (!res.ok) throw new Error(mensagemDoErroDeEnvio(res.status, texto))
      let dado: unknown
      try {
        dado = JSON.parse(texto)
      } catch {
        throw new RespostaDeElementoInvalida('O servidor não confirmou o elemento enviado.')
      }
      return lerElementoCriado(dado, projectId)
    },
    retry: false,
    onSettled: (_d: unknown, _e: unknown, variables: EnvioDeElemento) => {
      void invalidarElementosDoProjeto(queryClient, variables.projectId)
    },
  }
}

/**
 * Exclusão (D6 b: a rota apaga só a linha da biblioteca, o arquivo fica). O `api-client` devolve TEXTO quando a
 * resposta não é JSON; o leitor recusa tudo que não for `{ success: true }`.
 */
export function exclusaoDeElemento(queryClient: QueryClient) {
  return {
    mutationFn: async ({ projectId, elementId }: ExclusaoDeElemento): Promise<void> => {
      lerExclusaoConfirmada(await api.delete<unknown>(`/api/projects/${projectId}/elements/${elementId}`))
    },
    retry: false,
    onSettled: (_d: unknown, _e: unknown, variables: ExclusaoDeElemento) => {
      void invalidarElementosDoProjeto(queryClient, variables.projectId)
    },
  }
}

export function useUploadProjectElement() {
  return useMutation(envioDeElemento(useQueryClient()))
}

export function useDeleteProjectElement() {
  return useMutation(exclusaoDeElemento(useQueryClient()))
}
