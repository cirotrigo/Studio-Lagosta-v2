# 🧪 Guia de Testes - Studio Lagosta V2

## 📋 Pré-requisitos

Antes de começar os testes, certifique-se de que:

1. ✅ Database está rodando (PostgreSQL)
2. ✅ Variáveis de ambiente configuradas (`.env.local`)
3. ✅ Dependências instaladas (`npm install`)
4. ✅ Prisma client gerado (`npm run db:push`)

## 🚀 Iniciando o Servidor de Desenvolvimento

```bash
npm run dev
```

O servidor estará disponível em: `http://localhost:3000`

## 🔐 Autenticação

1. Acesse: `http://localhost:3000`
2. Faça login ou crie uma conta via Clerk
3. Você será redirecionado para `/studio`

## 📁 Rotas Disponíveis

### Páginas Principais

| Rota | Descrição |
|------|-----------|
| `/studio` | Dashboard principal |
| `/projects` | **Lista de projetos** |
| `/projects/[id]` | **Detalhes do projeto com templates** |
| `/templates/[id]/editor` | **Editor visual de templates** |
| `/billing` | Gerenciamento de assinatura |
| `/ai-chat` | Chat com IA |

### APIs Implementadas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/projects` | Listar projetos do usuário |
| POST | `/api/projects` | Criar novo projeto |
| DELETE | `/api/projects/[id]` | Deletar projeto |
| GET | `/api/projects/[id]/templates` | Listar templates do projeto |
| POST | `/api/projects/[id]/templates` | Criar template no projeto |
| GET | `/api/templates/[id]` | Obter detalhes do template |
| PUT | `/api/templates/[id]` | Atualizar template |
| DELETE | `/api/templates/[id]` | Deletar template |
| POST | `/api/templates/[id]/thumbnail` | Gerar thumbnail |
| POST | `/api/projects/[id]/generations` | Gerar criativo |
| POST | `/api/projects/[id]/generations/carousel` | Gerar carrossel |

---

## 🧪 Fluxo de Teste Completo

### TESTE 1: Criar Projeto

1. **Acesse**: `http://localhost:3000/projects`

2. **Ação**: Clique em "Novo Projeto"

3. **Preencha**:
   - Nome: "Teste Campanha Verão"
   - Descrição: "Projeto de teste para campanha de verão"

4. **Resultado Esperado**:
   - ✅ Modal fecha automaticamente
   - ✅ Toast de sucesso aparece
   - ✅ Novo projeto aparece na lista
   - ✅ Contadores mostram "0 templates" e "0 criativos"

---

### TESTE 2: Criar Template

1. **Acesse**: Clique em "Abrir" no projeto criado
   - URL: `http://localhost:3000/projects/1` (id pode variar)

2. **Ação**: Clique em "Novo Template"

3. **Preencha**:
   - Nome: "Story Promo Verão"
   - Tipo: "Story (9:16)"
   - Dimensões: `1080x1920` (preenchido automaticamente)

4. **Resultado Esperado**:
   - ✅ Modal fecha automaticamente
   - ✅ Toast de sucesso
   - ✅ Novo template aparece no grid
   - ✅ Card do template mostra nome e tipo

5. **Crie mais templates**:
   - "Feed Produto" - Feed (4:5)
   - "Post Quadrado" - Quadrado (1:1)

---

### TESTE 3: Editor Visual de Template

1. **Acesse**: Clique no ícone de "Editar" (✏️) em um template
   - URL: `http://localhost:3000/templates/1/editor`

2. **Interface do Editor**:
   ```
   ┌────────────────────────────────────────────────┐
   │  Toolbar: [Salvar] [+Text] [+Image] [Preview] │
   ├──────┬──────────────────────────┬──────────────┤
   │      │                          │              │
   │ Layers│      Canvas              │ Properties   │
   │ Panel │   (Área de Trabalho)     │    Panel     │
   │      │                          │              │
   └──────┴──────────────────────────┴──────────────┘
   ```

