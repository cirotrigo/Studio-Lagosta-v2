# Refatoração do Texto - Baseado na Documentação Konva

## Problema Anterior

O texto estava sendo implementado com `width` e `height` fixos, o que causava:
- ❌ Quebra de linha automática indesejada
- ❌ Comportamento estranho ao redimensionar
- ❌ Font size não ajustava corretamente
- ❌ Curved Text não funcionava bem

## Nova Implementação (Baseada em https://konvajs.org/docs/sandbox/Editable_Text.html)

### 1. Removida Width/Height Fixos

**Antes**:
```typescript
<Text
  width={Math.max(20, layer.size?.width ?? 0)}
  height={Math.max(20, layer.size?.height ?? 0)}
  wrap="word"
  ...
/>
```

**Depois**:
```typescript
<Text
  // SEM width/height fixos
  // Konva calcula automaticamente baseado no conteúdo
  wrap="none"
  ...
/>
```

### 2. Adicionado Transform Handler

**Novo código em `konva-editable-text.tsx`**:
```typescript
React.useEffect(() => {
  const textNode = shapeRef.current
  if (!textNode) return

  const handleTransform = () => {
    // Ajustar width baseado no scale e resetar scale
    textNode.setAttrs({
      width: Math.max(textNode.width() * textNode.scaleX(), 20),
      scaleX: 1,
      scaleY: 1,
    })
  }

  textNode.on('transform', handleTransform)

  return () => {
    textNode.off('transform', handleTransform)
  }
}, [shapeRef])
```

**O que faz**:
- Quando usuário redimensiona com transformer
- Calcula nova width = width atual × scaleX
- Reseta scale para 1 (evita distorção)
- Width aumenta/diminui, mas **fontSize permanece constante**

### 3. Atualizado Transform End Handler

**Mudança em `konva-layer-factory.tsx`**:
```typescript
// Para textos, NÃO resetar scale no transformEnd
// O próprio componente Text faz isso no evento 'transform'
if (layer.type !== 'text') {
  node.scaleX(1)
  node.scaleY(1)
}
```

## Novo Comportamento

### ✅ Texto Auto-Dimensiona

- Width/height calculados automaticamente pelo Konva
- Baseado no conteúdo + fontSize
- Sem quebra de linha automática (`wrap="none"`)

### ✅ Redimensionar Texto

**Quando usuário arrasta handles do transformer**:

1. **Durante o transform**:
   - Text node escala visualmente
   - scaleX e scaleY aumentam

2. **Ao soltar (transform event)**:
   - Width ajustada: `width = width × scaleX`
   - Scale resetado: `scaleX = 1, scaleY = 1`
   - **Font size permanece o mesmo**

3. **Resultado**:
   - Caixa de texto maior/menor
   - Mesma fonte
   - Sem distorção

### ✅ Quebra de Linha Manual

- Usuário duplo clica
- Textarea aparece
- Pressiona **Enter** ou **Shift+Enter** para nova linha
- Pressiona **Enter** sem Shift para finalizar

### ✅ Ajustar Font Size

- Use o input de font size na toolbar
- Digite valor específico
- Texto atualiza mas caixa permanece

## Compatibilidade com Curved Text

Com a nova implementação:

1. ✅ **Texto em linha única** (sem quebra automática)
2. ✅ **Width real conhecida** (pode ser calculada)
3. ✅ **Sem scale distorcido** (sempre 1)
4. ✅ **Font size consistente**

Isso permite que o CurvedTextEffect calcule corretamente:
- O path SVG necessário
- O raio do arco
- A posição do texto no path

## Exemplo de Uso

### Criar Texto
```typescript
const textLayer = {
  type: 'text',
  content: 'Hello World',
  position: { x: 100, y: 100 },
  style: {
    fontSize: 24,
    fontFamily: 'Inter',
    color: '#000000'
  }
  // NÃO precisa definir size.width/height
}
```

### Redimensionar Texto
1. Selecionar texto
2. Arrastar handle direito → Aumenta width
3. Font size permanece 24px
4. Texto expande horizontalmente

### Aumentar Font Size
1. Selecionar texto
2. Toolbar → Font Size input → Digite 48
3. Font size muda para 48px
4. Width auto-ajusta para caber o texto

## Testes

- [ ] Criar texto curto
- [ ] Redimensionar horizontalmente → Width aumenta, fontSize não muda
- [ ] Duplo clique → Textarea aparece
- [ ] Pressionar Enter → Nova linha
- [ ] Finalizar edição → Texto atualiza
- [ ] Ativar Curved Text → Deve curvar corretamente
- [ ] Desativar Curved Text → Volta ao normal

## Observações Importantes

### Width vs Font Size

- **Width**: Controla quanto espaço horizontal o texto ocupa
- **Font Size**: Controla tamanho dos caracteres
- São **independentes** agora!

### Auto-Dimensionamento

Quando `width` NÃO é definido:
- Konva calcula baseado no conteúdo
- Texto sempre visível completo
- Sem cortes ou ellipsis

Quando `width` É definido:
- Texto limitado a essa largura
- Com `wrap="none"`, texto pode ultrapassar
- Usado para "caixas de texto" redimensionáveis

### Wrap Modes

- `wrap="none"`: Sem quebra, texto em linha única (exceto \n manual)
- `wrap="word"`: Quebra em palavras quando atinge width
- `wrap="char"`: Quebra em caracteres quando atinge width

Estamos usando `wrap="none"` para comportamento tipo "título".
