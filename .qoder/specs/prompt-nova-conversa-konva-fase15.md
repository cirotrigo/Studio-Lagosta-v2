# Prompt — Fase 15: Quick Wins de Interacao Basica

## Contexto

Estamos desenvolvendo o Studio Lagosta, um editor de design para Instagram no app Electron. As fases 1-14 ja foram concluidas. Agora iniciamos a **Fase 15** focada em melhorias rapidas de alta prioridade.

**Spec completa:** `.qoder/specs/spec-evolucao-editor-fases-15-20.md`

## Objetivos da Fase 15

### 15.1 Handles de Tamanho Fixo (Screen Space)
- Handles devem ter tamanho fixo de **8px** independente do zoom
- Dividir dimensoes do handle pelo fator de escala antes de renderizar
- Testar em niveis de zoom de 25% a 400%

### 15.2 Delete/Backspace para Excluir Elemento
- Teclas `Delete` e `Backspace` excluem elemento selecionado
- NAO deve funcionar quando foco estiver em campo de texto (input/textarea)
- Suporte a undo/redo

### 15.3 Step Up/Step Down nas Camadas
- Cada clique move elemento **uma posicao** na hierarquia (nao topo/base)
- Adicionar botoes `↑` e `↓` no LayerPanel
- Criar acoes `stepUp` e `stepDown` no editor.store

## Arquivos Relevantes

```
desktop-app/
├── src/
│   ├── components/editor/
│   │   ├── canvas/           # Handles de selecao
│   │   ├── LayerPanel.tsx    # Painel de camadas
│   │   └── PropertiesPanel.tsx
│   ├── stores/
│   │   └── editor.store.ts   # Acoes do editor
│   └── pages/
│       └── EditorPage.tsx
```

## Stack

- React + TypeScript
- Konva.js para canvas
- Zustand para state management
- Electron

## Criterios de Aceite

- [ ] Handles mantem 8px em todos os niveis de zoom
- [ ] Delete/Backspace exclui elementos quando canvas tem foco
- [ ] Delete/Backspace NAO interfere com campos de texto
- [ ] Step up/down move camadas uma posicao por vez
- [ ] Todas as acoes suportam undo/redo

## Instrucoes

1. Leia a spec completa em `.qoder/specs/spec-evolucao-editor-fases-15-20.md`
2. Analise os arquivos relevantes antes de implementar
3. Implemente uma feature por vez
4. Teste cada feature antes de passar para a proxima
5. Commit apos cada feature concluida
