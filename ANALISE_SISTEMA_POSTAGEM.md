# Studio Lagosta: Análise do Sistema de Postagem e Agendamento

## Resumo Executivo
Studio Lagosta v2 possui um sistema completo de postagem e agendamento para redes sociais com integração via webhook Zapier para Instagram. O sistema suporta postagem imediata, posts agendados e séries recorrentes. Posts são armazenados no banco de dados e executados via cron job que dispara webhooks Zapier para publicação real.

---

## 1. SCHEMA DO BANCO DE DADOS

### Modelos Principais de Redes Sociais

#### **SocialPost** (Modelo principal para posts)
- **Localização**: `prisma/schema.prisma` (linhas 854-908)
- **Campos**:
  - `id`: Identificador único (cuid)
  - `projectId`: Link para projeto
  - `generationId`: Link para criativo/geração
  - `userId`: Link para usuário
  - `postType`: Enum (POST, STORY, REEL, CAROUSEL)
  - `caption`: Texto do post (máx 2200 caracteres)
  - `mediaUrls`: Array de URLs de criativos
  - `altText`: Array de texto alternativo para acessibilidade
  - `firstComment`: Comentário auto-postado
  - `scheduleType`: Enum (IMMEDIATE, SCHEDULED, RECURRING)
  - `scheduledDatetime`: Quando o post deve ser publicado
  - `recurringConfig`: Objeto JSON com configurações de recorrência
  - `status`: Enum (DRAFT, SCHEDULED, PROCESSING, SENT, FAILED)
  - `sentAt`: Quando foi enviado com sucesso
  - `failedAt`: Quando falhou
  - `errorMessage`: Detalhes do erro
  - `webhookResponse`: Resposta do Zapier
  - `zapierWebhookUrl`: URL específica do webhook para este post
  - `isRecurring`: Flag booleana
  - `parentPostId`: Para posts filhos de série recorrente
  - `originalScheduleType`: Rastreia tipo original

**Relações**:
- `Project` (pai)
- `Generation` (opcional, o criativo usado)
- `parentPost` (auto-referência para recorrência)
- `childPosts` (auto-referência para recorrência)
- `retries` (array PostRetry)
- `logs` (array PostLog)

#### **PostRetry** (Rastreamento de tentativas)
- **Localização**: `prisma/schema.prisma` (linhas 910-925)
- **Campos**:
  - `id`: Identificador único
  - `postId`: Link para post social
  - `attemptNumber`: Qual tentativa de retry
  - `scheduledFor`: Quando o retry deve executar
  - `status`: RetryStatus (PENDING, PROCESSING, SUCCESS, FAILED)
  - `errorMessage`: Por que falhou
  - `executedAt`: Quando foi executado de fato

#### **PostLog** (Trilha de auditoria)
- **Localização**: `prisma/schema.prisma` (linhas 927-940)
- **Campos**:
  - `id`: Identificador único
  - `postId`: Link para post social
  - `event`: PostLogEvent (CREATED, SCHEDULED, SENT, FAILED, RETRIED, CANCELLED, EDITED)
  - `message`: Descrição legível
  - `metadata`: JSON para contexto adicional
  - `createdAt`: Quando o evento ocorreu

### Modelos de Suporte

#### **Generation** (Saídas de Criativos/Templates)
- **Localização**: `prisma/schema.prisma` (linhas 74-99)
- **Campos Chave**:
  - `id`, `templateId`, `projectId`
  - `resultUrl`: URL final da imagem/vídeo
  - `status`: GenerationStatus (PROCESSING, COMPLETED, FAILED)
  - `fieldValues`: JSON dos valores de campos do template
  - `googleDriveFileId`, `googleDriveBackupUrl`: Locais de backup
  - `socialPosts`: Array de posts usando este criativo

