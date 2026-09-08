# Sessão 2026-09-08 — o diretor religado, a máscara medida e recusada, o tom casado por código

Continuação de `docs/SESSAO-2026-09-08-MANUAL-E-DUAS-PORTAS.md` (madrugada, PR #107).
Tudo desta sessão está no PR #109 (`diretor-nas-portas`). Treze gerações reais
(25 créditos e ~US$ 0,10 cada), todas medidas em CIELAB contra a foto original.

## 1. O que o Ciro pediu, na ordem

1. Religar o diretor de arte dentro das portas, sem halo/gradiente, usando o
   briefing dele para o happy hour da Wine Vix como molde, e analisar a
   referência em vez de enviá-la ao gpt-image.
2. Gerar uma peça na Wine Vix com referência e mostrar.
3. Ler a conversa dele com o ChatGPT e dizer se dava para melhorar.
4. Implementar a máscara, gerar de novo, testar em mais três clientes e
   decidir se é o melhor caminho; depois considerar as lições da conversa.
5. Passada cirúrgica para aumentar o rodapé; opinião sincera sobre a máscara.
6. **Decisão final: sem máscara.** Documentar e voltar ao gpt-image direto.

## 2. O diretor religado (commits `f8449028`, `0e6d9d00`)

O PR #107 tinha posto as duas portas antes do diretor; com `brandManualUrl`
nos 11 projetos, toda peça avulsa saía de um molde fixo. Agora a porta decide
as IMAGENS (foto + manual) e o diretor (`gpt-5.2`) escreve o BRIEFING em
português, por seções, no molde do Ciro. A referência escolhida à mão é vista
só pelo diretor. A foto chega com medida (mapa de calma em nove regiões +
catálogo v3). Sete travas mecânicas com teste; as duas novas nasceram no By
Rock no mesmo dia (caixa da copy intocada; marca nunca no canto do avatar).
Detalhe na seção "O diretor de arte religado dentro das portas" do CLAUDE.md.

Três briefings reais sem gerar imagem (`scripts/ver-prompt-do-diretor.ts`),
depois duas gerações na Wine Vix: a primeira pendurou o serviço na manchete
(trava só olhava a palavra RODAPÉ); a segunda, com a trava por seção, saiu
com o serviço isolado em 88–94% da altura.

## 3. A foto escura: medição

O Ciro viu a peça "saturada". Medido (L* = luz média CIELAB; foto original 44,3):

| peça | L* | Δ | croma |
|---|---|---|---|
| ontem, porta antiga | 32,8 | -26% | 26,8 |
| diretor, 1ª rodada | 27,7 | -38% | 25,2 |
| diretor, 2ª rodada ("sem alterar luz, cor…" escrito) | 26,5 | -41% | 26,2 |

O croma real CAI; "saturada" é a foto escura com sombras fechadas. Terceira
medição da casa provando que prompt não segura a foto (antes: 01/09 e 04/09).

## 4. A máscara (commit `9bcd8da8`, depois removida do runner)

`mascara-da-geracao.ts`: foto cortada no quadro final, zonas declaradas pelo
diretor viram a área transparente, `images.edit` com máscara.

| medição (Wine Vix) | diferença fora das zonas |
|---|---|
| controle: foto reencodada em JPEG 90 | 0,6 |
| peça gerada COM máscara da API | 29,8 (sinal negativo nas 9 regiões) |
| depois da restauração por código | 0,0 |

**A máscara do gpt-image-2 é orientação, não garantia.** O que zera é código:
LUT por canal calculado nos pixels fora das zonas + recomposição da foto
original fora delas (`restaurarFotoForaDasZonas`). Dois defeitos meus no
caminho: o sharp devolve o raw borrado em 3 canais para entrada de 1 (ler com
stride errado espalhava alpha; 8,8 de resíduo que parecia feather); e o texto
transborda a zona ("sabore" com o "s" cortado) — a faixa de transbordo mantém
o que o modelo pintou perto da zona.

### Quatro clientes

| cliente | logo | resultado | L* vs foto |
|---|---|---|---|
| Wine Vix | compor | bem: foto intacta, bloco na região calma medida | -8% (tudo dentro das zonas) |
| TERO | compor | aceitável; fundo chapado atrás do título | -18% (faixa do título -82) |
| By Rock | modelo | **mal**: retângulo preto atrás da manchete, CTA fora da zona apagado, pedaço do bolo redesenhado mantido pela faixa de transbordo (emenda) | -9% |
| Real Gelateria | modelo | diretor recusado 3× ("gradiente", que o DNA da Real descreve) → molde sem máscara | -20% |

A peça do By Rock de 24/08, em que o modelo reenquadrou o bolo para baixo, é
a melhor do conjunto. A máscara tira do modelo justamente o enquadramento.

**Veredito: a máscara perde em 2 de 4.** Ela garante fora da zona e não
governa dentro: fundo chapado (o véu de volta, com borda), texto fora da caixa,
composição presa ao corte central. Decisão do Ciro: "é o que eu imaginava,
não vamos usar". Código da máscara REMOVIDO do runner e do diretor
(`zonas`, `mascara`); o módulo fica para o tom casado e a passada cirúrgica.

## 5. O tom casado por código (adotado)

`casarTomGlobal`: LUT por canal levando o histograma da peça inteira ao da
foto original, sem máscara e sem corte — o modelo enquadra como quer.

| peça | L* gerada | L* casada | foto |
|---|---|---|---|
| Wine Vix, 2ª rodada | 26,4 | 44,5 | 44,5 |
| Real Gelateria | 46,0 | 57,7 | 57,8 |
| Wine Vix, ontem | 32,8 | 44,4 | 44,5 |

Sem retângulo, sem emenda, texto claro só clareia um pouco. Prova ponta a
ponta na Wine Vix: 95s, 1ª tentativa do diretor, `fieldValues.tomCasado`.
Não corrige mudança LOCAL (fundo chapado, objeto movido). `ARTE_TOM_CASADO=off`
desliga.

## 6. Os recusados em série e o rodapé

- O diretor tratava "Funcionamento - 10h às 22h" como APOIO da manchete e era
  recusado 2–3× seguidas pela trava do rodapé (a Real caiu no molde por isso).
  Resolveu o CONTEXTO apontar os blocos de serviço classificados por
  `blocosDeServico`. Depois disso, 1ª tentativa. A trava olha seções de
  bloco, não "qualquer lugar antes" (mencionar o horário na FOTO DE FUNDO não
  é pendurar).
- Rodapé miúdo (Ciro): pedir 50 px rendeu ~30; pedir "metade da altura de uma
  linha da manchete" também não segurou. **Tamanho de texto é número no
  compositor e sorte no gpt-image.**

## 7. A passada cirúrgica (commit `bd459495`)

`passada-cirurgica.ts`: máscara só na zona da correção, `images.edit`, e a
própria peça recomposta fora dela. Cinco tentativas no rodapé da Wine Vix
(~30s, ~US$ 0,008 cada), fora da zona sempre 0,0:

| tentativa | dentro da zona |
|---|---|
| 1 ("dobro") | trocou fonte e cor; endereço cortado |
| 2 ("50%", fonte e cor nomeadas) | certa — fantasma da linha antiga |
| 3 | fantasma de novo |
| 4 (feather curto) | faixa chapada no rodapé |
| 5 (zona até 99,5%) | limpa — fonte virou serifa |

O fantasma era da recomposição (a zona terminava em 97% sobre a linha a 94%);
a zona precisa conter o conteúdo antigo com folga. O resto é o modelo: 1 em 5.
Fica como botão de ajuste fino na mão de quem aprova — nunca etapa automática.

## 8. Da conversa com o ChatGPT

Ele propõe diretor → gpt-image → revisor com regeneração automática, perfil
de marca, lista longa de proibições, "reduzir a luminosidade atrás do texto".
Quatro quintos já existem aqui; o revisor automático é o que a casa desligou
em 10/08 e 12/08; a lista de proibições e o véu contradizem o medido — e o
próprio ChatGPT admitiu ter recriado a ponte e o skyline com esse prompt.
Entrou: o DIAGNÓSTICO estruturado antes do briefing (intacto, problema
principal, hierarquia), gravado por peça. A passada cirúrgica é a segunda ideia
dele, medida acima.

## 9. Em aberto

- Medir o diretor em produção com feedback real (Vix, Real, By Rock).
- DNA da Real Gelateria descreve "gradiente de leitura" e o diretor ecoa;
  mesma limpeza feita no Quintal em 05/09 (decisão do Ciro).
- Rodapé pequeno: sem solução por prompt; o caminho determinístico é a peça
  ser página do editor (`compor`).
- `conferirLogo` continua órfã.
