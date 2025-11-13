# Plano de Implementação: Biblioteca de Música para Exportação de Vídeos

## 🎯 Resumo Executivo

Este documento apresenta o planejamento completo para implementar uma **biblioteca de música** integrada ao editor de vídeos, inspirada na interface intuitiva do **Instagram Stories/Reels**.

### Principais Features:
- ✅ **3 opções de áudio**: Original, Música da Biblioteca, ou Sem Áudio
- 📊 **Timeline interativa com waveform** visual (estilo Instagram)
- ✂️ **Trim handles arrastáveis** para selecionar trecho exato da música
- 🔁 **Loop inteligente** quando música é menor que vídeo
- ✂️ **Corte automático** quando música é maior que vídeo
- 🎛️ **Controles de volume** e fade in/out
- 🎵 **Galeria de músicas** com preview, busca e filtros
- 📱 **UX mobile-first** adaptada para desktop

### Estimativa: 3-4 semanas (5 sprints)

### Diferencial vs Instagram:
- Desktop-first com precisão de mouse/teclado
- Waveform visual completo
- Zoom da timeline para ajustes precisos
- Detecção inteligente de refrão (IA/heurística)
- Preview em tempo real com sincronização

---

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

### **Fase 3: Seletor de Música no Editor** (Prioridade: ALTA)

#### 3.1 Modal de Seleção de Áudio com Timeline Interativa

**Componente:** `src/components/templates/modals/audio-selection-modal.tsx`

**Inspiração:** Interface do Instagram Stories/Reels com melhorias para desktop

**Features principais:**
- 🎚️ **Opções de áudio** (Radio buttons):
  - ✅ **Áudio Original** (padrão)
  - 🎵 **Música da Biblioteca**
  - 🔇 **Sem Áudio**

- 🎵 **Galeria de músicas** com grid cards:
  - Preview de áudio (play/pause inline)
  - Capa/artwork da música
  - Nome, artista, duração
  - Tags de gênero e mood (badges coloridos)
  - Indicador visual de compatibilidade com vídeo
  - Filtros por gênero, mood e duração
  - Busca por nome/artista em tempo real

- 📊 **Timeline de Ajuste (estilo Instagram)**:
  - **Waveform visual** da música selecionada
  - **Trim handles** (alças de corte) arrastáveis nas extremidades
  - **Frame box** visual destacando o trecho selecionado
  - **Snap points** para precisão (início, fim, beats principais)
  - **Feedback háptico** (se disponível no navegador)
  - **Preview em tempo real** ao arrastar os handles
  - **Indicador de duração** do trecho selecionado
  - **Loop visual** quando música é menor que vídeo
  - **Zoom da timeline** para ajustes precisos

- 🎛️ **Controles adicionais**:
  - Volume (slider 0-100%) com ícone de speaker
  - Fade in/out (toggles opcionais)
  - Botão "Iniciar do refrão" (IA/heurística)
  - Reset para seleção inicial

**Layout detalhado (Modal de 2 etapas):**

