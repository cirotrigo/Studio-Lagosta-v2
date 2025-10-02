# Plano de Integração RAG com Upstash Vector Database

## Objetivo
Implementar um sistema de Retrieval-Augmented Generation (RAG) usando Upstash Vector Database para fornecer contexto relevante às conversas de chat baseadas em uma base de conhecimento gerenciada pelo admin.

## Arquitetura Proposta

### 1. Componentes Principais

#### 1.1 Vector Database (Upstash)
- **Provider**: Upstash Vector Database
- **Integração**: Via AI SDK (Vercel)
- **Embedding Model**: text-embedding-3-small (OpenAI) ou alternativa
- **Dimensões**: 1536 (padrão OpenAI) ou conforme modelo escolhido

#### 1.2 Upload de Documentos (Admin)
- Interface no painel admin para upload de arquivos
- Suporte a múltiplos formatos: PDF, TXT, MD, DOCX
- Processamento e chunking de documentos
- Armazenamento de metadados (nome, tipo, data, autor)

#### 1.3 Injeção de Contexto (Chat)
- Busca semântica no vector database durante conversas
- Recuperação dos chunks mais relevantes (top-k)
- Injeção no prompt do sistema antes da resposta do LLM

---

## Implementação Técnica

### 2. Setup Inicial

#### 2.1 Dependências NPM
```bash
npm install @upstash/vector @ai-sdk/openai ai
npm install pdf-parse mammoth # Para parsing de documentos
npm install langchain # Para chunking e processamento de texto
```

#### 2.2 Variáveis de Ambiente
```env
# Upstash Vector
UPSTASH_VECTOR_REST_URL=https://your-vector-db.upstash.io
UPSTASH_VECTOR_REST_TOKEN=your_token_here

# OpenAI (para embeddings)
OPENAI_API_KEY=your_openai_key

# Configurações RAG
RAG_TOP_K=3 # Número de chunks a recuperar
RAG_CHUNK_SIZE=1000 # Tamanho dos chunks em caracteres
RAG_CHUNK_OVERLAP=200 # Overlap entre chunks
```

#### 2.3 Schema Prisma - Novos Modelos
```prisma
model KnowledgeBase {
  id          String   @id @default(cuid())
  name        String
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  documents   Document[]

  @@map("knowledge_bases")
}

model Document {
  id              String        @id @default(cuid())
  filename        String
  originalName    String
  fileType        String // pdf, txt, md, docx
  fileSize        Int
  status          DocumentStatus @default(PROCESSING)
  vectorIds       String[] // IDs dos vetores no Upstash
  chunkCount      Int       @default(0)
  uploadedAt      DateTime  @default(now())
  processedAt     DateTime?

  knowledgeBaseId String
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)

  metadata        Json? // Metadados customizados

  @@map("documents")
}

enum DocumentStatus {
  PROCESSING
  COMPLETED
  FAILED
}
```

---

### 3. Backend - API Routes

#### 3.1 Upload e Processamento de Documentos
**API Route**: `POST /api/admin/knowledge-base/documents`

```typescript
// src/app/api/admin/knowledge-base/documents/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdmin } from '@/lib/auth-utils';
import { processAndIndexDocument } from '@/lib/rag/document-processor';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const knowledgeBaseId = formData.get('knowledgeBaseId') as string;

  // 1. Salvar arquivo temporariamente
  // 2. Extrair texto do documento
  // 3. Fazer chunking do texto
  // 4. Gerar embeddings
  // 5. Indexar no Upstash Vector
  // 6. Salvar metadados no banco de dados

  const document = await processAndIndexDocument(file, knowledgeBaseId);

  return NextResponse.json(document);
}
```

#### 3.2 Busca Semântica
**API Route**: `POST /api/knowledge-base/search`

```typescript
// src/app/api/knowledge-base/search/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledgeBase } from '@/lib/rag/vector-search';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { query, topK = 3 } = await req.json();

  const results = await searchKnowledgeBase(query, topK);

  return NextResponse.json({ results });
}
```

#### 3.3 Gestão de Base de Conhecimento
**API Routes**:
- `GET /api/admin/knowledge-base` - Listar bases de conhecimento
- `POST /api/admin/knowledge-base` - Criar nova base
- `DELETE /api/admin/knowledge-base/[id]` - Deletar base (e vetores associados)
- `GET /api/admin/knowledge-base/[id]/documents` - Listar documentos
- `DELETE /api/admin/knowledge-base/documents/[id]` - Deletar documento

---

### 4. Biblioteca RAG Core

#### 4.1 Vector Client Setup
```typescript
// src/lib/rag/vector-client.ts
import { Index } from '@upstash/vector';

export const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});
```

