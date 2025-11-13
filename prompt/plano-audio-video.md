# Plano de Implementação: Biblioteca de Música para Exportação de Vídeos

## 📊 Situação Atual

### ✅ O que já funciona:
- **Áudio original está sendo incluído** nos vídeos exportados
- Implementação usa Web Audio API para capturar áudio do vídeo original
- Detecção automática de presença de áudio no vídeo
- Combinação de streams de vídeo (canvas) + áudio (original)
- Tratamento de erros quando áudio não pode ser capturado

### ❌ Limitações atuais:
- Não há opção para remover o áudio original
- Não é possível substituir o áudio por música diferente
- Não existe biblioteca de músicas disponível
- Não há controle de volume ou mixagem de áudio
- Não há preview de áudio antes da exportação

## 🎯 Objetivo do Projeto

Criar uma **biblioteca de música** integrada ao editor de templates, permitindo que o usuário escolha entre:
1. **Manter o áudio original** do vídeo
2. **Usar uma música da biblioteca** no lugar do áudio original
3. **Remover completamente o áudio** (vídeo mudo)
4. **Mixar** áudio original + música (futuramente)

---

## 📋 Planejamento de Desenvolvimento

### **Fase 1: Infraestrutura da Biblioteca de Música** (Prioridade: ALTA)

#### 1.1 Database Schema (Prisma)
**Arquivo:** `prisma/schema.prisma`

```prisma
model MusicLibrary {
  id          Int      @id @default(autoincrement())
  name        String
  artist      String?
  duration    Float    // duração em segundos
  blobUrl     String   // URL do arquivo no Vercel Blob
  blobSize    Int      // tamanho em bytes
  genre       String?  // Rock, Pop, Electronic, etc.
  mood        String?  // Happy, Sad, Energetic, Calm, etc.
  bpm         Int?     // batidas por minuto
  isActive    Boolean  @default(true)
  isPublic    Boolean  @default(true) // futuro: músicas privadas por usuário
  thumbnailUrl String? // capa/artwork da música

  // Metadados
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   Int?     // admin que fez upload

  // Relação com vídeos gerados (audit trail)
  usedInVideos VideoGeneration[]

  @@index([isActive, isPublic])
  @@index([genre])
  @@index([mood])
}

// Adicionar campo na tabela VideoGeneration existente
model VideoGeneration {
  // ... campos existentes ...

  // Novos campos para música
  audioSource   String?  // 'original' | 'music' | 'none'
  musicId       Int?     // FK para MusicLibrary
  music         MusicLibrary? @relation(fields: [musicId], references: [id])
  audioVolume   Float?   @default(1.0) // 0.0 a 1.0
}
```

#### 1.2 API Routes

**Estrutura de pastas:**
```
src/app/api/
├── music-library/
│   ├── route.ts              # GET (listar) e POST (upload admin)
│   ├── [id]/
│   │   ├── route.ts          # GET, PATCH, DELETE (admin only)
│   ├── search/
│   │   ├── route.ts          # GET com filtros (genre, mood, duration)
│   └── upload-url/
│       ├── route.ts          # POST - gerar URL assinada para upload
```

**Endpoints:**

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| GET | `/api/music-library` | Lista todas as músicas ativas | User |
| POST | `/api/music-library` | Upload de nova música | Admin |
| GET | `/api/music-library/[id]` | Detalhes de uma música | User |
| PATCH | `/api/music-library/[id]` | Atualizar metadados | Admin |
| DELETE | `/api/music-library/[id]` | Deletar música | Admin |
| GET | `/api/music-library/search` | Busca com filtros | User |
| POST | `/api/music-library/upload-url` | Gerar URL para upload direto | Admin |

#### 1.3 TanStack Query Hooks

**Arquivo:** `src/hooks/use-music-library.ts`

```typescript
// Query hooks
export function useMusicLibrary(filters?: MusicFilters)
export function useMusic(musicId: number)
export function useMusicSearch(searchTerm: string, filters?: MusicFilters)

// Mutation hooks
export function useUploadMusic() // admin only
export function useUpdateMusic() // admin only
export function useDeleteMusic() // admin only
```