```
┌──────────────────────────────────────────────────────────┐
│  🎵 Adicionar Música ao Vídeo                     [X]     │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ETAPA 1: SELECIONAR FONTE DE ÁUDIO                       │
│  ┌────────────────────────────────────────────────────┐   │
│  │  ○ Áudio Original do Vídeo                         │   │
│  │  ● Música da Biblioteca                            │   │
│  │  ○ Sem Áudio (Mudo)                                │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ETAPA 2: ESCOLHER MÚSICA                                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │  [🔍 Buscar músicas...]                            │   │
│  │  [Todos ▼] [Mood ▼] [Duração ▼]  [Limpar filtros] │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 🎵 MÚSICA SELECIONADA                               │ │
│  │ ┌──────────────┐  Summer Vibes                      │ │
│  │ │   [Album     │  John Doe · Rock                   │ │
│  │ │    Art]      │  2:34  [🔁 Loop] ✓ Compatível      │ │
│  │ └──────────────┘  [▶ Play]  [✓ Usando esta]        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  📊 AJUSTAR TRECHO DA MÚSICA                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Vídeo: 0:00 ──────────────────────────── 0:30    │   │
│  │                                                      │   │
│  │  [|────📊📊📊📊📊📊📊📊📊📊────|]  ← Waveform   │   │
│  │   ▲                              ▲                  │   │
│  │ Início                          Fim                 │   │
│  │   (arraste para ajustar)                            │   │
│  │                                                      │   │
│  │  Trecho: 0:15 → 0:45 (30s)     [Refrão] [Reset]   │   │
│  │                                                      │   │
│  │  ⚠️ Música é maior que vídeo - será cortada        │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  🎛️ CONFIGURAÇÕES DE ÁUDIO                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Volume:  🔊 [──────●────] 80%                     │   │
│  │  Fade In:  ○ Ativado (0.5s)                        │   │
│  │  Fade Out: ○ Ativado (0.5s)                        │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  GALERIA DE MÚSICAS                                       │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Grid com scroll:                                    │   │
│  │                                                      │   │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │   │
│  │ │ 🎵   │ │ 🎵   │ │ 🎵   │ │ 🎵   │               │   │
│  │ │Album │ │Album │ │Album │ │Album │               │   │
│  │ │ Art  │ │ Art  │ │ Art  │ │ Art  │               │   │
│  │ │      │ │      │ │      │ │      │               │   │
│  │ │Summer│ │Night │ │Happy │ │Chill │               │   │
│  │ │Vibes │ │Drive │ │Days  │ │Beats │               │   │
│  │ │2:34  │ │3:12  │ │1:45⚠│ │4:20⚠│               │   │
│  │ │[▶]✓ │ │[▶]  │ │[▶]  │ │[▶]  │               │   │
│  │ └──────┘ └──────┘ └──────┘ └──────┘               │   │
│  │                                                      │   │
│  │ Legenda:                                            │   │
│  │ ✓ = Selecionada | ⚠️ = Duração incompatível        │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  [Cancelar]                    [Confirmar e Continuar]    │
└──────────────────────────────────────────────────────────┘
```

#### 3.2 Componentes de Timeline Interativa

