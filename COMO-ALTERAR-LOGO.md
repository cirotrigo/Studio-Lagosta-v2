# 🎨 Como Alterar a Logo do Site

## 📍 Onde a Logo Aparece

A logo do site aparece em:
- **Header** (topo do site público)
- **Sidebar** (painel admin)
- **Footer**
- **Emails** (templates de email)
- **Metadata** (SEO)

## 🛠️ Método 1: Substituir Arquivos (Mais Rápido)

### Passo 1: Preparar suas logos

Você precisa de **2 versões** da logo:
- **Logo Clara** (`logo-light.svg`) - Para modo escuro (fundo escuro)
- **Logo Escura** (`logo-dark.svg`) - Para modo claro (fundo claro)

**Formatos recomendados:**
- SVG (vetor, melhor qualidade)
- PNG transparente (alternativa)
- Dimensões: 200x50px ou similar (proporcional)

### Passo 2: Substituir os arquivos

Coloque suas logos na pasta `public/`:

```bash
public/
├── logo-light.svg    # Substitua este arquivo
├── logo-dark.svg     # Substitua este arquivo
└── favicon.ico       # Ícone do navegador
```

**Importante:**
- Mantenha os **mesmos nomes** de arquivo
- OU atualize o caminho no `brand-config.ts` (ver Método 2)

### Passo 3: Limpar cache e testar

```bash
# No terminal
npm run dev

# Abra no navegador
# Pressione Ctrl+Shift+R (hard refresh)
```

---

## 🔧 Método 2: Alterar Configuração (Personalizável)

### Passo 1: Adicionar suas logos

Coloque suas logos na pasta `public/`:

```
public/
├── minha-logo-clara.png
├── minha-logo-escura.png
└── meu-icone.ico
```

### Passo 2: Editar configuração

Abra o arquivo: **`src/lib/brand-config.ts`**

Localize a seção `logo`:

```typescript
logo: {
  light: '/logo-light.svg',  // ← Altere aqui
  dark: '/logo-dark.svg',    // ← Altere aqui
}
```

Altere para:

```typescript
logo: {
  light: '/minha-logo-clara.png',
  dark: '/minha-logo-escura.png',
}
```

### Passo 3: (Opcional) Alterar favicon

Localize a seção `icons`:

```typescript
icons: {
  favicon: '/favicon.ico',           // ← Altere aqui
  apple: '/apple-touch-icon.png',    // ← Ícone iOS
  shortcut: '/favicon-16x16.png',    // ← Ícone pequeno
}
```

Altere para seus ícones:

```typescript
icons: {
  favicon: '/meu-icone.ico',
  apple: '/meu-icone-apple.png',
  shortcut: '/meu-icone-16.png',
}
```

---

## 📝 Alterar Outros Dados da Marca

No mesmo arquivo `brand-config.ts`, você pode alterar:

### Nome do Site

```typescript
site: {
  name: 'Lagosta Criativa - Studio',     // ← Nome completo
  shortName: 'Studio Lagosta',           // ← Nome curto (aparece no header)
  description: 'Template Next.js...',    // ← Descrição SEO
}
```

### Informações de Contato

```typescript
support: {
  email: 'suporte@aicoders.academy',     // ← Email de suporte
}
```

### Redes Sociais

```typescript
socials: {
  twitter: '@aicodersacademy',           // ← Twitter/X
  // Adicione outras redes se quiser
}
```

---

## 🎯 Exemplo Completo

### Antes:
```typescript
export const site = {
  name: 'Lagosta Criativa - Studio',
  shortName: 'Studio Lagosta',
  logo: {
    light: '/logo-light.svg',
    dark: '/logo-dark.svg',
  }
}
```

### Depois:
```typescript
export const site = {
  name: 'Minha Empresa',
  shortName: 'Minha Empresa',
  logo: {
    light: '/logos/empresa-light.png',
    dark: '/logos/empresa-dark.png',
  }
}
```

