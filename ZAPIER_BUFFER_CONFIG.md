# Configuração Zapier + Buffer para Instagram Multi-Conta
## Studio Lagosta - Sistema de Postagem Automatizada

---

## 📋 INFORMAÇÕES DO WEBHOOK

**URL do Webhook Zapier:**
```
https://hooks.zapier.com/hooks/catch/15027917/u108bpv/
```

**Método:** POST
**Content-Type:** application/json

---

## 🎯 OBJETIVO

Configurar o Zapier para receber posts do Studio Lagosta e rotear cada post para a conta correta do Instagram através do Buffer, usando filtros baseados no campo `instagram_account_id`.

---

## 📊 CONTAS CONFIGURADAS

Existem **8 projetos/contas** configurados no sistema:

| # | Nome do Projeto | Instagram Account ID | Username | Profile URL |
|---|----------------|---------------------|----------|-------------|
| 1 | **Bacana** | `68d9ea35ca3a4e6b74576ca2` | @bacanabar | https://www.instagram.com/bacanabar/ |
| 2 | **By Rock** | `68d81d8e64332ee3985fe6bb` | @by.rock | http://instagram.com/by.rock |
| 3 | **Espeto Gaúcho** | `68d9ea7dca3a4e6b74576d05` | @espetogauchoes | https://www.instagram.com/espetogauchoes/ |
| 4 | **Lagosta Criativa** | `68f4e1b9669affb4c97916b6` | @lagostacriativa | https://www.instagram.com/lagostacriativa/ |
| 5 | **O Quintal Parrilla** | `68d81f4364332ee3985fe8e1` | @oquintalparrillabar | https://www.instagram.com/oquintalparrillabar/ |
| 6 | **Real Gelateria** | `68d81ba164332ee3985fe44d` | @realgelateriaoficial | https://www.instagram.com/realgelateriaoficial/ |
| 7 | **Seu Quinto** | `1223c84mkl58 2kjdl5` | @seuquinto | (não configurado) |
| 8 | **TERO** | `68d9e9deca3a4e6b74576c2c` | @terobrasaevinho | https://www.instagram.com/terobrasaevinho/ |

---

## 📦 ESTRUTURA DO PAYLOAD RECEBIDO

Quando o Studio Lagosta envia um post, o Zapier recebe este JSON:

```json
{
  "post_type": "post",
  "media_type": "IMAGE",
  "caption": "Texto da legenda do post...",
  "media_urls": [
    "https://exemplo.com/imagem1.jpg",
    "https://exemplo.com/imagem2.jpg"
  ],
  "media_count": 2,
  "alt_text": ["Descrição da imagem 1", "Descrição da imagem 2"],
  "first_comment": "Primeiro comentário opcional",
  "publish_type": "direct",

  "instagram_account_id": "68d81d8e64332ee3985fe6bb",
  "instagram_username": "@by.rock",

  "metadata": {
    "post_id": "clx123abc",
    "project_id": 7,
    "project_name": "By Rock",
    "user_id": "user_abc123"
  }
}
```

### Campos Importantes:
- **`instagram_account_id`**: ID ÚNICO usado para identificar qual conta deve receber o post
- **`post_type`**: Tipo de publicação (`post` = feed, `reels` = reels, `story` = stories)
- **`media_type`**: Tipo de mídia (`IMAGE` = foto única, `VIDEO` = vídeo único, `CAROUSEL_ALBUM` = carrossel 2-10 imagens)
- **`media_count`**: Quantidade de mídias no array
- **`caption`**: Legenda (até 2200 caracteres)
- **`media_urls`**: Array com URLs das imagens/vídeos
- **`first_comment`**: Comentário automático (opcional)
- **`publish_type`**: Tipo de publicação (`direct` = publicar diretamente, `reminder` = criar lembrete no Buffer)

### Mapeamento de Tipos:

| Cenário | post_type | media_type | media_count |
|---------|-----------|------------|-------------|
| Post com 1 foto | `post` | `IMAGE` | 1 |
| Post com 1 vídeo | `post` | `VIDEO` | 1 |
| Carrossel 2-10 fotos | `post` | `CAROUSEL_ALBUM` | 2-10 |
| Reels (vídeo) | `reels` | `VIDEO` | 1 |
| Story (foto) | `story` | `IMAGE` | 1 |