**Biblioteca recomendada:** [Wavesurfer.js](https://wavesurfer.xyz/) com Regions plugin

**Componentes necessários:**

```typescript
// src/components/templates/audio-timeline/
├── AudioWaveformTimeline.tsx   // Timeline principal com waveform
├── TrimHandle.tsx              // Alças de corte arrastáveis
├── PlayheadIndicator.tsx       // Indicador de posição de reprodução
├── LoopIndicator.tsx           // Indicador visual de loop
├── SnapPointMarkers.tsx        // Marcadores de snap points
├── DurationDisplay.tsx         // Display de duração selecionada
└── TimelineZoomControls.tsx    // Controles de zoom da timeline
```

**Pacotes NPM necessários:**
```json
{
  "dependencies": {
    "wavesurfer.js": "^7.8.0",           // Timeline e waveform
    "wavesurfer-regions": "^7.8.0",      // Seleção de trechos
    "react-use": "^17.5.1",               // Hooks utilitários (useAudio, etc)
    "music-metadata-browser": "^2.5.10"   // Metadados de áudio
  }
}
```

#### 3.3 Funcionalidades Avançadas da Timeline

**1. Detecção Inteligente de Refrão:**
- Analisar padrões de volume e repetição
- Sugerir automaticamente o trecho mais "popular" da música
- Botão "Iniciar do Refrão" com IA/heurística

**2. Snap Points Inteligentes:**
- Snap para início/fim do vídeo
- Snap para beats detectados (se BPM disponível)
- Snap para silêncios/pausas na música
- Feedback visual + haptic feedback

**3. Visualizações de Compatibilidade:**
```
Música MENOR que vídeo:
  Música: [████────]
  Vídeo:  [████████]
  Status: 🔁 Música vai se repetir 2x

Música MAIOR que vídeo:
  Música: [████████████]
  Vídeo:  [████]
  Status: ✂️ Música será cortada em 0:30

Música IGUAL ao vídeo:
  Música: [████████]
  Vídeo:  [████████]
  Status: ✓ Duração perfeita!
```

**4. Preview em Tempo Real:**
- Reproduzir trecho ao arrastar trim handles
- Preview de loop visual
- Sincronização com preview do vídeo (opcional)

**5. Gestos e Interações:**
- **Arrastar handles**: Ajustar início/fim
- **Click na timeline**: Mover playhead
- **Scroll/pinch**: Zoom da timeline
- **Double-click**: Reset para duração total
- **Space**: Play/pause do preview
- **Teclas ←/→**: Ajuste fino (frame by frame)

#### 3.4 Estados e Validações

**Estados visuais:**
- ✓ **Compatível**: Música e vídeo têm durações similares (±5s)
- 🔁 **Loop necessário**: Música menor que vídeo
- ✂️ **Corte necessário**: Música maior que vídeo
- ⚠️ **Muito curta**: Música muito menor (>50% diferença)
- ⚠️ **Muito longa**: Música muito maior (>50% diferença)

**Validações:**
- Mínimo de 5 segundos de música selecionada
- Máximo igual à duração total da música
- Avisar se trecho selecionado não cobre todo o vídeo
- Confirmar se usuário quer cortar música no meio

#### 3.5 UX Inspirada no Instagram - Fluxo Completo

**Fluxo do usuário:**

1. **Usuário clica em "Exportar Vídeo"**
2. **Modal abre com 3 opções** (Original / Biblioteca / Sem áudio)
3. **Usuário seleciona "Música da Biblioteca"**
4. **Galeria de músicas aparece** com filtros e busca
5. **Usuário clica em uma música** → Card destaca e preview toca
6. **Timeline interativa aparece** com waveform completo
7. **Sistema sugere automaticamente** o refrão (se detectado)
8. **Usuário arrasta trim handles** para ajustar o trecho
   - Feedback visual em tempo real
   - Preview de áudio ao arrastar
   - Snap points facilitam alinhamento
9. **Usuário ajusta volume** (se necessário)
10. **Usuário confirma** → Modal fecha e exportação inicia

**Diferenciais vs Instagram:**
- ✅ Desktop-first com suporte a mouse/teclado
- ✅ Zoom da timeline para ajustes precisos
- ✅ Waveform visual completo (Instagram só mostra barras simplificadas)
- ✅ Preview em tempo real com sincronização
- ✅ Indicadores visuais de loop/corte
- ✅ Sugestão inteligente de refrão
- ✅ Salvar preferências para reuso

#### 3.6 Integração com Botões de Exportação

**Arquivos a modificar:**
- `src/components/templates/video-export-button.tsx`
- `src/components/templates/video-export-queue-button.tsx`

**Mudanças:**
- Adicionar botão "🎵 Selecionar Música" antes do botão de exportação
- Exibir resumo do áudio selecionado:
  - Badge com tipo de áudio (Original / Música / Mudo)
  - Nome da música se selecionada
  - Trecho selecionado (ex: "0:15 - 0:45")
- Botão de edição para reabrir modal de seleção
- Salvar preferência de áudio no state do editor
- Passar configuração de áudio para função de exportação

**Preview visual:**
```typescript
// Antes da exportação, mostrar card com resumo:
┌────────────────────────────────────────┐
│ 🎵 Áudio: Música da Biblioteca         │
│ "Summer Vibes" - John Doe              │
│ Trecho: 0:15 → 0:45 (30s)             │
│ Volume: 80% | Loop: Sim               │
│ [Editar Música]                        │
└────────────────────────────────────────┘
```

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

    // Para música da biblioteca:
    musicUrl?: string        // URL do áudio da biblioteca
    musicStartTime?: number  // Início do trecho selecionado (segundos)
    musicEndTime?: number    // Fim do trecho selecionado (segundos)

    // Controles de áudio:
    volume?: number          // 0.0 - 1.0
    fadeIn?: number          // duração do fade in (segundos)
    fadeOut?: number         // duração do fade out (segundos)

    // Comportamento de loop/corte:
    loopIfShorter?: boolean  // Loop automático se música for menor que vídeo
  }
}
```

**Lógica a implementar:**

1. **Áudio Original** (já implementado):
   - Manter código atual que captura áudio do vídeo

2. **Música da Biblioteca com Trim + Loop**:
   - Criar elemento `<audio>` com URL da música
   - **Posicionar no trecho selecionado** (`currentTime = musicStartTime`)
   - Usar `AudioContext` para processar a música
   - Sincronizar reprodução da música com a gravação do vídeo
   - Aplicar controle de volume
   - **Implementar loop inteligente** se música for menor que vídeo
   - **Cortar automaticamente** se música for maior que vídeo
   - Aplicar fade in/out se configurado

3. **Sem Áudio**:
   - Não adicionar tracks de áudio ao MediaStream
   - Apenas stream de vídeo (canvas)

**Implementação detalhada com Trim + Loop:**

```typescript
async function setupAudioStreamWithTrim(
  videoElement: HTMLVideoElement,
  videoDuration: number,
  audioConfig: AudioConfig,
  audioContext: AudioContext
): Promise<{
  tracks: MediaStreamAudioTrack[]
  cleanup: () => void
}> {

  if (audioConfig.source === 'none') {
    return { tracks: [], cleanup: () => {} }
  }

  let sourceNode: AudioNode
  let audioElement: HTMLAudioElement | null = null
  let loopInterval: NodeJS.Timeout | null = null

  if (audioConfig.source === 'original') {
    // Código atual - capturar do vídeo
    sourceNode = audioContext.createMediaElementSource(videoElement)
  }
  else if (audioConfig.source === 'music') {
    // NOVO - carregar música da biblioteca com TRIM
    audioElement = new Audio(audioConfig.musicUrl)
    audioElement.crossOrigin = 'anonymous' // Para evitar CORS

    // Calcular duração do trecho selecionado
    const musicStartTime = audioConfig.musicStartTime ?? 0
    const musicEndTime = audioConfig.musicEndTime ?? audioElement.duration
    const selectedDuration = musicEndTime - musicStartTime

    // Posicionar no início do trecho selecionado
    audioElement.currentTime = musicStartTime

    // Aguardar carregar
    await new Promise((resolve) => {
      if (audioElement!.readyState >= 2) {
        resolve(true)
      } else {
        audioElement!.addEventListener('canplay', () => resolve(true), { once: true })
      }
    })

    await audioElement.play()

    // LÓGICA DE LOOP: Se música for menor que vídeo
    if (selectedDuration < videoDuration && audioConfig.loopIfShorter) {
      console.log('[Audio Export] Loop habilitado - música menor que vídeo')

      // Monitorar tempo e fazer loop no trecho selecionado
      loopInterval = setInterval(() => {
        if (audioElement!.currentTime >= musicEndTime) {
          console.log('[Audio Export] Voltando para início do trecho:', musicStartTime)
          audioElement!.currentTime = musicStartTime
        }
      }, 100) // Verificar a cada 100ms

      // Alternativa: usar evento 'timeupdate'
      audioElement.addEventListener('timeupdate', function loopHandler() {
        if (audioElement!.currentTime >= musicEndTime - 0.05) {
          audioElement!.currentTime = musicStartTime
        }
      })
    }

    // LÓGICA DE CORTE: Se música for maior que vídeo
    if (selectedDuration > videoDuration) {
      console.log('[Audio Export] Corte habilitado - música maior que vídeo')

      // Pausar música quando vídeo terminar
      setTimeout(() => {
        audioElement?.pause()
      }, videoDuration * 1000)
    }

    sourceNode = audioContext.createMediaElementSource(audioElement)
  }

  // Aplicar controle de volume com GainNode
  const gainNode = audioContext.createGain()
  gainNode.gain.value = audioConfig.volume ?? 1.0

  // FADE IN: Gradualmente aumentar volume do 0 para o valor configurado
  if (audioConfig.fadeIn && audioConfig.fadeIn > 0) {
    const fadeInDuration = audioConfig.fadeIn
    gainNode.gain.setValueAtTime(0, audioContext.currentTime)
    gainNode.gain.linearRampToValueAtTime(
      audioConfig.volume ?? 1.0,
      audioContext.currentTime + fadeInDuration
    )
  }

  // FADE OUT: Gradualmente diminuir volume no final do vídeo
  if (audioConfig.fadeOut && audioConfig.fadeOut > 0) {
    const fadeOutStart = videoDuration - audioConfig.fadeOut
    const fadeOutEnd = videoDuration

    setTimeout(() => {
      gainNode.gain.linearRampToValueAtTime(
        0,
        audioContext.currentTime + audioConfig.fadeOut!
      )
    }, fadeOutStart * 1000)
  }

  // Conectar nodes
  sourceNode.connect(gainNode)

  const destination = audioContext.createMediaStreamDestination()
  gainNode.connect(destination)

  // Conectar ao output padrão para o usuário ouvir durante exportação
  gainNode.connect(audioContext.destination)

  // Função de cleanup para parar loops e liberar recursos
  const cleanup = () => {
    if (loopInterval) {
      clearInterval(loopInterval)
    }
    if (audioElement) {
      audioElement.pause()
      audioElement.src = ''
    }
  }

  return {
    tracks: destination.stream.getAudioTracks(),
    cleanup
  }
}
```

**Desafios técnicos do Trim + Loop:**

1. **Precisão do Loop:**
   - `currentTime` não é 100% preciso (pode ter drift de ~50ms)
   - Solução: Verificar tempo a cada 100ms e ajustar
   - Alternativa: Pré-processar áudio criando buffer duplicado

2. **Sincronização Áudio/Vídeo:**
   - Áudio e vídeo podem dessincronizar durante gravação longa
   - Solução: Usar timestamps do AudioContext para sincronização precisa
   - Monitorar `videoElement.currentTime` e `audioElement.currentTime`

3. **Gap no Loop:**
   - Pode haver pequeno silêncio entre loops
   - Solução: Usar Web Audio API com AudioBufferSourceNode
   - Pre-carregar trecho em buffer e fazer loop seamless

**Implementação alternativa com AudioBuffer (loop perfeito):**

```typescript
// Para loop sem gaps, usar AudioBufferSourceNode
async function createLoopedAudioBuffer(
  audioContext: AudioContext,
  audioUrl: string,
  startTime: number,
  endTime: number,
  videoDuration: number
): Promise<AudioBufferSourceNode> {

  // 1. Carregar áudio completo
  const response = await fetch(audioUrl)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  // 2. Extrair trecho selecionado (trim)
  const sampleRate = audioBuffer.sampleRate
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const selectedLength = endSample - startSample

  const selectedBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    selectedLength,
    sampleRate
  )

  // Copiar dados do trecho selecionado
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel)
    const destData = selectedBuffer.getChannelData(channel)

    for (let i = 0; i < selectedLength; i++) {
      destData[i] = sourceData[startSample + i]
    }
  }

  // 3. Criar source node com loop
  const source = audioContext.createBufferSource()
  source.buffer = selectedBuffer
  source.loop = true // Loop perfeito sem gaps!
  source.loopStart = 0
  source.loopEnd = selectedBuffer.duration

  return source
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