#### 4.2 Document Processor
```typescript
// src/lib/rag/document-processor.ts
import { vectorIndex } from './vector-client';
import { generateEmbedding } from './embeddings';
import { chunkText } from './text-chunking';
import { extractText } from './file-parsers';
import { prisma } from '@/lib/db';

export async function processAndIndexDocument(
  file: File,
  knowledgeBaseId: string
) {
  // 1. Extrair texto
  const text = await extractText(file);

  // 2. Fazer chunking
  const chunks = chunkText(text, {
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1000'),
    overlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '200'),
  });

  // 3. Criar documento no banco
  const document = await prisma.document.create({
    data: {
      filename: file.name,
      originalName: file.name,
      fileType: file.type,
      fileSize: file.size,
      status: 'PROCESSING',
      knowledgeBaseId,
      chunkCount: chunks.length,
    },
  });

  // 4. Gerar embeddings e indexar
  const vectorIds: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    const vectorId = `${document.id}_chunk_${i}`;

    await vectorIndex.upsert({
      id: vectorId,
      vector: embedding,
      metadata: {
        documentId: document.id,
        chunkIndex: i,
        text: chunks[i],
        knowledgeBaseId,
      },
    });

    vectorIds.push(vectorId);
  }

  // 5. Atualizar documento
  await prisma.document.update({
    where: { id: document.id },
    data: {
      status: 'COMPLETED',
      vectorIds,
      processedAt: new Date(),
    },
  });

  return document;
}
```

#### 4.3 Embeddings Generator
```typescript
// src/lib/rag/embeddings.ts
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text,
  });

  return embedding;
}
```

#### 4.4 Vector Search
```typescript
// src/lib/rag/vector-search.ts
import { vectorIndex } from './vector-client';
import { generateEmbedding } from './embeddings';

export interface SearchResult {
  id: string;
  score: number;
  text: string;
  documentId: string;
  metadata: Record<string, any>;
}

export async function searchKnowledgeBase(
  query: string,
  topK: number = 3
): Promise<SearchResult[]> {
  // 1. Gerar embedding da query
  const queryEmbedding = await generateEmbedding(query);

  // 2. Buscar vetores similares
  const results = await vectorIndex.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  // 3. Formatar resultados
  return results.map((result) => ({
    id: result.id,
    score: result.score,
    text: result.metadata?.text as string,
    documentId: result.metadata?.documentId as string,
    metadata: result.metadata || {},
  }));
}
```

#### 4.5 Text Chunking
```typescript
// src/lib/rag/text-chunking.ts
export interface ChunkOptions {
  chunkSize: number;
  overlap: number;
}

export function chunkText(
  text: string,
  options: ChunkOptions
): string[] {
  const { chunkSize, overlap } = options;
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunk = text.slice(startIndex, endIndex);
    chunks.push(chunk.trim());
    startIndex += chunkSize - overlap;
  }

  return chunks.filter((chunk) => chunk.length > 0);
}
```

#### 4.6 File Parsers
```typescript
// src/lib/rag/file-parsers.ts
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (file.type) {
    case 'application/pdf':
      const pdfData = await pdfParse(buffer);
      return pdfData.text;

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      const docxResult = await mammoth.extractRawText({ buffer });
      return docxResult.value;

    case 'text/plain':
    case 'text/markdown':
      return buffer.toString('utf-8');

    default:
      throw new Error(`Unsupported file type: ${file.type}`);
  }
}
```

---

### 5. Frontend - Admin Panel

#### 5.1 Nova Rota Admin
**Caminho**: `/admin/knowledge-base`

```typescript
// src/app/admin/knowledge-base/page.tsx
'use client';

import { useState } from 'react';
import { useKnowledgeBases } from '@/hooks/admin/use-admin-knowledge-base';
import { Button } from '@/components/ui/button';
import { DocumentUploader } from '@/components/admin/document-uploader';
import { DocumentList } from '@/components/admin/document-list';

export default function KnowledgeBasePage() {
  const { data: knowledgeBases, isLoading } = useKnowledgeBases();
  const [selectedBase, setSelectedBase] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Base de Conhecimento</h1>
        <Button>Nova Base</Button>
      </div>

      {/* Lista de bases de conhecimento */}
      <div className="grid gap-4">
        {knowledgeBases?.map((base) => (
          <div key={base.id} className="border rounded-lg p-4">
            <h3>{base.name}</h3>
            <p>{base.description}</p>
            <Button onClick={() => setSelectedBase(base.id)}>
              Gerenciar Documentos
            </Button>
          </div>
        ))}
      </div>

      {/* Upload de documentos */}
      {selectedBase && (
        <DocumentUploader knowledgeBaseId={selectedBase} />
      )}

      {/* Lista de documentos */}
      {selectedBase && (
        <DocumentList knowledgeBaseId={selectedBase} />
      )}
    </div>
  );
}
```

#### 5.2 Componente de Upload
```typescript
// src/components/admin/document-uploader.tsx
'use client';

import { useUploadDocument } from '@/hooks/admin/use-admin-knowledge-base';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  knowledgeBaseId: string;
}

export function DocumentUploader({ knowledgeBaseId }: Props) {
  const uploadMutation = useUploadDocument();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('knowledgeBaseId', knowledgeBaseId);

    await uploadMutation.mutateAsync(formData);
  };

  return (
    <div className="border-2 border-dashed rounded-lg p-8">
      <Input
        type="file"
        accept=".pdf,.txt,.md,.docx"
        onChange={handleUpload}
      />
      {uploadMutation.isPending && <p>Processando documento...</p>}
    </div>
  );
}
```

