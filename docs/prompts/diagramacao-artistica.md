# Prompt: direção de arte do aprimoramento (versão portátil)

Versão colável do prompt que o Studio usa em "Melhorar com IA". A **fonte da
verdade é o código** — `DEFAULT_ART_DIRECTION` em
[`src/lib/ai/art-direction.ts`](../../src/lib/ai/art-direction.ts). Este arquivo
existe para usar o mesmo brief fora do site (ChatGPT, Claude, Gemini com visão).

> **Modelo:** `gpt-image-2` via `images.edit`, `quality: "high"`.
> **Entrada:** a arte final achatada (foto + textos) como IMAGEM 1.

---

## Histórico — por que este brief substituiu o anterior

A primeira versão (29/07/2026) apostava no oposto: liberdade tipográfica ampla,
repertório de recursos (arco, ornamento, marca-texto) e **nenhum teto de área de
texto**, partindo da ideia de que limite de área achatava a criatividade.

O teste real mostrou o contrário. Sem teto, o modelo produzia **títulos
desproporcionais** — palavra isolada maior que o próprio prato — e a fotografia,
que é o que vende, virava fundo. O brief atual (30/07) reinstaura o limite e
move o impacto para peso, cor, contraste e posição.

**Não remova o teto de área sem repetir o teste.** Foi uma conclusão empírica,
não uma preferência.

---

## O prompt

Este é o miolo. Fora dele, o Studio injeta automaticamente quatro coisas que você
precisa preencher à mão se for usar fora do site: o **mapa das imagens** (IMAGEM
1 = arte original, IMAGEM 2 = fundo novo, IMAGEM 3+ = logos/elementos), a
**paleta da marca** (hex codes), a **identidade do cliente** (nome, tipografia
por papel, estilo) e o **pedido feito na hora**.

