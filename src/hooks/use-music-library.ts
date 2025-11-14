import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { upload } from '@vercel/blob/client';

// Tipos
export interface FaixaMusica {
  id: number;
  name: string;
  artist: string | null;
  duration: number;
  blobUrl: string;
  blobSize: number;
  genre: string | null;
  mood: string | null;
  isActive: boolean;
  isPublic: boolean;
  thumbnailUrl: string | null;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface FiltrosMusica {
  busca?: string;
  genero?: string;
  humor?: string;
  duracaoMinima?: number;
  duracaoMaxima?: number;
  projectId?: number; // Filtro por projeto
}

export interface CriarMusicaData {
  arquivo: File;
  nome: string;
  artista?: string;
  genero?: string;
  humor?: string;
  duracao: number;
  projectId?: number; // Projeto vinculado
}

export interface AtualizarMusicaData {
  nome?: string;
  artista?: string;
  genero?: string;
  humor?: string;
  ativo?: boolean;
  publico?: boolean;
  thumbnailUrl?: string;
  projectId?: number;
}

// Chaves de Query
export const chavesMusica = {
  todas: ['biblioteca-musicas'] as const,
  listas: () => [...chavesMusica.todas, 'lista'] as const,
  lista: (filtros?: FiltrosMusica) => [...chavesMusica.listas(), filtros] as const,
  detalhes: () => [...chavesMusica.todas, 'detalhe'] as const,
  detalhe: (id: number) => [...chavesMusica.detalhes(), id] as const,
};

/**
 * Obter todas as faixas de música da biblioteca
 */
export function useBibliotecaMusicas() {
  return useQuery<FaixaMusica[]>({
    queryKey: chavesMusica.lista(),
    queryFn: () => api.get('/api/biblioteca-musicas'),
    staleTime: 5 * 60_000, // 5 minutos
    gcTime: 10 * 60_000, // 10 minutos
  });
}

/**
 * Obter uma faixa de música específica por ID
 */
export function useMusica(musicaId: number) {
  return useQuery<FaixaMusica>({
    queryKey: chavesMusica.detalhe(musicaId),
    queryFn: () => api.get(`/api/biblioteca-musicas/${musicaId}`),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    enabled: musicaId > 0,
  });
}

/**
 * Buscar biblioteca de músicas com filtros
 */
export function useBuscaMusicas(filtros?: FiltrosMusica) {
  return useQuery<FaixaMusica[]>({
    queryKey: chavesMusica.lista(filtros),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtros?.busca) params.append('busca', filtros.busca);
      if (filtros?.genero) params.append('genero', filtros.genero);
      if (filtros?.humor) params.append('humor', filtros.humor);
      if (filtros?.duracaoMinima) params.append('duracaoMinima', filtros.duracaoMinima.toString());
      if (filtros?.duracaoMaxima) params.append('duracaoMaxima', filtros.duracaoMaxima.toString());
      if (filtros?.projectId) params.append('projectId', filtros.projectId.toString());

      const queryString = params.toString();
      return api.get(`/api/biblioteca-musicas/buscar${queryString ? `?${queryString}` : ''}`);
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

/**
 * Fazer upload de uma nova faixa de música
 * Usa upload direto para Vercel Blob para contornar limite de 4.5MB do Next.js
 */
export function useEnviarMusica() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CriarMusicaData) => {
      console.log('📤 Enviando música (upload direto):', {
        nome: data.nome,
        artista: data.artista,
        genero: data.genero,
        humor: data.humor,
        projectId: data.projectId,
        duracao: data.duracao,
        tamanhoArquivo: data.arquivo.size,
      });

      // Passo 1: Upload direto para Vercel Blob (sem passar pelo Next.js)
      const fileName = `musicas/${Date.now()}-${data.arquivo.name}`;
      console.log('📤 Fazendo upload para Vercel Blob:', fileName);

      const blob = await upload(fileName, data.arquivo, {
        access: 'public',
        handleUploadUrl: '/api/biblioteca-musicas/upload-url',
      });

      console.log('✅ Upload concluído:', blob.url);

      // Passo 2: Salvar metadados no banco de dados
      console.log('📤 Salvando metadados no banco...');

      const response = await fetch('/api/biblioteca-musicas/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blobUrl: blob.url,
          blobSize: data.arquivo.size,
          name: data.nome,
          artist: data.artista,
          genre: data.genero,
          mood: data.humor,
          projectId: data.projectId,
          duration: data.duracao,
        }),
        credentials: 'include',
      });

      console.log('📥 Resposta da API confirm:', {
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        let errorMessage = 'Falha ao salvar música no banco';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
          console.error('❌ Erro da API:', error);
        } catch (e) {
          console.error('❌ Erro ao parsear resposta:', e);
          const text = await response.text();
          console.error('❌ Resposta do servidor:', text);
          errorMessage = `Erro ${response.status}: ${text.substring(0, 100)}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ Música salva com sucesso:', result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chavesMusica.listas() });
    },
  });
}

/**
 * Atualizar metadados da música
 */
export function useAtualizarMusica(musicaId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AtualizarMusicaData) =>
      api.patch(`/api/biblioteca-musicas/${musicaId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chavesMusica.listas() });
      queryClient.invalidateQueries({ queryKey: chavesMusica.detalhe(musicaId) });
    },
  });
}

/**
 * Deletar uma faixa de música (soft delete)
 */
export function useDeletarMusica() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (musicaId: number) =>
      api.delete(`/api/biblioteca-musicas/${musicaId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chavesMusica.listas() });
    },
  });
}