## 🎨 Inspiração: Interface do Instagram

### Como o Instagram implementa a seleção de música:

**1. Seleção de Música (Instagram Stories/Reels):**
- Sticker de música abre biblioteca com busca
- Preview de áudio ao clicar em cada música
- Começa automaticamente do **refrão** da música
- Limite de 15 segundos para Stories, até 90s para Reels

**2. Timeline de Ajuste:**
- **Slider horizontal** com forma de onda simplificada
- **Alças de corte** nas extremidades (trim handles)
- **Frame box visual** destacando o trecho selecionado
- Arraste intuitivo com feedback tátil (mobile)
- Duração é exibida em tempo real

**3. Características da UX:**
- ✅ **Simplicidade**: Interface minimalista focada na tarefa
- ✅ **Feedback imediato**: Preview toca ao selecionar música
- ✅ **Smart defaults**: Começa do refrão automaticamente
- ✅ **Visual claro**: Waveform mostra estrutura da música
- ✅ **Gestos naturais**: Arrastar é intuitivo no mobile

### Melhorias implementadas neste plano:

**1. Desktop-First com Precisão:**
- Suporte a mouse para ajustes mais precisos
- Zoom da timeline para edição detalhada
- Atalhos de teclado (Space, ←/→, etc)
- Trim handles maiores para melhor usabilidade

