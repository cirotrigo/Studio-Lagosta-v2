---
status: active
generated: 2026-02-05
phases:
  - id: "phase-1"
    name: "Setup & Infraestrutura"
    prevc: "P"
  - id: "phase-2"
    name: "Implementação do Provider Gemini"
    prevc: "E"
  - id: "phase-3"
    name: "Integração no Fluxo Existente"
    prevc: "E"
  - id: "phase-4"
    name: "Validação & Testes"
    prevc: "V"
---

# Geração de Imagens Direta via API Gemini

> Implementar geração de imagens diretamente pela API do Google Gemini, eliminando a dependência do Replicate para modelos Google (nano-banana-pro e nano-banana). Usar a chave `GOOGLE_GENERATIVE_AI_API_KEY` já configurada no `.env` e instalar o SDK `@google/genai`.

## Contexto e Motivação

### Problema Atual
- Os modelos Gemini (nano-banana-pro = Gemini 3 Pro Image, nano-banana = Gemini 2.5 Flash Image) passam pelo **Replicate** como proxy
- O Replicate adiciona latência, instabilidade e custos extras
- Erros frequentes: "deployment deadline exceeded", "Failed to generate image after multiple retries"
- Timeout de 300s do Vercel é consumido pelo overhead do Replicate

### Solução
- Chamar a API do Gemini **diretamente** usando o SDK `@google/genai`
- Manter os mesmos modelos existentes mas com comunicação direta
- Reduzir latência e melhorar confiabilidade
- Manter Replicate como provider para outros modelos (FLUX, Seedream, Ideogram, Recraft, Stable Diffusion)

## Infraestrutura Existente

### Já configurado
- `GOOGLE_GENERATIVE_AI_API_KEY` no `.env` (ativa)
- `@ai-sdk/google` v2.0.44 no package.json (usado no chat, não na geração de imagens)
- Integração Google já funciona no chat (`src/app/api/ai/chat/route.ts`)

### A instalar
- `@google/genai` - SDK nativo do Google para geração de imagens (diferente do `@ai-sdk/google`)

## Modelos Gemini para Imagem

| Modelo Gemini | Model ID na API | Equivalente Atual | Preço/Imagem |
|---|---|---|---|
| Gemini 2.5 Flash Image | `gemini-2.5-flash-image` | `nano-banana` | $0.039 |
| Gemini 3 Pro Image Preview | `gemini-3-pro-image-preview` | `nano-banana-pro` | $0.134 (2K), $0.24 (4K) |

### Capacidades
- **Geração**: texto -> imagem
- **Edição**: imagem + texto -> imagem editada
- **Referências**: até 14 imagens de referência (Gemini 3 Pro)
- **Aspect ratios**: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
- **Resoluções**: 1K, 2K, 4K
- **Resposta**: Base64 inline (não URL como Replicate)

## Fases de Implementação

### Phase 1 — Setup & Infraestrutura

**Objetivo**: Instalar SDK e criar o client do Gemini para geração de imagens.

**Steps:**

1. **Instalar o SDK `@google/genai`**
   ```bash
   npm install @google/genai
   ```

2. **Criar client Gemini para imagens** em `src/lib/ai/gemini-image-client.ts`
   ```typescript
   import { GoogleGenAI } from '@google/genai'

   // Singleton do client Gemini
   const geminiClient = new GoogleGenAI({
     apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
   })

   export { geminiClient }
   ```

3. **Criar função de geração de imagem** em `src/lib/ai/gemini-image-client.ts`
   - Função `generateImageWithGemini(params)` que:
     - Recebe: prompt, model, aspectRatio, resolution, referenceImages?, baseImage?
     - Monta o `contents` array com texto e imagens inline
     - Configura `imageConfig` com aspectRatio e imageSize
     - Retorna: `{ imageBuffer: Buffer, mimeType: string }`
   - Função `editImageWithGemini(params)` para modo edição

---

### Phase 2 — Implementação do Provider Gemini

**Objetivo**: Implementar as funções de geração e edição usando a API direta do Gemini.

**Steps:**

1. **Implementar `generateImageWithGemini`**
   ```typescript
   interface GeminiImageParams {
     model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
     prompt: string
     aspectRatio?: string
     resolution?: '1K' | '2K' | '4K'
     referenceImages?: Buffer[] // Imagens de referência como buffers
     referenceImageTypes?: string[] // mime types
     mode?: 'generate' | 'edit'
     baseImage?: Buffer // Imagem base para edição
     baseImageType?: string // mime type da imagem base
   }

   interface GeminiImageResult {
     imageBuffer: Buffer
     mimeType: string
   }
   ```