---

## 🔧 INSTRUÇÕES PARA O COPILOT DO ZAPIER

### PASSO 1: Criar o Zap Base

1. **Trigger (Gatilho)**:
   - App: **Webhooks by Zapier**
   - Event: **Catch Hook**
   - Webhook URL já configurado: `https://hooks.zapier.com/hooks/catch/15027917/u108bpv/`

2. **Teste o trigger** enviando um post de teste do Studio Lagosta

---

### PASSO 2: Criar Paths (Caminhos) para Cada Conta

**⚠️ ESTRUTURA ATUALIZADA:**

Você deve criar **8 Paths principais**, um para cada conta Instagram.

Cada Path principal terá **3 SUB-PATHS** para diferentes tipos de mídia:
1. **Sub-Path A**: Carrossel (múltiplas imagens) - `media_type = CAROUSEL_ALBUM`
2. **Sub-Path B**: Vídeo (reels ou post) - `media_type = VIDEO`
3. **Sub-Path C**: Imagem única (post ou story) - `media_type = IMAGE`

**Total:** 8 Paths × 3 Sub-Paths = **24 ações do Buffer**

---

### PASSO 3: Configuração de Cada Path

**TEMPLATE GERAL:**

Cada PATH segue esta estrutura:

1. **Filter Principal:** `instagram_account_id` exactly matches `[ID_DA_CONTA]`

Dentro do Path, criar 3 Sub-Paths:

**Sub-Path A - Carrossel:**
- Filter: `media_type` exactly matches `CAROUSEL_ALBUM`
- Action: Buffer → Create Post → Media Type: `multiple_images`
- Configurar 10 Media Links (de `media_urls__0` até `media_urls__9`)

**Sub-Path B - Vídeo:**
- Filter: `media_type` exactly matches `VIDEO`
- Action: Buffer → Create Post → Media Type: `video`
- Configurar 1 Media Link (`media_urls__0`)

**Sub-Path C - Imagem:**
- Filter: `media_type` exactly matches `IMAGE`
- Action: Buffer → Create Post → Media Type: `image`
- Configurar 1 Media Link (`media_urls__0`)

---

### PASSO 4: Configuração Detalhada por Conta

