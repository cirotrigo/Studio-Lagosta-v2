# ⚙️ Sistema de Configurações do Site

## 📍 O que é?

Um **painel administrativo** completo para personalizar todas as configurações do site dinamicamente, sem precisar editar código.

## 🎯 O que você pode configurar?

### 🏷️ Marca
- Nome do Site
- Nome Curto (aparece no header)
- Descrição geral

### 🎨 Logos e Ícones
- Logo Clara (dark mode)
- Logo Escura (light mode)
- Favicon
- Apple Touch Icon

### 📊 SEO
- Meta Title
- Meta Description
- Palavras-chave
- Imagem Open Graph (compartilhamento em redes sociais)

### 📧 Contato
- Email de suporte

### 📱 Redes Sociais
- Twitter/X
- Facebook
- Instagram
- LinkedIn
- GitHub

### 📈 Analytics
- Google Tag Manager ID
- Google Analytics ID
- Facebook Pixel ID

## 🚀 Como Usar

### 1. Acessar Configurações

No painel admin, vá para:

```
/admin/site-settings
```

Ou pelo menu lateral:
**Configurações → Configurações do Site**

### 2. Editar Configurações

A página tem **5 abas**:

#### 📌 **Marca**
- Nome completo e nome curto
- Descrição do site

#### 🖼️ **Logos**
- Caminhos para logos clara/escura
- Favicon e ícones

#### 🔍 **SEO**
- Meta tags
- Palavras-chave
- Imagem OG

#### 📬 **Contato**
- Email de suporte

#### 🌐 **Redes & Analytics**
- Links sociais
- IDs de tracking

### 3. Salvar

Clique em **"Salvar Configurações"** no topo da página.

As alterações são aplicadas **imediatamente** em todo o site!

## 💡 Exemplos de Uso

### Exemplo 1: Alterar Logo

```
1. Ir em /admin/site-settings
2. Clicar na aba "Logos"
3. Alterar:
   - Logo Clara: /minha-logo-light.png
   - Logo Escura: /minha-logo-dark.png
4. Salvar
```

Logo atualizada em todo o site automaticamente!

### Exemplo 2: Alterar Nome do Site

```
1. Ir em /admin/site-settings
2. Aba "Marca"
3. Alterar:
   - Nome do Site: "Minha Empresa"
   - Nome Curto: "MinhaEmp"
4. Salvar
```

Nome atualizado em:
- Header
- Footer
- Meta tags
- Título das páginas

### Exemplo 3: Adicionar Google Analytics

```
1. Ir em /admin/site-settings
2. Aba "Redes & Analytics"
3. Preencher:
   - Google Analytics ID: G-XXXXXXXXXX
4. Salvar
```

Analytics configurado automaticamente!

## 🔧 Arquitetura Técnica

### Modelo do Banco (Prisma)

```prisma
model SiteSettings {
  id          String   @id @default(cuid())

  // Brand
  siteName    String
  shortName   String
  description String

  // Logos
  logoLight   String
  logoDark    String
  favicon     String
  appleIcon   String?

  // SEO
  metaTitle   String?
  metaDesc    String?
  ogImage     String?
  keywords    String[]

  // Contact
  supportEmail String?

  // Social
  twitter     String?
  facebook    String?
  instagram   String?
  linkedin    String?
  github      String?

  // Analytics
  gtmId       String?
  gaId        String?
  facebookPixelId String?

  isActive    Boolean
  updatedBy   String
  createdAt   DateTime
  updatedAt   DateTime
}
```

### API Endpoints

- **GET** `/api/admin/settings` - Buscar configurações ativas
- **POST** `/api/admin/settings` - Criar novas configurações
- **PUT** `/api/admin/settings` - Atualizar configurações existentes

### Hooks React Query

```typescript
// Buscar configurações
const { data } = useSiteSettings()

// Atualizar configurações
const updateMutation = useUpdateSiteSettings()
await updateMutation.mutateAsync(newSettings)
```

