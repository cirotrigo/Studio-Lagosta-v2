# Alterações no Comportamento do Texto

## Problema Original

A caixa de texto estava configurada para quebrar automaticamente as linhas (`wrap="word"`), o que não é o comportamento desejado para um editor de design como Canva.

## Mudanças Implementadas

### 1. Desativada Quebra Automática de Linha

**Arquivo**: `src/components/templates/konva-editable-text.tsx`

**Antes**:
```typescript
wrap="word"  // Quebrava automaticamente ao atingir a largura
```

**Depois**:
```typescript
wrap="none"  // Sem quebra automática
```

**Comportamento**:
- ✅ Texto NÃO quebra automaticamente
- ✅ Para quebrar linha, usuário pressiona **Enter** ou **Shift+Enter**
- ✅ Texto pode ultrapassar os limites da caixa

### 2. Font Size Ajusta ao Redimensionar

**Arquivo**: `src/components/templates/konva-layer-factory.tsx`

**Nova Funcionalidade**:
- Quando usuário redimensiona a caixa de texto (usando transformer)
- O `fontSize` é ajustado **proporcionalmente** ao scale
- Usa média de `scaleX` e `scaleY` para manter proporção

**Código Adicionado**:
```typescript
if (layer.type === 'text') {
  const avgScale = (scaleX + scaleY) / 2
  const currentFontSize = layer.style?.fontSize ?? 16
  const newFontSize = Math.max(8, Math.round(currentFontSize * avgScale))

  updates.style = {
    ...layer.style,
    fontSize: newFontSize,
  }
}
```

**Comportamento**:
- ✅ Redimensionar **aumenta/diminui** o tamanho da fonte
- ✅ Font size mínimo: **8px**
- ✅ Mantém todas as outras propriedades de estilo
- ✅ Redimensionamento proporcional (média de X e Y)

## Como Usar

### Quebra de Linha Manual
1. Duplo clique no texto para editar
2. Digite o texto
3. Pressione **Enter** para nova linha
4. Pressione **Shift + Enter** também adiciona nova linha
5. Pressione **Enter** sem Shift para finalizar edição

### Redimensionar com Ajuste de Fonte
1. Selecione o texto
2. Arraste os handles do transformer
3. Font size ajusta automaticamente
4. Caixa redimensiona junto

### Redimensionar SEM Ajuste de Fonte
- Use o **input de font size** na toolbar
- Digite valor específico
- Não redimensione a caixa fisicamente

## Impacto no Curved Text

Com essas mudanças, o Curved Text deve funcionar melhor porque:

1. **Sem quebra de linha** = Texto fica em uma única linha
2. **Font size consistente** = Path SVG pode ser calculado corretamente
3. **Width real do texto** = Mais fácil calcular o arco necessário

## Testes Recomendados

- [ ] Criar texto curto (ex: "HELLO")
- [ ] Redimensionar caixa → Font size deve aumentar/diminuir
- [ ] Editar texto e pressionar Enter → Deve criar nova linha
- [ ] Ativar Curved Text → Deve curvar sem quebrar
- [ ] Ajustar curvatura → Deve atualizar em tempo real
- [ ] Desativar Curved Text → Deve voltar ao normal

## Notas Importantes

### ⚠️ Width da Caixa de Texto

A propriedade `width` do Text agora controla o "container", mas o texto NÃO quebra.

Se quiser que o texto quebre em uma largura específica, você pode:
1. Adicionar opção na UI para escolher modo "Auto-wrap" vs "No-wrap"
2. Ter dois tipos de texto: "Título" (no-wrap) e "Parágrafo" (word-wrap)

### 💡 Sugestão Futura

Considere adicionar modos de texto:
- **Heading Mode**: `wrap="none"`, ajusta fontSize ao redimensionar
- **Paragraph Mode**: `wrap="word"`, mantém fontSize fixo

Isso daria flexibilidade para diferentes casos de uso.
