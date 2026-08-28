# Sessão 2026-08-28 — Feed do TERO: análise, métricas e cadência de 3 carrosséis

Pedido do Ciro: analisar os posts de feed do TERO (padrões, tom, engajamento,
temas), atualizar a base, propor cadência de 3 carrosséis semanais com teste de
3 semanas, e conferir se as métricas de feed estavam sendo guardadas —
corrigindo se não.

## 1. As métricas de feed NÃO eram guardadas — em nenhum cliente

Medido antes do conserto: **zero posts de feed com métrica**, em todos os
projetos. Três caminhos existiam e nenhum funcionava:

- `fetch-story-insights` (horário) filtra `postType: STORY` — feed nunca entra.
- `fetch-later-analytics` (6/6h) depende do add-on de Analytics do Zernio,
  **não contratado** — responde 402 desde sempre e sai limpo.
- A tabela `InstagramFeed` (com `InstagramStory`, `InstagramDailySummary`,
  `InstagramWeeklyReport`) esperava webhooks externos
  (`/api/webhooks/instagram/feed`) que **nunca dispararam**: as quatro tabelas
  estavam completamente vazias.
- `getMediaInsights` existia no `graph-api-client` desde a sessão do Quintal e
  **nenhum código de produção o chamava**.

## 2. O conserto (`30dcb737`)

Cron diário **`/api/cron/fetch-feed-insights`** (07:30 UTC) + serviço
`src/lib/instagram/feed-insights.ts` + `getAccountMedia` no cliente. Decisões:

- **Grava em DOIS lugares de propósito**: `InstagramFeed` chaveada pelo media
  id do Instagram (cobre TODO o feed da conta, inclusive o publicado fora do
  Studio — que é a maior parte do histórico) e `SocialPost.analytics*` casado
  por `instagramMediaId` (o que a UI de analytics já lê). O executor grava
  `instagramMediaId` ao publicar, então post novo do Studio casa sozinho.
- **Feed não expira como story**: uma passada diária basta, os números só
  crescem. Janela de 60 dias; backfill profundo por
  `scripts/backfill-feed-insights.ts` (dry-run por padrão).
- **Só projetos com token próprio** (7 de 11 hoje): o token global não alcança
  as contas dos clientes. Quem ganhar token entra sozinho.
- A coluna `impressions` da `InstagramFeed` guarda **views** (impressions foi
  descontinuada em março/2025) — mesmo precedente do cron de stories.
- Falha de insights numa mídia **não zera** alcance já coletado: o upsert só
  escreve o que obteve; curtidas/comentários vêm do listing e entram sempre.
- `like_count`/`comments_count` vêm de graça no listing `/media` —
  `getMediaInsights` ganhou o parâmetro `conhecido` para não repetir a chamada.

Backfill executado no mesmo dia: 172 posts nos 7 clientes (60 dias) + TERO com
400 dias (90 posts). TERO saiu de 0 → 28 posts do Studio com analytics.

## 3. O que o feed do TERO ensina (análise de 625 posts, jun/2022–ago/2026)

Metodologia da casa (mesma do Wine Vix em 27/08): cada post comparado com a
mediana dos 20 vizinhos no tempo — índice 1,00 = o normal daquele momento da
conta. Recorte principal: últimos 12 meses (77 posts). Conta: @terobrasaevinho,
41.321 seguidores; mediana 45 curtidas, 0 comentários, ~5.800 de alcance.

- **Temas**: evento/campanha com data 1,51 (Namorados com data e valor foi o
  post do ano: 409 curtidas, 654 compartilhamentos, 14,5k alcance; Restaurant
  Week 5-10× o normal) · evento corporativo 1,30, mas derreteu com repetição
  (4× em 5 meses: 170 → 34) · mecânica recorrente 1,08 · prato/cardápio 0,84
  no agregado, mas **prato COM NOME rende acima** (baião de dois 1,67, T-Bone
  1,41, sobremesas nomeadas 2,44) · domingo/família 0,82 · **felicitação de
  data comemorativa 0,63** (pior conteúdo recorrente).
- **Dias (sem o efeito de campanha)**: seg 1,26 · sáb 1,24 · dom 1,09 · qui
  0,98 · qua 0,84 · **sex 0,63 · ter 0,55**. Quinta era o dia mais usado
  (n=16) rendendo o normal.
