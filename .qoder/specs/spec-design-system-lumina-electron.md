# Studio Lagosta — Spec de Design System Lumina para Electron
**App Desktop — Aplicacao do Design System do Site**

| Campo | Valor |
|---|---|
| Versao alvo | Studio Lagosta v2 |
| Plataforma | Electron (Mac & Windows) |
| Responsavel | Ciro Trigo |
| Prioridade | Alta |
| Fonte | lumina-video/design-system.html |

---

## Indice

1. [Resumo Executivo](#resumo-executivo)
2. [Paleta de Cores](#paleta-de-cores)
3. [Tipografia](#tipografia)
4. [Espacamento e Layout](#espacamento-e-layout)
5. [Componentes Base](#componentes-base)
6. [Efeitos e Animacoes](#efeitos-e-animacoes)
7. [Icones](#icones)
8. [Implementacao Tecnica](#implementacao-tecnica)
9. [Arquivos a Modificar](#arquivos-a-modificar)
10. [Criterios de Aceite](#criterios-de-aceite)

---

## Resumo Executivo

O design system Lumina apresenta uma estetica dark premium com acentos em laranja/amber. Este documento especifica como traduzir essa linguagem visual para o contexto de um app desktop Electron, respeitando as diferencas de uso entre um site de marketing e uma ferramenta de produtividade.

### Principios Fundamentais

1. **Dark-first**: Background principal #050505 com superficies elevadas em tons de cinza escuro
2. **Accent vibrante**: Gradientes orange-500 a amber-500 como cor de destaque
3. **Glass morphism**: Uso sutil de backdrop-blur em paineis sobrepostos
4. **Borders sutis**: Bordas em white/5 e white/10 para separacao sem peso visual
5. **Animacoes contidas**: Transicoes suaves (150-300ms) sem exageros em ferramenta de trabalho

---

## Paleta de Cores

### Backgrounds

| Nome | Valor | Uso | Classe Tailwind |
|------|-------|-----|-----------------|
| Background Base | `#050505` | Fundo principal da aplicacao | `bg-[#050505]` |
| Surface Elevated | `rgba(255,255,255,0.05)` | Paineis, cards, sidebars | `bg-white/5` |
| Surface Hover | `rgba(255,255,255,0.10)` | Estados hover | `bg-white/10` |
| Surface Active | `rgba(255,255,255,0.15)` | Estados pressed/active | `bg-white/15` |
| Canvas Background | `#0a0a0a` | Area do canvas/editor | `bg-[#0a0a0a]` |

### Accent (Orange/Amber)

| Nome | Valor | Uso | Classe Tailwind |
|------|-------|-----|-----------------|
| Primary | `#ea580c` | Botoes primarios, CTAs | `bg-orange-600` |
| Primary Light | `#f97316` | Hover states | `bg-orange-500` |
| Primary Gradient Start | `#fb923c` | Gradientes | `from-orange-400` |
| Primary Gradient End | `#ea580c` | Gradientes | `to-orange-600` |
| Amber Accent | `#fbbf24` | Radial glows | `amber-400` |

### Texto

| Nome | Valor | Uso | Classe Tailwind |
|------|-------|-----|-----------------|
| Text Primary | `#ffffff` | Titulos, texto principal | `text-white` |
| Text Secondary | `rgba(255,255,255,0.60)` | Descricoes, subtitulos | `text-white/60` |
| Text Tertiary | `#a3a3a3` | Labels, metadata | `text-neutral-400` |
| Text Muted | `#737373` | Placeholders | `text-neutral-500` |
| Text Disabled | `rgba(255,255,255,0.30)` | Estados disabled | `text-white/30` |

### Bordas

| Nome | Valor | Uso | Classe Tailwind |
|------|-------|-----|-----------------|
| Border Subtle | `rgba(255,255,255,0.05)` | Separadores sutis | `border-white/5` |
| Border Default | `rgba(255,255,255,0.10)` | Bordas de cards/inputs | `border-white/10` |
| Border Hover | `rgba(255,255,255,0.20)` | Hover em elementos | `border-white/20` |
| Border Focus | `#ea580c` | Focus rings | `border-orange-600` |

### Semanticas

| Nome | Valor | Uso | Classe Tailwind |
|------|-------|-----|-----------------|
| Success | `#22c55e` | Estados de sucesso | `text-green-500` |
| Warning | `#f59e0b` | Alertas | `text-amber-500` |
| Error | `#ef4444` | Erros | `text-red-500` |
| Info | `#3b82f6` | Informacoes | `text-blue-500` |

---

## Tipografia

### Font Family

- **Principal**: Inter (ja configurado)
- **Monospace**: `font-mono` (para valores, codigo)

### Escala Tipografica (Desktop App)

| Nome | Size | Weight | Line Height | Uso |
|------|------|--------|-------------|-----|
| Heading 1 | 24px | 600 | 1.2 | Titulos de secao |
| Heading 2 | 20px | 600 | 1.3 | Subtitulos |
| Heading 3 | 16px | 600 | 1.4 | Titulos de cards |
| Body | 14px | 400 | 1.5 | Texto padrao |
| Body Small | 13px | 400 | 1.5 | Texto secundario |
| Caption | 12px | 500 | 1.4 | Labels, metadata |
| Tiny | 11px | 500 | 1.3 | Badges, indicadores |

### Classes CSS

```css
/* Headings */
.text-h1 { @apply text-2xl font-semibold leading-tight; }
.text-h2 { @apply text-xl font-semibold leading-snug; }
.text-h3 { @apply text-base font-semibold leading-normal; }

/* Body */
.text-body { @apply text-sm font-normal leading-relaxed; }
.text-body-sm { @apply text-[13px] font-normal leading-relaxed; }

/* Labels */
.text-caption { @apply text-xs font-medium leading-normal; }
.text-tiny { @apply text-[11px] font-medium leading-tight; }

/* Uppercase Labels (Lumina style) */
.text-label-upper { @apply text-xs font-bold tracking-widest uppercase; }
```

### Gradient Text

```css
.text-gradient-primary {
  @apply text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-500;
}

.text-gradient-accent {
  @apply text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400;
}
```

---

## Espacamento e Layout

### Spacing Scale

Usar escala padrao do Tailwind com ajustes para densidade de app desktop:

| Token | Valor | Uso |
|-------|-------|-----|
| `gap-1` | 4px | Entre icones inline |
| `gap-2` | 8px | Entre elementos relacionados |
| `gap-3` | 12px | Espacamento padrao |
| `gap-4` | 16px | Entre grupos |
| `gap-6` | 24px | Entre secoes |

### Padding Padrao

| Componente | Padding | Classe |
|------------|---------|--------|
| Buttons SM | 6px 12px | `px-3 py-1.5` |
| Buttons MD | 8px 16px | `px-4 py-2` |
| Cards | 12px | `p-3` |
| Panels | 16px | `p-4` |
| Sidebar | 12px | `p-3` |

### Border Radius

| Nome | Valor | Uso | Classe |
|------|-------|-----|--------|
| None | 0 | - | `rounded-none` |
| Small | 4px | Inputs, badges | `rounded` |
| Default | 6px | Cards, buttons | `rounded-md` |
| Medium | 8px | Paineis | `rounded-lg` |
| Large | 12px | Modais | `rounded-xl` |
| Full | 9999px | Pills, avatars | `rounded-full` |

---

## Componentes Base

### 1. Botoes

#### Primary Button (CTA com gradiente)

```tsx
// Versao simplificada do button-custom do Lumina
const PrimaryButton = ({ children }) => (
  <button className="
    relative inline-flex items-center justify-center
    px-4 py-2 rounded-full
    bg-gradient-to-b from-orange-500 to-orange-600
    text-white text-sm font-medium
    shadow-lg shadow-orange-500/25
    hover:shadow-orange-500/40 hover:scale-[1.02]
    active:scale-[0.98]
    transition-all duration-200
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]
  ">
    {children}
  </button>
)
```

#### Secondary Button (Ghost)

```tsx
const SecondaryButton = ({ children }) => (
  <button className="
    inline-flex items-center justify-center
    px-4 py-2 rounded-md
    bg-white/5 hover:bg-white/10 active:bg-white/15
    text-white/80 hover:text-white text-sm font-medium
    border border-white/10 hover:border-white/20
    transition-all duration-200
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500
  ">
    {children}
  </button>
)
```

#### Icon Button

```tsx
const IconButton = ({ icon: Icon, size = 'md' }) => {
  const sizes = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }

  return (
    <button className={`
      ${sizes[size]}
      inline-flex items-center justify-center rounded-md
      text-neutral-400 hover:text-white
      hover:bg-white/10 active:bg-white/15
      transition-colors duration-150
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500
    `}>
      <Icon className="w-4 h-4" />
    </button>
  )
}
```

### 2. Cards

#### Surface Card (Paineis elevados)

```tsx
const SurfaceCard = ({ children, className }) => (
  <div className={`
    bg-white/5 backdrop-blur-sm
    border border-white/10 rounded-lg
    ${className}
  `}>
    {children}
  </div>
)
```

#### Glass Card (Overlays, modais)

```tsx
const GlassCard = ({ children }) => (
  <div className="
    bg-neutral-950/90 backdrop-blur-xl
    border border-white/10 rounded-xl
    shadow-2xl
  ">
    {children}
  </div>
)
```

### 3. Inputs

#### Text Input

```tsx
const Input = ({ ...props }) => (
  <input
    className="
      w-full px-3 py-2 rounded-md
      bg-white/5 hover:bg-white/[0.07] focus:bg-white/10
      border border-white/10 focus:border-orange-500/50
      text-white text-sm placeholder:text-neutral-500
      outline-none transition-all duration-150
      focus:ring-1 focus:ring-orange-500/30
    "
    {...props}
  />
)
```

#### Select

```tsx
const Select = ({ children, ...props }) => (
  <select
    className="
      w-full px-3 py-2 rounded-md
      bg-white/5 hover:bg-white/[0.07]
      border border-white/10 focus:border-orange-500/50
      text-white text-sm
      outline-none transition-all duration-150
      focus:ring-1 focus:ring-orange-500/30
      cursor-pointer appearance-none
      bg-[url('data:image/svg+xml,...')] bg-no-repeat bg-right
    "
    {...props}
  >
    {children}
  </select>
)
```

### 4. Layer Item (Painel de Camadas)

```tsx
const LayerItem = ({ layer, isSelected, isHovered }) => (
  <div className={`
    flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
    transition-all duration-150
    ${isSelected
      ? 'bg-orange-500/20 border border-orange-500/30'
      : isHovered
        ? 'bg-white/10'
        : 'bg-white/5 border border-transparent hover:bg-white/10'
    }
  `}>
    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
      <LayerIcon type={layer.type} />
    </div>
    <span className={`text-sm flex-1 truncate ${isSelected ? 'text-white' : 'text-white/70'}`}>
      {layer.name}
    </span>
    <div className="flex items-center gap-1">
      <IconButton icon={layer.visible ? Eye : EyeOff} size="sm" />
      <IconButton icon={layer.locked ? Lock : Unlock} size="sm" />
    </div>
  </div>
)
```

### 5. Step Indicator (Lumina style)

```tsx
const StepIndicator = ({ number, label, isActive, icon: Icon }) => (
  <div className={`
    flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
    transition-all duration-200
    ${isActive
      ? 'bg-white/5 translate-x-[-4px]'
      : 'hover:bg-white/5'
    }
  `}
  style={isActive ? {
    '--border-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0))',
    '--border-radius-before': '8px',
  } : undefined}
  >
    <div className={`
      w-6 h-6 rounded-full flex items-center justify-center
      text-[10px] font-bold transition-colors duration-200
      ${isActive
        ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20'
        : 'text-neutral-500 group-hover:text-orange-400'
      }
    `}>
      {number.toString().padStart(2, '0')}
    </div>
    <span className={`text-sm font-medium transition-colors duration-200 ${isActive ? 'text-white' : 'text-neutral-400'}`}>
      {label}
    </span>
    <Icon className={`
      w-3 h-3 ml-auto transition-all duration-200
      ${isActive ? 'text-orange-500 opacity-100' : 'text-neutral-600 opacity-0 group-hover:opacity-100'}
    `} />
  </div>
)
```

### 6. Badge/Chip

```tsx
const Badge = ({ variant = 'default', children }) => {
  const variants = {
    default: 'bg-white/10 text-white/70',
    accent: 'bg-orange-500 text-black',
    success: 'bg-green-500/20 text-green-400 border border-green-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  }

  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase
      ${variants[variant]}
    `}>
      {children}
    </span>
  )
}
```

---

## Efeitos e Animacoes

### 1. Glow Effect (para elementos de destaque)

```css
.glow-orange {
  box-shadow: 0 0 20px rgba(234, 88, 12, 0.3);
}

.glow-orange-hover:hover {
  box-shadow: 0 0 30px rgba(234, 88, 12, 0.4);
}

.glow-orange-intense {
  box-shadow:
    0 0 25px rgba(249, 115, 22, 0.3),
    0 8px 40px rgba(249, 115, 22, 0.15);
}
```

### 2. Border Gradient (estilo Lumina)

```css
/* Aplicar via CSS custom properties */
[data-border-gradient]::before {
  content: "";
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
  pointer-events: none;
}
```

### 3. Transicoes Padrao

```css
/* Transicao rapida (hover states) */
.transition-fast { transition: all 150ms ease; }

/* Transicao padrao (modais, paineis) */
.transition-default { transition: all 200ms ease; }

/* Transicao suave (animacoes maiores) */
.transition-smooth { transition: all 300ms cubic-bezier(0.2, 0.8, 0.2, 1); }
```

### 4. Animacoes

```css
/* Fade Slide In (entrada de elementos) */
@keyframes fadeSlideIn {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

.animate-fade-slide-in {
  animation: fadeSlideIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

/* Pulse para indicadores */
@keyframes pulse-accent {
  0%, 100% { box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(234, 88, 12, 0); }
}

.animate-pulse-accent {
  animation: pulse-accent 2s infinite;
}

/* Spin para loading */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
```

### 5. Falling Beams (Efeito de Luz Descendo)

Efeito decorativo de linhas de luz laranja que descem nas bordas/divisoes. Ideal para usar nas bordas de paineis e divisoes do menu.

#### CSS

```css
/* Falling Beam Animation */
@keyframes beam-fall {
  0% {
    transform: translateY(-100%);
    opacity: 0;
  }
  10% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  90% {
    opacity: 0.6;
  }
  100% {
    transform: translateY(100vh);
    opacity: 0;
  }
}

/* Variantes com diferentes durações para parecer aleatorio */
.animate-beam-1 {
  animation: beam-fall 8s linear infinite;
  animation-delay: 0s;
}

.animate-beam-2 {
  animation: beam-fall 12s linear infinite;
  animation-delay: 3s;
}

.animate-beam-3 {
  animation: beam-fall 10s linear infinite;
  animation-delay: 6s;
}

/* Beam element base */
.beam {
  position: absolute;
  width: 1px;
  height: 80px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(249, 115, 22, 0.6),
    transparent
  );
  pointer-events: none;
}

/* Beam mais intenso */
.beam-intense {
  height: 120px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(249, 115, 22, 0.8),
    rgba(251, 191, 36, 0.4),
    transparent
  );
}
```

#### Componente React - Divider com Beam

```tsx
interface BeamDividerProps {
  orientation?: 'vertical' | 'horizontal'
  showBeam?: boolean
  beamVariant?: 1 | 2 | 3
  className?: string
}

const BeamDivider = ({
  orientation = 'vertical',
  showBeam = true,
  beamVariant = 1,
  className = ''
}: BeamDividerProps) => {
  const isVertical = orientation === 'vertical'

  return (
    <div
      className={`
        relative
        ${isVertical ? 'w-px h-full' : 'h-px w-full'}
        bg-white/5
        ${className}
      `}
    >
      {showBeam && isVertical && (
        <div
          className={`
            beam animate-beam-${beamVariant}
            top-0 left-0
          `}
        />
      )}
    </div>
  )
}
```

#### Uso em Divisoes de Painel

```tsx
// Exemplo: Sidebar com beam na borda direita
const Sidebar = ({ children }) => (
  <aside className="relative w-64 h-full bg-white/5 border-r border-white/5">
    {children}

    {/* Beam decorativo na borda direita */}
    <div className="absolute top-0 right-0 w-px h-full overflow-hidden">
      <div className="beam animate-beam-1" />
      <div className="beam animate-beam-2" style={{ left: 0 }} />
    </div>
  </aside>
)

// Exemplo: Divisao entre toolbar e canvas
const EditorLayout = () => (
  <div className="flex h-full">
    <Toolbar />

    {/* Divider com beam */}
    <div className="relative w-px bg-white/5 overflow-hidden">
      <div className="beam beam-intense animate-beam-1" />
    </div>

    <Canvas />

    {/* Divider com beam */}
    <div className="relative w-px bg-white/5 overflow-hidden">
      <div className="beam animate-beam-2" />
    </div>

    <PropertiesPanel />
  </div>
)
```

#### Componente Completo - Panel Divider

```tsx
import { memo, useMemo } from 'react'

interface PanelDividerProps {
  beamCount?: number
  className?: string
}

export const PanelDivider = memo(({ beamCount = 2, className = '' }: PanelDividerProps) => {
  // Gerar beams com delays aleatorios
  const beams = useMemo(() =>
    Array.from({ length: beamCount }, (_, i) => ({
      id: i,
      delay: i * 4, // 4s entre cada beam
      duration: 8 + (i * 2), // Duracoes variadas
      intense: i === 0, // Primeiro beam mais intenso
    })),
    [beamCount]
  )

  return (
    <div className={`relative w-px h-full bg-white/5 overflow-hidden ${className}`}>
      {beams.map((beam) => (
        <div
          key={beam.id}
          className={`
            absolute top-0 left-0 w-px pointer-events-none
            ${beam.intense ? 'h-32' : 'h-20'}
          `}
          style={{
            background: beam.intense
              ? 'linear-gradient(to bottom, transparent, rgba(249,115,22,0.8), rgba(251,191,36,0.4), transparent)'
              : 'linear-gradient(to bottom, transparent, rgba(249,115,22,0.5), transparent)',
            animation: `beam-fall ${beam.duration}s linear infinite`,
            animationDelay: `${beam.delay}s`,
          }}
        />
      ))}
    </div>
  )
})

PanelDivider.displayName = 'PanelDivider'
```

#### Configuracao de Performance

```tsx
// Usar apenas em divisoes principais (max 2-3 por tela)
// Desativar se usuario prefere reduced-motion

const PanelDividerSafe = (props: PanelDividerProps) => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) {
    return <div className="w-px h-full bg-white/5" />
  }

  return <PanelDivider {...props} />
}
```

---

## Icones

### Biblioteca

Usar **Lucide React** (ja presente no Lumina design system).

```bash
npm install lucide-react
```

### Tamanhos Padrao

| Contexto | Tamanho | Classe |
|----------|---------|--------|
| Inline (texto) | 14px | `w-3.5 h-3.5` |
| Botoes SM | 16px | `w-4 h-4` |
| Botoes MD | 18px | `w-[18px] h-[18px]` |
| Destaque | 20px | `w-5 h-5` |
| Feature | 24px | `w-6 h-6` |

### Estilo

```tsx
// Icone padrao
<Icon className="w-4 h-4 text-neutral-400" strokeWidth={1.5} />

// Icone em botao
<Icon className="w-4 h-4" strokeWidth={2} />

// Icone de destaque
<Icon className="w-5 h-5 text-orange-500" strokeWidth={1.5} />
```

---

## Implementacao Tecnica

### 1. Atualizacao do globals.css

Substituir o conteudo atual por estilos alinhados com o design system Lumina:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ===================== */
/* LUMINA DESIGN SYSTEM  */
/* ===================== */

/* Base Reset */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  background-color: #050505;
  color: #fafafa;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* macOS Title Bar */
.titlebar-drag { -webkit-app-region: drag; }
.titlebar-no-drag { -webkit-app-region: no-drag; }

/* Scrollbar - Minimal */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Focus Ring - Orange Accent */
*:focus-visible {
  outline: 2px solid #ea580c;
  outline-offset: 2px;
}

/* Selection */
::selection {
  background: rgba(234, 88, 12, 0.3);
  color: #fafafa;
}

/* ===================== */
/* TYPOGRAPHY UTILITIES  */
/* ===================== */

@layer utilities {
  .text-h1 { @apply text-2xl font-semibold leading-tight; }
  .text-h2 { @apply text-xl font-semibold leading-snug; }
  .text-h3 { @apply text-base font-semibold leading-normal; }
  .text-body { @apply text-sm font-normal leading-relaxed; }
  .text-body-sm { @apply text-[13px] font-normal leading-relaxed; }
  .text-caption { @apply text-xs font-medium leading-normal; }
  .text-tiny { @apply text-[11px] font-medium leading-tight; }
  .text-label-upper { @apply text-xs font-bold tracking-widest uppercase; }
}

/* Gradient Text */
.text-gradient-primary {
  background: linear-gradient(to right, #ffffff, #e5e5e5, #a3a3a3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.text-gradient-accent {
  background: linear-gradient(to right, #fb923c, #fbbf24);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ===================== */
/* EFFECTS               */
/* ===================== */

/* Glass Effect */
.glass {
  background: rgba(23, 23, 23, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.glass-subtle {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Glow Effects */
.glow-orange {
  box-shadow: 0 0 20px rgba(234, 88, 12, 0.3);
}

.glow-orange-intense {
  box-shadow:
    0 0 25px rgba(249, 115, 22, 0.3),
    0 8px 40px rgba(249, 115, 22, 0.15);
}

/* Border Gradient */
[data-border-gradient]::before {
  content: "";
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
  pointer-events: none;
}

/* ===================== */
/* ANIMATIONS            */
/* ===================== */

@keyframes fadeSlideIn {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes pulse-accent {
  0%, 100% { box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(234, 88, 12, 0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-fade-slide-in {
  animation: fadeSlideIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.animate-pulse-accent {
  animation: pulse-accent 2s infinite;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* ===================== */
/* FALLING BEAMS         */
/* ===================== */

@keyframes beam-fall {
  0% {
    transform: translateY(-100%);
    opacity: 0;
  }
  10% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  90% {
    opacity: 0.6;
  }
  100% {
    transform: translateY(100vh);
    opacity: 0;
  }
}

.animate-beam-1 {
  animation: beam-fall 8s linear infinite;
}

.animate-beam-2 {
  animation: beam-fall 12s linear infinite;
  animation-delay: 3s;
}

.animate-beam-3 {
  animation: beam-fall 10s linear infinite;
  animation-delay: 6s;
}

.beam {
  position: absolute;
  width: 1px;
  height: 80px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(249, 115, 22, 0.6),
    transparent
  );
  pointer-events: none;
}

.beam-intense {
  height: 120px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(249, 115, 22, 0.8),
    rgba(251, 191, 36, 0.4),
    transparent
  );
}

/* Respeitar preferência de movimento reduzido */
@media (prefers-reduced-motion: reduce) {
  .beam,
  .beam-intense {
    animation: none;
    opacity: 0;
  }
}

/* Transition Utilities */
.transition-fast { transition: all 150ms ease; }
.transition-default { transition: all 200ms ease; }
.transition-smooth { transition: all 300ms cubic-bezier(0.2, 0.8, 0.2, 1); }

/* ===================== */
/* COMPONENT PATTERNS    */
/* ===================== */

/* Surface Card */
.surface-card {
  @apply bg-white/5 border border-white/10 rounded-lg;
}

.surface-card-hover {
  @apply surface-card hover:bg-white/10 hover:border-white/20 transition-all duration-150;
}

/* Drop Zone */
.drop-zone-active {
  border-color: #ea580c !important;
  background-color: rgba(234, 88, 12, 0.1) !important;
}
```

### 2. Configuracao Tailwind (tailwind.config.js)

Adicionar cores customizadas se necessario:

```javascript
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'lumina-bg': '#050505',
        'lumina-surface': 'rgba(255,255,255,0.05)',
        'lumina-accent': '#ea580c',
      },
      boxShadow: {
        'glow-orange': '0 0 20px rgba(234, 88, 12, 0.3)',
        'glow-orange-lg': '0 0 30px rgba(234, 88, 12, 0.4), 0 8px 40px rgba(234, 88, 12, 0.15)',
      },
    },
  },
  plugins: [],
}
```

---

## Arquivos a Modificar

### Prioridade Alta

| Arquivo | Descricao | Mudancas |
|---------|-----------|----------|
| `globals.css` | Estilos globais | Substituir por versao Lumina |
| `tailwind.config.js` | Config Tailwind | Adicionar cores/shadows |
| `components/editor/EditorShell.tsx` | Shell do editor | Aplicar bg-[#050505], bordas |
| `components/editor/LayersPanel.tsx` | Painel de camadas | Refatorar items com novo estilo |
| `components/editor/Toolbar.tsx` | Barra de ferramentas | Novos botoes/icones |

### Prioridade Media

| Arquivo | Descricao | Mudancas |
|---------|-----------|----------|
| `components/ui/Button.tsx` | Componente Button | Criar variantes Primary/Secondary/Ghost |
| `components/ui/Input.tsx` | Componente Input | Estilizar com design system |
| `components/ui/Card.tsx` | Componente Card | SurfaceCard/GlassCard |
| `components/ui/PanelDivider.tsx` | **NOVO** Divisor com beam | Efeito de luz descendo |
| `components/editor/PropertiesPanel.tsx` | Painel propriedades | Aplicar espacamentos e cores |

### Prioridade Baixa

| Arquivo | Descricao | Mudancas |
|---------|-----------|----------|
| Todos componentes de modal | Modais | GlassCard + backdrop-blur |
| Context menus | Menus contextuais | Surface + border-white/10 |
| Tooltips | Dicas | Mesmo estilo de surface |

---

## Criterios de Aceite

### Visual

- [ ] Background principal usa #050505
- [ ] Paineis laterais usam bg-white/5 com border-white/10
- [ ] Accent color e consistentemente orange-500/600
- [ ] Texto segue hierarquia definida (white, white/60, neutral-400)
- [ ] Bordas sao sutis (white/5 ou white/10)
- [ ] Focus rings sao orange-500

### Interacao

- [ ] Hover states mudam opacidade de background (+5%)
- [ ] Transicoes sao suaves (150-200ms)
- [ ] Botoes primarios tem glow sutil no hover
- [ ] Elementos selecionados tem destaque laranja

### Consistencia

- [ ] Todos os botoes seguem variantes definidas
- [ ] Inputs tem estilo uniforme
- [ ] Espacamentos seguem escala Tailwind
- [ ] Icones sao Lucide com tamanhos padronizados

### Efeitos Decorativos

- [ ] Falling beams aplicados nas divisoes principais (sidebar | canvas | properties)
- [ ] Beams tem animacao suave (8-12s por ciclo)
- [ ] Beams respeitam prefers-reduced-motion
- [ ] Maximo de 2-3 beams visiveis simultaneamente

### Performance

- [ ] Backdrop-blur usado com moderacao (apenas overlays)
- [ ] Animacoes respeitam prefers-reduced-motion
- [ ] Nenhum layout shift durante transicoes

---

## Referencias

- **Fonte**: `/lumina-video/design-system.html`
- **Site Lumina**: `/lumina-video/index.html`
- **Fonts**: Inter (Google Fonts)
- **Icons**: Lucide React

---

## Notas de Implementacao

### O que NAO aplicar do site

1. **Animacoes de scroll** - nao relevante para app desktop
2. **Particle effects em botoes** - distracao em ambiente de trabalho
3. **Rotacoes 3D** - reservar para marketing
4. **Aura backgrounds (unicorn studio)** - muito pesado para performance
5. **Grid de colunas com numeros** - elemento de landing page

### O que APLICAR com moderacao

1. **Falling beams** - usar apenas nas divisoes principais de paineis (2-3 max)
2. **Glow effects** - apenas em elementos de destaque (botao primario, elemento selecionado)
3. **Backdrop blur** - apenas em overlays e modais

### Adaptacoes para Desktop

1. **Densidade maior** - paddings menores que no site
2. **Tipografia menor** - headings de 24px max vs 96px do site
3. **Animacoes contidas** - duracao maxima 300ms
4. **Focus states** - essenciais para acessibilidade
5. **Keyboard navigation** - todos elementos interativos devem ser acessiveis
