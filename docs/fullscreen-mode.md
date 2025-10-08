# Modo Fullscreen - Template Editor

## Visão Geral

O modo fullscreen foi implementado no Template Editor para proporcionar máximo aproveitamento da área de trabalho, permitindo que designers trabalhem com mais foco e espaço para visualizar seus designs.

## Funcionalidades

### ✅ Recursos Implementados

1. **Botão "Tela Cheia"** - Localizado no header do editor, permite entrar em modo fullscreen
2. **Botão "Sair da Tela Cheia"** - Aparece flutuante no canto superior direito quando em fullscreen
3. **Toolbar Vertical** - Barra de ícones lateral esquerda permanece visível em fullscreen
4. **Painéis Laterais** - Podem ser abertos/fechados normalmente em fullscreen
5. **Barra de Páginas Colapsável** - Pode ser expandida ou colapsada para economizar espaço vertical
6. **Header Oculto** - Nome do template e botões de ação são escondidos em fullscreen
7. **Canvas Maximizado** - Ocupa toda a área disponível da tela

### 🎯 Comportamento

#### Ao entrar em Fullscreen:
- Editor é renderizado via React Portal diretamente no `document.body`
- Escapa completamente da hierarquia do layout (sidebar principal, containers, etc)
- Usa `position: fixed` com `inset-0` para ocupar toda a tela
- Z-index 9999 garante que fique acima de todos elementos
- Body scroll é desabilitado (`overflow: hidden`)
- Header do editor (nome e botões) é ocultado
- Painéis laterais ativos são fechados automaticamente

#### Ao sair do Fullscreen:
- Editor retorna para renderização normal dentro do layout
- Body scroll é restaurado
- Header do editor volta a aparecer
- Todos os estilos são restaurados

## Implementação Técnica

### Arquivos Modificados

**`src/components/templates/template-editor-shell.tsx`**

### Estados

```typescript
const [isFullscreen, setIsFullscreen] = React.useState(false)
const [isPagesBarCollapsed, setIsPagesBarCollapsed] = React.useState(false)
```

### Toggle Fullscreen

```typescript
const toggleFullscreen = React.useCallback(() => {
  setIsFullscreen((prev) => !prev)
  if (!isFullscreen) {
    setActivePanel(null) // Fechar painel lateral ao entrar em fullscreen
  }
}, [isFullscreen])
```

### React Portal

Quando `isFullscreen === true`, o editor é renderizado através de um **React Portal**:

```typescript
if (isFullscreen && typeof window !== 'undefined') {
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background">
      {editorContent}
    </div>,
    document.body
  )
}

return editorContent
```

**Vantagens do Portal:**
- Escapa completamente do layout pai (sem limitações de width/height/padding)
- Renderizado diretamente no `document.body`
- Evita problemas com z-index e overflow de containers pais
- Não depende de manipulação manual do DOM

### Gestão de Scroll

```typescript
React.useEffect(() => {
  if (isFullscreen) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
}, [isFullscreen])
```

### Estrutura do Layout

```
Modo Normal:
└── Protected Layout (sidebar + topbar)
    └── Main Container (max-width: 1400px, padding)
        └── Glass Panel (border, padding, background)
            └── Template Editor

Modo Fullscreen (via Portal):
└── document.body
    └── Portal Container (fixed inset-0)
        └── Template Editor
            ├── Toolbar Vertical (sempre visível)
            ├── Painéis Laterais (opcional)
            ├── Canvas Area
            └── Barra de Páginas (colapsável)
```

## Barra de Páginas Colapsável

### Interface

```typescript
interface PagesBarProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
}
```

### Estados de Altura

- **Expandido**: `h-32` - Mostra controles completos e miniaturas
- **Colapsado**: `h-10` - Mostra apenas contador de páginas e botão expandir

### Transição Suave

```typescript
className={`flex flex-shrink-0 flex-col border-t border-border/40 bg-card transition-all ${
  isCollapsed ? 'h-10' : 'h-32'
}`}
```

### Controles

**Estado Colapsado:**
- Texto: "Página X de Y"
- Botão: ChevronUp para expandir

**Estado Expandido:**
- Navegação anterior/próxima
- Contador de páginas
- Botão ChevronDown para colapsar
- Ações: Duplicar, Deletar, Nova Página
- Miniaturas de todas as páginas

## Atalhos de Teclado

No editor (não em fullscreen), existem atalhos:
- `Cmd/Ctrl + J` - Duplicar layer selecionado
- `Delete/Backspace` - Deletar layer(s) selecionado(s)
- `Ctrl + PageUp` - Página anterior
- `Ctrl + PageDown` - Próxima página

## CSS Classes Importantes

```css
/* Container principal do editor */
.polotno-editor {
  /* Modo normal */
  height: calc(100vh - 4rem);
  overflow: hidden;

  /* Modo fullscreen (via portal) */
  height: 100vh;
  width: 100vw;
}

/* Portal container */
.fixed.inset-0.z-\[9999\] {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9999;
}
```

## Componentes Relacionados

### TemplateEditorShell
- Componente principal que gerencia o estado fullscreen
- Renderiza via Portal quando necessário
- Controla visibilidade de elementos baseado em estado

### EditorCanvas
- Canvas Konva que renderiza o design
- Se adapta à altura disponível (flex-1)
- Mantém toolbars e alignment controls

### PagesBar
- Barra de navegação entre páginas
- Suporta estado colapsado/expandido
- Integrado com sistema de páginas múltiplas

## Boas Práticas

### ✅ DOs

1. **Use React Portal** para fullscreen - evita problemas com hierarquia DOM
2. **Gerencie body.overflow** - previne scroll quando em fullscreen
3. **Use z-index alto** (9999) para garantir que fique acima de tudo
4. **Feche painéis automaticamente** ao entrar em fullscreen
5. **Forneça botão de saída claro** - sempre visível e acessível

### ❌ DON'Ts

1. **Não manipule estilos do DOM manualmente** - use Portal ao invés
2. **Não use position: fixed sem Portal** - será limitado pelo container pai
3. **Não esqueça de restaurar body.overflow** ao sair do fullscreen
4. **Não esconda o botão de saída** - usuário precisa poder sair facilmente

## Troubleshooting

### Problema: Canvas pequeno em fullscreen
**Solução:** Verificar se está usando React Portal (`createPortal`) corretamente

### Problema: Sidebar do layout aparecendo
**Solução:** Portal renderiza fora do layout, então isso não deve acontecer. Verificar se o Portal está sendo renderizado no `document.body`

### Problema: Scroll aparecendo
**Solução:** Verificar se `document.body.style.overflow = 'hidden'` está sendo aplicado

### Problema: Z-index baixo
**Solução:** Usar z-index 9999 ou maior no container do Portal

## Melhorias Futuras

- [ ] Adicionar animação de transição ao entrar/sair do fullscreen
- [ ] Suporte para API Fullscreen nativa do browser (F11)
- [ ] Lembrar estado de collapse da barra de páginas (localStorage)
- [ ] Adicionar atalho de teclado para toggle fullscreen (ex: F ou Ctrl+Shift+F)
- [ ] Modo "Zen" sem nenhuma UI (apenas canvas)

## Referências

- [React Portal Documentation](https://react.dev/reference/react-dom/createPortal)
- [Fullscreen API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- [Konva.js Documentation](https://konvajs.org/)

---

**Última atualização:** 2025-01-08
**Implementado por:** Claude Code
