# 📖 Studio Lagosta v2 - Deploy Guide Index

## 🎯 Escolha seu Guia

### Primeiro Deploy?

👉 **[DEPLOY-GUIDE.md](DEPLOY-GUIDE.md)** - Guia completo passo a passo (COMECE AQUI!)

### Quer fazer deploy rápido?

👉 **[DEPLOY-QUICKSTART.md](DEPLOY-QUICKSTART.md)** - Deploy em 5 minutos

### Precisa migrar banco de dados?

👉 **[DEPLOY-DATABASE-MIGRATION.md](DEPLOY-DATABASE-MIGRATION.md)** - Como migrar dados do local para produção

### Quer um checklist?

👉 **[DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md)** - Checklist completo de deploy

---

## 📚 Outros Guias

### Configuração

- **[SETUP-BLOB.md](SETUP-BLOB.md)** - Configurar Vercel Blob Storage
- **[QUICKSTART-BLOB.md](QUICKSTART-BLOB.md)** - Blob em 5 minutos
- **[VERCEL-DEPLOY.md](VERCEL-DEPLOY.md)** - Detalhes técnicos da Vercel

### Documentação do Projeto

- **[AGENTS.md](AGENTS.md)** - Índice de documentação para agentes
- **[CLAUDE.md](CLAUDE.md)** - Guia para Claude Code
- **[docs/README.md](docs/README.md)** - Documentação completa

---

## 🚀 Deploy Rápido (TL;DR)

```bash
# 1. Verificar se está tudo ok
npm run deploy:check

# 2. Fazer backup das configs (opcional)
npm run db:backup

# 3. Criar banco de dados
# Escolha: Vercel Postgres, Neon, ou Supabase
# Copie a DATABASE_URL

# 4. Deploy
git push origin main
# Depois importar na Vercel: https://vercel.com/new

# 5. Configurar variáveis na Vercel
# Ver DEPLOY-GUIDE.md seção "Environment Variables"

# 6. Aplicar schema ao banco
DATABASE_URL="..." npx prisma db push

# 7. Configurar webhook do Clerk
# URL: https://seu-app.vercel.app/api/webhooks/clerk

# 8. Testar!
# Acesse seu app e faça sign up
```

---

## ❓ FAQ

### Qual banco de dados usar?

- **Neon** - Gratuito para sempre, rápido, recomendado
- **Vercel Postgres** - Integração fácil com Vercel
- **Supabase** - Gratuito, tem outras features

### Preciso migrar meus dados locais?

**Não necessariamente.** Para produção, é melhor começar limpo.

Se quiser migrar configs:
```bash
npm run db:backup
# Ver DEPLOY-DATABASE-MIGRATION.md
```

### O build falha com erro de database

**Já corrigido!** A landing page não acessa mais o banco durante build.

Se ainda der erro, veja: [DEPLOY-GUIDE.md#troubleshooting](DEPLOY-GUIDE.md#troubleshooting)

### Como configurar BLOB_READ_WRITE_TOKEN?

1. Vercel Dashboard → Storage → Create → Blob
2. Copie o token
3. Adicione nas environment variables

Ver: [QUICKSTART-BLOB.md](QUICKSTART-BLOB.md)

### Webhook do Clerk não funciona

1. Verificar URL: `https://seu-app.vercel.app/api/webhooks/clerk`
2. Verificar secret nas env vars
3. Testar no Clerk Dashboard

Ver: [DEPLOY-GUIDE.md#webhook-do-clerk](DEPLOY-GUIDE.md#configuração-pós-deploy)

---

## 🎯 Estrutura do Projeto

```
Studio-Lagosta-v2/
├── DEPLOY-GUIDE.md           ⭐ Guia completo de deploy
├── DEPLOY-QUICKSTART.md      ⚡ Deploy em 5 minutos
├── DEPLOY-DATABASE-MIGRATION.md  🗄️ Migração de dados
├── DEPLOY-CHECKLIST.md       ✅ Checklist de verificação
├── SETUP-BLOB.md             📦 Configurar Blob Storage
├── QUICKSTART-BLOB.md        ⚡ Blob em 5 minutos
├── VERCEL-DEPLOY.md          🔧 Detalhes técnicos
├── AGENTS.md                 🤖 Índice para agentes
├── CLAUDE.md                 🧠 Guia Claude Code
├── docs/                     📚 Documentação completa
├── scripts/
│   ├── backup-configs.sh     💾 Backup de configs
│   └── pre-deploy-check.sh   ✅ Verificação pré-deploy
└── src/                      💻 Código fonte
```

---

## 🛠️ Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Iniciar dev server
npm run typecheck        # Verificar TypeScript
npm run lint             # Verificar código

# Database
npm run db:push          # Aplicar schema
npm run db:studio        # Abrir Prisma Studio
npm run db:backup        # Backup de configs

# Deploy
npm run deploy:check     # Verificar tudo antes do deploy
npm run deploy:vercel    # Deploy para Vercel
npm run build            # Build de produção
```

---

## 📞 Precisa de Ajuda?

1. **Problemas de build?** → [DEPLOY-GUIDE.md#troubleshooting](DEPLOY-GUIDE.md#troubleshooting)
2. **Erro de database?** → [DEPLOY-DATABASE-MIGRATION.md](DEPLOY-DATABASE-MIGRATION.md)
3. **Webhook não funciona?** → [DEPLOY-GUIDE.md#webhook-do-clerk](DEPLOY-GUIDE.md#configuração-pós-deploy)
4. **Dúvida geral?** → [DEPLOY-GUIDE.md](DEPLOY-GUIDE.md)

---

## ✅ Status do Projeto

- ✅ Build local funcionando
- ✅ TypeScript sem erros
- ✅ Database local configurado
- ✅ Pronto para deploy
- ✅ Documentação completa
- ✅ Scripts de automação

---

## 🎉 Próximos Passos

1. Leia: [DEPLOY-GUIDE.md](DEPLOY-GUIDE.md)
2. Execute: `npm run deploy:check`
3. Crie banco de dados (Neon/Vercel/Supabase)
4. Deploy na Vercel
5. Configure environment variables
6. Aplique schema: `prisma db push`
7. Configure webhook do Clerk
8. Teste! 🚀

---

**Boa sorte com o deploy! 🚀**
