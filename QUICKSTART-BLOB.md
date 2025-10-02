# 🚀 Guia Rápido: Configurar Vercel Blob

## Para que serve?

O Vercel Blob é usado para armazenar:
- Logos dos projetos
- Elementos gráficos
- Fontes customizadas
- Criativos gerados (quando não usa Google Drive)

## ⚡ Setup Rápido (5 minutos)

### 1. Crie uma conta no Vercel (se não tiver)

```bash
# Instale o Vercel CLI
npm i -g vercel

# Faça login
vercel login
```

### 2. Crie um Blob Storage

**Opção A: Via Dashboard (Mais Fácil)**
1. Acesse https://vercel.com/dashboard
2. Crie um projeto novo ou selecione um existente
3. Vá em **Storage** → **Create** → **Blob**
4. Dê um nome (ex: `studio-lagosta-blob`)
5. **Copie o token** que aparece (`BLOB_READ_WRITE_TOKEN`)

**Opção B: Via CLI**
```bash
# Link o projeto
vercel link

# Criar Blob storage
vercel storage create blob studio-lagosta-blob

# Ver o token
vercel env pull .env.local
```

### 3. Configure o Token

Abra o arquivo `.env` e cole o token:

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 4. Reinicie o servidor

```bash
npm run dev
```

## ✅ Teste

Agora tente fazer upload de um logo no projeto. Deve funcionar!

## 💰 Custos

- **Plano Gratuito**: 1GB de storage + 100GB de bandwidth
- **Suficiente para**: ~10.000 logos ou ~5.000 criativos
- **Preço depois**: $0.15/GB armazenado + $0.10/GB transferido

## 🆘 Problemas?

**"BLOB_READ_WRITE_TOKEN não configurado"**
- Certifique-se que o token está no `.env` (não `.env.example`)
- Reinicie o servidor: `npm run dev`

**"Failed to upload"**
- Verifique se o token está correto (copie novamente)
- Verifique se você tem créditos no Vercel

**Geração de criativos funciona, mas logos não**
- Criativos têm fallback para data URL
- Logos precisam do token obrigatoriamente
- Configure o token seguindo os passos acima

## 📚 Mais Informações

- Documentação completa: `SETUP-BLOB.md`
- Vercel Blob Docs: https://vercel.com/docs/storage/vercel-blob
