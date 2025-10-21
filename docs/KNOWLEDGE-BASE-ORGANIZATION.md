# Base de Conhecimento Organizacional

Sistema de RAG (Retrieval-Augmented Generation) compartilhado por organização que permite colaboração em equipe.

## 🎯 Visão Geral

O sistema permite que **todos os membros de uma organização** contribuam para uma base de conhecimento compartilhada que é automaticamente injetada nas respostas do chat IA.

### Benefícios

✅ **Colaborativo** - Qualquer membro pode adicionar conhecimento
✅ **Automático** - RAG injeta contexto automaticamente no chat
✅ **Compartilhado** - Todo conhecimento fica disponível para toda a organização
✅ **Inteligente** - Busca semântica encontra contexto relevante
✅ **Escalável** - Suporta milhares de documentos via Upstash Vector

## 🏗️ Arquitetura

```
Organização (Clerk)
    ↓
Membros Contribuem → Base de Conhecimento → Upstash Vector
                                                  ↓
                                    Usuário faz pergunta no Chat
                                                  ↓
                                       Busca semântica (Top 5)
                                                  ↓
                                    Contexto injetado no prompt
                                                  ↓
                                        IA responde com contexto!
```

## 📁 Estrutura de Arquivos

### APIs

**`/api/knowledge`** - Endpoints para membros da organização
- GET: Listar conhecimento da organização
- POST: Adicionar novo conhecimento

**`/api/admin/knowledge`** - Endpoints admin (todos os registros)
- GET: Listar TODOS os conhecimentos
- POST: Criar conhecimento (usa orgId automaticamente)

### Páginas

**`/knowledge`** - Interface para membros da organização
**`/admin/knowledge`** - Interface admin (gestão completa)

### Hooks

**`use-org-knowledge.ts`** - Hooks para membros
**`use-admin-knowledge.ts`** - Hooks para admins

### Core

**`src/lib/knowledge/`**
- `search.ts` - Busca semântica e RAG
- `indexer.ts` - Processamento e indexação
- `embeddings.ts` - Geração de embeddings (OpenAI)
- `vector-client.ts` - Cliente Upstash Vector
- `chunking.ts` - Divisão de documentos

## 🚀 Como Usar

### 1. Configuração Inicial

Certifique-se que as variáveis estão configuradas:

```env
# Para gerar embeddings
OPENAI_API_KEY=sk-...

# Para armazenar vetores
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=...

# Opcionais
RAG_TOP_K=5              # Chunks a buscar
RAG_CHUNK_SIZE=600       # Tamanho dos chunks
RAG_CHUNK_OVERLAP=100    # Overlap entre chunks
```

### 2. Criando uma Organização

1. Acesse Clerk Dashboard
2. Crie uma organização
3. Adicione membros

### 3. Adicionando Conhecimento

**Opção A: Interface Web** (`/knowledge`)

1. Membro acessa `/knowledge`
2. Clica em "Adicionar Conhecimento"
3. Escolhe entre:
   - **Texto**: Cola conteúdo diretamente
   - **Arquivo**: Upload TXT ou Markdown
4. Adiciona título e tags
5. Clica em "Adicionar"

**Opção B: Admin** (`/admin/knowledge`)

Admins podem gerenciar todo o conhecimento da plataforma.

### 4. Reindexando Registros

Se um registro não foi indexado (0 chunks):

```bash
# Ver o que seria reindexado
node scripts/reindex-knowledge.js --dry-run

# Reindexar apenas registros com 0 chunks
node scripts/reindex-knowledge.js

# Reindexar TODOS os registros
node scripts/reindex-knowledge.js --all
```

### 5. Usando no Chat

**Automático!** Quando um usuário da organização faz uma pergunta:

1. Sistema gera embedding da pergunta
2. Busca top 5 chunks mais relevantes da organização
3. Injeta contexto no prompt
4. IA responde usando o conhecimento compartilhado

## 🔄 Fluxo Completo

### Adicionar Conhecimento

```typescript
1. Usuário envia documento
   ↓
2. Sistema divide em chunks (~600 tokens)
   ↓
3. Gera embeddings (OpenAI text-embedding-3-small)
   ↓
4. Armazena no Upstash Vector com metadata:
   {
     workspaceId: "org_123...",
     userId: "user_abc...",
     entryId: "entry_xyz...",
     status: "ACTIVE"
   }
   ↓
5. Salva chunks no PostgreSQL
```

### RAG no Chat

