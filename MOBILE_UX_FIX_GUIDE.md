# Guia de Correções de UX/UI Mobile - Studio Lagosta

Este documento detalha as correções implementadas e as próximas etapas para otimizar a experiência mobile do Studio Lagosta, inspiradas nas melhores práticas do Polotno e Konva.

## ✅ CORREÇÕES IMPLEMENTADAS

### 1. **Hook useMediaQuery** ✅
**Arquivo:** `src/hooks/use-media-query.ts`

Hook criado para detectar dispositivos mobile de forma responsiva:
- `useMediaQuery(query)` - Hook genérico para qualquer media query
- `useIsMobile()` - Detecta mobile (≤768px)
- `useIsTablet()` - Detecta tablet (768px-1024px)
- `useIsDesktop()` - Detecta desktop (>1024px)

**Uso:**
```typescript
import { useIsMobile } from '@/hooks/use-media-query'

function MyComponent() {
  const isMobile = useIsMobile()

  return isMobile ? <MobileLayout /> : <DesktopLayout />
}
```

---

### 2. **Correções Globais CSS** ✅
**Arquivo:** `src/app/globals.css`

**O que foi feito:**
- ✅ Previne overflow horizontal global (`overflow-x: hidden` em html/body)
- ✅ Define `max-width: 100vw` para evitar conteúdo ultrapassar viewport
- ✅ Garante `box-sizing: border-box` universal
- ✅ Imagens responsivas automáticas (`max-width: 100%`)
- ✅ Botões touch-friendly em mobile (mínimo 44x44px)
- ✅ Classes utilitárias `.scrollbar-hide` para scroll horizontal sem scrollbar visível
- ✅ Classe `.scroll-smooth` para scroll suave com `-webkit-overflow-scrolling: touch`

---

### 3. **Tabs Responsivas** ✅
**Arquivo:** `src/components/ui/tabs.tsx`

**O que foi feito:**
- ✅ Scroll horizontal suave em mobile
- ✅ Scrollbar oculta para melhor estética
- ✅ Mantém comportamento centralizado em desktop

**Comportamento:**
- Mobile: Tabs scrollam horizontalmente sem scrollbar visível
- Desktop: Layout fixo centralizado

---

### 4. **Página de Projeto** ✅
**Arquivo:** `src/app/(protected)/projects/[id]/page.tsx`

**Correções aplicadas:**
- ✅ Container com `max-w-full overflow-x-hidden`
- ✅ Padding responsivo (p-4 mobile, p-8 desktop)
- ✅ Títulos com `break-words` para evitar overflow de texto
- ✅ Cards de templates com botões sempre visíveis em mobile
- ✅ Botões maiores em mobile (h-11 w-11) para touch-friendly
- ✅ Overlay sempre visível em mobile, hover em desktop

**Antes:**
```tsx
// Botões apenas em hover - problemático em mobile
<div className="opacity-0 group-hover:opacity-100">
```

**Depois:**
```tsx
// Sempre visível em mobile, hover em desktop
<div className="opacity-100 md:opacity-0 md:group-hover:opacity-100">
```

---

### 5. **Galeria de Criativos** ✅
**Arquivo:** `src/components/projects/creatives-gallery.tsx`

**Correções aplicadas:**
- ✅ Layout em coluna em mobile, linha em desktop
- ✅ Filtros empilhados verticalmente em mobile
- ✅ Botões com labels adaptados (ícone + texto em desktop, apenas ícone em mobile)
- ✅ Largura total em mobile, largura fixa em desktop
- ✅ Overflow controlado com `max-w-full overflow-hidden`

**Estrutura responsiva:**
```tsx
<Card className="flex flex-col gap-4">
  {/* Filtros superiores */}
  <div className="flex flex-col sm:flex-row gap-3">
    <Input className="w-full sm:max-w-sm" />
    <Select className="w-full sm:w-[160px]" />
  </div>

  {/* Controles inferiores */}
  <div className="flex flex-col sm:flex-row">
    <Button className="flex-1 sm:flex-none">
      <Icon className="sm:mr-2" />
      <span className="hidden sm:inline">Desktop Text</span>
      <span className="sm:hidden">Mobile</span>
    </Button>
  </div>
</Card>
```