2. **Implementar conversão de parâmetros**
   - Mapear `nano-banana-pro` -> `gemini-3-pro-image-preview`
   - Mapear `nano-banana` -> `gemini-2.5-flash-image`
   - Converter referenceImages de URLs para Buffers (já temos a lógica de fetch)

3. **Implementar tratamento de erros Gemini**
   - Safety filter blocks -> mensagem em português
   - Rate limiting -> retry com backoff
   - Token/quota errors -> mensagem clara
   - Timeout errors -> fallback para Replicate

4. **Mapeamento de aspect ratios**
   - Validar que aspect ratios do config são suportados pela API Gemini
   - Aspecto `match_input_image` -> não enviar aspectRatio (API infere)

---

### Phase 3 — Integração no Fluxo Existente

**Objetivo**: Integrar o provider Gemini na rota `generate-image/route.ts` existente.

**Steps:**

1. **Modificar `generate-image/route.ts`**
   - Antes de chamar `createReplicatePrediction`, verificar se o modelo é Gemini
   - Se for modelo Gemini (`nano-banana-pro` ou `nano-banana`), usar `generateImageWithGemini`
   - Se não, manter o fluxo Replicate existente
   - Lógica:
     ```typescript
     const isGeminiModel = ['nano-banana-pro', 'nano-banana'].includes(body.model)

     if (isGeminiModel) {
       // Fluxo direto Gemini
       const geminiResult = await generateImageWithGemini({...})
       // Upload buffer para Vercel Blob
       // Continuar com save no banco
     } else {
       // Fluxo Replicate existente (com retry/fallback)
     }
     ```

2. **Adaptar upload para Vercel Blob**
   - Replicate retorna uma URL -> fazemos fetch + upload
   - Gemini retorna base64 Buffer -> fazemos upload direto (mais rápido)

3. **Manter sistema de retry**
   - Se Gemini falhar, tentar novamente com Gemini (1 retry)
   - Se falhar 2x, fallback para Seedream 4 via Replicate (já implementado)

4. **Atualizar `image-models-config.ts`**
   - Adicionar campo `provider: 'gemini-direct'` vs `provider: 'replicate'` para diferenciar
   - Ou usar um campo `apiProvider` para saber qual API chamar

---

### Phase 4 — Validação & Testes

**Objetivo**: Validar que tudo funciona corretamente.

**Steps:**

1. **Testar geração com Gemini 2.5 Flash Image** (`nano-banana`)
   - Geração simples com prompt
   - Com diferentes aspect ratios
   - Com imagens de referência

2. **Testar geração com Gemini 3 Pro Image** (`nano-banana-pro`)
   - Geração em 1K, 2K e 4K
   - Edição de imagem (base image + prompt)
   - Com múltiplas referências (até 3)

3. **Testar fallback**
   - Simular erro Gemini -> verificar fallback para Seedream 4
   - Verificar que créditos são cobrados corretamente

4. **Testar upload para Google Drive**
   - Verificar que imagem gerada pelo Gemini é salva corretamente no Drive
   - Verificar nome do arquivo com prefixo `_IA-`

5. **Verificar typecheck e build**
   ```bash
   npm run typecheck
   npm run build
   ```

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/lib/ai/gemini-image-client.ts` | **CRIAR** | Client Gemini para geração de imagens |
| `src/app/api/ai/generate-image/route.ts` | **MODIFICAR** | Adicionar branch para Gemini direto |
| `src/lib/ai/image-models-config.ts` | **MODIFICAR** | Adicionar campo `apiProvider` |
| `package.json` | **MODIFICAR** | Adicionar `@google/genai` |

## Vantagens da Migração

| Aspecto | Via Replicate | Via Gemini Direto |
|---|---|---|
| **Latência** | +2-5s overhead | Direto ao Google |
| **Confiabilidade** | Intermediário pode falhar | Menos pontos de falha |
| **Custo** | Replicate markup + Google | Apenas Google |
| **Timeout** | Replicate + Vercel | Apenas Vercel |
| **Resposta** | URL -> fetch -> upload | Base64 -> upload direto |
| **Cold boot** | Modelo no Replicate | Modelo no Google (sempre quente) |

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| SDK `@google/genai` não compatível com Edge Runtime | Usar `runtime = 'nodejs'` (já configurado) |
| Rate limiting do Gemini | Retry com backoff + fallback Replicate/Seedream |
| Mudança na API do Gemini (preview) | Manter Replicate como fallback |
| Buffer grande em memória (4K) | Limitar a 10MB (já implementado) |
| Free tier com limite de 1500 req/dia | Monitorar uso, upgradar se necessário |