```typescript
1. Usuário em org_123 pergunta: "Qual nosso processo de onboarding?"
   ↓
2. Sistema gera embedding da pergunta
   ↓
3. Busca no Upstash com filtro:
   WHERE workspaceId = 'org_123' AND status = 'ACTIVE'
   ↓
4. Retorna top 5 chunks mais similares
   ↓
5. Formata contexto:
   ### Processo de Onboarding
   [chunk 1]
   [chunk 2]
   ...
   ↓
6. Injeta no prompt:
   system: "Use o seguinte contexto..."
   <context>
   [contexto formatado]
   </context>
   ↓
7. IA responde usando conhecimento da organização!
```

## 🎨 Personalização

### Ajustar Número de Chunks

```env
RAG_TOP_K=10  # Buscar mais contexto (padrão: 5)
```

### Ajustar Tamanho dos Chunks

```env
RAG_CHUNK_SIZE=800    # Chunks maiores (padrão: 600)
RAG_CHUNK_OVERLAP=150 # Mais overlap (padrão: 100)
```

### Score Mínimo

Edite `src/lib/knowledge/search.ts:44`:

```typescript
minScore = 0.8  // Mais restritivo (padrão: 0.7)
```

## 🔒 Segurança

### Isolamento por Organização

- Conhecimento é filtrado por `workspaceId`
- Membros só veem conhecimento da própria organização
- RAG só injeta contexto da organização do usuário

### Permissões

**Membros:**
- ✅ Ver conhecimento da organização
- ✅ Adicionar novo conhecimento
- ❌ Editar conhecimento de outros
- ❌ Deletar conhecimento

**Admins:**
- ✅ Tudo que membros podem
- ✅ Ver TODO conhecimento da plataforma
- ✅ Editar qualquer conhecimento
- ✅ Deletar qualquer conhecimento
- ✅ Reindexar conhecimento

## 📊 Monitoramento

### Verificar Conhecimento

```bash
# Script customizado para ver status
node scripts/check-knowledge.js
```

### Logs do RAG

No chat, verifique os logs do servidor:

```
[RAG] Attempting to get context for query: Como fazer...
[RAG] DB User: user_123 Organization: org_abc
[RAG] Context retrieved, length: 1234
```

### Prisma Studio

```bash
npm run db:studio
```

Verifique tabelas:
- `knowledge_base_entries` - Documentos
- `knowledge_chunks` - Chunks indexados

## 🐛 Troubleshooting

### Conhecimento não aparece no chat

1. Verifique se está ACTIVE: `status = 'ACTIVE'`
2. Verifique workspaceId: deve ser o orgId do Clerk
3. Verifique chunks: deve ter > 0 chunks
4. Reindexe: `node scripts/reindex-knowledge.js`

### Chunks = 0

```bash
# Reindexar automaticamente
node scripts/reindex-knowledge.js
```

### RAG não funciona

1. Verifique `OPENAI_API_KEY` (para embeddings)
2. Verifique `UPSTASH_VECTOR_REST_URL` e `TOKEN`
3. Verifique logs do servidor
4. Teste score mínimo (pode estar muito alto)

### Conhecimento não filtra por organização

Verifique que usuário está logado em uma organização no Clerk.

## 📈 Boas Práticas

### Estrutura de Documentos

✅ **BOM:**
```
Título: Processo de Onboarding
Tags: rh, processo, novo-funcionario

Conteúdo bem estruturado com:
- Introdução clara
- Passos numerados
- Informações específicas
```

❌ **RUIM:**
```
Título: doc1
Tags: -

texto mal formatado sem estrutura...
```

### Tags

Use tags descritivas:
- ✅ `onboarding, rh, processo`
- ✅ `vendas, proposta, template`
- ❌ `doc, arquivo, texto`

### Tamanho de Documentos

- ✅ Documentos entre 200-5000 palavras
- ⚠️ Documentos muito curtos (<100 palavras) podem não gerar chunks
- ⚠️ Documentos muito longos (>10000 palavras) considere dividir

## 🔄 Atualizar Conhecimento

Para atualizar um documento:

1. **Admin**: Edite direto na interface admin
2. **Membro**: Delete e recrie (ou peça a um admin)

Após editar:
- Sistema reindex automaticamente se conteúdo mudou
- Embeddings são recalculados
- Vetores são atualizados no Upstash

## 🎓 Casos de Uso

### 1. Base de Conhecimento Interna
- Políticas da empresa
- Processos e procedimentos
- FAQs internas

### 2. Documentação de Produto
- Guias de uso
- Troubleshooting
- Especificações técnicas

### 3. Materiais de Vendas
- Propostas padrão
- Argumentos de venda
- Objeções e respostas

### 4. Treinamento
- Material didático
- Tutoriais
- Melhores práticas

## 🚀 Próximos Passos

1. Acesse `/knowledge`
2. Adicione seu primeiro documento
3. Teste no chat fazendo perguntas relacionadas
4. Convide equipe para contribuir!

---

**Dúvidas?** Verifique os logs do servidor ou consulte a documentação técnica em `/docs/ai-chat.md`
