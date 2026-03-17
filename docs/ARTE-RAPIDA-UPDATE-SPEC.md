# Arte Rapida - Update Spec

## Objetivo

Atualizar a Arte Rapida para gerar criativos com menos friccao para o social media, mantendo o wizard atual curto e movendo a inteligencia de copy e composicao para um pipeline backend unico.

Objetivos principais:
- Gerar imagem e copy inicial com um clique a partir do template escolhido.
- Usar o template real para limitar a copy aos campos existentes.
- Buscar contexto na base de conhecimento antes da copy.
- Permitir analise opcional da imagem para enriquecer contexto da copy.
- Manter a etapa final de ajustes como ponto de revisao humana antes de agendar.

Nao objetivos:
- Adicionar uma nova etapa visivel no wizard para revisar copy antes da geracao.
- Trocar o provider de imagem do Gemini por outro provider.
- Reescrever o editor ou o fluxo de agendamento.

## Resumo Executivo

A melhor estrategia para a Arte Rapida e manter o fluxo visivel atual:

`Modelo -> Imagem -> Ajustes -> Agendar`

Mas transformar a etapa `Imagem` em um orquestrador de geracao rapida:

1. Ler o template escolhido e extrair os campos reais do canvas.
2. Buscar contexto na base de conhecimento do projeto.
3. Opcionalmente analisar a imagem escolhida para contexto adicional.
4. Gerar copy estruturada apenas para os campos existentes.
5. Gerar imagem com prompt tecnico e contexto composicional do template.
6. Preencher automaticamente `textValues` e `imageValues`.
7. Levar o usuario para `Ajustes`, onde ele pode revisar e corrigir antes de finalizar.

## Status Atual da Implementacao

Implementado nesta fase:
- cliente Gemini atualizado para configuracao nativa de imagem
- endpoint `quick-generate` com copy + imagem no mesmo pipeline
- extracao de `templateContext` a partir das camadas reais
- preenchimento automatico de `textValues` por `layer.id`
- preenchimento automatico da primeira imagem dinamica suportada
- enforcement real de limites por campo (`maxLines`, `maxWords`, `maxCharactersPerLine`)
- reescrita e ajuste deterministico quando a copy nao cabe no template
- semantica explicita de campos no prompt:
  - `pre_title` = assunto
  - `title` = headline / nome do prato
  - `description` = complemento
  - `footer_info_1` = dia, horario, assunto complementar
  - `footer_info_2` = apoio do rodape 1 com horario, endereco, CTA ou contexto
- fallback semantico para campos vazios, principalmente rodape
- recomendacao automatica de template com brief opcional na etapa `Modelo`

Ainda simplificado nesta fase:
- templates com multiplas imagens dinamicas recebem preenchimento automatico apenas na primeira imagem
- ranking de template ainda e heuristico, nao treinado por performance historica
- revisao final continua centralizada em `Ajustes`

## Diagnostico do Estado Atual

### 1. O projeto ja usa Gemini direto

Hoje a geracao de imagem ja usa API direta do Google Gemini via SDK oficial `@google/genai`, com `GOOGLE_GENERATIVE_AI_API_KEY`.

Arquivos:
- `src/lib/ai/gemini-image-client.ts`
- `src/app/api/ai/generate-image/route.ts`

Mapeamento atual:
- `nano-banana-2` -> `gemini-3.1-flash-image-preview`
- `nano-banana-pro` -> `gemini-3-pro-image-preview`

Isso esta alinhado com a familia mais atual de modelos Nano Banana disponivel na documentacao oficial do Gemini.

### 2. A documentacao interna esta desatualizada

O arquivo `docs/ai-image-generation.md` ainda descreve:
- Gemini 2.5 Flash Image
- uso via Replicate

Isso nao reflete mais a implementacao real do projeto.

### 3. O cliente Gemini precisa ser atualizado para o formato oficial atual

Hoje `src/lib/ai/gemini-image-client.ts`:
- envia `responseModalities: ['IMAGE']`
- monta `aspect ratio` no texto do prompt

Pela documentacao oficial atual do Gemini, o cliente deve preferir `imageConfig.aspectRatio` e configuracoes nativas do request, em vez de depender do texto do prompt para isso.

Impacto:
- menor ambiguidade para o modelo
- comportamento mais previsivel por formato
- base melhor para evoluir a Arte Rapida

### 4. O sistema ja tem um motor bom de copy, mas ele ainda nao orquestra a Arte Rapida