---

## 🚀 PRÓXIMAS IMPLEMENTAÇÕES NECESSÁRIAS

### 6. **Mobile Tools Drawer para Editor** 🔄
**Objetivo:** Transformar a sidebar vertical em um drawer que desliza de baixo para cima

**Arquivo a criar:** `src/components/templates/mobile-tools-drawer.tsx`

**Requisitos:**
- Drawer que abre de baixo para cima (similar ao Material-UI Bottom Sheet)
- Estados: fechado, minimizado (ícones apenas), expandido (conteúdo completo)
- Suporte a swipe gestures para abrir/fechar
- Backdrop opcional quando aberto
- Transições suaves (300ms)

**Estrutura proposta:**
```tsx
'use client'

import * as React from 'react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface MobileToolsDrawerProps {
  trigger: React.ReactNode
  title: string
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileToolsDrawer({
  trigger,
  title,
  children,
  open,
  onOpenChange,
}: MobileToolsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-2xl"
      >
        {/* Drag indicator */}
        <div className="mx-auto w-12 h-1.5 bg-muted rounded-full mb-4" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
        </div>

        <div className="overflow-y-auto h-[calc(85vh-5rem)]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

---

### 7. **Adaptar TemplateEditorShell para Mobile** 🔄
**Arquivo:** `src/components/templates/template-editor-shell.tsx`

**Mudanças necessárias:**

1. **Detectar mobile com hook:**
```tsx
import { useIsMobile } from '@/hooks/use-media-query'

function TemplateEditorContent() {
  const isMobile = useIsMobile()
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false)
  const [activePanel, setActivePanel] = React.useState<SidePanel>(null)
```

2. **Layout condicional:**
```tsx
return isMobile ? (
  <MobileEditorLayout />
) : (
  <DesktopEditorLayout />
)
```

3. **Mobile Editor Layout:**
```tsx
function MobileEditorLayout() {
  return (
    <div className="flex flex-col h-screen">
      {/* Top bar compacto */}
      <header className="h-14 flex items-center justify-between px-4">
        <Button size="sm" onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Salvar
        </Button>
      </header>

      {/* Canvas - ocupa espaço restante */}
      <main className="flex-1 relative overflow-hidden">
        <EditorCanvas />

        {/* Floating zoom controls */}
        <div className="absolute bottom-20 right-4">
          <ZoomControls zoom={zoom} onZoomChange={setZoom} />
        </div>
      </main>

      {/* Bottom toolbar - ícones das ferramentas */}
      <div className="h-16 border-t bg-card flex items-center justify-around px-2">
        <ToolButton icon={<Layers2 />} onClick={() => openDrawer('layers')} />
        <ToolButton icon={<Type />} onClick={() => openDrawer('text')} />
        <ToolButton icon={<ImageIcon />} onClick={() => openDrawer('images')} />
        {/* ... mais ferramentas */}
      </div>

      {/* Pages carousel - sempre visível */}
      <div className="h-24 border-t bg-card overflow-x-auto">
        <PagesCarousel />
      </div>

      {/* Drawer com conteúdo da ferramenta selecionada */}
      <MobileToolsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={getPanelTitle(activePanel)}
      >
        {renderPanelContent(activePanel)}
      </MobileToolsDrawer>
    </div>
  )
}
```

---

### 8. **Suporte Touch no Canvas Konva** 🔄
**Arquivo:** `src/components/templates/konva-editor-stage.tsx`

**Funcionalidades a implementar:**

#### A. Pinch to Zoom
```tsx
const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
  const touch1 = e.evt.touches[0]
  const touch2 = e.evt.touches[1]

  if (touch1 && touch2) {
    e.evt.preventDefault()

    const stage = e.target.getStage()
    if (!stage) return

    // Calcular distância entre os dois dedos
    const p1 = { x: touch1.clientX, y: touch1.clientY }
    const p2 = { x: touch2.clientX, y: touch2.clientY }

    const newDist = getDistance(p1, p2)

    if (lastDist === 0) {
      setLastDist(newDist)
    }

    // Calcular ponto central entre os dedos
    const center = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    }

    // Calcular nova escala
    const pointTo = {
      x: (center.x - stage.x()) / stage.scaleX(),
      y: (center.y - stage.y()) / stage.scaleY(),
    }

    const scale = stage.scaleX() * (newDist / lastDist)
    const newScale = Math.max(0.1, Math.min(5, scale)) // Limitar entre 0.1x e 5x

    stage.scale({ x: newScale, y: newScale })

    // Ajustar posição para manter ponto central fixo
    const newPos = {
      x: center.x - pointTo.x * newScale,
      y: center.y - pointTo.y * newScale,
    }
    stage.position(newPos)
    stage.batchDraw()

    setLastDist(newDist)
  }
}

