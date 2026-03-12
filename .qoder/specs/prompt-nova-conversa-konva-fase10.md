# Prompt para nova conversa — Konva-Only (Fase 10)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 10**: UX de simplicidade máxima para que o usuário gere sua primeira arte em menos de 60 segundos.

## Pré-condição
- Fases 1, 2, 3, 4, 4.1, 5, 6, 6.1, 7, 7.1, 8 e 9 concluídas, commitadas e documentadas.
- Antes de codar, validar o estado atual do repositório e os commits anteriores.

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar libs/frameworks e APIs, use `context7` para validar APIs atuais.

## Escopo estrito desta conversa (Fase 10)

### A) Modo Rápido como Padrão
- Modo "Rápido" (1 prompt) abre selecionado por padrão.
- Campos visíveis apenas: prompt, formato, foto (opcional).
- Botão "Gerar" proeminente e destacado.
- Remover fricção inicial ao máximo.

### B) Modo Avançado Colapsado
- Criar drawer/accordion que expande opções avançadas.
- Opções avançadas incluem:
  - Seleção manual de template
  - Número de variações (1, 2, 4)
  - Toggle de análise de imagem
  - Referências visuais
  - Composição com prompt adicional
- Estado do drawer persiste na sessão (não recolhe sozinho).

### C) Presets de Objetivo
- Botões rápidos de objetivo: **Promoção**, **Institucional**, **Agenda**, **Oferta**.
- Ao clicar, pré-preenche o prompt com texto base apropriado.
- Usuário pode editar o prompt pré-preenchido.
- Presets visíveis mas não obrigatórios.
- Exemplos de texto base:
  - Promoção: "Divulgue uma promoção especial..."
  - Institucional: "Mostre a essência do estabelecimento..."
  - Agenda: "Comunique horários e eventos..."
  - Oferta: "Destaque um produto ou serviço..."

### D) Presets de Tom de Copy
- Dropdown ou chips para selecionar tom: **Casual**, **Profissional**, **Urgente**, **Inspirador**.
- Tom selecionado é injetado no system prompt da LLM.
- Default: inferido pelo segmento do projeto (se disponível), senão "Casual".
- Tom deve influenciar apenas a copy, não o layout.

### E) Indicador de Contexto do Projeto
- Badge discreto "Contexto aplicado" quando há dados na base de conhecimento.
- Ao clicar, abre popover/modal com resumo dos dados que serão usados.
- Mostrar: categorias ativas, quantidade de entradas, última atualização.
- Opção "Editar dados" que navega para Base de Conhecimento.
- Opção "Atualizar base" para refresh dos dados.

### F) Feedback Visual de Progresso
- Durante geração, mostrar etapas claras:
  1. "Buscando contexto do projeto..."
  2. "Gerando copy..."
  3. "Criando fundo..." (se IA)
  4. "Montando arte..."
- Progress bar ou stepper visual com etapa atual destacada.
- Tempo estimado opcional baseado em histórico.

## Arquivos alvo mínimos

### Novos:
- `desktop-app/src/components/project/generate/QuickCreatePanel.tsx`
- `desktop-app/src/components/project/generate/AdvancedOptionsDrawer.tsx`
- `desktop-app/src/components/project/generate/ObjectivePresets.tsx`
- `desktop-app/src/components/project/generate/ToneSelector.tsx`
- `desktop-app/src/components/project/generate/ProjectContextBadge.tsx`
- `desktop-app/src/components/project/generate/GenerationProgress.tsx`

### Modificar:
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx` (refatorar para usar novos componentes)
- `desktop-app/src/stores/generation.store.ts` (adicionar estado de progresso detalhado e tom)
- `desktop-app/src/lib/automation/prompt-orchestrator.ts` (injetar tom de copy no prompt)

## Estrutura de dados sugerida

### Estado de progresso
```ts
interface GenerationProgress {
  stage: 'idle' | 'context' | 'copy' | 'background' | 'assembling' | 'done' | 'error'
  stageLabel: string
  percent: number
  startedAt?: string
  estimatedRemainingMs?: number
}
```

### Configuração de tom
```ts
type CopyTone = 'casual' | 'professional' | 'urgent' | 'inspirational'

interface ToneConfig {
  tone: CopyTone
  systemPromptModifier: string
}
```

### Presets de objetivo
```ts
interface ObjectivePreset {
  id: string
  label: string
  icon: string
  promptTemplate: string
}
```

## Fora de escopo
- Grouping de layers (backlog)
- Histórico em árvore (backlog)
- Export SVG vetorial (backlog)
- Melhorias no editor Konva (próxima fase)

## Critérios de aceite (obrigatórios)
1. Modo rápido é o default ao abrir a aba de geração.
2. Usuário consegue gerar arte com apenas: digitar prompt + clicar Gerar.
3. Presets de objetivo pré-preenchem o prompt corretamente.
4. Tom de copy é aplicado no prompt da LLM.
5. Badge de contexto mostra dados que serão usados.
6. Progresso da geração é visível e informativo.
7. Tempo médio para primeira arte < 60s em rede estável.
8. Opções avançadas acessíveis mas não intrusivas.
9. Typecheck sem regressão.

## Regras de execução
1. Implementar apenas Fase 10.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-10): ux simplicidade maxima com presets e progresso`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Testes manuais executados (fluxo rápido, presets, progresso).
7. Riscos remanescentes.
8. Próximo passo sugerido (melhorias no editor ou QA final).

Comece agora pela Fase 10.

---