#### **Template** (Templates de design)
- **Localização**: `prisma/schema.prisma` (linhas 307-332)
- **Campos Chave**:
  - `id`, `projectId`
  - `name`, `type`: TemplateType (STORY, FEED, SQUARE)
  - `dimensions`: Tamanho do canvas
  - `designData`: JSON contendo configuração de design
  - `dynamicFields`: Array JSON de campos editáveis
  - `tags`, `category`: Para descoberta
  - `isPublic`, `isPremium`: Controle de acesso
  - `Generation`: Array de saídas deste template

#### **Project** (Container de conta)
- **Localização**: `prisma/schema.prisma` (linhas 157-196)
- **Campos Chave**:
  - `id`, `name`, `description`
  - `instagramAccountId`: OBRIGATÓRIO para postagem - identificador usado no roteamento Zapier
  - `instagramUsername`: Nome de exibição
  - `instagramProfileUrl`: Link do perfil
  - `googleDriveFolderId`, `googleDriveImagesFolderId`, `googleDriveVideosFolderId`: Armazenamento de mídia
  - `makeWebhookAnalyzeUrl`, `makeWebhookCreativeUrl`: URLs de webhook para Make.com
  - `SocialPost`: Array de posts para esta conta

#### **Page** (Páginas de template)
- **Localização**: `prisma/schema.prisma` (linhas 334-350)
- **Propósito**: Suporte a templates multipágina
- **Campos Chave**:
  - `templateId`, `order`: Ordenação de páginas
  - `width`, `height`: Dimensões
  - `layers`: JSON de camadas de design
  - `background`: Cor de fundo

### Enums

```typescript
enum PostType { POST, STORY, REEL, CAROUSEL }
enum PostStatus { DRAFT, SCHEDULED, PROCESSING, SENT, FAILED }
enum ScheduleType { IMMEDIATE, SCHEDULED, RECURRING }
enum RecurrenceFrequency { DAILY, WEEKLY, MONTHLY }
enum PostLogEvent { CREATED, SCHEDULED, SENT, FAILED, RETRIED, CANCELLED, EDITED }
enum RetryStatus { PENDING, PROCESSING, SUCCESS, FAILED }
enum GenerationStatus { PROCESSING, COMPLETED, FAILED }
enum TemplateType { STORY, FEED, SQUARE }
```

---

## 2. ROTAS DE API

### API de Gerenciamento de Posts

#### **POST /api/projects/[projectId]/posts** (Criar post)
- **Localização**: `/src/app/api/projects/[projectId]/posts/route.ts`
- **Método**: POST
- **Autenticação**: Obrigatória (Clerk)
- **Validação**:
  - Verifica propriedade do projeto
  - Requer conta Instagram configurada
  - Valida dados do post com schema Zod
  - Garante que mídia existe e pertence ao projeto
- **Fluxo**:
  1. Analisa IDs de geração e busca URLs
  2. Usa PostScheduler para criar post
  3. Se IMMEDIATE: Envia para Zapier imediatamente
  4. Se SCHEDULED: Armazena para cron job
  5. Se RECURRING: Cria série recorrente
- **Resposta**: `{ success: true, postId: string }`

#### **GET /api/projects/[projectId]/posts** (Listar posts)
- **Localização**: `/src/app/api/projects/[projectId]/posts/route.ts`
- **Método**: GET
- **Retorna**: Array de objetos SocialPost com detalhes de Generation
- **Inclui**: Nome do template e URLs de resultado

#### **GET /api/projects/[projectId]/posts/[postId]** (Obter post único)
- **Localização**: `/src/app/api/projects/[projectId]/posts/[postId]/route.ts`
- **Retorna**: SocialPost completo com dados de Generation

#### **PUT /api/projects/[projectId]/posts/[postId]** (Atualizar post)
- **Localização**: `/src/app/api/projects/[projectId]/posts/[postId]/route.ts`
- **Campos Editáveis**:
  - `postType`, `caption`
  - `scheduleType`, `scheduledDatetime`
  - `recurringConfig` (frequency, daysOfWeek, time, endDate)
  - `altText`, `firstComment`
- **Nota**: Atualiza `recurringFrequency`, `recurringDaysOfWeek`, `recurringTime`, `recurringEndDate` separadamente no BD

