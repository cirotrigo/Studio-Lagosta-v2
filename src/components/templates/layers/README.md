# Painel de Camadas Avançado (Advanced Layers Panel)

Sistema completo de gerenciamento de camadas para o editor Konva.js, inspirado em ferramentas profissionais como Figma, Canva e Photoshop.

## 🎨 Componentes

### 1. **LayersPanelAdvanced** (Principal)
Componente principal que orquestra todo o sistema de camadas.

**Localização:** `src/components/templates/layers-panel-advanced.tsx`

**Funcionalidades:**
- ✅ Drag & Drop para reordenar camadas (@dnd-kit)
- ✅ Busca/filtro em tempo real
- ✅ Seleção múltipla (Ctrl/Shift + Click)
- ✅ Ações em lote (Selecionar todos, Inverter seleção)
- ✅ Atalhos de teclado
- ✅ Contador de camadas
- ✅ Lista de atalhos integrada

### 2. **LayerItem** (Item Individual)
Componente de cada item na lista de camadas.

**Localização:** `src/components/templates/layers/layer-item.tsx`

**Funcionalidades:**
- ✅ Drag handle para reordenação
- ✅ Renomear com duplo clique
- ✅ Toggle de visibilidade (👁️)
- ✅ Toggle de bloqueio (🔒)
- ✅ Menu de contexto com ações avançadas
- ✅ Ícone por tipo de camada
- ✅ Posição X/Y em tempo real
- ✅ Estados visuais (selecionado, arrastando, oculto)

### 3. **LayerSearch** (Busca)
Campo de busca inteligente com atalho Ctrl+F.

**Localização:** `src/components/templates/layers/layer-search.tsx`

**Funcionalidades:**
- ✅ Busca por nome ou tipo
- ✅ Limpar busca com botão
- ✅ Atalho Ctrl/Cmd+F
- ✅ Foco automático

### 4. **Layer Icons** (Sistema de Ícones)
Mapeamento de ícones Lucide por tipo de camada.

**Localização:** `src/components/templates/layers/layer-icons.tsx`

**Ícones disponíveis:**
- 📝 `text` → Type
- 🖼️ `image` → Image
- 🎨 `gradient/gradient2` → Palette
- ✨ `logo` → Sparkles
- 🔷 `element/shape` → Shapes
- ⭐ `icon` → Star

## 🚀 Como Usar

### Substituir o painel atual

1. **Importar o novo painel:**

```tsx
import { LayersPanelAdvanced } from '@/components/templates/layers-panel-advanced'
```

2. **Usar no lugar do antigo:**

```tsx
// Antes
<LayersPanel />

// Depois
<LayersPanelAdvanced />
```

### Exemplo completo

```tsx
import { LayersPanelAdvanced } from '@/components/templates/layers-panel-advanced'

export function TemplateEditor() {
  return (
    <div className="flex h-screen">
      {/* Sidebar com o painel */}
      <aside className="w-96 border-r">
        <LayersPanelAdvanced />
      </aside>

      {/* Canvas */}
      <main className="flex-1">
        <KonvaEditorStage />
      </main>
    </div>
  )
}
```

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl/Cmd + A` | Selecionar todas as camadas |
| `Ctrl/Cmd + D` | Duplicar camadas selecionadas |
| `Ctrl/Cmd + F` | Focar no campo de busca |
| `Delete/Backspace` | Deletar camadas selecionadas |
| `Escape` | Limpar seleção |
| `Duplo clique` | Renomear camada |
| `Ctrl/Shift + Click` | Seleção múltipla |

## 🎯 Funcionalidades Avançadas

### Menu de Contexto (Clique direito / 3 pontos)
- 📋 **Duplicar** - Cria cópia da camada
- ⬆️ **Trazer para Frente** - Move para o topo do z-index
- ⬇️ **Enviar para Trás** - Move para o fundo do z-index
- ✏️ **Renomear** - Ativa modo de edição do nome
- 🗑️ **Deletar** - Remove a camada

### Drag & Drop
- Arraste pelo ícone ⋮⋮ (grip vertical)
- Feedback visual durante o arraste
- Snap automático na posição de drop
- Sincronização com z-index do canvas

### Busca Inteligente
- Busca por nome da camada
- Busca por tipo (texto, imagem, etc.)
- Filtragem em tempo real
- Mensagem quando não encontra resultados

### Seleção Múltipla
- **Click simples** - Seleciona uma camada
- **Ctrl/Cmd + Click** - Adiciona à seleção
- **Shift + Click** - Seleção em range (futuro)
- **Selecionar Todos** - Marca todas visíveis
- **Inverter Seleção** - Inverte seleção atual

## 🎨 Personalização

### Cores e Estilos
O painel usa as cores do tema (Tailwind CSS):
- `primary` - Destaque de seleção
- `muted` - Background dos items
- `border` - Bordas
- `destructive` - Ação de deletar

### Ícones Personalizados
Edite `layer-icons.tsx` para adicionar novos tipos:

```tsx
const LAYER_ICONS: Record<LayerType, LucideIcon> = {
  text: Type,
  image: Image,
  // Adicione novos tipos aqui
  myCustomType: MyCustomIcon,
}
```

## 📦 Dependências

```json
{
  "@dnd-kit/core": "^6.x",
  "@dnd-kit/sortable": "^8.x",
  "@dnd-kit/utilities": "^3.x",
  "lucide-react": "^0.x"
}
```

## 🐛 Troubleshooting

### Drag & Drop não funciona
- Verifique se `@dnd-kit` está instalado
- Certifique-se que `reorderLayers` está implementado no contexto

### Ícones não aparecem
- Verifique se `lucide-react` está instalado
- Confirme que o tipo da camada está no mapeamento

### Busca não filtra
- Verifique se o campo de busca está recebendo o valor
- Confirme que `searchQuery` está sendo passado corretamente

## 🔄 Integração com Context

O painel usa as seguintes funções do `useTemplateEditor()`:

```tsx
const {
  design,                    // Design com layers
  selectedLayerIds,          // IDs selecionados
  selectLayer,               // Selecionar camada
  selectLayers,              // Selecionar múltiplas
  clearLayerSelection,       // Limpar seleção
  toggleLayerVisibility,     // Toggle visibilidade
  toggleLayerLock,           // Toggle bloqueio
  removeLayer,               // Deletar camada
  duplicateLayer,            // Duplicar camada
  reorderLayers,             // Reordenar camadas
  updateLayer,               // Atualizar camada
} = useTemplateEditor()
```

## 📝 Próximas Melhorias

- [ ] Grupos de camadas (hierarquia)
- [ ] Seleção em range (Shift + Click)
- [ ] Thumbnails das camadas
- [ ] Opacidade inline
- [ ] Filtros por tipo
- [ ] Ordenação alfabética
- [ ] Exportar seleção
- [ ] Bloquear/desbloquear todos

## 📄 Licença

Este componente faz parte do projeto Studio Lagosta e segue a mesma licença.
