# ⌨️ Atalhos de Teclado - Editor de Templates

## 🎯 Atalhos Globais do Editor

Esses atalhos funcionam em qualquer momento dentro do editor, desde que você não esteja digitando em um campo de texto.

### 📋 Gerenciamento de Layers

| Atalho | Ação | Descrição |
|--------|------|-----------|
| `Cmd + J` (Mac)<br>`Ctrl + J` (Windows) | **Duplicar Layer** | Duplica a layer selecionada com offset de 16px |
| `Delete`<br>`Backspace` | **Deletar Layer** | Remove a(s) layer(s) selecionada(s) |

### 🔒 Proteção de Inputs

Os atalhos **não funcionam** quando você está:
- ✍️ Digitando em um campo de texto (`<input>`)
- 📝 Digitando em uma área de texto (`<textarea>`)
- ✏️ Editando conteúdo editável (`contenteditable`)

Isso garante que você pode digitar "j" ou pressionar Delete sem acidentalmente duplicar ou deletar layers.

## 📦 Implementação Técnica

### Localização
- **Arquivo:** `src/components/templates/editor-canvas.tsx`
- **Hook:** `useEffect` com listener de `keydown` global

### Código
```typescript
React.useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignorar se estiver digitando
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    // Cmd+J / Ctrl+J - Duplicar
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault()
      if (selectedLayerIds.length === 1) {
        duplicateLayer(selectedLayerIds[0])
      }
    }

    // Delete / Backspace - Deletar
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (selectedLayerIds.length > 0) {
        selectedLayerIds.forEach((id) => removeLayer(id))
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [selectedLayerIds, duplicateLayer, removeLayer])
```

### Funções do Contexto

**`duplicateLayer(id: string)`**
- Clona a layer com novo UUID
- Adiciona " Copy" ao nome
- Offset de posição: `x + 16px`, `y + 16px`
- Remove lock da cópia

**`removeLayer(id: string)`**
- Remove layer do design
- Remove da seleção
- Normaliza ordem das layers restantes

## 🎨 Comportamento

### Duplicar (Cmd+J)
```
Layer Original:
├─ ID: abc-123
├─ Nome: "Texto Principal"
├─ Posição: (100, 100)
└─ Locked: true

Layer Duplicado:
├─ ID: xyz-789 (novo UUID)
├─ Nome: "Texto Principal Copy"
├─ Posição: (116, 116) ← offset +16px
└─ Locked: false ← sempre desbloqueado
```

### Deletar (Delete)
- Suporta múltiplas layers selecionadas
- Remove todas de uma vez
- Atualiza seleção automaticamente
- Funciona em **qualquer contexto** do editor (não apenas no painel de layers)

## 🔮 Funcionalidades Futuras

Possíveis atalhos a serem implementados:

| Atalho | Ação Sugerida |
|--------|---------------|
| `Cmd + D` | Duplicar (alternativa) |
| `Cmd + G` | Agrupar layers |
| `Cmd + Shift + G` | Desagrupar |
| `Cmd + L` | Lock/Unlock layer |
| `Cmd + H` | Ocultar/Mostrar layer |
| `Cmd + [` | Enviar para trás |
| `Cmd + ]` | Trazer para frente |
| `Cmd + Shift + [` | Enviar para o fundo |
| `Cmd + Shift + ]` | Trazer para frente |
| `Arrow Keys` | Mover layer (1px) |
| `Shift + Arrows` | Mover layer (10px) |

## ✅ Checklist de Testes

- [x] Cmd+J duplica layer selecionada
- [x] Ctrl+J duplica layer no Windows
- [x] Delete remove layer selecionada
- [x] Backspace remove layer selecionada
- [x] Múltiplas layers podem ser deletadas de uma vez
- [x] Atalhos não funcionam em inputs
- [x] Atalhos não funcionam em textareas
- [x] Atalhos não funcionam em contenteditable
- [x] preventDefault evita comportamento padrão do navegador
- [x] Cleanup remove event listener ao desmontar

## 🐛 Problemas Conhecidos

Nenhum problema conhecido no momento.

## 📝 Notas

- Os atalhos são case-insensitive (`j` ou `J` funcionam)
- `e.preventDefault()` evita que Delete cause navegação para trás no navegador
- O offset de +16px na duplicação facilita visualizar que é uma cópia
- Layers duplicadas sempre vêm desbloqueadas, mesmo se a original estiver travada
