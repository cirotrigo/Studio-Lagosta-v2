# CP5 — veredito persistido e gate duro só no fluxo autônomo (auditoria, 15/10/2026)

> **Atualização para a main `69706ea2` (15/10/2026, tarde) — leia antes do resto.** Este documento foi
> escrito e auditado (6 frentes + Codex R5 APTO) com a `main` em `53eda0c9` (CP2B). Desde então
> entraram na `main` o **CP3** (PR #231), o **CP4** (PR #232) e o **CP4.1** (PR #233). O plano-mestre
> `docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` (seção 4) é a leitura atual; abaixo, o que
> mudou em relação ao texto original — **o texto original foi mantido como está, com os números de linha
> do commit 53eda0c9**, e nada aqui foi implementado.
>
> | O texto abaixo diz | Hoje (main 69706ea2) |
> |---|---|
> | "Pré-requisitos NÃO presentes: CP3 e CP4"; `ajustarArte` grava mesmo quando piora | CP3, CP4 e CP4.1 na main; recusa ANTES da escrita; `piloto-ciclo.test.ts:271` é `it()`; só `:554` e `:615` (CP5d) seguem `hojeViola` |
> | § 11/12: `texto-sobre-assunto` comprova SÓ com catálogo; "sem assunto → não comprovada → humano" | O CP4.1 criou `CoberturaDaRegra.naoSeAplica` (foto LIDA sem assunto localizável, ou peça sem foto): isso é "não se aplica", não "não medido". Seguir o texto à letra mandaria todo story de fundo liso ao humano para sempre. A política por caso (catálogo × estimado × não se aplica × falha × sem foto) é a decisão 1 do plano-mestre, a tomar no CP5a |
> | § 11/12 não listam **oclusão** (forma/imagem acima do texto) | Lacuna real: não há regra em `REGRAS_DA_REVISAO`; o revisor não lê `Layer.order` e não mede `shape`/`svg-path`; a régua renderiza as camadas acima do texto como "fundo". Antes de `APTO`: medir a oclusão OU detectar o cenário e mandar ao humano (plano-mestre 4.3) |
> | § 12: "copy completa" só por `revisaoDaPaginaComCamadas` | O CP4.1 acrescentou `copyRemovida` gravada na Generation (humano) e `CONTEUDO_NAO_PODE_SER_REMOVIDO` (draft-only): evidência extra para o gate |
> | § 4/5: chave `fieldValues.veredito` | O nome `veredito` já é vocabulário do feedback humano (`VereditoDeArte`) e do crivo; usar outro nome (ex.: `gate`) |
> | § 6: `rulesVersion = VERSAO_DAS_REGRAS` invalida quando as regras mudam | `'revisao-v1'` nunca foi bumpada após CP3 e CP4.1 — definir a política (bump por PR × hash) no CP5b |
> | § 12: piso de interface do story (188/224) "só no compositor e no oráculo" | Continua assim; `foraDaInterface` vira produção no CP5a |
> | Linhas citadas de `agendar-itens.ts` e `arte-rapida.ts` | Deslocadas (criação `:702`, guarda do ligado `:569`, adoção `:686-688`, efeitos `:758`; FOR UPDATE `arte-rapida.ts:1438`); os pontos existem |
> | § 14: "toda tool da allowlist que cria DRAFT passa pelo gate" | Asserção ainda não existe; entra no CP5c |
> | § 17: CP5b "já entregue pelo CP4" | Confirmado (`contextoDaMedicao` + `medirCamadasDaPeca`); `copyVersion` e `foraDaInterface` continuam só em testes |
>
> Também conferido na main: `agendar-leva` com `lembrete: true` no draft-only NÃO manda WhatsApp (o cron de
> lembretes exige `status: SCHEDULED`); nenhum webhook de saída existe; `efeitosPendentes` do item ligado
> continua sendo escrita sem gate (coberto pelo § 7).
>
> **Duas correções ao contrato executável, que valem sobre o texto abaixo:** (a) onde os §§ 4, 5, 13 e 17
> escrevem a CHAVE persistida `fieldValues.veredito` e o TIPO `VereditoDaArte`, leia um nome DISTINTO de
> `veredito` (a fixar no CP5b; o plano-mestre usa `gate` como exemplo; o nome da função pura é livre) — o contrato executável é o da seção
> 4.4 do plano-mestre, não o do § 5 abaixo; (b) o § 17 diz que `piloto-portao` "vira `it()` na decisão
> pura" (CP5a/CP5c1) — errado: esses testes chamam a simulação e a escrita de `agendar-leva` e só passam com
> o gate integrado (CP5c2). O CP5a tem só testes puros novos.

**Estado: SOMENTE AUDITADO. Nada implementado.** Este documento é o plano para o CP5, escrito a partir
de uma auditoria somente leitura da `main` (`53eda0c9`, o merge do CP2B), com seis frentes em paralelo
(arte rápida, caminhos de DRAFT, lotes e fila, perfil DRAFT_ONLY do MCP, Generation/Page/versão,
recomposição e última versão boa). Os números de linha são desse commit.

**Pré-requisitos NÃO presentes neste checkout** (a `main` em 53eda0c9 não os tem; são PRs abertos ou
por abrir na mesma noite): o **CP3** (regra `logo-sem-leitura` e a medida da logo — PR #231,
`feat/design-cp3-logo`) e o **CP4** (recusa `AJUSTE_PIOROU_ARTE` ANTES da escrita em `ajustarArte`,
`feat/design-cp4-nao-piorar`). Tudo o que abaixo cita o CP3 ou o CP4 é condição a verificar na `main`
antes do CP5c/CP5d — não é garantia atual. Hoje, nesta `main`, `ajustarArte` grava a página e reabre o
render mesmo quando piora (`arte-rapida.ts:1390`, `:1474`; `piloto-ciclo.test.ts:273` é `hojeViola`).

Decisões do owner que o plano obedece:

- fluxo humano: **WARN-ONLY** (o revisor avisa, nunca trava a agenda);
- fluxo autônomo / DRAFT_ONLY: **FAIL-CLOSED** — peça ruim NÃO cria DRAFT novo; a tool devolve
  `REVISAO_HUMANA_NECESSARIA` com refs + achados + motivos; "não consegui medir" ≠ "aprovado";
- DRAFT existente + tentativa ruim: a última versão boa permanece;
- nenhum status operacional novo, nenhuma migration; preferir estruturas existentes.

---

## 1. Arquitetura atual

A peça é `Page` (camadas) + `Generation` (arte renderizada, `fieldValues` Json) + `SocialPost`
(agenda). O revisor (`src/lib/creatives/revisao/`) mede uma página e devolve um relatório
(`RelatorioDaRevisao`: achados por regra, `cobertura` por regra, `ajustes` prontos) — **em memória, sem
gravar nada** (`revisar-arte.ts:324`, `readOnlyHint: true`). O executor (`ajustarArte`,
`src/lib/creatives/arte-rapida.ts:1126`) aplica ajustes e grava a página; a fila (`src/lib/compositor/fila.ts`)
compõe peças em lote; `agendar-leva` (`src/lib/lotes/agendar-itens.ts`) cria os DRAFTs do lote.

Hoje **nenhum caminho que cria DRAFT chama `revisarArte`** e **não existe veredito persistido**. A ordem
"compor → revisar → ajustar → agendar" vive só no manual do Dot (`src/lib/mcp/operacao-dot.ts:63-71`;
`docs/regras/dot-lagosta-operacao.md:101-121`) — é instrução ao agente, não conferida pelo código.
`REVISAO_HUMANA_NECESSARIA` existe só como texto do manual (`operacao-dot.ts:84`) e nos testes do CP0
(`direcao-de-arte/__tests__/suporte/propriedades.ts:90`); nenhuma tool o devolve.

O que o CP3 e o CP4 vão entregar para o CP5 (pré-requisitos, ver o alto do documento): regras mecânicas
com `certeza: 'medida'` e cobertura dita por regra (CP0–CP3); e, no CP4, a recusa `AJUSTE_PIOROU_ARTE`
ANTES da escrita (o ajuste que piora nunca substitui a página). O CP5 não mede nada novo: **consome o
relatório que já existe e decide**.

## 2. Caminhos que criam DRAFT (mapa completo)

Funil comum: **`criarPostDoAgendamento`** (`src/lib/creatives/agendar.ts:501`), que grava `status`
DRAFT salvo `situacao === 'agendado'` (`:407-408`), `renderStatus` (`PENDING` sem mídia; `RENDERED`
pela miniatura atual da página; `NOT_NEEDED` com mídia pronta), `pageId`, `generationId`,
`decididoPor`. Depois, o cron `render-stories` (a cada 2 min) renderiza a página COMO ELA ESTÁ e grava
`PostRenderProof` (`src/lib/posts/render-post-art.ts:185`).

| Caminho | `socialPost.create` | Chamadores | Alcançável pelo Dot (perfil draft-only)? | Revisão antes? |
|---|---|---|---|---|
| MCP `agendar-leva` | `lotes/agendar-itens.ts:702` (funil, dentro de `$transaction` com `pg_advisory_xact_lock` + `FOR UPDATE` em ItemDeLote/ItemDePlano/Page) | `mcp/catalogo/compositor.ts:661-721` | **SIM** (na allowlist `TOOLS_DRAFT_ONLY`) | não |
| MCP `colocar-na-agenda` | funil via `agendarPost` (`agendar.ts:739-744`) | `mcp/catalogo/agenda.ts:342-456` | não (fora da allowlist; `MANUAL_DO_DOT.foraDoLoop`) | não |
| MCP `postar-agora` | funil via `postarAgora` | `agenda.ts:459` | não | — (nunca DRAFT) |
| HTTP bancada `POST /api/projects/[id]/agendar` | funil | `use-bancada.ts` | não (Clerk, humano) | não |
| HTTP editor `POST /api/templates/[id]/agenda-das-paginas` | funil | `use-agenda-das-paginas.ts` | não (humano) | não |
| Vídeo na agenda | `video/process-video-job.ts:731` (funil) | jobs de vídeo | não | não |
| stdio `create-post`, `plan-week`, `sync-zernio-posts` | `scripts/mcp-server.ts:753`, `:2035`, `:2227` | só MCP local | não com `STUDIO_SO_RASCUNHO=1` (excluídas) | não |
| HTTP/cron `sync-zernio` | `posts/sync-zernio/route.ts:126`, `cron/sync-zernio/route.ts:187` | UI, cron | não | — (status vem do Zernio, já com `laterPostId`) |
| Composer `POST /api/projects/[id]/posts`, Repostar, `/api/external/posts` | `later-scheduler.ts:363` | UI, Claudinho | não | — (nunca DRAFT: SCHEDULED fixo) |
| Transições para DRAFT (`voltar-para-rascunho`, `recover-stuck-post`, `update-post`) | não criam | — | não (fora da allowlist) | — |
| `criar-arte`, `criar-arte-de-modelo`, `criar-carrossel`, `compor-leva`, `executar-plano`, `prepare-creative` | **nenhum** `socialPost.create` | — | — | só criam Generation/Page |

Conclusão: **para uma chamada com perfil efetivo `draft-only`, há UM caminho de criação de DRAFT:
`agendar-leva` → `agendarItensDoLote` → `criarPostDoAgendamento`.** É o funil onde o gate mora. A
fronteira do CP5 é **o perfil da chamada**, não a identidade "Dot" nem a origem do DRAFT: os outros
caminhos são de chamadas com perfil `normal` (humanos, serviço, cliente OAuth novo) ou superfícies fora
da porta MCP (`/api/external/posts` e seu PATCH, crons, UI) — todos warn-only por decisão do owner, e
fora do gate. O mapa acima é dos caminhos que CRIAM DRAFT; não é uma garantia global sobre quem pode
alterar um post existente.

Dois caminhos **mudam** um DRAFT do Dot depois de criado, sem criar outro: `ajustar-arte` (draft-only:
`apenasRascunho`, com `FOR UPDATE` nos posts e `POST_APROVADO_INTOCAVEL`; grava a página e reabre o
render dos rascunhos — hoje mesmo quando piora) e o cron de render (redesenha a página como está, sem
revisão). O CP4 fecha o primeiro (recusa antes da escrita); o segundo só acontece depois de alguma
escrita na página — que, no fluxo autônomo, é só o `ajustar-arte`.

## 3. Detecção de autonomia (a fronteira é o perfil efetivo da chamada)

`perfilDoPrincipal(principal)` (`src/lib/mcp/registro/perfil.ts:71-83`): `'draft-only'` quando
`STUDIO_SO_RASCUNHO=1` no stdio, ou quando o `clientId` do token OAuth está em
`MCP_DRAFT_ONLY_CLIENT_IDS`; senão `'normal'`. O perfil vem do token resolvido no servidor
(`oauth.ts:265-290`) — **nenhum argumento de tool entra no cálculo**; é confiável contra o cliente. A
porta (`registro/porta.ts:55-61`) recusa tools fora da allowlist como "Ferramenta desconhecida".

Limites a registrar:

- o perfil **não é persistido** em `SocialPost` nem em `Generation` (`canal` não distingue Dot de pessoa:
  o ChatGPT é `claude-ai`); por isso o gate tem de ser decidido **no momento da chamada**, pelo
  `apenasRascunho` que cada handler já calcula (`compositor.ts:708`, `arte-ia.ts:237`);
- risco documentado (`docs/regras/dot-lagosta-operacao.md:257-266`): um cliente OAuth novo nasce
  `normal`. A mitigação existente é o manual (`PERFIL_DE_SEGURANCA_INATIVO`). O CP5 não muda isso; o
  gate fail-closed só vale onde o perfil é draft-only — **o risco "Dot em perfil normal" fica fora do CP5**
  e deve ser dito no relatório como limite;
- `/api/external` (Claudinho) não passa pela porta e nunca cria DRAFT (SCHEDULED fixo).

## 4. Persistência sem migration

Onde há Json: `Generation.fieldValues` (merge raso por chave, `mesclar-field-values.ts:39-50`),
`Page.layers/audio/copyAutoral` (o primeiro entra no hash da versão; o terceiro é contrato estrito),
`SocialPost.slotValues/recurringConfig/webhookResponse`, `PostLog.metadata` (append-only),
`PostRenderProof.layersSnapshot` (CHECK `array`, trigger append-only — **não serve**).

Proposta: **`Generation.fieldValues.veredito`**, na Generation que é a arte da página
(`arteDaPagina`, `compositor/arte-da-pagina.ts:35-45`), gravado por `mesclarFieldValuesDaArte` com a
chave só dele. **É um registro de auditoria (cache descartável), nunca autoridade**: o gate SEMPRE mede
(seção 7); ninguém decide por um veredito gravado sem medir de novo. A chave pode ser apagada ou
recalculada a qualquer momento sem efeito operacional. Por isso o problema "insumos fora do hash da
página" (`copyAutoral`, fontes, assinatura, catálogo) não existe para a decisão — só para a leitura
histórica, que diz `pageVersion` e `medidoEm`.

- Sobrevive à recomposição (ela regrava `spec, composicao, layersSnapshot, thumbnailUrl,
  versaoRenderizada, copyAutoral, recomposicao, recusaDaRecomposicao` — `recompor.ts:589-626` —, não
  `veredito`) e ao re-render; **fica stale por construção** porque carrega `pageVersion` (seção 6).
- Não sobrevive ao `ajustarArte` no sentido útil: ele cria uma Generation NOVA (`persist.ts:426-428`)
  que passa a ser a arte da página; o veredito antigo fica na anterior. É o comportamento certo — a
  peça ajustada é outra e tem de ser medida de novo (o CP4 já mede o "depois").
- A chave `revisao` já está ocupada por `{versaoAntes, ajustes, aplicados, recusados}` do ajuste
  (`arte-rapida.ts:1527-1530`, lida por `relatorios/qualidade-da-copy*.ts`): **não reutilizar**.

Leitores: `ver-geracao` e `auditar-operacao` passam a expor `veredito` (campo novo no RETORNO, que o
`validar-registro-mcp` não fixa — só o schema de entrada).

## 5. Contrato proposto

> ⚠️ Contrato SUPERADO no nome do campo e no tipo (`veredito` colide com o feedback humano): ver a nota do topo e a seção 4.4 do plano-mestre. O restante (campos da identidade, invalidação) continua válido.

```ts
/** `Generation.fieldValues.veredito` — registro de auditoria da última decisão do gate (cache descartável). */
interface VereditoDaArte {
  versao: 'veredito-v1'
  /** `versaoDaPagina(page)` SEM o áudio (a mesma chamada do revisor), no momento da medida. */
  pageVersion: string
  /** `hash(estavel(page.copyAutoral))` (`'sem-contrato'` quando `null`), da MESMA leitura — a 2ª parte da identidade (seção 6). */
  copyVersion: string
  /** `VERSAO_DAS_REGRAS` do revisor ('revisao-v1'). */
  rulesVersion: string
  resultado: 'APTO' | 'REVISAO_HUMANA_NECESSARIA'
  /** Só o que decidiu: as regras críticas que NÃO comprovaram medida, e os achados críticos (regra + camadas + id). */
  naoMedidas: Array<{ regra: string; motivo: string }>
  achados: Array<{ regra: string; camadas: string[]; id: string }>
  medidoEm: string
  /** Quem mediu: 'agendar-leva' | 'ajustar-arte'. */
  origem: string
}
```

O veredito é derivado por uma função PURA **`vereditoDaMedida(medida, relatorio, identidade)`**
(em `src/lib/creatives/revisao/veredito.ts`), testável sem banco. **Entra a MEDIDA inteira**
(`MedidaDaPeca` = a `EntradaDaRevisao` sem visão, que o CP4 extrai de `revisarArte` em
`medirCamadasDaPeca`: tem `assunto.origem`, `contraste`, `leituraDaLogo`, `fontesAusentes`,
`motivoSemMedida`, `textosSemMetrica`), o relatório (`avaliarPeca(medida)`) e a identidade
(`pageVersion` + `copyVersion`, seção 6) — não só o relatório, que não traz a origem do assunto nem o
contraste quando não há achado. Sai `VereditoDaArte`. **Dois formatos com nomes distintos**: o
PERSISTIDO (`VereditoDaArte`, acima, mínimo) e a RESPOSTA ao agente (`RespostaDeRevisaoHumana`, seção
13: refs + achados + motivos derivados do relatório no momento da chamada). Nenhum duplica o relatório.

## 6. Invalidação

Por construção, sem limpeza: o consumidor (`ver-geracao`, `auditar-operacao`) compara
`veredito.pageVersion === versaoDaPagina(página atual)`, `veredito.copyVersion === hash(copyAutoral
atual)` e `veredito.rulesVersion === VERSAO_DAS_REGRAS`; qualquer divergência = registro histórico,
não "veredito atual" (Codex R5: `copyAutoral` muda sem mudar as camadas). Toda escrita em
`Page.layers` (editor, PATCH de camada, ajustar-arte, recompor, reverter) muda o hash
(`versao.ts:45-58`; auditoria da frente E: nenhum escritor de `layers` escapa). A recomposição regrava
`composicao` inteira mas não toca `veredito`, que fica stale pelo `pageVersion` — exatamente o padrão
de `versaoRenderizada` + `thumbnailEhAtual` (`lotes/agendamento.ts:501-513`).

Atenção: `versaoDaPagina` tem um segundo argumento (`quadro.audio`) usado em `versaoRenderizada`
(`persist.ts:370`) e não em `revisarArte` (`:531`). O veredito usa a MESMA chamada do revisor (sem
áudio), distinta da versão da miniatura (`thumbnailEhAtual`, `agendamento.ts:501`), e o documento diz
as duas. Como o gate sempre mede (seção 7), a identidade serve só para comparar "a página que medi" com
"a página que vou agendar" dentro da mesma chamada.

**A identidade tem DUAS partes**, porque `Page.copyAutoral` muda sozinho sem tocar `layers`
(`copy-autoral/persistir.ts:39`, `registrarRevisaoDaPagina`) e a regra "copy completa" o lê:
`identidade = { pageVersion: versaoDaPagina(page), copyVersion: hash(estavel(page.copyAutoral)) }`
(o mesmo `estavel` + sha256 de `versao.ts`, sobre o Json do contrato; `null` → `'sem-contrato'`). Os
dois são lidos da MESMA leitura da página que alimentou a medida e relidos sob a trava; qualquer um
divergindo → `REVISAO_HUMANA_NECESSARIA` ("a página mudou durante o agendamento"). Fontes, assinatura e
catálogo são insumos da medida (lidos ao medir), não da identidade — e a medida nunca é reaproveitada
de outra chamada.

## 7. O gate (só com perfil efetivo `draft-only`)

Onde cada parte mora, com precisão:

- **Decisão pura** em `lotes/agendamento.ts` (`decidirAgendamento`, `:286`): ganha uma entrada
  `veredito: VereditoDaArte | null` e devolve `falha REVISAO_HUMANA_NECESSARIA` quando
  `apenasRascunho` e (`veredito` ausente ou `resultado !== 'APTO'` ou `veredito.pageVersion` ≠ a versão
  da página relida ou `veredito.copyVersion` ≠ o hash do `copyAutoral` relido). As DUAS partes da
  identidade entram no predicado, e cada uma reprova sozinha. Testável sem banco.
- **Medida** em `lotes/agendar-itens.ts`, FORA da transação (a transação tem `timeout: 20_000`,
  `:746`; a medida leva segundos): entre a 1ª `decidirEscrita` (sem trava, `:354`) e a transação, para
  cada item com `apenasRascunho`, ler a página UMA vez (camadas + `copyAutoral`), medir
  (`contextoDaMedicao` + `medirCamadasDaPeca` + `avaliarPeca`, as funções do CP4, sem visão) e derivar
  `vereditoDaMedida(medida, relatorio, identidade)`. Sob trava (`:647-665`, a 2ª `decidirEscrita`), o
  gate só COMPARA a identidade relida (`pageVersion` E `copyVersion`); divergiu →
  `REVISAO_HUMANA_NECESSARIA` com motivo "a página mudou durante o agendamento" (**nunca** medir dentro
  da trava; **nunca** confiar num veredito de outra identidade).
- **Três respostas distintas**, também na simulação (`decidirEscrita` 1ª passada):
  - `criar`: passa pelo gate; reprovado → nada é criado;
  - `adotar` (DRAFT existente na página, `:569`): hoje a adoção VINCULA o item ao post e roda efeitos
    (`:683`, `:755`). Com veredito reprovado a adoção **não acontece** — nem vínculo, nem efeitos, nem
    escrita: o item volta com `REVISAO_HUMANA_NECESSARIA` e `draftExistente: { postId }` (o DRAFT
    preexistente permanece intocado — é a última versão boa); com veredito APTO a adoção segue como hoje;
  - `reaproveitar` (`responderLigado`, `:555`, o post já ligado ao item): **nem sempre é só leitura.** Quando
    `decisao.efeitosPendentes` (a linha tem post mas `efeitosDoAgendamentoEm` ficou `null`, `:572`),
    `executarEfeitos` (`:458`) escreve: refila a página, remarca a pasta, atualiza o item do plano. No
    perfil draft-only esses efeitos só rodam com veredito APTO da identidade relida: a medida (fora da
    trava, como em `criar`) e a comparação da identidade vêm ANTES de `executarEfeitos`; reprovado →
    os efeitos ficam PENDENTES (a linha continua `efeitosDoAgendamentoEm: null`, idempotente — a
    repetição os completa quando a peça estiver apta) e o item volta `falha REVISAO_HUMANA_NECESSARIA`
    com `postId` e o veredito. **A corrida entre a aprovação e os efeitos** (os efeitos rodam fora da
    transação, em etapas, `:458-495`): o que `executarEfeitos` escreve é SOBRE o post e o item —
    catálogo e sinais (`efeitosDoAgendamento`), a pasta/remarcação da página, o status do item do plano
    — e nada disso altera `Page.layers` nem `copyAutoral` (a arte medida). A proteção é uma
    **rechecagem barata imediatamente antes da escrita dos efeitos**: `executarEfeitos`, no perfil
    draft-only, relê a identidade (`pageVersion` + `copyVersion`) e só roda se for a mesma que o gate
    aprovou; divergiu → não roda, a linha segue pendente, o item volta `REVISAO_HUMANA_NECESSARIA`
    ("a página mudou durante o agendamento"). Entre essa releitura e cada escrita ainda há uma janela,
    mas ela não cria nem muda DRAFT e não altera a arte — é a mesma janela que `criar` tem hoje entre o
    commit e os efeitos pós-commit (`:755`), e o cron de render redesenha a página como ela ESTIVER (o
    render não é gate: seção 10). Teste 7e cobre a corrida. Sem efeitos pendentes (o caso comum), reaproveitar é resposta sem escrita
    e sem gate — nada é criado nem alterado. Post ligado que já não é DRAFT ou tem `laterPostId` (`:568`)
    é devolvido como está, antes de tudo, sem medir.
- **Persistência**: depois da decisão, `fieldValues.veredito` na arte da página (auditoria), fora da trava.
  Com `simular: true` (`agendar-itens.ts:87`, "sem escrever nada") o gate MEDE e devolve a decisão
  (o item reprovado aparece na simulação como `falhou` + `REVISAO_HUMANA_NECESSARIA`), mas NÃO grava
  `fieldValues.veredito` nem nada — a simulação continua só leitura (teste 11).
- **Nenhum DRAFT é criado** quando o veredito não é APTO: o item volta em `itens[]` com
  `situacao: 'falhou'` e `codigo: 'REVISAO_HUMANA_NECESSARIA'` (o formato real: `ItemAgendadoDoLote`,
  `agendar-itens.ts:107-130`, via `falhou(itemId, { codigo, motivo }, extra)`, `:275`; não existe uma
  coleção `falhas[]`), com refs (`generationId`, `pageId`, `editUrl`), `achados` e `motivos` (dos
  relatórios da medida) — sem status novo (o mesmo mecanismo de `PECA_FALHOU`).

O `piloto-portao.test.ts:188-215` (`hojeViola`) já descreve esse contrato alvo: "não criar rascunho e
devolver REVISAO_HUMANA_NECESSARIA com generationId, pageId, editUrl e achados". Vira `it()` no CP5.

Fora do perfil draft-only, `decidirAgendamento` não muda em nada (seção 8).

## 8. O fluxo humano

Nada muda: `revisar-arte` continua só leitura e warn-only; a bancada, o editor e `colocar-na-agenda`
criam DRAFT sem gate; `ajustar-arte` humano grava (com a recusa `AJUSTE_PIOROU_ARTE` do CP4, que é
qualidade, não gate de autonomia — o humano recebe o resultado parcial e decide). O gate só roda com
`apenasRascunho`. Para o humano **não bloquear por acidente**: o gate nunca lê um "modo" gravado em
banco; lê o perfil da chamada. Um humano que use o mesmo `clientId` do ChatGPT cai no perfil restrito
(risco já documentado em `dot-lagosta-operacao.md:268-271`) — é o comportamento desejado pelo owner
(todo o `clientId` é restrito), e o relatório deve dizê-lo.

## 9. O Dot

O manual (`operacao-dot.ts`) já manda revisar antes de agendar e já define `REVISAO_HUMANA_NECESSARIA`
como código que o agente relata. Com o CP5, o código passa a devolvê-lo no `agendar-leva`
(`itens[]` com `situacao: 'falhou'` e `codigo`) e no `ajustar-arte` draft-only (CP4: `AJUSTE_PIOROU_ARTE` + veredito da versão
que ficou). O manual ganha uma linha: "a tool pode devolver REVISAO_HUMANA_NECESSARIA com achados: não
insista, relate" — sem mudar o `validar-registro-mcp` (o manual é validado só para nomes de tools
hifenizados; `REVISAO_HUMANA_NECESSARIA` é maiúsculo com sublinhado, fora da regex).