**2. Waveform Completo:**
- Instagram: Barras simplificadas
- Nossa solução: Waveform real usando Wavesurfer.js
- Melhor visualização da estrutura da música
- Identificação visual de beats e silêncios

**3. Controles Avançados:**
- Volume ajustável (Instagram não tem)
- Fade in/out opcional
- Loop visual quando música repete
- Indicadores de compatibilidade (⚠️ muito curta, ✂️ será cortada)

**4. Inteligência Adicional:**
- Detecção de refrão com IA/heurística
- Snap points em beats detectados
- Sugestão automática do melhor trecho
- Preview sincronizado com vídeo

**5. Gerenciamento Profissional:**
- Biblioteca organizada por gênero e mood
- Filtros e busca avançada
- Upload de músicas pelo admin
- Estatísticas de uso

### Fluxo comparativo:

| Etapa | Instagram | Nossa Solução |
|-------|-----------|---------------|
| 1. Abrir seleção | Tap no sticker música | Click em "🎵 Selecionar Música" |
| 2. Escolher música | Scroll + busca | Grid cards + filtros + busca |
| 3. Preview | Toca automaticamente do refrão | Preview ao clicar + sugestão de refrão |
| 4. Ajustar trecho | Slider com alças | Timeline com waveform + zoom |
| 5. Confirmar | Tap em "Concluído" | "Confirmar e Continuar" |
| 6. Volume | Não disponível | Slider 0-100% |
| 7. Loop/Corte | Automático (sem feedback) | Visual com indicadores claros |

