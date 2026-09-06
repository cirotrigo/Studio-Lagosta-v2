# Novo Post: data primeiro, agendamento rápido e repostar (05/09/2026, rev. 2)

> **Executado em 06/09/2026** (F0 a F5). O que divergiu do plano: o botão
> "usar a legenda de 21/08" ficou de fora — a faixa é só story e o formulário
> não tem legenda de story (o envio grava `caption: ''`); a legenda anterior
> vai em `legendaAnterior` na tool `sugerir-repost`, onde o chat pode usá-la.
> Reparo do histórico aplicado: 1.311 posts reapontados, 459 sem conserto.

Pedido do Ciro, em duas rodadas:

1. *"A aba de criativos é pouco usada — o usuário normalmente já chega com o
   criativo selecionado. Gostaria que ela sugerisse o criativo a ser
   reutilizado quando ele selecionar a data: criativos postados há mais de uma
   semana, no mesmo dia da semana e na mesma faixa de horário. Se for usado
   depois de duas semanas, é válido. E avisar quantas vezes já foi usado."*
2. *"Revise o plano já consertando as artes mortas. O que entra no filtro é
   somente as artes agendadas. Revise o modal também para facilitar a escolha
   da data logo no início. Veja uma forma de simplificar o modal para um
   agendamento rápido."*

O que mudou da rev. 1 para esta: o conserto das artes mortas deixou de ser
tarefa à parte e virou a **F0**; a fonte da sugestão fica cravada como **o post
que passou pela agenda** (nunca a galeria de criativos); e entrou uma frente
nova, **o formulário** — data no topo e um modo rápido.

> Leitura de "somente as artes agendadas": entra na sugestão o que **passou
> pela agenda e foi publicado** (`SocialPost` com `status: POSTED`). Arte que
> só existe na galeria e nunca virou post não é candidata a repost — nunca foi
> ao ar. E arte que **já está agendada para os próximos dias** não é sugerida
> de novo (evita a mesma peça duas vezes na mesma semana sem querer). Se a
> leitura estiver errada, é o primeiro parágrafo a corrigir.

Tudo abaixo foi medido antes de desenhar, contra a produção, em leitura
(`scripts/.tmp-medir-reuso.ts`, `.tmp-medir-artes-mortas.ts`,
`.tmp-medir-campos-do-form.ts` — viram `scripts/medir-repost.ts` na
implementação, como KPI).

---

## 1. O que a medição diz

### Repostar já é 31% do que vai ao ar

Dos **8.649** posts publicados, **2.605 são repost** de uma arte que já tinha
ido ao ar. Não é funcionalidade nova — é hábito consolidado que acontece **sem
ferramenta**, com a pessoa lembrando o que já postou.

A heurística do pedido é sinal, não impressão. Pares de repost reais contra
pares de posts do mesmo cliente sorteados ao acaso:

| | reposts reais (n=2.605) | ao acaso (n=32.711) |
|---|---|---|
| mesmo dia da semana | **57%** | 15% |
| mesma faixa (±2h) | 79% | 47% |
| **dia + faixa** | **49%** | **8%** |

Seis vezes acima do acaso.

### O formulário pede coisa que ninguém usa

Posts criados nos últimos 90 dias (2.684, sem filhos de recorrência):

| campo do formulário | uso real |
|---|---|
| Tipo STORY | **92%** (2.468) — e o padrão do formulário é POST |
| Postar agora (IMMEDIATE) | **27%** (720) |
| Recorrente | **0** |
| Lembrete (REMINDER) | 1% (15) — informação extra: 1 |
| Primeiro comentário | **0 de 216** posts de feed |
| Texto alternativo | **0** |
| Horário em :00 / :30 | 72% |

E a **antecedência** com que o post é criado: mediana **9,6h**; **40% nascem a
menos de 2h do horário**; 74% a menos de 24h. "Agendamento rápido" não é
conveniência — é como a equipe trabalha.

### A data hoje entra de três jeitos, nenhum bom

- **"+" de um dia da agenda** → `/agenda/novo?data=…` com o dia certo e a hora
  **cravada em 10:00** (`criarPost` faz `setHours(10, 0, 0, 0)` nos dois
  chamadores). A hora não vem da célula; é chute.
- **Botão "Novo Post"** do cabeçalho e **"Agendar"** da galeria → sem data; o
  `SchedulePicker` inventa "amanhã 12:00".
- E nos três a data fica no **quarto bloco** do formulário (Tipo → Mídia →
  Legenda → Quando), atrás de tudo.

### 🔴 O texto do story é descartado

