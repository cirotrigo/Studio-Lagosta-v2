# Troubleshooting - Sistema de Efeitos

## Como Debugar

### 1. Verificar se o painel está abrindo

Abra o console do navegador (F12) e procure por:

```
[EditorCanvas] Effects button clicked. Current state: false
```

Se não aparecer, o botão não está sendo clicado ou não existe.

### 2. Verificar se o node está sendo encontrado

Procure por:

```
[EditorCanvas] Stage encontrado: Stage
[EditorCanvas] Stage children: 1
[EditorCanvas] Buscando node com ID: {id}
[EditorCanvas] Node encontrado: Text
```

Se aparecer "Nenhum node encontrado", significa que o ID do layer não corresponde ao ID do node Konva.

### 3. Verificar se o painel está sendo renderizado

Procure por:

```
[EffectsPanel] Component rendered
[EffectsPanel] Props: { hasSelectedNode: true, hasLayer: true, nodeType: 'Text' }
```

Se não aparecer, o componente não está sendo montado.

### 4. Verificar se os efeitos estão sendo carregados

Procure por:

```
[EffectsPanel] Selected node changed: Text
[EffectsPanel] Loaded config: { blur: {...}, stroke: {...}, ... }
```

## Problemas Comuns

### Painel não abre

**Causa**: Estado `isEffectsPanelOpen` não está mudando
**Solução**: Verificar se o botão está chamando `handleEffectsClick`

### Painel abre mas está vazio

**Causa**: `selectedNode` ou `layer` são `null`
**Solução**: Verificar logs de busca do node

### Efeitos não aparecem nos controles

**Causa**: `DEFAULT_EFFECTS_CONFIG` não está sendo importado corretamente
**Solução**: Verificar import de `@/lib/konva/effects`

### Efeitos não são aplicados

**Causa 1**: `layer.batchDraw()` não está sendo chamado
**Solução**: Adicionar `layer.batchDraw()` após aplicar efeito

**Causa 2**: Node está cached
**Solução**: Chamar `node.clearCache()` antes de aplicar efeitos

## Comandos Úteis

### Ver todos os stages do Konva
```javascript
console.log('Konva stages:', Konva.stages)
```

### Ver todos os nodes de um layer
```javascript
const layer = stage.children[0]
console.log('Layer children:', layer.children)
```

### Ver ID de um node
```javascript
const node = layer.children[0]
console.log('Node ID:', node.id())
```

### Ver attrs de um node
```javascript
console.log('Node attrs:', node.attrs)
```

## Checklist de Debug

- [ ] Botão "Effects" aparece na toolbar quando texto está selecionado
- [ ] Botão tem ícone Sparkles e texto "Effects"
- [ ] Clicar no botão mostra log no console
- [ ] Log mostra `selectedNode` e `layer` não-null
- [ ] Painel lateral aparece na direita
- [ ] Painel mostra header "Effects" com botão X
- [ ] Controles de efeitos aparecem (Blur, Stroke, etc)
- [ ] Toggles dos efeitos estão visíveis
- [ ] Sliders aparecem quando toggle está ativo

## Se nada funcionar

1. Limpar cache do navegador (Ctrl+Shift+Delete)
2. Remover `.next` e rebuildar:
   ```bash
   rm -rf .next
   npm run dev
   ```
3. Verificar erros no console do navegador
4. Verificar erros no terminal do Next.js
5. Verificar se todos os arquivos foram criados corretamente:
   ```bash
   ls -la src/lib/konva/effects/
   ls -la src/components/canvas/effects/
   ```