## 10. Última versão boa — o que o CP5 garante e o que NÃO garante

**Garantia delimitada ao fluxo autônomo**: "DRAFT existente + tentativa ruim DO AGENTE → a última versão
boa permanece". No perfil draft-only, a única escrita de página que o agente alcança é `ajustar-arte`
(seção 2). O contrato alvo do `piloto-ciclo.test.ts:273` tem TRÊS condições — o ajuste que piora, o
que deixa bloqueio aberto, e o que não tem veredito válido para a versão nova — e cada uma tem dono:
o **CP4** prova a primeira (recusa por piora ANTES de gravar; sem gravação, `invalidateScheduledRenders`
não roda e o DRAFT não é reaberto); o **CP5d** prova as outras duas (no perfil draft-only, o ajuste
aceito pela não-piora ainda passa por `vereditoDaMedida` da versão que ficou: bloqueio crítico aberto ou
veredito não APTO → recusa antes de gravar, com `REVISAO_HUMANA_NECESSARIA`). A recomposição que recusa
já deixa a arte antiga (`recompor.ts:1137-1167`).

**O que fica fora (e é dito ao owner)**: o cron de render redesenha a página CORRENTE do post sem
consultar veredito (`render-post-art.ts:133`); o editor humano muda `Page.layers` e invalida os renders
(`templates/[id]/pages/[pageId]/route.ts:303`); a recomposição por edição de texto substitui camadas
(`recompor.ts:570`, `:741`). Nada disso é o agente; é o fluxo humano, warn-only por decisão. O CP5 **não**
reserva a mídia boa de um DRAFT contra escritas humanas posteriores, nem cria histórico de versões
(`reverter-arte` volta ao `layersSnapshot` de nascimento, sobrescrito pela recomposição; as Generations
de ajuste não guardam camadas). Se o owner quiser "última versão boa" também contra o humano, é outro
checkpoint com decisão própria: uma reserva da mídia do DRAFT (`PostRenderProof` já guarda `layersSnapshot`
por mídia, append-only) e um gate antes da substituição pelo render/recomposição — fora do CP5.

