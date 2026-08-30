# RESOLVIDO — a revisão em carrossel (30/08/2026)

Relatado pelo Ciro depois de validar a revisão pela agenda: criou um carrossel
no Bacana e o card "Revisão da arte" não apareceu. Corrigido nos commits
`67d5f3f6` (revisão por slide), `78855020` (fix na origem) e `2b565f63`
(backfill).

## A causa raiz: não havia o que vincular

O carrossel do Bacana (7 slides) foi para a agenda por
`upload-to-drive` + `colocar-na-agenda(mediaUrls)` — as 7 mídias são links do
Drive e **nenhuma tinha Generation**. `agendarPost` tentou derivar o vínculo
por `resultUrl === mediaUrls[0]`, como sempre fez, e não achou nada porque não
havia nada. O vínculo não se perdeu: nunca existiu.

## O defeito MAIOR, achado no caminho

Mesmo com vínculo, `SocialPost.generationId` é **um** id e o carrossel tem N
artes: a barra respondia sempre pelo PRIMEIRO slide. Andar até o slide 5 e
clicar em "Gostei" **elogiava a capa, em silêncio** — e a sessão corretora
leria o pedido amarrado à arte errada. Havia carrosséis vivos de 7, 6 e 5
slides colapsados num veredito só. A melhoria com IA já tinha esse cuidado
desde 29/07 (`applyToPostMediaIndex`); a revisão, não.

## O que passou a acontecer

- **Criação** (`agendarPost`): arte que chega pronta vira Generation, uma por
  mídia — não renderiza, não cobra crédito. A coluna do post continua
  apontando para a CAPA (contrato que `trocar-arte-do-post` e a melhoria
  assumem). Vídeo e `data:` ficam de fora; nunca lança.
- **Leitura** (`lerArtesDoPost`): casa cada `mediaUrls[i]` por `resultUrl`, uma
  consulta por post; a coluna é fallback só do índice 0. 🔴 A URL vence a
  coluna porque **a ordem de `mediaUrls` não é a de criação** (medido num
  carrossel do Quintal: o slide 1 não é a Generation mais antiga) — índice não
  adivinha.
- **Revisão slide a slide**: o título vira "Revisão do slide 3/7", e o estado
  já zerava ao trocar de `generationId`, então nada vaza entre slides.
- **Post sem Generation nenhuma**: mostra uma linha discreta ("não está
  registrada nos Criativos"), não some calado — sumir foi o que gerou o
  relato. Sem arte atrás não há botão: feedback sem prompt não ensina nada.

## O backfill (aplicado)

Relinkar por `resultUrl` era quase vazio (9 posts em 5.714); o que resolve é
REGISTRAR a arte faltante. Escopado duas vezes por medição: só DRAFT/SCHEDULED
(publicado não se revisa, e o histórico sem vínculo é quase todo import do
Zernio) e só a agenda viva (`--desde`, 7 dias) — sem a janela, 20 dos 28 posts
eram **zumbis SCHEDULED de dez/2025–jan/2026**, que entrariam na galeria de
seis clientes datados de hoje. Aplicado: 16 artes registradas e 6 capas
vinculadas (Bacana 7, Empório 4, Seu Quinto 3, TERO 1, Quintal 1). O carrossel
do Bacana devolve 7 artes distintas para 7 slides.

## Fica para o Ciro

1. **Conferência visual** — abrir o carrossel do Bacana e andar com as setas
   (a tela exige sessão Clerk, fora do alcance das sessões automáticas).
2. 🔴 **A skill do canvas ainda ensina o caminho que causou isto.** O conserto
   cobre quem agenda, mas `upload-to-drive` + `colocar-na-agenda(mediaUrls)`
   continua sendo o que a leva de 30/08 fez — e por ali a arte não ganha
   PÁGINA, só Generation. Sem página não há `ajustar-arte` nem `conferir-arte`.
   O caminho com página é `upload-creative`. Alinhar a skill é decisão de
   produto, e vale antes das levas da semana 1.
3. Os **20 zumbis SCHEDULED** de dez/2025–jan/2026 seguem no banco (caso (c)
   do `checkStuckPosts` nunca varrido) — limpeza é frente à parte.