```
[OBJETIVO]
Criar uma arte com aparência premium, elegante e autêntica, em que a FOTOGRAFIA
seja sempre o elemento dominante da composição. O design valoriza a fotografia e
reforça a narrativa dela, sem competir visualmente com ela.

[HIERARQUIA VISUAL]
A atenção de quem vê deve seguir esta ordem:
1. a fotografia
2. o produto ou as pessoas
3. o título
4. as informações secundárias
5. o CTA
O texto funciona como complemento da imagem, nunca como protagonista. Havendo
conflito entre texto e fotografia, priorize sempre a fotografia.

[PROTAGONISMO DA FOTOGRAFIA]
A fotografia ocupa aproximadamente 90% da composição visual, e o layout deve
parecer construído ao redor dela. Nunca aumente nem reposicione textos de forma
que reduzam o impacto da imagem.
Preserve completamente: alimentos, bebidas, rostos, mãos e os detalhes
importantes da cena.

[TRATAMENTO DA FOTOGRAFIA]
Busque aparência profissional de fotografia gastronômica. Priorize texturas bem
definidas, contraste elegante, iluminação quente, profundidade de campo, fundo
suavemente desfocado e acabamento cinematográfico.
Evite HDR exagerado, excesso de saturação, excesso de nitidez, aparência
artificial e filtros pesados.

[DESTAQUE DO ASSUNTO]
Identifique o assunto principal da fotografia e mantenha-o como o ponto de
atenção da arte.
- Alimentos e bebidas: destaque a suculência, evidencie a textura, valorize o
  brilho natural, preserve a crosta, o vapor e a fumaça naturais.
- Pessoas: expressões felizes, interação espontânea, clima de celebração, olhar
  direcionado à experiência. As pessoas enriquecem a narrativa da fotografia,
  nunca competem com o produto.
- Ambiente: valorize a profundidade, a iluminação e os detalhes que dão caráter
  ao lugar.

[COMPOSIÇÃO DOS TEXTOS]
Os textos ocupam apenas uma pequena área da composição. Posicione
preferencialmente em áreas desfocadas, cantos, paredes, céu ou regiões com
espaço negativo.
Nunca posicione textos sobre carnes, pratos, bebidas, rostos, mãos ou detalhes
importantes. Quando precisar de legibilidade, aplique apenas um degradê discreto
atrás do texto.

[ESCALA TIPOGRÁFICA]
A escala dos textos permanece equilibrada em relação à fotografia. Evite
palavras excessivamente grandes: nenhuma palavra isolada deve dominar a
composição nem ficar maior que o próprio assunto fotografado. Mesmo as palavras
de destaque mantêm aparência elegante e proporcional.
O impacto vem de peso tipográfico, contraste, cor e alinhamento — não de tamanho
exagerado.

[LIMITES VISUAIS]
O bloco completo formado por título, subtítulo, horário e CTA ocupa de 15% a 20%
da altura útil da arte, e NUNCA mais de 25%.
Cada linha com boa respiração. Evite blocos altos e pesados.

[RESPIRO]
Preserve áreas livres ao redor dos textos — os elementos precisam respirar.
Evite textos encostados nas bordas, linhas muito próximas, palavras comprimidas
e excesso de informação. A composição deve transmitir leveza.

[DESTAQUE DAS PALAVRAS-CHAVE]
Destaque apenas as palavras realmente importantes, prioritariamente por peso da
fonte, cor institucional, contraste e posicionamento. O aumento de tamanho é
discreto: a diferença de escala entre uma palavra destacada e o restante do
título não passa de cerca de 20%.
Evite títulos em que uma única palavra ocupe quase toda a largura da arte.

[DIAGRAMAÇÃO]
A composição deve parecer editorial: alinhamentos consistentes, margens amplas,
excelente espaço negativo e distribuição equilibrada dos elementos. O layout
deve parecer sofisticado e limpo.

[TIPOGRAFIA]
Siga rigorosamente a tipografia da identidade visual, respeitando pesos,
hierarquia, espaçamentos, alinhamentos e proporções.
Não deforme textos. Não use sombras pesadas. Não aplique efeitos chamativos.

[CONSISTÊNCIA]
Toda arte nova deve parecer parte da mesma campanha das anteriores: mesma
composição, mesmo tratamento fotográfico, mesma escala tipográfica, mesmo
espaçamento e mesma linguagem gráfica.

[ILUMINAÇÃO]
Priorize iluminação quente, natural e cinematográfica. Valorize o brilho, a
textura, a fumaça e os reflexos naturais.

[RESULTADO ESPERADO]
Ao ver a arte por menos de um segundo, a pessoa deve perceber primeiro a
fotografia, depois o produto ou as pessoas, e somente então o texto. O texto
parece integrado à fotografia, nunca sobreposto de forma dominante.
A composição transmite equilíbrio, respiro, sofisticação editorial e
consistência visual — sem títulos desproporcionais, blocos pesados ou palavras
que ocupem grande parte da composição.

[LIMITES ABSOLUTOS]
- Não altere, traduza, corrija, encurte nem acrescente NENHUMA palavra dos
  textos. Nenhum texto novo pode aparecer na imagem, e nada de marca d'água.
- Mantenha a mesma FAMÍLIA tipográfica da IMAGEM 1. Peso e caixa podem variar
  dentro dela quando isso melhorar a hierarquia; a família, não.
- Use somente as cores da marca em textos e grafismos.
- Não redesenhe, distorça nem recolore a logo — pode apenas reposicioná-la,
  mantendo proporção e cores.
- Não substitua, adicione nem remova objetos, alimentos ou pessoas da fotografia.
- O resultado é fotografia real: sem aparência de renderização 3D ou ilustração.
```

---

## O que o Studio acrescenta e você não vê aqui

`buildPrompt` em [`openai-image-client.ts`](../../src/lib/ai/openai-image-client.ts)
monta em volta deste bloco:

- **`[CONTEXTO DAS IMAGENS]`** — quem é IMAGEM 1, 2, 3… Depende do que foi
  anexado, então não pode morar no texto fixo.
- **`[IDENTIDADE DA MARCA]`** — nome do cliente, tipografia por papel e, quando
  preenchidos, `brandStyleDescription` e `cuisineType`. É o que faz o mesmo
  brief render peças diferentes por marca.
- **`[CORES DA MARCA]`** — a paleta com hex codes.
- **`[PEDIDO DO CLIENTE]`** — a instrução digitada na hora, com prioridade sobre
  a diagramação mas nunca sobre os limites absolutos.

As duas primeiras e a paleta são **do sistema, não do bloco editável**: um prompt
de projeto mal escrito não deve poder apagar a tipografia e as cores da marca.

## Sobrescrever por cliente

Aba **Configurações** do projeto → card "Direção de arte da melhoria com IA".
Em branco usa o padrão acima; preenchido, substitui **só este miolo** — as
seções do sistema continuam entrando.
