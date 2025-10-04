# Sistema de Efeitos de Texto - Konva.js

## Visão Geral

Sistema completo de efeitos de texto para o editor de canvas, permitindo aplicar e gerenciar 5 tipos diferentes de efeitos em textos do Konva.js.

## Efeitos Implementados

### 1. Blur Effect
- **Intensidade**: Slider de 0 a 20
- **Implementação**: Usa `Konva.Filters.Blur` com cache do node
- **Arquivo**: `src/lib/konva/effects/BlurEffect.ts`

### 2. Curved Text Effect
- **Curvatura**: Slider de -180° a 180°
- **Implementação**: Converte `Konva.Text` para `Konva.TextPath` com arc SVG
- **Características**:
  - Valores negativos curvam para baixo
  - Valores positivos curvam para cima
  - Preserva todas propriedades do texto ao converter
- **Arquivo**: `src/lib/konva/effects/CurvedTextEffect.ts`

### 3. Text Stroke (Contorno)
- **Cor**: Color picker
- **Largura**: Slider de 0 a 10px
- **Implementação**: Usa propriedades `stroke` e `strokeWidth` do Konva
- **Arquivo**: `src/lib/konva/effects/StrokeEffect.ts`

### 4. Background (Fundo)
- **Cor**: Color picker
- **Padding**: Slider de 0 a 20px
- **Implementação**:
  - Cria `Konva.Rect` atrás do texto
  - Auto-ajusta ao tamanho do texto + padding
  - Sincroniza transformações (move, rotate, scale)
  - ID do rect: `{textId}-bg`
- **Arquivo**: `src/lib/konva/effects/BackgroundEffect.ts`

### 5. Shadow (Sombra)
- **Cor**: Color picker
- **Blur**: Slider de 0 a 20
- **Offset X/Y**: Sliders de -50 a 50px
- **Opacidade**: Slider de 0 a 1
- **Implementação**: Usa propriedades nativas do Konva
- **Arquivo**: `src/lib/konva/effects/ShadowEffect.ts`

## Arquitetura

### Core Files

```
src/lib/konva/effects/
├── types.ts                 # Interfaces e tipos TypeScript
├── BlurEffect.ts           # Implementação do efeito blur
├── StrokeEffect.ts         # Implementação do contorno
├── ShadowEffect.ts         # Implementação da sombra
├── BackgroundEffect.ts     # Implementação do fundo
├── CurvedTextEffect.ts     # Implementação do texto curvo
├── EffectsManager.ts       # Gerenciador central de efeitos
└── index.ts                # Barrel export
```

### UI Components

```
src/components/canvas/effects/
├── ColorPicker.tsx         # Color picker reutilizável
├── BlurControl.tsx         # Controles do blur
├── StrokeControl.tsx       # Controles do stroke
├── ShadowControl.tsx       # Controles da sombra
├── BackgroundControl.tsx   # Controles do background
├── CurvedTextControl.tsx   # Controles do texto curvo
├── EffectsPanel.tsx        # Painel principal lateral
└── index.ts                # Barrel export
```

### Integration

- **TextToolbar**: Botão "Effects" adicionado (com ícone Sparkles)
- **EditorCanvas**: Gerencia estado do painel e comunicação com Konva

## Padrões e Boas Práticas

### 1. Performance
- **Debouncing**: Todos os sliders têm debounce de 100ms
- **Batch Draw**: Sempre usa `layer.batchDraw()` após mudanças
- **Cache Management**: Blur effect limpa cache antes de atualizar

### 2. Estado e Persistência
- Configuração salva em `node.attrs.effects`
- Suporta serialização/deserialização JSON
- Métodos `getConfig()` em cada efeito para leitura

### 3. Type Safety
- Interfaces TypeScript para todos os configs
- Tipos exportados de `types.ts`
- Generic support no EffectsManager

### 4. UX
- Toggles com feedback visual claro
- Valores numéricos visíveis ao lado dos sliders
- Controles desabilitados quando efeito está off
- Preview em tempo real com debounce

## EffectsManager API

### Aplicar Efeitos
```typescript
import { EffectsManager } from '@/lib/konva/effects'

const updatedNode = EffectsManager.applyEffects(
  textNode,
  effectsConfig,
  layer
)
```

### Obter Configuração
```typescript
const config = EffectsManager.getEffects(textNode)
```

### Atualizar Efeito Específico
```typescript
const updatedNode = EffectsManager.updateEffect(
  textNode,
  'blur',
  { enabled: true, blurRadius: 10 },
  layer
)
```

### Remover Todos os Efeitos
```typescript
const cleanNode = EffectsManager.removeAllEffects(textNode, layer)
```

### Clonar Efeitos
```typescript
const targetNode = EffectsManager.cloneEffects(
  sourceNode,
  targetNode,
  layer
)
```

### Serializar/Deserializar
```typescript
// Salvar
const json = EffectsManager.serializeEffects(textNode)

// Carregar
const node = EffectsManager.deserializeEffects(
  textNode,
  json,
  layer
)
```

## Uso no Editor

1. **Selecionar texto**: Clique em qualquer texto no canvas
2. **Abrir painel**: Clique no botão "Effects" na toolbar de texto
3. **Aplicar efeitos**:
   - Toggle on/off de cada efeito
   - Ajustar propriedades com sliders e color pickers
   - Preview em tempo real
4. **Fechar painel**: Botão X ou deselecionar o texto

## Limitações Conhecidas

1. **Curved Text**:
   - Ao ativar, converte para TextPath (perde algumas propriedades avançadas)
   - Incompatível com blur e outros efeitos de filtro
   - Só funciona com `Konva.Text`, não com `Konva.TextPath`

2. **Background**:
   - Requer sincronização manual de transformações
   - Rect tem ID específico, pode conflitar se não gerenciado

3. **Blur**:
   - Requer cache do node (impacta performance em muitos textos)
   - Pode causar artefatos visuais em textos pequenos

## Próximos Passos (Sugestões)

- [ ] Integrar com sistema de undo/redo
- [ ] Preservar efeitos ao duplicar/clonar texto
- [ ] Exportar efeitos no JSON do projeto
- [ ] Adicionar presets de efeitos (ex: "Neon", "3D", "Retro")
- [ ] Suporte a múltiplos textos selecionados
- [ ] Animações de transição ao aplicar efeitos
- [ ] Efeitos adicionais: Gradient text, Pattern fill, etc.

## Testes

### Typecheck
```bash
npm run typecheck
```

Status: ✅ Sem erros relacionados ao sistema de efeitos

### Build
```bash
npm run build
```

### Dev Mode
```bash
npm run dev
```

## Documentação de Referência

- [Konva Filters](https://konvajs.org/docs/filters/Blur.html)
- [Konva Shadow](https://konvajs.org/docs/styling/Shadow.html)
- [Konva Text Path](https://konvajs.org/docs/sandbox/Text_On_Arc.html)
- [Radix UI Slider](https://www.radix-ui.com/docs/primitives/components/slider)
- [Radix UI Switch](https://www.radix-ui.com/docs/primitives/components/switch)
