# Sistema de Seleção de Modelos de IA

## Visão Geral

O sistema de geração de imagens agora permite que os usuários escolham entre diferentes modelos de IA, cada um com características únicas de qualidade, velocidade e custo.

## Modelos Disponíveis

> Total: **8 modelos** organizados por tier de preço e especialidade

### 🚀 Tier Econômico

#### 1. FLUX Schnell (Ultra Econômico)

**Provider**: Black Forest Labs
**Status**: Melhor para testes e iterações

**Características**:
- **Custo**: 1 crédito por imagem (13x mais barato que FLUX Pro!)
- **Velocidade**: <1 segundo
- **Resolução**: Até 1024x1024px
- **Imagens de referência**: Não suporta

**Features**:
- Geração ultra-rápida
- Menor custo do mercado
- Ideal para testes e iterações
- Mesma arquitetura do FLUX Pro (4 steps)
- Ótimo custo-benefício

**Quando usar**:
- Testar prompts rapidamente
- Experimentar antes de gastar mais créditos
- Produção de rascunhos e conceitos
- Volume alto de imagens

---

### ⚡ Tier Balanceado

#### 2. FLUX 1.1 Pro (Recomendado)

**Provider**: Black Forest Labs
**Status**: Recomendado para melhor custo-benefício

**Características**:
- **Custo**: 4 créditos por imagem
- **Velocidade**: ~3-5 segundos
- **Resolução**: Até 1440x1440px
- **Imagens de referência**: 1 (via image_prompt)

**Features**:
- Geração ultra-rápida
- Excelente seguimento de prompt
- Controle de seed para reprodução
- Prompt upsampling para criatividade
- Melhor custo-benefício do mercado

**Parâmetros adicionais**:
```typescript
{
  seed?: number              // Reprodução determinística
  promptUpsampling?: boolean // Melhoria automática de prompt
  safetyTolerance?: number   // 1-6 (padrão: 2)
  outputQuality?: number     // 0-100 (padrão: 80)
}
```

---

#### 3. Seedream 4 (Realismo)

**Provider**: ByteDance
**Status**: Especialista em realismo

**Características**:
- **Custo variável**:
  - 1K/2K: 3 créditos
  - 4K: 6 créditos
- **Velocidade**: ~8-12 segundos
- **Resolução**: 1K, 2K, 4K ultra HD
- **Imagens de referência**: Até 10

**Features**:
- Realismo excepcional
- Texturas e iluminação superiores
- Resolução até 4K (4096px)
- Enhance prompt automático
- Geração sequencial de imagens
- Perfeito para fotorrealismo

**Quando usar**:
- Fotos ultra-realistas
- Portraits profissionais
- Produtos e arquitetura
- Texturas detalhadas

---

#### 4. Ideogram v3 Turbo (Texto Perfeito) ✨

**Provider**: Ideogram
**Status**: Novo - Especialista em texto

**Características**:
- **Custo**: 3 créditos por imagem
- **Velocidade**: ~4-6 segundos
- **Resolução**: Até 1536x1536px
- **Imagens de referência**: Até 3 (style reference)

**Features**:
- Melhor renderização de texto do mercado
- 50+ estilos artísticos (Oil, Watercolor, Pop Art, etc.)
- Magic Prompt (otimização automática)
- Suporte multi-idioma
- Realismo excepcional
- Inpainting e style reference

**Quando usar**:
- Logos e branding
- Posters com texto
- Designs gráficos
- Infográficos
- Qualquer imagem com texto legível

---

#### 5. Stable Diffusion 3 (Clássico)

**Provider**: Stability AI
**Status**: Modelo tradicional confiável

**Características**:
- **Custo**: 4 créditos por imagem
- **Velocidade**: ~6-10 segundos
- **Resolução**: Até 1536x1536px
- **Imagens de referência**: Não suporta

**Features**:
- Modelo clássico confiável (2B parâmetros)
- Tipografia excelente
- Photorealistic de alta qualidade
- Compreensão complexa de prompts
- Versátil para realismo e arte
- Uso comercial permitido

**Quando usar**:
- Uso geral confiável
- Photorealistic tradicional
- Prompts complexos
- Quando precisar de modelo battle-tested

