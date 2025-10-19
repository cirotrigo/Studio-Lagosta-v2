# PROMPT PARA COPILOT DO ZAPIER

---

## INSTRUÇÕES PARA CONFIGURAR ZAP DE POSTAGEM MULTI-CONTA

Configure um Zap que recebe webhooks do Studio Lagosta e roteia posts para 8 contas diferentes do Instagram através do Buffer, com suporte a diferentes tipos de mídia (imagens, vídeos, carrosséis).

### CONFIGURAÇÃO DO ZAP

**Trigger:**
- Webhooks by Zapier → Catch Hook
- URL já configurada: `https://hooks.zapier.com/hooks/catch/15027917/u108bpv/`

**Estrutura do payload recebido:**
```json
{
  "post_type": "post|reels|story",
  "media_type": "IMAGE|VIDEO|CAROUSEL_ALBUM",
  "caption": "Legenda do post",
  "media_urls": ["url1.jpg", "url2.jpg"],
  "media_count": 1,
  "first_comment": "Comentário",
  "instagram_account_id": "ID_DA_CONTA",
  "instagram_username": "@username",
  "metadata": {...}
}
```

**Campos importantes:**
- `post_type`: Tipo de publicação no Instagram (`post` = feed, `reels` = reels, `story` = stories)
- `media_type`: Tipo de mídia (`IMAGE` = foto única, `VIDEO` = vídeo único, `CAROUSEL_ALBUM` = carrossel com 2-10 imagens)
- `media_count`: Quantidade de mídias no array

---

## ESTRUTURA DO ZAP: 8 PATHS COM SUB-PATHS

Cada conta Instagram terá **1 PATH principal** com filtro por `instagram_account_id`.

Dentro de cada PATH, crie **3 SUB-PATHS** para tratar diferentes tipos de mídia:
- **Sub-Path A**: Carrossel (múltiplas imagens)
- **Sub-Path B**: Vídeo (reels ou post de vídeo)
- **Sub-Path C**: Imagem única (post ou story)

---

## TEMPLATE DE PATH (COPIAR PARA CADA CONTA)

### PATH [NÚMERO]: [NOME DA CONTA]

**Filter Principal:**
```
Campo: instagram_account_id
Condição: exactly matches
Valor: [ID_DA_CONTA]
```

---

#### Sub-Path A: Carrossel (múltiplas imagens)

**Filter:**
```
Campo: media_type
Condição: exactly matches
Valor: CAROUSEL_ALBUM
```

**Action - Buffer:**
- App: **Buffer**
- Action Event: **Create a Post** (ou **Add to Queue**)
- Profile: **[SELECIONAR CONTA INSTAGRAM]**
- Post Type: Use `{{post_type}}` (será "post")
- Media Type: **multiple_images**
- Text: `{{caption}}`
- Media Link 1: `{{media_urls__0}}`
- Media Link 2: `{{media_urls__1}}`
- Media Link 3: `{{media_urls__2}}`
- Media Link 4: `{{media_urls__3}}`
- Media Link 5: `{{media_urls__4}}`
- Media Link 6: `{{media_urls__5}}`
- Media Link 7: `{{media_urls__6}}`
- Media Link 8: `{{media_urls__7}}`
- Media Link 9: `{{media_urls__8}}`
- Media Link 10: `{{media_urls__9}}`
- First Comment: `{{first_comment}}`

---

#### Sub-Path B: Vídeo

**Filter:**
```
Campo: media_type
Condição: exactly matches
Valor: VIDEO
```

**Action - Buffer:**
- App: **Buffer**
- Action Event: **Create a Post** (ou **Add to Queue**)
- Profile: **[SELECIONAR CONTA INSTAGRAM]**
- Post Type: Use `{{post_type}}` (pode ser "post" ou "reels")
- Media Type: **video**
- Text: `{{caption}}`
- Media Link: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

#### Sub-Path C: Imagem única

**Filter:**
```
Campo: media_type
Condição: exactly matches
Valor: IMAGE
```

**Action - Buffer:**
- App: **Buffer**
- Action Event: **Create a Post** (ou **Add to Queue**)
- Profile: **[SELECIONAR CONTA INSTAGRAM]**
- Post Type: Use `{{post_type}}` (pode ser "post" ou "story")
- Media Type: **image**
- Text: `{{caption}}`
- Media Link: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