## 11. Fail-closed — o que COMPROVA medida, por regra crítica

`resultado = 'APTO'` só quando TODAS as regras críticas comprovam medida (seção 12, coluna
"comprova") e nenhum ACHADO CRÍTICO existe. **Achado crítico é um predicado executável**: achado de regra
crítica com `certeza: 'medida'`, de QUALQUER severidade (`problema`, `aviso` ou `sugestao` — `colisao`,
`fora-da-area-segura`, `logo-sobre-texto`, `texto-sobre-assunto` e `texto-cortado` saem como `aviso`
em `regras.ts:620-760`, e reprovam do mesmo jeito); achado com `certeza: 'estimada'` em regra crítica
não aprova nem reprova — conta como "não comprovado" (→ humano); achado com `certeza: 'visao'` não
entra. Qualquer regra crítica sem comprovação → `REVISAO_HUMANA_NECESSARIA` com o motivo. Regras do
veredito, lidas da MEDIDA (não só do relatório):

- cobertura `nao-avaliada` ou `parcial` em regra crítica → não comprovada (o motivo da cobertura é o
  motivo do veredito);
- `texto-sobre-assunto`: comprova só com `medida.assunto?.origem === 'catalogo'` (a origem vem da
  MEDIDA, porque o relatório só a traz quando há sobreposição — `regras.ts:1116`); sem assunto ou só
  ESTIMADO → não comprovada — a peça sem catálogo vai ao humano, haja ou não achado;
