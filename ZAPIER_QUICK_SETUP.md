# ⚡ ZAPIER - SETUP RÁPIDO
## Configuração Multi-Conta Instagram via Buffer

---

## ✅ CHECKLIST DE CONFIGURAÇÃO

### 1️⃣ TRIGGER (Já configurado)
- [x] Webhooks by Zapier
- [x] Catch Hook
- [x] URL: `https://hooks.zapier.com/hooks/catch/15027917/u108bpv/`

---

### 2️⃣ CRIAR 8 PATHS (Um para cada conta)

**⚠️ IMPORTANTE:** Cada PATH principal terá **3 SUB-PATHS** para diferentes tipos de mídia!

Estrutura de cada PATH:
1. **FILTER PRINCIPAL** → Filtrar por `instagram_account_id`
2. **SUB-PATH A** → Carrossel (múltiplas imagens)
3. **SUB-PATH B** → Vídeo
4. **SUB-PATH C** → Imagem única

---

## 📋 TABELA DE CONFIGURAÇÃO

| PATH | Conta | ID para Filtro | Username Buffer | Sub-Paths |
|------|-------|---------------|-----------------|-----------|
| 1 | Bacana | `68d9ea35ca3a4e6b74576ca2` | @bacanabar | 3 |
| 2 | By Rock | `68d81d8e64332ee3985fe6bb` | @by.rock | 3 |
| 3 | Espeto Gaúcho | `68d9ea7dca3a4e6b74576d05` | @espetogauchoes | 3 |
| 4 | Lagosta Criativa | `68f4e1b9669affb4c97916b6` | @lagostacriativa | 3 |
| 5 | O Quintal Parrilla | `68d81f4364332ee3985fe8e1` | @oquintalparrillabar | 3 |
| 6 | Real Gelateria | `68d81ba164332ee3985fe44d` | @realgelateriaoficial | 3 |
| 7 | Seu Quinto | `1223c84mkl58 2kjdl5` | @seuquinto | 3 |
| 8 | TERO | `68d9e9deca3a4e6b74576c2c` | @terobrasaevinho | 3 |

**Total:** 8 Paths × 3 Sub-Paths = **24 Actions do Buffer**

---

## 🔧 TEMPLATE DE CADA PATH

### STEP 1: FILTER PRINCIPAL (Repetir para cada PATH)
```
Campo: instagram_account_id
Condição: exactly matches
Valor: [COPIAR ID DA TABELA ACIMA]
```

---

### STEP 2: SUB-PATH A - CARROSSEL (2-10 imagens)

**FILTER:**
```
Campo: media_type
Condição: exactly matches
Valor: CAROUSEL_ALBUM
```

**ACTION - Buffer:**
```
App: Buffer
Action: Create a Post
Profile: [SELECIONAR CONTA]
Post Type: {{post_type}}
Media Type: multiple_images
Text: {{caption}}
Media Link 1: {{media_urls__0}}
Media Link 2: {{media_urls__1}}
Media Link 3: {{media_urls__2}}
Media Link 4: {{media_urls__3}}
Media Link 5: {{media_urls__4}}
Media Link 6: {{media_urls__5}}
Media Link 7: {{media_urls__6}}
Media Link 8: {{media_urls__7}}
Media Link 9: {{media_urls__8}}
Media Link 10: {{media_urls__9}}
First Comment: {{first_comment}}
```

---

### STEP 3: SUB-PATH B - VÍDEO (reels ou post)

**FILTER:**
```
Campo: media_type
Condição: exactly matches
Valor: VIDEO
```

**ACTION - Buffer:**
```
App: Buffer
Action: Create a Post
Profile: [SELECIONAR CONTA]
Post Type: {{post_type}}
Media Type: video
Text: {{caption}}
Media Link: {{media_urls__0}}
First Comment: {{first_comment}}
```

---

### STEP 4: SUB-PATH C - IMAGEM ÚNICA (post ou story)