`src/app/api/tools/generate-ai-text/route.ts` ja suporta:
- contexto da base de conhecimento
- `analyzeImageForContext`
- `templateContext`
- tom e objetivo

Isso significa que a base da copy inteligente ja existe e deve ser reaproveitada.

### 5. O ponto fraco atual e o vinculo entre copy semantica e campos reais do template

O motor de copy pensa em slots semanticos como:
- `pre_title`
- `title`
- `description`
- `cta`
- `badge`
- `footer_info_1`
- `footer_info_2`

Mas o editor final trabalha por `layer.id`, via `textValues`.

Sem um mapeamento explicito `slot -> layer.id`, a copy pode estar semanticamente correta e ainda assim nao corresponder aos campos reais do canvas.

### 6. O produto ja permite ajuste humano depois da geracao

A etapa `Ajustes` ja permite editar os textos antes de finalizar.

Conclusao de produto:
- a IA nao precisa acertar 100% antes da geracao
- a IA precisa gerar uma primeira versao boa e rapida
- a revisao final continua sendo do usuario

## Decisao de Produto

### Fluxo recomendado

Manter o wizard atual sem adicionar uma etapa nova:

1. `Modelo`
2. `Imagem`
3. `Ajustes`
4. `Agendar`

### Comportamento novo da etapa `Imagem`

A etapa `Imagem` passa a oferecer um modo de `Gerar arte rapida`, com opcoes simples:
- usar base de conhecimento
- analisar imagem para contexto
- tom
- objetivo

Ao clicar em gerar:
- a copy e gerada primeiro, mas de forma invisivel ao usuario
- a imagem e gerada em seguida
- ambos os resultados entram no contexto do wizard

### Principio central

`Analise de template e geracao de copy devem ser invisiveis no UX, mas obrigatorias no pipeline backend.`

## Spec Tecnica

## 1. Atualizacao do cliente Gemini

### Arquivo alvo
- `src/lib/ai/gemini-image-client.ts`

### Mudancas

1. Corrigir comentarios desatualizados que ainda falam em "Gemini 2.0 Flash".
2. Atualizar a montagem do request para usar configuracao oficial atual do Gemini.
3. Passar `aspectRatio` por configuracao nativa do request, nao apenas por texto no prompt.
4. Manter suporte a referencias visuais e imagem base para edit.

### Requisito

O request deve seguir o formato recomendado pela documentacao oficial atual do Gemini Image Generation.

### Compatibilidade

Se houver limitacao especifica de modelo ou SDK para alguma opcao visual, manter fallback de compatibilidade controlado no cliente.

## 2. Novo pipeline orquestrado de Arte Rapida

### Novo endpoint
- `POST /api/gerar-criativo/quick-generate`

### Responsabilidade

Orquestrar todo o fluxo de Arte Rapida em uma unica chamada backend:

1. carregar pagina modelo
2. extrair contexto do template
3. buscar contexto na base de conhecimento
4. opcionalmente analisar imagem para contexto
5. gerar copy estruturada
6. mapear copy para `layer.id`
7. montar prompt de imagem com contexto do template
8. gerar imagem
9. retornar `textValues`, `imageValues`, warnings e metadados

### Payload de entrada

```ts
type QuickGenerateRequest = {
  projectId: number
  modelPageId: string
  prompt: string
  photoUrl?: string
  referenceImages?: string[]
  useKnowledgeBase: boolean
  analyzeImageForContext: boolean
  tone?: 'casual' | 'profissional' | 'urgente' | 'inspirador' | null
  objective?: 'promocao' | 'institucional' | 'agenda' | 'oferta' | null
}
```

### Payload de saida

```ts
type QuickGenerateResponse = {
  image: {
    url: string
    aiImageId?: string
    appliedToLayerId?: string
  }
  textValues: Record<string, string>
  copy: {
    semanticSlots: Record<string, string>
    layerMapping: Array<{
      slotKey: string
      layerId: string
      appliedText: string
    }>
  }
  context: {
    knowledgeApplied: boolean
    imageAnalysisApplied: boolean
    warnings: string[]
    conflicts: string[]
  }
}
```

## 3. Extracao de contexto do template real

### Novo util
- `src/lib/gerar-criativo/template-context.ts`

### Responsabilidade

Extrair `templateContext` a partir das camadas reais da pagina modelo.

### Saida esperada

