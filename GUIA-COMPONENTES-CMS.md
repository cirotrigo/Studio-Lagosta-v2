# 📚 Guia Completo - Sistema de Componentes CMS

## 🎯 O Que São Componentes?

**Componentes** são **templates reutilizáveis** que você pode usar para criar páginas de forma rápida. Pense neles como "blocos de construção" pré-configurados.

## 🔄 Diferença: Componentes vs Seções

### **Componentes** (`CMSComponent`)
- São **templates/modelos** armazenados na biblioteca
- **NÃO aparecem** diretamente no site
- Servem como **base** para criar seções
- Ficam salvos em `/admin/content/components`
- Exemplo: Você tem um componente "Hero Padrão" salvo na biblioteca

### **Seções** (`CMSSection`)
- São **instâncias** usadas em páginas específicas
- **APARECEM** no site público
- São criadas **a partir** de componentes ou manualmente
- Fazem parte de uma página específica
- Exemplo: Você adiciona o "Hero Padrão" na Home → isso cria uma **seção**

## 🏗️ Como Funciona o Fluxo

```
┌─────────────────────────┐
│   Biblioteca de         │
│   Componentes           │  ← Templates salvos
│   - Hero Padrão         │
│   - BentoGrid Features  │
│   - FAQ Suporte         │
└───────────┬─────────────┘
            │ Copiar/Usar
            ▼
┌─────────────────────────┐
│   Página: Home          │
│   Seções:               │
│   1. Hero (do template) │  ← Aparece no site
│   2. Features           │
│   3. FAQ                │
└─────────────────────────┘
```

## 📖 Quando Usar Componentes?

### ✅ **USE Componentes quando:**

1. **Criar templates reutilizáveis**
   - Você tem um Hero que quer usar em várias páginas
   - Você quer salvar uma configuração padrão de FAQ
   - Quer manter um padrão de BentoGrid para todas as landing pages

2. **Facilitar criação de páginas**
   - Ao criar uma nova página, escolher um componente pré-configurado
   - Economizar tempo não configurando tudo do zero
   - Criar páginas rapidamente a partir de templates

3. **Manter consistência visual**
   - Todos os CTAs do site seguem o mesmo padrão
   - Todas as seções de FAQ têm o mesmo estilo
   - Headers padronizados em todas as páginas

4. **Biblioteca de recursos**
   - Guardar variações de componentes (Hero A/B, Hero Dark, etc)
   - Equipe pode escolher componentes prontos

### ❌ **NÃO use Componentes quando:**

1. **Quer algo direto no site agora**
   - Vá direto em Pages e crie a seção

2. **Configuração única e específica**
   - Se é algo que só vai usar uma vez, crie a seção diretamente na página

3. **Teste rápido**
   - Para prototipar, crie seções direto

## 💡 Exemplos Práticos

### **Exemplo 1: Criando Biblioteca de Templates (Recomendado)**

**Cenário:** Sua empresa tem 3 tipos de Hero diferentes

```
1. Ir em /admin/content/components
2. Criar componente "Hero - Landing Produto"
   - Configurar título, CTAs, imagem padrão

3. Criar componente "Hero - Landing Serviço"
   - Configurar outro estilo

4. Criar componente "Hero - Institucional"
   - Configurar versão mais formal

5. Ao criar nova página:
   - Escolher qual Hero usar da biblioteca
   - Personalizar texto específico da página
```

### **Exemplo 2: Seção Direta (Caso Único)**

**Cenário:** Página de Black Friday (uma vez por ano)

```
1. Ir em /admin/content/pages
2. Criar "Página Black Friday"
3. Adicionar seção Hero manualmente
4. Configurar tudo específico para Black Friday
5. Não salvar como componente (não vai reutilizar)
```

### **Exemplo 3: Workflow Ideal**

```
┌─────────────────────────────────────────┐
│ 1. Designer cria componentes base       │
│    /admin/content/components            │
│    - Hero Padrão                        │
│    - Features Grid                      │
│    - FAQ Comum                          │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. Marketing cria páginas               │
│    /admin/content/pages                 │
│    - Nova Landing → Usar "Hero Padrão"  │
│    - Customizar só o texto              │
│    - Adicionar "Features Grid"          │
└─────────────────────────────────────────┘
```

## 🎨 Tipos de Componentes Disponíveis

