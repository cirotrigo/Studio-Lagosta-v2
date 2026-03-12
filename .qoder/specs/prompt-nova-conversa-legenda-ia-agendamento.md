# Prompt para nova conversa — Legenda com IA no Agendamento

Use este prompt na próxima conversa:

---

Quero implementar **geração de legenda com IA** no fluxo de agendamento de posts, usando a base de conhecimento do projeto para contexto.

## Pré-condição
- Fases 1-12 do Konva-only concluídas.
- Base de conhecimento do projeto já existe e está integrada no pipeline de geração de artes.
- Fluxo de agendamento (`NewPostPage.tsx`) funcional.
- Antes de codar, validar o estado atual do repositório.

## Documentos obrigatórios
1. `.qoder/specs/andamento-implementacao-konva-only.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `desktop-app/src/pages/NewPostPage.tsx`
4. `desktop-app/src/components/post/CaptionEditor.tsx`
5. `src/lib/knowledge/search.ts`
6. `src/app/api/tools/generate-ai-text/route.ts`

## Diretriz técnica
- Ao implementar libs/frameworks e APIs, use `context7` para validar APIs atuais.
- Reaproveitar a infraestrutura de RAG já existente no projeto.

## Escopo estrito desta conversa

### A) Botão "Gerar com IA" no Editor de Legenda
- Adicionar botão/ícone ao lado do campo de legenda no `CaptionEditor.tsx`.
- Ao clicar, abre modal/popover com:
  - Campo de prompt (o que o usuário quer na legenda)
  - Seletor de tom de voz
  - Botão "Gerar"
- Exibir loading durante geração.
- Inserir legenda gerada no campo, substituindo ou adicionando ao existente.

### B) Seletor de Tom de Voz
- Implementar seletor com os seguintes tons:
  - **Casual**: linguagem informal, próxima, como conversa entre amigos
  - **Divertido**: tom leve, com humor sutil, emojis permitidos
  - **Inspiracional**: motivador, positivo, aspiracional
  - **Explicativo**: informativo, didático, claro
  - **Profissional**: linguagem corporativa, objetiva
  - **Formal**: linguagem rebuscada, institucional
- Tom selecionado é injetado no system prompt da LLM.
- Default: "Casual".

### C) Integração com Base de Conhecimento
- Buscar contexto relevante da base de conhecimento do projeto usando RAG.
- Priorizar categorias: `CARDAPIO`, `DIFERENCIAIS`, `CAMPANHAS`, `HORARIOS`.
- Injetar contexto no prompt para enriquecer a legenda.
- Se não houver contexto relevante, gerar legenda genérica baseada apenas no prompt do usuário.

### D) Prompt Otimizado para Legendas Curtas
- Configurar o prompt da LLM para gerar legendas:
  - Concisas (máximo 100-180 caracteres para stories, 200-400 para feed)
  - Com call-to-action quando apropriado
  - Com hashtags relevantes (opcional, no máximo 3)
  - Adaptadas ao tom selecionado
- Respeitar limite de caracteres do Instagram.

### E) Exemplo de Uso
O usuário escreve no prompt:
> "Escreva uma legenda para apresentar o menu da parrilla TERO e indique o T-bone como sugestão de prato para compartilhar"

O sistema:
1. Busca na base de conhecimento: menu da parrilla, informações do T-bone
2. Injeta contexto: descrição, horários do estabelecimento, como funciona o menu se tiver definido
3. Gera legenda curta no tom selecionado
4. Retorna algo como (tom Casual):
> "Já conhece nosso menu de parrilla? 🥩 O T-bone é perfeito pra dividir com alguém especial. 

Você escolhe uma das opções de cortes, um dos acompahamentos e um molho que mais combina com o corte.

O menu Parrilla TERO serve até 2 pessoas! Marque aqui vai compartilhar esse menu com você hoje.

#TERO #Parrilla"

### F) API de Geração de Legenda
- Criar endpoint ou reaproveitar `generate-ai-text` com flag `mode: 'caption'`.
- Request:
  ```ts
  {
    projectId: number
    prompt: string
    tone: 'casual' | 'fun' | 'inspirational' | 'explanatory' | 'professional' | 'formal'
    postType: 'POST' | 'STORY' | 'CAROUSEL' | 'REEL'
    includeHashtags?: boolean
    maxLength?: number
  }
  ```
- Response:
  ```ts
  {
    caption: string
    hashtags?: string[]
    knowledgeUsed: boolean
    tone: string
  }
  ```

## Arquivos alvo mínimos

### Novos:
- `desktop-app/src/components/post/CaptionGeneratorModal.tsx`
- `desktop-app/src/components/post/ToneSelector.tsx`
- `desktop-app/src/hooks/use-generate-caption.ts`

### Modificar:
- `desktop-app/src/components/post/CaptionEditor.tsx` (adicionar botão IA)
- `src/app/api/tools/generate-ai-text/route.ts` (ou criar rota dedicada)
- `src/lib/knowledge/search.ts` (se necessário ajustar busca)

## Estrutura de dados sugerida

### Tipos de tom
```ts
type CaptionTone = 'casual' | 'fun' | 'inspirational' | 'explanatory' | 'professional' | 'formal'

const TONE_LABELS: Record<CaptionTone, string> = {
  casual: 'Casual',
  fun: 'Divertido',
  inspirational: 'Inspiracional',
  explanatory: 'Explicativo',
  professional: 'Profissional',
  formal: 'Formal',
}

const TONE_INSTRUCTIONS: Record<CaptionTone, string> = {
  casual: 'Use linguagem informal e próxima, como uma conversa entre amigos.',
  fun: 'Use tom leve e divertido, com humor sutil. Emojis são bem-vindos.',
  inspirational: 'Use tom motivador e positivo, inspirando o leitor.',
  explanatory: 'Seja informativo e didático, explicando de forma clara.',
  professional: 'Use linguagem corporativa e objetiva.',
  formal: 'Use linguagem rebuscada e institucional.',
}
```

### Request de geração
```ts
interface GenerateCaptionRequest {
  projectId: number
  prompt: string
  tone: CaptionTone
  postType: PostType
  includeHashtags: boolean
  maxLength?: number
}
```

## Fora de escopo
- Geração de imagem no agendamento (já existe via upload/drive/IA)
- Sugestão automática de horário
- Integração com outras redes além do Instagram
- Histórico de legendas geradas

## Critérios de aceite (obrigatórios)
1. Botão "Gerar com IA" aparece no editor de legenda.
2. Modal de geração abre com campo de prompt e seletor de tom.
3. Tom selecionado influencia o estilo da legenda gerada.
4. Base de conhecimento é consultada e contexto é injetado.
5. Legenda gerada é curta e adequada ao tipo de post.
6. Legenda é inserida no campo ao confirmar.
7. Loading visual durante geração.
8. Erro tratado graciosamente se falhar.
9. Typecheck sem regressão.

## Regras de execução
1. Implementar apenas esta feature.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
   - `npm run typecheck`
3. Commit obrigatório:
   - `feat(caption-ai): geracao de legenda com ia usando base de conhecimento`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Testes manuais executados (geração com diferentes tons, com/sem contexto).
7. Riscos remanescentes.
8. Próximo passo sugerido.

Comece agora pela implementação.

---