```ts
type ExtractedTemplateContext = {
  templateId: string
  templateName: string
  format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'
  pageId: string
  pageName: string
  slots: Array<{
    fieldKey: 'pre_title' | 'title' | 'description' | 'cta' | 'badge' | 'footer_info_1' | 'footer_info_2'
    layerId: string
    layerName: string
    currentText: string
    fontSize: number
    maxLines: number
    priority: 'primary' | 'secondary' | 'tertiary'
    textLength: number
    wordCount: number
  }>
  visualHierarchy: {
    primarySlot: string | null
    secondarySlots: string[]
    slotOrder: string[]
    layoutStyle: 'hero-title' | 'balanced' | 'info-dense' | 'minimal'
  }
  stats: {
    totalSlots: number
    filledSlots: number
    totalWordCount: number
    averageTextLength: number
    textDensity: 'low' | 'medium' | 'high'
  }
  slotToLayerMap: Record<string, string>
}
```

### Regras

1. Considerar apenas camadas `text` e `rich-text`.
2. Priorizar camadas `isDynamic === true`.
3. Ignorar textos fixos institucionais quando claramente nao forem editaveis.
4. Inferir `fieldKey` por nome da camada, tamanho visual e ordem.
5. Retornar sempre o mapeamento para `layer.id`.

## 4. Reuso do motor de copy existente

### Arquivo alvo
- `src/app/api/tools/generate-ai-text/route.ts`

### Estrategia

Extrair a logica principal para um servico reutilizavel, por exemplo:
- `src/lib/ai/generate-ai-text.ts`

O endpoint HTTP atual continua existindo, mas o novo `quick-generate` chama o servico diretamente, sem fazer chamada HTTP interna.

### O que deve ser reaproveitado

1. Busca na base de conhecimento:
   - `getProjectPromptKnowledgeContext`
2. Analise opcional da imagem:
   - `analyzeImageForContext`
3. Enriquecimento com template:
   - `templateContext`
   - `templateGuidance`
4. Regras de tom e objetivo.

### Regra de produto

Se `useKnowledgeBase = false`, o fluxo nao consulta a base.

Se `analyzeImageForContext = true`, o fluxo tenta enriquecer a copy com a imagem informada.

Se a analise de imagem falhar:
- o fluxo nao deve parar
- deve retornar warning
- a copy continua com base no prompt e no conhecimento textual

## 5. Mapeamento de slots para `layer.id`

### Novo util
- `src/lib/gerar-criativo/slot-mapping.ts`

### Problema que resolve

O motor de copy devolve slots semanticos, mas o canvas consome `textValues[layer.id]`.

### Comportamento esperado

1. Receber copy semantica.
2. Receber `slotToLayerMap`.
3. Retornar `textValues` prontos para o editor.

### Regra

Nunca gerar texto para campo inexistente.

Se um slot nao existir no template:
- ele deve ser descartado
- nao deve ser remapeado automaticamente para outro campo sem heuristica explicita

## 6. Prompt de imagem guiado por template

### Arquivo alvo
- `src/app/api/ai/improve-prompt/route.ts`

### Mudanca de papel

O `improve-prompt` deixa de ser uma ferramenta isolada de "melhorar descricao" e passa a aceitar contexto composicional opcional do template.

### Novo contexto aceito

```ts
type ImageCompositionContext = {
  format: '1:1' | '4:5' | '9:16' | '16:9'
  textZone?: { xPct: number; widthPct: number }
  safeArea?: { topPx: number; bottomPx: number }
  layoutStyle?: 'hero-title' | 'balanced' | 'info-dense' | 'minimal'
  negativeSpaceHint?: string
}
```

### Objetivo

O prompt de imagem deve instruir o modelo a:
- preservar area para texto
- respeitar safe areas do formato
- reforcar composicao adequada ao template

### Regra importante

O prompt de imagem nao deve depender da copy gerada para existir.

Ele deve depender do:
- prompt do usuario
- referencias visuais
- contexto composicional do template

## 7. Integracao no frontend

### Arquivo alvo
- `src/components/gerar-criativo/steps/image-selection-step.tsx`

### Mudancas

Adicionar um bloco compacto de controles para geracao rapida:

- `Usar base de conhecimento`
- `Analisar imagem para contexto`
- `Tom`
- `Objetivo`
- `Gerar arte rapida`

### Comportamento

Ao concluir com sucesso:
- preencher `imageValues`
- preencher `textValues`
- avancar ou permitir seguir para `Ajustes`

### Nao fazer

Nao criar uma nova tela de revisao de copy antes de `Ajustes`.

## 8. Extensao do contexto do wizard

### Arquivo alvo
- `src/components/gerar-criativo/gerar-criativo-context.tsx`

### Mudancas

Adicionar setters em lote:

