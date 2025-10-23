# Guia de Correção Safari + PhotoSwipe

## 🔧 CORREÇÕES IMPLEMENTADAS

### 1. **CSS Específico para Safari** ✅

**Arquivo:** [src/app/globals.css](src/app/globals.css:311-332)

**Mudanças:**
```css
/* Safari-specific fixes usando feature detection */
@supports (-webkit-touch-callout: none) {
  /* Detecta Safari iOS */

  body, html {
    position: relative;
    overflow-x: hidden !important;
    width: 100% !important;
    max-width: 100vw !important;
  }

  /* Prevenir zoom em inputs (Safari 100% zoom) */
  input, select, textarea {
    font-size: 16px !important;
  }

  /* Fix sticky elements */
  [style*="position: sticky"] {
    position: -webkit-sticky;
    position: sticky;
  }
}
```

**Por que funciona:**
- `@supports (-webkit-touch-callout: none)` detecta Safari iOS especificamente
- `!important` força as regras mesmo com cache
- `-webkit-sticky` para compatibilidade com Safari antigo

---

### 2. **PhotoSwipe - Correção de Cliques** ✅

**Arquivo:** [src/components/projects/gallery-item.tsx](src/components/projects/gallery-item.tsx:220-239)

**Problema:** O `onClick` estava fazendo `preventDefault()` sempre, bloqueando o PhotoSwipe.

**Correção:**
```tsx
onClick={(e) => {
  // Só prevenir se NÃO estiver completo
  if (!resolvedAssetUrl || status !== 'COMPLETED') {
    e.preventDefault()
    e.stopPropagation()
    onPreview?.()
    return
  }

  // Se completo, DEIXAR o PhotoSwipe interceptar
  // NÃO fazer preventDefault aqui!
  console.log('PhotoSwipe: Item clicável', { ... })
}
```

---

### 3. **PhotoSwipe - Melhorias Mobile/Safari** ✅

**Arquivo:** [src/hooks/use-photoswipe.ts](src/hooks/use-photoswipe.ts:78-104)

**Adicionado:**
```tsx
new PhotoSwipeLightbox({
  // ... configurações existentes

  // ✅ Garantir interceptação de cliques
  preload: [1, 1],

  // ✅ Suporte Safari/Mobile
  allowPanToNext: true,      // Pan horizontal para trocar slides
  closeOnVerticalDrag: true,  // Arrastar pra baixo fecha
  pinchToClose: true,         // Pinch fecha lightbox

  // ✅ Gestos touch
  tapAction: 'close',         // Tap fecha
  doubleTapAction: 'zoom',    // Double tap zoom
})
```

**Debug logging adicionado:**
```tsx
// ✅ Logs para identificar problemas
console.log('✅ PhotoSwipe: Opening lightbox')
console.log('✅ PhotoSwipe: Found X clickable items')
console.log('🖱️ PhotoSwipe: Link clicked', { href, width, height })
```

---

### 4. **Meta Tags Anti-Cache** ✅

**Arquivo:** [src/app/layout.tsx](src/app/layout.tsx:22-41)

**Adicionado:**
```tsx
export const metadata: Metadata = {
  // Prevenir cache agressivo
  other: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
}

export const viewport: Viewport = {
  // ... viewport existente
  interactiveWidget: 'resizes-content', // Safari-specific
}
```

---

## 🧹 COMO LIMPAR CACHE NO SAFARI

### Safari Desktop (macOS)
1. **Limpar cache completo:**
   - `⌘ + Option + E` (Command + Option + E)
   - Ou: Safari > Limpar Histórico... > Todos os dados

2. **Hard reload:**
   - `⌘ + Option + R` (Command + Option + R)
   - Ou: `⌘ + Shift + R`

3. **Modo Desenvolvedor:**
   - Safari > Preferências > Avançado > ✅ Mostrar menu Desenvolver
   - Desenvolver > Limpar Caches
   - Desenvolver > Desativar Caches (para testes)

### Safari iOS (iPhone/iPad)
1. **Limpar cache do Safari:**
   - Ajustes > Safari > Limpar Histórico e Dados de Websites
   - ⚠️ Isso vai deslogar de todos os sites!

2. **Alternativa menos agressiva:**
   - Ajustes > Safari > Avançado > Dados dos Sites
   - Encontrar `studio-lagosta-v2.vercel.app`
   - Deslizar para esquerda > Remover

3. **Modo Privado (teste rápido):**
   - Abrir Safari
   - Ícone de abas (canto inferior direito)
   - `[X] Abas Privadas`
   - Acessar o site (não vai usar cache)

### Vercel Preview (melhor opção)
Se o cache persistir, use uma URL de preview:
```
https://studio-lagosta-v2-[hash].vercel.app
```
Preview URLs têm cache separado e deployment novo.

---

## 🧪 CHECKLIST DE TESTE

### No Safari (após limpar cache):

#### 1. Verificar Overflow
- [ ] Abrir https://studio-lagosta-v2.vercel.app/projects/6
- [ ] Página abre no tamanho correto (sem zoom)
- [ ] Sem scroll horizontal
- [ ] Títulos quebram corretamente
- [ ] Cards de templates visíveis completos

