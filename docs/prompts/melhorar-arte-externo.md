# Prompt: Melhorar arte gerada (uso externo)

Versão portátil do prompt que o Studio Lagosta usa internamente para o "Melhorar com IA". Cole em **ChatGPT (com visão)**, **Claude** ou **Gemini** quando quiser aprimorar uma arte fora do site.

> **Modelo recomendado:** GPT-4o ou Claude Sonnet 4.x (ambos com visão).
> Para geração/edição de imagem propriamente dita, use **GPT-Image-2** ou **Gemini 2.5 Flash Image** via API.

---

## Como usar

1. Abra um chat com modelo que aceite **upload de imagem**.
2. Anexe as imagens **nesta ordem** (a ordem importa, o prompt referencia "IMAGEM 1, 2, 3…"):
   - **IMAGEM 1:** a arte original que você quer melhorar — sempre primeiro.
   - **IMAGEM 2 (opcional):** nova imagem de fundo, se for trocar o fundo.
   - **IMAGEM 3+ (opcional):** logos e elementos gráficos do projeto.
3. Cole o prompt de uma das três variantes abaixo, preenchendo o que estiver entre `{{ }}`.
4. Se quiser **mudar tamanho de texto** (aumentar título, diminuir subtítulo, etc.), escreva no `{{PEDIDO_DO_CLIENTE}}` — o prompt foi calibrado para respeitar pedidos explícitos de redimensionamento.

---

## Variante 1 — Aprimoramento geral (sem assets adicionais)

Use quando só vai anexar **a arte original** e quer um polimento de layout sem trocar fundo nem adicionar logos.

```
[INSTRUÇÃO TIPOGRÁFICA — PRIORIDADE MÁXIMA]
Antes de qualquer outra modificação, examine cuidadosamente a tipografia da arte original (IMAGEM 1) e siga estas regras críticas:

TAMANHO DOS TEXTOS (padrão): os blocos de texto na versão melhorada devem ocupar no máximo um quarto (cerca de 25%) da área visual total da arte e permanecer COMPACTOS e DISCRETOS. Por padrão, mantenha o tamanho dos textos igual ou menor que a arte original — para destacar informações, prefira peso, cor ou posição em vez de ampliação de fonte.

EXCEÇÃO — PEDIDO EXPLÍCITO DO CLIENTE: se o [PEDIDO DO CLIENTE] solicitar aumento, diminuição ou redimensionamento de algum texto (ex: "aumente o título", "diminua o subtítulo", "destaque o preço com fonte maior"), respeite o pedido. O pedido do cliente tem prioridade sobre o padrão de compactação, mas mantenha a proporção interna entre os demais textos não citados.

FIDELIDADE TIPOGRÁFICA: replique fielmente as fontes da IMAGEM 1. Observe a família tipográfica (serif, sans-serif, display, manuscrita), o peso (light, regular, medium, bold, black) e o estilo (italic, normal). Mantenha exatamente o mesmo tipo de letra. NÃO modernize, NÃO substitua por fontes "mais limpas", NÃO troque serif por sans-serif (ou vice-versa).

PROPORÇÃO INTERNA: a relação de tamanho entre título, subtítulo, corpo de texto e detalhes deve permanecer EXATAMENTE como na IMAGEM 1, salvo se o [PEDIDO DO CLIENTE] pedir alteração explícita para algum desses textos.

[CONTEXTO DAS IMAGENS]
Você recebeu 1 imagem de referência:
- IMAGEM 1: a arte original do cliente. Extraia textos, logo, hierarquia e elementos gráficos daqui.

[PEDIDO DO CLIENTE]
{{PEDIDO_DO_CLIENTE — ex: "Aprimoramento geral, mantenha os mesmos textos" ou deixe em branco para apenas ajustar layout}}

[PAPEL]
Atue como um Diretor de Arte Sênior focado em design de comunicação. Sua tarefa é aprimorar o layout da peça fornecida, elevando organização, clareza e percepção de valor, com foco em leitura rápida em dispositivos móveis.

[RESTRIÇÕES ABSOLUTAS — O QUE NÃO ALTERAR]
- Preserve exatamente a mesma imagem de fundo da peça original.
- Mantenha a identidade visual e a paleta de cores da marca.
- Mantenha a mesma família tipográfica (ver INSTRUÇÃO TIPOGRÁFICA acima).
- Não altere, distorça ou reposicione a logo de forma a perder reconhecimento.

[DIRETRIZES DE COMPOSIÇÃO E TEXTO]
- Hierarquia visual: reorganize alinhamento e distribuição dos blocos de texto para leitura lógica e equilibrada, evitando poluição visual.
- Espaçamento: ajuste os respiros (white space) entre elementos para conforto de leitura.
- Ênfase: use peso da fonte, cor ou posição (NÃO tamanho) para destacar informações — exceto se o cliente pediu ampliação explícita.
- Contraste: garanta alto contraste do texto contra o fundo.

[ACABAMENTO ESTÉTICO]
- Aplique uma textura sutil e coerente APENAS no título principal, sem comprometer legibilidade.

[REFORÇO FINAL — REGRAS CRÍTICAS]
- TEXTOS COMPACTOS por padrão, mas respeite ajustes de tamanho pedidos explicitamente no [PEDIDO DO CLIENTE].
- FONTES IDÊNTICAS às da IMAGEM 1 — mesma família, peso e estilo.
- PROPORÇÕES TIPOGRÁFICAS preservadas para textos não citados no pedido — sem ampliação não solicitada.

O resultado deve ser uma versão altamente profissional, bem resolvida e orientada à conversão, mantendo a consistência e a essência da arte original do cliente.
```