function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
}
```

#### B. Pan com um dedo (quando nada selecionado)
```tsx
<Stage
  draggable={!selectedLayerIds.length} // Só permite pan quando nada selecionado
  onTouchMove={handleTouchMove}
  onTouchEnd={() => setLastDist(0)}
/>
```

#### C. Habilitar eventos durante drag
```tsx
// No início do arquivo
Konva.hitOnDragEnabled = true
```

---

### 9. **Pages Bar Mobile Otimizada** 🔄
**Arquivo:** `src/components/templates/template-editor-shell.tsx` (função PagesBar)

**Otimizações necessárias:**

```tsx
function PagesBar({ isCollapsed, onToggleCollapse }: PagesBarProps) {
  const isMobile = useIsMobile()

  return (
    <div className={cn(
      "flex flex-shrink-0 flex-col border-t border-border/40 bg-card",
      // Mobile: sempre expandido, altura fixa menor
      isMobile ? "h-24" : (isCollapsed ? "h-10" : "h-32")
    )}>
      {isMobile ? (
        <MobilePagesCarousel />
      ) : (
        <DesktopPagesBar />
      )}
    </div>
  )
}

function MobilePagesCarousel() {
  const { pages, currentPageId, setCurrentPageId } = useMultiPage()
  const sortedPages = [...pages].sort((a, b) => a.order - b.order)

  return (
    <div className="flex flex-col h-full">
      {/* Indicador de página atual */}
      <div className="flex items-center justify-center h-10 border-b text-xs text-muted-foreground">
        Página {sortedPages.findIndex(p => p.id === currentPageId) + 1} de {sortedPages.length}
      </div>

      {/* Carousel de thumbnails */}
      <div className="flex-1 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 h-full px-4">
          {sortedPages.map((page, index) => (
            <button
              key={page.id}
              onClick={() => setCurrentPageId(page.id)}
              className={cn(
                "flex-shrink-0 w-16 h-16 rounded border-2 transition-all",
                currentPageId === page.id
                  ? "border-primary scale-110"
                  : "border-border/60"
              )}
            >
              {page.thumbnail ? (
                <Image src={page.thumbnail} alt={page.name} fill />
              ) : (
                <div className="flex items-center justify-center h-full text-xs">
                  {index + 1}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### Página de Projeto
- [x] Container responsivo
- [x] Padding adaptativo
- [x] Títulos com break-words
- [x] Cards de templates com botões visíveis em mobile
- [x] Botões touch-friendly

### Galeria de Criativos
- [x] Filtros em layout vertical mobile
- [x] Botões adaptativos
- [x] Texto responsivo
- [x] Overflow controlado

### Editor de Templates
- [ ] MobileToolsDrawer component
- [ ] Layout condicional mobile/desktop
- [ ] Bottom toolbar com ícones
- [ ] Floating zoom controls
- [ ] Pages carousel mobile
- [ ] Konva pinch-to-zoom
- [ ] Konva pan gesture
- [ ] Touch event handling

---

## 🎯 PRIORIDADES DE IMPLEMENTAÇÃO

1. **Alta Prioridade** ⚠️
   - Mobile Tools Drawer
   - Layout condicional no TemplateEditorShell
   - Konva touch support básico

2. **Média Prioridade** ⚡
   - Pages carousel otimizado
   - Floating controls
   - Gestos avançados

3. **Baixa Prioridade** 💡
   - Animações adicionais
   - Haptic feedback
   - Gestos customizados (3-finger tap, etc.)

---

## 🧪 TESTES NECESSÁRIOS

### Dispositivos alvo:
- iPhone SE (320px)
- iPhone 12/13 (390px)
- iPhone 14 Pro Max (430px)
- Samsung Galaxy S21 (360px)
- iPad (768px)
- iPad Pro (1024px)

### Cenários de teste:
1. ✅ Tabs scrollam horizontalmente sem problemas
2. ✅ Cards de templates aparecem completos
3. ✅ Botões de ação são visíveis e clicáveis
4. ✅ Galeria de criativos não estoura horizontalmente
5. [ ] Editor abre com drawer fechado
6. [ ] Drawer abre suavemente de baixo para cima
7. [ ] Canvas responde a pinch-to-zoom
8. [ ] Canvas permite pan com um dedo
9. [ ] Pages carousel permite navegação suave
10. [ ] Todas as ferramentas são acessíveis no drawer

---

## 📚 REFERÊNCIAS

### Polotno Mobile Strategy
- Drawer de baixo para cima para ferramentas
- Canvas ocupa 100% da tela quando ferramentas fechadas
- Gestos touch nativos (pinch, pan, rotate)
- Bottom toolbar com ícones principais

### Konva Touch Best Practices
- `Konva.hitOnDragEnabled = true`
- Implementar pinch-to-zoom com cálculo de distância
- Pan com `draggable={true}` quando nada selecionado
- Eventos: `touchstart`, `touchmove`, `touchend`

### Material-UI Bottom Sheet
- Altura inicial: 50% da viewport
- Altura máxima: 85% da viewport
- Drag indicator no topo (barra horizontal)
- Backdrop escuro semi-transparente
- Swipe down para fechar

---

## 🔗 ARQUIVOS MODIFICADOS

1. ✅ `src/hooks/use-media-query.ts` - Hook criado
2. ✅ `src/app/globals.css` - Estilos globais
3. ✅ `src/components/ui/tabs.tsx` - Tabs responsivas
4. ✅ `src/app/(protected)/projects/[id]/page.tsx` - Página de projeto
5. ✅ `src/components/projects/creatives-gallery.tsx` - Galeria

### Próximos arquivos a modificar:
6. 🔄 `src/components/templates/mobile-tools-drawer.tsx` - **A CRIAR**
7. 🔄 `src/components/templates/template-editor-shell.tsx` - **A MODIFICAR**
8. 🔄 `src/components/templates/konva-editor-stage.tsx` - **A MODIFICAR**

---

## ⚙️ COMANDOS ÚTEIS

```bash
# Verificar tipos (sem build)
npm run typecheck

# Linter
npm run lint

# Desenvolvimento
npm run dev

# Build de produção
npm run build
```

---

## 📖 RECURSOS ADICIONAIS

- [Konva Touch Events](https://konvajs.org/docs/events/Touch_Events.html)
- [Polotno Demo](https://polotno.com)
- [Material-UI Bottom Sheet](https://mui.com/material-ui/react-drawer/)
- [React Use Gesture](https://use-gesture.netlify.app/)

---

**Última atualização:** 2025-01-23
**Próximo passo:** Implementar MobileToolsDrawer component