#### **PATH 1: Bacana**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 68d9ea35ca3a4e6b74576ca2
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post** (ou **Add Post to Queue**)
- Profile: Selecione a conta do Instagram **@bacanabar**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}` (primeira imagem)
  - Se for carousel, adicione: `{{media_urls__1}}`, `{{media_urls__2}}`, etc.
- First Comment: `{{first_comment}}`
- Schedule: **Now** ou **Queue** (dependendo da configuração)

---

#### **PATH 2: By Rock**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 68d81d8e64332ee3985fe6bb
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post**
- Profile: **@by.rock**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

#### **PATH 3: Espeto Gaúcho**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 68d9ea7dca3a4e6b74576d05
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post**
- Profile: **@espetogauchoes**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

#### **PATH 4: Lagosta Criativa**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 68f4e1b9669affb4c97916b6
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post**
- Profile: **@lagostacriativa**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

#### **PATH 5: O Quintal Parrilla**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 68d81f4364332ee3985fe8e1
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post**
- Profile: **@oquintalparrillabar**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

#### **PATH 6: Real Gelateria**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 68d81ba164332ee3985fe44d
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post**
- Profile: **@realgelateriaoficial**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

#### **PATH 7: Seu Quinto**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 1223c84mkl58 2kjdl5
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post**
- Profile: **@seuquinto**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

#### **PATH 8: TERO**

**Filter (Filtro):**
```
Campo: instagram_account_id
Condição: (Text) Exactly matches
Valor: 68d9e9deca3a4e6b74576c2c
```

**Action (Ação) - Buffer:**
- App: **Buffer**
- Action: **Create a Post**
- Profile: **@terobrasaevinho**
- Text: `{{caption}}`
- Media: `{{media_urls__0}}`
- First Comment: `{{first_comment}}`

---

## 🎨 TRATAMENTO DE DIFERENTES TIPOS DE POST

### **Posts Simples (post_type = "post")**
- Use apenas `{{media_urls__0}}` (primeira imagem)

### **Carousels (post_type = "carousel")**
- O Buffer permite até 10 imagens
- Configure múltiplos campos de mídia:
  - Media 1: `{{media_urls__0}}`
  - Media 2: `{{media_urls__1}}`
  - Media 3: `{{media_urls__2}}`
  - ... até Media 10: `{{media_urls__9}}`

### **Stories (post_type = "story")**
- Verificar se Buffer suporta Stories para Instagram
- Se não, considerar usar Make.com ou API direta do Instagram

### **Reels (post_type = "reel")**
- Use `{{media_urls__0}}` (vídeo)
- Verificar suporte do Buffer para Reels

---

## ⚠️ PATH ADICIONAL: Catch-All (Fallback)

Crie um **último Path** sem filtro para capturar posts com IDs não reconhecidos:

**Filter:** (Nenhum - este Path executa se todos os outros falharem)

**Action:**
- App: **Email by Zapier** ou **Slack**
- Enviar notificação: "Post recebido com instagram_account_id não reconhecido: `{{instagram_account_id}}`"

---

## 🧪 TESTE DE CADA PATH

Para cada conta, faça um teste:

1. No Studio Lagosta, selecione o projeto (ex: "By Rock")
2. Crie um post de teste com tipo IMMEDIATE
3. Verifique se:
   - ✅ O Zapier recebeu o webhook
   - ✅ O filtro correto foi acionado
   - ✅ O Buffer criou o post na conta correta
   - ✅ A legenda está correta
   - ✅ A imagem foi anexada
   - ✅ O first_comment aparece (se fornecido)

---

## 📝 NOTAS IMPORTANTES

### Limitações do Buffer
- **Posts agendados**: Se o Studio Lagosta já agenda o horário, use "Post Now" no Buffer
- **Carousels**: Buffer limita a 10 imagens (Studio Lagosta permite 2-10)
- **Stories/Reels**: Verificar compatibilidade do Buffer

### Autenticação
- Certifique-se de conectar cada conta Instagram no Buffer antes de configurar os Paths
- Renove tokens de acesso se expirarem

### Monitoramento
- Configure notificações de erro no Zapier
- Monitore a taxa de sucesso dos posts
- Verifique logs no Studio Lagosta (`PostLog` no banco de dados)

---

## 🔄 FLUXO COMPLETO

```
Studio Lagosta
    ↓
    Cria post no projeto "By Rock"
    ↓
    Scheduler envia para Zapier
    POST https://hooks.zapier.com/hooks/catch/15027917/u108bpv/
    ↓
    Zapier recebe webhook
    ↓
    Verifica instagram_account_id = "68d81d8e64332ee3985fe6bb"
    ↓
    Aciona PATH 2 (By Rock)
    ↓
    Buffer posta em @by.rock no Instagram
    ↓
    Zapier retorna sucesso (200 OK)
    ↓
    Studio Lagosta marca post como SENT
```

---

## 🆘 TROUBLESHOOTING

### Problema: Post não chega no Buffer
**Verificar:**
1. Webhook URL está correta no `.env.local`
2. Filtro do Path está com ID exato
3. Conta Instagram está conectada no Buffer
4. `instagram_account_id` está configurado no projeto

### Problema: Imagem não aparece
**Verificar:**
1. URL da imagem está acessível publicamente
2. Formato suportado (JPG, PNG, MP4)
3. Tamanho não excede limites do Buffer/Instagram

### Problema: Legenda cortada
**Verificar:**
1. Limite de caracteres do Instagram (2200)
2. Encoding UTF-8 para caracteres especiais

---

## 📞 SUPORTE

Em caso de dúvidas:
- Logs do Zapier: https://zapier.com/app/history
- Logs do Studio Lagosta: Tabela `PostLog` no banco de dados
- Buffer Dashboard: https://buffer.com/

---

**Última atualização:** 2025-10-19
**Contas configuradas:** 8
**Webhook URL:** `https://hooks.zapier.com/hooks/catch/15027917/u108bpv/`
