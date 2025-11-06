# 🧪 Mock de Desenvolvimento - Vercel Blob

## ✅ Mock Instalado e Configurado!

O sistema agora está configurado para funcionar **sem** o token do Vercel Blob em ambiente de desenvolvimento.

## 🎯 Como Funciona

Quando o `BLOB_READ_WRITE_TOKEN` está vazio (como está agora), o sistema usa **data URLs** (base64) ao invés de fazer upload para o Vercel Blob.

### Exemplo de URL Mock:
```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
```

## ✨ Vantagens do Mock

- ✅ **Funciona offline** - Não precisa de internet
- ✅ **Gratuito** - Sem custos de storage
- ✅ **Rápido** - Sem upload para servidor externo
- ✅ **Zero configuração** - Funciona out-of-the-box

## ⚠️ Limitações do Mock

- ❌ **Não persistente** - As imagens são base64 inline, não URLs permanentes
- ❌ **Banco de dados grande** - Data URLs são armazenadas no banco (podem crescer muito)
- ❌ **Performance** - Data URLs grandes podem deixar a UI mais lenta
- ❌ **Compartilhamento** - Não é possível compartilhar URLs públicas
- ❌ **Só para desenvolvimento** - **NÃO USE EM PRODUÇÃO!**

## 🚀 Usando o Mock

Basta deixar o `.env.local` como está:

```env
BLOB_READ_WRITE_TOKEN=
```

E tudo funcionará automaticamente!

### Logs do Mock

Quando o mock estiver ativo, você verá warnings no console:

```
⚠️  [renderGeneration] BLOB_READ_WRITE_TOKEN not configured - using DATA URL mock for development
⚠️  [renderGeneration] Mock: Generated data URL (length: 24567)
⚠️  AVISO: Usando mock de desenvolvimento. Configure BLOB_READ_WRITE_TOKEN para produção!
```

## 📦 Para Produção

Quando for para produção, **VOCÊ DEVE** configurar o Vercel Blob:

1. Acesse https://vercel.com/studio
2. Vá para "Storage" → "Create Database" → "Blob"
3. Copie o `BLOB_READ_WRITE_TOKEN`
4. Adicione no `.env.local` (desenvolvimento) ou nas variáveis de ambiente do Vercel (produção)

### Por que?

- ✅ URLs permanentes e públicas
- ✅ Performance otimizada
- ✅ Banco de dados leve (só armazena URLs, não imagens)
- ✅ CDN global do Vercel
- ✅ Compartilhamento fácil

## 🧪 Testando o Mock

1. Acesse: `http://localhost:3001/projects/1/studio`
2. Selecione um template
3. Preencha os campos
4. Clique em "Gerar criativo"
5. Você deve ver:
   - Console com logs do mock
   - Criativo gerado com data URL
   - Imagem exibida normalmente no navegador

## 🔄 Alternando entre Mock e Produção

### Para usar Mock (desenvolvimento):
```env
BLOB_READ_WRITE_TOKEN=
```

### Para usar Vercel Blob (produção):
```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_XXXXXXXXXXXXXXXX
```

## 📊 Comparação

| Característica | Mock (Dev) | Vercel Blob (Prod) |
|----------------|------------|-------------------|
| Configuração | Zero | Requer token |
| Performance | Boa | Excelente |
| Persistência | Banco | CDN |
| Compartilhamento | ❌ | ✅ |
| Custo | Grátis | Grátis até 1GB |
| Ideal para | Desenvolvimento | Produção |

## 💡 Dica

Para testar o fluxo completo com Vercel Blob antes de ir para produção:

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Link projeto
vercel link

# Puxar variáveis
vercel env pull .env.local
```

Isso vai puxar todas as variáveis de ambiente do projeto no Vercel, incluindo o `BLOB_READ_WRITE_TOKEN`.

## 🆘 Problemas?

### "Imagem muito grande no banco"
- Isso é esperado com o mock
- Data URLs podem ter 20-100KB ou mais
- Solução: use Vercel Blob em produção

### "Imagem não carrega"
- Verifique se o navegador suporta data URLs
- Verifique o tamanho da data URL (limite de ~2MB em alguns navegadores)
- Verifique o console por erros

### "Quero desabilitar o mock"
- Basta adicionar qualquer valor no `BLOB_READ_WRITE_TOKEN`
- Se não for um token válido, você receberá erro de upload

## ✅ Status Atual

🟢 **Mock ativo e funcionando!**

Você pode começar a desenvolver imediatamente sem configurar nada. Quando estiver pronto para produção, siga as instruções em `SETUP-BLOB.md`.