---

### **Fase 2: Interface de Administração** (Prioridade: ALTA)

#### 2.1 Página de Gerenciamento de Músicas

**Rota:** `/admin/music-library`

**Componentes:**
```
src/app/admin/music-library/
├── page.tsx                    # Lista de músicas com tabela
├── upload/
│   └── page.tsx                # Formulário de upload
└── [id]/
    └── edit/
        └── page.tsx            # Editar metadados
```

**Features:**
- 📊 Tabela com todas as músicas (DataTable com Radix UI)
- 🎵 Player de áudio inline para preview
- 🔍 Busca e filtros (nome, artista, gênero, mood)
- ✏️ Edição de metadados (nome, artista, gênero, mood, BPM)
- 🗑️ Exclusão de músicas (soft delete - isActive = false)
- 📤 Upload de novas músicas (MP3, WAV, OGG)
- 📊 Estatísticas de uso (quantos vídeos usaram cada música)

#### 2.2 Componentes UI Necessários

```typescript
// src/components/admin/music-library/
├── MusicTable.tsx              // Tabela principal
├── MusicUploadForm.tsx         // Formulário de upload
├── MusicEditForm.tsx           // Formulário de edição
├── MusicPlayer.tsx             // Player de áudio inline
├── MusicFilters.tsx            // Filtros de busca
└── MusicStatsCard.tsx          // Card de estatísticas
```

---

### **Fase 3: Seletor de Música no Editor** (Prioridade: MÉDIA)

#### 3.1 Modal de Seleção de Áudio

**Componente:** `src/components/templates/modals/audio-selection-modal.tsx`

**Features:**
- 🎚️ Opções de áudio:
  - ✅ **Áudio Original** (padrão)
  - 🎵 **Música da Biblioteca**
  - 🔇 **Sem Áudio**
- 🎵 Galeria de músicas com:
  - Preview de áudio (play/pause)
  - Filtros por gênero e mood
  - Busca por nome/artista
  - Visualização de duração
  - Indicador de compatibilidade de duração com o vídeo
- 🎛️ Controle de volume (slider 0-100%)
- 👁️ Preview visual da forma de onda (opcional)

**Layout sugerido:**
```
┌─────────────────────────────────────┐
│  Opções de Áudio                    │
│  ○ Áudio Original do Vídeo          │
│  ● Música da Biblioteca             │
│  ○ Sem Áudio                        │
├─────────────────────────────────────┤
│  [Buscar músicas...]                │
│  [Rock ▼] [Energetic ▼] [Duração ▼]│
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ 🎵 Summer Vibes                │  │
│  │ Artist: John Doe               │  │
│  │ [▶] 2:34 | Rock | Energetic   │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 🎵 Night Drive                 │  │
│  │ Artist: Jane Smith             │  │
│  │ [▶] 3:12 | Electronic | Calm  │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  Volume: [────●───────] 80%         │
└─────────────────────────────────────┘
```

#### 3.2 Integração com Botões de Exportação

**Arquivos a modificar:**
- `src/components/templates/video-export-button.tsx`
- `src/components/templates/video-export-queue-button.tsx`

**Mudanças:**
- Adicionar botão/link para abrir modal de seleção de áudio
- Exibir áudio selecionado antes da exportação
- Salvar preferência de áudio no state do editor

---

### **Fase 4: Atualização da Lógica de Exportação** (Prioridade: ALTA)

#### 4.1 Modificações em `konva-video-export.ts`

**Arquivo:** `src/lib/konva/konva-video-export.ts`

**Novas opções:**
```typescript
export interface VideoExportOptions {
  fps?: number
  duration?: number
  format?: 'webm' | 'mp4'
  quality?: number

  // NOVO: Opções de áudio
  audioConfig?: {
    source: 'original' | 'music' | 'none'
    musicUrl?: string        // URL do áudio da biblioteca
    volume?: number          // 0.0 - 1.0
    fadeIn?: number          // duração do fade in (segundos)
    fadeOut?: number         // duração do fade out (segundos)
  }
}
```

