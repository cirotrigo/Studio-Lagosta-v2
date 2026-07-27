# Sessão 26–27/07/2026 — Editor, Instagram e métricas

Registro das 29 mudanças desta sessão, organizado por área. Cada item diz **o que
mudou**, **por que** e, quando houver, **a armadilha que ficou documentada** —
essa última parte é o que costuma se perder e voltar a morder depois.

---

## 1. Gradientes do editor

**Commits:** `bf10c17`, `faa10ea`

- Editor de gradiente unificado entre o painel lateral e o de propriedades
  (antes eram duas UIs divergentes).
- **Radial destravado**: centro posicionável (`gradientCenterX/Y`) por handle
  arrastável no canvas, grid 3×3 de atalhos, sliders finos e raio ajustável
  (`gradientRadiusScale`). Antes ficava preso no canto superior esquerdo.
- **Linear**: dois handles nas extremidades definem *início e fim reais* do
  gradiente, não só a direção. Permite "degradê do topo até a metade", com a
  última cor sólida no restante. Botão "Preencher camada" volta ao padrão.
- Editor e `render-engine` passaram a usar a **mesma fórmula** de centro/raio,
  eliminando divergência entre preview e arte exportada.

**Armadilha:** os campos de segmento (`gradientStartX/Y`, `gradientEndX/Y`) são
opcionais. Ausentes, o eixo é derivado do ângulo cobrindo a layer inteira — é o
que mantém os templates antigos funcionando.

---

## 2. Vazamento de edições entre páginas

**Commits:** `fc4b9cf`, `8e207bf`, `c4fef54`

Editar o estilo de uma layer alterava a layer de **outra página** do mesmo
template. Duas causas somadas:

1. O PageSync trocava de página para gerar thumbnails e um update em voo
   acertava a página errada.
2. A rota de duplicar página copiava as layers **mantendo os ids**, então
   páginas distintas tinham layers com id idêntico.

Correções: fix no PageSync, regeneração de ids na duplicação (com remapeamento
de `parentId`), e um script de saneamento do dado legado.

**Saneamento executado:** `scripts/fix-duplicate-layer-ids.ts` — 87 templates,
512 páginas, 2.501 ids renomeados. Dry-run por padrão; só grava com `--apply`.

**Armadilha:** o script **não pode** renomear ids usados como chave de
`slotValues` nos posts agendados (o resolvedor casa por id **ou** nome). Ele já
protege esses ids e os slots semânticos (`titulo`, `logo`, `rodape-1`…), mas
qualquer saneamento futuro precisa manter essa proteção.

---

## 3. Fontes no render server-side

**Commit:** `c166b0c`

`getSystemFontPaths()` apontava **"Montserrat" para o arquivo do Arial** (macOS)
e do DejaVu Sans (Linux, produção). Toda arte exportada com Montserrat saía com
outra tipografia da que o editor mostra — em todos os templates, silenciosamente.

- 8 pesos estáticos (100–900) embarcados em `assets/fonts/montserrat/`, sob OFL.
- Registro no `CanvasRenderer`, uma face por peso sob a família "Montserrat".
- `outputFileTracingIncludes` nas três rotas que renderizam server-side.

**Armadilhas:**
- **Fonte variável não serve**: o napi-rs canvas não aplica o eixo de peso —
  testado, todos os pesos saíam idênticos. Por isso arquivos estáticos.
- **`fs`/`path` não podem entrar em `font-config.ts`**, que também é importado
  por componentes client — colocar lá quebra o editor com "Can't resolve 'fs'".
  A resolução de caminhos vive no `canvas-renderer` (server-only).
- Os arquivos são abertos por path, não importados: **sem o tracing, o deploy
  não os inclui** e a produção volta ao fallback sem avisar.

---

## 4. Zernio (ex-Later)

**Commit:** `7db0642`

O cron de analytics recebia **402** a cada 6 horas: a conta não tem o add-on de
Analytics (`analytics_addon_required`, assinatura à parte). Cada execução
despejava a resposta inteira no log e devolvia 500, simulando um incidente.

- `LaterPaymentRequiredError` (402) com o código do provedor.
- 402 loga uma linha; o cron sai com `success + skipped`.
- Rota de analytics do post devolve 402 com mensagem acionável.

**Armadilha:** o corpo de erro do Zernio varia — `error` é objeto no caso geral
e **string com `code` na raiz** no 402. O parser aceita as duas formas.

**Pendente (decisão comercial):** o add-on segue não contratado. As métricas do
Zernio continuam indisponíveis.

---

## 5. Instagram Graph API — a integração estava morta

**Commits:** `5b2e578`, `1fd00ca`, `b40dfc3`, `0a359b7`, `be96f0d`, `212ccee`,
`08be19e`

A integração não funcionava desde março e ninguém sabia. Quatro problemas
simultâneos:

1. **Host errado**: o token da conta é do tipo Instagram Login (`IGAA...`), que
   responde em `graph.instagram.com`, mas o cliente usava `graph.facebook.com`.
   O host errado devolve "Cannot parse access token" — fácil de confundir com
   token inválido. Agora é derivado do prefixo do token.