- **Horários**: tarde 15–18h 1,17; noite fraca para conteúdo comum (0,76) —
  exceção: lançamento de campanha (os 3 maiores do ano saíram seg 19–20h).
  Sábado só funciona de manhã/almoço (10h30–13h30; à tarde/noite: 0,48–0,76).
- **Formato**: 6+ fotos 1,24 · 4-5 0,98 · 2-3 0,84 · imagem única 0,70.
- **Compartilhamento é o sinal que distribui**: plano concreto que dá vontade
  de marcar alguém (RW 725 comp, Namorados 654, rolha free 83, aniversário da
  casa 124).
- 🔴 **Alerta: o alcance mediano caiu de ~6.000 para ~2.000 em jul-ago/2026**
  (engajamento mediano 31 vs ~90 histórico). Agosto teve "SEU EVENTO" repetido
  (inclusive publicado 2× no mesmo dia 20/08 — um foi apagado depois),
  felicitações sem oferta e zero campanha. A cadência ataca isso.
- **Tom**: o DNA atual (refinado em 24/08) já é a lei certa — o histórico o
  viola em vários pontos ("parrilla" em copy, "que tal", "chave de ouro") e a
  fórmula repetida ("experiência", "transformar", "desacelerar" em quase toda
  peça) é o que o DNA já limita. Histórico não serve de referência de texto.

## 4. A cadência (teste de 3 semanas, revisão em 21/09/2026)

Registrada na base: **"Cadência e rodízio de temas do FEED — TERO"**
(HORARIOS, id `cmtd7vdcs0001swwmuwi2zbt1`). 3 carrosséis/semana — o dobro do
ritmo atual. Âncoras fixas seg 16h e sáb 11h30 (os dois melhores dias); o
terceiro dia RODA (qui 17h → dom 11h30 → qua 17h) para medir onde a audiência
responde:

- Semana 1: seg 31/08 16h · qui 03/09 17h · sáb 05/09 11h30
- Semana 2: seg 07/09 16h (feriado — conferir funcionamento) · sáb 12/09
  11h30 · dom 13/09 11h30
- Semana 3: seg 14/09 16h · qua 16/09 17h · sáb 19/09 11h30

Rodízio de temas na entrada da base (evento com data quando houver; corporativo
máx 1×/mês; mecânica com dia/horário; prato nomeado; domingo só no slot de
domingo; felicitação pura não entra). Stories: 3/dia, mesma voz — cadência à
parte.

## 5. As duas decisões — respondidas pelo Ciro no mesmo dia (gravadas)

O plano foi **aprovado** e as duas perguntas voltaram decididas, nos dois
casos contra a sugestão da análise — e a direção que ele deu é melhor que a
pergunta que fiz:

1. **Valor de menu fechado de evento NÃO entra na peça.** O cliente prefere
   não expor; o caminho é **solicitar pelo Direct** — e o Direct é canal a
   INCENTIVAR, porque há IA de atendimento e todo cliente é respondido
   rapidamente. A conversão vai para a conversa, não para o preço na arte.
2. **CTA de deslizar está VETADO** ("ultrapassado"): deslizar só existe em
   anúncio, e no stories orgânico a opção nem aparece. Onde a peça pedir
   interação, o convite é mandar mensagem no Direct.

Gravado como **regras aprendidas no toneOfVoice do DNA** (append com data e
motivo, padrão do virar-regra — confirmação dada em conversa) + ajuste na
entrada da cadência para não contradizer ("Solicite pelo Direct" aprovado
para peça de evento/orçamento; "Fale com a gente" segue como genérico). A
lição de método: **o post campeão trazia o valor, mas replicar o que rendeu
não é automático** — o dado diz o que a audiência respondeu; o que a marca
aceita expor é decisão do cliente.

## Armadilhas registradas

- 🔴 **A força aparente de um dia/horário pode ser o CONTEÚDO que caiu nele**:
  seg bruto media 1,98, mas os lançamentos de RW moravam ali; sem campanhas cai
  para 1,26 (ainda melhor dia). Toda leitura de dia/horário precisa do recorte
  sem campanha antes de virar grade.
- O índice por vizinhos (mediana dos 20 no tempo) é o que permite comparar
  2023 com 2026 sem confundir fase da conta com acerto de pauta — reutilizar
  em qualquer análise de feed (Quintal fez igual, Wine Vix também).
- `/me/media` da Graph API lista TODO o histórico da conta com curtidas e
  comentários de graça (sem custo de insights) — é a fonte para análise
  retroativa; insights (alcance, salvos, shares, views) custam 1 chamada por
  mídia e NÃO expiram para feed.