| Tipo | Descrição | Quando Usar | Exemplo de Conteúdo |
|------|-----------|-------------|---------------------|
| **HERO** | Banner principal com título, CTAs, imagem | Topo de páginas landing | Badge, título, descrição, 2 CTAs, imagem de fundo |
| **BENTO_GRID** | Grade de recursos/features | Mostrar funcionalidades do produto | 12 cards com ícones e descrições |
| **FAQ** | Perguntas frequentes | Página de suporte, home, pricing | 4-8 perguntas com respostas |
| **PRICING** | Tabela de preços | Página de planos, home | Integra com planos do banco |
| **AI_STARTER** | Compatibilidade com ferramentas IA | Landing pages tech | Lista de ferramentas, 3 cards |

## 🛠️ Como Usar no Admin

### **Passo 1: Acessar Componentes**
```
URL: /admin/content/components
```

### **Passo 2: Criar Novo Componente**

1. Clique em **"Novo Componente"**
2. Preencha:
   - **Nome**: "Hero - Landing SaaS"
   - **Tipo**: Selecione "HERO"
   - **Descrição**: "Hero padrão para landing pages de SaaS"
   - **Global**: Marque se quiser disponível para todos
3. Configure o conteúdo (JSON):
```json
{
  "badge": {
    "text": "Novo: Template com sistema de créditos",
    "link": "#features"
  },
  "title": "Crie seu SaaS em dias, não meses",
  "description": "Template completo com autenticação, banco de dados e pagamentos",
  "ctas": [
    {
      "text": "Começar Grátis",
      "href": "/sign-up",
      "variant": "default"
    },
    {
      "text": "Ver Demo",
      "href": "#demo",
      "variant": "outline"
    }
  ]
}
```
4. **Salvar**

### **Passo 3: Usar Componente em uma Página**

#### **Opção A: Adicionar Seção a partir de Componente**
1. Vá para `/admin/content/pages`
2. Edite uma página (ex: Home)
3. Clique em **"Adicionar Seção"**
4. Escolha **"Usar componente existente"**
5. Selecione da lista: "Hero - Landing SaaS"
6. Sistema copia o conteúdo automaticamente
7. Personalize se necessário
8. **Salvar página**

#### **Opção B: Criar Seção do Zero (sem componente)**
1. Vá para `/admin/content/pages`
2. Edite uma página
3. Clique em **"Adicionar Seção"**
4. Escolha **"Criar nova seção"**
5. Selecione tipo (HERO, FAQ, etc)
6. Configure tudo manualmente
7. **Salvar página**

### **Passo 4: Editar Componente Existente**

1. Acesse `/admin/content/components`
2. Clique no componente que quer editar
3. Edite o JSON do conteúdo
4. **Salvar**

**⚠️ IMPORTANTE:** Editar um componente **NÃO afeta** seções já criadas a partir dele (elas são cópias independentes).

### **Passo 5: Ver Onde um Componente Está Sendo Usado**

Atualmente, componentes são apenas templates. Para ver onde estão sendo usados:

1. Vá em `/admin/content/pages`
2. Verifique manualmente as páginas

> **Futura feature:** Painel mostrando "Usado em 3 páginas"

## 📝 Estrutura de Conteúdo por Tipo

### **1. HERO**

```json
{
  "badge": {
    "text": "Novidade",
    "link": "#link",
    "icon": "Rocket"  // opcional
  },
  "title": "Título principal do Hero",
  "description": "Descrição que aparece abaixo do título",
  "ctas": [
    {
      "text": "Botão Principal",
      "href": "/sign-up",
      "variant": "default"
    },
    {
      "text": "Botão Secundário",
      "href": "#features",
      "variant": "outline"
    }
  ],
  "demoImage": {
    "light": "https://url-imagem-clara.jpg",
    "dark": "https://url-imagem-escura.jpg",
    "alt": "Screenshot do produto"
  },
  "showLogos": true,
  "logos": [
    {
      "src": "https://url-logo.svg",
      "alt": "Nome da Empresa",
      "width": 80,
      "height": 20
    }
  ]
}
```

### **2. BENTO_GRID**

```json
{
  "title": "Tudo que você precisa",
  "subtitle": "Recursos completos para seu projeto",
  "items": [
    {
      "id": "1",
      "icon": "Sparkles",           // Nome do ícone Lucide
      "iconColor": "text-sky-500",  // Classe Tailwind
      "title": "Feature 1",
      "description": "Descrição da feature",
      "gridArea": "md:[grid-area:1/1/2/2]"  // Posicionamento no grid
    }
    // ... mais 11 itens
  ]
}
```

### **3. FAQ**