**Lógica a implementar:**

1. **Áudio Original** (já implementado):
   - Manter código atual que captura áudio do vídeo

2. **Música da Biblioteca**:
   - Criar elemento `<audio>` com URL da música
   - Usar `AudioContext` para processar a música
   - Sincronizar reprodução da música com a gravação do vídeo
   - Aplicar controle de volume
   - Looping automático se música for menor que vídeo
   - Cortar música se for maior que vídeo

3. **Sem Áudio**:
   - Não adicionar tracks de áudio ao MediaStream
   - Apenas stream de vídeo (canvas)

**Pseudocódigo:**

```typescript
async function setupAudioStream(
  videoElement: HTMLVideoElement,
  audioConfig: AudioConfig
): Promise<MediaStreamAudioTrack[]> {

  if (audioConfig.source === 'none') {
    return [] // Sem áudio
  }

  const audioContext = new AudioContext()
  let sourceNode: AudioNode

  if (audioConfig.source === 'original') {
    // Código atual - capturar do vídeo
    sourceNode = audioContext.createMediaElementSource(videoElement)
  } else if (audioConfig.source === 'music') {
    // NOVO - carregar música da biblioteca
    const audioElement = new Audio(audioConfig.musicUrl)
    await audioElement.play()
    sourceNode = audioContext.createMediaElementSource(audioElement)
  }

  // Aplicar controle de volume
  const gainNode = audioContext.createGain()
  gainNode.gain.value = audioConfig.volume ?? 1.0

  sourceNode.connect(gainNode)

  const destination = audioContext.createMediaStreamDestination()
  gainNode.connect(destination)

  return destination.stream.getAudioTracks()
}
```

#### 4.2 Atualização das Rotas de API de Exportação

**Arquivos:**
- `src/app/api/export/video/validate/route.ts`
- `src/app/api/export/video/confirm/route.ts`
- `src/app/api/video-processing/queue/route.ts`

**Mudanças:**
- Aceitar `audioConfig` no body da requisição
- Salvar configuração de áudio no banco (`VideoGeneration`)
- Validar URL da música se `source === 'music'`
- Registrar uso da música para estatísticas

---

### **Fase 5: Context e State Management** (Prioridade: MÉDIA)

#### 5.1 Adicionar Estado de Áudio no Template Editor Context

**Arquivo:** `src/contexts/template-editor-context.tsx`

**Novos campos no state:**
```typescript
interface TemplateEditorState {
  // ... campos existentes ...

  // Novos campos de áudio
  audioConfig: {
    source: 'original' | 'music' | 'none'
    selectedMusicId: number | null
    volume: number // 0.0 - 1.0
  }
}

// Novos métodos
setAudioSource(source: 'original' | 'music' | 'none'): void
selectMusic(musicId: number): void
setAudioVolume(volume: number): void
```

---

### **Fase 6: Upload de Músicas** (Prioridade: MÉDIA)

#### 6.1 Fluxo de Upload

1. **Admin acessa `/admin/music-library/upload`**
2. **Seleciona arquivo de áudio** (MP3, WAV, OGG, AAC)
3. **Sistema extrai metadados automaticamente:**
   - Duração
   - BPM (usando biblioteca como `music-tempo`)
   - Artwork/capa (ID3 tags)
4. **Admin preenche metadados adicionais:**
   - Nome
   - Artista
   - Gênero
   - Mood
5. **Upload direto para Vercel Blob**
6. **Registro salvo no banco de dados**

#### 6.2 Bibliotecas Necessárias

```json
{
  "dependencies": {
    "music-metadata-browser": "^2.5.10",  // Extração de metadados
    "wavesurfer.js": "^7.0.0",            // Visualização de forma de onda (opcional)
    "@vercel/blob": "já instalado"
  }
}
```

#### 6.3 Validações

- **Tamanho máximo:** 50 MB por arquivo
- **Formatos aceitos:** MP3, WAV, OGG, AAC, M4A
- **Duração máxima:** 10 minutos
- **Taxa de bits mínima:** 128 kbps (qualidade aceitável)