---

## Variante 2 — Troca de fundo

Use quando vai anexar **a arte original (IMAGEM 1) + nova imagem de fundo (IMAGEM 2)** e quer combinar o conteúdo gráfico da peça original sobre o novo fundo.

```
[INSTRUÇÃO TIPOGRÁFICA — PRIORIDADE MÁXIMA]
Antes de qualquer outra modificação, examine cuidadosamente a tipografia da arte original (IMAGEM 1) e siga estas regras críticas:

TAMANHO DOS TEXTOS (padrão): os blocos de texto na versão melhorada devem ocupar no máximo um quarto (cerca de 25%) da área visual total da arte e permanecer COMPACTOS e DISCRETOS. Por padrão, mantenha o tamanho dos textos igual ou menor que a arte original.

EXCEÇÃO — PEDIDO EXPLÍCITO DO CLIENTE: se o [PEDIDO DO CLIENTE] solicitar aumento/diminuição de algum texto, respeite o pedido. Mantenha a proporção interna entre os demais textos não citados.

FIDELIDADE TIPOGRÁFICA: replique fielmente as fontes da IMAGEM 1 (família, peso, estilo). NÃO modernize, NÃO substitua por fontes "mais limpas".

PROPORÇÃO INTERNA: a relação de tamanho entre título, subtítulo e detalhes deve permanecer EXATAMENTE como na IMAGEM 1, salvo pedido explícito.

[CONTEXTO DAS IMAGENS]
Você recebeu 2 imagens de referência:
- IMAGEM 1: a arte original do cliente. Extraia textos, logo, hierarquia e elementos gráficos daqui.
- IMAGEM 2: nova imagem de fundo escolhida pelo cliente. Substitui completamente o fundo atual da IMAGEM 1.

[CORES DA MARCA]
A paleta oficial deste projeto:
{{CORES_DA_MARCA — ex: "- Vermelho: #C8102E\n- Bege: #F5E6D0" ou remova esta seção se não houver paleta}}
Priorize estas cores para textos, ênfases e elementos visuais quando precisar ajustar contraste ou hierarquia.

[PEDIDO DO CLIENTE]
{{PEDIDO_DO_CLIENTE — ex: "Substitua apenas o fundo, mantenha o resto idêntico" ou "Use o novo fundo e aumente o título"}}

[PAPEL]
Atue como um Diretor de Arte Sênior focado em design de comunicação. Sua tarefa é montar a versão final da peça posicionando os elementos da IMAGEM 1 sobre a nova imagem de fundo, com foco em leitura rápida em dispositivos móveis e elevando organização, clareza e percepção de valor.

[RESTRIÇÕES ABSOLUTAS — O QUE NÃO ALTERAR]
- Use a nova imagem de fundo (IMAGEM 2) como fundo da peça final, ocupando 100% da área visível. Não recorte de forma agressiva; preserve o ponto focal natural da imagem.
- Mantenha a identidade visual e a paleta de cores da marca.
- Mantenha a mesma família tipográfica.
- Não altere, distorça ou reposicione a logo de forma a perder reconhecimento.

[INTEGRAÇÃO DO NOVO FUNDO]
- Identifique o ponto focal e as áreas mais "limpas" da nova imagem de fundo e posicione os blocos de texto sobre essas áreas para preservar legibilidade.
- Se necessário, aplique um leve overlay (gradiente sutil escuro ou claro, no máximo 25% de opacidade) APENAS atrás dos textos para garantir contraste — nunca cobrindo a imagem inteira.
- Se a nova imagem de fundo tem alto contraste/cores fortes, ajuste a cor do texto e/ou da logo (mantendo a paleta da marca) para preservar legibilidade.
- Não altere a iluminação, saturação ou conteúdo da nova imagem de fundo em si — apenas a sobreponha.

[DIRETRIZES DE COMPOSIÇÃO E TEXTO]
- Hierarquia visual: reorganize alinhamento e distribuição dos blocos de texto para leitura lógica e equilibrada.
- Espaçamento: ajuste os respiros entre elementos para conforto de leitura sobre a nova imagem de fundo.
- Ênfase: use peso da fonte, cor ou posição (NÃO tamanho) para destacar informações — exceto se o cliente pediu ampliação explícita.
- Contraste: garanta alto contraste do texto contra o fundo — usando overlay sutil ou ajuste de cor de fonte se necessário.

[ACABAMENTO ESTÉTICO]
- Aplique uma textura sutil e coerente APENAS no título principal, sem comprometer legibilidade.

[REFORÇO FINAL — REGRAS CRÍTICAS]
- TEXTOS COMPACTOS por padrão, mas respeite ajustes pedidos explicitamente.
- FONTES IDÊNTICAS às da IMAGEM 1.
- PROPORÇÕES TIPOGRÁFICAS preservadas para textos não citados no pedido.
- FUNDO = nova imagem fornecida (IMAGEM 2), sem alterações de conteúdo na imagem em si.

O resultado deve ser uma versão altamente profissional e bem resolvida, combinando o conteúdo gráfico da IMAGEM 1 com o novo fundo, mantendo a essência e a identidade da marca do cliente.
```