- `logo-sem-leitura`: comprova só com toda logo solta em estado `medida` (CP3); `indisponivel`,
  `fora-do-contrato`, `sem-pixels` → não comprovada; peça SEM logo nenhuma é comprovada "sem logo"
  (o relatório diz `avaliada` com zero logos) — e a ausência de logo numa peça de marca é um achado
  humano, não mecânico: dito no retorno como aviso, nunca aprovado em silêncio;
- `texto-sem-leitura`, `tratamento-piorou-leitura`: comprovam só com `medida.contraste !== null` E
  `medida.pioras !== null` (a régua renderizou — é ESSA a prova de render do gate: sem visão e sem
  prévia o revisor não renderiza a peça inteira, mas a régua renderiza duas vezes em
  `medirContrasteDaPeca`; régua que falha → `contraste = null` → não comprovada);
- `fonte-nao-carregada`: no ambiente de produção, fonte que falta é achado `problema` → não APTO (no
  teste é artefato do ambiente, e o harness o exclui — o gate de produção não exclui);
- `copy completa`: `lacunas` vazias no JSON **não provam** que o contrato corresponde às camadas — o
  código grava camadas novas e MANTÉM o contrato antigo quando a revisão da copy é recusada
  (`copy-autoral/persistir.ts:116-121`, `templates/[id]/pages/[pageId]/route.ts:293-303`:
  `historico-cheio`/`copy-invalida` → as camadas vão, `copyAutoral` fica). O predicado executável do
  gate é a RECONCILIAÇÃO pura, sem escrita: `revisaoDaPaginaComCamadas(page.copyAutoral, page.layers,
  { autor: 'sistema', motivo: 'gate', superficie: 'gate' })` (`copy-autoral/revisar-pagina.ts:83`, sem
  banco) sobre a MESMA leitura que alimentou a medida; comprova só com `estado === 'sem-mudanca'` E
  `lacunas` vazias (o contrato lido das camadas é o contrato gravado, íntegro). `sem-contrato`,
  `ilegivel`, `copy-invalida`, `historico-cheio` e `registrada` (as camadas dizem outra copy: contrato
  DEFASADO) → não comprovada → humano, com o estado como motivo. A `copyVersion` da identidade (seção 6)
  garante que o contrato comparado é o que vai ser agendado;
