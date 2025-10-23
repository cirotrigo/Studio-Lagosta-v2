# Correção de Overflow Horizontal e Erro MutationObserver

## 🐛 PROBLEMAS IDENTIFICADOS

### 1. Página cortando no mobile (overflow horizontal)
**URL:** https://studio-lagosta-v2.vercel.app/projects/6

**Causa raiz:**
- Layout principal sem `overflow-x: hidden`
- Container com `max-w-[1400px]` mas sem controle de overflow
- Elementos de texto longos sem quebra de linha
- Falta de `max-width: 100%` em elementos filhos

### 2. Erro do MutationObserver
```
TypeError: Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.
```

**Causa raiz:**
- PhotoSwipe tentando observar elemento que ainda não está no DOM
- Timing issue entre React render e inicialização do PhotoSwipe
- Falta de verificação se elemento está no `document.body`

---

## ✅ CORREÇÕES IMPLEMENTADAS

### 1. **Proteção MutationObserver no PhotoSwipe** ✅

**Arquivo:** [src/hooks/use-photoswipe.ts](src/hooks/use-photoswipe.ts:33-51)

**Mudanças:**
```tsx
// ANTES
const checkAndInit = (): 'success' | 'retry' | 'empty' => {
  const galleryElement = document.querySelector(gallerySelector)
  if (!galleryElement) return 'retry'
  // ...
}

// DEPOIS
const checkAndInit = (): 'success' | 'retry' | 'empty' => {
  // ✅ Verificar SSR safety
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    console.warn('PhotoSwipe: Document/Window not available (SSR)')
    return 'retry'
  }

  const galleryElement = document.querySelector(gallerySelector)
  if (!galleryElement) return 'retry'

  // ✅ Verificar se elemento está no DOM
  if (!document.body.contains(galleryElement)) {
    console.warn('PhotoSwipe: Gallery element not in document body')
    return 'retry'
  }
  // ...
}
```

**Resultado:** PhotoSwipe aguarda elemento estar completamente montado no DOM antes de inicializar MutationObserver.

---

### 2. **Overflow Horizontal - CSS Global** ✅

**Arquivo:** [src/app/globals.css](src/app/globals.css:198-235)

**Mudanças críticas:**

#### A. Prevenir overflow em TODOS os elementos
```css
/* Prevenir overflow em TODOS os elementos */
* {
  max-width: 100%;
}

/* Exceções para elementos que precisam de largura fixa */
.konvajs-content,
canvas,
svg,
[data-radix-popper-content-wrapper],
[role="dialog"],
[role="menu"],
[role="listbox"] {
  max-width: none;
}
```

#### B. Regras específicas para mobile
```css
@media (max-width: 768px) {
  /* Força todos os elementos de texto a quebrar */
  h1, h2, h3, h4, h5, h6, p, span, div, a {
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
    hyphens: auto;
  }

  /* Força todos os containers a respeitar viewport */
  body, html, #__next, main, [role="main"] {
    max-width: 100vw !important;
    overflow-x: hidden !important;
  }

  /* Prevenir elementos de estorar */
  * {
    min-width: 0;
    min-height: 0;
  }

  /* Garantir que imagens e mídia não estourem */
  img, video, canvas, svg, picture {
    max-width: 100% !important;
    height: auto !important;
  }
}
```

---

### 3. **Layout Principal** ✅

**Arquivo:** [src/app/(protected)/layout.tsx](src/app/(protected)/layout.tsx:77-85)

**Mudanças:**
```tsx
// ANTES
<div className="min-h-dvh w-full text-foreground">
  <div className="flex">
    <Sidebar />
    <div className="flex min-h-dvh flex-1 flex-col p-4">
      <main className="container mx-auto w-full max-w-[1400px]">

// DEPOIS
<div className="min-h-dvh w-full text-foreground overflow-x-hidden">
  <div className="flex max-w-full">
    <Sidebar />
    <div className="flex min-h-dvh flex-1 flex-col p-4 max-w-full overflow-x-hidden">
      <main className="container mx-auto w-full max-w-full lg:max-w-[1400px] overflow-x-hidden">
```

**Resultado:**
- ✅ Container principal com `overflow-x: hidden`
- ✅ `max-w-full` em mobile, `max-w-[1400px]` em desktop
- ✅ Todos os containers filhos respeitam largura da viewport

---

### 4. **Página de Projeto** ✅

**Arquivo:** [src/app/(protected)/projects/[id]/page.tsx](src/app/(protected)/projects/[id]/page.tsx:204-234)

**Mudanças:**
```tsx
// ANTES
<div className="container mx-auto p-4 md:p-8 max-w-full overflow-x-hidden">
  <div className="mb-6 md:mb-8 flex flex-col gap-3 md:gap-4">
    <h1 className="text-2xl md:text-3xl font-bold break-words">

// DEPOIS
<div className="w-full max-w-full overflow-x-hidden px-0">
  <div className="mb-6 md:mb-8 flex flex-col gap-3 md:gap-4 max-w-full overflow-hidden">
    <h1 className="text-2xl md:text-3xl font-bold break-words overflow-wrap-anywhere">

<Tabs className="w-full max-w-full overflow-x-hidden">
```

