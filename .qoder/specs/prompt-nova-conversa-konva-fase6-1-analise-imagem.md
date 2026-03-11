# Prompt para nova conversa — Konva-Only (Fase 6.1: análise de imagem opcional)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 6.1**: análise de imagem opcional para enriquecer a geração de copy no fluxo Konva-only.

## Contexto
- Fases até 5 já foram implementadas.
- Fase 6 (fundo IA + referências) já deve estar concluída antes desta etapa.
- Falta adicionar análise visual da imagem para ajudar a IA a identificar contexto (ex.: prato do almoço executivo).

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/prd-ux-modo-rapido-konva-only.md`
4. `.qoder/specs/andamento-implementacao-konva-only.md`
5. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar libs e APIs, use `context7` para validar APIs e comportamento atual.

## Escopo obrigatório

### 1) Toggle de análise de imagem (default off)
Adicionar no fluxo de geração (aba gerar e modal do editor):
- Toggle: `Analisar imagem para contexto`
- Estado padrão: **desligado**
- Persistência no estado da geração

### 2) Pipeline de análise visual opcional
Quando toggle estiver ligado:
1. Analisar a imagem base (visão) antes de gerar copy.
2. Gerar metadados estruturados:
   - `dishNameCandidates[]`
   - `sceneType`
   - `ingredientsHints[]`
   - `confidence`
3. Cruzar candidatos com base de conhecimento do projeto (`projectId`) focando `CARDAPIO` e `CAMPANHAS`.
4. Injetar contexto visual no prompt final da copy.

Quando toggle estiver desligado:
- comportamento atual permanece igual, sem análise visual.

### 3) Regras de segurança/qualidade
- Não inventar prato específico se confiança for baixa.
- Usar limiar de confiança para auto-associação.
- Em baixa confiança, seguir com copy contextual genérica.
- Em conflito entre prompt do usuário e inferência visual, priorizar o prompt do usuário.

### 4) Transparência na UI
Com toggle ativo e análise executada:
- mostrar badge `Análise de imagem aplicada`
- opção de ver resumo curto do que foi inferido

## Cenário obrigatório de teste
Prompt: `Crie variações com essa foto para divulgar o almoço executivo de quinta-feira.`

Resultado esperado:
- Se houver match confiável no cardápio, a copy usa nome/descrição do prato.
- Se não houver match, não inventa prato e mantém copy coerente com almoço executivo.

## Arquivos alvo mínimos
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
- `desktop-app/src/components/editor/EditorGenerateArtModal.tsx`
- `desktop-app/src/lib/automation/prompt-orchestrator.ts`
- `desktop-app/src/lib/automation/image-context-analyzer.ts`
- `desktop-app/src/stores/generation.store.ts`
- `src/app/api/tools/generate-ai-text/route.ts` (web)

## Fora de escopo
- Aprovação/reedição (fase 7)
- Export batch final (fase 8)
- Sync offline-first (fase 9)

## Critérios de aceite
1. Toggle existe e inicia desligado.
2. Com toggle desligado, fluxo atual não muda.
3. Com toggle ligado, análise visual entra no pipeline e enriquece copy.
4. Cenário de almoço executivo funciona com associação quando houver confiança.
5. Sem confiança, não inventa prato.
6. Typecheck sem regressão.

## Regras de execução
1. Implementar apenas Fase 6.1.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-6.1): analise de imagem opcional no pipeline de copy`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. O que foi implementado.
2. Arquivos alterados.
3. Resultado dos comandos de validação.
4. Hash e mensagem do commit.
5. Atualização aplicada no andamento/checklist.
6. Riscos remanescentes.
7. Próximo passo sugerido (fase 7).

Comece agora.

---
