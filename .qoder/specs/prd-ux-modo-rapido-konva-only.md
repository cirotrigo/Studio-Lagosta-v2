# PRD — Modo Rápido (Konva-Only + Base de Conhecimento)

## 1. Problema

Social media perde tempo preenchendo dados repetitivos (horário, promoção, cardápio, CTA) e ajustando arte em etapas longas.

## 2. Objetivo do Produto

Permitir gerar artes prontas para Instagram com **1 prompt + 1 clique**, mantendo possibilidade de microajuste no Konva antes da aprovação.

## 3. Princípios

1. Menos campos, mais resultado.
2. Contexto do projeto aplicado automaticamente.
3. Preview = export final (mesmo motor Konva).
4. Aprovação por variação, sem travar o formulário.

## 4. Público-alvo

- Social media de restaurantes e negócios locais.
- Equipes que produzem Stories, Feed e Carrossel diariamente.

## 5. Escopo MVP

## 5.1 Entrada mínima
- Prompt único
- Formato (`Story`, `Feed`, `Carrossel`)
- Fundo: `Usar foto` ou `Gerar com IA`
- Referências visuais (opcional, até 5 no UX)

## 5.2 Saída
- 1, 2 ou 4 variações de arte prontas
- Aprovar / Rejeitar / Editar no Konva
- Publicar no histórico e web após aprovação

## 5.3 Motor
- Somente Konva + JSON
- Sem dependência de HTML/Design System para render

## 6. Base de Conhecimento (Requisito central)

## 6.1 Fonte
- Base por projeto já existente no web (`/api/knowledge?projectId=`).

## 6.2 Como aplicar
1. Classificar intenção do prompt (ex: happy hour, campanha, cardápio, evento).
2. Buscar contexto relevante por similaridade semântica (RAG).
3. Injetar contexto no prompt da LLM para gerar copy estruturada.
4. Aplicar copy nos slots do template Konva.

## 6.3 Prioridade de categorias
1. `CAMPANHAS`
2. `HORARIOS`
3. `CARDAPIO`
4. `DIFERENCIAIS`
5. `FAQ` (quando aplicável)

## 6.4 Regras de segurança
- Não inventar dados críticos (horário/preço/endereço).
- Se não houver contexto suficiente, manter campo vazio ou neutro.
- Se houver conflito, priorizar pedido do usuário e sinalizar revisão.

## 7. Fluxo UX (wireflow)

## 7.1 Fluxo principal (1 prompt)
1. Usuário escreve: “Crie variações sobre o happy hour com essa foto”.
2. Sistema detecta intenção e consulta base do projeto.
3. Gera copy + aplica no template Konva mais adequado.
4. Mostra variações em fila (não bloqueante).
5. Usuário aprova uma ou mais variações.
6. Opcional: abre no Konva para microajuste.
7. Aprovação final salva no histórico e envia ao web.

## 7.2 Fluxo de edição
1. Clicar `Editar no Konva` na variação.
2. Ajustar texto, posição, tamanho, imagem, gradiente.
3. `Salvar variação` ou `Salvar como novo template`.
4. Aprovar.

## 8. Interface (modo rápido)

## 8.1 Elementos visíveis por padrão
- Campo de prompt
- Seletor de formato
- Seletor de fundo (foto/IA)
- Upload de referências
- Botão `Gerar Artes`

## 8.2 Elementos avançados (colapsados)
- Quantidade de variações
- Ajustes de tom da copy
- Seleção manual de template
- Configurações de constraints
- Toggle `Analisar imagem para contexto` (default: desligado)

## 8.3 Transparência de contexto
- Badge: `Contexto do projeto aplicado`
- Link: `Ver dados usados`
- Ação: `Atualizar base de conhecimento`

## 9. Requisitos técnicos

## 9.1 Orquestrador de prompt
- Input: prompt + formato + mídia + refs + projectId
- Enriquecimento: RAG context
- Opcional: enriquecimento por análise da imagem quando toggle estiver ativo
- Output: copy estruturada por slots

## 9.4 Análise de imagem opcional
- Entrada: imagem base da arte.
- Saída esperada:
  - `dishNameCandidates[]`
  - `sceneType`
  - `ingredientsHints[]`
  - `confidence`
- Regra:
  - só aplicar automaticamente quando `confidence >= threshold`.
  - abaixo do limiar, não inferir prato específico.
  - se a API/chave de visão não estiver disponível, manter pipeline padrão com aviso não-bloqueante.

Nota de escopo:
- O toggle pode aparecer também no modal do editor por consistência visual, mas o enriquecimento da copy ocorre no pipeline do modo rápido.

## 9.2 Slot binder
- Mapeia `title/description/cta/badge/footer` para layers Konva.
- Aplica constraints (`maxLines`, `overflowBehavior`, `min/maxFont`).
- Normaliza quebras de linha legadas (`<br>` -> `\\n`) para render Konva.
- Remove/neutraliza markup HTML literal para evitar texto quebrado no canvas.

## 9.3 Fila de geração
- Cada variação é um job independente.
- Formulário continua editável durante processamento.
- Estado por job: `queued | processing | ready | error`.

## 10. Telemetria (KPIs)

## 10.1 Eficiência
- Tempo até primeira arte: alvo `< 60s`.
- Cliques até aprovação: alvo `<= 4`.

## 10.2 Qualidade
- Taxa de aprovação sem edição: alvo `>= 70%`.
- Taxa de uso de “Editar no Konva”: monitorar para calibrar templates.

## 10.3 Contexto
- Cobertura de contexto útil por geração (`knowledge_hits > 0`).
- Taxa de prompts com informação crítica preenchida automaticamente (happy hour, horário etc.).

## 11. Critérios de aceite

1. Prompt “happy hour” gera variações com dia/horário quando esse dado existe na base.
2. Usuário não precisa repetir dados estáveis do negócio.
3. Variações aprovadas mantêm fidelidade visual do preview para export.
4. Reedição Konva funciona para qualquer variação gerada.
5. Com toggle ativo, prompt de almoço executivo pode aproveitar contexto visual da foto para associar prato quando houver match confiável no cardápio.

## 12. Não-objetivos do MVP

- Export SVG vetorial.
- Histórico em árvore com merge.
- Recomendador avançado de campanha multiobjetivo.