**FILTER:**
```
Campo: media_type
Condição: exactly matches
Valor: IMAGE
```

**ACTION - Buffer:**
```
App: Buffer
Action: Create a Post
Profile: [SELECIONAR CONTA]
Post Type: {{post_type}}
Media Type: image
Text: {{caption}}
Media Link: {{media_urls__0}}
First Comment: {{first_comment}}
```

---

## 🎯 EXEMPLO COMPLETO - PATH 1 (Bacana)

### Filter Principal
- **Nome do Path:** "PATH 1: Bacana"
- **Campo:** `instagram_account_id`
- **Condição:** `exactly matches`
- **Valor:** `68d9ea35ca3a4e6b74576ca2`

---

#### Sub-Path A: Carrossel
- **Filter:** `media_type` exactly matches `CAROUSEL_ALBUM`
- **Buffer Action:**
  - Profile: @bacanabar
  - Media Type: `multiple_images`
  - Text: `{{1. Caption}}`
  - Media Link 1: `{{1. Media Urls 0}}`
  - Media Link 2: `{{1. Media Urls 1}}`
  - ... (até Media Link 10)

---

#### Sub-Path B: Vídeo
- **Filter:** `media_type` exactly matches `VIDEO`
- **Buffer Action:**
  - Profile: @bacanabar
  - Media Type: `video`
  - Text: `{{1. Caption}}`
  - Media Link: `{{1. Media Urls 0}}`

---

#### Sub-Path C: Imagem Única
- **Filter:** `media_type` exactly matches `IMAGE`
- **Buffer Action:**
  - Profile: @bacanabar
  - Media Type: `image`
  - Text: `{{1. Caption}}`
  - Media Link: `{{1. Media Urls 0}}`

---

## 📦 CAMPOS DO WEBHOOK RECEBIDO

O Studio Lagosta envia este payload:

```json
{
  "post_type": "post|reels|story",
  "media_type": "IMAGE|VIDEO|CAROUSEL_ALBUM",
  "caption": "Legenda...",
  "media_urls": ["url1.jpg", "url2.jpg"],
  "media_count": 1,
  "first_comment": "Comentário",
  "instagram_account_id": "68d9ea35ca3a4e6b74576ca2",
  "instagram_username": "@bacanabar"
}
```

### Mapeamento para Buffer:

| Webhook Field | Zapier Mapping | Buffer Field |
|--------------|----------------|--------------|
| `post_type` | `{{1. Post Type}}` | Post Type |
| `media_type` | `{{1. Media Type}}` | (usado no filtro) |
| `caption` | `{{1. Caption}}` | Text |
| `media_urls` (array) | `{{1. Media Urls 0}}`, `{{1. Media Urls 1}}`, etc | Media Link(s) |
| `first_comment` | `{{1. First Comment}}` | First Comment |

---

## 🧪 TESTE RÁPIDO

Para cada PATH configurado, teste os 3 tipos de mídia:

### Teste 1: Imagem Única
1. ✅ No Studio Lagosta, selecione o projeto
2. ✅ Crie post tipo POST com 1 imagem
3. ✅ Tipo IMMEDIATE
4. ✅ Verifique Zapier History → Sub-Path C acionado
5. ✅ Confirme no Buffer → Post com 1 imagem

### Teste 2: Carrossel
1. ✅ Crie post tipo POST com 3-5 imagens
2. ✅ Tipo IMMEDIATE
3. ✅ Verifique Zapier History → Sub-Path A acionado
4. ✅ Confirme no Buffer → Post tipo carrossel

### Teste 3: Vídeo (Reels)
1. ✅ Crie post tipo REEL com 1 vídeo
2. ✅ Tipo IMMEDIATE
3. ✅ Verifique Zapier History → Sub-Path B acionado
4. ✅ Confirme no Buffer → Reels agendado

---

## ⚠️ PROBLEMAS COMUNS

