instale# Configuração do Vercel Blob Storage

O Studio Lagosta v2 utiliza o Vercel Blob para armazenar imagens geradas (criativos e thumbnails).

## ⚠️ Erro Comum

Se você está vendo o erro:
```
BLOB_READ_WRITE_TOKEN not configured
```

Isso significa que você precisa configurar o token do Vercel Blob.

## 🔧 Como Configurar

### Opção 1: Usando Vercel (Recomendado para produção)

1. **Acesse o Vercel Dashboard**
   - Vá para https://vercel.com/dashboard
   - Selecione seu projeto

2. **Crie um Blob Store**
   - No menu lateral, clique em "Storage"
   - Clique em "Create Database"
   - Selecione "Blob"
   - Dê um nome (ex: "studio-lagosta-blobs")
   - Clique em "Create"

3. **Copie o Token**
   - Após criar, você verá as variáveis de ambiente
   - Copie o valor de `BLOB_READ_WRITE_TOKEN`

4. **Configure no Projeto Local**
   - Abra o arquivo `.env.local`
   - Cole o token:
   ```env
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_XXXXXXXXXXXXXXXX
   ```

5. **Reinicie o servidor**
   ```bash
   npm run dev
   ```

### Opção 2: Usando Vercel CLI (Desenvolvimento Local)

1. **Instale o Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Faça login**
   ```bash
   vercel login
   ```

3. **Link o projeto**
   ```bash
   vercel link
   ```

4. **Puxe as variáveis de ambiente**
   ```bash
   vercel env pull .env.local
   ```

### Opção 3: Mock para Desenvolvimento (Temporário)

Se você só quer testar o fluxo sem upload real:

1. **Instale o mock**
   ```bash
   npm install --save-dev @vercel/blob-mock
   ```

2. **Configure no `.env.local`**
   ```env
   # Use uma URL mock para desenvolvimento
   BLOB_READ_WRITE_TOKEN=vercel_blob_mock_token_dev_only
   ```

3. **Crie um mock no código** (não recomendado para produção)

## 📝 Variáveis de Ambiente Necessárias

Adicione ao seu `.env.local`:

```env
# Vercel Blob Storage (OBRIGATÓRIO)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_XXXXXXXXXXXXXXXX

# Opcional
BLOB_MAX_SIZE_MB=25
```

## ✅ Verificar Configuração

Após configurar, tente gerar um criativo no Studio. Você deve ver logs no console:

```
[renderGeneration] Starting generation: clxxxxx
[renderGeneration] Template dimensions: { width: 1080, height: 1920 }
[renderGeneration] Importing CanvasRenderer...
[renderGeneration] CanvasRenderer imported successfully
[renderGeneration] Creating renderer...
[renderGeneration] Rendering design...
[renderGeneration] Design rendered, buffer size: 123456
[renderGeneration] Uploading to Vercel Blob...
[renderGeneration] Upload successful: https://xxxxx.vercel-storage.com/...
```

## 🆘 Problemas Comuns

### "BLOB_READ_WRITE_TOKEN not configured"
- Certifique-se de que o token está no `.env.local`
- Certifique-se de que não há espaços em branco
- Reinicie o servidor após adicionar o token

### "Failed to upload to Blob"
- Verifique se o token está correto
- Verifique se você tem créditos no Vercel (plano gratuito tem limites)
- Verifique sua conexão com a internet

### "Canvas rendering failed"
- Certifique-se de que `@napi-rs/canvas` está instalado: `npm list @napi-rs/canvas`
- No macOS, pode precisar de: `brew install pkg-config cairo pango libpng jpeg giflib librsvg`
- No Linux: `apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`

## 📚 Documentação Oficial

- Vercel Blob: https://vercel.com/docs/storage/vercel-blob
- @napi-rs/canvas: https://github.com/Brooooooklyn/canvas

## 💡 Dica

Para desenvolvimento, você pode usar o Vercel Blob gratuitamente (1GB de storage). Para produção, avalie os custos em: https://vercel.com/docs/storage/vercel-blob/usage-and-pricing