#### **DELETE /api/projects/[projectId]/posts/[postId]** (Deletar post)
- **Localização**: `/src/app/api/projects/[projectId]/posts/[postId]/route.ts`
- **Comportamento**: Deleta post e todos retries/logs relacionados (CASCADE)

#### **GET /api/projects/[projectId]/posts/calendar** (Visualização de calendário)
- **Localização**: `/src/app/api/projects/[projectId]/posts/calendar/route.ts`
- **Parâmetros de Query**: `startDate`, `endDate` (strings ISO)
- **Retorna**: Posts agendados no intervalo de datas OU já enviados no intervalo
- **Filtros**:
  - Posts agendados dentro da janela
  - Posts já enviados dentro da janela

### APIs de Suporte

#### **PATCH /api/projects/[projectId]/instagram** (Configurar conta)
- **Localização**: `/src/app/api/projects/[projectId]/instagram/route.ts`
- **Campos**:
  - `instagramAccountId`: Identificador único obrigatório para roteamento
  - `instagramUsername`: Nome de exibição opcional
  - `instagramProfileUrl`: Link de perfil opcional
- **Propósito**: Configurar para qual conta Instagram os posts vão

#### **GET /api/projects/[projectId]/creatives** (Listar gerações)
- **Localização**: `/src/app/api/projects/[projectId]/creatives/route.ts`
- **Retorna**: Array de gerações com templateName e resultUrl
- **Usado por**: Sistema de upload de mídia no composer de posts

#### **GET /api/projects/[projectId]/generations** (Gerações paginadas)
- **Localização**: `/src/app/api/projects/[projectId]/generations/route.ts`
- **Parâmetros de Query**: `page`, `pageSize`, `createdBy`
- **Retorna**: Gerações paginadas com metadados
- **Inclui**: Detalhes de template e timestamps

#### **POST /api/templates** (Criar template)
- **Localização**: `/src/app/api/templates/route.ts`
- **Comportamento**: Cria template E automaticamente cria primeira Page em transação
- **Propósito**: Usado pelo editor de design para salvar templates

---

## 3. COMPONENTES DO FRONTEND

### Criação e Edição de Posts

#### **PostComposer** (Dialog principal de criação de posts)
- **Localização**: `/src/components/posts/post-composer.tsx` (370 linhas)
- **Funcionalidades**:
  - Seletor de tipo de post (POST, STORY, REEL, CAROUSEL)
  - Sistema de upload de mídia
  - Editor de legenda (limite 2200 caracteres com contador)
  - Campo opcional de primeiro comentário
  - Seletor de tipo de agendamento:
    - IMMEDIATE (postar agora, botão vermelho)
    - SCHEDULED (com seletor de data/hora)
    - RECURRING (com configuração de recorrência)
  - Validação de formulário com Zod
  - Integração com hook useSocialPosts
- **Props**:
  - `projectId`: number
  - `open`: boolean
  - `onClose`: function
  - `initialData`: dados parciais do formulário para edição
- **Validação**:
  - CAROUSEL: 2-10 imagens
  - STORY/REEL/POST: exatamente 1 mídia
  - SCHEDULED: apenas datetime futuro
  - RECURRING: requer configuração

#### **SchedulePicker** (Seletor de data/hora)
- **Localização**: `src/components/posts/schedule-picker.tsx` (presumivelmente)
- **Funcionalidades**: Seleção de data e hora para posts agendados

#### **RecurringConfig** (Configurações de recorrência)
- **Localização**: `src/components/posts/recurring-config.tsx` (presumivelmente)
- **Funcionalidades**:
  - Frequência: DAILY, WEEKLY, MONTHLY
  - Dias da semana: Para frequência semanal
  - Horário: Hora do agendamento
  - Data final: Final opcional da recorrência

#### **MediaUploadSystem** (Seleção de mídia multi-fonte)
- **Localização**: `src/components/posts/media-upload-system.tsx` (presumivelmente)
- **Fontes**: Gerações, Google Drive, uploads
- **Funcionalidades**: Previews de miniaturas, multi-seleção