```json
{
  "title": "Perguntas Frequentes",
  "subtitle": "Tire suas dúvidas",
  "faqs": [
    {
      "question": "Como funciona?",
      "answer": "Explicação detalhada aqui..."
    }
    // ... mais perguntas
  ]
}
```

### **4. AI_STARTER**

```json
{
  "badge": {
    "text": "Compatível com IA",
    "icon": "Rocket"
  },
  "title": "Funciona com qualquer IA",
  "subtitle": "Use com Cursor, Claude Code, etc",
  "tools": [
    "Cursor AI",
    "Claude Code",
    "GitHub Copilot"
  ],
  "cards": [
    {
      "id": "1",
      "icon": "Sparkles",
      "iconColor": "text-sky-500",
      "title": "Pronto para produção",
      "description": "Auth, DB, payments incluídos"
    }
  ]
}
```

### **5. PRICING**

```json
{
  "title": "Escolha seu plano",
  "subtitle": "Comece grátis, escale quando crescer",
  "displayMode": "from_database"  // Busca planos do Prisma automaticamente
}
```

## 🎓 Casos de Uso Reais

### **Caso 1: Empresa de SaaS com 5 Landing Pages**

**Problema:** Criar 5 landing pages diferentes para 5 produtos

**Solução com Componentes:**

1. **Criar biblioteca de componentes:**
   - `Hero - Produto A` (otimizado para dev tools)
   - `Hero - Produto B` (otimizado para marketing)
   - `Features - Padrão` (12 features genéricas)
   - `FAQ - Técnico` (perguntas dev)
   - `FAQ - Negócio` (perguntas gestão)

2. **Montar páginas rapidamente:**
   - **Landing Produto A**: Hero A + Features Padrão + FAQ Técnico
   - **Landing Produto B**: Hero B + Features Padrão + FAQ Negócio
   - **Landing Produto C**: Hero A + Features Custom + FAQ Técnico

**Resultado:** Criou 5 páginas em 1 hora em vez de 1 dia

### **Caso 2: Teste A/B de Hero**

**Problema:** Testar 2 versões de Hero

**Solução:**

1. Criar 2 componentes:
   - `Hero - Variante A` (CTA "Começar Grátis")
   - `Hero - Variante B` (CTA "Ver Demo")

2. Criar 2 páginas:
   - `/test-a` → Usa Hero Variante A
   - `/test-b` → Usa Hero Variante B

3. Rodar teste A/B no Google Optimize

**Resultado:** Fácil trocar entre versões

### **Caso 3: Agência com Múltiplos Clientes**

**Problema:** Criar sites para 10 clientes diferentes

**Solução:**

1. **Criar componentes base:**
   - `Hero - Startup Tech`
   - `Hero - E-commerce`
   - `Hero - Consultoria`
   - `Features - SaaS`
   - `Features - Ecommerce`

2. **Para cada cliente:**
   - Escolher componentes da biblioteca
   - Customizar cores/textos
   - Criar páginas em minutos

**Resultado:** Padronização + velocidade

## 🔧 Troubleshooting

### **Problema: Editei o componente mas a página não mudou**

**Resposta:** Isso é normal! Componentes são **templates**. Quando você usa um componente em uma página, ele **copia** o conteúdo. Editar o componente não afeta páginas já criadas.

**Solução:**
- Edite a seção diretamente na página
- OU delete a seção e adicione novamente usando o componente atualizado

### **Problema: Não encontro onde está sendo usado um componente**

**Resposta:** Atualmente não há rastreamento automático.

**Solução:**
- Verifique manualmente em `/admin/content/pages`
- OU adicione uma convenção de nome: "Home - Hero" (indica que está na Home)

### **Problema: Quero que todos os Heros atualizem juntos**

**Resposta:** Componentes são cópias independentes. Para atualização global, seria necessário:

**Alternativas:**
1. Usar React Components compartilhados (não CMS)
2. Implementar "linked components" (feature futura)
3. Fazer update manual em cada página

## 🚀 Próximos Passos

Agora que você entende componentes:

1. ✅ Vá para `/admin/content/components`
2. ✅ Explore os componentes existentes
3. ✅ Crie um componente de teste
4. ✅ Use ele em uma página
5. ✅ Edite a seção na página

## 📚 Recursos Adicionais

- **Schema do banco:** `/prisma/schema.prisma`
- **Seed de exemplo:** `/prisma/seed-components.ts`
- **Plano completo:** `/prompts/plano-admin-cms.md`
- **Componentes CMS:** `/src/components/cms/sections/`

---

**Precisa de ajuda?** Entre em contato com o suporte técnico.
