# Ajustes do Sistema de Geração de Arte - Wine Vix

**Data:** 2026-03-04
**Projeto de Referência:** Wine Vix (ID: 11)
**Status:** Aguardando implementação

---

## 📋 Sumário Executivo

O sistema de geração de arte está produzindo resultados **tecnicamente corretos** mas **esteticamente inconsistentes** com as referências da marca. Os principais problemas são:

1. **Cores de texto incorretas** (branco ao invés de dourado/bordô)
2. **Overlay escuro sendo aplicado** quando deveria usar gradiente preto→transparente
3. **Falta de sistema de preferências de cores** (similar ao de fontes)
4. **Análise de tipografia invertida** no `visualElements`

---

## 🔴 Problemas Identificados

### **Problema 1: Cores de Texto Não Respeitam a Paleta da Marca**

**Contexto:**
- Cores da marca Wine Vix: `#722F37` (Merlot), `#D4AF37` (Ouro), `#FCE77B` (Amarelo), `#F9F7F2` (Creme), `#2C3E50` (Cinza)
- Referências mostram títulos em **dourado** (#D4AF37) e CTAs em **bordô/azul** (#722F37)
- Sistema atual gera texto em **branco** (#FFFFFF)

**Causa Raiz:**
1. `separateTextElements()` usa prompt vago: *"Use cores da marca para títulos e CTA"*
2. GPT-4o-mini escolhe cores aleatoriamente
3. `positionTextWithVision()` tem exemplo hardcoded com `"color": "#FFF"`
4. GPT-4o sobrescreve cores originais ao posicionar

**Arquivos Afetados:**
- `src/app/api/tools/generate-art/route.ts` (linhas 277-308, 380-430)

---

### **Problema 2: Overlay Escuro ao Invés de Gradiente**

**Contexto:**
- Referências Wine Vix usam **gradiente preto→transparente** (não overlay sólido)
- Texto flutua sobre a imagem com gradiente sutil para contraste
- Sistema atual força `overlay.enabled: true` com opacidade 0.4-0.6

**Causa Raiz:**
1. Prompt de `positionTextWithVision()` sugere overlay como padrão
2. Regra 9: *"Use overlay.enabled: true ... if text area is bright/busy"*
3. Não há opção explícita para "gradiente preto→transparente"

**Arquivos Afetados:**
- `src/app/api/tools/generate-art/route.ts` (linhas 376-377, 391)
- `desktop-app/electron/ipc/text-renderer.ts` (implementação do overlay)

---

### **Problema 3: Falta Sistema de Preferências de Cores**

**Contexto:**
- Já existe sistema de **Preferências de Fontes** (Título e Corpo)
- Não existe equivalente para **Preferências de Cores** (título, subtítulo, info, CTA)
- Cores são "adivinhadas" pelo GPT-4o-mini a cada geração

**Benefício da Implementação:**
- Consistência total entre gerações
- Usuário define uma vez, sistema aplica sempre
- Elimina necessidade de lógica de "detecção" de cores

**Arquivos para Criar/Modificar:**
- Schema Prisma: adicionar campos `titleTextColor`, `bodyTextColor`, `ctaTextColor`
- Frontend: componente de configuração (similar a `BrandAssetsSection`)
- Backend: `fetchBrandAssets()` retornar novas preferências

---

### **Problema 4: Análise de Tipografia Invertida**

**Contexto:**
- Análise salva: *"Sans-serif elegante em títulos"*
- Realidade: Título usa **Playfair Display** (SERIF itálica)
- Análise salva: *"Corpo de texto em serif leve"*
- Realidade: Corpo usa **Lato** (SANS-SERIF)

**Impacto:**
- Confunde GPT-4o ao gerar prompts técnicos
- Pode influenciar escolha de pesos e estilos

**Arquivos Afetados:**
- `src/app/api/tools/analyze-style/route.ts` (análise está correta, mas resultado salvo está invertido)
- Possível problema no salvamento ou no prompt de análise

---

## ✅ Soluções Propostas

### **Solução 1: Sistema de Preferências de Cores (Recomendado)**

**Arquitetura:**

```typescript
// Schema Prisma (prisma/schema.prisma)
model Project {
  // ... existing fields

  // Font preferences (já existe)
  titleFontFamily String?
  bodyFontFamily  String?

  // NEW: Color preferences
  titleTextColor    String? @default("#D4AF37") // Dourado para títulos
  subtitleTextColor String? @default("#D4AF37") // Mesmo que título
  infoTextColor     String? @default("#FFFFFF") // Branco para info
  ctaTextColor      String? @default("#722F37") // Bordô para CTA
}
```

**Interface do Usuário:**
```typescript
// Componente: src/components/project/identity/TextColorPreferencesSection.tsx

<div className="space-y-4">
  <Label>Preferências de Cores de Texto</Label>

  <ColorPicker
    label="Cor do Título"
    value={titleTextColor}
    onChange={setTitleTextColor}
    brandColors={brandColors} // Dropdown com cores cadastradas
  />

  <ColorPicker
    label="Cor do Subtítulo"
    value={subtitleTextColor}
    onChange={setSubtitleTextColor}
    brandColors={brandColors}
  />

  <ColorPicker
    label="Cor de Informações"
    value={infoTextColor}
    onChange={setInfoTextColor}
    brandColors={brandColors}
  />

  <ColorPicker
    label="Cor do CTA"
    value={ctaTextColor}
    onChange={setCtaTextColor}
    brandColors={brandColors}
  />
</div>
```

**Backend:**
```typescript
// src/app/api/tools/generate-art/route.ts

interface BrandAssets {
  // ... existing
  titleTextColor: string | null
  subtitleTextColor: string | null
  infoTextColor: string | null
  ctaTextColor: string | null
}

async function fetchBrandAssets(projectId: number): Promise<BrandAssets | null> {
  const project = await db.project.findUnique({
    select: {
      // ... existing
      titleTextColor: true,
      subtitleTextColor: true,
      infoTextColor: true,
      ctaTextColor: true,
    },
  })

  return {
    // ... existing
    titleTextColor: project.titleTextColor ?? '#D4AF37',
    subtitleTextColor: project.subtitleTextColor ?? '#D4AF37',
    infoTextColor: project.infoTextColor ?? '#FFFFFF',
    ctaTextColor: project.ctaTextColor ?? '#722F37',
  }
}

async function separateTextElements(
  userText: string,
  brandAssets: BrandAssets,
): Promise<TextElement[]> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: textElementSchema,
    prompt: `...

CORES FIXAS (USE EXATAMENTE):
- type "title": SEMPRE ${brandAssets.titleTextColor}
- type "subtitle": SEMPRE ${brandAssets.subtitleTextColor}
- type "info": SEMPRE ${brandAssets.infoTextColor}
- type "cta": SEMPRE ${brandAssets.ctaTextColor}

NÃO escolha cores diferentes. Use EXATAMENTE as cores especificadas acima.
    `,
  })
}
```

**Vantagens:**
- ✅ Consistência total (cores sempre iguais)
- ✅ Controle do usuário (define uma vez)
- ✅ Elimina "adivinhação" de cores
- ✅ Interface familiar (igual a fontes)
- ✅ Fallback inteligente (defaults sensatos)

---

### **Solução 2: Substituir Overlay por Gradiente**

**Opção A: Adicionar Tipo de Overlay "Gradient"**

```typescript
// src/app/api/tools/generate-art/route.ts

const textLayoutSchema = z.object({
  // ... existing
  overlay: z.object({
    enabled: z.boolean(),
    type: z.enum(['solid', 'gradient']).default('gradient'), // NEW
    position: z.enum(['top', 'bottom', 'full']),
    opacity: z.number(),
  }),
})
```

**Prompt Atualizado:**
```typescript
// positionTextWithVision()

`...
9. Use "overlay.enabled: true" with:
   - type: "gradient" for smooth black-to-transparent fade (preferred for Wine Vix style)
   - type: "solid" for semi-transparent solid color (use sparingly)
   - position: "bottom" (most common) or "top"
   - opacity: 0.3-0.6 (strength of the overlay)
10. Prefer gradient overlay for elegant, sophisticated brands
...

EXAMPLE:
{
  "overlay": {
    "enabled": true,
    "type": "gradient",  // ← black to transparent
    "position": "bottom",
    "opacity": 0.5
  }
}
`
```

**Implementação no Text Renderer:**
```typescript
// desktop-app/electron/ipc/text-renderer.ts

if (input.textLayout.overlay.enabled) {
  const { position, opacity, type } = input.textLayout.overlay

  if (type === 'gradient') {
    // Gradiente preto → transparente
    const gradient = ctx.createLinearGradient(0, gradientStart, 0, gradientEnd)
    gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
  } else {
    // Overlay sólido (atual)
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`
  }

  ctx.fillRect(0, overlayY, w, overlayH)
}
```

**Opção B: Tornar Gradiente o Padrão**

Mais simples: sempre usar gradiente, remover `type` do schema.

```typescript
// Sempre gradiente preto→transparente
const gradient = ctx.createLinearGradient(0, gradientStart, 0, gradientEnd)
gradient.addColorStop(0, `rgba(0, 0, 0, ${input.textLayout.overlay.opacity})`)
gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
```

**Recomendação:** Opção A (mais flexível para futuros projetos)

---

### **Solução 3: Validação Forçada de Cores**

**Mesmo com preferências, adicionar validação de segurança:**

```typescript
// src/app/api/tools/generate-art/route.ts

