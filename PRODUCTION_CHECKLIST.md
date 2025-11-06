# ✅ Checklist de Deploy para Produção

Guia rápido para colocar o Studio Lagosta no ar com domínio customizado.

---

## 🎯 O Que Você Vai Conseguir

Após seguir este checklist:

✅ Site funcionando em **www.lagostacriativa.com.br**
✅ Landing page pública acessível por todos (logados ou não)
✅ App protegido por autenticação em `/studio`
✅ HTTPS/SSL configurado
✅ Header inteligente (detecta se está logado e mostra botão do Studio)

---

## 📋 Checklist Rápido

### Fase 1: Preparação do Código ✅ CONCLUÍDA

- [x] Middleware criado com roteamento inteligente
- [x] PublicHeader atualizado para detectar login
- [x] Tratamento de erros adicionado (layout, db, analytics)
- [x] Documentação criada

**Status:** Código já está pronto! Agora é só configurar infraestrutura.

---

### Fase 2: Configuração de Infraestrutura

#### 2.1 Database (PostgreSQL)

- [ ] Banco de dados PostgreSQL criado
  - Sugestões: [Neon](https://neon.tech), [Supabase](https://supabase.com), [Railway](https://railway.app)
- [ ] Obter connection string (DATABASE_URL)
- [ ] Testar conexão localmente

**Como testar:**
```bash
# Adicione DATABASE_URL no .env.local
npm run dev
# Se abrir sem erros, está funcionando!
```

#### 2.2 Clerk (Autenticação)

- [ ] Conta criada em [clerk.com](https://clerk.com)
- [ ] Projeto criado no Clerk
- [ ] Obter chaves de **Production**:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`

**Onde encontrar:**
Dashboard do Clerk → Seu projeto → **API Keys** → Production

#### 2.3 Vercel

- [ ] Projeto conectado ao GitHub
- [ ] Build rodando com sucesso
- [ ] Projeto acessível em `*.vercel.app`

---

### Fase 3: Configuração de Domínio

#### 3.1 DNS (Registro.br)

- [ ] Acessar painel do [Registro.br](https://registro.br)
- [ ] Adicionar registro CNAME:
  ```
  Tipo: CNAME
  Nome: www
  Valor: cname.vercel-dns.com.
  TTL: 3600
  ```
- [ ] (Opcional) Adicionar registro A para domínio raiz:
  ```
  Tipo: A
  Nome: @
  Valor: 76.76.21.21
  TTL: 3600
  ```

**Tempo de propagação:** 5 minutos a 48 horas

**Como verificar:**
Use [dnschecker.org](https://dnschecker.org) e busque por `www.lagostacriativa.com.br`

#### 3.2 Vercel Domain

- [ ] Vercel Dashboard → Settings → Domains
- [ ] Adicionar: `www.lagostacriativa.com.br`
- [ ] (Opcional) Adicionar: `lagostacriativa.com.br`
- [ ] Aguardar SSL provisionar (status: Valid)

---

### Fase 4: Variáveis de Ambiente

#### 4.1 Variáveis Essenciais na Vercel

No Vercel Dashboard → Settings → Environment Variables:

- [ ] `DATABASE_URL` = `postgresql://...`
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_...`
- [ ] `CLERK_SECRET_KEY` = `sk_live_...`
- [ ] `NEXT_PUBLIC_APP_URL` = `https://www.lagostacriativa.com.br`

**⚠️ Importante:** Marque **Production** ao adicionar cada variável!

#### 4.2 Clerk Domain Configuration

No [Clerk Dashboard](https://studio.clerk.com):

- [ ] **Domains** → Add domain: `www.lagostacriativa.com.br`
- [ ] **Paths** → Atualizar URLs:
  - Sign-in: `https://www.lagostacriativa.com.br/sign-in`
  - Sign-up: `https://www.lagostacriativa.com.br/sign-up`
  - After sign-in: `https://www.lagostacriativa.com.br/studio`
  - After sign-up: `https://www.lagostacriativa.com.br/studio`

---

### Fase 5: Deploy e Testes

#### 5.1 Commit e Push

```bash
git add .
git commit -m "feat: Add production domain configuration and error handling"
git push origin main
```

#### 5.2 Redeploy na Vercel

- [ ] Vercel Dashboard → Deployments
- [ ] Clicar nos 3 pontinhos → Redeploy
- [ ] Aguardar build completar
- [ ] Verificar status: **Ready**

#### 5.3 Testes Funcionais

##### Teste 1: Landing Page
- [ ] Acessar: `https://www.lagostacriativa.com.br`
- [ ] Verificar: Landing page carrega
- [ ] Verificar: Header mostra "Entrar" e "Cadastre-se"
- [ ] Verificar: Certificado SSL (cadeado verde)

##### Teste 2: Autenticação
- [ ] Clicar em "Cadastre-se"
- [ ] Criar conta ou fazer login
- [ ] Verificar: Redirecionou para `/studio`
- [ ] Verificar: Sidebar e topbar aparecem

##### Teste 3: Landing Page Quando Logado
- [ ] Estando logado, acessar: `https://www.lagostacriativa.com.br`
- [ ] Verificar: Landing page carrega normalmente (não redireciona)
- [ ] Verificar: Header mostra "Ir para o Studio" ao invés de "Entrar"
- [ ] Clicar em "Ir para o Studio"
- [ ] Verificar: Vai para `/studio`

##### Teste 4: Projetos
- [ ] Criar um novo projeto
- [ ] Abrir o projeto
- [ ] Criar um template
- [ ] Verificar: Tudo funciona normalmente

##### Teste 5: Logout
- [ ] Fazer logout
- [ ] Verificar: Redirecionou para home
- [ ] Verificar: Header voltou a mostrar "Entrar"

---

## 🐛 Problemas Comuns

### "Application error" no site

**Causa:** Variáveis de ambiente faltando ou incorretas

**Solução:**
1. Verificar logs: Vercel → Deployments → Functions
2. Confirmar todas as variáveis estão configuradas
3. Fazer redeploy

### Domínio não funciona

**Causa:** DNS não propagou ou configuração incorreta

**Solução:**
1. Verificar em [dnschecker.org](https://dnschecker.org)
2. Aguardar mais tempo (até 48h)
3. Verificar registros DNS estão corretos

### "Too many redirects"

**Causa:** Loop de redirect entre Vercel e DNS

**Solução:**
1. Se usar Cloudflare, desativar proxy (clique na nuvem laranja)
2. Verificar se não há regras de redirect no DNS
3. Limpar cache do navegador

### Login não funciona

**Causa:** Domínio não configurado no Clerk

**Solução:**
1. Adicionar domínio no Clerk Dashboard → Domains
2. Atualizar URLs de redirect no Clerk
3. Limpar cookies e fazer login novamente

---

## 📊 Após Deploy

### SEO e Marketing

- [ ] Configurar Google Search Console
- [ ] Adicionar sitemap.xml
- [ ] Configurar Google Analytics (se ainda não tiver)
- [ ] Configurar Meta Pixel (se for anunciar)
- [ ] Criar robots.txt

### Monitoramento

- [ ] Configurar alertas na Vercel
- [ ] Monitorar logs de erro
- [ ] Acompanhar performance no Analytics
- [ ] Testar em diferentes dispositivos

### Backup

- [ ] Backup do banco de dados configurado
- [ ] Variáveis de ambiente documentadas
- [ ] Código versionado no Git

---

## 🎉 Conclusão

Se todos os checkboxes estão marcados, **parabéns!** Seu Studio Lagosta está no ar em produção!

### Próximos Passos

1. **Marketing**: Divulgar o site nas redes sociais
2. **Conteúdo**: Criar páginas de marketing adicionais
3. **Features**: Continuar desenvolvendo novas funcionalidades
4. **Analytics**: Monitorar comportamento dos usuários

---

## 📚 Documentação Relacionada

- [DOMAIN_SETUP.md](./DOMAIN_SETUP.md) - Guia detalhado de configuração de domínio
- [ENV_VARIABLES.md](./ENV_VARIABLES.md) - Todas as variáveis de ambiente explicadas
- [CLAUDE.md](./CLAUDE.md) - Arquitetura do projeto

---

## 🆘 Precisa de Ajuda?

Se você travou em algum passo:

1. **Logs da Vercel**: Sempre o primeiro lugar para verificar erros
2. **Documentação**:
   - [Vercel Docs](https://vercel.com/docs)
   - [Clerk Docs](https://clerk.com/docs)
   - [Next.js Docs](https://nextjs.org/docs)
3. **Comunidade**:
   - [Vercel Discord](https://vercel.com/discord)
   - [Clerk Discord](https://clerk.com/discord)

---

**Tempo estimado:** 1-2 horas (excluindo propagação DNS)

**Data de criação:** 2025-01-06
**Última atualização:** 2025-01-06