### Post não chega no Buffer
- [ ] Conferir se ID do filtro está EXATAMENTE igual
- [ ] Verificar se conta está conectada no Buffer
- [ ] Ver se webhook está recebendo (`instagram_account_id` presente)
- [ ] Verificar qual Sub-Path foi acionado no Zapier History

### Imagem não aparece
- [ ] URL da imagem está acessível?
- [ ] Campo mapeado corretamente? (`media_urls__0`)
- [ ] Formato suportado? (JPG, PNG, MP4)

### Carrossel mostra apenas 1 imagem
- [ ] Todos os 10 Media Links foram configurados?
- [ ] Array `media_urls` tem múltiplos itens?
- [ ] Media Type está como `multiple_images`?

### Filtro não funciona
- [ ] Usar "exactly matches" não "contains"
- [ ] Copiar e colar IDs (não digitar)
- [ ] Verificar espaços extras no ID
- [ ] Verificar se `media_type` está em MAIÚSCULAS

---

## 🚀 ORDEM DE CRIAÇÃO RECOMENDADA

1. **Criar PATH 1 (Bacana) completamente:**
   - Filter Principal (`instagram_account_id`)
   - Sub-Path A (Carrossel)
   - Sub-Path B (Vídeo)
   - Sub-Path C (Imagem)

2. **Testar PATH 1:**
   - Enviar 1 post de cada tipo do Studio Lagosta
   - Verificar todos os 3 Sub-Paths funcionam

3. **Duplicar PATH 1 para os outros 7:**
   - Ajustar apenas: Filter Principal (ID) e Profile do Buffer

4. **Testar cada PATH:**
   - Pelo menos 1 post de teste por conta

---

## 📊 STATUS DE CONFIGURAÇÃO

### Paths Principais (8):
- [ ] PATH 1 - Bacana (`68d9ea35ca3a4e6b74576ca2`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem
- [ ] PATH 2 - By Rock (`68d81d8e64332ee3985fe6bb`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem
- [ ] PATH 3 - Espeto Gaúcho (`68d9ea7dca3a4e6b74576d05`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem
- [ ] PATH 4 - Lagosta Criativa (`68f4e1b9669affb4c97916b6`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem
- [ ] PATH 5 - O Quintal Parrilla (`68d81f4364332ee3985fe8e1`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem
- [ ] PATH 6 - Real Gelateria (`68d81ba164332ee3985fe44d`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem
- [ ] PATH 7 - Seu Quinto (`1223c84mkl58 2kjdl5`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem
- [ ] PATH 8 - TERO (`68d9e9deca3a4e6b74576c2c`)
  - [ ] Sub-Path A: Carrossel
  - [ ] Sub-Path B: Vídeo
  - [ ] Sub-Path C: Imagem

### Path de Fallback:
- [ ] PATH 9 - Catch-All (Email/Slack notification)

---

## 🎬 ATIVAR O ZAP

Depois de configurar e testar todos os Paths:

1. ✅ Revisar todos os filtros (8 principais + 24 sub-filters)
2. ✅ Testar pelo menos uma vez cada Sub-Path
3. ✅ Ativar o Zap (toggle ON)
4. ✅ Monitorar primeiros dias no Zapier History

---

## 🆘 SUPORTE RÁPIDO

| Problema | Solução |
|----------|---------|
| Sub-Path errado acionado | Verificar valor de `media_type` no payload |
| Carrossel não funciona | Buffer tem bugs conhecidos com carrosséis - testar direct API |
| Stories não publicam | Verificar se conta é Business no Instagram |
| Reels sem vídeo | Verificar extensão do arquivo (.mp4, .mov) |

---

**Webhook URL:**
```
https://hooks.zapier.com/hooks/catch/15027917/u108bpv/
```

**Total de Contas:** 8
**Total de Paths:** 9 (8 contas + 1 fallback)
**Total de Sub-Paths:** 24
**Total de Actions:** 24 ações do Buffer
