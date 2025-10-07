# Sistema de Alinhamento e Organização - Konva.js

Sistema completo de alinhamento, distribuição e organização de elementos inspirado em Figma/Canva, implementado para o editor Konva.js do Studio Lagosta.

## 📋 Funcionalidades Implementadas

### ✅ 1. Seleção Múltipla Avançada

#### Seleção por Clique
- **Clique simples**: Seleciona um elemento
- **Shift/Ctrl + Clique**: Adiciona elemento à seleção
- **Shift/Ctrl + Clique em selecionado**: Remove da seleção

#### Seleção por Arrasto (Drag-to-Select)
- Arraste em área vazia para criar retângulo de seleção
- Detecta automaticamente elementos que intersectam o retângulo
- Feedback visual com retângulo semi-transparente (azul)
- Funciona com transformações (zoom, rotação)

### ✅ 2. Alinhamento de Elementos

#### Alinhamento Horizontal
- **Alinhar à Esquerda** (`Shift+Ctrl+L`): Alinha todos os elementos pela borda esquerda
- **Centralizar Horizontalmente** (`Shift+Ctrl+C`): Centraliza elementos horizontalmente
- **Alinhar à Direita** (`Shift+Ctrl+R`): Alinha pela borda direita

#### Alinhamento Vertical
- **Alinhar ao Topo** (`Shift+Ctrl+T`): Alinha pela borda superior
- **Centralizar Verticalmente** (`Shift+Ctrl+M`): Centraliza elementos verticalmente
- **Alinhar ao Fundo** (`Shift+Ctrl+B`): Alinha pela borda inferior

**Mínimo de elementos**: 2 elementos selecionados

### ✅ 3. Distribuição de Elementos

#### Distribuição com Espaçamento Uniforme
- **Distribuir Horizontalmente** (`Shift+Ctrl+H`): Espaçamento igual entre elementos da esquerda para direita
- **Distribuir Verticalmente** (`Shift+Ctrl+V`): Espaçamento igual entre elementos de cima para baixo

**Características:**
- Mantém primeiro e último elemento fixos
- Calcula espaço total e distribui igualmente entre elementos intermediários
- Mínimo de 3 elementos selecionados

### ✅ 4. Organização de Camadas (Z-Index)

#### Reordenação de Camadas
- **Trazer para Frente** (`Ctrl+]`): Move para o topo da pilha (z-index máximo)
- **Enviar para Trás** (`Ctrl+[`): Move para o fundo da pilha (z-index mínimo)
- **Mover para Frente** (`Ctrl+Shift+]`): Avança uma posição no z-index
- **Mover para Trás** (`Ctrl+Shift+[`): Retrocede uma posição no z-index

**Comportamento com múltipla seleção:**
- Mantém ordem relativa entre elementos selecionados
- Ordena elementos internamente antes de aplicar mudanças

## 🏗️ Arquitetura da Solução

### Arquivos Criados/Modificados

#### 1. Biblioteca de Utilitários de Alinhamento
**`src/lib/konva-alignment.ts`**
- Funções puras para alinhamento e distribuição
- Usa `getClientRect()` do Konva (considera transformações)
- Usa `absolutePosition()` para movimentação precisa
- Funções de layering com preservação de ordem

#### 2. Componente de Toolbar de Alinhamento (Canvas)
**`src/components/templates/alignment-toolbar.tsx`**
- Toolbar compacto com ícones visuais
- Tooltips com descrição e atalhos de teclado
- Estados disabled baseados em quantidade de elementos
- Design consistente com UI do projeto (shadcn/ui)

#### 3. Controles de Alinhamento (Properties Panel)
**`src/components/templates/properties-panel.tsx`**
- Componente `AlignmentControls` integrado ao painel
- Layout em grid organizado por categoria
- Botões com ícone + label descritivo
- Mensagens contextuais de ajuda
- Visível tanto em seleção única quanto múltipla

#### 4. Integração no Editor
**Modificações em:**
- `src/contexts/template-editor-context.tsx`: Métodos de alinhamento
- `src/components/templates/konva-editor-stage.tsx`: Drag-to-select e atalhos
- `src/components/templates/editor-canvas.tsx`: Renderização do toolbar no canvas
- `src/components/templates/properties-panel.tsx`: Controles no painel lateral

### Padrões Arquiteturais Utilizados