### Integração no Site

As configurações substituem o antigo `brand-config.ts` estático.

**Antes (estático):**
```typescript
// src/lib/brand-config.ts
export const site = {
  name: 'Studio Lagosta',  // ← Hard-coded
  logo: {
    light: '/logo-light.svg'  // ← Hard-coded
  }
}
```

**Agora (dinâmico):**
```typescript
// Busca do banco de dados
const settings = await getSiteSettings()

// Usa configurações dinâmicas
site.name = settings.siteName
site.logo.light = settings.logoLight
```

## 📦 Arquivos Criados

### Database
- `prisma/schema.prisma` - Modelo `SiteSettings`
- `prisma/migrations/xxx_add_site_settings/` - Migration
- `prisma/seed-site-settings.ts` - Seed inicial

### Backend
- `src/lib/site-settings.ts` - Helper functions
- `src/app/api/admin/settings/route.ts` - API routes

### Frontend
- `src/app/admin/site-settings/page.tsx` - Página de configurações
- `src/hooks/admin/use-site-settings.ts` - React Query hooks

### Sidebar
- `src/components/admin/admin-sidebar.tsx` - Link adicionado

## 🎯 Versionamento

O sistema mantém histórico de configurações:

- Cada save cria um **novo registro**
- Configurações antigas são desativadas (`isActive: false`)
- Apenas uma configuração ativa por vez
- Permite rollback se necessário

## ⚡ Performance

- **Cache**: React Query cacheia configurações por 5 minutos
- **ISR**: Páginas públicas podem usar ISR para performance
- **Validação**: Schemas Zod para garantir dados corretos

## 🔐 Segurança

- Apenas **admins** podem editar
- Verificação via `isAdmin()` helper
- Emails de admin configurados em `.env`:

```env
ADMIN_EMAILS=seu@email.com,outro@email.com
# OU
ADMIN_USER_IDS=user_xxx,user_yyy
```

## 🐛 Troubleshooting

### Não consigo acessar as configurações

**Problema:** Página retorna 403 Forbidden

**Solução:**
1. Verifique se está logado como admin
2. Configure `.env`:
```env
ADMIN_EMAILS=seu@email.com
```
3. Reinicie o servidor

### Configurações não aparecem

**Problema:** Formulário vazio

**Solução:**
1. Rodar seed:
```bash
npx tsx prisma/seed-site-settings.ts
```

### Erro ao salvar configurações

**Problema:** Erro ao clicar em "Salvar Configurações"

**Solução:**
1. Verifique se todos os campos obrigatórios estão preenchidos:
   - Nome do Site
   - Nome Curto
   - Descrição
2. Verifique os logs do console (F12 → Console)
3. Se o erro persistir, rode o seed novamente:
```bash
npx tsx prisma/seed-site-settings.ts
```
4. Limpe o cache do React Query (recarregue a página)

### Mudanças não aplicam

**Problema:** Salvei mas site não mudou

**Solução:**
1. Limpe cache do navegador (Ctrl+Shift+R)
2. Reinicie servidor dev
3. Verifique se há erros no console

## 🚀 Próximos Passos

### Features Futuras (opcional)

1. **Upload de imagens**
   - Fazer upload direto de logos
   - Integrar com Media Library

2. **Preview em tempo real**
   - Ver mudanças antes de salvar

3. **Temas customizáveis**
   - Cores primárias/secundárias
   - Fontes

4. **Multi-idioma**
   - Configurações por idioma

5. **Rollback visual**
   - Ver histórico de configurações
   - Restaurar versões antigas

## 📚 Recursos

- **Painel Admin:** `/admin/site-settings`
- **API Docs:** Ver `route.ts` para endpoints
- **Schema:** `prisma/schema.prisma`

---

**Configurações do site agora são 100% dinâmicas e editáveis pelo admin!** 🎉
