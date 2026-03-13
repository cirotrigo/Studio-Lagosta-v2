# Studio Lagosta — Spec de Evolucao do Editor (Fases 15-20)
**Editor de Design — App Electron (Desktop)**

| Campo | Valor |
|---|---|
| Versao alvo | Studio Lagosta v2 |
| Plataforma | Electron (Mac & Windows) |
| Responsavel | Ciro Trigo |
| Prioridade | Alta — Blocker de lancamento |
| Fases anteriores | 1-14 (concluidas) |

---

## Indice de Fases

| Fase | Nome | Modulo | Esforco | Status |
|---|---|---|---|---|
| 15 | Quick Wins - Interacao Basica | Canvas + Layers | Baixo | Pendente |
| 16 | Navegacao Avancada do Canvas | Canvas | Medio | Pendente |
| 17 | Gestao Avancada de Camadas | Layers Panel | Medio | Pendente |
| 18 | Painel de Efeitos | Efeitos Visuais | Alto | Pendente |
| 19 | Modo Crop de Imagens | Imagens | Alto | Pendente |
| 20 | Atalhos e Polish Final | Global | Medio | Pendente |

---

## Fase 15 — Quick Wins: Interacao Basica
**Esforco: Baixo | Prioridade: Alta**

### Objetivo
Implementar melhorias rapidas de alta prioridade que desbloqueiam a produtividade basica do usuario.

### 15.1 Handles de Tamanho Fixo (Screen Space)

**Problema atual:**
Os handles de redimensionamento escalam proporcionalmente com o zoom, tornando-se enormes ao afastar a camera.

**Comportamento esperado:**
- Handles devem ter tamanho fixo de **8px no espaco de tela (screen space)**
- Independente do nivel de zoom (25%–400%)
- Implementacao: dividir dimensoes do handle pelo fator de escala antes de renderizar

**Arquivos afetados:**
- `desktop-app/src/components/editor/canvas/` (handles de selecao)

### 15.2 Delete/Backspace para Excluir Elemento

**Comportamento esperado:**
- Teclas `Delete` e `Backspace` excluem o elemento selecionado no canvas
- **Excecao:** Quando o foco estiver em campo de texto (input, textarea), as teclas NAO devem acionar exclusao
- Suporte a Cmd+Z / Ctrl+Z para desfazer

**Implementacao:**
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    if ((e.key === 'Delete' || e.key === 'Backspace') && !isTextInput) {
      e.preventDefault()
      deleteSelectedLayer()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [deleteSelectedLayer])
