# Prompt para nova conversa — Konva-Only (Fase 9)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 9**: sync offline-first com push/pull incremental, detecção de conflitos e indicadores de status no UI.

## Pré-condição
- Fases 1, 2, 3, 4, 4.1, 5, 6, 6.1, 7, 7.1 e 8 concluídas, commitadas e documentadas.
- Antes de codar, validar o estado atual do repositório e os commits anteriores.

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar libs/frameworks e APIs, use `context7` para validar APIs atuais.

## Escopo estrito desta conversa (Fase 9)

### A) Push/Pull incremental com fila local
- Toda alteração local gera operação em `sync/queue.json`.
- Push com idempotência usando `operationId` único.
- Deduplicação de operações por chave `projectId:entityId:op`.
- Pull atualiza snapshot remoto sem perder alterações locais não sincronizadas.
- Reaproveitar sessão desktop existente para autenticação.
- Se `401`, tentar refresh antes de falhar; nunca descartar fila local por erro de auth.

### B) Detecção de conflito (`updatedAt + hash`)
- Comparar `updatedAt` local vs remoto.
- Calcular hash do documento para detectar divergência.
- Marcar documentos em conflito com status explícito.

### C) Estratégias de resolução de conflito
Implementar três estratégias:
- `keep-local`: mantém versão local, sobrescreve remoto no próximo push.
- `keep-remote`: descarta alteração local, aplica versão do servidor.
- `duplicate-local`: cria cópia local com sufixo, mantém remoto intacto.

### D) Estados de sync
Implementar estados no store:
- `idle`: sem operação pendente.
- `offline`: sem conexão, fila acumulando.
- `syncing`: operação de push/pull em andamento.
- `conflict`: um ou mais documentos em conflito aguardando resolução.
- `error`: falha que precisa de atenção.

### E) Indicadores de status no UI
- Badge/ícone de status de sync na sidebar ou topbar.
- Indicador visual por template/documento quando houver pendência ou conflito.
- Toast/notificação para erros de sync e conflitos detectados.
- Opção manual de forçar sync (`Sincronizar agora`).
- Dialog de resolução de conflito quando houver conflitos pendentes.

### F) Integração com fluxos existentes
- Não quebrar fluxo de aprovação/reedição da Fase 7.
- Não quebrar export single/batch da Fase 8.
- Manter funcionamento offline com edição normal.

## Arquivos alvo mínimos
- `desktop-app/src/stores/sync.store.ts` (novo)
- `desktop-app/electron/services/sync-service.ts` (novo)
- `desktop-app/electron/ipc/sync-handlers.ts` (expandir handlers existentes)
- `desktop-app/electron/services/json-storage.ts` (métodos de fila)
- `desktop-app/src/components/layout/SyncStatusIndicator.tsx` (novo)
- `desktop-app/src/components/sync/ConflictResolutionDialog.tsx` (novo)
- `desktop-app/src/hooks/use-sync-status.ts` (novo)

## Referência de endpoints web existentes
Verificar endpoints disponíveis no projeto web para:
- Listar templates remotos do projeto.
- Enviar/atualizar template para o servidor.
- Buscar versão remota de um template específico.
- Obter metadados de sync (updatedAt, hash).

## Estrutura de dados sugerida

### Operação de sync na fila
```ts
interface SyncOperation {
  operationId: string // uuid único
  projectId: number
  entityType: 'template' | 'generation' | 'settings'
  entityId: string
  op: 'create' | 'update' | 'delete'
  payload?: KonvaTemplateDocument // para create/update
  localUpdatedAt: string
  localHash: string
  createdAt: string
  retryCount: number
  lastError?: string
}
```

### Status de sync por projeto
```ts
interface ProjectSyncStatus {
  projectId: number
  state: 'idle' | 'offline' | 'syncing' | 'conflict' | 'error'
  lastSyncAt: string | null
  pendingCount: number
  conflictCount: number
  lastError?: string
}
```

### Conflito detectado
```ts
interface SyncConflict {
  id: string
  projectId: number
  entityType: 'template' | 'generation' | 'settings'
  entityId: string
  localVersion: { updatedAt: string; hash: string; document: KonvaTemplateDocument }
  remoteVersion: { updatedAt: string; hash: string; document: KonvaTemplateDocument }
  detectedAt: string
  resolution?: 'keep-local' | 'keep-remote' | 'duplicate-local'
  resolvedAt?: string
}
```

## Fora de escopo
- UX de simplicidade máxima (Fase 10)
- Grouping de layers (backlog)
- Histórico em árvore (backlog)
- Export SVG vetorial (backlog)

## Critérios de aceite (obrigatórios)
1. Edição offline funciona normalmente; alterações entram na fila.
2. Reconexão dispara sync automático ou manual sem perda de dados.
3. Conflitos são detectados corretamente e exibidos no UI.
4. Usuário consegue resolver conflito com as três estratégias.
5. Indicador de status reflete estado real do sync.
6. Push/pull não duplica operações (idempotência).
7. Erro de auth tenta refresh antes de falhar.
8. Typecheck sem regressão.

## Regras de execução
1. Implementar apenas Fase 9.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-9): sync offline-first com push/pull e resolucao de conflitos`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Testes manuais executados (cenários offline, conflito, resolução).
7. Riscos remanescentes.
8. Próximo passo sugerido (Fase 10).

Comece agora pela Fase 9.

---
