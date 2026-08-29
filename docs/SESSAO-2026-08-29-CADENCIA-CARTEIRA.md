# Sessão 2026-08-29 — Cadência de postagem da carteira inteira (9 clientes)

Decisão do Ciro: **todo cliente passa a ter 3 stories fixos por dia e 3
carrosséis de feed por semana**, com gravação direta na base (aprovada em
conversa) e janela de teste comum — **31/08 a 20/09, revisão conjunta em
21/09/2026** (a mesma do teste de feed do TERO). Executado por 9 agentes em
paralelo, um por cliente, cada um com o método validado no TERO em 28/08
(índice por vizinhos: post ÷ mediana dos 20 vizinhos no tempo; recorte sem
campanha antes de escolher dia/hora).

## O que foi gravado (14 entradas, todas verificadas ACTIVE + indexadas)

| Cliente | Feed (HORARIOS) | Stories (POLITICAS/TOM_DE_VOZ) | Âncoras de feed |
|---|---|---|---|
| Real Gelateria (1) | NOVA `cmtevo3zi0001sw4eh62hwk9h` | mantida | qua 17h (Quarta do Crepe) + dom 11h30; 3º roda sex→sáb→qui |
| Quintal (2) | NOVA `cmtevvu7u0001swsb7583uvar` | mantida | dom manhã + sáb almoço; 3º roda |
| TERO (3) | mantida (28/08) | NOVA `cmtevqmnm0001swa1cvz0r0ty` | (stories: TripAdvisor seg 9h, Google dom 12h, executivo ter–sex 9h30, seg funcionamento 15h30) |
| Seu Quinto (4) | NOVA `cmtevu2160001swk729v9l8kl` | NOVA `cmtevu7qg0007swk7cwinecav` | qua 12h + sáb 11h; 3º roda dom→qui→ter 19h |
| Bacana (5) | NOVA `cmtevr56u0001swdlnqlth4nf` | NOVA `cmtevrayh0007swdlb9hcpq2b` | dom 11h30 + qui 18h30 (hipótese: sem token) |
| Espeto Gaúcho (6) | NOVA `cmtevxs5a0001swxegasfw8fg` | EDITADA (revoga "feed excepcional") | sex 9h (rodízio) + sáb 10h (família) |
| By Rock (7) | NOVA `cmtevv5ce0001swph250xb6kt` | EDITADA ("Formato é story" ganhou a referência ao feed) | qui 17h (Quinta do Vinho) + dom 12h (família) |
| Wine Vix (11) | mantida (27/08) | EDITADA: domingo 1→3 stories `cmt6eo4q8001el804slqm8m23` | (dom fechado: 9h fechamento · 12h desejo · 17h reabertura) |
| Empório Fonseca (12) | NOVA `cmtew1jdm0001sw35k3ponavg` | NOVA `cmtew1qe70007sw35uyvpw5ps` | qua 10h30 (Pizza) + sáb 11h30; 3º roda sex→dom→qui |

Todas com `metadata.revisao: 2026-09-21`. As edições preservaram procedência
(Wine Vix: grade seg–sáb confirmada pelo cliente em 23/08; domingo é
padronização do Ciro em 29/08).

## O que a carteira inteira ensinou (padrões que se repetem)

- **Concreto vence genérico em TODOS os clientes medidos**: felicitação pura
  mede 0,25–0,72 em toda conta; mecânica/campanha com prazo é o topo em todas
  (RW 2,3–10x no TERO/Quintal/Empório; King's Coin 31x no Seu Quinto com 1.538
  compartilhamentos; rodízio de sexta 8,2x no Espeto).
- **Carrossel de 6–7 fotos vence** onde houve métrica (Espeto 1,99 vs 0,95 das
  2–3 fotos; Empório 2,20; TERO 1,24) — a regra de 5–7 fotos saiu confirmada.
- **Alcance derretendo em série**: TERO −66% (jul–ago), Empório 1.343→431
  (mar→ago), Quintal ago 2,8k vs 4,5k no ano, Seu Quinto caindo nas últimas
  2 semanas — todos com convite genérico repetido no período. É exatamente o
  que a cadência ataca; a revisão de 21/09 mede a recuperação.
- **Achados de ouro por conta**: time/bastidores no Empório (3,1x, quase nunca
  usado); prato novo nomeado no Seu Quinto (2,9–3,3x); sobremesas nomeadas no
  TERO (2,44); collab no Quintal (14,7x). ⚠️ **Nomear prato NÃO é lei
  universal**: no Espeto, corte nomeado mede 0,88 — cada conta tem o próprio
  mapa, por isso a cadência é por cliente.

## Pendências consolidadas (fora do escopo dos agentes)

1. 🔴 **Tokens do Instagram**: Real (1), Bacana (5) e By Rock (7) não têm —
   sem `npm run ig:token`, a revisão de 21/09 fica cega para os três (nem o
   cron diário de métricas de feed os alcança).
2. **Avisar o cliente Wine Vix** da mudança de domingo (1→3 stories) antes do
   primeiro domingo — a grade anterior era confirmada por ele (23/08).
3. **Produzir as levas**: as grades estão escritas; falta produzir e agendar
   os carrosséis e stories das 3 semanas (Espeto: 8 carrosséis; Wine Vix: dom
   30/08 ainda sem os stories de 12h/17h; Real/Bacana/Empório: tudo).
4. **Consertos pontuais de agenda**: rascunho "Domingou" do Quintal datado de
   SÁBADO 05/09 (mover para dom 06/09); carrossel de qua 02/09 do Seu Quinto
   com legenda genérica (o padrão que mede 0,2–0,5 — trocar antes de sair);
   feed de sex 04/09 do Empório com 4 fotos (ideal 5–7).
5. **Conferir com as casas**: funcionamento do feriado de seg 07/09 (todos);
   Sexta da Caipirinha do Empório (anunciada até 13/08, não existe na base);
   "happy hour" do Bacana (anunciado em agosto, base e DNA dizem que NÃO
   existe); termos do rolha free do TERO; Filé do Edd no domingo do Seu
   Quinto; sobremesas do Bacana (fora do cardápio da base).
6. **CTA de Direct por marca**: TERO já tem ("Solicite pelo Direct", 28/08);
   By Rock e Empório apontaram que a lista fechada de CTAs não tem fórmula de
   Direct — decisão por marca, no DNA, com o Ciro.
7. **Higiene de agenda**: stories SCHEDULED zumbis com data passada (Real: 12;
   TERO: 5) — limpar em rodada própria.
8. **Ficha do Seu Quinto desatualizada**: diz 13,5 mil seguidores; a conta tem
   29,3 mil.

## Armadilhas registradas

- 🔴 **Briefing central não substitui a base do cliente**: o prompt do By Rock
  levou "happy hour em dobro" (mecânica do TERO/Quintal) e a base do By Rock
  diz "até 50% OFF nos itens com selo HH". O agente seguiu a BASE e apontou a
  divergência — é o comportamento certo: em conflito briefing × base, a base
  vence e a divergência é reportada, nunca propagada.
- O erro conhecido do Upstash (`res.map is not a function`, rate limit)
  apareceu em TODAS as invalidações de cache — inócuo (TTL de 300s + disjuntor
  de leitura), mas confirma que o Redis segue rate-limited desde 11/08.
- Métrica de story quase chapada (TERO: ±10% em torno de ~290) significa que o
  horário do story é decidido pela REGRA DE ANTECEDÊNCIA (2–3h antes da
  janela), não pelo alcance — o dado desempata, não dita.