async function positionTextWithVision(
  imageUrl: string,
  textElements: TextElement[],
  format: string,
  brandLayouts?: string[],
): Promise<TextLayout> {
  // ... existing code ...

  const validated = textLayoutSchema.parse(layoutData)

  // CRITICAL: Restore original colors if GPT-4o changed them
  const originalColors = new Map<string, string>()
  for (const el of textElements) {
    originalColors.set(el.text.toLowerCase().trim(), el.color)
  }

  for (const element of validated.elements) {
    const textKey = element.text.toLowerCase().trim()
    if (textKey && originalColors.has(textKey)) {
      const originalColor = originalColors.get(textKey)!
      if (element.color !== originalColor) {
        console.log(`[positionTextWithVision] ⚠️ Color changed by GPT-4o: "${element.text}" ${element.color} → ${originalColor}`)
        element.color = originalColor // FORCE RESTORE
      }
    }
  }

  return validated as TextLayout
}
```

---

### **Solução 4: Corrigir Análise de Tipografia**

**Opção A: Adicionar Validação no Salvamento**

```typescript
// Ao salvar análise, cruzar com fontes configuradas

if (project.titleFontFamily) {
  const titleFont = await db.customFont.findFirst({
    where: { fontFamily: project.titleFontFamily }
  })

  // Detectar se é serif ou sans-serif pelo nome
  const isSerif = titleFont.fontFamily.toLowerCase().includes('playfair') ||
                  titleFont.fontFamily.toLowerCase().includes('serif')

  // Corrigir análise se estiver invertida
  if (isSerif && analysisResult.detectedElements.typography.includes('sans-serif')) {
    console.warn('[analyze-style] Typography analysis inverted - correcting')
    // Swap serif ↔ sans-serif
  }
}
```

**Opção B: Ignorar Typography da Análise**

Como as fontes já são configuradas manualmente, a seção `typography` do `visualElements` pode ser ignorada na geração de arte.

**Recomendação:** Opção B (mais simples, já temos fonte configurada)

---

## 📊 Priorização dos Ajustes

| Prioridade | Ajuste | Impacto | Esforço |
|------------|--------|---------|---------|
| **🔴 P0** | Sistema de Preferências de Cores | Alto | Médio |
| **🟠 P1** | Substituir Overlay por Gradiente | Alto | Baixo |
| **🟡 P2** | Validação Forçada de Cores | Médio | Baixo |
| **🟢 P3** | Corrigir Análise de Tipografia | Baixo | Baixo |

---

## 🛠️ Arquivos a Modificar

### **Backend:**
1. `prisma/schema.prisma` - Adicionar campos de preferências de cores
2. `src/app/api/tools/generate-art/route.ts` - Usar preferências, validação, gradiente
3. `src/app/api/projects/[projectId]/brand-assets/route.ts` - PATCH para salvar cores

### **Frontend (Desktop App):**
4. `desktop-app/src/components/project/identity/TextColorPreferencesSection.tsx` - Novo componente
5. `desktop-app/src/components/project/tabs/IdentityTab.tsx` - Adicionar seção
6. `desktop-app/src/hooks/use-brand-assets.ts` - Hook para update de cores

### **Electron (Renderer):**
7. `desktop-app/electron/ipc/text-renderer.ts` - Implementar gradiente preto→transparente

---

## 🧪 Testes Necessários

### **Teste 1: Cores Consistentes**
```
Input: "Direto do Chile - Morandé Terrarum Reserva - Rua Elesbão Linhares, Praia do Canto - Qual é a sua escolha?"