---

### **Fase 7: Melhorias Futuras** (Prioridade: BAIXA)

#### 7.1 Features Avançadas

1. **Mixagem de Áudio:**
   - Áudio original + música de fundo
   - Controle de volume independente para cada faixa
   - Ducking automático (abaixar volume da música quando há fala)

2. **Edição de Áudio:**
   - Trim/corte de música
   - Fade in/out automático
   - Ajuste de velocidade (pitch shift)
   - Equalização básica

3. **Biblioteca de Efeitos Sonoros:**
   - SFX categorizados (transições, impactos, ambiente)
   - Adicionar múltiplas faixas de áudio
   - Timeline de áudio visual

4. **IA para Sugestão de Música:**
   - Analisar conteúdo do vídeo
   - Sugerir músicas com base no mood/tema
   - Detecção de beats para sincronização automática

5. **Músicas por Usuário:**
   - Upload de músicas privadas
   - Biblioteca pessoal
   - Compartilhamento entre workspaces

#### 7.2 Otimizações

1. **Cache de Músicas:**
   - Cache local das músicas mais usadas
   - Pre-load de músicas populares
   - Service Worker para offline support

2. **Streaming de Áudio:**
   - Não baixar música completa antes de exportar
   - Processar em chunks durante gravação

3. **Transcodificação Server-Side:**
   - Converter todas as músicas para formato otimizado
   - Múltiplas resoluções (128kbps, 256kbps)

---

## 🗓️ Cronograma Sugerido

### Sprint 1 (1 semana): Infraestrutura
- [ ] Database schema + migration
- [ ] API routes básicas (CRUD)
- [ ] TanStack Query hooks

### Sprint 2 (1 semana): Admin Interface
- [ ] Página de listagem de músicas
- [ ] Formulário de upload
- [ ] Player de áudio inline
- [ ] Upload de 5-10 músicas iniciais para teste

### Sprint 3 (1 semana): Seletor no Editor
- [ ] Modal de seleção de áudio
- [ ] Integração com context
- [ ] Preview de músicas
- [ ] Controle de volume

### Sprint 4 (1-2 semanas): Exportação com Música
- [ ] Modificar `konva-video-export.ts`
- [ ] Implementar lógica para música da biblioteca
- [ ] Implementar opção "sem áudio"
- [ ] Testes de sincronização
- [ ] Atualizar APIs de validação/confirmação

### Sprint 5 (3 dias): Polimento e Testes
- [ ] Testes de exportação com diferentes músicas
- [ ] Testes de compatibilidade de navegadores
- [ ] Ajustes de UI/UX
- [ ] Documentação

---

## 🧪 Casos de Teste

### Teste 1: Exportação com Áudio Original
- Vídeo com áudio → Exportar → Verificar se áudio está presente

### Teste 2: Exportação com Música da Biblioteca
- Vídeo qualquer → Selecionar música → Exportar → Verificar se música está presente

### Teste 3: Exportação Sem Áudio
- Vídeo com áudio → Selecionar "sem áudio" → Exportar → Verificar se está mudo

### Teste 4: Música Menor que Vídeo
- Vídeo de 60s + música de 30s → Verificar looping automático

### Teste 5: Música Maior que Vídeo
- Vídeo de 30s + música de 60s → Verificar corte da música

### Teste 6: Controle de Volume
- Exportar com volume 50% → Verificar se áudio está pela metade

### Teste 7: Compatibilidade de Formatos
- Testar com MP3, WAV, OGG → Verificar compatibilidade

---

## 🚨 Desafios Técnicos Conhecidos

### 1. Sincronização de Áudio + Vídeo
**Problema:** Áudio e vídeo podem ficar dessincronizados durante a gravação
**Solução:**
- Usar timestamps precisos
- Ajustar `currentTime` de ambos elementos regularmente
- Testar em navegadores diferentes

### 2. CORS e Áudio
**Problema:** Alguns áudios podem ter restrições de CORS
**Solução:**
- Hospedar todas as músicas no Vercel Blob com CORS configurado
- Garantir `Access-Control-Allow-Origin: *` para áudios públicos