3. **TESTE 3.1: Adicionar Layer de Texto**

   **Ação**: Clique em "+ Text" na toolbar

   **Resultado Esperado**:
   - ✅ Nova layer "Text Layer" aparece no Layers Panel
   - ✅ Layer aparece no canvas (central)
   - ✅ Layer está selecionada (borda azul)
   - ✅ Properties Panel mostra propriedades do texto

4. **TESTE 3.2: Editar Texto**

   **Ação no Properties Panel**:
   - Content: "PROMOÇÃO DE VERÃO"
   - Font Size: 48
   - Color: #FF6B6B (vermelho)
   - Text Align: center

   **Resultado Esperado**:
   - ✅ Texto atualiza em tempo real no canvas
   - ✅ Cor muda para vermelho
   - ✅ Tamanho aumenta
   - ✅ Texto centralizado

5. **TESTE 3.3: Mover Layer (Drag & Drop)**

   **Ação**: Clique e arraste a layer de texto no canvas

   **Resultado Esperado**:
   - ✅ Layer se move conforme o mouse
   - ✅ Position (X, Y) atualiza no Properties Panel
   - ✅ Layer continua selecionada

6. **TESTE 3.4: Adicionar Layer de Gradiente**

   **Ação**: Clique em "+ Gradient" na toolbar

   **Resultado Esperado**:
   - ✅ Nova layer "Gradient Layer" aparece
   - ✅ Gradiente ocupa toda a tela
   - ✅ Properties Panel mostra configurações de gradiente

   **Configure**:
   - Gradient Type: linear
   - Angle: 45
   - Stops:
     - Cor 1: #FF6B6B (posição 0%)
     - Cor 2: #4ECDC4 (posição 100%)

7. **TESTE 3.5: Reordenar Layers**

   **Ação no Layers Panel**:
   - Arraste a layer de texto para cima (z-index maior)

   **Resultado Esperado**:
   - ✅ Texto fica sobre o gradiente
   - ✅ Ordem visual muda no canvas

8. **TESTE 3.6: Toggle Visibilidade**

   **Ação no Layers Panel**:
   - Clique no ícone de olho (👁️) do gradiente

   **Resultado Esperado**:
   - ✅ Gradiente desaparece do canvas
   - ✅ Ícone muda para "olho fechado"
   - ✅ Layer fica opaca no painel

9. **TESTE 3.7: Salvar Template**

   **Ação**: Clique em "Salvar" na toolbar

   **Resultado Esperado**:
   - ✅ Toast de sucesso: "Template salvo com sucesso!"
   - ✅ Botão mostra "Salvando..." durante o processo
   - ✅ Após salvar, botão volta ao normal

10. **TESTE 3.8: Preview Mode**

    **Ação**: Clique em "Preview" na toolbar

    **Resultado Esperado**:
    - ✅ Canvas muda para modo preview
    - ✅ Renderização usa RenderEngine (mesmo do backend)
    - ✅ Preview mostra exatamente como será gerado
    - ✅ Botão "Preview" fica destacado

---

### TESTE 4: Adicionar Layer de Imagem

1. **No Editor**: Clique em "+ Image"

2. **Resultado Esperado**:
   - ✅ Nova layer "Image Layer" aparece
   - ✅ Placeholder de imagem no canvas

3. **No Properties Panel**:
   - File URL: Cole uma URL de imagem
   - Exemplo: `https://images.unsplash.com/photo-1469474968028-56623f02e42e`

4. **Resultado Esperado**:
   - ✅ Imagem carrega no canvas
   - ✅ Object Fit: cover (padrão)

5. **Teste Object Fit**:
   - Mude para "contain"
   - ✅ Imagem ajusta para caber sem cortar

   - Mude para "fill"
   - ✅ Imagem estica para preencher

---

### TESTE 5: Marcar Campo como Dinâmico

1. **Selecione a layer de texto**

2. **No Properties Panel**:
   - Toggle: "Is Dynamic" = ON

3. **Resultado Esperado**:
   - ✅ Ícone especial aparece na layer (⚡)
   - ✅ Campo será editável no Studio de Geração