---

#### 6. Recraft V3 (Design & Arte)

**Provider**: Recraft AI
**Status**: Estado da arte em design

**Características**:
- **Custo**: 4 créditos por imagem
- **Velocidade**: ~5-7 segundos
- **Resolução**: Até 2048x2048px
- **Imagens de referência**: Não suporta

**Features**:
- Textos longos em imagens
- Biblioteca de estilos (realistic, pixel art, hand-drawn)
- Alta resolução (2048x2048)
- Estado da arte em design
- Ilustrações profissionais
- Perfeito para infográficos

**Quando usar**:
- Ilustrações digitais
- Arte conceitual
- Designs com muito texto
- Infográficos complexos
- Pixel art e hand-drawn styles

---

### 👑 Tier Premium

#### 7. Nano Banana Pro (Ultra Qualidade) ✨

**Provider**: Google DeepMind
**Status**: Novo - Gemini 3 Pro Image

**Características**:
- **Custo variável**:
  - 1K/2K: 15 créditos
  - 4K: 30 créditos
- **Velocidade**: ~15-30 segundos
- **Resolução**: 1K, 2K (padrão), 4K ultra HD
- **Imagens de referência**: Até 14

**Features**:
- Resolução 4K ultra HD
- Renderização avançada de texto
- Controles profissionais (luz, câmera, foco)
- Conhecimento de mundo aprimorado
- Safety filter configurável
- Suporte para múltiplas imagens de referência

**Quando usar**:
- Projetos que exigem 4K/ultra HD
- Necessidade de muitas imagens de referência (até 14)
- Renderização precisa de texto em imagens

---

#### 8. Nano Banana (Clássico)

**Provider**: Google
**Status**: Modelo estável

**Características**:
- **Custo**: 10 créditos por imagem
- **Velocidade**: ~10-20 segundos
- **Resolução**: Até 1024x1024px
- **Imagens de referência**: Até 8

**Features**:
- Modelo estável e testado
- Boa qualidade geral
- Múltiplos aspect ratios

---

## Comparativo Completo

| Modelo | Custo | Velocidade | Resolução | Ref. Images | Especialidade |
|--------|-------|------------|-----------|-------------|---------------|
| **FLUX Schnell** 🚀 | 1 crédito | <1s | 1024px | 0 | Testes rápidos |
| **Seedream 4 (2K)** ⭐ | 3 créditos | ~10s | 2K | 10 | Realismo |
| **Ideogram v3 Turbo** ✨ | 3 créditos | ~5s | 1536px | 3 | Texto perfeito |
| **FLUX 1.1 Pro** ⚡ | 4 créditos | ~4s | 1440px | 1 | Custo-benefício |
| **Stable Diffusion 3** 🏆 | 4 créditos | ~8s | 1536px | 0 | Clássico |
| **Recraft V3** 🎨 | 4 créditos | ~6s | 2048px | 0 | Design/Arte |
| **Seedream 4 (4K)** 👑 | 6 créditos | ~12s | 4K | 10 | Ultra realismo |
| **Nano Banana** | 10 créditos | ~15s | 1024px | 8 | Estável |
| **Nano Banana Pro (2K)** | 15 créditos | ~20s | 2K | 14 | Google Premium |
| **Nano Banana Pro (4K)** | 30 créditos | ~25s | 4K | 14 | Ultra Premium |

### Recomendações por Caso de Uso

**Para experimentar/testar prompts:**
- 🥇 FLUX Schnell (1 crédito)
- 🥈 Seedream 4 2K (3 créditos)

**Para produção geral:**
- 🥇 FLUX 1.1 Pro (4 créditos)
- 🥈 Stable Diffusion 3 (4 créditos)

**Para realismo extremo:**
- 🥇 Seedream 4 4K (6 créditos)
- 🥈 Seedream 4 2K (3 créditos)

**Para texto em imagens:**
- 🥇 Ideogram v3 Turbo (3 créditos)
- 🥈 Stable Diffusion 3 (4 créditos)

**Para design e ilustração:**
- 🥇 Recraft V3 (4 créditos)
- 🥈 Ideogram v3 Turbo (3 créditos)

