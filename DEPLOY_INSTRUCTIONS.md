# 🚀 INSTRUÇÕES DE DEPLOY - CORREÇÃO URGENTE

## ⚡ Passo 1: Adicionar Campo no Banco de Produção (Neon)

1. **Acesse o Neon Dashboard**
   - Entre em: https://console.neon.tech/
   - Selecione seu projeto/database

2. **Abra o SQL Editor**
   - Clique em "SQL Editor" no menu lateral
   - Cole TODO o conteúdo do arquivo `EXECUTE_IN_PRODUCTION.sql`
   - Clique em "Run"

3. **Verifique o Resultado**
   - Deve aparecer uma tabela mostrando:
   ```
   column_name          | data_type                   | is_nullable
   processingStartedAt  | timestamp without time zone | YES
   ```
   - Se aparecer isso, o campo foi criado com sucesso ✅

## ⚡ Passo 2: Deploy do Código Atualizado

### Opção A: Deploy via Vercel (Recomendado)

```bash
# Fazer push para o GitHub
git add .
git commit -m "fix: adicionar campo processingStartedAt e corrigir duplicação de posts"
git push origin main

# O Vercel fará deploy automático
```

### Opção B: Deploy Manual

```bash
# Build já foi gerado
# A pasta .next/ contém o código compilado pronto
# Faça upload da pasta .next/ para seu servidor
```

## ✅ Verificação Final

Após o deploy, teste:
1. Criar um novo agendamento
2. Verificar que não há erro 500
3. Posts devem ser publicados normalmente

## 📋 Resumo das Correções Aplicadas

- ✅ Campo `processingStartedAt` para prevenir duplicatas
- ✅ Timeout aumentado de 10 para 30 minutos
- ✅ Rate limiting entre posts (2s delay)
- ✅ Idempotência em webhooks
- ✅ Botão do Instagram para posts publicados
- ✅ Tratamento de erros do YouTube

## ⚠️ IMPORTANTE

**Execute o SQL ANTES de fazer o deploy!** O código espera que o campo exista no banco.