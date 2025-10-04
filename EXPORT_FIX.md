# Correção de Exportação - Camadas Invisíveis

## 🐛 Problema Identificado

Quando uma camada era marcada como **invisível** (visible: false) através do toggle do painel de camadas, ao exportar o design:
- ❌ A camada aparecia na exportação com **opacidade de 25%**
- ❌ Deveria estar **completamente oculta** (não aparecer na exportação)

## 🔍 Causa Raiz

No arquivo `konva-layer-factory.tsx`, linha 69:

```tsx
const opacity = isVisible ? layer.style?.opacity ?? 1 : 0.25
```

Quando `visible: false`, a opacidade era definida como `0.25` (25%) para permitir que o usuário veja uma versão "fantasma" da camada durante a edição. Isso é útil no editor, mas não deveria afetar a exportação.

## ✅ Solução Implementada

### 1. **Durante a Exportação**: Ocultar completamente camadas invisíveis

Em `template-editor-context.tsx`, adicionamos lógica nas funções `exportDesign()` e `generateThumbnail()`:

```tsx
// 6. Ocultar completamente camadas invisíveis (visible: false)
const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined
const invisibleLayersState: Array<{
  node: any
  originalOpacity: number
  originalVisible: boolean
}> = []

if (contentLayer) {
  (contentLayer as Konva.Layer).getChildren().forEach((node: any) => {
    const layerId = node.id()
    const layer = design.layers.find((l) => l.id === layerId)

    // Se a camada está marcada como invisível, ocultar completamente
    if (layer && layer.visible === false) {
      invisibleLayersState.push({
        node,
        originalOpacity: node.opacity(),
        originalVisible: node.visible(),
      })
      node.opacity(0) // Opacidade 0 = completamente invisível
      node.visible(false) // Também ocultar o node do Konva
    }
  })
}
```

### 2. **Após a Exportação**: Restaurar estado original

```tsx
// Restaurar estado das camadas invisíveis
invisibleLayersState.forEach(({ node, originalOpacity, originalVisible }) => {
  node.opacity(originalOpacity)
  node.visible(originalVisible)
})
```

## 🎯 Resultado

### Antes da Correção
```
Camada Invisível no Editor → Exportação com 25% de opacidade ❌
```

### Depois da Correção
```
Camada Invisível no Editor → Completamente ausente da exportação ✅
```

## 📝 Arquivos Modificados

1. **`src/contexts/template-editor-context.tsx`**
   - Função `exportDesign()` - linhas ~557-576 e ~663-667
   - Função `generateThumbnail()` - linhas ~470-491 e ~529-533

## 🔧 Como Funciona

### No Editor (Durante Edição)
1. Camada com `visible: false` → Renderizada com opacidade 25%
2. Usuário vê versão "fantasma" para referência
3. Não pode interagir com a camada

### Durante Exportação
1. **Antes de exportar**: Itera sobre todas as camadas
2. **Encontra camadas invisíveis**: `layer.visible === false`
3. **Salva estado atual**: Opacidade e visibilidade do node Konva
4. **Oculta completamente**: `node.opacity(0)` e `node.visible(false)`
5. **Exporta a imagem**: Konva renderiza sem as camadas invisíveis
6. **Restaura estado**: Volta ao estado original (opacidade 25% para visualização)

## 🧪 Como Testar

1. Adicione uma camada (texto ou imagem) ao canvas
2. Clique no ícone 👁️ no painel de camadas para ocultar
3. Verifique que a camada fica com opacidade baixa (normal)
4. Clique em **Download** para exportar
5. ✅ A camada não deve aparecer na imagem exportada
6. ✅ No editor, a camada deve continuar visível com opacidade baixa

## 🎨 Benefícios

- ✅ Camadas invisíveis não aparecem na exportação final
- ✅ Mantém a visualização "fantasma" no editor para referência
- ✅ Não quebra a experiência de edição
- ✅ Funciona tanto para exportação (JPEG/PNG) quanto para thumbnails
- ✅ Estado é restaurado corretamente após exportação

## 📚 Referências

- Konva.js Documentation: https://konvajs.org/api/Konva.Node.html#visible
- Issue relacionada: Exportação com opacidade incorreta para camadas invisíveis