### 3. Looping de Música
**Problema:** Música curta precisa repetir sem gaps
**Solução:**
- Usar `audio.loop = true`
- Ou criar buffer de áudio contínuo com Web Audio API

### 4. Conversão MP4 com Áudio
**Problema:** FFmpeg.wasm precisa processar áudio corretamente
**Solução:**
- Verificar se codec de áudio está habilitado
- Testar conversão com áudio antes de deploy

### 5. Performance com Múltiplas Músicas
**Problema:** Carregar 100+ músicas pode ser lento
**Solução:**
- Paginação da lista
- Lazy loading
- Cache inteligente

---

## 📚 Referências Técnicas

### Web Audio API
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN: AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext)
- [MDN: MediaElementAudioSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode)

### MediaRecorder API
- [MDN: MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [MDN: MediaStream](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)

### Bibliotecas Úteis
- [music-metadata-browser](https://github.com/Borewit/music-metadata-browser) - Extração de metadados
- [wavesurfer.js](https://wavesurfer-js.org/) - Visualização de forma de onda
- [tone.js](https://tonejs.github.io/) - Framework avançado de Web Audio

---

## ✅ Checklist de Implementação

### Backend
- [ ] Criar model `MusicLibrary` no Prisma
- [ ] Adicionar campos de áudio em `VideoGeneration`
- [ ] Rodar migration do banco
- [ ] Criar API `/api/music-library` (CRUD)
- [ ] Criar API `/api/music-library/search`
- [ ] Criar API `/api/music-library/upload-url`
- [ ] Atualizar API `/api/export/video/validate`
- [ ] Atualizar API `/api/export/video/confirm`
- [ ] Atualizar API `/api/video-processing/queue`

### Frontend - Admin
- [ ] Criar página `/admin/music-library`
- [ ] Criar página `/admin/music-library/upload`
- [ ] Criar componente `MusicTable`
- [ ] Criar componente `MusicUploadForm`
- [ ] Criar componente `MusicPlayer`
- [ ] Criar componente `MusicFilters`
- [ ] Criar hooks de TanStack Query

### Frontend - Editor
- [ ] Criar modal `AudioSelectionModal`
- [ ] Adicionar estado de áudio no context
- [ ] Integrar modal com botões de exportação
- [ ] Criar componente de preview de música
- [ ] Criar controle de volume
- [ ] Atualizar UI dos botões de exportação

### Exportação
- [ ] Modificar `exportVideoWithLayers()` para aceitar `audioConfig`
- [ ] Implementar lógica para música da biblioteca
- [ ] Implementar lógica para "sem áudio"
- [ ] Implementar controle de volume
- [ ] Implementar looping de música
- [ ] Implementar corte de música
- [ ] Testar sincronização
- [ ] Testar conversão MP4 com novo áudio

### Testes
- [ ] Testar upload de músicas
- [ ] Testar listagem e busca
- [ ] Testar seleção de música no editor
- [ ] Testar exportação com música
- [ ] Testar exportação sem áudio
- [ ] Testar diferentes formatos de áudio
- [ ] Testar em Chrome
- [ ] Testar em Firefox
- [ ] Testar em Safari
- [ ] Testar com vídeos de diferentes durações

---

## 💡 Observações Finais

### Prioridade de Implementação:
1. **Infraestrutura + Admin** → Permite que o time adicione músicas
2. **Seletor no Editor** → Permite que usuários escolham músicas
3. **Exportação** → Implementa a funcionalidade final

### Estimativa Total: 3-4 semanas

### Riscos:
- **Sincronização de áudio/vídeo:** Maior desafio técnico
- **Performance:** Muitas músicas podem deixar a interface lenta
- **Licenciamento:** Garantir que músicas usadas têm licença adequada

### Recomendações:
- Começar com biblioteca pequena (10-20 músicas)
- Testar extensivamente a sincronização
- Considerar usar músicas royalty-free de serviços como:
  - Pixabay Music
  - Incompetech
  - YouTube Audio Library
  - Epidemic Sound (licença paga)
