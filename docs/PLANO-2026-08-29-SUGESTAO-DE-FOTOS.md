# Plano — a sugestão de fotos aprende (29/08/2026)

> Nasceu do gargalo relatado pelo Ciro em 29/08/2026: *"o maior gargalo hoje na
> produção de conteúdo é a organização das fotos. Quando produz a semana dos
> clientes as fotos indicadas não são boas e precisa ficar trocando."*
>
> O diagnóstico foi medido contra produção (números abaixo) e o desenho passou
> por uma segunda rodada a pedido dele ("não sei se somente ele é o suficiente
> — veja por outro ângulo"): a primeira versão só melhorava a ORDENAÇÃO do que
> existe; esta cobre também a curadoria explícita, a semana como conjunto, o
> custo da troca e o acervo que não tem a foto.
>
> **EXECUTADO em 30/08/2026** por decisão do Ciro ("pode executar todo o
> plano"), com 10 subagentes em 3 ondas. Placar e o que o backtest ensinou
> logo abaixo. Única parte deliberadamente NÃO feita: F5.3 (visão no
> shortlist) — o gate do próprio plano ("decisão após medir F1–F3") continua.

---

## Placar da execução (30/08/2026)

| Frente | Estado |
|---|---|
| Fundação: `PhotoDestaque` + `ItemDePlano.fotoCandidatas` | **no ar** — migration à mão, validada no branch dev, aplicada em produção |
| Teto da reconciliação 120→200/noite (pedido do Ciro) | **no ar** |
| F1.1–F1.3 score + módulo puro (`ranquear-acervo.ts`, safra `acervo-v2`) | **no ar** — 42 testes |
| F1.2 semente | **RODADA em produção**: 105 destaques em 9 clientes (Real 26, Espeto 16, By Rock 15, TERO 15, Quintal 14, Wine Vix 12…) |
| F1.4 superfícies (estrela no picker + rota web; MCP `marcar-foto-destaque`) | **no ar** — validador do registro: 419 verificações |
| F1.5 backtest | **rodado** — ver seção abaixo; `QUALIDADE_ALTA` zerado por medição |
| F2 casamento por palavras + sinônimos de pilar | **no ar** |
| F3 conjunto da semana (pasta, tipo) + fidelidade do sinal (`fotoDoCard`) | **no ar** — carrossel: `propor-semana` não emite slides hoje; a regra "mesma sessão" ficou documentada no ponto certo do código |
| F4 top-3 no card + chip de motivo + `posicao` no desfecho | **no ar** (a nota de sequenciamento do KPI foi superada pela decisão de executar tudo — quem isola o antes/depois é a safra `acervo-v2`) |
| Colheita da correção pós-produção (adição do Ciro, 30/08) | **no ar** nas 3 pontas (contrato, colhedor, semente) + `geracaoId` opcional em `marcar-foto-como-usada` para a via canvas/upload alimentar o join |
| F5.1 relatório de lacunas | **no ar e rodado**: as lacunas reais são "ambiente" (Espeto), "Happy Hour" (By Rock) e "Almoço Executivo" (TERO) — perfil expirada, "o acervo não tem a foto" |
| F5.2 aviso com saída ("ou gerar a cena por IA") | **no ar** |
| F5.3 visão no shortlist | **não feito, de propósito** — gate do plano mantido |

### O que o backtest mediu (30/08/2026, 98 sinais, leave-one-out)

- Agregado: mediana 29,5→42,5 (**pior**), mas top-1 5,1→10,2%, top-3
  9,2→17,3%, top-10 19,4→22,4%. A meta "mediana no top-3" NÃO deu no agregado.
- **O corte que explica tudo**: com QUALQUER sinal restante da foto (n=12),
  mediana **21→1,5** e top-3 **91,7%** — o mecanismo funciona onde há corpus.
  Sem sinal (n=86), quem afundava a escolhida era `quality`, constante ('alta'
  em 93–99% dos acervos): **`QUALIDADE_ALTA` foi zerado por medição** ('alta' é
  linha de base, não sinal; `BAIXA` −6 fica, porque é raro e informativo).
- Vieses conhecidos e registrados no script: o backtest só avalia escolhidas
  (nunca premia afundar rejeitada), e as escolhas do corpus foram feitas
  olhando a lista da v1 — o ganho real tende a ser maior que a mediana crua.
  O ganho de recall da F2 não é testável por sinais fechados (vive nas 74
  expiradas), e "0 no backtest" NÃO é evidência contra ela.
- **Conclusão que orienta o resto: pesos não são a alavanca; corpus é.** Por
  isso a semente foi rodada no mesmo dia e a captura foi ampliada (posicao,
  motivo, correção). O KPI vivo é `scripts/medir-sugestao-de-fotos.ts` —
  largada da safra `acervo-v2`: 12,2% de aceitação, 53,5% das trocas fora do
  top-10.

---

## O diagnóstico, medido em produção (29/08/2026)

Sinais `tipo: 'foto'` dos últimos 30 dias (a captura nasceu em 11/08 — isto é
o histórico inteiro):

| Desfecho | Quantos | Leitura |
|---|---:|---|
| `aceita-como-veio` (levou o topo) | 12 | **12% das decisões seguem a recomendação** |
| `trocada` (levou outra da lista) | 86 | 88% das vezes o topo estava errado |
| `expirada` (usou foto de fora da lista) | 74 | a busca nem achou a foto certa |
| pendente | 284 | buscas que não viraram arte |

Das 86 trocas, **46 escolheram foto além da 10ª posição** — não é ajuste fino
de ordem, a foto certa costuma estar longe do topo. E das últimas 200 buscas,
**150 não usaram tema**: a equipe navega por pasta porque não confia na busca.

As causas, no código:

1. **O ranking tem UMA força, e ela é anti-qualidade.** `buscarNoAcervo`
   ordena exclusivamente por "menos usada primeiro" (`acervo.ts`, sort único
   sobre `mesclarUsos`). Consequências: a foto boa que foi usada vai para o
   FIM da fila; a foto ruim que ninguém nunca escolheu fica PERMANENTEMENTE no
   topo (nunca-usada primeiro + sort estável = mesma posição toda semana). A
   troca não ensina nada — **os desfechos `trocada`/`aceita-como-veio` não têm
   nenhum consumidor** (verificado: só o emissor `acervo.ts` e o fechador
   `sinal-de-foto.ts` tocam nesses sinais).
2. **O rodízio quase não tem combustível.** `PhotoUsage` tem ~610 registros
   cobrindo 40–70 fotos por cliente, contra acervos de ~1.000. Para 95% do
   acervo tudo empata em "nunca usada" e a ordem real é a ordem do arquivo de
   catálogo — arbitrária e fixa.
3. **O casamento por tema é substring da frase inteira** sobre
   `bestFor`/`tags`/pasta. Já medido no próprio código: "Cortes e churrasco"
   devolveu ZERO num acervo de mil fotos (By Rock) — e aí a `propor-semana`
   cai no acervo geral, que é rodízio cego sem relevância nenhuma. As 74
   expiradas e as 46 trocas fundas são isso.
4. **Não existe conceito de foto curada** em lugar nenhum (verificado — nada
   de destaque/favorita no catálogo, no banco, nas tools). Mas o pool bom já
   existe na prática: Real Gelateria concentra 171 usos em 57 fotos.

O que orienta o desenho — as regras da casa que valem aqui verbatim: **score
ordena, nunca esconde** (irmã de "avisa, nunca veta"); **curadoria nunca é
portão**; sugestão registrada **na emissão**, desfecho **calculado** no
servidor; **peso por recência, nunca corte por idade**, ancorado na atividade;
agregação de `LearningSignal` **em código**, nunca filtro por path de Json no
SQL; vínculos **sem FK**; vocabulário novo em **TEXT**, não enum.

---

## F1 — Prata da casa + score aprendido (a fase que move o KPI)

### F1.1 O flag de destaque: tabela `PhotoDestaque`

Espelho do padrão dos modelos ("página nasce conteúdo; modelo é promoção
deliberada"): **foto nasce acervo; destaque é promoção deliberada.**

```prisma
model PhotoDestaque {
  id          String    @id @default(cuid())
  projectId   Int
  driveFileId String
  /// 'semente' (script) | 'humano' (picker/MCP). TEXT — vocabulário se move.
  origem      String
  /// User.id INTERNO (nunca clerkId), nullable — auditoria, não gate.
  decididoPor String?
  criadoEm    DateTime  @default(now())
  /// Despromover, nunca excluir — mesmo princípio da curadoria de modelos.
  revogadoEm  DateTime?

  @@unique([projectId, driveFileId])
}
```

- **No banco, não no JSON do Drive** — as duas razões do `PhotoUsage`: corrida
  de read-modify-write no arquivo único, e regerar o catálogo apagaria a
  curadoria.
- Sem FK (foto apagada do Drive não arrasta o registro). Migration **escrita à
  mão + `db:deploy`**, validada antes no branch dev.

### F1.2 A semente: a curadoria que os dados já fizeram

`scripts/semear-destaques.ts` (dry-run por padrão, `--confirmar` grava):

- toda foto que aparece como `escolhido.driveFileId` num sinal de foto fechado;
- toda foto de `PhotoUsage` cujo `generationId` tem feedback "Gostei"
  (`LearningSignal` do feedback de arte);
- **a correção pós-produção** (acréscimo do Ciro, 30/08/2026): sinal
  `troca-de-arte` com `generationId` da arte NOVA → join com
  `PhotoUsage.generationId` → a foto que entrou no lugar. É a preferência
  humana mais forte que existe — alguém olhou a peça pronta e mandou trocar.

Origem `'semente'`, relatório por cliente antes de gravar. É o que faz a F1
entregar valor no dia 1 em vez de esperar semanas de aprendizado.

### F1.3 O score composto: `ranquearAcervo` (módulo puro)

`src/lib/creatives/ranquear-acervo.ts` — **puro, sem Prisma** (precedente de
`reconciliacao.ts`/`cadencia.ts`): recebe as imagens filtradas, os agregados de
sinal, os usos, os destaques e os critérios; devolve a ordem. É o que deixa o
backtest e os testes rodarem sem banco.

Componentes (pesos iniciais calibrados pelo backtest da F1.5, não por palpite):

| Componente | Direção | Observações |
|---|---|---|
| Destaque ativo | ⬆ forte | prata da casa primeiro |
| Escolhida numa CORREÇÃO pós-produção | ⬆ forte (acima da busca) | acréscimo do Ciro, 30/08/2026: sinal `troca-de-arte` → `generationId` da arte nova → `PhotoUsage` → foto. Preferência explícita, mais forte que "levou o topo"; hoje chega sem tema (o sinal não carrega), então vale como global forte. Não polui o KPI — `troca-de-arte` não é sinal `foto`, e o `acervo-v2` isola a safra |
| Escolhida para ESTE tema | ⬆ forte | par tema→foto dos sinais fechados; decai (meia-vida a calibrar), ancorado na última atividade do cliente |
| Escolhida para qualquer tema | ⬆ médio | idem |
| Proposta no topo (≤3) e preterida | ⬇ | mais forte no mesmo tema, fraca global; decai — rejeição de março não condena para sempre |
| Feedback de arte | ⬆ pequeno / ⬇ só com menção | positivo sempre soma pouco; negativo só quando o texto cita foto/imagem/luz/escura (a reprovação pode ser da copy) |
| `quality` do catálogo | ⬆ pequeno | só onde existe (catálogos v2 não têm — neutro) |
| Novidade (`catalogadaEm` recente) | ⬆ temporário | ver § Manutenção |
| Rodízio (menos usada) | desempate | deixa de ser o critério — vira o desempate entre scores próximos |
| Semente diária | desempate final | entre nunca-avaliadas: `hash(driveFileId + diaBRT)` — estável dentro do dia (a paginação por offset exige), diferente entre dias; a mesma desconhecida para de morar no topo |

- Agregação: `lerPreferenciasDeFoto(projectId)` em `sinal-de-foto.ts` — UM
  `findMany` dos sinais de foto do projeto (algumas centenas de linhas hoje),
  agregado em código. Se o volume crescer, espelho colunar (precedente
  `usedCount`/`lastUsedAt`) — não antes.
- 🔴 **`VERSAO_DO_ACERVO` sobe para `acervo-v2`.** A versão entra na chave de
  sugestão (regra de `chaves.ts`): a safra nova não pode herdar desfecho de
  proposta que era outra heurística.
- **Score ordena, nunca esconde**: nenhuma foto sai da lista por score baixo.

### F1.4 Superfícies da curadoria

- **Picker da bancada** (`arte-ia-image-picker.tsx`): estrela nas miniaturas +
  chip "Destaques". É onde a equipe já navega — marcar enquanto navega é de
  graça.
- **MCP**: tool `marcar-foto-destaque` no catálogo único (uma declaração;
  snapshot fixture atualizado no mesmo commit — regra do registro). Gate
  `assertCuradorDoProjeto`, como `marcar-como-modelo`: ver ≠ mandar na
  curadoria. `buscar-fotos` passa a devolver `destaque: boolean`.

### F1.5 Backtest ANTES do deploy — e a armadilha de rodar busca

`scripts/validar-ranking-do-acervo.ts` (somente leitura): para cada um dos ~98
sinais fechados, refaz a busca com os `criterios` gravados e responde **em que
posição a foto historicamente escolhida ficaria** no ranking velho × novo.
Hoje a mediana está fora do top-10; a meta do backtest é top-3. É o que
calibra os pesos offline, sem custo e sem deploy.

- 🔴 **O script NUNCA chama `buscarNoAcervo`** — ela REGISTRA uma sugestão por
  busca (mesma armadilha já registrada em `validar-cadencia-f2.ts`, que não
  chama `sugerirPosts` pela mesma razão). Ele monta os insumos e chama
  `ranquearAcervo` direto.
- Limitação honesta: o acervo mudou desde os sinais (fotos e usos novos) — o
  backtest é direcional, não exato. Serve para escolher pesos, não para
  prometer número.

### F1.6 `propor-semana` melhora sem mudar

Ela consome a ordem de `buscarNoAcervo`; o topo melhora sozinho, inclusive o
fallback do acervo geral (que hoje é rodízio puro e passa a preferir as
provadas).

---

## F2 — Casamento por palavras + relevância (junto com a F1, mesmo módulo)

- O tema é normalizado, quebrado em **palavras** (stopwords fora: e, de, com,
  do, da…) e casa por QUALQUER palavra — "cortes e churrasco" acerta quem tem
  "cortes" OU "churrasco". Acaba a substring da frase inteira.
- A relevância entra no score: nº de palavras casadas ponderado por onde casou
  (`bestFor` > `tags` > pasta). Pela primeira vez existe noção de relevância
  na ordem — hoje o filtro é binário.
- Os **slugs dos pilares aprovados** (taxonomia fechada por cliente) entram
  como expansão de sinônimo do tema — vocabulário que já existe e já foi
  aprovado por gente; não se inventa um segundo.
- O casamento vive no módulo puro, com os dois casos reais como fixture: os
  acentos mistos do Wine Vix ("almoço"/"almoco") e o zero do By Rock.
- Filtros exatos não mudam: pasta por prefixo, `fileName` por prefixo,
  `menuCategory`, `tags`.

---

## F3 — A semana como conjunto (`propor-semana`)

1. **Não repetir PASTA na leva**, além do arquivo: `escolherFotoSemRepetir`
   ganha a chave de pasta. Duas picanhas da mesma sessão em dias seguidos
   deixam de passar.
2. **Alternar tipo ao longo da semana** (prato / ambiente / pessoas) pela
   heurística mais barata que existe: o primeiro nível da pasta, que é como
   todos os acervos se organizam (`01_cortes`, `02_ambiente`…). Quando não der
   para inferir, não força — aviso, nunca trava.
3. **Carrossel puxa slides irmãos da MESMA pasta/sessão**, para a série
   parecer uma peça só.
4. 🔴 **Conserto de fidelidade do sinal, pré-requisito do resto**: hoje, quando
   o SISTEMA desce na lista para não repetir e a pessoa aceita, o fechamento
   grava `trocada` — culpando o ranking por uma troca que ninguém fez (custo
   já documentado em `proposta-de-semana.ts`). Com a F3 descendo mais (pasta,
   tipo), isso viraria ruído grande. A saída: arte nascida de item de plano
   fecha o sinal comparando com **a foto do ITEM** (`fotoDriveId` que a pessoa
   viu no card), não com o topo da busca. Aceitou o que o card mostrou =
   `aceita-como-veio`. O desfecho continua CALCULADO no servidor.

---

## F4 — Trocar custa 1 toque, e pode dizer o porquê (bancada)

- O card mostra **as 3 candidatas do topo** (o item de plano guarda as 3 da
  emissão); trocar = toque, sem abrir o seletor. O seletor fica no "ver mais".
- **1 das 3 vagas é exploração** quando existir candidata nova/nunca-proposta
  — a cota que impede a ossificação (ver § Manutenção). As outras duas vêm do
  score.
- **Chip de motivo, opcional, pós-troca**: `escura` | `prato-antigo` |
  `nao-e-o-assunto` | `repetida` | `outro`. Vai em `escolhido.motivo` no
  sinal (Json — TEXT livre, vocabulário em `vocabulario.ts`). **Nunca
  obrigatório, nunca bloqueia** — pedágio se paga sem ler. O motivo refina o
  score (`prato-antigo` rebaixa global e forte; `nao-e-o-assunto` rebaixa só
  no tema) e alimenta o relatório da F5.
- `escolhido.posicao` passa a ser gravado — escolher a 2ª mostrada é
  preferência precisa, e hoje isso se perde.

⚠️ **Sequenciamento do KPI**: a F4 muda o custo da troca e portanto o
comportamento — ligar junto com F1/F2 embaralha o antes/depois. Medir F1+F2
por ao menos uma semana antes de ligar a F4.

---

## F5 — O acervo que não tem a foto (opcional, decisão após medir F1–F3)

1. **Relatório de lacunas** por cliente (somente leitura, script primeiro):
   temas onde toda proposta foi trocada/expirou; pilares sem nenhum destaque;
   % do acervo nunca proposto. Vira o **brief do fotógrafo** — o gargalo vira
   entregável para o cliente. Se provar valor, entra como UMA linha no
   relatório semanal de domingo (pega carona, cron novo não).
2. **Trilha `imagem` como tapa-buraco declarado**: quando a leva sai com foto
   fora do assunto (o aviso já existe), oferecer explicitamente "gerar cena
   por IA?" — decisão humana, custo declarado, nunca automático.
3. **Visão no shortlist, não no acervo**: checagem objetiva das 9–12 fotos que
   a `propor-semana` escolheu (nítida? escura? cabe no 9:16 com área calma
   para texto?) — perguntas de FATO, nunca "é bonita" (visão erra estética e
   posição; lições registradas). **Avisa no card, nunca veta, nunca regera
   sozinha.** Centavos por semana. **Substitui o backfill de visão nas 12 mil
   fotos**, que fica adiado até os números pedirem.

---

## Manutenção — a vida da foto nova (regras que ficam)

**Adicionar foto continua sendo só jogar no Drive.** O funil depois disso:

| Momento | O que acontece | Quem faz |
|---|---|---|
| Foto cai no Drive | visível por pasta; fora da busca por tema | — |
| Madrugada (02:00) | catalogada (visão, tags, md5) — **teto agora 200/cliente/noite**; acima disso quem corta é o orçamento de 240s, e o excedente rola para a noite seguinte (diff idempotente) | cron |
| Catalogada | nasce sem score, sem destaque, com `catalogadaEm` — **novidade** | cron |
| Primeiras semanas | boost de novidade + vaga de exploração no shortlist: aparece AO LADO das provadas, nunca no lugar delas, e não some | sistema |
| Alguém escolhe | score positivo no tema; arte com "Gostei" → candidata a destaque pela semente | sinais existentes |
| Ninguém escolhe | boost decai; vira foto comum do ranking | sistema |
| Apagada do Drive | sai do catálogo na poda existente; `PhotoUsage`/sinais/destaque **sobrevivem** (sem FK) e param de ranquear naturalmente (o score parte do catálogo) | cron |

- **`catalogadaEm` é carimbado pela reconciliação só nas entradas NOVAS** — e
  aqui a regra "o diff não retoca entrada existente" trabalha A FAVOR: foto
  antiga não é novidade; ausência do campo = sem boost.
- **Manutenção obrigatória: nenhuma.** Sem curadoria a foto nova roda na cota
  de exploração e o uso real decide. Curadoria é acelerador, nunca portão.
- **Curadoria por leva, não faxina**: quando a rodada cataloga uma leva nova,
  o resumo do cron já sabe quantas e de quem — a passada de 2 minutos é só na
  leva. Aviso começa como linha no relatório semanal (não mensagem própria no
  grupo — ruído).
- Limitação registrada: foto **movida de pasta** mantém o id e o catálogo fica
  com a pasta velha até reanálise manual (o diff não retoca entrada).
- Opcional pequeno: o upload pelo celular pode catalogar na hora só os
  arquivos enviados (poucas fotos, centavos) — mata o gap de 24h nesse fluxo;
  a leva do fotógrafo continua na madrugada, que resolve.

---

## Validação e KPI

- **Backtest offline** (F1.5) decide os pesos antes de qualquer deploy.
- **KPI vivo, já rodando** (nenhuma instrumentação nova): taxa de
  `aceita-como-veio` (hoje **12%**) e % de trocas fora do top-10 (hoje
  **53%**). Medição: promover `scripts/.tmp-analise-sugestao-de-fotos.ts` a
  `scripts/medir-sugestao-de-fotos.ts` (somente leitura).
- Meta honesta: o backtest diz o teto do que dá para prometer; a direção é
  dobrar a aceitação já com F1+F2 e seguir subindo com F3/F4. Números finais
  só depois do backtest.

---

## Fora do escopo (recusado ou adiado, com motivo)

- **Backfill de visão nas 12 mil fotos** — substituído pela visão no
  shortlist (F5.3); gasto onde a decisão acontece.
- **Embeddings/Upstash para o acervo** — só se a F2 (palavras + sinônimos de
  pilar + pares tema→foto aprendidos) não bastar, medido pelo KPI. Acopla num
  backend que já falhou em silêncio uma vez (disjuntor de 11/08) e o ganho
  provável é pequeno perto do custo.
- **Qualquer interruptor global ou portão de aprovação de foto** — capturar
  sempre, marcar por item, filtrar no consumidor; e portão vira pedágio que se
  paga sem ler.
- **Reordenar o acervo geral por "nota estética" de modelo** — visão reprova
  execução, nunca gosto; "é bonita?" é a pergunta que ela erra.

## Ordem proposta

| Etapa | Conteúdo | Esforço |
|---|---|---|
| 1 | F1 (tabela + semente + score + backtest) + F2 (palavras) — mesmo módulo, mesma rodada | sprint curta |
| 2 | F3 (conjunto da semana + fidelidade do sinal do item) | pequeno |
| 3 | F4 (top-3 no card + motivo opcional) — só depois de uma semana de KPI da etapa 1 | médio (UI) |
| 4 | F5 (lacunas, tapa-buraco declarado, visão no shortlist) | incremental, decisão após medir |