---

## CONFIGURAÇÃO DAS 8 CONTAS

### PATH 1: Bacana
**ID:** `68d9ea35ca3a4e6b74576ca2`
**Profile Buffer:** @bacanabar
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

### PATH 2: By Rock
**ID:** `68d81d8e64332ee3985fe6bb`
**Profile Buffer:** @by.rock
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

### PATH 3: Espeto Gaúcho
**ID:** `68d9ea7dca3a4e6b74576d05`
**Profile Buffer:** @espetogauchoes
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

### PATH 4: Lagosta Criativa
**ID:** `68f4e1b9669affb4c97916b6`
**Profile Buffer:** @lagostacriativa
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

### PATH 5: O Quintal Parrilla
**ID:** `68d81f4364332ee3985fe8e1`
**Profile Buffer:** @oquintalparrillabar
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

### PATH 6: Real Gelateria
**ID:** `68d81ba164332ee3985fe44d`
**Profile Buffer:** @realgelateriaoficial
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

### PATH 7: Seu Quinto
**ID:** `1223c84mkl58 2kjdl5`
**Profile Buffer:** @seuquinto
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

### PATH 8: TERO
**ID:** `68d9e9deca3a4e6b74576c2c`
**Profile Buffer:** @terobrasaevinho
**Criar 3 Sub-Paths:** Carrossel, Vídeo, Imagem única

---

---

## PATH 9: CATCH-ALL (FALLBACK)

**Filter:** (Nenhum - executa se todos os outros falharem)

**Action:**
- App: **Email by Zapier** ou **Slack**
- Subject: "Post não roteado - Instagram Account ID desconhecido"
- Body:
```
Post recebido com instagram_account_id não reconhecido.

ID recebido: {{instagram_account_id}}
Username: {{instagram_username}}
Post Type: {{post_type}}
Media Type: {{media_type}}
Caption: {{caption}}
```

---

---

## MAPEAMENTO COMPLETO DE CAMPOS

### Campos do Buffer que variam por tipo de mídia:

| Tipo de Mídia | Post Type | Media Type Buffer | Campos de Media |
|--------------|-----------|-------------------|-----------------|
| Imagem única | `post` ou `story` | `image` | Media Link: `{{media_urls__0}}` |
| Vídeo único | `post` ou `reels` | `video` | Media Link: `{{media_urls__0}}` |
| Carrossel | `post` | `multiple_images` | Media Link 1-10: `{{media_urls__0}}` até `{{media_urls__9}}` |

### Campos comuns a todos os tipos:

- **Text (Caption):** `{{caption}}`
- **First Comment:** `{{first_comment}}`
- **Profile:** Selecionar conta Instagram conectada no Buffer

---

---

## NOTAS IMPORTANTES

### Limitações do Buffer:
1. **Carrosséis**: Apenas imagens (sem vídeos misturados)
2. **Carrosséis**: Máximo 10 imagens
3. **Stories**: Podem ter limitações de publicação automática (verificar se conta é Business)
4. **Reels**: Suportam apenas vídeos

### Configuração de Sub-Paths:
- A ordem dos Sub-Paths importa (do mais específico ao menos específico)
- Sempre coloque filtros de `media_type` antes de ações
- Se um Sub-Path não tiver match, o próximo será testado

### Testes Recomendados:
Para cada conta, teste:
1. ✅ Post com imagem única
2. ✅ Post carrossel (2-10 imagens)
3. ✅ Reels com vídeo
4. ✅ Story com imagem

---

---

## RESUMO DOS IDS

```
Bacana:            68d9ea35ca3a4e6b74576ca2
By Rock:           68d81d8e64332ee3985fe6bb
Espeto Gaúcho:     68d9ea7dca3a4e6b74576d05
Lagosta Criativa:  68f4e1b9669affb4c97916b6
O Quintal:         68d81f4364332ee3985fe8e1
Real Gelateria:    68d81ba164332ee3985fe44d
Seu Quinto:        1223c84mkl58 2kjdl5
TERO:              68d9e9deca3a4e6b74576c2c
```

---

**Total de Paths:** 9 (8 contas + 1 fallback)
**Total de Sub-Paths:** 24 (3 por conta × 8 contas)
**Total de Actions:** 24 ações do Buffer
