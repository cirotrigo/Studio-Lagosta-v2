/**
 * Direção de arte padrão da melhoria com IA — o miolo editável do prompt.
 *
 * A premissa é dar liberdade criativa ao modelo e passar só o essencial: artes
 * geradas em escala a partir do mesmo template precisam parecer peças
 * diferentes, e regra demais achata o resultado. O que sobra de restrição aqui
 * protege apenas o que não pode mudar (palavras, família tipográfica, paleta,
 * logo).
 *
 * Cada projeto pode substituir este bloco por um próprio em
 * `Project.artImprovementPrompt` (aba Configurações) — é assim que se aperta o
 * cinto caso a caso, sem endurecer o padrão para todo mundo.
 *
 * Mora em módulo separado, sem dependências, porque o card de configuração é um
 * componente client e importar `openai-image-client` arrastaria o SDK da OpenAI
 * para o bundle do navegador.
 */
export const DEFAULT_ART_DIRECTION = `[PAPEL]
Atue como diretor de arte de social media. Redesenhe a DIAGRAMAÇÃO dos textos da
IMAGEM 1, dando personalidade tipográfica e integrando o texto à fotografia. Use
os recursos que a peça pedir: linha de base curva no título, ornamento fino
derivado da marca, contraste de escala entre palavras, alinhamentos alternados,
filete separando blocos, badge para informação secundária, ou profundidade (parte
do texto passando atrás do assunto). Prefira dois recursos bem resolvidos a
muitos recursos empilhados.

[LEITURA DA FOTO — ANTES DE DIAGRAMAR]
Identifique o assunto da fotografia e trate-o como herói:
- Produto, prato ou bebida: use os respiros ao redor dele; o texto pode encostar
  na silhueta, mas nunca cobrir a parte mais apetitosa.
- Ambiente, fachada ou salão: ocupe as áreas amplas e uniformes com blocos
  maiores; alinhe às linhas arquitetônicas e não corte a linha do horizonte ao
  meio.
- Pessoas: nunca cubra rostos, olhos ou mãos em ação. Leve o texto para o lado
  livre do quadro ou para abaixo da linha dos ombros.
- Detalhe, macro ou textura: liberdade total — o texto pode ser o herói.

[DESTAQUE PARA LEITURA DINÂMICA]
Destaque de 1 a 3 palavras que carreguem a informação (o produto, o preço, o dia,
o horário) — nunca artigos, preposições ou conectivos. Use UMA única técnica na
peça inteira: marca-texto sólido na cor da marca, troca de cor da palavra, ou
peso tipográfico maior. Não misture técnicas.

[TRATAMENTO DA FOTO]
Mantenha a cena, o enquadramento e todos os elementos da fotografia. Ajuste
apenas a luz: direcional e natural, revelando textura, relevo e volume do
assunto; contraluz sutil para separá-lo do fundo; realces controlados, sem
estourar; sombras com informação, sem chapar em preto.

[LIMITES]
- Não altere, traduza, corrija, encurte nem acrescente NENHUMA palavra.
- Mantenha a mesma FAMÍLIA tipográfica da IMAGEM 1. Peso, caixa e espaçamento
  entre letras podem variar quando isso melhorar a hierarquia; a família, não.
- Use somente as cores da marca em textos e grafismos.
- Não redesenhe, distorça nem recolora a logo — pode apenas reposicioná-la,
  mantendo proporção e cores.
- Não substitua, adicione nem remova objetos, alimentos ou pessoas da fotografia.
- Quando precisar de contraste, use gradiente ou sombra suave (no máximo 25% de
  opacidade) apenas atrás do texto, nunca sobre a imagem inteira.
- Todo texto deve ser legível em tela de celular, à distância de um braço.
- Resultado é fotografia real: sem aparência de renderização 3D ou ilustração.`
