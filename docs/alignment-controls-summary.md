# Controles de Alinhamento no Painel de Propriedades - Resumo

> **Atualizado em 27/07/2026.** A regra de habilitação mudou: alinhar passou a
> valer com um elemento só, mirando a página. Ver
> [SESSAO-2026-07-27-TEXTO-ALINHAMENTO.md](./SESSAO-2026-07-27-TEXTO-ALINHAMENTO.md) § 3 e 4.

## ✅ Implementação Completa

Os **controles de alinhamento completo** foram implementados com sucesso no painel de propriedades do editor Konva.js.

## 📍 Localizações dos Controles

### 1. **Alignment Toolbar (Canvas - Topo)**
- **Localização**: Topo do canvas, abaixo do Text Toolbar
- **Estilo**: Compacto, ícones-only com tooltips
- **Sempre visível**: Sim
- **Arquivo**: `src/components/templates/alignment-toolbar.tsx`

### 2. **Alignment Controls (Properties Panel - Lateral)**  ⭐ NOVO
- **Localização**: Painel de propriedades lateral direito
- **Posição**: Após propriedades de posição/tamanho/rotação
- **Estilo**: Grid layout com ícone + label
- **Visibilidade**: Quando há elementos selecionados (1 ou mais)
- **Arquivo**: `src/components/templates/properties-panel.tsx`

## 🎯 Funcionalidades dos Controles

### Alinhamento Horizontal (3 botões)
```
[ ◄ Esquerda ]  [ ═ Centro ]  [ ► Direita ]
```
- Alinhar à esquerda (`Shift+Ctrl+L`)
- Centralizar horizontalmente (`Shift+Ctrl+C`)
- Alinhar à direita (`Shift+Ctrl+R`)

### Alinhamento Vertical (3 botões)
```
[ ▲ Topo ]  [ ═ Meio ]  [ ▼ Fundo ]
```
- Alinhar ao topo (`Shift+Ctrl+T`)
- Centralizar verticalmente (`Shift+Ctrl+M`)
- Alinhar ao fundo (`Shift+Ctrl+B`)

### Distribuição (2 botões)
```
[ ⬌ Horizontal ]  [ ⬍ Vertical ]
```
- Distribuir horizontalmente (`Shift+Ctrl+H`)
- Distribuir verticalmente (`Shift+Ctrl+V`)

### Organização de Camadas (4 botões)
```
[ ⬆ Frente ]  [ ⬇ Trás ]
[ ↑ Avançar ]  [ ↓ Retroceder ]
```
- Trazer para frente (`Ctrl+]`)
- Enviar para trás (`Ctrl+[`)
- Mover para frente (`Ctrl+Shift+]`)
- Mover para trás (`Ctrl+Shift+[`)

## 🎨 Design e UX

### Layout Visual
```
┌─────────────────────────────────────────────────┐
│  ALINHAMENTO E ORGANIZAÇÃO          2 selecionados │
├─────────────────────────────────────────────────┤
│                                                 │
│  Alinhamento Horizontal                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │    ◄    │  │    ═    │  │    ►    │        │
│  └─────────┘  └─────────┘  └─────────┘        │
│                                                 │
│  Alinhamento Vertical                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │    ▲    │  │    ═    │  │    ▼    │        │
│  └─────────┘  └─────────┘  └─────────┘        │
│                                                 │
│  Distribuição (mín. 3 elementos)                │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  ⬌ Horizontal │  │  ⬍ Vertical  │            │
│  └──────────────┘  └──────────────┘            │
│                                                 │
│  Organização de Camadas                         │
│  ┌──────────┐  ┌──────────┐                    │
│  │ ⬆ Frente │  │ ⬇ Trás   │                    │
│  └──────────┘  └──────────┘                    │
│  ┌──────────┐  ┌──────────┐                    │
│  │ ↑ Avançar│  │ ↓ Retro. │                    │
│  └──────────┘  └──────────┘                    │
│                                                 │
├─────────────────────────────────────────────────┤
│  ℹ️ Selecione 2+ elementos para alinhamento     │
└─────────────────────────────────────────────────┘
```

### Características de Design
- **Grid Layout**: Organização visual clara por categoria
- **Ícones + Labels**: Cada botão tem ícone visual + texto descritivo
- **Estados Disabled**: Botões ficam disabled quando não aplicáveis
- **Mensagens de Ajuda**: Dicas contextuais baseadas na quantidade selecionada
- **Títulos nas Seções**: Labels em uppercase para cada categoria
- **Contador de Seleção**: Mostra quantidade de elementos selecionados