---

## Variante 3 — Mudança de texto + ajuste de tamanho

Demonstra a capacidade nova de pedir aumento/redução explícita. Use quando quer **trocar palavras E redimensionar texto**.

```
[INSTRUÇÃO TIPOGRÁFICA — PRIORIDADE MÁXIMA]
Antes de qualquer outra modificação, examine cuidadosamente a tipografia da arte original (IMAGEM 1) e siga estas regras críticas:

TAMANHO DOS TEXTOS (padrão): os blocos de texto na versão melhorada devem ocupar no máximo um quarto (cerca de 25%) da área visual total da arte e permanecer COMPACTOS e DISCRETOS. Por padrão, mantenha o tamanho dos textos igual ou menor que a arte original.

EXCEÇÃO — PEDIDO EXPLÍCITO DO CLIENTE: se o [PEDIDO DO CLIENTE] solicitar aumento, diminuição ou redimensionamento de algum texto, respeite o pedido. O pedido do cliente tem prioridade sobre o padrão de compactação, mas mantenha a proporção interna entre os demais textos não citados.

FIDELIDADE TIPOGRÁFICA: replique fielmente as fontes da IMAGEM 1 (família, peso, estilo).

PROPORÇÃO INTERNA: preservada para textos não citados no pedido.

[CONTEXTO DAS IMAGENS]
Você recebeu 1 imagem de referência:
- IMAGEM 1: a arte original do cliente.

[PEDIDO DO CLIENTE]
{{PEDIDO_DO_CLIENTE — descreva claramente o que mudar. Exemplos prontos:

"Troque 'Almoço Executivo' por 'Happy Hour das 17h às 20h'. Aumente o título principal em ~30% para dar mais impacto e mantenha o subtítulo no mesmo tamanho."

"Mantenha todos os textos como estão, mas diminua o rodapé para ele ficar mais discreto."

"Destaque o preço 'R$ 39,90' com fonte maior e cor de marca; mantenha o resto exatamente como está."
}}

[PAPEL]
Atue como um Diretor de Arte Sênior focado em design de comunicação. Sua tarefa é aprimorar o layout da peça fornecida, atendendo ao pedido do cliente acima, elevando organização, clareza e percepção de valor.

[RESTRIÇÕES ABSOLUTAS — O QUE NÃO ALTERAR]
- Preserve exatamente a mesma imagem de fundo da peça original.
- Mantenha a identidade visual e a paleta de cores da marca.
- Mantenha a mesma família tipográfica.
- Não altere, distorça ou reposicione a logo de forma a perder reconhecimento.

[DIRETRIZES DE COMPOSIÇÃO E TEXTO]
- Hierarquia visual: reorganize alinhamento e distribuição dos blocos de texto para leitura lógica.
- Espaçamento: ajuste os respiros entre elementos para conforto de leitura, especialmente em torno dos textos redimensionados.
- Contraste: garanta alto contraste do texto contra o fundo.

[REFORÇO FINAL — REGRAS CRÍTICAS]
- Ajustes de tamanho de texto: só nos elementos explicitamente citados no [PEDIDO DO CLIENTE]. Demais textos preservam tamanho original.
- FONTES IDÊNTICAS às da IMAGEM 1.
- PROPORÇÕES TIPOGRÁFICAS preservadas para textos não citados.

O resultado deve ser uma versão altamente profissional, bem resolvida e orientada à conversão.
```

---

## Notas

- **Por que enumeramos "IMAGEM 1, 2, 3…"?** O modelo de imagem trata cada anexo como referência separada. Ordem importa — sempre anexe a arte original primeiro.
- **Sobre `25%` da área visual:** é o default do site (variável `OPENAI_IMAGE_TEXT_AREA_HINT`). Se a sua arte naturalmente tem muito texto, você pode adaptar esse número no prompt.
- **Para resultado fiel à marca:** preencha `[CORES DA MARCA]` com hex codes. O modelo prioriza essas cores em textos e ênfases.
- **Limites práticos:** modelos com visão funcionam melhor com artes legíveis (não fotos baixíssima resolução). Resolução mínima recomendada: 1080×1080.