#### 5.3 Custom Hooks
```typescript
// src/hooks/admin/use-admin-knowledge-base.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useKnowledgeBases() {
  return useQuery({
    queryKey: ['admin', 'knowledge-bases'],
    queryFn: () => api.get('/api/admin/knowledge-base'),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/api/admin/knowledge-base/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'documents'] });
    },
  });
}
```

---

### 6. Integração com Chat

#### 6.1 Modificar API de Chat
```typescript
// src/app/api/chat/route.ts (ou similar)
import { searchKnowledgeBase } from '@/lib/rag/vector-search';

export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const lastMessage = messages[messages.length - 1].content;

  // 1. Buscar contexto relevante
  const contextResults = await searchKnowledgeBase(lastMessage, 3);

  // 2. Formatar contexto
  const context = contextResults
    .map((r) => `[Score: ${r.score.toFixed(2)}]\n${r.text}`)
    .join('\n\n---\n\n');

  // 3. Injetar no system prompt
  const systemMessage = {
    role: 'system',
    content: `Você é um assistente útil. Use o seguinte contexto da base de conhecimento para responder às perguntas:\n\n${context}\n\nSe o contexto não for relevante, responda com base no seu conhecimento geral.`,
  };

  // 4. Chamar LLM com contexto injetado
  const response = await generateChatCompletion([
    systemMessage,
    ...messages,
  ]);

  return response;
}
```

#### 6.2 Exibir Fontes no Chat (Opcional)
```typescript
// Adicionar metadados de fontes na resposta do chat
interface ChatResponse {
  message: string;
  sources?: Array<{
    documentId: string;
    filename: string;
    score: number;
  }>;
}
```

---

## 7. Configuração e Deploy

### 7.1 Criar Index no Upstash
1. Acessar dashboard Upstash: https://console.upstash.com/
2. Criar novo Vector Database
3. Configurar dimensões (1536 para OpenAI embeddings)
4. Copiar URL e token para `.env`

### 7.2 Migrations
```bash
npm run db:push  # Aplicar schema do Prisma
```

### 7.3 Testes
- Testar upload de documentos no admin
- Verificar indexação no Upstash (via dashboard)
- Testar busca semântica via API
- Validar injeção de contexto no chat

---

## 8. Melhorias Futuras

### 8.1 Funcionalidades Avançadas
- **Reranking**: Adicionar modelo de reranking para melhorar relevância
- **Hybrid Search**: Combinar busca vetorial com busca por palavras-chave
- **Chunking Inteligente**: Usar LangChain para chunking baseado em estrutura
- **Multi-tenancy**: Bases de conhecimento por usuário/workspace
- **Versionamento**: Histórico de versões de documentos

### 8.2 Performance
- **Caching**: Cache de embeddings para queries comuns
- **Batch Processing**: Processar múltiplos documentos em paralelo
- **Background Jobs**: Usar fila (BullMQ) para processamento assíncrono

### 8.3 UX
- **Preview**: Visualizar chunks antes de indexar
- **Highlight**: Destacar trechos relevantes nas respostas
- **Feedback Loop**: Permitir usuários marcarem respostas úteis/não úteis

---

## 9. Considerações de Custo

### Upstash Vector
- **Free Tier**: 10k vectores, 10k queries/dia
- **Pricing**: Pay-as-you-go após free tier

### OpenAI Embeddings
- **text-embedding-3-small**: $0.02 / 1M tokens
- **Estimativa**: ~1k documentos = ~$0.50 (depende do tamanho)

### Alternativas
- **Embeddings Open Source**: sentence-transformers (grátis, self-hosted)
- **Vector DB Alternativo**: Pinecone, Weaviate, Qdrant

---

## 10. Checklist de Implementação

- [ ] Setup Upstash Vector Database
- [ ] Adicionar variáveis de ambiente
- [ ] Criar schema Prisma (KnowledgeBase, Document)
- [ ] Implementar lib RAG core (embeddings, chunking, vector-client)
- [ ] Implementar file parsers (PDF, DOCX, TXT, MD)
- [ ] Criar API routes admin (upload, list, delete)
- [ ] Criar API route de busca semântica
- [ ] Criar páginas admin (knowledge-base management)
- [ ] Criar componente de upload com drag-and-drop
- [ ] Integrar RAG no sistema de chat existente
- [ ] Adicionar loading states e error handling
- [ ] Testes end-to-end
- [ ] Documentação de uso para admins

---

## Referências

- **Upstash Vector Docs**: https://upstash.com/docs/vector/integrations/ai-sdk
- **AI SDK Embeddings**: https://sdk.vercel.ai/docs/ai-sdk-core/embeddings
- **LangChain Text Splitters**: https://js.langchain.com/docs/modules/data_connection/document_transformers/
- **Prisma File Upload**: https://www.prisma.io/blog/handling-file-uploads-in-nextjs
