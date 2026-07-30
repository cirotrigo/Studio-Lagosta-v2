/**
 * Direção de arte padrão da melhoria com IA — o miolo editável do prompt.
 *
 * A premissa é que **a fotografia é a protagonista** e o texto é complemento.
 * Foi validada em teste real (Espeto Gaúcho, 29-30/07/2026) contra a versão
 * anterior, que dava liberdade tipográfica ampla e produzia títulos
 * desproporcionais — palavra isolada maior que o próprio prato.
 *
 * ⚠️ O teto de área de texto (15–20%, nunca mais de 25%) é DELIBERADO e
 * reinstaura um limite que a versão de 29/07 havia removido. A remoção partia
 * da ideia de que regra de área achatava a criatividade; o teste mostrou o
 * contrário — sem teto, o modelo sacrifica a foto. A criatividade continua
 * existindo, mas em peso, cor, contraste e posição, não em tamanho.
 *
 * Não repita aqui nada que o sistema já injeta: paleta da marca, tipografia por
 * papel, mapa das IMAGEM 1/2/3 e o pedido feito na hora são montados em
 * `buildPrompt` a partir do banco.
 *
 * Cada projeto pode substituir este bloco por um próprio em
 * `Project.artImprovementPrompt` (aba Configurações) — é assim que se aperta o
 * cinto caso a caso, sem endurecer o padrão para todo mundo.
 *
 * Mora em módulo separado, sem dependências, porque o card de configuração é um
 * componente client e importar `openai-image-client` arrastaria o SDK da OpenAI
 * para o bundle do navegador.
 */
export const DEFAULT_ART_DIRECTION = `[OBJETIVO]
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
- Não redesenhe, distorça nem recolora a logo — pode apenas reposicioná-la,
  mantendo proporção e cores.
- Não substitua, adicione nem remova objetos, alimentos ou pessoas da fotografia.
- O resultado é fotografia real: sem aparência de renderização 3D ou ilustração.`