O campo "Texto do Story (Opcional)" convida a digitar, e o `onSubmit` grava
`caption: ''` para STORY sem avisar ([post-composer-form.tsx:396](../src/components/posts/post-composer-form.tsx)).
As 1.981 stories com legenda no banco vieram do conector e do compositor, não
deste formulário. Campo que joga fora o que recebe é pior que campo ausente.

---

## 2. F0 — as artes mortas (pré-requisito)

Amostragem por HEAD em `SocialPost.mediaUrls[0]` de posts publicados:

| idade do post | artes que respondem 404 |
|---|---|
| 0-13 dias | 2% |
| 14-59 dias | 12% |
| 60-89 dias | **38%** |
| 90-180 dias | **40%** |

### A causa

`cleanupGenerations` (`src/lib/cleanup/blob-cleanup.ts`, cron `cleanup-db`
semanal): passados **90 dias** da criação da Generation, apaga o blob e
**reaponta `Generation.resultUrl` para o Google Drive** (Pass A; o Pass B
recupera ou apaga a linha) — mas **não reaponta o `SocialPost.mediaUrls`**, que
fica guardando a URL recém-apagada. Medido: as 3.418 Generations com mais de
90 dias apontam todas para `lh3.googleusercontent.com/d/<fileId>=w2000`, e
essas URLs **estão vivas** (39 de 40 — é o link público por fileId, não o
thumbnail assinado que expira em horas). **A arte existe; o que morreu foi o
endereço que o post guarda.** Das mortas em 60-89 dias, **13 de 19 têm
`generationId`**: dois terços se recuperam olhando no lugar certo.

Os 12% de 14-59 dias têm outra causa — criativo apagado à mão pela galeria
(`bulk-delete` e o DELETE de Generation apagam blob **e** linha) — e esses não
têm conserto. Ficam contados.

### 🔴 O que a feature nova faz com esse defeito

Hoje ele só estraga o passado (capa quebrada na agenda). **Com repost, ele
passa a alcançar o futuro**: repostar uma arte de 85 dias para a semana que vem
→ o cron de domingo apaga o blob → o post é entregue ao Zernio 5 minutos antes
do horário com uma URL morta. Por isso o conserto é pré-requisito, não
paralelo.

### O conserto, em duas metades

1. **Parar de criar novos.** No cleanup, ao reapontar `Generation.resultUrl`,
   reapontar **também** todo `SocialPost.mediaUrls` que contém a URL que vai
   ser apagada — em **qualquer status** (o SCHEDULED é o caso que importa).
   Troca cirúrgica por posição com compare-and-swap sobre o array inteiro
   (`montarNovasMidias`, o mesmo de `trocar-arte-do-post`); **nunca reduz a
   contagem de mídias**. Post com `laterPostId` também é reapontado — a cópia
   que vai ao ar é a do Zernio, e a nossa URL só serve à capa e ao
   `recover-stuck-post`, que ficam certos.
2. **Reparar o histórico.** `scripts/reapontar-midias-mortas.ts`, dry-run por
   padrão: para cada post com mídia 404, resolve pela Generation (via
   `generationId`; sem ele, casando `resultUrl` antigo em
   `fieldValues`/`sourceGenerationId`) e reaponta. O que não tem Generation
   sai no relatório, não some.

E, na sugestão de repost, **a mídia se resolve pela Generation quando ela
existe**, nunca pela `mediaUrls` do post — mesmo depois do conserto, porque a
Generation é a linha que o cleanup mantém viva.

---

## 3. Frente B — o formulário: data primeiro, agendamento rápido

### A nova ordem

```
┌ QUANDO ─────────────────────────────────────────────────────┐
│ [ Agora ]  [ Hoje ]  [ Amanhã ]  [ 📅 sex 11/09 ]            │
│ horários da casa:  [ 10h ]  [ 12h ]  [ 19h ]   [ 19:30 ▾ ]   │
└──────────────────────────────────────────────────────────────┘
┌ MÍDIA ──────────────────────────────────────────────────────┐
│ ▸ Repostar — o que já funcionou na sexta à noite   (8 cards)│
│ Criativos · Img. IA · Drive · Upload                        │
└──────────────────────────────────────────────────────────────┘
┌ LEGENDA ─────────────────────────── (só feed) ──────────────┐
└──────────────────────────────────────────────────────────────┘
                                          [ Cancelar ] [ Agendar sex 19h ]
▸ Mais opções: tipo de post · lembrete · primeiro comentário · recorrente
```

- **Quando vira o primeiro bloco**, e é uma linha: `Agora` (27% dos posts),
  `Hoje`, `Amanhã`, o calendário — e os **horários típicos do cliente** como
  chips. A hora deixa de ser chute (10:00, 12:00) e vira um toque.
