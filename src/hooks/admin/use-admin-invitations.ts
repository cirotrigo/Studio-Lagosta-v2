"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";

export interface Invitation {
  id: string;
  emailAddress: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
}

export interface InvitationsResponse {
  invitations: Invitation[];
}

export function useAdminInvitations() {
  return useQuery<InvitationsResponse>({
    queryKey: ['admin', 'invitations'],
    queryFn: () => api.get('/api/admin/users/invitations'),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ email, name }: { email: string; name?: string }) =>
      api.post('/api/admin/users/invite', { email, name }),
    onSuccess: (data, variables) => {
      const status = (data as { status?: string })?.status || 'ok';
      if (status === 'invited') {
        toast({ title: 'Convite enviado', description: variables.email });
      } else if (status === 'exists') {
        toast({ title: 'Usuário existe', description: 'Usuário já está no sistema' });
      } else {
        toast({ title: 'Sucesso', description: 'Usuário processado' });
      }

      // Invalidate both invitations and users queries
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast({
        title: 'Falha no convite',
        description: error.message,
        variant: 'destructive'
      });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (invitationId: string) =>
      api.post(`/api/admin/users/invitations/${invitationId}/resend`),
    onSuccess: (data, invitationId) => {
      // We don't have the email here, so we'll get it from the cache
      const invitations = queryClient.getQueryData<InvitationsResponse>(['admin', 'invitations']);
      const invitation = invitations?.invitations.find(inv => inv.id === invitationId);

      toast({
        title: 'Convite reenviado',
        description: invitation?.emailAddress || 'Convite reenviado com sucesso'
      });

      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao reenviar',
        description: error.message,
        variant: 'destructive'
      });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (invitationId: string) =>
      api.post(`/api/admin/users/invitations/${invitationId}/revoke`),
    onSuccess: (data, invitationId) => {
      // We don't have the email here, so we'll get it from the cache
      const invitations = queryClient.getQueryData<InvitationsResponse>(['admin', 'invitations']);
      const invitation = invitations?.invitations.find(inv => inv.id === invitationId);

      toast({
        title: 'Convite revogado',
        description: invitation?.emailAddress || 'Convite revogado com sucesso'
      });

      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
    },
    onError: (error) => {
      toast({
        title: 'Falha ao revogar',
        description: error.message,
        variant: 'destructive'
      });
    },
  });
}