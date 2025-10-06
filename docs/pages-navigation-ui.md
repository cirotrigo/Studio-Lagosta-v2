# 🎨 Interface de Navegação de Páginas - Redesign

## ✨ Nova Interface (Mais Visível e Intuitiva)

A interface de navegação de páginas foi completamente redesenhada para ser **mais visível e intuitiva**, inspirada no Polotno/Canva.

---

## 📐 Estrutura da Barra de Páginas

```
┌─────────────────────────────────────────────────────────────────────┐
│  ◄  1/3  ►  │  [Duplicar] [Deletar] [+ Nova Página]                │ ← Barra de Controles (40px)
├─────────────────────────────────────────────────────────────────────┤
│  [Pág.1] [Pág.2] [Pág.3*] [+]                      [Canvas Preview] │ ← Miniaturas (90px)
└─────────────────────────────────────────────────────────────────────┘
```

**Total:** 130px de altura (antes: 96px)

---

## 🎯 Seção 1: Barra de Controles (Sempre Visível)

### Esquerda: Navegação

```
┌──────────────────────┐
│  ◄   1 / 3   ►      │
└──────────────────────┘
```

- **Botão ◄** (Anterior)
  - Atalho: `Ctrl + PageUp`
  - Desabilitado na primeira página
  - Ghost button (h-8 w-8)

- **Contador**: "1 / 3"
  - Texto pequeno (text-xs)
  - Cor: text-muted-foreground

- **Botão ►** (Próxima)
  - Atalho: `Ctrl + PageDown`
  - Desabilitado na última página
  - Ghost button (h-8 w-8)

### Direita: Ações da Página Atual

```
┌────────────────────────────────────────────────┐
│  [📋 Duplicar]  [🗑️ Deletar]  [+ Nova Página] │
└────────────────────────────────────────────────┘
```

**Botões sempre visíveis** (não mais apenas no hover!):

1. **Duplicar**
   - Ícone: Copy
   - Variant: outline
   - Altura: h-8
   - Texto: "Duplicar"
   - Duplica a **página atual**

2. **Deletar**
   - Ícone: Trash2
   - Variant: outline
   - Altura: h-8
   - Texto: "Deletar"
   - **Desabilitado** se só há 1 página
   - Deleta a **página atual**

3. **Nova Página**
   - Ícone: Plus
   - Variant: default (primary)
   - Altura: h-8
   - Texto: "Nova Página"
   - **Destaque** com cor primária

---

## 🖼️ Seção 2: Miniaturas das Páginas

### Layout

```
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│   1    │  │   2    │  │   3    │  │   +    │
│ [img]  │  │ [img]  │  │ [img]  │  │        │
│ Pág. 1 │  │ Pág. 2 │  │ Pág. 3 │  │        │
└────────┘  └────────┘  └────────┘  └────────┘
  normal     normal      ATIVA       adicionar
```

### Miniatura de Página

**Dimensões:**
- Tamanho: 56x56px (h-14 w-14)
- Border: 2px
- Border radius: rounded

**Estados:**

1. **Normal** (não ativa)
   ```css
   border-color: border/60
   hover: border-primary/60
   hover: scale-102
   ```

2. **Ativa** (página atual)
   ```css
   border-color: primary
   shadow: shadow-md
   scale: scale-105
   ```

**Conteúdo:**
- Se há thumbnail: `<img>` do preview
- Se não há: Background muted com número da página

**Label:**
```
Pág. 1
```
- Tamanho: text-[10px]
- Cor normal: text-muted-foreground
- Cor ativa: text-primary font-semibold

### Botão Adicionar (+)

```
┌────────┐
│        │
│   +    │
│        │
└────────┘
```

- Mesmo tamanho das miniaturas (56x56px)
- Border dashed
- Ícone Plus (h-5 w-5)
- Hover: border-primary + bg-primary/5

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl + PageUp` | Ir para página anterior |
| `Ctrl + PageDown` | Ir para próxima página |

**Implementação:**
- Event listener no `window`
- `preventDefault()` para evitar scroll da página
- Funciona em qualquer parte do editor

---

## 🎨 Estilos e Animações

### Transições Suaves

```typescript
// Escala ao hover
className="transition-all hover:scale-102"

// Escala da página ativa
className={currentPageId === page.id ? 'scale-105' : ''}