```

### 15.3 Step Up/Step Down nas Camadas

**Problema atual:**
Botoes de ordenacao movem o elemento diretamente ao topo ou base (Bring to Front / Send to Back).

**Comportamento esperado:**
- Cada clique move o elemento **uma posicao** na hierarquia
- Botoes: `↑` (step up) e `↓` (step down)
- Manter Bring to Front / Send to Back via atalho ou menu de contexto

**Arquivos afetados:**
- `desktop-app/src/components/editor/LayerPanel.tsx`
- `desktop-app/src/stores/editor.store.ts` (acoes stepUp/stepDown)

### Criterios de Aceite - Fase 15
- [ ] Handles mantem 8px em todos os niveis de zoom (25%-400%)
- [ ] Delete/Backspace exclui elementos quando canvas tem foco
- [ ] Delete/Backspace NAO interfere com campos de texto
- [ ] Step up/down move camadas uma posicao por vez
- [ ] Todas as acoes suportam undo/redo

---

## Fase 16 — Navegacao Avancada do Canvas
**Esforco: Medio | Prioridade: Media**

### Objetivo
Elevar a experiencia de navegacao do canvas ao padrao de ferramentas profissionais (Figma, Canva).

### 16.1 Zoom Inteligente (Zoom-to-Center)

**Comportamento atual:**
Zoom aplicado a partir de origem fixa, deslocando o conteudo visivelmente.

**Comportamento esperado:**
- Zoom usa o **centro da viewport atual** como ponto focal
- A posicao de destino mantem o mesmo ponto de referencia visual centralizado
- Entradas suportadas:
  - Roda do mouse (wheel)
  - Cmd/Ctrl + / -
  - Botoes da UI
  - Pinch-to-zoom (trackpad Mac)

**Dica Tecnica (Electron/Chromium):**
```typescript
// Pinch no trackpad Mac = wheel com ctrlKey: true
canvas.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    // Pinch-to-zoom
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    zoomToCenter(zoomFactor)
  }
})
```

### 16.2 Panning com Dois Dedos (Mac Trackpad)

**Comportamento atual:**
Panning disponivel somente via arraste com a ferramenta de mao (Hand tool).

**Comportamento esperado:**
- Deslizar com dois dedos no trackpad aciona panning diretamente
- Sem necessidade de trocar de ferramenta
- No Windows/Linux, botao do meio do mouse aciona o mesmo comportamento

**Implementacao:**
```typescript
canvas.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) {
    // Scroll/Pan (dois dedos no Mac)
    e.preventDefault()
    panCanvas(e.deltaX, e.deltaY)
  }
})
```

### 16.3 Reguas de Precisao (Rulers)

**Requisitos:**
- Reguas graduadas nas bordas horizontal (X) e vertical (Y)
- Marcacoes respeitam a unidade em uso (px)
- Atualizacao dinamica de acordo com o nivel de zoom
- Atalho `R` alterna visibilidade (toggle show/hide)
- Estado persistido por sessao

**Componentes a criar:**
- `desktop-app/src/components/editor/canvas/Ruler.tsx`
- `desktop-app/src/components/editor/canvas/RulerCorner.tsx`

### 16.4 Quick Menu de Alinhamento

**Comportamento esperado:**
- Ao selecionar elementos, exibir barra flutuante **acima da selecao**
- Botoes: Alinhar Esquerda, Centralizar H, Alinhar Direita, Alinhar Topo, Centralizar V, Alinhar Base
- Desaparece ao deselecionar, reaparece a cada nova selecao
- Animacao suave de fade (150ms)
- Em selecao multipla, usa bounding box coletivo como referencia

**Componentes a criar:**
- `desktop-app/src/components/editor/canvas/AlignmentQuickMenu.tsx`

### Criterios de Aceite - Fase 16
- [ ] Zoom mantem ponto focal centralizado
- [ ] Pinch-to-zoom funciona no trackpad Mac
- [ ] Panning com dois dedos funciona sem trocar ferramenta
- [ ] Reguas exibem marcacoes corretas em todos os niveis de zoom
- [ ] Atalho R alterna visibilidade das reguas
- [ ] Quick Menu aparece/desaparece corretamente ao selecionar/deselecionar
- [ ] Alinhamentos funcionam em selecao simples e multipla

---

## Fase 17 — Gestao Avancada de Camadas
**Esforco: Medio | Prioridade: Media**

### Objetivo
Implementar funcionalidades avancadas de gerenciamento de camadas no painel lateral.

### 17.1 Drag & Drop na Lista de Camadas

**Requisitos:**
- Drag and drop nativo para reordenar camadas manualmente
- Indicador visual de posicao (linha horizontal) durante arraste
- Reordenacao reflete imediatamente no canvas
- Suporte a Cmd+Z / Ctrl+Z para desfazer

**Bibliotecas sugeridas:**
- `@dnd-kit/core` (recomendado para React)
- `react-beautiful-dnd` (alternativa)

**Componentes afetados:**
- `desktop-app/src/components/editor/LayerPanel.tsx`

### 17.2 Renomeacao Inline (Double-Click)

**Comportamento esperado:**
- Duplo clique no nome da camada ativa campo de edicao inline
- Confirmar com `Enter` ou clique fora
- Cancelar com `Esc`
- Nomes vazios rejeitados — restaura nome anterior automaticamente

**Implementacao:**
```typescript
const [isEditing, setIsEditing] = useState(false)
const [editName, setEditName] = useState(layer.name)

const handleDoubleClick = () => setIsEditing(true)

