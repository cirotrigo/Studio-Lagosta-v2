# Implementação do Instagram Analytics - Resumo

## Status da Implementação: ✅ COMPLETO

Este documento resume o sistema de Instagram Analytics & Rastreamento de Metas que foi implementado com sucesso.

---

## ✅ Tarefas Concluídas

### Fase 1: Schema do Banco de Dados
- ✅ Adicionados modelos Instagram Analytics ao schema Prisma
  - `InstagramStory` - Armazena dados de stories com insights
  - `InstagramFeed` - Armazena posts de feed com métricas
  - `InstagramDailySummary` - Rastreamento diário de metas
  - `InstagramWeeklyReport` - Relatórios semanais de desempenho
  - `InstagramGoalSettings` - Metas configuráveis por projeto
  - `InstagramMediaType` enum (IMAGE, VIDEO, CAROUSEL_ALBUM)
- ✅ Atualizados modelos Project e Organization com relações Instagram
- ✅ Executada migração do banco de dados com sucesso (`npm run db:push`)

### Fase 2: Endpoints da API (Webhooks)
Criados três endpoints de webhook para receber dados do Boost.space:

1. ✅ **[POST /api/webhooks/instagram/story/route.ts](src/app/api/webhooks/instagram/story/route.ts)**
   - Recebe dados de stories do Instagram quando expiram (24h)
   - Valida webhook secret
   - Armazena insights de stories (impressões, alcance, taps, saídas, respostas)
   - Atualiza resumo diário automaticamente

2. ✅ **[POST /api/webhooks/instagram/feed/route.ts](src/app/api/webhooks/instagram/feed/route.ts)**
   - Recebe dados de feeds do Instagram quando novos posts são publicados
   - Armazena métricas de engajamento (curtidas, comentários, alcance, salvamentos)
   - Atualiza contador diário de feeds

3. ✅ **[POST /api/webhooks/instagram/report/route.ts](src/app/api/webhooks/instagram/report/route.ts)**
   - Recebe relatórios semanais de desempenho
   - Armazena taxas de conclusão, scores (A-F) e alertas
   - Consolida métricas semanais

### Fase 3: Endpoints da API (Acesso a Dados)
Criados dois endpoints para o frontend buscar dados:

4. ✅ **[GET /api/instagram/[projectId]/studio/route.ts](src/app/api/instagram/[projectId]/studio/route.ts)**
   - Retorna dados completos do dashboard para um projeto
   - Inclui relatório da semana atual, resumos diários, stories/feeds recentes
   - Implementa autenticação e controle de acesso ao projeto

5. ✅ **[GET/PUT /api/instagram/settings/route.ts](src/app/api/instagram/settings/route.ts)**
   - GET: Recupera configurações de metas para um projeto
   - PUT: Atualiza configurações de metas (feeds semanais, stories diárias)
   - Cria automaticamente configurações com padrões se não existirem

### Fase 4: Hooks TanStack Query
✅ **[src/hooks/use-instagram-analytics.ts](src/hooks/use-instagram-analytics.ts)**
- `useInstagramDashboard(projectId)` - Busca dados do dashboard
- `useInstagramSettings(projectId)` - Busca e atualiza configurações
- Implementa estratégias adequadas de cache e invalidação

### Fase 5: Sistema de Geração de Alertas
✅ **[src/lib/instagram/types.ts](src/lib/instagram/types.ts)**
- Definições de tipos de alerta (BELOW_GOAL, NO_POST, etc.)
- Níveis de severidade (INFO, WARNING, CRITICAL)

✅ **[src/lib/instagram/generate-alerts.ts](src/lib/instagram/generate-alerts.ts)**
- Função `generateAlerts()`
- Analisa métricas e gera alertas contextuais
- Retorna objetos de alerta estruturados com severidade

### Fase 6: Componentes de UI
Criados componentes React reutilizáveis para o dashboard:

1. ✅ **[src/components/instagram/weekly-summary-card.tsx](src/components/instagram/weekly-summary-card.tsx)**
   - Exibe progresso de metas semanais
   - Mostra taxas de conclusão de feeds e stories
   - Badges de score com código de cores (A-F)
   - Notificações de alerta

2. ✅ **[src/components/instagram/daily-heatmap.tsx](src/components/instagram/daily-heatmap.tsx)**
   - Heatmap visual de posts de stories diárias
   - Código de cores por status de conclusão
   - Mostra indicadores de conclusão de meta

### Fase 7: Página do Dashboard
✅ **[src/app/(protected)/projects/[id]/instagram/page.tsx](src/app/(protected)/projects/[id]/instagram/page.tsx)**
- Dashboard completo do Instagram Analytics
- Resumo semanal com alertas
- Heatmap de stories diárias
- Grade de feeds recentes com overlay de engajamento
- Estados de loading e tratamento de erros

### Fase 8: Configuração de Ambiente
✅ Atualizado [.env.example](.env.example)
- Adicionada variável `INSTAGRAM_WEBHOOK_SECRET`
- Incluídas instruções de geração

---

## 📊 Arquitetura do Sistema

```
Instagram Graph API
    ↓
Boost.space (Automação)
    ↓ (webhooks com secret)
Next.js API Routes
    ↓
Neon PostgreSQL (Prisma)
    ↓
TanStack Query (cache)
    ↓
React Dashboard
```

---

## 🔐 Recursos de Segurança

1. **Validação de Webhook Secret**: Todos os webhooks validam o header `x-webhook-secret`
2. **Autenticação**: Endpoints do dashboard requerem autenticação Clerk
3. **Controle de Acesso ao Projeto**: Usuários só podem acessar seus próprios projetos
4. **Proteção contra SQL Injection**: Prisma ORM com queries parametrizadas

---

## 🎯 Funcionalidades Principais

