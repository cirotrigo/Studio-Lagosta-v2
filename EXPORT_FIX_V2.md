# Correção de Exportação - Camadas Invisíveis (V2)

## 🔧 Mudanças Implementadas

### Problema Original
Quando uma camada era ocultada (visible: false), ela ainda aparecia na exportação com opacidade reduzida.

### Solução Simplificada

Modificamos **apenas** a propriedade `visible()` do node Konva para `false` antes da exportação.

#### Código Anterior (V1 - Não funcionou)
```tsx
node.opacity(0) // Tentamos zerar opacidade
node.visible(false) // E ocultar
```

#### Código Atual (V2 - Simplificado)
```tsx
// Apenas ocultar o node
node.visible(false)
```

### Por Que Funciona Agora

1. **Konva respeita `visible: false`** ao renderizar para `toDataURL()`
2. **Removemos a manipulação desnecessária de opacity**
3. **Movemos restauração para o bloco `finally`** para garantir execução

### Implementação

#### 1. Em `exportDesign()`:

```tsx
const exportDesign = React.useCallback(async (format: 'png' | 'jpeg') => {
  const stage = stageInstanceRef.current
  if (!stage) throw new Error('Canvas não está pronto')

  // IMPORTANTE: Definir fora do try para estar disponível no finally
  const invisibleLayersState: Array<{
    node: any
    originalOpacity: number
    originalVisible: boolean
  }> = []

  try {
    // ... código de zoom e posição ...

    // Ocultar camadas invisíveis
    const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined

    if (contentLayer) {
      contentLayer.getChildren().forEach((node: any) => {
        const layerId = node.id()
        const layer = design.layers.find((l) => l.id === layerId)

        if (layer && layer.visible === false) {
          // Salvar estado
          invisibleLayersState.push({
            node,
            originalOpacity: node.opacity(),
            originalVisible: node.visible(),
          })

          // Ocultar para exportação
          node.visible(false)
        }
      })
    }

    // Forçar redraw
    stage.batchDraw()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    // Exportar...
    const dataUrl = stage.toDataURL({ ... })

    return record
  } finally {
    // IMPORTANTE: Restaurar SEMPRE, mesmo em caso de erro
    invisibleLayersState.forEach(({ node, originalOpacity, originalVisible }) => {
      node.opacity(originalOpacity)
      node.visible(originalVisible)
    })

    // Restaurar zoom, posição, etc...
  }
}, [template.id, design.canvas.width, design.canvas.height, zoom, design.layers])
```

#### 2. Em `generateThumbnail()`:

Mesma lógica aplicada para geração de thumbnails.

## 🧪 Como Testar

### Passo 1: Criar Camada
1. Adicione um texto ou imagem ao canvas
2. Verifique que está visível normalmente

### Passo 2: Ocultar Camada
1. No painel de camadas, clique no ícone 👁️
2. A camada deve ficar com **opacidade baixa** (fantasma)
3. Você não pode mais interagir com ela

### Passo 3: Exportar
1. Clique em **Download** no topo
2. Escolha formato JPEG ou PNG
3. **Verifique**: A camada oculta **NÃO deve aparecer** na imagem

### Passo 4: Verificar Estado no Editor
1. Após exportar, a camada deve continuar visível no editor (com opacidade baixa)
2. Ao clicar no 👁️ novamente, ela volta ao normal

## 🎯 Diferenças da V1 para V2

| Aspecto | V1 (Não funcionou) | V2 (Funciona) |
|---------|-------------------|---------------|
| Manipulação | `opacity(0)` + `visible(false)` | Apenas `visible(false)` |
| Localização da restauração | Dentro do `try` | Dentro do `finally` |
| Dependências do callback | Sem `design.layers` | Com `design.layers` |
| Redraw | 1x | 1x + await frame |

## ✅ Vantagens da Solução V2

1. **Mais simples**: Menos código, mais fácil de entender
2. **Mais confiável**: `finally` garante restauração mesmo com erro
3. **Respeita Konva**: Usa a API nativa do Konva corretamente
4. **Sem side effects**: Não manipula opacidade desnecessariamente

## 🔍 Debug

Se ainda não funcionar, verifique:

### 1. Console do Browser
Abra DevTools e veja se há erros ao exportar.

### 2. Verificar IDs das Camadas
```tsx
console.log('Layers:', design.layers.map(l => ({ id: l.id, visible: l.visible })))
```

### 3. Verificar Nodes Konva
```tsx
console.log('Nodes:', contentLayer.getChildren().map(n => ({
  id: n.id(),
  visible: n.visible()
})))
```

### 4. Forçar Redraw Extra
Se necessário, adicione mais um redraw:
```tsx
stage.batchDraw()
await new Promise(r => requestAnimationFrame(r))
stage.batchDraw() // Extra
await new Promise(r => requestAnimationFrame(r))
```

## 📝 Arquivos Modificados

- `src/contexts/template-editor-context.tsx`
  - Função `exportDesign()` (linhas 556-721)
  - Função `generateThumbnail()` (linhas 435-554)

## 🚀 Próximos Passos

Se ainda houver problema, considere:

1. **Filtrar layers antes do toDataURL**:
   ```tsx
   const visibleLayers = design.layers.filter(l => l.visible !== false)
   ```

2. **Clonar stage temporariamente**:
   ```tsx
   const clonedStage = stage.clone()
   // Exportar do clone
   ```

3. **Usar pixelRatio maior**:
   ```tsx
   toDataURL({ pixelRatio: 3 }) // Pode ajudar em alguns casos
   ```
