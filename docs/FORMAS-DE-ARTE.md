# As formas de gerar uma arte — e qual propor

Documento único das skills `/content-planner` e `/arte-rapida`. Se as duas
escreverem a própria versão disto, elas divergem.

A lógica de escolha é código, não prosa:
**`src/lib/creatives/forma-de-arte.ts`**. Leia-o antes de recomendar — é ele que
sabe qual cliente prefere o quê e por quê.

---

## A regra que vale acima de todas

🔴 **UMA recomendação, nunca um menu.** Quem opera não é técnico. Seis opções é
pior que nenhuma — é a mesma armadilha do crivo de aprovação, que virou pedágio
que se paga sem ler.

O formato é sempre este, em uma linha:

> "Vou montar os cinco stories do TERO com a identidade do cliente (sem
> crédito), porque a IA vem sendo reprovada nesse cliente. Prefere deixar a IA
> desenhar?"

Escolha feita · motivo em meia frase · **uma** saída. Depois disso, siga — não
espere aprovação para começar.

Se a pessoa já disse como quer ("gera pela IA", "faz no editor"), **obedeça sem
recomendar nada**. Conselho não pedido sobre uma decisão já tomada é ruído.

---

## As seis formas

| Forma | Como falar dela | Custo | Vira página editável? |
|---|---|---|---|
| `modelo` | "usar um layout pronto do cliente" | sem crédito | **sim** |
| `compositor` | "montar com a identidade do cliente" | sem crédito | **sim** |
| `ia` | "deixar a IA desenhar" | 25 créditos | **não** — é imagem |
| `editor` | "fazer no editor do Studio" | sem crédito | **sim** |
| `repost` | "repostar uma que já deu certo" | sem crédito | não se aplica |
| `canvas` | "pedir para o Claude montar no canvas" | sem crédito | não |

🔴 **A coluna da direita é a que mais importa e a menos óbvia.** A IA entrega
uma IMAGEM: "ajustar depois" ali só existe por *melhorar com IA*, que é outra
chamada paga e é redesenho, não ajuste fino. Quem quer mexer no texto ou mover
uma caixa depois **precisa** de `modelo`, `compositor` ou `editor`.

Quando alguém disser "prefiro o editor porque depois eu ajusto", a resposta
quase sempre é **compositor**, não editor: ele dá o acabamento e a página
editável ao mesmo tempo, e não exige desenhar do zero.

---

## Por onde cada uma passa

**`modelo`** — o layout que a marca já aprovou, preenchido com a copy e a foto.
1. `escolher-modelo` (ou `prepare-creative`, no servidor local) com o tema.
2. `criar-arte-de-modelo` / `create-arte-rapida`.
Se nada casar com o tema, a busca **falha** em vez de escolher qualquer um —
esse é o sinal de que a via do modelo não serve para esta peça. Só 9 dos 30
pilares da carteira têm modelo, então isso acontece com frequência.

**`compositor`** — a assinatura do cliente aplicada à foto.
1. `ver-assinatura` para saber os papéis de copy daquele formato.
2. `compor-arte` (uma peça) ou `compor-leva` (a semana).
Escreva a copy **contra os papéis que a variante tem** — papel que não existe
sai da peça. Todos os 10 restaurantes têm assinatura cadastrada.

**`ia`** — o gpt-image desenha a peça inteira.
`gerar-imagem` para uma peça; para uma leva, `criar-plano` + `executar-plano`
(que devolve a conta antes e só produz na segunda chamada, com `confirmar`).

**`editor`** — crie a página e entregue o link; quem opera desenha.

**`repost`** — `sugerir-repost`. Vale mais do que parece num horário de rotina:
sem crédito, sem trabalho, e a arte já foi aprovada uma vez.

**`canvas`** — os artboards `.dc.html` em `design-canvas/<cliente>-<assunto>/`,
gerados por `gerar.py` (Python + Pillow mede texto e luz da foto), renderizados
por `render.py` e trazidos por `upload-creative`. Melhor acabamento da casa e o
único que **não é autoatendimento**: quem monta sou eu. Ofereça como "posso
montar essa leva no canvas", nunca como opção de menu.

**Higgsfield / `human-image` não é opção.** Decisão do Ciro, 09/09/2026.

---

## Onde a leva termina

Padrão: **agenda, como rascunho** — `colocar-na-agenda` com o `pageId` da peça
(nunca o `generationId`, senão o post nasce sem página e o botão "Editar
Template" some da agenda). A bancada só quando a pessoa pedir "bancada".

---

## Revisar a lista

`npx tsx scripts/placar-de-motores.ts` mostra o placar de "gostei / preciso
melhorar" por cliente e motor, com as datas. Somente leitura.

🔴 **Leia o cabeçalho do script antes de concluir qualquer coisa dele.** Três
armadilhas medidas em 09/09/2026: "gostei" é subnotificado; motor sem sinal
quase sempre significa "ninguém clicou", não "ninguém usou" (o compositor
produziu setembro inteiro com zero sinais); e as reprovações vêm concentradas
em **um dia por cliente** — são sessões de revisão de leva, não qualidade
contínua. Placar velho condena motor que já melhorou.

Mudou a preferência de um cliente? A alteração é uma linha em
`PREFERENCIA_POR_PROJETO`, com o motivo escrito.
