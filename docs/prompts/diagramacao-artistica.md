# Prompt: Diagramação artística (quebrar a padronização do template)

Preset de melhoria cujo objetivo **não** é corrigir a foto, e sim **redesenhar a
diagramação dos textos** — para que artes geradas em escala a partir do mesmo
template não pareçam a mesma arte repetida.

> **Modelo:** `gpt-image-2` via `images.edit`, `quality: "high"`.
> **Entrada:** a arte final achatada (foto + textos), como IMAGEM 1.
> **Importante:** aqui a IA *redesenha* o texto. Isso é intencional — é o ponto
> da feature. Em contrapartida exige verificação automática de texto na saída
> (ver § "Verificação obrigatória em automação" no fim).

---

## O prompt

Preencha o que estiver entre `{{ }}`. Seções vazias podem ser removidas.

```
[PAPEL]
Atue como diretor de arte de social media, especializado em cartazes e peças
para Instagram. Sua tarefa é REDESENHAR A DIAGRAMAÇÃO dos textos da IMAGEM 1,
dando personalidade tipográfica e integrando o texto à fotografia. O conteúdo
escrito e a família tipográfica são intocáveis — a criatividade está na
composição: posição, escala, ornamentos, destaques e relação com a foto.

[TEXTO EXATO — VERBATIM, PRIORIDADE MÁXIMA]
A peça contém exatamente os textos abaixo. Reproduza cada um letra por letra,
sem traduzir, sem corrigir, sem abreviar, sem duplicar e sem acrescentar nada:
- Título: "{{TITULO}}"
- Subtítulo: "{{SUBTITULO}}"
- Rodapé: "{{RODAPE}}"
- CTA: "{{CTA}}"
Nenhum outro texto pode existir na imagem final. Sem marca d'água.

[IDENTIDADE DA MARCA — {{NOME_DO_PROJETO}}]
Paleta oficial (use SOMENTE estas cores em textos, destaques e grafismos):
{{- Nome: #HEX}}
Tipografia: mantenha a MESMA FAMÍLIA tipográfica da IMAGEM 1. Você PODE variar
peso (regular/bold/black), caixa e espaçamento entre letras dentro dessa família
quando isso melhorar a hierarquia. Você NÃO pode trocar a família, nem misturar
uma fonte nova, nem "modernizar" o desenho das letras.
Estilo da marca: {{BRAND_STYLE_DESCRIPTION}}

[LEITURA DA FOTO — FAÇA ISTO ANTES DE DIAGRAMAR]
Identifique o tipo de fotografia e siga a direção correspondente:

• PRODUTO / PRATO / BEBIDA — o produto é o herói e não pode ser encoberto.
  Use os respiros acima e abaixo dele. O texto pode encostar na silhueta e criar
  profundidade, mas nunca cobrir a parte mais apetitosa (o corte, o brilho da
  gordura, a espuma, o recheio).

• AMBIENTE / LUGAR / FACHADA / SALÃO — costuma ter áreas amplas e uniformes
  (parede, céu, chão, mesa vazia). Ocupe essas áreas com blocos maiores e mais
  confiantes. Alinhe o texto às linhas arquitetônicas e respeite a linha do
  horizonte — texto cortando o horizonte no meio empobrece a foto.

• PESSOAS — NUNCA cubra rostos, olhos, mãos em ação ou o gesto que conta a
  história. Leve o texto para o lado livre do quadro ou para abaixo da linha dos
  ombros. O recurso mais forte aqui é a profundidade: parte do texto passando
  ATRÁS da silhueta da pessoa. Evite marca-texto sobre pele.

• DETALHE / TEXTURA / MACRO / FUNDO ABSTRATO — maior liberdade. O texto pode ser
  o herói, em escala grande, sobreposto com ousadia.

[DIAGRAMAÇÃO ARTÍSTICA]
Escolha NO MÁXIMO DOIS recursos do repertório abaixo (além do destaque de
palavras-chave, que é sempre permitido). Mais que dois vira poluição visual.
{{RECURSO_SUGERIDO — opcional: force um recurso específico para garantir
variedade entre artes da mesma semana}}

  1. Linha de base curva/em arco no título, acompanhando a forma do assunto.
  2. Ornamento fino da marca: filete, swoosh, moldura de cantos, ou um ícone
     pequeno derivado da logo, posicionado como coroamento do título.
  3. Contraste forte de escala entre palavras da MESMA frase.
  4. Empilhamento com alinhamentos alternados (uma linha à esquerda, a seguinte
     centralizada ou à direita).
  5. Filete ou régua separando blocos de informação.
  6. Badge/selo para a informação secundária (preço, dia, horário).
  7. Profundidade: parte do texto passando atrás do assunto principal.
  8. Kicker (olho) acima do título: linha curta, pequena, bem espaçada.

[PALAVRAS-CHAVE — LEITURA DINÂMICA]
Destaque de 1 a 3 palavras{{, obrigatoriamente estas: "{{PALAVRAS_CHAVE}}"}}.
- Escolha apenas substantivos, números, dias ou horários que carreguem a
  informação. Nunca artigos, preposições ou conectivos.
- Use UMA única técnica de destaque na peça inteira, aplicada de forma
  consistente: marca-texto sólido na cor da marca, OU troca de cor da palavra,
  OU peso tipográfico maior. Não misture técnicas.
- Se usar marca-texto, garanta contraste alto entre a caixa e a palavra dentro
  dela.

[ILUMINAÇÃO E TRATAMENTO DA FOTO]
Mantenha a cena, o enquadramento e todos os elementos da fotografia original.
Ajuste apenas o tratamento: luz direcional natural que revele textura, relevo e
volume do assunto; contraluz sutil para separar o assunto do fundo; realces
controlados, sem estourar; sombras com informação, sem chapar em preto.
{{TRATAMENTO_EXTRA — ex: "escureça levemente o entorno para concentrar a
atenção no assunto" ou "desfoque o fundo em bokeh"; deixe em branco para
preservar a cena como está}}

[LEGIBILIDADE — INEGOCIÁVEL]
- Nenhuma letra pode ficar sobre uma região de alto detalhe sem apoio de
  contraste.
- Quando precisar de contraste, use gradiente ou sombra suave (no máximo 25% de
  opacidade) APENAS atrás do texto — nunca sobre a imagem inteira.
- Todo texto deve ser legível em tela de celular, à distância de um braço.

[PEDIDO DO CLIENTE]
{{USER_REQUEST}}
Este pedido tem prioridade sobre as diretrizes de diagramação acima, mas nunca
sobre [TEXTO EXATO] nem sobre [IDENTIDADE DA MARCA].

[NÃO FAÇA]
- Não altere, traduza, corrija, encurte ou acrescente NENHUMA palavra.
- Não troque a família tipográfica nem introduza uma segunda fonte.
- Não use cores fora da paleta da marca em textos e grafismos.
- Não redesenhe, distorça, recolora nem recorte a logo — pode apenas
  reposicioná-la, mantendo proporção e cores.
- Não cubra rostos nem o ponto focal do assunto principal.
- Não substitua, adicione ou remova objetos, alimentos ou pessoas da fotografia.
- Não deixe aparência de renderização 3D ou ilustração — é fotografia real.

[REFORÇO FINAL]
TEXTO: verbatim, nada a mais. FAMÍLIA TIPOGRÁFICA: a mesma (peso pode variar).
CORES: só a paleta. DESTAQUES: 1 a 3 palavras, uma técnica só. LOGO: intocada.
NO MÁXIMO 2 recursos de diagramação.
```