2. **Versão v18.0** → v25.0 (atual).
3. **Métrica descontinuada**: `impressions` saiu em março/2025 para mídia. Para
   **stories** a métrica certa é `views`, e `exits`/`taps_forward`/`taps_back`
   **deixaram de existir**, substituídas por `navigation`.
4. **Os crons nunca foram agendados** — `fetch-story-insights` e
   `verify-stories` existiam no código e não estavam no `vercel.json`.

Como efeito, **a verificação independente de publicação não estava ativa**: o
status VERIFIED vinha do sync do Zernio, ou seja, do relato do próprio
agendador.

### Token por projeto

As contas dos clientes vivem em **portfólios empresariais separados**, então o
token de usuário do sistema alcançava só a @lagostacriativa. O caminho que
funciona é o Instagram Login: cada conta aceita convite de testador e gera um
token próprio.

- `Project` ganhou `instagramAccessToken`, `instagramTokenExpiresAt` e
  `instagramAppScopedId`.
- Cliente aceita token por instância; com token IGAA endereça a conta por `me`.
- **Cron diário de renovação** (`refresh-instagram-tokens`): esses tokens
  expiram em 60 dias — foi exatamente assim que a integração morreu em março.
- Cadastro por `npm run ig:token -- <projectId> <TOKEN>` ou pelo campo na aba
  **Configurações** do projeto.

**Armadilhas:**
- O id do Instagram Login (`27801015136218642`) é de **outro espaço** que o id
  de conta business (`1784...`). Não são intercambiáveis.
- O Instagram **rejeita a requisição inteira** se uma métrica da lista não
  existir. O cliente remove a métrica recusada e refaz — mas o parser precisa
  intersectar com a lista devolvida pela API, porque a mensagem de erro
  *contém os nomes das métricas válidas* (procurar nomes soltos ali descarta
  justamente as boas).
- `GET /api/projects/[id]` fazia spread do registro inteiro e **enviaria o
  token ao navegador**; o mesmo no service de client-projects. Ambos agora
  expõem só `hasInstagramToken`. **Qualquer campo sensível novo no `Project`
  cai na mesma armadilha.**

### Segurança

`scripts/refresh-instagram-token.ts` tinha **App ID e App Secret da Meta em
texto puro**, versionados num repositório **público** desde 31/10/2025 — cerca
de nove meses expostos. Credenciais movidas para variáveis de ambiente e
`.gitignore` estendido para `.env.bak-*` / `.env.backup-*`.

**Pendente:** o secret exposto é do app `616046264322031`, que **não aparece
mais** na lista de apps da conta. Confirmar em Meus apps → Arquivados; se ainda
existir, rotacionar.

---

## 6. Métricas

**Commits:** `2bec0d8`, `4d0837f`

A página de analytics **já existia completa** e estava inalcançável e quebrada:

- **Não havia link** para ela em lugar nenhum. Virou a aba **Métricas**.
- **Mostrava zero com dados no banco**: ordenar por engajamento com limite 50 e
  `ORDER BY ... DESC` no Postgres coloca **nulos primeiro**, então as 50 vagas
  eram preenchidas com posts sem métrica. Corrigido com `nulls: 'last'`.
- Conteúdo extraído para `ProjectAnalyticsPanel`, usado pela aba e pela página
  avulsa.

**Coleta:** métricas de story eram colhidas **uma única vez** (entre 6 e 16h
após a publicação) e congeladas, subestimando o alcance real. Agora recolhe de
hora em hora enquanto o story está no ar.

**Armadilha:** insights de story só existem nas 24h em que ele está no ar. Se a
coleta falhar durante as 24 horas inteiras, **o dado se perde para sempre**. Já
coletado, persiste no banco indefinidamente.

---

## 7. Texto e combinações tipográficas

**Commits:** `2ff9403`, `1054833`, `5108c1b`, `807a83a`, `d707e2a`, `7f9df7d`,
`2aee3bc`, `ec100d1`, `80d4780`, `097cd1b`

- **Aba Texto unificada**: adicionar textos, fontes da marca e galeria de
  combinações num lugar só (antes eram duas abas para o mesmo trabalho).
- **Combinações por projeto** (`FontCombination`), semeadas com os seis modelos
  base no primeiro acesso. Cada marca ajusta os seus sem afetar as outras.
- Elemento guarda **posição, largura, altura, inclinação, cor, efeitos** e a
  família da fonte quando ela difere do par da marca. Posições são frações do
  canvas, então uma combinação salva num story 1080×1920 segue coerente num
  post 1080×1350.
- **Editar** aplica no canvas e o usuário ajusta com as ferramentas normais;
  **criar** captura os textos selecionados.
- **Focar textos**: escurece camadas não-texto e o fundo durante a edição.
- **Preview fiel**: o card é uma miniatura do canvas, com cada texto na posição
  real (usa `cqw` para escalar com a largura do card).

