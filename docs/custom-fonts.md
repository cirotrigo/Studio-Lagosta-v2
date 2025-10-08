# Sistema de Fontes Customizadas

## 📝 Visão Geral

O sistema de fontes customizadas permite que usuários façam upload de suas próprias fontes e as utilizem no Editor Konva. As fontes são armazenadas tanto localmente (localStorage) quanto no banco de dados (Vercel Blob), garantindo persistência cross-device e sincronização bidirecional entre o painel de Assets e o Editor.

## 🏗️ Arquitetura

### Dual Storage System
```
┌─────────────────┐         ┌──────────────────┐
│   localStorage  │◄───────►│  Vercel Blob     │
│   (base64)      │         │  (file URLs)     │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         └───────────┬───────────────┘
                     │
              ┌──────▼──────┐
              │ FontManager │
              │  (Singleton)│
              └──────┬──────┘
                     │
         ┌───────────┴────────────┐
         │                        │
    ┌────▼─────┐          ┌──────▼──────┐
    │  Assets  │          │   Editor    │
    │  Panel   │          │    Konva    │
    └──────────┘          └─────────────┘
```

### Fluxo de Dados

#### Upload via Assets
```
User selects .ttf file
    ↓
POST /api/projects/[id]/fonts
    ↓
1. Upload to Vercel Blob
2. Save to Database (CustomFont)
3. Return font metadata
    ↓
Assets Panel shows font
```

#### Upload via Editor
```
User uploads font in FontsPanel
    ↓
1. FontManager.uploadFont(file)
   - Converts to base64
   - Adds @font-face rule
   - Saves to localStorage
    ↓
2. POST /api/projects/[id]/fonts
   - Uploads to Vercel Blob
   - Saves to Database
    ↓
3. Updates font with databaseId
    ↓
Font available in Editor + Assets
```

#### Loading on Editor Open
```
TemplateEditorShell opens
    ↓
1. Load from localStorage
2. Fetch from Database API
3. Merge both sources (no duplicates)
4. Call document.fonts.load() for each
5. Wait for document.fonts.ready
    ↓
Render Editor with fonts ready
    ↓
Konva texts render with correct fonts immediately
```

## 🗄️ Modelo de Banco de Dados

### CustomFont
```prisma
model CustomFont {
  id         Int      @id @default(autoincrement())
  name       String
  fontFamily String   // Nome usado no CSS font-family
  fileUrl    String   // Vercel Blob URL
  projectId  Int
  uploadedBy String   // Clerk User ID
  createdAt  DateTime @default(now())

  Project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}
```

## 📊 Interface TypeScript

### CustomFont (Frontend)
```typescript
interface CustomFont {
  name: string           // Nome de exibição
  family: string         // CSS font-family
  url: string           // Blob URL ou data URL
  file?: File           // Arquivo original (opcional)
  extension: string     // .ttf, .otf, .woff, .woff2
  loaded: boolean       // Se a fonte foi carregada com sucesso
  base64?: string       // Base64 para localStorage
  source: 'upload' | 'google' | 'database'
  databaseId?: number   // ID no banco de dados
  projectId?: number    // ID do projeto (para isolamento)
}
```

## 🔒 Isolamento por Projeto

**Problema resolvido:** Fontes customizadas agora são isoladas por projeto, evitando que fontes de um projeto apareçam em outros.

### Como funciona

1. **Chave Única:** Cada fonte é armazenada com uma chave única que combina `projectId` + `fontName`
   ```typescript
   // Exemplo: projeto 123 com fonte "Roboto"
   const fontKey = `123-Roboto`
   ```

2. **Filtragem Automática:** Ao buscar fontes, o sistema filtra automaticamente por projeto
   ```typescript
   // Retorna apenas fontes do projeto 123
   const fonts = fontManager.getCustomFonts(123)
   ```

3. **Persistência Isolada:** localStorage armazena `projectId` em cada fonte
   ```json
   {
     "name": "Roboto",
     "family": "Roboto",
     "projectId": 123,
     ...
   }
   ```

4. **Sincronização com Banco:** Fontes do banco de dados já possuem `projectId` na tabela `CustomFont`

### Fontes Nativas

Apenas a **família Montserrat** está disponível como fonte nativa do sistema. No seletor de fontes, as seguintes variações aparecem como opções separadas:

**Variações disponíveis no seletor:**
- **Montserrat Thin** (peso 100)
- **Montserrat Light** (peso 300)
- **Montserrat Regular** (peso 400) - Padrão
- **Montserrat SemiBold** (peso 600)
- **Montserrat Bold** (peso 700)
- **Montserrat Black** (peso 900)

