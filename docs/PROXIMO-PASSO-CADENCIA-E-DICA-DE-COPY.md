# Próximo passo — cadência de postagem e dica de copy

> Escrito em 10/08/2026 como handoff. O Ciro definiu o próximo alvo: trazer a
> **cadência de postagem** e a **dica de copy** que o Claudinho tinha, "mas
> vamos evoluir". Este documento levanta o que existe dos dois lados e propõe
> por onde começar.

## 1. Cadência

### O que o Claudinho faz

`src/bancada.js` → `slotsLivresCliente(cliente, { dias })`:

1. lê a **cadência SALVA do cliente** (`obterCadenciaCliente`) — uma configuração,
   não uma inferência;
2. `gerarCadencia(dados, dataInicio, dataFim, { cadenciaSalva })` produz um plano
   de dias × slots, e **cada slot carrega um PILAR/TEMA** (não só um horário);
3. `marcarSlotsJaAgendados` cruza com o que já está na agenda e devolve o que
   está livre;
4. a bancada mostra os slots livres para preencher.

O tema do slot é o que alimenta a dica de copy (§2) — os dois recursos são um
só mecanismo em duas telas.

### O que o Studio tem

`src/lib/posts/sugerir-posts.ts` → `sugerirPosts({ projectId, dias })`, exposto
em `/api/projects/[id]/slots` e já consumido pela bancada (o compositor abre no
próximo horário livre, mostra o motivo — "costuma postar segunda por volta das
10:30" — e avança o slot a cada item da leva).

**A diferença que importa**: o Studio **deriva a cadência do histórico**; o
Claudinho **lê uma cadência configurada**. Isso foi decisão explícita de
01/08/2026 (não existe campo de cadência no Studio, e a inferência foi
escolhida no lugar). O slot do Studio tem **horário e motivo, mas não tema**.

### Por onde começar

O buraco concreto é o **tema por slot**. Sem ele:

- a dica de copy não tem do que falar (no Claudinho é o tema que dá o assunto);
- a leva da semana não tem variedade garantida — nada impede três peças de
  happy hour seguidas.

Duas rotas, e a escolha é de produto:

- **(a) Cadência configurável por projeto** (modelo do Claudinho): tabela nova
  `ProjectCadence` ou seção no BrandDNA com dia × horário × pilar. Previsível e
  editável, ao custo de alguém precisar configurar 10 clientes.
- **(b) Manter a inferência e ACRESCENTAR o tema**, derivando o pilar do
  histórico junto com o horário (o `SocialPost` já tem a copy e a arte de cada
  publicação; dá para classificar por visão/LLM uma vez e guardar).

A (b) preserva a decisão de 01/08 e não pede configuração. A (a) dá controle.
Vale perguntar ao Ciro antes de escrever código — as duas são defensáveis, e a
escolha muda a modelagem.

## 2. Dica de copy

### O que o Claudinho faz

`src/dica-copy.js`: dado o **tema do slot**, busca na base de conhecimento do
cliente (cardápio, promoções, campanhas) **mais** o DNA (tom de voz, CTAs,
hashtags, manual editorial) e pede ao Claude uma **sugestão de legenda + uma
ideia visual curta**.

Regra do desenho, e ela é boa: *"É uma sugestão que o operador revisa antes de
usar — não agenda nada."*

### O que o Studio tem

Todas as peças, nenhuma montada para este fim:

| Peça | Onde |
|---|---|
| Base de conhecimento com busca por relevância | `src/lib/knowledge/search.ts`, tool `consultar-base` |
| DNA da marca (tom de voz, regras, composição) | `loadBrandContext` |
| Geração de texto por LLM | `src/lib/ai/generate-ai-text-service.ts` |
| Crivo de aprovação | `BrandDNA.approvalChecklist` (novo em 10/08) |
| Referências de estilo aprovadas | `styleRefAt` + `style-references.ts` (novo em 10/08) |

Falta o serviço que costura isso e a superfície na bancada. O plano da Fase 3
previa "dica de copy via `quick-generate` adaptado" e isso **não foi feito** —
o `quick-generate` que existe é do wizard de criativo, outro fluxo.

### Onde dá para EVOLUIR além do Claudinho

O Ciro pediu para evoluir, e há três coisas que o Studio pode fazer e o
Claudinho não podia:

1. **A dica se autoconfere pelo crivo.** O `approvalChecklist` do projeto já
   está no banco. Uma sugestão que nasce respondendo às perguntas binárias da
   marca ("tem preço? veio da base?") chega bem mais perto de aprovável.
2. **A dica sugere a FOTO junto com o texto.** O acervo tem catálogo semântico
   (`buscarNoAcervo` por tema, com rodízio "menos usada primeiro"), e a
   referência de estilo do rodízio já define o visual. Dica de copy + foto
   sugerida = o item da bancada nasce quase pronto.
3. **A leva inteira, não uma peça.** O Claudinho dava dica por slot; o Studio
   pode propor a SEMANA de uma vez, garantindo que temas e fotos não se
   repitam entre os itens — o `sugerirPosts` já avança o slot a cada item, e o
   acervo já tem rodízio. Falta o mesmo cuidado no tema.

## 3. Armadilhas que valem para este trabalho

- **Não invente preço, horário nem promoção.** A regra é antiga e o crivo do
  Espeto a repete: preço só quando veio da base. Uma dica de copy que alucina
  valor é pior que dica nenhuma.
- **`toneOfVoice` entra em copy, NUNCA em prompt de imagem** (CLAUDE.md).
- **A base é buscada por relevância, com teto de tokens** — entrada longa
  demais é PULADA (`continue`), não trunca a lista.
- **Sugestão não agenda.** O contrato do Claudinho vale aqui: a dica é
  proposta, quem decide é quem revisa. Vale também para não gastar crédito
  sozinho — a lição de 10/08 com o retry automático.

## 4. Estado em que a sessão de 10/08 parou

Tudo mergeado em `main` (PRs #31 a #40) e no ar. O resumo do dia está em
[SESSAO-2026-08-10-FASES-4-A-6.md](SESSAO-2026-08-10-FASES-4-A-6.md).

Pendências conhecidas, nenhuma bloqueia o próximo passo:

- **Retry em outra invocação**: no formato story duas gerações não cabem no
  `maxDuration = 300`. Hoje a peça sai com alerta em vez de falhar; a saída
  estrutural (fila) não foi feita.
- **`logoMode` do Espeto**: seis peças mostraram que o modelo acerta a forma da
  marca e erra a cor. O projeto é candidato a `compor`, que garante fidelidade.
- **Cabeçalho duplicado**: na home do projeto o nome do cliente aparece no
  seletor e no cabeçalho da página. A seta de voltar ficou redundante com o
  menu persistente.