### Visualizações de Agenda/Calendário

#### **AgendaCalendarView** (Calendário principal)
- **Localização**: `/src/components/agenda/calendar/agenda-calendar-view.tsx` (103 linhas)
- **Funcionalidades**:
  - Visualização de calendário mensal
  - Mostra posts agendados nas datas
  - Integra com sidebar de canais
  - Usa hook useAgendaPosts

#### **CalendarHeader** (Navegação do mês e ações)
- **Localização**: `/src/components/agenda/calendar/calendar-header.tsx` (266 linhas)
- **Funcionalidades**:
  - Toggle de visualização mês/semana/dia
  - Navegação anterior/próxima
  - Botão "Hoje"
  - Seletor de projeto
  - Botão criar post (verifica configuração Instagram)
  - Exibição de status do canal
  - Visualizar métricas/ícones

#### **CalendarGrid** (Renderização da grade do calendário)
- **Localização**: `/src/components/agenda/calendar/calendar-grid.tsx` (147 linhas)
- **Funcionalidades**: Renderiza células do calendário com posts

#### **CalendarDayCell** (Dia individual)
- **Localização**: `/src/components/agenda/calendar/calendar-day-cell.tsx` (74 linhas)
- **Mostra**: Data e posts para aquele dia

#### **PostMiniCard** (Preview compacto de post no calendário)
- **Localização**: `/src/components/agenda/calendar/post-mini-card.tsx` (94 linhas)
- **Mostra**: Tipo de post, status, legenda parcial

#### **PostPreviewModal** (Detalhes completos do post)
- **Localização**: `/src/components/agenda/post-actions/post-preview-modal.tsx` (248 linhas)
- **Mostra**: Detalhes completos do post com previews de imagem
- **Ações**: Editar, deletar, reagendar, publicar agora

#### **RescheduleDialog** (Mudar horário agendado)
- **Localização**: `/src/components/agenda/post-actions/reschedule-dialog.tsx` (179 linhas)
- **Funcionalidades**: Seletor de datetime para reagendamento

#### **ChannelsList** (Seletor de projeto)
- **Localização**: `/src/components/agenda/channels-sidebar/channels-list.tsx` (190 linhas)
- **Mostra**: Projetos disponíveis com status do Instagram

#### **InstagramAccountConfig** (Card de configuração)
- **Localização**: `/src/components/projects/instagram-account-config.tsx` (207 linhas)
- **Campos**:
  - Instagram Account ID (obrigatório) - Este vai no webhook do Zapier
  - Username (opcional) - Para exibição
  - Profile URL (opcional) - Para referência
- **Inclui**: Seção de ajuda explicando roteamento Zapier

---

## 4. HOOKS CUSTOMIZADOS

### Hooks de Busca de Dados

#### **useSocialPosts(projectId)**
- **Localização**: `/src/hooks/use-social-posts.ts`
- **Exporta**:
  - `postsQuery`: Obter todos posts do projeto
  - `usePost(postId)`: Obter post único
  - `createPost`: Mutation para criar post
  - `updatePost`: Mutation para atualizar post
  - `deletePost`: Mutation para deletar post
- **Query Keys**: `['social-posts', projectId]`, `['social-post', postId]`
- **Invalidação**: Também invalida `['agenda-posts', projectId]` nas mutations

#### **useAgendaPosts({ projectId, startDate, endDate })**
- **Localização**: `/src/hooks/use-agenda-posts.ts`
- **Retorna**: Posts no intervalo de datas para calendário
- **Query Key**: `['agenda-posts', projectId, startDate, endDate]`
- **Stale Time**: 30 segundos

#### **usePostActions(projectId)**
- **Localização**: `/src/hooks/use-post-actions.ts`
- **Mutations**:
  - `publishNow(postId)`: Mudar para agendamento IMMEDIATE
  - `reschedulePost({ postId, scheduledDatetime })`: Reagendar para nova data
  - `deletePost(postId)`: Deletar post
  - `duplicatePost(postId)`: Clonar post para próximo dia

---