**Como funciona:**
Ao selecionar uma variação (ex: "Montserrat Bold"), o sistema automaticamente:
1. Define `fontFamily: "Montserrat"`
2. Define `fontWeight: "700"`
3. Renderiza o texto com a combinação correta

**Todos os pesos carregados:**
A fonte Montserrat é carregada via Google Fonts no `layout.tsx` com **todos os 9 pesos** (100-900) e ambos os estilos (normal + italic), garantindo disponibilidade imediata.

**Mapeamento técnico:**
```typescript
FONT_CONFIG.MONTSERRAT_VARIANTS = {
  'Montserrat Thin': { family: 'Montserrat', weight: '100' },
  'Montserrat Light': { family: 'Montserrat', weight: '300' },
  'Montserrat Regular': { family: 'Montserrat', weight: '400' },
  'Montserrat SemiBold': { family: 'Montserrat', weight: '600' },
  'Montserrat Bold': { family: 'Montserrat', weight: '700' },
  'Montserrat Black': { family: 'Montserrat', weight: '900' },
}
```

**Outras fontes** devem ser importadas como fontes customizadas específicas de cada projeto.

## 🔧 FontManager Class

### Singleton Pattern
```typescript
// Obter instância única
const fontManager = getFontManager()
```

### Principais Métodos

#### Upload de Fonte
```typescript
async uploadFont(file: File, projectId?: number): Promise<string>
```
**Processo:**
1. Valida extensão (.ttf, .otf, .woff, .woff2)
2. Extrai nome da fonte do arquivo
3. Cria chave única por projeto (`${projectId}-${fontName}`)
4. Verifica duplicatas (por projeto)
5. Cria Blob URL com `URL.createObjectURL()`
6. Converte para base64 para persistência
7. Adiciona `@font-face` ao stylesheet
8. Aguarda fonte carregar via `loadFont()`
9. Salva em Map interno e localStorage com projectId
10. Retorna nome da fonte

**Exemplo:**
```typescript
const fontManager = getFontManager()
const fontName = await fontManager.uploadFont(fileInput.files[0], projectId)
console.log(`Fonte "${fontName}" carregada no projeto ${projectId}!`)
```

#### Carregar Fonte (Font Loading API)
```typescript
async loadFont(
  fontName: string,
  fontStyle: string = 'normal',
  fontWeight: string = '400'
): Promise<void>
```
**Processo:**
1. Checa se já foi carregada (retorna imediatamente)
2. Tenta usar Font Loading API (`document.fonts.load()`)
3. Aguarda 100ms para garantir processamento
4. Verifica com `document.fonts.check()`
5. Se falhar, usa fallback de medição de largura