Configuração:
- titleTextColor: #D4AF37
- subtitleTextColor: #D4AF37
- infoTextColor: #FFFFFF
- ctaTextColor: #722F37

Resultado Esperado:
[0] title: "Direto do Chile" - color: #D4AF37 ✅
[1] subtitle: "Morandé Terrarum Reserva" - color: #D4AF37 ✅
[2] info: "Rua Elesbão Linhares..." - color: #FFFFFF ✅
[3] cta: "Qual é a sua escolha?" - color: #722F37 ✅
```

### **Teste 2: Gradiente ao Invés de Overlay**
```
Input: Arte com fundo claro/busy

Resultado Esperado:
- overlay.enabled: true
- overlay.type: "gradient" (não "solid")
- overlay.position: "bottom"
- overlay.opacity: 0.3-0.6

Visual: Gradiente suave preto→transparente, não bloco sólido escuro
```

### **Teste 3: Validação de Cores Forçada**
```
Cenário: GPT-4o tenta mudar cor para branco

Log Esperado:
"[positionTextWithVision] ⚠️ Color changed by GPT-4o: "Direto do Chile" #FFFFFF → #D4AF37"

Resultado: Cor restaurada para #D4AF37
```

---

## 📝 Notas de Implementação

### **Defaults Sensatos:**
```typescript
titleTextColor:    #D4AF37  // Dourado (primeira cor quente da paleta)
subtitleTextColor: #D4AF37  // Mesmo que título (consistência)
infoTextColor:     #FFFFFF  // Branco (máxima legibilidade)
ctaTextColor:      #722F37  // Bordô/Merlot (destaque, segunda cor)
```

### **Fallback Inteligente:**
Se preferências não estiverem configuradas:
1. Detectar automaticamente (como no código atual)
2. Usar primeira cor quente (#D4AF37, #FFD700, #FCE77B) para títulos
3. Usar primeira cor fria/escura (#722F37, #2C3E50) para CTA
4. Branco (#FFFFFF) para info

### **Compatibilidade com Projetos Existentes:**
- Projetos antigos sem preferências: usar fallback automático
- Projetos novos: sugerir configuração de cores na onboarding
- Migração: criar script para popular defaults baseado em cores cadastradas

---

## 🎯 Resultado Final Esperado

**Antes:**
- Títulos brancos ❌
- Overlay escuro pesado ❌
- Cores inconsistentes entre gerações ❌

**Depois:**
- Títulos dourados (#D4AF37) ✅
- Gradiente preto→transparente sutil ✅
- Cores 100% consistentes ✅
- Controle total do usuário ✅

---

## 📚 Referências

- Projeto Wine Vix (ID: 11)
- Cores: #722F37, #D4AF37, #FCE77B, #F9F7F2, #2C3E50
- Fontes: Playfair Display BoldItalic (título), Lato Regular (corpo)
- Referências visuais: 6 imagens em `brandReferenceUrls`

---

**Documento criado por:** Claude Code (Sonnet 4.5)
**Para aprovação de:** Ciro Trigo
**Próximo passo:** Revisão e aprovação de prioridades
