# Implementação Final do Texto - Comportamento Tipo Canva

## Baseado na Documentação Oficial
- https://konvajs.org/docs/sandbox/Editable_Text.html
- https://konvajs.org/docs/select_and_transform/Resize_Text.html

## Comportamento Implementado

### ✅ Redimensionar Texto = Ajustar Font Size

Quando o usuário redimensiona o texto usando o transformer:

1. **Durante o transform**:
   - Text node escala visualmente
   - `scaleX` e `scaleY` aumentam/diminuem

2. **No evento `transform`** (tempo real):
   - Calcula escala mínima: `scale = Math.min(scaleX, scaleY)`
   - Calcula novo fontSize: `newFontSize = currentFontSize × scale`
   - Aplica fontSize mínimo: `Math.max(8, newFontSize)`
   - **Reseta scales**: `scaleX = 1, scaleY = 1`
   - Atualiza layer com novo fontSize

3. **Resultado**:
   - ✅ Texto maior/menor visualmente
   - ✅ Font size aumenta/diminui proporcionalmente
   - ✅ Sem distorção (scale sempre 1)
   - ✅ Comportamento igual ao Canva/Figma

### ✅ Sem Quebra Automática de Linha

```typescript
wrap="none"  // Texto não quebra automaticamente
```

**Comportamento**:
- Texto fica em linha única
- Para quebrar, usuário pressiona **Enter** ao editar
- Texto pode ultrapassar limites da caixa

### ✅ Auto-Dimensionamento

```typescript
// SEM width/height fixos no componente
<Text
  text={content}
  fontSize={fontSize}
  wrap="none"
  // width/height calculados automaticamente
/>
```

**Comportamento**:
- Konva calcula width/height baseado no conteúdo
- Sempre visível completo
- Ajusta dinamicamente ao editar

## Código Implementado

### `konva-editable-text.tsx`

```typescript
// Transform handler - ajusta fontSize ao redimensionar
React.useEffect(() => {
  const textNode = shapeRef.current
  if (!textNode) return

  const handleTransform = () => {
    const scaleX = textNode.scaleX()
    const scaleY = textNode.scaleY()
    const scale = Math.min(scaleX, scaleY)

    const currentFontSize = textNode.fontSize()
    const newFontSize = Math.max(8, Math.round(currentFontSize * scale))

    textNode.setAttrs({
      fontSize: newFontSize,
      scaleX: 1,
      scaleY: 1,
    })

    onChange({
      style: {
        ...layer.style,
        fontSize: newFontSize,
      },
    })
  }

  textNode.on('transform', handleTransform)
  return () => textNode.off('transform', handleTransform)
}, [shapeRef, layer.style, onChange])
```

### Componente Text

```typescript
<Text
  {...commonProps}
  ref={shapeRef}
  text={layer.content ?? ''}
  fontSize={layer.style?.fontSize ?? 16}
  fontFamily={layer.style?.fontFamily ?? 'Inter'}
  fill={layer.style?.color ?? '#000000'}
  wrap="none"
  // Resto das props...
/>
```

## Fluxo de Redimensionamento

```
1. Usuário arrasta handle do transformer
   ↓
2. Konva aumenta scaleX/scaleY do text node
   ↓
3. Evento 'transform' dispara
   ↓
4. handleTransform() calcula novo fontSize
   ↓
5. Aplica fontSize e reseta scale para 1
   ↓
6. Atualiza layer.style.fontSize
   ↓
7. Texto renderiza com novo tamanho
```

## Diferenças com Abordagens Anteriores

### ❌ Abordagem Antiga
- Width/height fixos
- `wrap="word"` - quebrava automaticamente
- Ajustava width, não fontSize
- Comportamento confuso ao redimensionar

### ✅ Nova Abordagem
- Width/height auto-calculados
- `wrap="none"` - sem quebra automática
- Ajusta fontSize ao redimensionar
- Comportamento intuitivo (tipo Canva)

## Compatibilidade com Curved Text

Com a nova implementação:

1. ✅ **Texto em linha única** (wrap="none")
2. ✅ **Font size consistente** (fácil calcular path)
3. ✅ **Sem scale distorcido** (sempre 1)
4. ✅ **Width real calculada** (baseado em fontSize + conteúdo)

O CurvedTextEffect agora pode:
- Calcular width correta do texto
- Criar path SVG apropriado
- Aplicar curvatura sem distorção

## Testes

### Teste 1: Redimensionar Texto
1. Criar texto "HELLO"
2. Selecionar texto
3. Arrastar handle direito para direita
4. **Esperado**: Texto aumenta, fontSize aumenta
5. **Verificar**: Input fontSize na toolbar mostra novo valor

### Teste 2: Quebra de Linha Manual
1. Duplo clique no texto
2. Digite "Linha 1"
3. Pressione Enter
4. Digite "Linha 2"
5. **Esperado**: Duas linhas separadas

### Teste 3: Curved Text
1. Criar texto "CURVED TEXT"
2. Abrir Effects panel
3. Ativar Curved Text
4. Ajustar slider Power
5. **Esperado**: Texto curva em arco suave

### Teste 4: Redimensionar + Curved
1. Criar texto curvo
2. Desativar Curved
3. Redimensionar texto (aumentar)
4. Ativar Curved novamente
5. **Esperado**: Curva se ajusta ao novo tamanho

## Limitações Conhecidas

### Font Size Mínimo
- Definido em **8px**
- Usuário não pode reduzir abaixo disso
- Previne texto ilegível

### Escala Mínima
- Usa `Math.min(scaleX, scaleY)`
- Garante proporção ao redimensionar
- Evita texto "esticado"

### Performance
- `onChange()` chamado durante transform
- Pode causar re-renders frequentes
- Considerar debounce se necessário

## Próximos Passos Sugeridos

- [ ] Adicionar opção para modo "Paragraph" com `wrap="word"`
- [ ] Implementar limite máximo de fontSize
- [ ] Adicionar animação suave ao redimensionar
- [ ] Melhorar performance com debounce/throttle
- [ ] Adicionar indicador visual de fontSize durante resize