**Importante:** Segue a [documentação oficial do Konva](https://konvajs.org/docs/sandbox/Custom_Font.html).

#### Carregar Fonte do Banco
```typescript
async loadDatabaseFont(font: {
  id: number
  name: string
  fontFamily: string
  fileUrl: string
  projectId: number
}): Promise<void>
```
**Processo:**
1. Cria chave única por projeto (`${projectId}-${fontFamily}`)
2. Verifica duplicatas (evita recarregar)
3. Extrai extensão do URL
4. Adiciona `@font-face` com URL do Vercel Blob
5. Aguarda carregamento via `loadFont()`
6. Salva no Map com `source: 'database'`, `databaseId` e `projectId`

#### Obter Fontes Disponíveis
```typescript
getAvailableFonts(projectId?: number): {
  system: string[]
  custom: string[]
  all: string[]
}
```
**Retorna:**
- `system`: Apenas família Montserrat (fonte nativa)
- `custom`: Fontes customizadas do projeto específico
- `all`: Todas as fontes juntas

**Nota:** Ao passar `projectId`, retorna apenas fontes daquele projeto. Sem `projectId`, retorna todas as fontes.

#### Remover Fonte
```typescript
removeFont(fontName: string, projectId?: number): void
```
**Processo:**
1. Cria chave única por projeto (`${projectId}-${fontName}`)
2. Revoga Blob URL (`URL.revokeObjectURL()`)
3. Remove do Map interno
4. Atualiza localStorage

## 📁 Arquivos Principais

### Frontend

#### FontManager
```
src/lib/font-manager.ts
```
- Classe singleton para gerenciamento de fontes
- Cria stylesheet dinâmico para @font-face
- Conversão File ↔ base64
- Persistência em localStorage
- Font Loading API + fallback

#### FontsPanel (Editor)
```
src/components/templates/sidebar/fonts-panel.tsx
```
- Painel no editor Konva
- Upload de fontes
- Preview visual de cada fonte
- Remoção de fontes
- Sincronização com banco de dados

#### ProjectAssetsPanel (Assets)
```
src/components/projects/project-assets-panel.tsx
```
- Gerenciamento de assets do projeto
- Upload de fontes via tab "Fonts"
- Listagem de fontes do banco
- Download/delete de fontes

#### TemplateEditorShell
```
src/components/templates/template-editor-shell.tsx
```
- **Pré-carregamento de fontes** antes do editor renderizar
- Loading state enquanto fontes carregam
- Garante que Konva renderiza com fontes prontas

#### KonvaEditorStage
```
src/components/templates/konva-editor-stage.tsx
```
- Aguarda `document.fonts.ready`
- Força `stage.batchDraw()` após fontes carregarem
- Garante re-render com fontes corretas

### Backend

#### Fonts API
```
src/app/api/projects/[projectId]/fonts/
├── route.ts          # GET (list), POST (upload)
└── [fontId]/
    └── route.ts      # DELETE
```

**GET /api/projects/[projectId]/fonts**
```typescript
// Lista todas as fontes do projeto
const fonts = await db.customFont.findMany({
  where: { projectId },
  orderBy: { createdAt: 'desc' },
})
```

**POST /api/projects/[projectId]/fonts**
```typescript
// Upload de fonte
const formData = await request.formData()
const file = formData.get('file') as File

// 1. Upload para Vercel Blob
const blob = await put(fileName, buffer, {
  access: 'public',
  contentType: 'font/ttf',
})

// 2. Salvar no banco
const font = await db.customFont.create({
  data: {
    name: fontName,
    fontFamily: fontFamily,
    fileUrl: blob.url,
    projectId,
    uploadedBy: userId,
  },
})
```

**DELETE /api/projects/[projectId]/fonts/[fontId]**
```typescript
// Deletar fonte
await del(font.fileUrl) // Remove do Vercel Blob
await db.customFont.delete({ where: { id: fontId } })
```

## 🔄 Sincronização Bidirecional

### Assets → Editor

**Cenário:** Usuário faz upload de fonte no painel de Assets.

**Fluxo:**
1. POST /api/projects/[projectId]/fonts
2. Fonte salva no banco com Vercel Blob URL
3. Ao abrir editor:
   ```typescript
   // TemplateEditorShell
   useEffect(() => {
     async function preloadFonts() {
       // 1. Carregar localStorage
       const localFonts = fontManager.getCustomFonts()

       // 2. Fetch do banco
       const response = await fetch(`/api/projects/${projectId}/fonts`)
       const dbFonts = await response.json()

       // 3. Carregar fontes do banco no manager
       await fontManager.loadDatabaseFonts(dbFonts)

       // 4. Forçar document.fonts.load() para cada fonte
       for (const font of allFonts) {
         await document.fonts.load(`16px '${font.family}'`)
       }

       setFontsLoaded(true)
     }
     preloadFonts()
   }, [])
   ```
4. Fonte aparece no dropdown do editor
5. Konva renderiza textos com a fonte imediatamente

### Editor → Assets

**Cenário:** Usuário faz upload de fonte no painel de fontes do editor.

**Fluxo:**
1. FontsPanel.handleUpload()
   ```typescript
   // 1. Upload para font-manager (localStorage)
   const fontName = await fontManager.uploadFont(file)

   // 2. Salvar também no banco de dados
   if (projectId) {
     const formData = new FormData()
     formData.append('file', file)
     formData.append('fontFamily', fontName)

     const response = await fetch(`/api/projects/${projectId}/fonts`, {
       method: 'POST',
       body: formData,
     })

     const savedFont = await response.json()

     // 3. Atualizar fonte com databaseId
     currentFont.databaseId = savedFont.id
   }
   ```
2. Fonte salva no banco com Vercel Blob URL
3. Fonte aparece no painel de Assets imediatamente
4. Disponível para uso no editor

### Remoção Bidirecional

**Cenário:** Usuário remove fonte em qualquer lugar.

**Editor:**
```typescript
const handleRemoveFont = async (fontName: string) => {
  // 1. Obter databaseId antes de remover
  const font = fontManager.getCustomFonts().find(f => f.family === fontName)
  const databaseId = font?.databaseId

  // 2. Remover do font-manager (localStorage)
  fontManager.removeFont(fontName)

  // 3. Se tiver ID do banco, deletar também
  if (databaseId && projectId) {
    await fetch(`/api/projects/${projectId}/fonts/${databaseId}`, {
      method: 'DELETE',
    })
  }

  // 4. Atualizar UI
  forceUpdate()
}
```

**Assets:**
```typescript
// Deleta direto do banco
await fetch(`/api/projects/${projectId}/fonts/${fontId}`, {
  method: 'DELETE',
})
// Ao abrir editor, não vai mais aparecer na lista
```

## 🎯 Pré-carregamento no Editor (Crucial!)

### Problema
Konva.js não atualiza automaticamente quando fontes carregam. Se o canvas renderizar antes das fontes estarem prontas, textos aparecem com fonte fallback (Arial).

### Solução
Implementamos pré-carregamento em **TemplateEditorShell**:

```typescript
export function TemplateEditorShell({ template }) {
  const [fontsLoaded, setFontsLoaded] = useState(false)
  const fontManager = useMemo(() => getFontManager(), [])

  useEffect(() => {
    async function preloadFonts() {
      // 1. Carregar fontes do localStorage
      const localFonts = fontManager.getCustomFonts()

      // 2. Buscar e carregar fontes do banco de dados
      if (template.projectId) {
        const response = await fetch(`/api/projects/${template.projectId}/fonts`)
        const dbFonts = await response.json()
        await fontManager.loadDatabaseFonts(dbFonts)
      }

      // 3. Para cada fonte, forçar document.fonts.load()
      const allFonts = fontManager.getCustomFonts()
      for (const font of allFonts) {
        await document.fonts.load(`16px '${font.family}'`)
      }

      // 4. Aguardar frame adicional
      await new Promise(resolve => requestAnimationFrame(resolve))

      setFontsLoaded(true)
    }

    preloadFonts()
  }, [fontManager, template.projectId])

  // Mostrar loading enquanto fontes carregam
  if (!fontsLoaded) {
    return <LoadingSpinner message="Carregando fontes customizadas..." />
  }

  // Só renderiza editor após fontes prontas
  return (
    <TemplateEditorProvider template={resource}>
      <TemplateEditorContent />
    </TemplateEditorProvider>
  )
}
```

### Garantia Adicional no Konva Stage
```typescript
// KonvaEditorStage.tsx
useEffect(() => {
  async function waitForFonts() {
    // Aguardar todas as fontes carregarem
    await document.fonts.ready

    // Aguardar frame adicional
    await new Promise(resolve => requestAnimationFrame(resolve))

    // Forçar redraw do stage
    if (stageRef.current) {
      stageRef.current.batchDraw()
    }
  }
  waitForFonts()
}, [])
```

## 🐛 Solução de Problemas

### Fontes não aparecem no editor

**Causa:** Fontes não foram pré-carregadas antes do Konva renderizar.

**Solução:**
1. Verificar console para logs de pré-carregamento
2. Confirmar que `TemplateEditorShell` está carregando fontes
3. Verificar se `document.fonts.load()` foi chamado

### Fontes aparecem apenas após clicar

**Causa:** Pré-carregamento não implementado.

**Solução:** Este problema foi resolvido com o pré-carregamento no `TemplateEditorShell`.

### Fonte não sincroniza entre Assets e Editor

**Causa:** Upload não salvou no banco ou localStorage.

**Solução:**
1. Verificar logs do console
2. Confirmar que POST /api/.../fonts retornou sucesso
3. Checar se `databaseId` foi atribuído após salvar

### Fonte some após reload

**Causa:** Não foi salva no banco, apenas no localStorage.

**Solução:**
1. Confirmar que `projectId` está disponível
2. Verificar se POST para API foi executado
3. Checar se banco recebeu o registro

### Fontes duplicadas

**Causa:** Upload sem verificação de duplicatas.

**Solução:** O `FontManager` já verifica duplicatas:
```typescript
if (this.loadedFonts.has(fontName)) {
  throw new Error(`Fonte "${fontName}" já foi importada.`)
}
```

### Erro ao carregar fonte do Vercel Blob

**Causa:** URL inválido ou acesso negado.

**Solução:**
1. Verificar variável `BLOB_READ_WRITE_TOKEN`
2. Confirmar que font file foi realmente upado
3. Checar CORS do Vercel Blob

## 💡 Boas Práticas

### Upload de Fontes
- Prefira formatos WOFF2 (menor tamanho, melhor compressão)
- Limite de 5MB por fonte
- Nomear arquivos descritivamente (e.g., `Montserrat-Bold.ttf`)

### Uso no Editor
- Aguardar pré-carregamento antes de renderizar
- Usar `document.fonts.ready` para garantia
- Sempre chamar `document.fonts.load()` antes de aplicar fonte

### Performance
- Evitar muitas fontes (max 10-15 por projeto)
- Usar fontes system quando possível
- Comprimir fontes antes de fazer upload

### Persistência
- Sempre salvar no banco para cross-device
- localStorage como cache local
- Sincronizar bidirecionalmente

## 📚 Referências

- [Custom Fonts in Konva.js](https://konvajs.org/docs/sandbox/Custom_Font.html)
- [CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API)
- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [Editor Konva](./konva-editor.md)
- [Sistema de Projetos](./projects-templates.md)