## 5. SISTEMA DE POSTAGEM E AGENDAMENTO

### Classe PostScheduler
- **Localização**: `/src/lib/posts/scheduler.ts` (340 linhas)
- **Responsabilidade**: Criar e enviar posts
- **Métodos Chave**:

#### **createPost(data)**
- Cria post no banco de dados
- Define status baseado no scheduleType
- Registra criação em log
- Se IMMEDIATE: Chama sendToZapier imediatamente
- Se RECURRING: Chama createRecurringSeries
- Se SCHEDULED: Aguarda cron job

#### **sendToZapier(postId)**
- Busca post com detalhes do projeto
- Valida conta Instagram configurada
- Constrói payload:
  ```javascript
  {
    post_type: 'post'|'story'|'reel'|'carousel',
    caption: string,
    media_urls: string[],
    alt_text: string[],
    first_comment: string,
    instagram_account_id: string,  // CHAVE - usado pelo Zapier para roteamento
    instagram_username: string,
    metadata: {
      post_id: string,
      project_id: number,
      project_name: string,
      user_id: string
    }
  }
  ```
- **ANTES** de enviar: Deduz créditos para feature `social_media_post`
- Envia POST para URL do webhook Zapier (de env: `ZAPIER_WEBHOOK_URL`)
- Em sucesso:
  - Atualiza status para SENT
  - Armazena webhookResponse
  - Registra evento enviado em log
- Em falha:
  - Atualiza status para FAILED
  - Armazena mensagem de erro
  - Agenda retry (5 minutos)

#### **createRecurringSeries(parentPost)**
- Gera ocorrências baseadas na frequência:
  - DAILY: Todo dia no horário especificado
  - WEEKLY: Dias específicos da semana no horário
  - MONTHLY: Primeiro dia do mês no horário
- Cria posts filhos com ScheduleType.SCHEDULED
- Define isRecurring=true, originalScheduleType=RECURRING
- Máximo 365 ocorrências ou até endDate

#### **generateOccurrences(frequency, time, daysOfWeek, endDate)**
- Retorna array de objetos Date para recorrência
- Máximo gera 365 datas

#### **scheduleRetry(postId, attemptNumber)**
- Cria registro PostRetry
- Define scheduledFor para 5 minutos a partir de agora
- Máximo 3 tentativas de retry

#### **createLog(postId, event, message, metadata)**
- Cria entrada de auditoria PostLog

### Classe PostExecutor
- **Localização**: `/src/lib/posts/executor.ts` (120 linhas)
- **Responsabilidade**: Executar jobs agendados/retry do cron
- **Métodos Chave**:

#### **executeScheduledPosts()**
- Encontra posts na janela de tempo:
  - Status: SCHEDULED
  - scheduledDatetime: agora -1 min a +1 min
- Tenta enviar cada um via sendToZapier
- Retorna: `{ processed, success, failed }`

#### **executeRetries()**
- Encontra registros PostRetry pendentes onde scheduledFor <= agora
- Atualiza status para PROCESSING, define executedAt
- Tenta enviar post via sendToZapier
- Em sucesso: Marca retry como SUCCESS
- Em falha:
  - Marca retry como FAILED
  - Se attemptNumber < 3: Agenda próximo retry
- Retorna: `{ processed }`

### Cron Job
- **Localização**: `/src/app/api/cron/posts/route.ts`
- **Endpoint**: `GET /api/cron/posts`
- **Autenticação**: Verifica `Authorization: Bearer {CRON_SECRET}`
- **Trigger**: Vercel Cron (tipicamente a cada minuto)
- **Execução**:
  1. Chama executor.executeScheduledPosts()
  2. Chama executor.executeRetries()
  3. Retorna resultados
- **Resposta**:
  ```json
  {
    "success": true,
    "scheduled": { "processed": N, "success": N, "failed": N },
    "retries": { "processed": N }
  }
  ```

---

## 6. INTEGRAÇÃO COM WEBHOOK ZAPIER