// Cor do label
className={`transition-colors ${
  currentPageId === page.id
    ? 'font-semibold text-primary'
    : 'text-muted-foreground'
}`}
```

### Cores

- **Primary**: Página ativa, botão "Nova Página"
- **Muted**: Labels normais, backgrounds vazios
- **Border**: Bordas normais
- **Destructive**: Não usado (deletar usa outline)

---

## 🔄 Comportamento

### Ao Clicar em Miniatura

1. `setCurrentPageId(page.id)`
2. PageSyncWrapper detecta mudança
3. Carrega layers da nova página
4. Canvas re-renderiza
5. Borda da miniatura fica primary
6. Label fica bold e primary

### Ao Clicar em "Duplicar"

1. Duplica **página atual** (não precisa selecionar)
2. Toast: "Página duplicada!"
3. Nova miniatura aparece no final
4. Cache do TanStack Query invalida
5. Lista atualiza automaticamente

### Ao Clicar em "Deletar"

1. Deleta **página atual**
2. Validação: mínimo 1 página
3. Se for a última, botão fica disabled
4. Se deletar página ativa, navega para próxima/anterior
5. Toast: "Página deletada!"

### Ao Clicar em "Nova Página"

1. Cria página no banco
2. Herda dimensões do canvas atual
3. Nome: "Página {número}"
4. **Navega automaticamente** para nova página
5. Toast: "Página criada!"

---

## 🆚 Comparação: Antes vs Depois

### Antes (Hover Only)

```
Problemas:
❌ Botões só apareciam no hover (difícil descobrir)
❌ Ações em cada miniatura (repetitivo)
❌ Sem navegação rápida (◄ ►)
❌ Sem contador de páginas
❌ Botão "+" pequeno e discreto
```

### Depois (Always Visible)

```
Melhorias:
✅ Botões SEMPRE visíveis na barra superior
✅ Ações aplicadas à página ATUAL (mais lógico)
✅ Navegação rápida com setas
✅ Contador mostra posição (1/3)
✅ Botão "Nova Página" em destaque
✅ Atalhos de teclado funcionais
✅ Interface mais clean e profissional
```

---

## 📱 Responsividade

### Overflow Horizontal

```typescript
<div className="flex flex-1 items-center gap-3 overflow-x-auto px-4 py-2">
```

- Quando há muitas páginas (>10), scroll horizontal automático
- Miniaturas mantém tamanho fixo (não encolhem)
- Scroll suave com gap-3 entre itens

### Preview do Canvas

```typescript
<CanvasPreview />
```

- Mantido no canto direito
- Não afeta área de miniaturas
- Removível se necessário

---

## 🎯 Casos de Uso

### Cenário 1: Adicionar Primeira Página Extra

```
1. Usuário está na "Página 1"
2. Clica em [+ Nova Página]
3. Sistema cria "Página 2"
4. Navega automaticamente para Página 2
5. Canvas vazio, pronto para editar
6. Contador mostra "2 / 2"
```

### Cenário 2: Duplicar Página com Conteúdo

```
1. Usuário está na "Página 2" (tem layers)
2. Clica em [Duplicar]
3. Sistema cria "Página 2 (cópia)"
4. Cópia tem TODOS os layers da original
5. Nova miniatura aparece no final
6. Contador mostra "2 / 3"
7. Usuário continua na Página 2 (não navega)
```

### Cenário 3: Navegar com Teclado

```
1. Usuário está na "Página 2"
2. Pressiona Ctrl+PageDown
3. Navega para "Página 3"
4. Layers são automaticamente salvos/carregados
5. Miniatura "Página 3" fica destacada
```

### Cenário 4: Deletar Página Intermediária

```
1. Template tem: Pág.1, Pág.2, Pág.3
2. Usuário está na Pág.2
3. Clica em [Deletar]
4. Pág.2 é removida
5. Sistema navega para Pág.1 (anterior)
6. Contador mostra "1 / 2"
```

---

## 🔧 Código Chave

### Estrutura do Componente

```typescript
function PagesBar() {
  // Estados e hooks
  const { pages, currentPageId, setCurrentPageId } = useMultiPage()
  const sortedPages = useMemo(() => [...pages].sort((a, b) => a.order - b.order), [pages])

  // Handlers
  const handleAddPage = useCallback(...)
  const handleDuplicatePage = useCallback(...)
  const handleDeletePage = useCallback(...)

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'PageUp') { ... }
      if (e.ctrlKey && e.key === 'PageDown') { ... }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sortedPages, currentPageId, setCurrentPageId])

  return (
    <div className="flex h-32 flex-col">
      {/* Barra de controles */}
      <div className="flex items-center justify-between">
        {/* Navegação ◄ 1/3 ► */}
        {/* Ações [Duplicar] [Deletar] [Nova] */}
      </div>

      {/* Miniaturas */}
      <div className="flex items-center gap-3 overflow-x-auto">
        {sortedPages.map(page => <Miniatura />)}
        <BotaoAdicionar />
      </div>
    </div>
  )
}
```

---

## 📊 Métricas de Usabilidade

### Cliques Reduzidos

**Antes:**
```
Adicionar página: 1 clique no "+"
Duplicar página: 2 cliques (hover + botão)
Deletar página: 2 cliques (hover + botão)
Navegar: 1 clique na miniatura
```

**Depois:**
```
Adicionar página: 1 clique em [Nova Página]
Duplicar página: 1 clique em [Duplicar]
Deletar página: 1 clique em [Deletar]
Navegar: 1 clique na miniatura OU atalho
```

### Descobribilidade

**Antes:**
- Botões ocultos (hover only)
- Usuário precisa "descobrir" hover

**Depois:**
- Todos os botões visíveis
- Textos descritivos
- Atalhos documentados nos tooltips

---

## ✅ Checklist de Implementação

- [x] Barra de controles sempre visível
- [x] Botões de navegação (◄ ►)
- [x] Contador de páginas (1/3)
- [x] Botão Duplicar sempre visível
- [x] Botão Deletar sempre visível (disabled se 1 página)
- [x] Botão Nova Página em destaque
- [x] Miniaturas com estados (normal/ativa)
- [x] Labels "Pág. X" abaixo das miniaturas
- [x] Botão "+" para adicionar
- [x] Atalhos de teclado (Ctrl+PageUp/Down)
- [x] Transições suaves (scale, colors)
- [x] Overflow horizontal para muitas páginas
- [x] TypeScript sem erros
- [x] Toasts informativos

---

## 🎉 Resultado

A nova interface é **significativamente mais intuitiva** e profissional, eliminando a necessidade de hover para descobrir funcionalidades críticas.

**Principais ganhos:**
1. ✅ Ações sempre visíveis
2. ✅ Navegação mais rápida
3. ✅ Melhor feedback visual
4. ✅ Atalhos de teclado funcionais
5. ✅ Interface mais limpa e moderna