---

## Por que este prompt é curto perto do anterior

O prompt legado (`melhorar-arte-externo.md`) gastava mais da metade do texto
proibindo variação tipográfica — "textos compactos", "proporção interna
EXATAMENTE como na IMAGEM 1", "ênfase por peso, cor ou posição, NÃO tamanho".
Essas regras existiam para o preset conservador e **impedem** o resultado
artístico. Aqui elas foram removidas de propósito; o que sobrou de restrição
protege só o que não pode mudar: as palavras, a família tipográfica, a paleta e
a logo.

Da mesma forma, a instrução de "aplicar textura sutil no título principal" saiu:
ela era incondicional no código e trabalha contra acabamentos chapados e limpos.

---

## Verificação obrigatória em automação

Neste preset a IA redesenha o texto, então erro de grafia é o modo de falha nº 1
— e em geração automatizada ninguém confere arte por arte. Antes de publicar,
rode uma checagem de visão sobre a imagem gerada:

1. Extraia todo o texto visível da imagem gerada.
2. Compare, normalizado (maiúsculas, acentos, espaços), com os valores de
   `Generation.fieldValues` que alimentaram o template.
3. Divergiu, sobrou ou faltou texto → descarte e tente de novo (até 2 vezes);
   persistindo, devolva a arte original e sinalize para revisão humana.

Sem esse passo, a automação publica erro de grafia com a cara da marca.

---

## Variedade entre artes da mesma semana

Se todas as artes usarem arco + marca-texto, a padronização volta — só que numa
roupa nova. Alimente `{{RECURSO_SUGERIDO}}` com um recurso diferente a cada peça
(rodízio pelo repertório de 8), para que a grade da semana tenha ritmo visual.
