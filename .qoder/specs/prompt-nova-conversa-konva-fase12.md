# Prompt para Nova Conversa — Fase 12: Gradiente no Editor Local

## Contexto do Projeto

Este projeto implementa um sistema de automação de artes para Instagram usando Konva.js como motor de renderização. O desktop-app é um aplicativo Electron que permite criar e editar templates de artes.

### Estado Atual
- Fases 1-11 concluídas
- Editor Konva local funcionando com text, image, shapes, logos
- Sync bidirecional entre desktop-app e web funcionando
- Normalização JSON implementada para conversão local↔web

### Problema Identificado
O editor **web** possui suporte a gradientes, mas o editor **local (desktop-app)** ainda não implementa:
1. Renderização de layers de gradiente no stage Konva
2. UI para criar/editar gradientes no PropertiesPanel
3. Normalização de gradiente no sync (parcialmente mapeado, precisa refinamento)

---

## Objetivo da Fase 12

Implementar suporte completo a gradientes no editor local do desktop-app, com paridade funcional ao editor web.

---

## Escopo

### A. Análise do Editor Web (Investigação)
Localizar e analisar a implementação de gradiente no editor web para entender:
1. Como layers de gradiente são renderizados
2. Estrutura do schema de gradiente (cores, stops, ângulo, tipo)
3. Componentes de UI para seleção/edição de gradiente
4. Como gradientes são serializados no `designData`

### B. Renderização de Gradiente no Stage Konva
Implementar renderização de layers do tipo `gradient` e `gradient2` no `LayerFactory.tsx`:
1. Suporte a gradiente linear (com ângulo configurável)
2. Suporte a gradiente radial (se existente no web)
3. Múltiplos color stops com posições
4. Opacidade por stop (se suportado)

### C. UI de Edição de Gradiente
Adicionar ao `PropertiesPanel.tsx`:
1. Componente de seleção de tipo (solid → gradient)
2. Barra de color stops com drag para reposicionar
3. Color picker para cada stop
4. Controle de ângulo (para linear)
5. Preview em tempo real

### D. Atualização da Normalização (sync)
Atualizar `template-normalizer.ts` para tratar gradientes corretamente:
1. Local → Web: converter formato Konva para formato web
2. Web → Local: converter formato web para formato Konva
3. Preservar todos os color stops e configurações

---

## Arquivos Relevantes para Análise

### Editor Web (referência)
- Procurar componentes de gradiente em `src/components/studio/`
- Schema de layer em `src/types/template.ts`
- Renderização em qualquer arquivo que use canvas/fabric

### Editor Local (a modificar)
- `desktop-app/src/components/editor/LayerFactory.tsx` - renderização
- `desktop-app/src/components/editor/PropertiesPanel.tsx` - UI de edição
- `desktop-app/electron/services/sync/template-normalizer.ts` - sync electron
- `desktop-app/src/lib/sync/template-normalizer.ts` - sync renderer
- `desktop-app/src/types/template.ts` - tipos se necessário

### Schema Atual de Gradiente (local)
No `konva-ipc-types.ts`, layers de gradiente usam:
```typescript
{
  type: 'gradient' | 'gradient2',
  colors: string[],      // array de cores
  stops?: number[],      // posições 0-1
  angle?: number,        // graus
}
```

### Schema Web de Gradiente
No formato web, gradientes usam `style`:
```typescript
{
  style: {
    gradientType: 'linear' | 'radial',
    gradientAngle: number,
    gradientStops: Array<{
      id: string,
      color: string,
      position: number,
      opacity: number
    }>
  }
}
```

---

## Critérios de Aceite

1. [ ] Layer de gradiente renderiza corretamente no stage Konva
2. [ ] Gradiente linear com ângulo funciona
3. [ ] Múltiplos color stops com posições diferentes funcionam
4. [ ] UI permite criar novo gradiente a partir de cor sólida
5. [ ] UI permite editar gradiente existente
6. [ ] Sync local→web preserva gradiente corretamente
7. [ ] Sync web→local preserva gradiente corretamente
8. [ ] Export PNG/JPEG renderiza gradiente corretamente
9. [ ] Typecheck passa sem erros

---

## Comandos de Validação

```bash
npm --prefix desktop-app run typecheck
npm --prefix desktop-app run typecheck:electron
npm run typecheck  # web
```

---

## Arquivos de Documentação

- `.qoder/specs/andamento-implementacao-konva-only.md` - atualizar com progresso
- `.qoder/specs/checklist-implementacao-konva-only.md` - marcar itens completados

---

## Notas Adicionais

### Gradiente no Konva.js
Konva suporta gradientes nativamente via:
```javascript
// Linear
shape.fillLinearGradientStartPoint({ x: 0, y: 0 });
shape.fillLinearGradientEndPoint({ x: width, y: height });
shape.fillLinearGradientColorStops([0, 'red', 0.5, 'yellow', 1, 'green']);

// Radial
shape.fillRadialGradientStartPoint({ x: 0, y: 0 });
shape.fillRadialGradientEndPoint({ x: 0, y: 0 });
shape.fillRadialGradientStartRadius(0);
shape.fillRadialGradientEndRadius(100);
shape.fillRadialGradientColorStops([0, 'red', 1, 'blue']);
```

### Conversão de Ângulo para Pontos
Para gradiente linear com ângulo:
```javascript
function angleToPoints(angle: number, width: number, height: number) {
  const rad = (angle * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const length = Math.sqrt(width * width + height * height) / 2;
  return {
    start: { x: cx - Math.cos(rad) * length, y: cy - Math.sin(rad) * length },
    end: { x: cx + Math.cos(rad) * length, y: cy + Math.sin(rad) * length }
  };
}
```

### Atenção à Normalização
Na Fase 11, a normalização de gradiente foi **parcialmente** implementada:
- Local→Web: converte `colors[]` + `stops[]` para `gradientStops[]`
- Web→Local: converte `gradientStops[]` para `colors[]` + `stops[]`

Verificar se a conversão está completa e corrigir se necessário, especialmente:
- `opacity` por stop (pode estar sendo perdido)
- `gradientType` linear vs radial
- `gradientAngle` vs cálculo de pontos

---

## Commit Convention

```
feat(konva-fase-12): implementa gradiente no editor local
```

---

## Prioridade

Esta fase é **pós-MVP** mas importante para paridade de funcionalidades com o editor web e para garantir que templates com gradiente sincronizem corretamente.