#### Pattern 1: Single Transformer
```typescript
// Um único transformer gerencia múltiplas seleções
const transformer = useRef<Konva.Transformer | null>(null)

// Atualiza nodes do transformer quando seleção muda
useEffect(() => {
  const nodes = selectedIds.map(id => stage.findOne(`#${id}`))
  transformer.current?.nodes(nodes.filter(Boolean))
}, [selectedIds])
```

#### Pattern 2: Intersection Detection
```typescript
// Detecta elementos no retângulo de seleção
design.layers.forEach((layer) => {
  const node = stage.findOne(`#${layer.id}`)
  if (node) {
    const nodeBox = node.getClientRect()
    const hasIntersection = Konva.Util.haveIntersection(selectionBox, nodeBox)
    if (hasIntersection) selectedIds.push(layer.id)
  }
})
```

#### Pattern 3: Alignment with Offset Calculation
```typescript
// Preserva transformações ao alinhar
nodes.forEach(({ node }) => {
  const box = node.getClientRect()
  const absPos = node.absolutePosition()

  // Calcular offset entre posição absoluta e bounding box
  const offsetX = absPos.x - box.x
  const offsetY = absPos.y - box.y

  // Aplicar novo alinhamento preservando offset
  node.absolutePosition({
    x: newBoxX + offsetX,
    y: newBoxY + offsetY,
  })
})
```

## ⌨️ Atalhos de Teclado

### Alinhamento
| Atalho | Ação |
|--------|------|
| `Shift+Ctrl+L` | Alinhar à esquerda |
| `Shift+Ctrl+C` | Centralizar horizontalmente |
| `Shift+Ctrl+R` | Alinhar à direita |
| `Shift+Ctrl+T` | Alinhar ao topo |
| `Shift+Ctrl+M` | Centralizar verticalmente |
| `Shift+Ctrl+B` | Alinhar ao fundo |

### Distribuição
| Atalho | Ação |
|--------|------|
| `Shift+Ctrl+H` | Distribuir horizontalmente |
| `Shift+Ctrl+V` | Distribuir verticalmente |

### Organização de Camadas
| Atalho | Ação |
|--------|------|
| `Ctrl+]` | Trazer para frente |
| `Ctrl+[` | Enviar para trás |
| `Ctrl+Shift+]` | Mover para frente |
| `Ctrl+Shift+[` | Mover para trás |

### Seleção
| Atalho | Ação |
|--------|------|
| `Shift/Ctrl + Clique` | Adicionar/remover da seleção |
| `Arrasto em área vazia` | Seleção por retângulo |

## 🎨 Interface do Usuário

### 1. Alignment Toolbar (Canvas)
Localizado no topo do canvas, logo abaixo do Text Toolbar (quando visível):

```
┌─────────────────────────────────────────────────────┐
│  [◄] [═] [►]  │  [▲] [═] [▼]  │  [⬌] [⬍]  │  [⬆] [⬇] [↑] [↓]  │
│  Horizontal   │   Vertical    │ Distribuir │    Camadas      │
└─────────────────────────────────────────────────────┘
```

**Características:**
- Sempre visível no topo do canvas
- Compacto com ícones visuais
- Tooltips com descrição e atalhos
- Estados disabled baseados em quantidade selecionada

### 2. Alignment Controls (Properties Panel)
Localizado no painel de propriedades lateral direito, após as propriedades de posição/tamanho:

```
┌─────────────────────────────────────────────────┐
│  ALINHAMENTO E ORGANIZAÇÃO          2 selecionados │
├─────────────────────────────────────────────────┤
│  Alinhamento Horizontal                         │
│  [ ◄ Esquerda ]  [ ═ Centro ]  [ ► Direita ]    │
│                                                 │
│  Alinhamento Vertical                           │
│  [ ▲ Topo ]  [ ═ Meio ]  [ ▼ Fundo ]           │
│                                                 │
│  Distribuição (mín. 3 elementos)                │
│  [ ⬌ Horizontal ]  [ ⬍ Vertical ]              │
│                                                 │
│  Organização de Camadas                         │
│  [ ⬆ Frente ]  [ ⬇ Trás ]                      │
│  [ ↑ Avançar ]  [ ↓ Retroceder ]               │
├─────────────────────────────────────────────────┤
│  ℹ️ Selecione 2+ elementos para alinhamento     │
└─────────────────────────────────────────────────┘
```

**Características:**
- Visível quando há elementos selecionados
- Botões com ícone + label descritivo
- Grid layout organizado por categoria
- Mensagens de ajuda contextuais
- Integrado com sistema de propriedades existente

**Estados dos Botões:**
- **Disabled quando < 2 elementos**: Alinhamento
- **Disabled quando < 3 elementos**: Distribuição
- **Disabled quando 0 elementos**: Organização de camadas

## 🔧 Como Usar

### Alinhamento Básico
1. Selecione 2 ou mais elementos (Shift + Clique)
2. Clique no botão de alinhamento desejado ou use atalho de teclado
3. Elementos se alinharão mantendo transformações (rotação, escala)

### Distribuição
1. Selecione 3 ou mais elementos
2. Clique em distribuir horizontal ou vertical
3. Elementos intermediários serão espaçados uniformemente

### Organização de Camadas
1. Selecione um ou mais elementos
2. Use botões ou atalhos para alterar z-index
3. Ordem relativa entre elementos selecionados é preservada

### Seleção por Arrasto
1. Clique e arraste em área vazia do canvas
2. Retângulo de seleção aparece
3. Ao soltar, todos os elementos no retângulo são selecionados

## 🧪 Testes e Validação

### Checklist de Funcionalidades
- ✅ Seleção múltipla com Shift/Ctrl
- ✅ Drag-to-select com feedback visual
- ✅ Alinhamento horizontal (esquerda, centro, direita)
- ✅ Alinhamento vertical (topo, meio, fundo)
- ✅ Distribuição horizontal e vertical
- ✅ Organização de camadas (frente, trás, avançar, retroceder)
- ✅ Atalhos de teclado funcionais
- ✅ Estados disabled corretos
- ✅ Tooltips com instruções
- ✅ Type checking passa sem erros

### Casos de Teste Importantes
1. **Elementos rotacionados**: Alinhamento deve usar bounding box visual
2. **Elementos com escala**: Distribuição deve considerar tamanhos reais
3. **Múltipla seleção em camadas**: Z-index deve manter ordem relativa
4. **Drag-to-select com zoom**: Intersecção deve funcionar em qualquer nível de zoom

## 📚 Referências e Inspiração

### Documentação Oficial Konva
- [Multi-select Demo](https://konvajs.org/docs/select_and_transform/Basic_demo.html)
- [Transformer API](https://konvajs.org/api/Konva.Transformer.html)
- [Objects Snapping](https://konvajs.org/docs/sandbox/Objects_Snapping.html)

### Projetos de Referência
- [react-konva-editor](https://github.com/mytac/react-konva-editor) - Editor com multi-seleção e undo/redo
- [react-image-editor](https://github.com/swimmingkiim/react-image-editor) - Interface estilo Figma

### Comparação com Polotno
**Polotno** é um SDK comercial construído sobre Konva.js que fornece:
- Store centralizado com estado reativo
- Funcionalidades de alinhamento prontas
- Export integrado

**Nossa implementação:**
- Usa React Context para estado
- Funções de alinhamento customizadas
- Maior controle e flexibilidade
- Totalmente integrado com arquitetura existente

## 🚀 Próximos Passos Potenciais

### Melhorias Futuras
1. **Alinhamento ao canvas**: Alinhar elementos ao centro/bordas do canvas
2. **Guias de alinhamento ao vivo**: Mostrar guias durante arrasto (já implementadas as Smart Guides)
3. **Snap to objects**: Snap automático a outros elementos
4. **Distribuição customizada**: Especificar espaçamento exato entre elementos
5. **Grupos**: Agrupar/desagrupar elementos selecionados
6. **Alinhamento relativo**: Alinhar ao elemento mais externo da seleção

### Otimizações
- Memoização de cálculos de alinhamento
- Debounce em operações de múltipla seleção
- Web Workers para cálculos pesados (muitos elementos)

## 🐛 Troubleshooting

### Problema: Alinhamento não funciona
**Solução**: Verificar se pelo menos 2 elementos estão selecionados

### Problema: Distribuição desalinhada
**Solução**: Verificar se elementos têm transformações (rotação, escala) aplicadas corretamente

### Problema: Drag-to-select não aparece
**Solução**: Verificar se está clicando em área vazia (não em elemento ou background)

### Problema: Atalhos não funcionam
**Solução**: Garantir que foco não está em input/textarea (atalhos são desabilitados em campos de texto)

## 📝 Notas de Implementação

### Por que usar `absolutePosition()` ao invés de `position()`?
- `position()`: Posição relativa ao parent
- `absolutePosition()`: Posição absoluta no stage (considera transformações do parent)
- Alinhamento precisa de coordenadas absolutas para funcionar corretamente

### Por que calcular offset entre `absolutePosition` e `getClientRect()`?
- `getClientRect()`: Retorna bounding box visual (após rotação/escala)
- `absolutePosition()`: Retorna ponto de ancoragem do elemento
- Offset compensa diferença entre ponto de ancoragem e bounding box visual

### Por que usar dynamic import para alignment functions?
- Code splitting: Reduz bundle inicial
- Lazy loading: Funções carregadas apenas quando usadas
- Performance: Melhora tempo de carregamento inicial da página

## ✨ Conclusão

O sistema de alinhamento e organização está completo e totalmente funcional, seguindo os padrões estabelecidos no guia Konva.js fornecido. A implementação:

- ✅ Usa padrões do Konva.js recomendados
- ✅ Integra-se perfeitamente com arquitetura existente
- ✅ Fornece UX profissional similar a Figma/Canva
- ✅ Mantém performance otimizada
- ✅ Inclui atalhos de teclado intuitivos
- ✅ Type-safe com TypeScript completo
