"use client";

import React from "react";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  MoreVertical,
  UserPlus,
  Mail,
  Calendar,
  CreditCard,
  Edit,
  Trash2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAdminUsers,
  useUpdateUserCredits,
  useDeactivateUser,
  useActivateUser,
  useEditUser,
  useSyncFromClerk,
  type User
} from "@/hooks/admin/use-admin-users";
import {
  useAdminInvitations,
  useInviteUser,
  useResendInvitation,
  useRevokeInvitation,
  type Invitation
} from "@/hooks/admin/use-admin-invitations";

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncUsersOpt, setSyncUsersOpt] = useState(true)
  const [syncPlansOpt, setSyncPlansOpt] = useState(true)
  const [setCreditsOpt, setSetCreditsOpt] = useState(true)
  const [overrideCredits, setOverrideCredits] = useState<string>("")
  const [confirmOpen, setConfirmOpen] = useState(false)

  // TanStack Query hooks
  const { data: usersData, isLoading: usersLoading } = useAdminUsers({
    page: 1,
    pageSize: 1000,
    search: searchTerm || undefined,
    includeUsageCount: true
  });

  const { data: invitationsData, isLoading: invitationsLoading } = useAdminInvitations();

  const updateCreditsMutation = useUpdateUserCredits();
  const deactivateUserMutation = useDeactivateUser();
  const activateUserMutation = useActivateUser();
  const editUserMutation = useEditUser();
  const syncFromClerkMutation = useSyncFromClerk();
  const inviteUserMutation = useInviteUser();
  const resendInvitationMutation = useResendInvitation();
  const revokeInvitationMutation = useRevokeInvitation();

  const users = usersData?.users || [];
  const pendingInvites = invitationsData?.invitations || [];
  const loading = usersLoading;
  const invLoading = invitationsLoading;

  const runSync = () => {
    const options = {
      syncUsers: syncUsersOpt,
      syncPlans: syncPlansOpt,
      setCredits: setCreditsOpt,
      ...(overrideCredits !== '' && Number.isFinite(Number(overrideCredits))
        ? { overrideCredits: Number(overrideCredits) }
        : {}
      )
    };

    syncFromClerkMutation.mutate(options, {
      onSuccess: () => {
        setSyncOpen(false);
        setConfirmOpen(false);
      }
    });
  };

  const promptAndUpdateCredits = async (userId: string, current?: number) => {
    const prefix = 'Definir novo saldo de crédito'
    const suffix = typeof current === 'number' ? ` (atual: ${current})` : ''
    const message = `${prefix}${suffix}:`
    const input = window.prompt(
      message,
      typeof current === 'number' ? String(current) : ''
    )
    if (input == null) return
    const value = Number(input)
    if (!Number.isFinite(value) || value < 0) {
      alert('Por favor, insira um número não negativo válido')
      return
    }
    updateCreditsMutation.mutate({ userId, credits: Math.floor(value) });
  }

  const handleDeactivateUser = (userId: string) => {
    if (!confirm("Tem certeza de que deseja desativar este usuário?")) return;
    deactivateUserMutation.mutate(userId);
  };

  const openEdit = (user: User) => {
    setEditId(user.id);
    setEditName(user.name || "");
    setEditEmail(user.email || "");
    setEditOpen(true);
  }

  const saveEdit = () => {
    if (!editId) return;
    editUserMutation.mutate(
      { userId: editId, name: editName, email: editEmail },
      {
        onSuccess: () => {
          setEditOpen(false);
          setEditId(null);
        }
      }
    );
  }

  const handleInviteUser = () => {
    if (!inviteEmail) return;
    inviteUserMutation.mutate(
      { email: inviteEmail, name: inviteName },
      {
        onSuccess: () => {
          setInviteOpen(false);
          setInviteEmail('');
          setInviteName('');
        }
      }
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Usuários</h1>
          <p className="text-muted-foreground mt-2">Gerenciar todos os usuários registrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={()=> setSyncOpen(true)}>Sincronizar do Clerk</Button>
          <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-foreground">Sincronizar do Clerk</DialogTitle>
                <DialogDescription className="text-muted-foreground">Escolha o escopo e como aplicar créditos.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <input id="syncUsers" type="checkbox" checked={syncUsersOpt} onChange={(e)=> setSyncUsersOpt(e.target.checked)} />
                  <Label htmlFor="syncUsers">Sincronizar usuários (criar/atualizar e saldo inicial)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input id="syncPlans" type="checkbox" checked={syncPlansOpt} onChange={(e)=> setSyncPlansOpt(e.target.checked)} />
                  <Label htmlFor="syncPlans">Sincronizar planos/assinaturas</Label>
                </div>
                <div className="ml-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <input id="setCredits" type="checkbox" checked={setCreditsOpt} disabled={!syncPlansOpt} onChange={(e)=> setSetCreditsOpt(e.target.checked)} />
                    <Label htmlFor="setCredits">Aplicar créditos do plano</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="mb-1 block">Sobrescrever créditos (opcional)</Label>
                      <Input type="number" min={0} placeholder="ex.: 500" value={overrideCredits} onChange={(e)=> setOverrideCredits(e.target.value)} />
                      <p className="text-xs text-muted-foreground mt-1">Se informado, aplica este valor a todos com plano ativo.</p>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={()=> setSyncOpen(false)}>Cancelar</Button>
                <Button disabled={syncFromClerkMutation.isPending} onClick={()=> setConfirmOpen(true)}>Sincronizar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Second confirmation dialog */}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar sincronização</AlertDialogTitle>
                <AlertDialogDescription>
                  <div className="space-y-2 text-left">
                    <p className="text-sm">Você está prestes a iniciar uma sincronização com os seguintes efeitos:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {syncUsersOpt && (<li>Criar/atualizar usuários e garantir saldos (0 por padrão).</li>)}
                      {!syncUsersOpt && (<li>Não irá criar/atualizar usuários nem saldos.</li>)}
                      {syncPlansOpt && (<li>Consultar assinaturas no Clerk e vincular aos planos locais.</li>)}
                      {!syncPlansOpt && (<li>Não irá consultar assinaturas/planos.</li>)}
                      {syncPlansOpt && setCreditsOpt && overrideCredits !== '' && Number.isFinite(Number(overrideCredits)) && (
                        <li>Aplicar {Number(overrideCredits)} créditos a todos os usuários com plano ativo.</li>
                      )}
                      {syncPlansOpt && setCreditsOpt && !(overrideCredits !== '' && Number.isFinite(Number(overrideCredits))) && (
                        <li>Aplicar créditos conforme mapeamento dos planos (tabela Plans).</li>
                      )}
                      {syncPlansOpt && !setCreditsOpt && (
                        <li>Não irá alterar créditos, mesmo com plano ativo.</li>
                      )}
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={runSync} disabled={syncFromClerkMutation.isPending}>
                  {syncFromClerkMutation.isPending ? 'Sincronizando...' : 'Confirmar' }
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90">
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-foreground">Convidar Usuário</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Envie um convite para participar via e-mail. Se o usuário já existir, garantiremos que ele apareça na lista.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">E-mail</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="user@example.com"
                    className="pl-3"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteName">Nome (opcional)</Label>
                  <Input
                    id="inviteName"
                    placeholder="Jane Doe"
                    className="pl-3"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setInviteOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="bg-primary hover:bg-primary/90"
                  onClick={handleInviteUser}
                  disabled={inviteUserMutation.isPending}
                >
                  {inviteUserMutation.isPending ? 'Enviando...' : 'Enviar Convite'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users">Todos os Usuários</TabsTrigger>
          <TabsTrigger value="invites">Convites Pendentes</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <DataTable
            data={users as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "user",
                header: "Usuário",
                render: (item: unknown) => {
                  const user = item as User;
                  return (
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {(user.name ? user.name.charAt(0) : (user.email || '').charAt(0)).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{user.name || "Sem nome"}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  );
                },
              },
              {
                key: "credits",
                header: "Créditos",
                render: (item: unknown) => {
                  const user = item as User;
                  return (
                    <div className="flex items-center space-x-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">
                        {user.creditBalance?.creditsRemaining || 0}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "usage",
                header: "Uso",
                render: (item: unknown) => {
                  const user = item as User;
                  return (
                    <span className="text-muted-foreground">
                      {user._count?.usageHistory || 0} operações
                    </span>
                  );
                },
              },
              {
                key: "createdAt",
                header: "Entrou",
                render: (item: unknown) => {
                  const user = item as User;
                  return (
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                render: (item: unknown) => {
                  const user = item as User;
                  return (
                    user.isActive !== false ? (
                      <Badge variant="outline" className="border-green-500 text-green-500">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="border-gray-500 text-gray-400">Inativo</Badge>
                    )
                  );
                },
              },
              {
                key: "actions",
                header: "Ações",
                className: "text-right",
                render: (item: unknown) => {
                  const user = item as User;
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(user)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar Usuário
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => promptAndUpdateCredits(user.id, user.creditBalance?.creditsRemaining)}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Ajustar Créditos
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-gray-300 hover:text-white" onClick={() => { if (user.email) window.location.href = `mailto:${user.email}` }}>
                          <Mail className="h-4 w-4 mr-2" />
                          Enviar E-mail
                        </DropdownMenuItem>
                        {user.isActive === false ? (
                          <DropdownMenuItem
                            className="text-green-400 hover:text-green-300"
                            onClick={() => activateUserMutation.mutate(user.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Ativar Usuário
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-red-400 hover:text-red-300"
                            onClick={() => handleDeactivateUser(user.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Desativar Usuário
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                },
              },
            ]}
            searchable={true}
            searchPlaceholder="Pesquisar usuários..."
            searchKeys={["name", "email"]}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            loading={loading}
            countLabel="usuários"
            emptyMessage="Nenhum usuário encontrado"
          />
        </TabsContent>

        <TabsContent value="invites">
          <DataTable
            data={pendingInvites as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "emailAddress",
                header: "E-mail",
                render: (item: unknown) => {
                  const inv = item as Invitation;
                  return <span className="text-foreground">{inv.emailAddress}</span>;
                },
              },
              {
                key: "status",
                header: "Status",
                render: (item: unknown) => {
                  const inv = item as Invitation;
                  const status = (inv.status || '').toLowerCase()
                  const badgeClass = status === 'accepted' ? 'bg-green-500/20 text-green-300' : status === 'revoked' ? 'bg-red-500/20 text-red-300' : status === 'expired' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/20 text-blue-300'
                  return (
                    <span className={`px-2 py-1 rounded text-xs ${badgeClass}`}>
                      {status || 'pending'}
                    </span>
                  );
                },
              },
              {
                key: "createdAt",
                header: "Convidado",
                render: (item: unknown) => {
                  const inv = item as Invitation;
                  return (
                    <span className="text-muted-foreground">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : '-'}
                    </span>
                  );
                },
              },
              {
                key: "expiresAt",
                header: "Expira",
                render: (item: unknown) => {
                  const inv = item as Invitation;
                  return (
                    <span className="text-muted-foreground">
                      {inv.expiresAt ? new Date(inv.expiresAt).toLocaleString() : '-'}
                    </span>
                  );
                },
              },
              {
                key: "actions",
                header: "Ações",
                className: "text-right",
                render: (item: unknown) => {
                  const inv = item as Invitation;
                  const status = (inv.status || '').toLowerCase()
                  const disabled = status === 'accepted' || status === 'revoked' || status === 'expired'
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled || resendInvitationMutation.isPending}
                        onClick={() => resendInvitationMutation.mutate(inv.id)}
                      >
                        {resendInvitationMutation.isPending ? 'Reenviando...' : 'Reenviar'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled || revokeInvitationMutation.isPending}
                        onClick={() => {
                          if (!confirm('Revogar este convite?')) return;
                          revokeInvitationMutation.mutate(inv.id);
                        }}
                      >
                        {revokeInvitationMutation.isPending ? 'Revogando...' : 'Revogar'}
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            searchable={false}
            loading={invLoading}
            countLabel="convites"
            emptyMessage="Nenhum convite pendente"
            headerContent={
              <Button
                variant="outline"
                onClick={() => {/* refresh will happen automatically through TanStack Query */}}
                disabled={invLoading}
              >
                {invLoading ? 'Atualizando...' : 'Atualizar'}
              </Button>
            }
          />
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={(o)=>{ setEditOpen(o); if(!o){ setEditId(null) } }}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Usuário</DialogTitle>
            <DialogDescription className="text-gray-400">Atualizar informações do perfil do usuário.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName" className="text-gray-300">Nome</Label>
              <Input id="editName" className="bg-gray-900 border-gray-700 text-white" value={editName} onChange={(e)=>setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail" className="text-gray-300">E-mail</Label>
              <Input id="editEmail" type="email" className="bg-gray-900 border-gray-700 text-white" value={editEmail} onChange={(e)=>setEditEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={()=>setEditOpen(false)}>Cancelar</Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={saveEdit}
              disabled={editUserMutation.isPending}
            >
              {editUserMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}