**Armadilhas:**
- **O modo focar textos só pode existir durante a edição.** Miniaturas
  (`page-thumbnail-utils`) e exportação (`stage.toDataURL`) leem o **stage ao
  vivo** — deixá-lo ligado sujaria a arte exportada.
- **Salvar não pode depender da seleção**: durante a edição o usuário clica em
  cada texto e a seleção do grupo se perde. O conjunto é rastreado por id de
  layer.
- **A captura precisa espelhar tudo que o editor deixa ajustar.** Altura,
  inclinação e família foram esquecidas em rodadas sucessivas, cada uma
  descartando o ajuste em silêncio. Se algum ajuste novo não persistir, é o
  mesmo sintoma.
- **Não adivinhar fonte não configurada**: o par caía na primeira fonte enviada
  do projeto, fazendo uma fonte qualquer virar "a fonte da marca" sem ninguém
  escolher. Agora cai no padrão do sistema e avisa.

**Decisão de modelo:** existem **dois papéis** (título e corpo). Subtítulo usa a
fonte de corpo, variando peso e tamanho — confirmado com o usuário. Adicionar um
terceiro papel exigiria coluna nova, seletor e migração das combinações.

---

## 8. Posts

**Commit:** `0434a67`

Conteúdo endereçado a um slot inexistente era **descartado em silêncio**: a arte
saía sem o texto e ninguém sabia. Levantamento encontrou 11 posts nessa situação
— o caso típico é o fluxo de copy gerar um CTA para um layout que não tem esse
elemento.

`findUnmatchedSlotKeys()` identifica as chaves sem layer correspondente
(ignorando chaves de controle com prefixo `_`, como `_driveImageId`), o cron e o
MCP logam, e a criação de post devolve `warnings` sem bloquear.

---

## 9. Histórico de migrations do Prisma

**Commit:** `404ba4b`

O histórico não podia ser reproduzido do zero: o `00000000000001_baseline`
criava os enums e algumas tabelas, mas **não criava `Prompt` nem
`Organization`** — e `20241123120000_add_prompt_organization_visibility`
tentava alterá-las. O shadow database falhava com *"The underlying table for
model `Prompt` does not exist"*.

Em produção nada quebrava, porque as tabelas existiam (criadas por `db push`).
Quebrava só o `prisma migrate dev` — foi por isso que as tabelas desta sessão
(`FontCombination`, colunas de token do Instagram) precisaram ser criadas por
SQL direto.

**Correção:** as 31 migrations foram consolidadas num único `0_init`, gerado do
schema atual (54 tabelas), e o histórico do banco reescrito para o registro
correspondente.

**Pré-condição que tornou isso seguro:** o banco já estava **exatamente igual**
ao schema (`migrate diff` vazio, verificado antes e depois). Sem isso, o squash
congelaria qualquer divergência em silêncio — se for preciso repetir a operação
um dia, essa verificação vem primeiro.

O `0_init` é **idempotente** (`IF NOT EXISTS` e blocos `DO` para enums e chaves
estrangeiras), mantendo a convenção do baseline anterior: aplicar num banco já
populado vira no-op em vez de erro.

**Verificação:** `migrate status` limpo, `migrate deploy` sem pendências, e
`migrate dev --create-only` — a operação que falhava — gerando migration vazia,
o que prova que o shadow reproduz o histórico e que ele corresponde ao banco.
Dados intactos: 11 projetos, 119 templates, 963 páginas, 7.577 posts.

**Consequência prática:** mudanças de schema voltam ao fluxo normal
(`prisma migrate dev --name ...`), sem SQL manual. Clones antigos precisam
puxar a `main` antes de rodar comandos de migration, porque as pastas antigas
saíram do repositório (seguem no histórico do git).

---

## Estado ao fim da sessão

| Área | Situação |
|---|---|
| Gradientes | ✅ em produção |
| Vazamento entre páginas | ✅ corrigido + dado saneado |
| Montserrat no export | ✅ fonte real embarcada |
| Instagram — código | ✅ revivido e validado contra a API real |
| Instagram — acesso | ⚠️ 3 de 11 projetos com token (Lagosta, Empório, Espeto) |
| Métricas | ✅ coletando; aba no ar |
| Combinações | ✅ por projeto, editáveis |
| Add-on Zernio | ⏸️ decisão comercial pendente |
| App secret exposto | ⚠️ confirmar se o app arquivado ainda existe |
| Migrations do Prisma | ✅ consolidadas; `migrate dev` funcional |

### Próximos passos sugeridos

1. Cadastrar token dos 8 projetos restantes (convite de testador → aceite →
   gerar token → colar na aba Configurações).
2. Definir fontes de marca dos projetos que exibem o aviso amarelo.
3. Conferir Meus apps → Arquivados quanto ao app `616046264322031`.

### Nota de processo

Os testes desta sessão rodaram no template **"Segunda-Feira" (95), que é de
produção**. Três camadas de texto da Pag.02 chegaram a ser perdidas e foram
restauradas a partir de backup. Testes futuros devem usar um template
descartável.
