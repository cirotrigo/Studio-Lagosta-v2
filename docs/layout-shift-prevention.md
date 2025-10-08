# 🎯 Prevenção de Layout Shift no Editor

## 📋 Problema

Ao alternar entre diferentes tipos de elementos selecionados (texto, imagem, shape, etc.), os toolbars contextuais aparecem e desaparecem, causando **mudanças no layout** que fazem o canvas "pular" ou reposicionar elementos visualmente.

### Exemplo do Bug
1. Usuário seleciona uma **imagem** → ImageToolbar aparece
2. Usuário seleciona um **texto** → ImageToolbar some, TextToolbar aparece
3. Canvas se **desloca verticalmente** devido à mudança de altura dos toolbars

Isso cria uma **experiência ruim** onde o usuário perde a referência visual do que estava editando.

---

## ✅ Solução Implementada

### 1. Container com Altura Mínima Fixa

No arquivo `src/components/templates/editor-canvas.tsx`, os toolbars contextuais são agrupados em um **container com altura mínima fixa**:

```tsx
<div className="flex-shrink-0 min-h-[52px]">
  {/* Text Toolbar - mostrar apenas quando um texto estiver selecionado */}
  {isTextSelected && selectedLayer && (
    <TextToolbar
      selectedLayer={selectedLayer}
      onUpdateLayer={...}
    />
  )}

  {/* Image Toolbar - mostrar apenas quando uma imagem estiver selecionada */}
  {isImageSelected && selectedLayer && (
    <ImageToolbar
      selectedLayer={selectedLayer}
      onUpdateLayer={...}
    />
  )}
</div>
```

### 2. Cálculo da Altura

A altura mínima (`min-h-[52px]`) é calculada baseada na estrutura dos toolbars:

```
52px = py-2 (padding vertical) + conteúdo interno
     = (0.5rem × 2) + ~36px
     = 16px + 36px
     = 52px
```

### 3. Estrutura Consistente

Todos os toolbars contextuais seguem a **mesma estrutura de altura**:

```tsx
<div className="flex-shrink-0 border-b border-border/40 bg-card shadow-sm">
  <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
    {/* Conteúdo do toolbar */}
  </div>
</div>
```

---

## 🔒 Regras para Prevenir Recorrência

### ✅ DOs (O que FAZER)

1. **Sempre usar container com altura mínima** para toolbars contextuais que aparecem/desaparecem
2. **Manter estrutura de altura consistente** entre todos os toolbars (mesmo `py-` padding)
3. **Documentar a altura** em comentários quando adicionar novos toolbars
4. **Testar alternância** entre diferentes tipos de seleção antes de commit

### ❌ DON'Ts (O que NÃO fazer)

1. **NÃO** renderizar toolbars diretamente no fluxo sem container reservado
2. **NÃO** usar heights diferentes entre toolbars contextuais
3. **NÃO** usar `absolute` positioning para "esconder" o problema
4. **NÃO** remover o `flex-shrink-0` do container

---

## 🧪 Como Testar

Sempre que modificar toolbars contextuais, siga este teste:

1. Abra o editor de templates
2. Adicione uma imagem e um texto no canvas
3. Selecione a **imagem** → ImageToolbar deve aparecer
4. Selecione o **texto** → TextToolbar deve aparecer
5. **Verifique**: O canvas NÃO deve "pular" ou mudar de posição

Se o canvas se mover, o bug voltou!

---

## 📚 Arquivos Relacionados

- `src/components/templates/editor-canvas.tsx` - Container com altura fixa
- `src/components/templates/text-toolbar.tsx` - Toolbar de texto
- `src/components/templates/image-toolbar.tsx` - Toolbar de imagem
- `src/components/templates/alignment-toolbar.tsx` - Toolbar de alinhamento (sempre visível)

---

## 🐛 Histórico de Issues

- **Data**: 2025-10-08
- **Problema**: Layout shift ao alternar entre imagem e texto
- **Causa**: Toolbars contextuais sem altura reservada
- **Solução**: Container com `min-h-[52px]` e estrutura consistente
- **Status**: ✅ Resolvido

---

## 💡 Padrão Recomendado para Novos Toolbars

Ao criar um novo toolbar contextual:

```tsx
export function NewToolbar({ selectedLayer, onUpdateLayer }: ToolbarProps) {
  return (
    // ⚠️ IMPORTANTE: Sempre usar esta estrutura exata para manter altura consistente
    <div className="flex-shrink-0 border-b border-border/40 bg-card shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
        {/* Seus controles aqui */}
      </div>
    </div>
  )
}
```

E no `editor-canvas.tsx`, adicionar dentro do container reservado:

```tsx
<div className="flex-shrink-0 min-h-[52px]">
  {/* Outros toolbars */}

  {isNewTypeSelected && selectedLayer && (
    <NewToolbar
      selectedLayer={selectedLayer}
      onUpdateLayer={...}
    />
  )}
</div>
```

---

## 🔍 Para o Futuro

Se precisar adicionar toolbars com **diferentes alturas** (ex: toolbar complexo com múltiplas linhas):

1. Calcule a **altura máxima** entre todos os toolbars
2. Use essa altura como `min-h-[XXXpx]` no container
3. **Documente** a razão da altura escolhida em comentários
4. Considere usar `h-[XXXpx]` (altura fixa) ao invés de `min-h` se houver muita variação

---

**Última atualização**: 2025-10-08
**Autor**: Claude Code
**Status**: ✅ Implementado e documentado