---

## 📂 Estrutura Recomendada de Arquivos

```
public/
├── logos/
│   ├── empresa-light.png      # Logo clara (200x50px)
│   ├── empresa-dark.png       # Logo escura (200x50px)
│   └── empresa-simbolo.svg    # Apenas símbolo (50x50px)
├── icons/
│   ├── favicon.ico            # 32x32px
│   ├── favicon-16x16.png      # 16x16px
│   ├── favicon-32x32.png      # 32x32px
│   ├── apple-touch-icon.png   # 180x180px
│   └── android-chrome-192.png # 192x192px
└── og-image.png               # Open Graph (1200x630px)
```

---

## 🖼️ Especificações de Tamanho

### Logo Principal
- **SVG**: Vetor, sem limite de tamanho
- **PNG**: 200x50px a 400x100px (2x para Retina)
- **Fundo**: Transparente
- **Cor**: Adaptar para modo claro/escuro

### Favicon
- **ICO**: 32x32px, 16x16px (multi-size)
- **PNG**: 16x16, 32x32, 192x192

### Apple Touch Icon
- **PNG**: 180x180px
- **Fundo**: Não transparente (iOS não suporta)

### Open Graph (redes sociais)
- **PNG/JPG**: 1200x630px
- **Peso**: < 1MB
- **Formato**: 1.91:1

---

## ✅ Checklist

- [ ] Criar logo clara (SVG/PNG)
- [ ] Criar logo escura (SVG/PNG)
- [ ] Criar favicon (ICO ou PNG 32x32)
- [ ] Adicionar arquivos em `public/`
- [ ] Atualizar `brand-config.ts`
- [ ] Testar em modo claro e escuro
- [ ] Testar em mobile
- [ ] Verificar favicon no navegador
- [ ] Limpar cache do navegador

---

## 🐛 Problemas Comuns

### Logo não aparece

**Solução:**
1. Verifique se o arquivo está em `public/`
2. Verifique se o caminho no `brand-config.ts` está correto
3. Reinicie o servidor (`npm run dev`)
4. Limpe o cache (Ctrl+Shift+R)

### Logo muito grande/pequena

**Solução:**
Ajuste no componente do Header:

```typescript
// src/components/app/public-header.tsx
<img src={site.logo.dark} className="h-9 w-auto" />
//                                     ↑ Altere aqui (h-8, h-10, h-12, etc)
```

### Logo não troca entre modo claro/escuro

**Solução:**
Verifique se você tem ambas as versões:

```typescript
// Deve ter as duas
logo: {
  light: '/logo-light.svg',   // Para fundo escuro
  dark: '/logo-dark.svg',     // Para fundo claro
}
```

### Favicon não atualiza

**Solução:**
1. Limpe o cache do navegador completamente
2. Teste em aba anônima
3. Aguarde alguns minutos (navegadores fazem cache agressivo)

---

## 🎨 Dicas de Design

### Logo para Dark Mode
- Use cores claras (branco, cinza claro)
- Evite sombras escuras
- Teste em fundo preto

### Logo para Light Mode
- Use cores escuras (preto, cinza escuro)
- Pode ter mais detalhes
- Teste em fundo branco

### SVG vs PNG
- **Use SVG** para logos vetoriais (escalável, menor arquivo)
- **Use PNG** se tiver gradientes complexos ou fotos

### Proporções
- Horizontal: 4:1 ou 5:1 (ex: 200x50px)
- Quadrada: 1:1 (ex: 50x50px) - apenas símbolo

---

## 📞 Precisa de Ajuda?

Se precisar de ajuda para criar as logos:
- Canva.com (templates gratuitos)
- Figma (design profissional)
- Contratar designer no Upwork/Fiverr

---

**Arquivo de configuração:** `src/lib/brand-config.ts`
**Pasta de arquivos:** `public/`
