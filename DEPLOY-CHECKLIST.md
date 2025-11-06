# ✅ Checklist de Deploy - Studio Lagosta

Use este checklist para garantir que não esqueceu nada no deploy.

---

## 📋 Pré-Deploy

- [ ] Build local funciona (`npm run build`)
- [ ] TypeScript sem erros (`npm run typecheck`)
- [ ] Lint passa (`npm run lint`)
- [ ] Código commitado no Git
- [ ] Push para GitHub feito

---

## 🗄️ Banco de Dados

### Escolher Provedor

- [ ] **Opção escolhida:**
  - [ ] Vercel Postgres
  - [ ] Neon
  - [ ] Supabase
  - [ ] Outro: _______________

### Configuração

- [ ] Banco criado
- [ ] `DATABASE_URL` copiada
- [ ] Conexão testada (`psql "..."`)

---

## 🚀 Vercel

### Importar Projeto

- [ ] Repositório importado na Vercel
- [ ] Build settings configuradas (padrão Next.js)

### Environment Variables

#### Obrigatórias

- [ ] `DATABASE_URL` - URL do banco
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk
- [ ] `CLERK_SECRET_KEY` - Clerk
- [ ] `CLERK_WEBHOOK_SECRET` - Clerk (configurar depois)
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- [ ] `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- [ ] `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/studio`
- [ ] `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/studio`
- [ ] `NEXT_PUBLIC_APP_URL` - https://seu-app.vercel.app
- [ ] `BLOB_READ_WRITE_TOKEN` - Vercel Blob
- [ ] `ADMIN_EMAILS` - Seu email

#### Opcionais

- [ ] `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Google Drive
- [ ] `NEXT_PUBLIC_GOOGLE_API_KEY` - Google Drive
- [ ] `OPENAI_API_KEY` - AI Chat (opcional)
- [ ] `ANTHROPIC_API_KEY` - AI Chat (opcional)

### Deploy

- [ ] Primeiro deploy feito
- [ ] Deploy concluído sem erros
- [ ] URL gerada: _______________

---

## 💾 Configuração de Storage

### Vercel Blob

- [ ] Blob Storage criado
- [ ] `BLOB_READ_WRITE_TOKEN` copiado
- [ ] Token adicionado nas env vars
- [ ] Redeploy feito

---

## 🗃️ Schema do Banco

### Aplicar Schema

- [ ] Método escolhido:
  - [ ] `prisma db push`
  - [ ] `prisma migrate deploy`
  - [ ] SQL dump

- [ ] Schema aplicado
- [ ] Tabelas criadas (verificado no Prisma Studio)

### Importar Configurações (Opcional)

- [ ] Backup feito (`npm run db:backup`)
- [ ] AdminSettings importado
- [ ] Plans importado

---

## 🔐 Clerk Configuration

### Webhook

- [ ] Webhook criado no Clerk Dashboard
- [ ] URL: `https://seu-app.vercel.app/api/webhooks/clerk`
- [ ] Events selecionados:
  - [ ] user.created
  - [ ] user.updated
  - [ ] user.deleted
- [ ] Signing Secret copiado
- [ ] `CLERK_WEBHOOK_SECRET` adicionado na Vercel
- [ ] Redeploy feito

### Teste

- [ ] Webhook testado (Send Test Event)
- [ ] Logs verificados (sem erros)

---

## ✅ Verificação Pós-Deploy

### Site

- [ ] Landing page carrega
- [ ] Sem erros no console do browser
- [ ] Imagens carregam
- [ ] Links funcionam

### Autenticação

- [ ] Sign up funciona
- [ ] Email de verificação recebido
- [ ] Login funciona
- [ ] Usuário criado no banco (verificado)
- [ ] CreditBalance criado automaticamente

### Dashboard

- [ ] `/studio` acessível
- [ ] Pode criar projeto
- [ ] Upload de logo funciona
- [ ] Upload de elementos funciona
- [ ] Upload de fontes funciona

### Admin

