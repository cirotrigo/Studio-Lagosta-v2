"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  isActive?: boolean;
  createdAt: string;
  creditBalance?: {
    creditsRemaining: number;
  };
  _count?: {
    usageHistory: number;
  };
}

export interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

export interface UsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  includeUsageCount?: boolean;
}

export function useAdminUsers(params: UsersParams = {}) {
  return useQuery<UsersResponse>({
    queryKey: ['admin', 'users', params],
    queryFn: () => {
      const searchParams = new URLSearchParams({
        page: String(params.page || 1),
        pageSize: String(params.pageSize || 50),
        includeUsageCount: String(params.includeUsageCount || true),
      });

      if (params.search?.trim()) {
        searchParams.set('search', params.search.trim());
      }

      return api.get<UsersResponse>(`/api/admin/users?${searchParams}`);
    },
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  });
}

export function useUpdateUserCredits() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ userId, credits }: { userId: string; credits: number }) =>
      api.put(`/api/admin/users/${userId}/credits`, { credits }),
    onSuccess: (data, variables) => {
      toast({
        title: "Créditos atualizados",
        description: `Novo saldo: ${variables.credits}`
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar créditos",
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => api.delete(`/api/admin/users/${userId}`),
    onSuccess: () => {
      toast({ title: 'Usuário desativado' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao desativar usuário',
        description: error.message,
        variant: 'destructive'
      });
    },
  });
}

export function useActivateUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => api.post(`/api/admin/users/${userId}/activate`),
    onSuccess: () => {
      toast({ title: 'Usuário ativado' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao ativar usuário',
        description: error.message,
        variant: 'destructive'
      });
    },
  });
}

export function useEditUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      userId,
      name,
      email
    }: {
      userId: string;
      name: string;
      email: string;
    }) => api.put(`/api/admin/users/${userId}`, { name, email }),
    onSuccess: (data, variables) => {
      toast({
        title: 'Usuário atualizado',
        description: variables.email || variables.name
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast({
        title: 'Falha na atualização',
        description: error.message,
        variant: 'destructive'
      });
    },
  });
}

export function useSyncFromClerk() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (options: {
      syncUsers?: boolean;
      syncPlans?: boolean;
      setCredits?: boolean;
      overrideCredits?: number;
    }) => api.post('/api/admin/users/sync', options),
    onSuccess: (data) => {
      const syncData = data as {
        processed?: number;
        createdUsers?: number;
        createdBalances?: number;
        activeSubscriptions?: number;
        creditsRefreshed?: number;
      };
      const parts = [
        'Processed ' + syncData.processed,
        'created users ' + syncData.createdUsers,
        'balances ' + syncData.createdBalances,
      ];
      if (typeof syncData.activeSubscriptions === 'number') {
        parts.push('active subs ' + syncData.activeSubscriptions);
      }
      if (typeof syncData.creditsRefreshed === 'number') {
        parts.push('credits refreshed ' + syncData.creditsRefreshed);
      }
      const msg = parts.join(', ');

      toast({ title: 'Synced from Clerk', description: msg });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast({
        title: 'Falha na sincronização',
        description: error.message,
        variant: 'destructive'
      });
    },
  });
}