- **Os horários típicos vêm de `calcularCadencia`** (`src/lib/posts/cadencia.ts`,
  puro) e da grade da base (`grade-da-base.ts`), por uma rota de **leitura**
  nova (`GET /api/projects/[id]/horarios-tipicos`). 🔴 **Nunca por
  `sugerirPosts`**: ela registra um `LearningSignal` por slot a cada chamada, e
  este formulário abre dezenas de vezes por dia.
- **O "+" do dia da agenda para de cravar 10:00**: manda só o dia, e o chip do
  primeiro horário típico daquele dia da semana vem pré-marcado. Sem data
  nenhuma (botão do cabeçalho, galeria), o padrão é *o próximo horário típico
  ainda hoje*; passou o último, amanhã no primeiro.
- **Tipo de post sai da frente e o padrão vira STORY** (92%). Fica visível
  como um segmento pequeno ao lado do Quando (STORY · Feed · Carrossel · Reel),
  não como quatro cards.
- **Para STORY, a legenda some** — não "opcional": some, porque o formulário
  descarta o texto. (Se um dia o story precisar de texto, o campo volta
  **junto** com a gravação.)
- **Atrás de "Mais opções"**: lembrete (1%), primeiro comentário (0%), texto
  alternativo (0%), recorrente (0%). Continuam existindo; só não pagam
  pedágio de atenção em 99% dos posts. A regra de negócio de cada um não muda.
- **O botão diz o que vai fazer**: "Agendar sex 19h", "Postar agora".

### Agendamento rápido = a mesma tela com três coisas

Para o caso de 92% (story) o formulário inteiro cabe numa tela sem rolagem:
**quando → mídia → agendar**. Não é um "modo" com interruptor — é o que sobra
quando o resto vai para "Mais opções". Um modo à parte seria mais um lugar
para a pessoa se perder.

**"Agendar e próximo"** (segundo botão, ao lado do principal): agenda e reabre
com o mesmo cliente, mesmo dia e o **próximo horário típico** marcado. A
cadência aprovada é 3 stories/dia; hoje cada um é um ciclo inteiro de
abrir-preencher-fechar.

### As seis superfícies

O `PostComposerForm` é um só e serve seis lugares (rota `/agenda/novo`, rota
de edição, e quatro modais: galeria do projeto, galeria global, painel de
agenda do editor, painel de criativos do editor). A reordenação vale para
todos — é o mesmo formulário — e a edição de post existente ganha o mesmo
layout com os valores preenchidos. Nos modais vindos da **galeria**, a mídia
já chega escolhida: o bloco de mídia aparece preenchido e colapsado, e o
Quando fica sozinho no topo — que é exatamente o caso "já chego com o
criativo selecionado".

---

## 4. Frente C — Repostar

### As decisões (Ciro, 05/09)

- **Só STORY.** Dos 2.605 reposts, 2.595 são story; feed repostado fica
  duplicado no perfil para sempre. Em POST/CAROUSEL/REEL a faixa não existe.
- **Semáforo, não portão.** O pico do reuso real é 14-29 dias (839), mas
  **47% dos reposts têm menos de 14 dias** e não são recorrentes (4 de 840):

  | mesmo dia | 1-2d | 3-6d | 7-13d | **14-29d** | 30-59d | 60d+ |
  |---|---|---|---|---|---|---|
  | 118 | 180 | 542 | 680 | **839** | 200 | 46 |

  ✅ ≥ 14 dias · ⚠️ 7-13 dias ("foi ao ar há 9 dias") · 🔴 < 7 dias (por
  último, aviso em vermelho). Tudo visível; quem decide é o olho.
- **A legenda vem num botão.** 1.369 dos 2.605 reposts (53%) repetem a
  legenda inteira — "usar a legenda de 21/08". Não preenche sozinho: a outra
  metade reescreve.

### A fonte é o post, e dia+faixa ORDENA

A aba lista `Generation`; o histórico de publicação vive no post. Só **36%**
dos posts publicados são alcançáveis pela aba (76% nos últimos 90 dias). É
provavelmente a razão nº 1 de ela ser pouco usada: não falta filtro, **falta
metade do que já foi ao ar**. A faixa lê `SocialPost` POSTED do projeto.

E **51% dos reposts caem fora** de dia+faixa. Como filtro, a arte certa
publicada numa terça some ao agendar uma quinta. Mesma lei do ranking do
acervo: *score ordena, nada apaga*.

### O ranking (servidor, módulo puro `src/lib/posts/repostar.ts`)