- piso de interface do story (188/224): não é regra do revisor (lacuna da seção 12); até virar regra, o
  gate o confere diretamente sobre as caixas (`foraDaInterface` do oráculo vira função de produção) —
  sem isso a safe area não está comprovada.

A visão (`regra: 'visao'`) **não entra** no veredito (nem aprova nem reprova).

## 12. Regras críticas (mapa para o que existe)

| Regra do owner | Regra/medida existente | Comprova (da MEDIDA) e observação |
|---|---|---|
| fonte carregada | `fonte-nao-carregada` (`regras.ts`) | `fontesQueFaltam` e `familiasNaoCarregadas` divergem (frente CP4-E); o gate usa a do revisor |
| texto não cortado | `texto-cortado` (linhas e largura) | rich text é `estimada`/`parcial` → humano |
| colisão | `colisao` | tolerância por corpo + `encaixe` |
| safe area | `fora-da-area-segura` (`CANVAS_MARGIN` 120/70/100/70) | comprova: cobertura `avaliada` + `medida.motivoSemMedida` ausente. O piso de interface do story (188/224) existe só no compositor (`assinatura.ts:140`) e no oráculo do CP0; **lacuna**: o revisor não o mede — o gate o confere com `foraDaInterface` (função de produção a criar no CP5c2) até virar regra |
| texto legível | `texto-sem-leitura` | p98/p02 contra o alvo 3:1 |
| tratamento não piorou | `tratamento-piorou-leitura` (CP1/CP2A) | |
| região protegida | `texto-sobre-assunto` (catálogo hard 0,25; estimado soft 0,40) | **comprova só com catálogo**; sem assunto ou estimado → humano (seção 11) |
| logo legível | `logo-sem-leitura` (CP3) | `fora-do-contrato`/`indisponivel` → humano |
| logo sem colisão | `logo-sobre-texto` | |
| ajuste não piorou | CP4 (`AJUSTE_PIOROU_ARTE`, recusa antes da escrita) | não é regra do relatório; é garantia do executor |
| copy completa | `Page.copyAutoral` reconciliado com as camadas (`revisaoDaPaginaComCamadas`, `copy-autoral/revisar-pagina.ts:83`) | **lacuna**: não é regra do revisor; comprova só com `estado === 'sem-mudanca'` + `lacunas` vazias (seção 11); contrato defasado (`registrada`) ou recusado → humano |