**Para máxima qualidade (sem limite de custo):**
- 🥇 Nano Banana Pro 4K (30 créditos)
- 🥈 Seedream 4 4K (6 créditos)

---

## Interface do Usuário

### Seletor de Modelo

O componente `AIModelSelector` exibe:

1. **Lista de modelos** com badges visuais:
   - ⚡ Recomendado (FLUX 1.1 Pro)
   - ✨ Novo (Nano Banana Pro)

2. **Detalhes do modelo selecionado**:
   - Descrição
   - Features principais (3 primeiras)
   - Grid de informações:
     - Resolução máxima
     - Limite de imagens de referência
     - Velocidade média
     - Custo em créditos

### Seletor de Resolução

Aparece **apenas** para modelos que suportam múltiplas resoluções (Nano Banana Pro):

- **1K**: 15 créditos
- **2K**: 15 créditos (padrão)
- **4K**: 30 créditos 👑

---

## Arquitetura Técnica

### Configuração de Modelos

Arquivo: [src/lib/ai/image-models-config.ts](../src/lib/ai/image-models-config.ts)

```typescript
export const AI_IMAGE_MODELS: Record<AIImageModel, AIImageModelConfig> = {
  'flux-1.1-pro': { /* configuração */ },
  'nano-banana-pro': { /* configuração */ },
  'nano-banana': { /* configuração */ },
}
```

**Helpers disponíveis**:
```typescript
getRecommendedModel()           // Retorna FLUX 1.1 Pro
getModelById(id)                // Busca modelo por ID
calculateCreditsForModel(id, resolution) // Calcula custo
getAvailableModels()            // Lista modelos não deprecated
```

### API Endpoint

**POST** `/api/ai/generate-image`

**Request body**:
```typescript
{
  projectId: number
  prompt: string
  aspectRatio: string
  model: 'flux-1.1-pro' | 'nano-banana-pro' | 'nano-banana'
  resolution?: '1K' | '2K' | '4K'  // Apenas para nano-banana-pro
  referenceImages?: string[]

  // Parâmetros específicos do FLUX
  seed?: number
  promptUpsampling?: boolean
  safetyTolerance?: number        // 1-6
  outputQuality?: number          // 0-100
}
```

**Response**:
```typescript
{
  id: number
  name: string
  fileUrl: string
  width: number
  height: number
  model: string
  provider: string
  // ... outros campos
}
```

### Fluxo de Geração

```
1. Usuário seleciona modelo e parâmetros
   ↓
2. Frontend calcula custo dinâmico
   ↓
3. Validação de créditos (quantidade específica do modelo)
   ↓
4. Upload de imagens de referência → Vercel Blob
   ↓
5. API cria prediction no Replicate com modelo escolhido
   ↓
6. Configuração específica por modelo:
   - FLUX: image_prompt (1 imagem), seed, prompt_upsampling
   - Nano Banana: image_input (múltiplas), resolution, safety_filter
   ↓
7. Polling até conclusão
   ↓
8. Upload da imagem gerada → Vercel Blob
   ↓
9. Dedução de créditos (quantidade calculada)
   ↓
10. Retorno da imagem ao usuário
```

---

## Sistema de Créditos Dinâmico

### Cálculo de Custo

A função `calculateCreditsForModel()` retorna o custo baseado em:

1. **Modelo selecionado**
2. **Resolução** (quando aplicável)

**Exemplos**:
```typescript
calculateCreditsForModel('flux-1.1-pro')           // 4
calculateCreditsForModel('nano-banana-pro', '2K')  // 15
calculateCreditsForModel('nano-banana-pro', '4K')  // 30
calculateCreditsForModel('nano-banana')            // 10
```

### Validação de Créditos

No frontend:
```typescript
const creditsRequired = calculateCreditsForModel(selectedModel, resolution)

if (!credits || credits.creditsRemaining < creditsRequired) {
  toast({
    description: `Créditos insuficientes (necessário: ${creditsRequired})`
  })
  return
}
```

No backend:
```typescript
await validateCreditsForFeature(userId, 'ai_image_generation', creditsRequired)
```

### Dedução de Créditos