const handleBlur = () => {
  if (editName.trim()) {
    updateLayerName(layer.id, editName.trim())
  } else {
    setEditName(layer.name) // Restaura nome anterior
  }
  setIsEditing(false)
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') handleBlur()
  if (e.key === 'Escape') {
    setEditName(layer.name)
    setIsEditing(false)
  }
}
```

### 17.3 Acoes em Lote (Bonus)

**Requisitos opcionais:**
- Selecao multipla de camadas com Cmd/Ctrl+Click
- Exclusao em lote
- Agrupamento de camadas selecionadas (Cmd+G / Ctrl+G)

### Criterios de Aceite - Fase 17
- [ ] Drag & drop funciona sem bugs visuais
- [ ] Indicador de posicao visivel durante arraste
- [ ] Reordenacao reflete imediatamente no canvas
- [ ] Renomeacao inline ativa com duplo clique
- [ ] Enter confirma, Esc cancela renomeacao
- [ ] Nomes vazios sao rejeitados
- [ ] Todas as acoes suportam undo/redo

---

## Fase 18 — Painel de Efeitos
**Esforco: Alto | Prioridade: Media**

### Objetivo
Portar os efeitos de manipulacao visual da versao Web para o app Electron, garantindo paridade de funcionalidade.

### 18.1 Arquitetura de Efeitos

**Estrutura de dados:**
```typescript
interface LayerEffects {
  dropShadow?: {
    enabled: boolean
    offsetX: number      // px
    offsetY: number      // px
    blur: number         // px
    opacity: number      // 0-100
    color: string        // hex com alpha
  }
  textStroke?: {
    enabled: boolean
    width: number        // px (0-20)
    color: string        // hex com alpha
  }
  textBackground?: {
    enabled: boolean
    cornerRadius: number // px (0-50)
    padding: number      // px
    opacity: number      // 0-100
    color: string        // hex
  }
  curvedText?: {
    enabled: boolean
    power: number        // -100 a 100
  }
}
```

### 18.2 Drop Shadow (Sombra Projetada)

**Escopo:** Todos os elementos

**Controles:**
- Toggle ativar/desativar
- Offset X (px): deslocamento horizontal
- Offset Y (px): deslocamento vertical
- Blur (px): 0 = sombra rigida, valores maiores = difusa
- Opacity (%): 0-100
- Seletor de cor com canal alpha

### 18.3 Text Stroke (Contorno de Texto)

**Escopo:** Camadas de texto

**Controles:**
- Toggle ativar/desativar
- Seletor de cor com alpha
- Espessura em pixels (0-20px)

### 18.4 Text Background (Fundo Dinamico)

**Escopo:** Camadas de texto

**Controles:**
- Toggle ativar/desativar
- Corner Radius (px): 0-50
- Padding (px): respiro interno
- Opacity (%): 0-100
- Seletor de cor de preenchimento

### 18.5 Curved Text (Texto Curvado)

**Escopo:** Camadas de texto

**Controles:**
- Slider de -100 a 100 (default: 0)
- Valores negativos: curvatura concava (texto curva para baixo)
- Valores positivos: curvatura convexa (texto curva para cima)
- Texto envolve arco SVG calculado em tempo real

**Implementacao:**
- Usar `textPath` SVG para renderizar texto ao longo de um arco
- Calcular path dinamicamente baseado no slider power

### 18.6 UI do Painel de Efeitos

**Componentes a criar:**
- `desktop-app/src/components/editor/properties/EffectsPanel.tsx`
- `desktop-app/src/components/editor/properties/effects/DropShadowControl.tsx`
- `desktop-app/src/components/editor/properties/effects/TextStrokeControl.tsx`
- `desktop-app/src/components/editor/properties/effects/TextBackgroundControl.tsx`
- `desktop-app/src/components/editor/properties/effects/CurvedTextControl.tsx`

### Criterios de Aceite - Fase 18
- [ ] Drop Shadow funciona em todos os tipos de elementos
- [ ] Text Stroke renderiza corretamente com diferentes espessuras
- [ ] Text Background adapta-se ao tamanho do texto
- [ ] Curved Text atualiza em tempo real ao arrastar slider
- [ ] Todos os efeitos sao salvos/carregados corretamente
- [ ] Efeitos sao aplicados na exportacao final
- [ ] Painel de efeitos aparece no PropertiesPanel quando elemento selecionado

---

## Fase 19 — Modo Crop de Imagens
**Esforco: Alto | Prioridade: Normal**

### Objetivo
Permitir ao usuario reajustar o enquadramento de imagens dentro do frame fixo, sem alterar posicao ou dimensoes do layout.

### 19.1 Gatilho (Trigger)

- Double-click em imagem ativa o **Modo de Edicao de Crop**
- Cursor muda para indicar modo ativo (icone de crop ou mover)

### 19.2 Comportamento no Modo de Edicao

**Frame Fixo:**
- Caixa delimitadora original permanece inalterada
- Visualmente destacada com contorno mais espesso (2px azul)

**Imagem com Transparencia:**
- Imagem original completa visivel com opacity reduzida (~40%)
- Areas anteriormente ocultas tornam-se visiveis como referencia

**Redimensionamento Interno:**
- Handles de canto redimensionam apenas a imagem original
- Frame permanece fixo e imovel

**Pan Interno:**
- Clicar e arrastar a imagem ajusta regiao visivel dentro do frame
- Cursor: `grab` / `grabbing`

**Nao-Destrutivo:**
- Imagem original preservada nos dados do projeto
- Apenas offset e scale sao armazenados

### 19.3 Finalizacao (Exit)

| Acao do Usuario | Resultado |
|---|---|
| Clicar fora da imagem | Confirma novo enquadramento |
| Pressionar `Enter` | Confirma novo enquadramento |
| Clicar em "Concluido" (Done) | Confirma novo enquadramento |
| Pressionar `Esc` | Cancela e restaura enquadramento anterior |

### 19.4 Estrutura de Dados

```typescript
interface ImageLayerCrop {
  // Offset da imagem dentro do frame (em % ou px)
  offsetX: number
  offsetY: number
  // Scale da imagem relativo ao frame
  scale: number
  // Dimensoes originais da imagem
  originalWidth: number
  originalHeight: number
}
```

### 19.5 Implementacao Tecnica

**Usando Konva.js:**
```typescript
// Clip region para aplicar crop
imageNode.clipFunc((ctx) => {
  ctx.rect(0, 0, frameWidth, frameHeight)
})