Regra não medida: nunca "aprovado" (seção 11).

## 13. Retorno de `REVISAO_HUMANA_NECESSARIA`

> ⚠️ Onde diz `veredito` no retorno, leia o nome a fixar no CP5b (nota do topo).

Em `agendar-leva`: o item em `itens[]` com `{ itemId, situacao: 'falhou', codigo:
'REVISAO_HUMANA_NECESSARIA', motivo, generationId, pageId, editUrl, veredito: { pageVersion,
copyVersion, motivos, achados, cobertura } }` (o formato de `ItemAgendadoDoLote`, `agendar-itens.ts:107`;
a tool `agendar-leva` em `mcp/catalogo/compositor.ts:750` repassa `itens` como estão). Em `ajustar-arte`
draft-only: o retorno do CP4 (recusa `AJUSTE_PIOROU_ARTE`) mais `veredito` da versão que permaneceu.
Campos novos no RETORNO não mudam o snapshot do `validar-registro-mcp`.

## 14. Como impedir o bypass pela fila/lote

- A fila (`COMPOR`) não cria DRAFT; `compor-leva` só enfileira. O único funil no perfil draft-only é
  `agendar-leva` (seção 2) — a medida roda ANTES da transação e a decisão sob trava só compara a
  identidade (`pageVersion` + `copyVersion`): uma edição concorrente entre a medida e a escrita é
  recusada (nunca re-medida sob trava).