### Elementos visuais adaptados:

**Do Instagram:**
- ✅ Radio buttons para tipo de áudio
- ✅ Grid de músicas com preview inline
- ✅ Timeline horizontal com alças
- ✅ Frame box destacando seleção
- ✅ Badges de duração

**Adicionados:**
- ⭐ Waveform visual detalhado
- ⭐ Zoom da timeline
- ⭐ Snap points visuais
- ⭐ Indicadores de loop/corte
- ⭐ Controles de volume e fade
- ⭐ Botão "Refrão" inteligente

### Biblioteca recomendada para implementação:

**[Wavesurfer.js](https://wavesurfer.xyz/) v7.8.0**
- Waveform renderizado em Canvas/SVG
- Plugin Regions para trim handles
- Plugin Timeline para marcadores de tempo
- Suporte a zoom e scroll
- API simples e bem documentada
- Performance otimizada

**Exemplo de uso:**
```typescript
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions'

const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#ddd',
  progressColor: '#3b82f6',
  height: 80,
  plugins: [
    RegionsPlugin.create({
      dragSelection: true, // Permite criar regiões arrastando
    })
  ]
})

// Carregar música
await wavesurfer.load(musicUrl)

// Criar região (trecho selecionado)
const region = wavesurfer.registerPlugin(RegionsPlugin.create())
region.addRegion({
  start: 15, // segundos
  end: 45,   // segundos
  color: 'rgba(59, 130, 246, 0.3)',
  drag: true,
  resize: true
})

// Ouvir mudanças
region.on('region-updated', (region) => {
  console.log('Novo trecho:', region.start, '-', region.end)
})
```

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