```ts
setTextValuesBulk(values: Record<string, string>): void
setImageValuesBulk(values: Record<string, ImageSource>): void
setQuickGenerateMeta(meta: {
  knowledgeApplied: boolean
  imageAnalysisApplied: boolean
  warnings: string[]
  conflicts: string[]
}): void
```

### Objetivo

Permitir que o pipeline backend preencha o wizard de uma vez.

## Creditos

## Regra atual recomendada

Manter o modelo atual de cobranca por etapa:
- copy / texto: custo de IA textual
- imagem: custo de geracao de imagem

### Regra de resiliencia

1. Se a copy falhar e a imagem funcionar:
   - retornar imagem
   - permitir ajuste manual de texto
2. Se a imagem falhar e a copy funcionar:
   - retornar copy
   - permitir nova tentativa de imagem
3. Se ambos funcionarem:
   - preencher tudo no wizard

## Mudancas por arquivo

### Criar
- `src/app/api/gerar-criativo/quick-generate/route.ts`
- `src/lib/gerar-criativo/template-context.ts`
- `src/lib/gerar-criativo/slot-mapping.ts`
- `src/hooks/use-gerar-criativo-quick-generate.ts`

### Alterar
- `src/lib/ai/gemini-image-client.ts`
- `src/app/api/ai/improve-prompt/route.ts`
- `src/app/api/tools/generate-ai-text/route.ts`
- `src/components/gerar-criativo/steps/image-selection-step.tsx`
- `src/components/gerar-criativo/gerar-criativo-context.tsx`
- `docs/ai-image-generation.md`

## Fases de entrega

### Fase 1 - Base tecnica
- Atualizar o cliente Gemini para o formato oficial atual.
- Extrair servico reutilizavel de copy.
- Criar util de `templateContext`.

### Fase 2 - Orquestracao
- Criar `quick-generate`.
- Mapear `slot -> layer.id`.
- Retornar `textValues` e `imageValues`.

### Fase 3 - Frontend
- Integrar o novo pipeline na etapa `Imagem`.
- Adicionar controles de contexto.
- Preencher o wizard automaticamente.

### Fase 4 - Documentacao e cleanup
- Atualizar docs antigas de geracao de imagem.
- Remover referencias a Replicate onde nao se aplicam.
- Documentar o fluxo da Arte Rapida.

## Criterios de aceite

1. O wizard continua com 4 etapas visiveis.
2. A copy usa a base de conhecimento quando o usuario habilitar.
3. A imagem pode ser analisada para contexto da copy quando o usuario habilitar.
4. A copy e gerada apenas para os campos de texto existentes no template.
5. O resultado final chega em `Ajustes` com:
   - imagem aplicada
   - textos preenchidos
6. O usuario consegue editar os textos antes de finalizar.
7. O cliente Gemini usa o formato oficial atual da API para configuracao de imagem.

## Riscos

### 1. Inferencia de `fieldKey` inconsistente

Mitigacao:
- priorizar nomes de camada
- usar heuristica conservadora
- permitir fallback para `title/description/cta`

### 2. Template com textos pouco estruturados

Mitigacao:
- usar `templateContext` quando houver camadas bem nomeadas
- cair para `content_slots` quando existir metadata confiavel

### 3. Analise de imagem gerar ruido

Mitigacao:
- manter a flag opcional
- aplicar threshold de confianca
- nunca bloquear o fluxo por falha opcional

## Open Questions

1. A Arte Rapida deve preencher apenas a imagem principal ou todas as camadas de imagem dinamicas?
2. O custo de copy deve ser sempre cobrado dentro do `quick-generate` ou somente quando a copy for realmente retornada?
3. A etapa `Imagem` deve ter um modo unico de "Gerar arte rapida" ou coexistir com o modo atual de selecao manual?

## Referencias

### Internas
- `src/lib/ai/gemini-image-client.ts`
- `src/app/api/ai/generate-image/route.ts`
- `src/app/api/ai/improve-prompt/route.ts`
- `src/app/api/tools/generate-ai-text/route.ts`
- `src/components/gerar-criativo/steps/image-selection-step.tsx`
- `src/components/gerar-criativo/steps/adjustments-step.tsx`
- `src/components/gerar-criativo/gerar-criativo-context.tsx`

### Externas
- Gemini API Image Generation: https://ai.google.dev/gemini-api/docs/image-generation
- Gemini API Models: https://ai.google.dev/gemini-api/docs/models
- Gemini API Generate Content: https://ai.google.dev/api/generate-content