- `recriarRascunhoApagado` já é recusado no perfil (`CONFIRMACAO_HUMANA_NECESSARIA`).
- O reaproveitamento com `efeitosPendentes` é caminho de ESCRITA (refila a página, atualiza o item):
  no perfil draft-only passa pelo mesmo gate (medida fora da trava + identidade) antes de
  `executarEfeitos`; reprovado, os efeitos ficam pendentes e nada é escrito (seção 7).
- `colocar-na-agenda`, `postar-agora`, `aprovar-rascunhos`, `voltar-para-rascunho` ficam fora da
  allowlist (conferido: `perfil.ts:29-51`); o teste `perfil-draft-only.test.ts` fixa a lista — o CP5
  acrescenta a asserção "toda tool da allowlist que cria DRAFT passa pelo gate" (hoje é uma só).
- O cron de render não é bypass: só redesenha depois de uma escrita na página, e no autônomo a única
  escrita é o `ajustar-arte`, fechado pelo CP4.

## 15. Testes (a escrever no CP5)

1. `vereditoDaMedida(medida, relatorio, identidade)` puro, com a MEDIDA inteira na entrada
   (`MedidaDaPeca`: `assunto.origem`, `contraste`, `pioras`, `leituraDaLogo`, `fontesAusentes`,
   `motivoSemMedida`): APTO só com todas as críticas comprovadas (seção 11) e sem achado crítico
   medido; cada `nao-avaliada`/`parcial` → humano com motivo; assunto estimado → humano mesmo sem
   achado; régua `null` → humano; visão não decide; `rulesVersion`, `pageVersion` e `copyVersion`
   gravados.
1b. `copy completa` pelo predicado da seção 11: contrato que casa com as camadas (`sem-mudanca`, sem
   lacunas) comprova; contrato defasado (`registrada`), `copy-invalida`, `historico-cheio`,
   `sem-contrato` e `ilegivel` → humano com o estado como motivo.
2. `agendar-leva` draft-only com peça reprovada → `itens[]` com `situacao: 'falhou'` e
   `codigo: 'REVISAO_HUMANA_NECESSARIA'`, refs e achados; nenhum `socialPost.create` (o harness de `piloto-portao.test.ts` já tem o espião).
3. O mesmo item fora do perfil → DRAFT criado, sem gate (warn-only).
4. O gate SEMPRE mede: um `fieldValues.veredito` APTO gravado antes nunca dispensa a medida; a
   identidade (`pageVersion` + `copyVersion`) só serve para a comparação sob trava.
5. DRAFT existente + peça reprovada → o DRAFT permanece como está, item devolvido com o veredito.
6. Corrida: página editada entre a medida e a trava → recusa `REVISAO_HUMANA_NECESSARIA` ("a página
   mudou durante o agendamento"), com DOIS casos separados — só as camadas mudam (`pageVersion`
   diverge, `copyVersion` igual) e só o `copyAutoral` muda (`copyVersion` diverge, `pageVersion`
   igual); nunca medir sob trava, nunca DRAFT com veredito de outra identidade.
7. `ajustar-arte` draft-only: piora (CP4), bloqueio crítico aberto e veredito não APTO da versão nova
   (CP5d) → página intacta, render não reaberto, `REVISAO_HUMANA_NECESSARIA` (o `hojeViola` do
   `piloto-ciclo.test.ts:275` vira `it()` só no CP5d, com as três condições).
7b. Achado crítico de severidade `aviso` com `certeza: 'medida'` reprova; achado `estimada` deixa a
   regra "não comprovada" (humano); peça com assunto só estimado e sem sobreposição vai ao humano.
7c. Adoção de DRAFT existente com peça reprovada: nenhum vínculo, nenhum efeito, `draftExistente` na
   resposta; com peça APTA, adoção como hoje.
7d. Item já ligado com `efeitosPendentes` e peça reprovada (draft-only): `executarEfeitos` não roda
   (nenhuma refila, item do plano intocado, `efeitosDoAgendamentoEm` segue `null`), resposta
   `REVISAO_HUMANA_NECESSARIA` com `postId`; com peça APTA, os efeitos rodam como hoje; fora do perfil,
   como hoje.