### Configuração do Webhook
- **Endpoint**: Armazenado na variável de ambiente `ZAPIER_WEBHOOK_URL`
- **Método**: POST
- **Content-Type**: application/json
- **Autenticação**: Nenhuma (Zapier gera URL única)

### Estrutura do Payload do Webhook
```javascript
{
  // Conteúdo do post
  post_type: "post" | "story" | "reel" | "carousel",
  caption: string (máx 2200 caracteres),
  media_urls: string[], // URLs para imagens/vídeos
  alt_text: string[],
  first_comment: string, // Auto-comentário opcional

  // ROTEAMENTO DE CONTA INSTAGRAM (PARTE CHAVE)
  instagram_account_id: string, // ID configurado no projeto
  instagram_username: string,   // Para exibição

  // Metadados para rastreamento
  metadata: {
    post_id: string,        // Para rastrear de volta ao BD
    project_id: number,
    project_name: string,
    user_id: string
  }
}
```

### Como Funciona o Roteamento Zapier
1. **Por Projeto**: Cada projeto tem ID de Conta Instagram único definido no BD
2. **No Zapier**: Usuário cria filtros em `instagram_account_id`
3. **Exemplo**:
   - Projeto "By Rock" tem ID "by.rock"
   - Filtro Zapier: `instagram_account_id = "by.rock"`
   - Roteia para Buffer/Instagram nativo com credenciais "by.rock"
4. **Multi-Conta**: Múltiplos projetos → Múltiplos IDs → Múltiplos filtros Zapier

### Tratamento de Resposta
- **Sucesso**: Qualquer resposta 2xx aceita
- **Resposta Armazenada**: campo webhookResponse em SocialPost
- **Falha**: Qualquer não-2xx dispara mecanismo de retry

---

## 7. STATUS DE IMPLEMENTAÇÃO ATUAL

### IMPLEMENTADO E COMPLETO
✅ Schema de banco de dados com todos modelos post/schedule/retry
✅ API CRUD de posts (criar, ler, atualizar, deletar)
✅ Três tipos de agendamento: IMMEDIATE, SCHEDULED, RECURRING
✅ Geração de recorrência (DAILY, WEEKLY, MONTHLY)
✅ Integração webhook Zapier
✅ Dedução de créditos para feature de post
✅ Mecanismo de retry (até 3 tentativas, intervalos de 5 min)
✅ Visualização de calendário para posts agendados
✅ UI composer de posts com controles completos
✅ Configuração de conta Instagram por projeto
✅ Seleção de mídia das gerações
✅ Cron job para executar posts agendados
✅ Tratamento de erros e logging
✅ Rastreamento de status de posts
✅ Trilha de auditoria (PostLog)

### PARCIALMENTE COMPLETO / PRECISA VERIFICAÇÃO
⚠️ Armazenamento RecurringConfig no BD - parece armazenar em campo JSON `recurringConfig` mas endpoint PUT referencia campos separados
⚠️ Endpoint de atualização - pode ter inconsistência em como config recorrente é armazenada vs atualizada

### FALTANDO / INCOMPLETO
❌ Integração com API nativa do Instagram (atualmente apenas baseado em webhook)
❌ Postagem direta no Instagram (depende de Zapier/Buffer)
❌ UI de postagem em lote
❌ Analíticas/métricas de posts
❌ Auto-retry após timeout de webhook
❌ Biblioteca de templates/rascunhos de posts
❌ UI de vinculação de conta de redes sociais (apenas configuração manual)
❌ Suporte a múltiplas plataformas (apenas Instagram)
❌ Auto-salvamento de rascunhos de posts
❌ Preview de posts em diferentes dispositivos

---

## 8. FLUXO COMPLETO DO USUÁRIO

### Fase de Configuração do Projeto
1. Usuário cria projeto no dashboard (`/projects`)
2. Navega para configurações do projeto
3. Configura Instagram Account ID (ex: "by.rock")
4. Insere username e URL do perfil (opcional)
5. Salva configuração
6. Sistema armazena em `Project.instagramAccountId`

### Fase de Template e Geração de Criativos
1. Usuário cria template no editor de design
   - POST cria template + primeira Page em transação
   - Armazena designData JSON