## 🔄 Comportamento Inteligente

### Quando NENHUM layer individual está selecionado:
```typescript
// Mostra placeholder + controles se houver multi-seleção
{!selectedLayer && (
  <>
    <div>Selecione uma layer para editar</div>
    {editor.selectedLayerIds.length > 0 && (
      <AlignmentControls selectedCount={editor.selectedLayerIds.length} />
    )}
  </>
)}
```

### Quando UM layer está selecionado:
```typescript
// Mostra propriedades do layer + controles de alinhamento
{selectedLayer && (
  <>
    <div>Propriedades do Layer...</div>
    <AlignmentControls selectedCount={editor.selectedLayerIds.length} />
  </>
)}
```

### Estados dos Botões
- **Alinhamento**: Disabled se `selectedCount === 0`. Com **1** elemento o alvo
  é a **página** (encostando nas guias de margem, `CANVAS_MARGIN`); com **2 ou
  mais**, os elementos se alinham **entre si**. Vale para as duas telas: este
  painel e a `alignment-toolbar` no topo do canvas.
- **Distribuição**: Disabled se `selectedCount < 3`
- **Organização**: Disabled se `selectedCount === 0`

## 💡 Vantagens da Implementação

### 1. **Dupla Interface**
- **Toolbar no Canvas**: Acesso rápido durante edição
- **Controles no Painel**: Controle detalhado com labels

### 2. **Contexto Visual**
- Usuário vê quantidade de elementos selecionados
- Mensagens de ajuda explicam requisitos
- Botões disabled comunicam o que falta

### 3. **Consistência**
- Usa mesmos métodos do contexto
- Mesmos atalhos de teclado funcionam
- Design alinhado com shadcn/ui

### 4. **Flexibilidade**
- Funciona com seleção única
- Funciona com multi-seleção
- Visível em ambos os cenários

## 🧪 Como Testar

### Teste 1: Seleção Única
1. Selecione 1 elemento
2. Abra painel de propriedades
3. Verifique que controles de organização estão habilitados
4. Verifique que alinhamento/distribuição estão disabled

### Teste 2: Multi-Seleção (2 elementos)
1. Selecione 2 elementos (Shift+Click)
2. Abra painel de propriedades
3. Verifique que alinhamento está habilitado
4. Verifique que distribuição está disabled
5. Clique em "Centralizar Horizontalmente"
6. Elementos devem alinhar

### Teste 3: Multi-Seleção (3+ elementos)
1. Selecione 3 ou mais elementos
2. Abra painel de propriedades
3. Verifique que TODOS os controles estão habilitados
4. Clique em "Distribuir Horizontalmente"
5. Elementos devem ter espaçamento uniforme

### Teste 4: Organização de Camadas
1. Selecione qualquer elemento
2. Clique em "Trazer para Frente"
3. Verifique que z-index mudou
4. Teste "Avançar" e "Retroceder"

## 📚 Arquivos Modificados

### Arquivo Principal
```
src/components/templates/properties-panel.tsx
```

**Mudanças:**
- Importação de ícones de alinhamento do lucide-react
- Novo componente `AlignmentControls` (linhas 914-1113)
- Integração no `PropertiesContent` para seleção única (linha 445)
- Integração no `PropertiesContent` para multi-seleção (linha 376)

### Estrutura do Componente
```typescript
interface AlignmentControlsProps {
  selectedCount: number
}

function AlignmentControls({ selectedCount }: AlignmentControlsProps) {
  // Usa hooks do context
  const {
    alignSelectedLeft,
    alignSelectedCenterH,
    // ... todos os métodos
  } = useTemplateEditor()

  // Calcula estados
  const alignDisabled = selectedCount === 0 // 1 = alinha na página; 2+ = entre si
  const distributeDisabled = selectedCount < 3
  const orderDisabled = selectedCount === 0

  // Renderiza grid com botões
  return (...)
}
```

## ✨ Resultado Final

O sistema de alinhamento agora oferece **duas formas de acesso**:

1. **Rápido (Canvas)**: Toolbar compacto para uso durante edição
2. **Detalhado (Painel)**: Controles com labels e contexto visual

Ambos compartilham a mesma lógica de backend, garantindo consistência e funcionalidade completa em qualquer interface escolhida pelo usuário.

## 🎯 Status

✅ **COMPLETO E FUNCIONAL**
- Type checking passou sem erros
- Todos os controles implementados
- Documentação atualizada
- Pronto para uso em produção
