# Guia do Curved Text Effect

## Como Funciona

O efeito Curved Text converte um `Konva.Text` em `Konva.TextPath` para criar texto em arco/curva.

## Melhorias Implementadas

### 1. Cálculo Dinâmico do Raio
- O raio do arco é calculado baseado na **largura do texto**
- Textos mais longos recebem raios maiores automaticamente
- Range: 50px (mínimo) a 500px (máximo)

### 2. Ajuste de Curvatura
- **Valores positivos (1° a 180°)**: Texto curva para **cima** ⬆️
- **Valores negativos (-1° a -180°)**: Texto curva para **baixo** ⬇️
- **0°**: Sem curvatura (texto reto)

### 3. Preservação de Propriedades
Ao converter Text → TextPath, preservamos:
- ✅ Texto original
- ✅ Font family e font size
- ✅ Cor (fill)
- ✅ Posição (x, y)
- ✅ Rotação
- ✅ Escala (scaleX, scaleY)
- ✅ Opacidade
- ✅ Draggable state
- ✅ Listening state
- ✅ **Todos os attrs personalizados**

### 4. Atualização em Tempo Real
- Mudanças no slider atualizam o path SVG imediatamente
- Não é necessário recriar o TextPath
- Performance otimizada

## Uso no Editor

1. **Ativar Curved Text**:
   ```
   Toggle ON → Converte Text em TextPath
   ```

2. **Ajustar Curvatura**:
   ```
   Slider: -180° a 180°
   - Valores negativos: Curva para baixo
   - Valores positivos: Curva para cima
   ```

3. **Desativar Curved Text**:
   ```
   Toggle OFF → Converte TextPath de volta para Text
   - Restaura todas as propriedades originais
   ```

## Limitações

### ⚠️ Incompatibilidades

Quando Curved Text está ATIVO, os seguintes efeitos **NÃO funcionam**:

- ❌ **Blur**: Filtros não funcionam em TextPath
- ❌ **Stroke**: Contorno não funciona em TextPath
- ❌ **Shadow**: Sombra não funciona em TextPath
- ❌ **Background**: Background rect não sincroniza com TextPath

### ✅ O que FUNCIONA com Curved Text

- ✅ Mudança de fonte (font family)
- ✅ Mudança de tamanho (font size)
- ✅ Mudança de cor (fill)
- ✅ Movimentação (drag)
- ✅ Rotação
- ✅ Escala (resize)
- ✅ Opacidade

## Debugging

### Logs no Console

Quando Curved Text é aplicado, você verá:

```javascript
[CurvedText] Creating TextPath: {
  text: "Seu texto aqui",
  curvature: 45,
  radius: 120,
  pathData: "M -52.4 60 A 120 120 0 0 1 52.4 60"
}
```

### Path SVG Explicado

```
M startX startY    - Move to ponto inicial
A rx ry            - Arc com raios X e Y
  rotation         - Rotação do eixo (sempre 0)
  largeArc         - Flag de arco grande (0 ou 1)
  sweepFlag        - Direção do arco (0 ou 1)
  endX endY        - Ponto final
```

## Exemplo de Path

### Curvatura Positiva (+45°)
```
M -52.4 60 A 120 120 0 0 1 52.4 60
```
- Arco para cima
- Sweep flag = 1

### Curvatura Negativa (-45°)
```
M -52.4 180 A 120 120 0 0 0 52.4 180
```
- Arco para baixo (pontos Y invertidos)
- Sweep flag = 0

## Solução de Problemas

### Texto não aparece após ativar Curved

**Causa**: Path SVG pode estar com coordenadas incorretas

**Solução**:
1. Verifique logs no console
2. Tente ajustar a curvatura (mover slider)
3. Desative e ative novamente

### Texto fica muito pequeno/grande

**Causa**: Raio calculado não é adequado para o texto

**Solução**:
- Ajuste a curvatura para valores menores (ex: ±20°)
- Textos curtos funcionam melhor com curvaturas pequenas
- Textos longos suportam curvaturas maiores

### Texto some ao desativar

**Causa**: Attrs originais não foram preservados

**Solução**:
- Sempre está armazenado em `textPath.getAttr('originalTextAttrs')`
- Se perdido, undo/redo deve recuperar

## Roadmap Futuro

Possíveis melhorias:

- [ ] Suporte a efeitos em TextPath (converter para Group com filtros)
- [ ] Controle de offset do texto no path
- [ ] Paths personalizados (não apenas arcos)
- [ ] Preview visual da curva
- [ ] Animação da transição Text ↔ TextPath

## Código de Exemplo

### Aplicar Curved Text Manualmente

```typescript
import { CurvedTextEffect } from '@/lib/konva/effects'

const textNode = layer.findOne('#my-text-id') as Konva.Text
const config = { enabled: true, curvature: 45 }

const textPath = CurvedTextEffect.apply(textNode, config, layer)
```

### Remover Curved Text

```typescript
const textPath = layer.findOne('#my-text-id') as Konva.TextPath
const textNode = CurvedTextEffect.remove(textPath, layer)
```

### Atualizar Curvatura

```typescript
const textPath = layer.findOne('#my-text-id') as Konva.TextPath
CurvedTextEffect.updateCurvature(textPath, 90, layer)
```