### Rastreamento de Metas
- **Feeds**: Padrão de 4 posts por semana (configurável)
- **Stories**: Padrão de 3 posts por dia (configurável)
- Cálculo automático de taxas de conclusão
- Sistema de pontuação semanal (A, B, C, D, F)

### Coleta de Dados em Tempo Real
- Stories coletadas quando expiram (24h)
- Feeds coletados imediatamente após postagem (com delay de 5min para insights)
- Resumos diários atualizados automaticamente

### Relatórios Semanais
- Geração agendada (segundas-feiras 00:00 UTC via Boost.space)
- Métricas abrangentes em formato JSON
- Geração de alertas para metas não atingidas

### Funcionalidades do Dashboard
- Visão geral de desempenho semanal
- Heatmap de rastreamento de stories diárias
- Galeria de feeds recentes
- Indicadores de progresso com código de cores
- Alertas e avisos contextuais

---

## 🚀 Próximos Passos para Produção

### 1. Configurar Cenários do Boost.space
Siga as instruções em [prompts/plano-analise-instagram.md](prompts/plano-analise-instagram.md) para:
- Configurar conexão com Instagram Graph API
- Criar cenário de monitoramento de Stories
- Criar cenário de monitoramento de Feeds
- Criar cenário agendado de Relatório Semanal

### 2. Definir Variável de Ambiente
```bash
# Gerar um secret seguro
openssl rand -hex 32

# Adicionar ao .env.local
INSTAGRAM_WEBHOOK_SECRET=seu_secret_gerado_aqui
```

### 3. Configurar Webhooks do Boost.space
Use o secret gerado em todos os headers de requisição HTTP:
```json
{
  "x-webhook-secret": "seu_secret_gerado_aqui"
}
```

### 4. Vincular Projetos às Contas do Instagram
Atualizar projetos existentes no banco de dados:
```sql
UPDATE "Project"
SET
  "instagramUsername" = 'nome_usuario_conta',
  "instagramAccountId" = 'id_conta_do_instagram'
WHERE id = SEU_ID_PROJETO;
```

### 5. Testar Webhooks
Use ferramentas como Postman ou cURL para testar endpoints de webhook antes de conectar ao Boost.space:

```bash
curl -X POST https://seu-dominio.com/api/webhooks/instagram/story \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: seu_secret" \
  -d @test-payload.json
```

### 6. Acessar o Dashboard
Navegue para: `/projects/[projectId]/instagram`

---

## 📝 Resumo do Schema do Banco de Dados

### InstagramStory
- Dados de mídia (URL, tipo, legenda)
- Timestamps de publicação
- Insights (impressões, alcance, taps, saídas, respostas)
- Flag de rastreamento de meta

### InstagramFeed
- Dados de mídia (URL, tipo, legenda, permalink)
- Timestamps de publicação
- Métricas públicas (curtidas, comentários)
- Insights (engajamento, impressões, alcance, salvamentos)

### InstagramDailySummary
- Agregação baseada em data
- Contagem de stories e feeds
- Rastreamento de conclusão de metas
- Estatísticas de engajamento

### InstagramWeeklyReport
- Definição de período da semana
- Comparação meta vs real
- Score geral (A-F)
- Métricas detalhadas em JSON
- Alertas gerados

### InstagramGoalSettings
- Configuração por projeto
- Meta de feed semanal (padrão: 4)
- Meta de story diária (padrão: 3)
- Flag de status ativo

---

## 🔄 Exemplos de Fluxo de Dados

### Story Postada no Instagram
1. Story expira após 24 horas
2. Boost.space detecta expiração
3. Busca insights da Instagram API
4. Envia webhook para `/api/webhooks/instagram/story`
5. Sistema armazena story e atualiza resumo diário
6. Dashboard reflete novos dados instantaneamente

### Geração de Relatório Semanal
1. Boost.space executa cenário agendado (segunda 00:00 UTC)
2. Consulta banco de dados dos últimos 7 dias
3. Calcula métricas e gera alertas
4. Envia webhook para `/api/webhooks/instagram/report`
5. Sistema armazena relatório semanal com score
6. Dashboard mostra resumo semanal atualizado

---

## 🎨 Hierarquia de Componentes UI

```
InstagramAnalyticsPage
├── Header (título + username)
├── WeeklySummaryCard
│   ├── Score Badge
│   ├── Barra de Progresso de Feeds
│   ├── Barra de Progresso de Stories
│   └── Lista de Alertas
├── Card de Stories Diárias
│   └── DailyHeatmap
│       └── 7 Caixas de Dias (código de cores)
└── Card de Feeds Recentes
    └── Grade de Imagens de Feed
        └── Hover: Estatísticas de Engajamento
```

---

## 📚 Referências

- **Plano de Implementação**: [prompts/plano-analise-instagram.md](prompts/plano-analise-instagram.md)
- **Cenário Boost.space (Feeds)**: [prompt/boost-space-scenario-2-feeds-IMPORT.json](prompt/boost-space-scenario-2-feeds-IMPORT.json)
- **Instagram Graph API**: https://developers.facebook.com/docs/instagram-api
- **Documentação Boost.space**: https://docs.boost.space

---

## ✨ Destaques da Implementação

- **Type-safe**: Implementação completa em TypeScript com validação Zod
- **Performático**: TanStack Query com cache inteligente
- **Escalável**: Projetado para múltiplos projetos e organizações
- **Manutenível**: Separação clara de responsabilidades (API, hooks, componentes)
- **Seguro**: Validação de webhook, autenticação e autorização
- **Amigável ao usuário**: Dashboard intuitivo com indicadores visuais

---

**Status**: Pronto para deploy em produção após configuração do Boost.space.

**Data de Implementação**: 2025-10-27
