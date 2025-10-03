# Toolbar de Edição de Texto - Konva.js

## 📝 Visão Geral

A toolbar de edição de texto foi implementada com sucesso no editor de templates Konva.js. Ela fornece uma interface completa para editar propriedades visuais de textos selecionados no canvas.

## ✨ Funcionalidades Implementadas

### 1. **Edição Inline de Texto**

- **Duplo clique** em qualquer texto no canvas para editar o conteúdo
- Cria um textarea HTML temporário com os mesmos estilos do texto
- **Enter** para finalizar edição
- **Shift+Enter** para adicionar nova linha
- **Escape** para cancelar sem salvar
- Auto-resize do textarea conforme você digita

### 2. **Toolbar de Propriedades** (aparece quando um texto é selecionado)

#### Formatação de Texto
- 📝 **Fonte (Font Family)**: Dropdown com 15 fontes populares
  - Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Raleway, Nunito, Playfair Display, Merriweather, PT Serif, Source Sans Pro, Ubuntu, Work Sans, Rubik

- 📏 **Tamanho da Fonte**: Input numérico (8-200px)
  - Ajuste preciso do tamanho

#### Estilo
- **B** **Negrito**: Toggle para aplicar/remover negrito
- *I* **Itálico**: Toggle para aplicar/remover itálico

#### Alinhamento
- ⬅️ **Esquerda**: Alinhar texto à esquerda
- ⬛ **Centro**: Centralizar texto
- ➡️ **Direita**: Alinhar texto à direita

#### Cores
- 🎨 **Cor do Texto**: Color picker para escolher a cor principal
- 🖍️ **Cor do Contorno**: Color picker para cor do stroke
- 📏 **Espessura do Contorno**: Input numérico (0-20px)

#### Espaçamento
- 📐 **Altura da Linha**: Input numérico (0.5-3.0)
  - Controla o espaçamento vertical entre linhas
- 📊 **Espaçamento entre Letras**: Input numérico (-10 a 50px)
  - Controla o espaçamento horizontal entre caracteres

#### Opacidade
- 👁️ **Opacidade**: Slider (0-100%)
  - Controla a transparência do texto

## 🎯 Como Usar

### Editando o Conteúdo do Texto

1. **Duplo clique** no texto que deseja editar
2. Um textarea aparecerá sobre o texto
3. Digite o novo conteúdo
4. Pressione **Enter** para confirmar ou **Escape** para cancelar
5. Use **Shift+Enter** para adicionar quebras de linha

### Editando Propriedades Visuais

1. **Clique simples** no texto para selecioná-lo
2. A toolbar aparecerá automaticamente no topo da tela
3. Ajuste as propriedades desejadas:
   - Mude a fonte no dropdown
   - Ajuste o tamanho digitando ou usando as setas
   - Clique nos botões B/I para negrito/itálico
   - Escolha o alinhamento
   - Altere cores com os color pickers
   - Ajuste espaçamentos e opacidade
4. As mudanças são aplicadas **em tempo real** no canvas

## 🔧 Arquivos Criados/Modificados

### Arquivos Criados
- `src/components/templates/text-toolbar.tsx` - Componente da toolbar de propriedades
- `src/components/templates/konva-editable-text.tsx` - Componente de texto editável
- `src/components/ui/slider.tsx` - Componente Slider (shadcn/ui)

### Arquivos Modificados
- `src/components/templates/konva-editor-stage.tsx` - Integração da toolbar
- `src/components/templates/konva-layer-factory.tsx` - Uso do componente editável

## 📐 Layout da Toolbar

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [Fonte ▼] [20] │ [B] [I] │ [⬅️] [⬛] [➡️] │ [🎨] [🖍️] [2] │ [Alt: 1.2] [Esp: 0] │ [━━●━━ 100%] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 💡 Dicas de UX

1. **Feedback Visual**: Botões ativos (Bold, Italic, Alinhamento) ficam destacados
2. **Valores em Tempo Real**: A toolbar sempre mostra os valores atuais do texto selecionado
3. **Auto-hide**: A toolbar desaparece quando:
   - Você clica fora do texto
   - Seleciona múltiplos elementos
   - Nenhum elemento está selecionado
4. **Responsividade**: A toolbar possui scroll horizontal em telas menores

## 🚀 Melhorias Futuras Possíveis

1. **Atalhos de Teclado**:
   - Ctrl+B para negrito
   - Ctrl+I para itálico
   - Ctrl+L/E/R para alinhamento

2. **Presets de Estilo**:
   - Botões com estilos predefinidos (Título, Subtítulo, Corpo)
   - Salvar estilos customizados

3. **Mais Opções de Formatação**:
   - Sublinhado
   - Tachado
   - Transformação de texto (uppercase, lowercase, capitalize)
   - Sombra de texto

4. **Google Fonts**:
   - Integração com Google Fonts API
   - Mais opções de fontes

5. **Copiar Estilo**:
   - Copiar formatação de um texto para outro
   - Aplicar estilo em múltiplos textos

6. **Toolbar Flutuante**:
   - Posicionar próximo ao texto selecionado
   - Seguir o texto ao fazer scroll

## 🎨 Customização

Para adicionar mais fontes ao dropdown, edite o array `FONT_FAMILIES` em:
```typescript
// src/components/templates/text-toolbar.tsx
const FONT_FAMILIES = [
  'Inter',
  'Roboto',
  // Adicione suas fontes aqui
  'SuaFonteCustomizada',
]
```

Para ajustar os limites de valores, modifique os atributos `min`, `max` e `step` nos inputs correspondentes no componente `TextToolbar`.

## 🐛 Solução de Problemas

### Texto não edita ao duplo clique
- Verifique se o layer não está **locked** (bloqueado)
- Confirme que o stage está renderizado e a referência está disponível

### Toolbar não aparece
- Certifique-se de que apenas **um texto** está selecionado
- Múltiplos elementos selecionados ocultam a toolbar

### Estilos não aplicam
- Verifique se a fonte está carregada no projeto
- Alguns estilos podem ter limites no Konva.js

## 📚 Referências

- [Konva.js Documentation](https://konvajs.org/)
- [React Konva](https://konvajs.org/docs/react/)
- [Shadcn/ui Components](https://ui.shadcn.com/)