// Posicionar imagem dentro do clip
imageNode.offsetX(cropOffsetX)
imageNode.offsetY(cropOffsetY)
imageNode.scale({ x: cropScale, y: cropScale })
```

### Criterios de Aceite - Fase 19
- [ ] Double-click em imagem ativa modo crop
- [ ] Frame permanece fixo durante edicao
- [ ] Imagem original visivel com transparencia
- [ ] Arrastar imagem ajusta enquadramento
- [ ] Handles redimensionam imagem, nao frame
- [ ] Enter/clique fora confirma
- [ ] Esc cancela e restaura estado anterior
- [ ] Dados de crop salvos/carregados corretamente
- [ ] Exportacao aplica crop corretamente

---

## Fase 20 — Atalhos de Teclado e Polish Final
**Esforco: Medio | Prioridade: Normal**

### Objetivo
Padronizar todos os atalhos de teclado e fazer polish final da experiencia do editor.

### 20.1 Mapa de Atalhos

| Acao | Mac | Windows/Linux |
|---|---|---|
| Desfazer | `Cmd + Z` | `Ctrl + Z` |
| Refazer | `Cmd + Shift + Z` | `Ctrl + Y` |
| Excluir Camada | `Delete` / `Backspace` | `Delete` / `Backspace` |
| Mostrar/Esconder Reguas | `R` | `R` |
| Duplicar Elemento | `Cmd + D` | `Ctrl + D` |
| Duplicar ao Arrastar | `Opt + Arrastar` | `Alt + Arrastar` |
| Agrupar Elementos | `Cmd + G` | `Ctrl + G` |
| Desagrupar | `Cmd + Shift + G` | `Ctrl + Shift + G` |
| Travar/Destravar Camada | `Cmd + L` | `Ctrl + L` |
| Zoom In | `Cmd + +` | `Ctrl + +` |
| Zoom Out | `Cmd + -` | `Ctrl + -` |
| Ajustar ao Conteudo (Fit) | `Cmd + 0` | `Ctrl + 0` |
| Mover 1px | Setas | Setas |
| Mover 10px | `Shift + Setas` | `Shift + Setas` |
| Selecionar Tudo | `Cmd + A` | `Ctrl + A` |
| Copiar | `Cmd + C` | `Ctrl + C` |
| Colar | `Cmd + V` | `Ctrl + V` |
| Cortar | `Cmd + X` | `Ctrl + X` |

### 20.2 Implementacao de Atalhos (Electron)

**Atencao:** Registrar atalhos via keydown listener no renderer process para evitar conflito com menus nativos.

```typescript
// hooks/use-editor-shortcuts.ts
export function useEditorShortcuts() {
  const { deleteSelectedLayer, duplicateSelectedLayer, ... } = useEditorStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.includes('Mac')
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      // Ignorar se foco em input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelectedLayer()
      }

      // Cmd/Ctrl + D = Duplicar
      if (cmdOrCtrl && e.key === 'd') {
        e.preventDefault()
        duplicateSelectedLayer()
      }

      // ... outros atalhos
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelectedLayer, duplicateSelectedLayer])
}
```

### 20.3 Polish Final

**Itens de polish:**
- [ ] Animacoes suaves em todas as transicoes (150-200ms)
- [ ] Feedback visual ao executar atalhos
- [ ] Tooltips com atalho em todos os botoes
- [ ] Cursor apropriado em cada modo/ferramenta
- [ ] Loading states em operacoes assincronas
- [ ] Mensagens de erro amigaveis

### Criterios de Aceite - Fase 20
- [ ] Todos os atalhos da tabela funcionando
- [ ] Atalhos NAO interferem com campos de texto
- [ ] Atalhos funcionam no Mac e Windows
- [ ] Tooltips exibem atalhos correspondentes
- [ ] Animacoes suaves em toda a UI
- [ ] Nenhuma regressao em funcionalidades existentes

---

## Apendice A — Resumo de Prioridades

| Prioridade | Fase | Items |
|---|---|---|
| Alta | 15 | Handles fixos, Delete/Backspace, Step up/down |
| Media | 16 | Zoom-to-center, Panning, Reguas, Quick Menu |
| Media | 17 | Drag & Drop camadas, Renomeacao inline |
| Media | 18 | Painel de Efeitos (4 efeitos) |
| Normal | 19 | Modo Crop |
| Normal | 20 | Atalhos completos, Polish |

---

## Apendice B — Dependencias entre Fases

```
Fase 15 (Quick Wins) ─────────────────────────────────────┐
    │                                                     │
    ▼                                                     │
Fase 16 (Navegacao)                                       │
    │                                                     │
    ▼                                                     │
Fase 17 (Camadas) ────────────────────────────────────────┤
    │                                                     │
    ├───────────────────┐                                 │
    ▼                   ▼                                 │
Fase 18 (Efeitos)   Fase 19 (Crop)                        │
    │                   │                                 │
    └─────────┬─────────┘                                 │
              ▼                                           │
         Fase 20 (Atalhos + Polish) ◄─────────────────────┘
```

**Notas:**
- Fase 15 pode comecar imediatamente
- Fases 18 e 19 podem ser desenvolvidas em paralelo
- Fase 20 deve ser a ultima (depende de todas as outras)

---

## Apendice C — Estimativas de Tempo

| Fase | Esforco | Estimativa |
|---|---|---|
| 15 | Baixo | 1-2 dias |
| 16 | Medio | 3-4 dias |
| 17 | Medio | 2-3 dias |
| 18 | Alto | 5-7 dias |
| 19 | Alto | 4-5 dias |
| 20 | Medio | 2-3 dias |
| **Total** | | **17-24 dias** |

---

*Documento criado em: 2026-03-13*
*Ultima atualizacao: 2026-03-13*