7e. Corrida dos efeitos pendentes: peça APTA na medida, página (camadas OU `copyAutoral`) editada
   entre a aprovação e `executarEfeitos` → a rechecagem recusa, nenhum efeito roda, a linha segue
   pendente, `REVISAO_HUMANA_NECESSARIA` ("a página mudou durante o agendamento").
8. Regra crítica com render falhando → humano (fail-closed), nunca APTO.
9. `piloto-portao.test.ts:188-215` vira `it()`.
10. `validar-registro-mcp` inalterado (retorno novo não entra no snapshot); manual do Dot atualizado.
11. `simular: true` no draft-only: mede, devolve o item reprovado como `falhou` +
   `REVISAO_HUMANA_NECESSARIA`, e NENHUMA escrita (nem `fieldValues.veredito`) — o espião de escrita
   do harness de simulação fica em zero.

## 16. Arquivos futuros

- novo: `src/lib/creatives/revisao/veredito.ts` (puro) + `__tests__/veredito.test.ts`;
- `src/lib/lotes/agendamento.ts` (decisão pura ganha `veredito` + identidade relida como entrada) e
  `src/lib/lotes/agendar-itens.ts` (mede FORA da transação, só com `apenasRascunho`; compara sob trava);
- `src/lib/creatives/revisao/revisar-arte.ts`: as funções `contextoDaMedicao` e `medirCamadasDaPeca`
  (extraídas no CP4 — pré-requisito) são as que o gate usa para medir FORA da transação;
- `src/lib/mcp/catalogo/compositor.ts` (retorno de `agendar-leva`), `arte-ia.ts` (`ajustar-arte`),
  `operacao-dot.ts` (manual), `ver-geracao-retorno.ts` e `auditar-operacao` (expor `veredito`);
- docs: `docs/regras/dot-lagosta-operacao.md`, `docs/regras/revisor-da-arte.md`, `lotes.md`.

## 17. Checkpoints de implementação (pequenos, cada um com PR)

> ⚠️ Superado em dois pontos (nota do topo): `piloto-portao` só vira `it()` no CP5c2 (gate integrado), não no CP5a/CP5c1; e a chave persistida não se chama `veredito`. A sequência CP5a–e do plano-mestre (seção 4) é a vigente.

- **CP5a — veredito puro**: `veredito.ts` + testes; nada de produção o chama. (sem risco)
- **CP5b — medir sem banco**: já entregue pelo CP4 (`contextoDaMedicao` + `medirCamadasDaPeca` em
  `revisar-arte.ts`, com `revisarArte` igual); o CP5 só acrescenta `copyVersion` e `foraDaInterface`.
- **CP5c1 — contrato e retorno**: `decidirAgendamento` com `veredito` de entrada (puro) e o retorno
  `itens[]` com `situacao: 'falhou'` + `codigo: 'REVISAO_HUMANA_NECESSARIA'` com refs/achados/motivos, sem medir ainda (o veredito
  chega por injeção nos testes). `piloto-portao` vira `it()` na decisão pura.
- **CP5c2 — gate transacional**: a medida FORA da transação, a comparação de `pageVersion` E
  `copyVersion` SOB trava, as três respostas (criar/adotar/reaproveitar — este com o gate antes dos
  `efeitosPendentes`), a persistência de auditoria; **prova de concorrência** (camadas editadas OU
  `copyAutoral` revisado entre a medida e a trava, cada parte da identidade em teste próprio) e **prova
  de duração** (a transação não ultrapassa o timeout com a medida fora dela). Pré-requisito: CP3 na `main`.
- **CP5d — `ajustar-arte` draft-only**: pré-requisito CP4 na `main`; recusa por piora não reabre render
  e devolve o veredito da versão que ficou; `piloto-ciclo` P11 vira `it()`.
- **CP5e — exposição e manual**: `ver-geracao`, `auditar-operacao`, manual do Dot, docs.

## 18. Riscos

- **Perfil normal por engano** (cliente OAuth novo): o gate não protege; mitigação continua sendo o
  manual (`PERFIL_DE_SEGURANCA_INATIVO`). Dizer ao owner; decidir se a allowlist passa a valer para
  TODO principal de usuário via ChatGPT.
- **Falsos "não aptos"** por cobertura parcial comum (rich text, fonte incerta, assunto estimado):
  no começo o Dot vai devolver muitos itens ao humano. Medir a taxa nas primeiras levas antes de
  apertar ou afrouxar — nunca afrouxar o fail-closed por conveniência.
- **Custo**: ~2–4 s por peça sem visão no `agendar-leva`; aceitável para levas de até 60.
- **Veredito na Generation errada**: `arteDaPagina` pode escolher uma Generation `post-schedule`
  (`ensure-post-generation.ts:164-187`); como o veredito é só auditoria, o risco é de leitura histórica,
  não de decisão — gravar e ler pela MESMA regra de `arteDaPagina`, com teste.
- **O cron de render e o agendamento humano** não passam pelo gate por desenho (seção 10); dito ao owner.
- **Superfícies fora da porta MCP**: `/api/external/posts` (PATCH altera posts existentes), crons e UI
  operam com perfil nenhum; o gate não os alcança por desenho (fluxo humano/serviço). Identidade OAuth
  estável (um `clientId` fixo para o Dot) é condição operacional, não de código.
- **Piso de interface (188/224) e copy completa** não são regras do revisor hoje (lacunas da seção 12).
- **Concorrência e duração**: a medida é cara e roda fora da trava; a 2ª passada (sob trava) só compara
  a identidade (`pageVersion` E `copyVersion`) — nunca confiar no veredito medido antes da trava sem
  comparar; a transação (timeout 20 s) não pode conter a medida; os efeitos pós-commit recheca(m) a
  identidade antes de escrever (seção 7).

## 19. Rollback

Cada checkpoint é um PR revertível; nenhum cria coluna, status ou migration. `fieldValues.veredito` é
uma chave Json que pode ficar órfã sem efeito (ninguém a lê fora do gate). Reverter o CP5c devolve o
`agendar-leva` ao comportamento de hoje (cria o DRAFT sem gate). Não há dado a migrar de volta.