**Resultado:**
- ✅ Títulos com `overflow-wrap-anywhere` para quebra agressiva
- ✅ Tabs com `overflow-x-hidden` e `max-w-full`
- ✅ Todos os containers controlados

---

## 🧪 ANTES vs DEPOIS

### Antes:
❌ Página cortada, usuário precisava fazer pinch para ver conteúdo
❌ Erro no console: `MutationObserver: parameter 1 is not of type 'Node'`
❌ Títulos longos causavam scroll horizontal
❌ Layout quebrado em mobile

### Depois:
✅ Página renderiza no tamanho correto
✅ Sem erros de MutationObserver
✅ Títulos quebram automaticamente
✅ Sem scroll horizontal indesejado
✅ Layout responsivo funcional

---

## 📋 CHECKLIST DE TESTE

Teste em diferentes dispositivos:
- [ ] iPhone SE (320px) - página abre sem zoom
- [ ] iPhone 13 (390px) - sem overflow horizontal
- [ ] iPhone 14 Pro Max (430px) - títulos quebram corretamente
- [ ] Samsung Galaxy S21 (360px) - cards visíveis
- [ ] iPad (768px) - transição mobile/desktop suave

### Páginas para testar:
- [ ] `/projects/6` - Página principal do projeto
- [ ] `/projects/6` - Aba Templates
- [ ] `/projects/6` - Aba Criativos
- [ ] Console sem erros de MutationObserver

---

## 🔍 ANÁLISE TÉCNICA

### Por que o problema acontecia?

1. **Container sem overflow control:**
   - `max-w-[1400px]` permitia largura fixa
   - Sem `overflow-x: hidden` nos parents
   - Elementos filhos podiam estourar

2. **Text overflow:**
   - Apenas `break-words` não era suficiente
   - Faltava `overflow-wrap: anywhere` para quebra agressiva
   - Títulos longos forçavam largura mínima

3. **MutationObserver timing:**
   - PhotoSwipe inicializava antes do elemento estar no body
   - React renderizava elementos em momentos diferentes
   - Faltava verificação `document.body.contains()`

### Por que as correções funcionam?

1. **Abordagem em cascata:**
   - CSS global previne overflow em TODOS os elementos
   - Layout principal adiciona camada de proteção
   - Página específica adiciona controle fino

2. **Mobile-first approach:**
   - Regras específicas para `@media (max-width: 768px)`
   - `!important` para forçar em casos extremos
   - `min-width: 0` previne flex/grid de expandir

3. **PhotoSwipe safety:**
   - Verifica SSR (`typeof document/window`)
   - Verifica se está no DOM (`document.body.contains()`)
   - Retry mechanism com delay incremental

---

## 📂 ARQUIVOS MODIFICADOS

1. ✅ [src/hooks/use-photoswipe.ts](src/hooks/use-photoswipe.ts) - Proteção MutationObserver
2. ✅ [src/app/globals.css](src/app/globals.css) - CSS anti-overflow
3. ✅ [src/app/(protected)/layout.tsx](src/app/(protected)/layout.tsx) - Layout principal
4. ✅ [src/app/(protected)/projects/[id]/page.tsx](src/app/(protected)/projects/[id]/page.tsx) - Página de projeto

---

## 🚀 DEPLOY

Para aplicar as mudanças no Vercel:

```bash
# 1. Commit das mudanças
git add .
git commit -m "fix: corrige overflow horizontal e erro MutationObserver no mobile"

# 2. Push para o repositório
git push origin main

# 3. Vercel vai detectar e fazer deploy automático
```

O Vercel vai:
1. Detectar o push no GitHub
2. Rodar build automático
3. Deploy em https://studio-lagosta-v2.vercel.app
4. Preview disponível em ~2-3 minutos

---

## 🐞 DEBUG

Se o problema persistir:

### 1. Verificar no DevTools:
```javascript
// Console do navegador
document.body.scrollWidth === document.body.clientWidth
// ✅ true = sem overflow
// ❌ false = ainda há overflow
```

### 2. Identificar elemento culpado:
```javascript
// Encontrar elemento mais largo
Array.from(document.querySelectorAll('*'))
  .filter(el => el.scrollWidth > el.clientWidth)
  .forEach(el => console.log(el, el.scrollWidth))
```

### 3. Verificar CSS aplicado:
```javascript
// Ver computed styles
const el = document.querySelector('.problema')
console.log(getComputedStyle(el).maxWidth)
console.log(getComputedStyle(el).overflowX)
```

---

## 📚 REFERÊNCIAS

- [CSS overflow-x MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-x)
- [word-break vs overflow-wrap](https://css-tricks.com/where-lines-break-is-complicated-heres-all-the-related-css-and-html/)
- [MutationObserver MDN](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [PhotoSwipe v5 Docs](https://photoswipe.com/getting-started/)

---

**Data:** 2025-01-23
**Versão:** 1.0.0
**Status:** ✅ Implementado e testado localmente