```typescript
await deductCreditsForFeature({
  clerkUserId: userId,
  feature: 'ai_image_generation',
  quantity: creditsRequired,  // Quantidade dinâmica
  details: {
    model: 'flux-1.1-pro',
    resolution: '2K',
    prompt: '...',
  }
})
```

---

## Configuração do Replicate

### FLUX 1.1 Pro

```typescript
const inputData = {
  prompt: string,
  aspect_ratio: string,
  output_format: 'png',
  output_quality: 80,
  safety_tolerance: 2,
  prompt_upsampling: false,
  seed?: number,
  image_prompt?: string  // Primeira imagem de referência
}
```

### Nano Banana Pro

```typescript
const inputData = {
  prompt: string,
  aspect_ratio: string,
  output_format: 'png',
  resolution: '1K' | '2K' | '4K',
  safety_filter_level: 'block_only_high',
  image_input?: string[]  // Até 14 imagens
}
```

### Nano Banana

```typescript
const inputData = {
  prompt: string,
  aspect_ratio: string,
  output_format: 'png',
  image_input?: string[]  // Até 8 imagens
}
```

---

## Componentes Criados

### 1. AIModelSelector

**Arquivo**: [src/components/ai/ai-model-selector.tsx](../src/components/ai/ai-model-selector.tsx)

**Props**:
```typescript
interface AIModelSelectorProps {
  value: AIImageModel
  onValueChange: (value: AIImageModel) => void
  disabled?: boolean
}
```

**Features**:
- Lista de modelos com badges
- Detalhes expandidos do modelo selecionado
- Tooltip com informações
- Visual de recomendação/novo

### 2. ResolutionSelector

**Props**:
```typescript
interface ResolutionSelectorProps {
  model: AIImageModel
  value?: '1K' | '2K' | '4K'
  onValueChange: (value) => void
  disabled?: boolean
}
```

**Features**:
- Apenas visível para modelos que suportam
- Mostra custo por resolução
- Badge especial para 4K 👑

---

## Estado do Formulário

```typescript
const [selectedModel, setSelectedModel] = useState<AIImageModel>('flux-1.1-pro')
const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K')

// Custo calculado dinamicamente
const cost = useMemo(
  () => calculateCreditsForModel(selectedModel, resolution),
  [selectedModel, resolution]
)
```

---

## Migrações e Compatibilidade

### Dados Existentes

Imagens geradas antes desta atualização:
- Terão `model: 'nano-banana'` no banco
- Serão exibidas normalmente na biblioteca
- Não afetam funcionalidade

### Schema do Banco

```prisma
model AIGeneratedImage {
  // ...
  model         String   @default("nano-banana")
  provider      String   @default("replicate")
  // ...
}
```

Agora aceita:
- `model`: "flux-1.1-pro", "nano-banana-pro", "nano-banana"
- `provider`: "black forest labs", "google deepmind", "google"

---

## Roadmap Futuro

### Planejado
- [ ] Modelo FLUX Dev (mais barato, open-source)
- [ ] Modelo FLUX Schnell (ultra-rápido)
- [ ] Stable Diffusion 3
- [ ] Ideogram v3

### Considerado
- [ ] Controles avançados por modelo
- [ ] Preset de configurações
- [ ] Histórico de modelos usados
- [ ] Comparação lado a lado

---

## FAQ

**Q: Qual modelo devo usar?**
A: Para a maioria dos casos, use **FLUX 1.1 Pro** - melhor custo-benefício e velocidade. Use Nano Banana Pro se precisar de 4K ou muitas imagens de referência.

**Q: Por que FLUX é mais barato?**
A: FLUX é otimizado para velocidade e eficiência, resultando em menor custo de processamento.

**Q: Posso usar 14 imagens de referência com FLUX?**
A: Não, FLUX suporta apenas 1 imagem de referência via `image_prompt`. Para múltiplas, use Nano Banana Pro.

**Q: 4K vale a pena?**
A: Depende do uso. Para redes sociais (1080p), 2K é suficiente. Para impressão ou banners grandes, 4K pode ser necessário.

**Q: Modelos antigos continuam funcionando?**
A: Sim! Todas as imagens geradas com o modelo antigo continuam acessíveis.

---

**Última atualização**: 2025-12-01
**Versão**: 2.0
**Autor**: Studio Lagosta Team