Sobre os POSTED do projeto, STORY, últimos **60 dias** (onde a mortalidade
ainda é 12% — e casa com o pico de 14-29 dias), excluindo o post em edição e
as artes que já estão SCHEDULED à frente:

```
+3  mesmo dia da semana do slot escolhido
+2  mesma faixa (±2h)  |  +1 se ±3h
+2  idade entre 14 e 60 dias  (o verde)
−3  idade < 7 dias            (o vermelho)
+1  tem Generation viva (mídia que o cleanup mantém)
+1  usada uma vez só até hoje
−1  por uso além do segundo
```

Desempate: menos usada primeiro; depois a mais recente. Teto de 8, "ver mais".
🔴 Em Postgres `ORDER BY … ASC` é NULLS LAST — qualquer critério ordenado no
banco por "nunca aconteceu" leva `{ sort: 'asc', nulls: 'first' }`.

### O contador conta a IMAGEM

1.047 artes usadas 2x, 378 3x, 146 4x, cauda até 9x. 🔴 A chave é
`mediaUrls[0]` normalizada, não a Generation: **1.374 posts têm `generationId`
cuja mídia publicada é outra** (a melhoria com IA cria arte nova) — por
Generation, quem mais reposta apareceria zerado.

### O aviso de prazo — estreito, para ser lido

Detector só de **data (dd/mm)**, **nome de mês** e **urgência** ("hoje",
"última chance", "último dia") acusa **176 de 3.907 legendas (5%)**, e pega o
que não pode voltar: *"DIA DAS MÃES WINE VIX"*, *"Feliz Dia dos Pais!"*,
*"almoço de Restaurant Week"*. 🔴 **Não usar `pareceDado`** — dispara em 97%
das legendas; foi calibrado para blocos de arte. Dia da semana na legenda só
conta quando é **diferente** do dia escolhido ("Domingo no Tero" numa sugestão
para domingo não é aviso).

### O card

```
┌─────────────────┐
│      arte       │   qui 19h · há 21 dias        ✅
│                 │   2ª vez
└─────────────────┘   ⚠️ fala em "Dia das Mães"
  [ usar esta ]  [ + legenda de 21/08 ]
```

Alcance aparece quando existe (965 de 5.405 posts têm) — etiqueta, nunca
critério. O card **se esconde no `onError` da imagem**.

### A rota

`GET /api/projects/[projectId]/repostar?quando=<ISO>&dias=60` → até 8 itens
ranqueados: `{ url, generationId, templateName, ultimoUso, diasDesde,
diaDaSemana, hora, vezesUsada, legenda, avisoDePrazo, alcance }`. Índice
`[projectId, status]` já existe. 🔴 Rota nova: a `/creatives` lista **todas**
as Generations sem paginação (1.049 no TERO) e não aguenta mais nada.

Ao escolher, o item entra como `type: 'generation'` quando há Generation
(preserva linhagem e "melhorar com IA") e como `'upload'` com a URL quando não
há — como o formulário já trata mídia sem origem conhecida.

---

## 5. Fases, na ordem

| fase | o quê | por quê nesta ordem |
|---|---|---|
| **F0** | cleanup reaponta `mediaUrls`; script de reparo (dry-run) | sem isto, repost publica URL morta |
| **F1** | Quando no topo com horários típicos; STORY padrão; legenda some no story; "Mais opções"; "+" sem 10:00 | é o que destrava o repost (a data existe antes da mídia) e já vale sozinho |
| **F2** | faixa Repostar: rota + ranking puro + card + legenda no botão + aviso de prazo | o pedido original |
| **F3** | "Agendar e próximo" | rápido de fazer depois da F1; mede-se se a equipe usa |
| **F4** | `LearningSignal tipo: 'repost'` com chave `(projeto, dia-da-semana, faixa, safra)`; desfecho calculado no servidor | só depois de a faixa existir; sem a chave o denominador vira ficção em uma semana |
| **F5** | `sugerir-repost` no conector | "o que eu reposto na quinta do By Rock?" |

Cada fase é um PR; F0 sai primeiro e sozinho.

## 6. Fora do escopo, e por quê

- **Feed** — 10 reposts em 8.649 posts.
- **Ordenar por desempenho** — dado presente em 18% dos posts.
- **Vetar campanha vencida** — `learningScope: CAMPANHA` em 62 de 8.649 posts;
  o aviso de prazo pela legenda cobre o caso real.
- **Gravar o texto do story** — o campo some; voltar exige decidir o que
  o Zernio faz com ele.
- **Contador como coluna** — o dado já está em `SocialPost`, com índice.
