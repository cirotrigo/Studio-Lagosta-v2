# Prompt para nova conversa — Konva-Only (Fase 6)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 6**: geração de fundo com IA + referências no fluxo Konva-only.

## Pré-condição
- Fases 1, 2, 3, 4, 4.1 e 5 já concluídas, commitadas e documentadas.
- Antes de codar, validar estado atual do repositório e commits dessas fases.

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/prd-ux-modo-rapido-konva-only.md`
4. `.qoder/specs/andamento-implementacao-konva-only.md`
5. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar integrações de API/libs, use `context7` para confirmar APIs atuais.

## Escopo estrito desta conversa (Fase 6)

### A) Integração do motor primário
- Integrar geração visual com **Nano Banana 2** (associado ao Gemini 3.1 Flash Image).

### B) Fallback automático
- Em erro do primário, fallback para a versão anterior (motor legado definido no projeto).
- Logar claramente quando fallback for acionado.

### C) Referências visuais
- UX aceita até **5 referências** (mantendo limite de interface).
- Backend pode aceitar mais, mas respeitar 5 no fluxo padrão.

### D) Persistência
- Toda imagem gerada por IA deve ser persistida em **Geradas com IA**.
- Manter associação com `projectId`, prompt e metadados de geração.

### E) Orquestração com pipeline atual
- Conectar geração de fundo IA ao pipeline da Fase 5 sem regressão.
- Continuar suportando opção `usar foto` sem IA.

## Arquivos alvo mínimos
- `desktop-app/electron/ipc/generation-handlers.ts`
- `desktop-app/src/lib/automation/background-service.ts`
- `desktop-app/src/stores/generation.store.ts`
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
- (se necessário) handlers web/API já usados para persistência de imagens IA

## Fora de escopo
- Análise de imagem para contexto de copy (Fase 6.1)
- Aprovação/reedição (Fase 7)
- Export batch final (Fase 8)
- Sync offline-first (Fase 9)

## Critérios de aceite (obrigatórios)
1. Geração de fundo IA usa Nano Banana 2 como primário.
2. Em falha, fallback para versão anterior funciona automaticamente.
3. Fluxo com referências (até 5) funciona sem quebrar.
4. Imagens geradas aparecem em `Geradas com IA`.
5. Mensagens de erro/retry são claras para o usuário.
6. Fluxo `usar foto` continua funcional.
7. Typecheck sem regressão.

## Regras de execução
1. Implementar apenas Fase 6.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-6): integra fundo ia com nano banana 2 e fallback`
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
7. Próximo passo sugerido (Fase 6.1).

Comece agora pela Fase 6.

---