2. Usuário gera criativos a partir do template
   - Sistema cria registros Generation
   - Armazena resultUrl apontando para imagem/vídeo
   - Pode fazer upload para Google Drive para backup

### Fase de Criação de Post
1. Usuário abre página Agenda (`/agenda`)
2. Seleciona projeto da sidebar (verifica config Instagram)
3. Clica no botão "Criar Post"
4. **Dialog PostComposer abre**:
   - Seleciona tipo de post (POST/STORY/REEL/CAROUSEL)
   - Seleciona mídia (1 para único, 2-10 para carousel)
   - Escreve legenda (até 2200 caracteres)
   - Opcionalmente adiciona primeiro comentário
   - Escolhe tipo de agendamento:
     - **IMMEDIATE**: Envia agora
     - **SCHEDULED**: Escolhe data/hora no futuro
     - **RECURRING**: Escolhe frequência, dias, horário, data final

### Submissão de Post
1. Formulário valida todos campos
2. `createPost.mutateAsync()` chama API
3. API valida propriedade do projeto e config Instagram
4. API busca dados de geração (resultUrl, metadata)
5. PostScheduler.createPost() executa:
   - Cria registro SocialPost
   - Registra evento "CREATED" em log
   - **Se IMMEDIATE**:
     - Chama sendToZapier imediatamente
     - Deduz créditos
     - Atualiza status para SENT ou FAILED
   - **Se SCHEDULED**:
     - Define status para SCHEDULED
     - Cron processará no horário agendado
   - **Se RECURRING**:
     - Chama createRecurringSeries
     - Gera ocorrências
     - Cria posts filhos todos em status SCHEDULED

### Execução de Post Agendado (Cron)
1. **A cada minuto**: Vercel cron acessa `/api/cron/posts`
2. **executeScheduledPosts()** executa:
   - Encontra posts com status SCHEDULED em janela ±1 min
   - Para cada post: Chama sendToZapier()
3. **sendToZapier()** executa:
   - Busca dados mais recentes do post + projeto
   - Constrói payload do webhook
   - Deduz créditos ANTES de enviar
   - POSTa para webhook Zapier
   - Em 2xx: Atualiza status para SENT, armazena resposta
   - Em erro: Status para FAILED, agenda retry

### Execução de Retry
1. **executeRetries()** executa:
   - Encontra registros PostRetry com status PENDING
   - Para cada um: Tenta sendToZapier novamente
   - Rastreia até 3 tentativas
   - Se falhou após 3: Para de tentar

### Usuário Visualiza e Gerencia Posts
1. Usuário visualiza **Visualização de Calendário** na Agenda:
   - Mostra todos posts agendados/enviados nas datas
2. Clica no card de post para ver **PostPreviewModal**:
   - Mostra detalhes completos, imagens, status
3. Pode:
   - **Publicar Agora**: Muda para IMMEDIATE (se ainda DRAFT/SCHEDULED)
   - **Reagendar**: Abre RescheduleDialog, escolhe nova data
   - **Deletar**: Remove post (e retries/logs em cascade delete)
   - **Duplicar**: Clona post para próximo dia

---

## 9. REFERÊNCIA DE ARQUIVOS CHAVE

### Backend Core
```
src/lib/posts/scheduler.ts          - Criação de posts e envio Zapier
src/lib/posts/executor.ts           - Execução agendada e retries
src/app/api/cron/posts/route.ts    - Endpoint do cron job
src/lib/auth-utils.ts              - Helper getUserFromClerkId
src/lib/credits/deduct.ts          - Dedução de créditos
src/lib/projects/access.ts         - Verificação de permissões
```

### Rotas de API
```
src/app/api/projects/[projectId]/posts/route.ts           - POST/GET
src/app/api/projects/[projectId]/posts/[postId]/route.ts  - GET/PUT/DELETE
src/app/api/projects/[projectId]/posts/calendar/route.ts  - Visualização calendário
src/app/api/projects/[projectId]/instagram/route.ts       - Config conta
src/app/api/projects/[projectId]/creatives/route.ts       - Listar gerações
src/app/api/templates/route.ts                             - Criar templates
```