---

### TESTE 6: Configurações Avançadas de Texto

1. **Selecione layer de texto**

2. **No Properties Panel - Textbox Config**:

   **TESTE 6.1: Auto Resize Single**
   - Text Mode: "auto-resize-single"
   - Min Font Size: 12
   - Max Font Size: 72
   - Content: "TEXTO MUITO LONGO QUE DEVE AJUSTAR"

   **Resultado Esperado**:
   - ✅ Fonte ajusta automaticamente para caber
   - ✅ Texto permanece em uma linha

   **TESTE 6.2: Auto Wrap Fixed**
   - Text Mode: "auto-wrap-fixed"
   - Line Height: 1.2
   - Break Mode: word
   - Content: "Este é um texto longo que deve quebrar em múltiplas linhas automaticamente"

   **Resultado Esperado**:
   - ✅ Texto quebra em múltiplas linhas
   - ✅ Quebra respeitando palavras
   - ✅ Line height aplicado corretamente

---

### TESTE 7: Gerar Criativo (Backend)

1. **Via API** (teste com curl ou Postman):

```bash
curl -X POST http://localhost:3000/api/projects/1/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_CLERK" \
  -d '{
    "templateId": 1,
    "fieldValues": {
      "layer-id-texto": "NOVO TEXTO AQUI"
    }
  }'
```

2. **Resultado Esperado**:
   - ✅ Status: 201 Created
   - ✅ Response com `resultUrl` (Vercel Blob)
   - ✅ Imagem PNG gerada com sucesso
   - ✅ Texto substituído pelo fieldValue

---

### TESTE 8: Gerar Thumbnail

1. **Via API**:

```bash
curl -X POST http://localhost:3000/api/templates/1/thumbnail \
  -H "Authorization: Bearer SEU_TOKEN_CLERK"
```

2. **Resultado Esperado**:
   - ✅ Thumbnail gerado (400px max)
   - ✅ URL retornada
   - ✅ Template atualizado com `thumbnailUrl`
   - ✅ Thumbnail aparece no card do template

---

## 🔍 Verificações de Qualidade

### Verificar Renderização Unificada

1. **Abra o template no editor**
2. **Adicione texto**: "TESTE DE CONSISTÊNCIA"
3. **Salve o template**
4. **Gere um criativo via API** (sem fieldValues)
5. **Compare**:
   - Preview no editor
   - Imagem gerada (resultUrl)

   **Esperado**: ✅ Devem ser idênticos

### Verificar Quebra de Linhas

1. **Crie texto longo**:
   ```
   Este é um texto muito longo que definitivamente
   vai precisar quebrar em múltiplas linhas para
   caber na área disponível do template
   ```

2. **Configure**:
   - Text Mode: auto-wrap-fixed
   - Break Mode: word
   - Width: 800px

3. **Compare**:
   - Preview no editor
   - Imagem gerada

   **Esperado**: ✅ Quebras de linha idênticas

---

## 🐛 Troubleshooting

### Problema: Template não salva

**Verifique**:
1. Console do navegador (F12) - erros JavaScript?
2. Network tab - request está sendo enviado?
3. Server logs - erros no backend?

**Solução comum**:
- Prisma client não gerado: `npm run db:push`
- Database não rodando: iniciar PostgreSQL

### Problema: Imagem não carrega no canvas

**Verifique**:
1. URL da imagem é acessível?
2. CORS habilitado no servidor da imagem?
3. Console mostra erro de CORS?

**Solução**:
- Use imagens do Unsplash (CORS liberado)
- Configure `next.config.ts` para permitir domínio

### Problema: Preview diferente da geração

**Verifique**:
1. RenderEngine está sendo usado no preview?
2. Fontes estão registradas no backend?
3. Logs do servidor mostram erros?

**Solução**:
- Verificar `src/lib/font-config.ts`
- Instalar fontes no sistema: `fc-list` (Linux)

### Problema: Build falha

**Erro comum**: `@napi-rs/canvas` bundle error