#### 2. Verificar PhotoSwipe
- [ ] Ir para aba "Criativos"
- [ ] Clicar em um criativo COMPLETO (status verde)
- [ ] Lightbox deve abrir com a imagem ampliada
- [ ] Pode fazer pinch to zoom
- [ ] Pode arrastar horizontalmente para próxima imagem
- [ ] Arrastar para baixo fecha o lightbox
- [ ] Tap na imagem fecha

#### 3. Console DevTools
Abrir console Safari (⌘ + Option + C):
- [ ] Ver logs: `✅ PhotoSwipe: Initialized successfully`
- [ ] Ver logs: `✅ PhotoSwipe: Found X clickable items`
- [ ] Ao clicar: `🖱️ PhotoSwipe: Link clicked`
- [ ] Ao abrir: `✅ PhotoSwipe: Opening lightbox`
- [ ] Sem erros de MutationObserver

---

## 🐞 DEBUG SE NÃO FUNCIONAR

### Problema: Safari ainda mostra overflow

**Verificar no Console:**
```javascript
// Verificar largura
console.log('Body width:', document.body.scrollWidth)
console.log('Viewport width:', window.innerWidth)

// Encontrar elemento culpado
Array.from(document.querySelectorAll('*'))
  .filter(el => el.scrollWidth > window.innerWidth)
  .forEach(el => console.log('Overflow:', el))
```

**Solução temporária:** Adicionar no globals.css:
```css
@supports (-webkit-touch-callout: none) {
  * {
    max-width: 100vw !important;
  }
}
```

### Problema: PhotoSwipe não abre

**Verificar no Console:**
```javascript
// Verificar se PhotoSwipe está inicializado
console.log('PhotoSwipe elements:', document.querySelectorAll('#creatives-gallery a'))

// Verificar atributos
const link = document.querySelector('#creatives-gallery a')
console.log('Width:', link?.getAttribute('data-pswp-width'))
console.log('Height:', link?.getAttribute('data-pswp-height'))
console.log('Href:', link?.href)
```

**Possíveis causas:**
1. ❌ Elementos não têm `data-pswp-width` e `data-pswp-height`
   - Solução: Aguardar imagens carregarem, PhotoSwipe tem retry

2. ❌ Status não é COMPLETED
   - Solução: Só criativos completos abrem lightbox

3. ❌ PhotoSwipe não inicializou
   - Solução: Verificar logs `✅ PhotoSwipe: Initialized`

4. ❌ Cache do Safari
   - Solução: Limpar cache ou usar modo privado

---

## 🔄 PROCESSO DE DEPLOY

```bash
# 1. Commit das mudanças
git add .
git commit -m "fix: Safari overflow + PhotoSwipe mobile support"

# 2. Push
git push origin main

# 3. Aguardar deploy Vercel (~2-3 min)
# URL: https://vercel.com/[seu-usuario]/studio-lagosta-v2

# 4. Testar na URL de preview primeiro
# Vercel gera URL única: studio-lagosta-v2-[hash].vercel.app

# 5. Se funcionar, está em produção
```

---

## 📊 RESUMO DAS MUDANÇAS

| Problema | Arquivo | Solução |
|----------|---------|---------|
| Overflow Safari | globals.css | `@supports (-webkit-touch-callout)` com `!important` |
| PhotoSwipe não abre | gallery-item.tsx | Remover `preventDefault` quando COMPLETED |
| Gestos mobile | use-photoswipe.ts | Adicionar `pinchToClose`, `allowPanToNext`, etc |
| Cache agressivo | layout.tsx | Meta tags `no-cache` + `interactiveWidget` |
| MutationObserver | use-photoswipe.ts | Verificar `document.body.contains()` |

---

## 🎯 EXPECTATIVAS

### Chrome ✅
- Já funcionando

### Safari Desktop 🟡
- Deve funcionar após limpar cache
- Usar `⌘ + Option + E` para limpar

### Safari iOS ✅
- Deve funcionar após limpar cache
- Ajustes > Safari > Limpar Histórico
- Ou usar Modo Privado para teste rápido

---

## 💡 DICAS DE TESTE

### 1. Usar modo privado sempre
Evita problemas de cache durante desenvolvimento.

### 2. Verificar no Safari real
Safari no simulador iOS pode ter bugs diferentes.

### 3. Testar em diferentes versões
- Safari 16+ (iOS 16)
- Safari 17+ (iOS 17)

### 4. Usar Vercel Preview URLs
Cada preview tem deployment separado com cache limpo:
```
https://studio-lagosta-v2-git-[branch]-[user].vercel.app
```

---

## 📞 SE AINDA NÃO FUNCIONAR

### 1. Verificar console Safari
Abrir DevTools: `⌘ + Option + C`
- Ver se há erros JavaScript
- Ver logs do PhotoSwipe
- Ver largura do body vs viewport

### 2. Tirar screenshot
- Do console com erros
- Da página mostrando overflow
- Compartilhar para análise

### 3. Verificar versão Safari
```
Safari > Sobre o Safari
```
Versões muito antigas (<14) podem ter bugs.

---

## ✅ CHECKLIST FINAL

- [x] CSS Safari-specific implementado
- [x] PhotoSwipe gestos mobile adicionados
- [x] Meta tags anti-cache adicionadas
- [x] Logs de debug implementados
- [x] Correção de preventDefault no onClick
- [x] Documentação criada

---

**Última atualização:** 2025-01-23
**Status:** ✅ Pronto para testar no Safari
**Próximo passo:** Limpar cache Safari e testar na URL do Vercel