- [ ] `/admin` acessível
- [ ] Ver lista de usuários
- [ ] Ajustar créditos funciona
- [ ] `/admin/settings/features` acessível
- [ ] `/admin/settings/plans` acessível

### Funcionalidades Core

- [ ] Criar projeto
- [ ] Criar template
- [ ] Gerar criativo
- [ ] Download de criativo

### Integrações (Opcionais)

- [ ] Google Drive conectado
- [ ] Backup no Drive funciona
- [ ] Make.com webhooks configurados
- [ ] AI Chat funciona

---

## 🔍 Verificação no Banco

```bash
# Conectar
psql "DATABASE_URL"

# Verificar tabelas
\dt

# Verificar usuários
SELECT COUNT(*) FROM "User";

# Verificar créditos
SELECT u.email, cb."creditsRemaining"
FROM "CreditBalance" cb
JOIN "User" u ON cb."userId" = u.id;
```

- [ ] Tabelas criadas (15 tabelas)
- [ ] Usuário existe após sign up
- [ ] CreditBalance existe
- [ ] Plans existem (se importou)

---

## 📊 Monitoramento

### Vercel

- [ ] Deploy logs verificados (sem erros)
- [ ] Functions logs verificados
- [ ] Analytics habilitado

### Banco de Dados

- [ ] Prisma Studio funciona
- [ ] Queries rodando sem erros
- [ ] Backup configurado (se necessário)

---

## 🎯 Configuração Inicial

### Admin Settings

- [ ] `/admin/settings/features` configurado
  - [ ] Custos de features definidos
  - [ ] Salvou alterações

- [ ] `/admin/settings/plans` configurado
  - [ ] Sincronizou com Clerk
  - [ ] Planos visíveis
  - [ ] Créditos configurados

### Billing (Opcional)

- [ ] Planos criados no Clerk
- [ ] Preços configurados
- [ ] Checkout funciona
- [ ] Webhooks de pagamento configurados

---

## 🌐 Domínio (Opcional)

- [ ] Domínio customizado adicionado
- [ ] DNS configurado
- [ ] SSL ativo
- [ ] Redirecionamentos configurados
- [ ] `NEXT_PUBLIC_APP_URL` atualizado

---

## 📱 Testes Finais

### Desktop

- [ ] Chrome
- [ ] Firefox
- [ ] Safari

### Mobile

- [ ] iOS Safari
- [ ] Android Chrome

### Funcionalidades

- [ ] Sign up/Login
- [ ] Criar projeto
- [ ] Upload de arquivos
- [ ] Gerar criativo
- [ ] Download
- [ ] Admin dashboard

---

## 🚨 Troubleshooting

### Se algo não funcionar:

1. [ ] Verificar logs da Vercel
2. [ ] Verificar environment variables
3. [ ] Verificar webhook do Clerk
4. [ ] Testar conexão com banco
5. [ ] Verificar BLOB_READ_WRITE_TOKEN

### Logs para Verificar

- [ ] Vercel Deployment Logs
- [ ] Vercel Function Logs
- [ ] Browser Console
- [ ] Clerk Dashboard → Logs
- [ ] Database query logs

---

## 📝 Pós-Deploy

### Documentação

- [ ] Atualizar README com URL de produção
- [ ] Documentar credenciais (1Password, etc)
- [ ] Criar runbook de operações

### Segurança

- [ ] Secrets rotacionados (se necessário)
- [ ] Backups configurados
- [ ] Monitoring de erros configurado

### Marketing

- [ ] Analytics configurado
- [ ] SEO otimizado
- [ ] Open Graph tags configuradas
- [ ] Sitemap gerado

---

## ✅ Deploy Completo!

**Data do deploy:** _______________

**URL de produção:** _______________

**Versão:** _______________

**Notas:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

## 📚 Recursos

- **Guia completo:** `DEPLOY-GUIDE.md`
- **Deploy rápido:** `DEPLOY-QUICKSTART.md`
- **Banco de dados:** `DEPLOY-DATABASE-MIGRATION.md`
- **Troubleshooting:** `VERCEL-DEPLOY.md`

---

**🎉 Parabéns pelo deploy!**