**Solução**:
- Verificar `next.config.ts` tem externalização
- Verificar importações dinâmicas em `generation-utils.ts`

---

## 📊 Checklist de Testes

### Funcionalidades Básicas
- [ ] Criar projeto
- [ ] Deletar projeto
- [ ] Criar template (Story, Feed, Square)
- [ ] Abrir editor de template
- [ ] Salvar template

### Editor de Templates
- [ ] Adicionar layer de texto
- [ ] Adicionar layer de imagem
- [ ] Adicionar layer de gradiente
- [ ] Mover layers (drag & drop)
- [ ] Editar propriedades (texto, cor, fonte)
- [ ] Reordenar layers (z-index)
- [ ] Toggle visibilidade
- [ ] Lock/unlock layers
- [ ] Marcar campo como dinâmico
- [ ] Preview mode
- [ ] Auto-resize texto
- [ ] Auto-wrap texto

### Backend (APIs)
- [ ] POST /api/projects
- [ ] GET /api/projects
- [ ] POST /api/projects/[id]/templates
- [ ] GET /api/projects/[id]/templates
- [ ] PUT /api/templates/[id]
- [ ] POST /api/templates/[id]/thumbnail
- [ ] POST /api/projects/[id]/generations
- [ ] Renderização com @napi-rs/canvas
- [ ] Upload para Vercel Blob

### Renderização Unificada
- [ ] Preview = Geração (visual idêntico)
- [ ] Texto renderiza igual frontend/backend
- [ ] Gradientes renderizam igual
- [ ] Imagens com objectFit correto
- [ ] Quebra de linha consistente
- [ ] Fontes aplicadas corretamente

---

## 🎯 Testes de Performance

### Tempo de Resposta

```bash
# Geração de criativo
time curl -X POST http://localhost:3000/api/projects/1/generations \
  -H "Content-Type: application/json" \
  -d '{"templateId": 1, "fieldValues": {}}'

# Esperado: < 5 segundos
```

### Tamanho de Imagem Gerada

- Story (1080x1920): ~200-500 KB
- Feed (1080x1350): ~150-400 KB
- Square (1080x1080): ~100-300 KB

### Consistência Preview × Render (Fase 6)

1. Gere um criativo no Studio e salve a imagem.
2. Reproduza o mesmo cenário no editor e capture o preview.
3. Compare pixel a pixel utilizando uma ferramenta (ex.: `pixelmatch`) ou inspeção visual.
4. Registre o resultado no relatório (ideal: diferenças inexistentes ou <1%).

### Teste de Carrossel (Fase 6)

1. Utilize `/projects/[id]/studio` com um template FEED.
2. Gere um carrossel de 3 slides com campos distintos.
3. Verifique em `/projects/[id]/creativos` se todos os slides foram gerados, com timestamps e status `COMPLETED`.
4. Faça download de todos os slides e valide o conteúdo.

### Assets do Projeto (Fase 5)

1. Envie um logo, elemento e fonte personalizados na aba **Assets** do projeto.
2. Confirme que cada upload aparece imediatamente na listagem.
3. Remova os itens e verifique se o blob correspondente deixa de existir (HTTP 404 ao acessar a URL antiga).

---

## 📝 Relatório de Teste

Após completar os testes, documente:

1. **Testes Passaram**: X/Y
2. **Bugs Encontrados**: Lista
3. **Performance**: Tempos médios
4. **Observações**: Melhorias sugeridas

---

## 🚀 Próximos Passos

Após validar a Fase 2:

1. **Fase 3**: Studio de Geração (UI frontend)
2. **Fase 4**: Gestão de Criativos (listagem, download)
3. **Fase 5**: Assets (logos, elementos, fontes)
4. **Fase 6**: Integração Google Drive

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique logs do servidor (`npm run dev`)
2. Verifique console do navegador (F12)
3. Revise variáveis de ambiente (`.env.local`)
4. Consulte documentação do Prisma/Next.js

**Bons testes!** 🧪✨