### Componentes Frontend
```
src/components/posts/post-composer.tsx                     - Dialog criação de posts
src/components/agenda/calendar/agenda-calendar-view.tsx   - Calendário principal
src/components/agenda/calendar/calendar-header.tsx        - Navegação
src/components/agenda/post-actions/post-preview-modal.tsx - Modal de detalhes
src/components/projects/instagram-account-config.tsx      - Formulário de config
```

### Hooks
```
src/hooks/use-social-posts.ts       - Operações CRUD de posts
src/hooks/use-agenda-posts.ts       - Dados do calendário
src/hooks/use-post-actions.ts       - Ações de posts (publicar, reagendar)
```

### Páginas
```
src/app/(protected)/agenda/page.tsx    - Página principal Agenda
src/app/(protected)/dashboard/page.tsx - Lista de projetos
```

### Banco de Dados
```
prisma/schema.prisma - Todos modelos (SocialPost, PostRetry, PostLog, Generation, Template, etc.)
```

---

## 10. VARIÁVEIS DE AMBIENTE NECESSÁRIAS

```env
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/xxxxx/yyyy/
CRON_SECRET=seu-vercel-cron-secret
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

---

## 11. PROBLEMAS POTENCIAIS E LACUNAS

### Inconsistências de Design
1. **Armazenamento RecurringConfig**: Schema mostra `recurringConfig` como campo JSON único, mas endpoint PUT tenta atualizar campos individuais (`recurringFrequency`, `recurringDaysOfWeek`, etc.) que não existem no schema
2. **Campo userId**: Posts armazenam `userId` (ID de usuário do banco) mas verificam com `clerkUserId` - potencial incompatibilidade

### Lacunas de Funcionalidades
1. **Sem API nativa do Instagram**: Toda postagem vai através de Zapier/Buffer, não direta
2. **Sem auto-salvamento de rascunhos**: Posts vão de criação para agendado/processando
3. **Sem operações em lote**: Não pode criar múltiplos posts de uma vez
4. **Sem templates/ações rápidas de posts**: Todo post começa do zero
5. **Lógica de retry limitada**: Intervalos fixos de 5 min, máx 3 tentativas
6. **Sem mensagens de erro detalhadas ao usuário**: Erros registrados mas nem sempre mostrados

### Oportunidades de Otimização
1. **Janela do Cron**: ±1 minuto pode perder posts se houver desvio de relógio
2. **Timing de dedução de créditos**: Acontece ANTES do sucesso do Zapier - pode prender créditos se webhook falhar permanentemente
3. **Sem registro de requisições**: Payloads do Zapier não registrados para debug
4. **Query do calendário**: Obtém todos posts no intervalo toda vez, sem carregamento incremental

### Notas de Teste
1. URL do webhook Zapier deve estar definida no ambiente
2. CRON_SECRET deve corresponder ao header de verificação
3. PROJETO deve ter `instagramAccountId` configurado
4. BANCO DE DADOS deve ter limpeza de registros antigos de retry (sem TTL)

---

## Resumo

O sistema é **funcionalmente completo para funcionalidades core** (criar, agendar, enviar, retry). A arquitetura é sólida:
- Separação de responsabilidades (Scheduler, Executor, rotas API)
- Tratamento adequado de async
- Suporte a transações de banco de dados para criação de templates
- Logging abrangente de erros
- Suporte a múltiplos tipos de agendamento
- Webhook Zapier para roteamento flexível para múltiplas contas Instagram

**Próximos passos para produção**:
1. Corrigir incompatibilidade de schema RecurringConfig no BD
2. Adicionar feedback abrangente de erros na UI
3. Implementar auto-salvamento de rascunhos
4. Adicionar operações em lote
5. Considerar estratégia de cache para calendário
6. Monitorar taxas de sucesso do webhook Zapier
7. Implementar verificação de assinatura de webhook para segurança
