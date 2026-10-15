# CP5 — veredito persistido e gate duro só no fluxo autônomo (auditoria, 15/10/2026)

**Estado: SOMENTE AUDITADO. Nada implementado.** Este documento é o plano para o CP5, escrito a partir
de uma auditoria somente leitura da `main` (`53eda0c9`, o merge do CP2B), com seis frentes em paralelo
(arte rápida, caminhos de DRAFT, lotes e fila, perfil DRAFT_ONLY do MCP, Generation/Page/versão,
recomposição e última versão boa). Os números de linha são desse commit.

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

O que o CP3 e o CP4 entregam para o CP5: regras mecânicas com `certeza: 'medida'` e cobertura dita por
regra (CP0–CP3); e, no CP4, a recusa `AJUSTE_PIOROU_ARTE` ANTES da escrita (o ajuste que piora nunca
substitui a página). O CP5 não mede nada novo: **consome o relatório que já existe e decide**.

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

Conclusão: **no perfil draft-only há UM caminho de criação de DRAFT: `agendar-leva` → `agendarItensDoLote`
→ `criarPostDoAgendamento`.** É o funil onde o gate mora. Os outros caminhos são humanos (warn-only) ou
inalcançáveis pelo perfil.

Dois caminhos **mudam** um DRAFT do Dot depois de criado, sem criar outro: `ajustar-arte` (draft-only:
`apenasRascunho`, com `FOR UPDATE` nos posts e `POST_APROVADO_INTOCAVEL`; grava a página e reabre o
render dos rascunhos — hoje mesmo quando piora) e o cron de render (redesenha a página como está, sem
revisão). O CP4 fecha o primeiro (recusa antes da escrita); o segundo só acontece depois de alguma
escrita na página — que, no fluxo autônomo, é só o `ajustar-arte`.

## 3. Detecção de autonomia

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
chave só dele.

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

```ts
/** `Generation.fieldValues.veredito` — o veredito mecânico da arte da página, por versão. */
interface VereditoDaArte {
  versao: 'veredito-v1'
  /** `versaoDaPagina(page)` no momento da medida (hash v1:… do conteúdo; nunca `updatedAt`). */
  pageVersion: string
  /** `VERSAO_DAS_REGRAS` do revisor ('revisao-v1'); mudou → stale. */
  rulesVersion: string
  resultado: 'APTO' | 'REVISAO_HUMANA_NECESSARIA'
  /** Só as regras CRÍTICAS (seção 9): estado da cobertura de cada uma, do relatório. */
  cobertura: Record<RegraCritica, 'avaliada' | 'parcial' | 'nao-avaliada'>
  /** Os achados que decidiram (regra, camadas, severidade, certeza, evidência resumida). */
  achados: Array<{ regra: string; camadas: string[]; severidade: string; certeza: string; mensagem: string }>
  /** Motivos legíveis: por que não é APTO (regra não medida, achado crítico, versão divergente…). */
  motivos: string[]
  medidoEm: string
  /** Quem mediu: 'agendar-leva' | 'ajustar-arte' | 'revisar-arte'. */
  origem: string
}
```

O veredito é derivado por uma função PURA `vereditoDoRelatorio(relatorio, { pageVersion })`
(em `src/lib/creatives/revisao/veredito.ts`), testável sem banco: entra `RelatorioDaRevisao`, sai
`VereditoDaArte`. Não duplica o relatório: guarda só cobertura das críticas e os achados decisivos.

## 6. Invalidação

Por construção, sem limpeza: o consumidor compara `veredito.pageVersion === versaoDaPagina(página atual)`
e `veredito.rulesVersion === VERSAO_DAS_REGRAS`; qualquer divergência = sem veredito. Toda escrita em
`Page.layers` (editor, PATCH de camada, ajustar-arte, recompor, reverter) muda o hash
(`versao.ts:45-58`; auditoria da frente E: nenhum escritor de `layers` escapa). A recomposição regrava
`composicao` inteira mas não toca `veredito`, que fica stale pelo `pageVersion` — exatamente o padrão
de `versaoRenderizada` + `thumbnailEhAtual` (`lotes/agendamento.ts:501-513`).

Atenção: `versaoDaPagina` tem um segundo argumento (`quadro.audio`) usado em `versaoRenderizada`
(`persist.ts:370`) e não em `revisarArte` (`:531`). O veredito deve usar a MESMA chamada do revisor
(sem áudio), e o gate também — senão página com movimento e música nunca bate.

## 7. O gate (só autônomo)

Lugar: **`decidirEscrita` → `decidirAgendamento`** (`lotes/agendar-itens.ts:354`, `agendamento.ts:286`),
que já roda duas vezes (sem trava e sob trava) e já lê Generation, página, item do plano e posts. Com
`apenasRascunho === true`, antes de `criarPostDoAgendamento`:

1. obter o veredito válido para a página atual: `fieldValues.veredito` da arte da página com
   `pageVersion` e `rulesVersion` iguais; **se não houver, medir ali** (`revisarArte` com
   `visao: false, previa: false` — ~2–4 s sem visão; a visão NÃO é gate) e gravar o veredito (merge raso);
2. `resultado !== 'APTO'` → o item volta em `falhas` com código **`REVISAO_HUMANA_NECESSARIA`**, refs
   (`generationId`, `pageId`, `editUrl`), `achados` e `motivos`; **nenhum DRAFT é criado** (o `desfecho`
   do item fica `falha`, como `PECA_FALHOU` hoje — sem status novo);
3. com DRAFT já existente para a página (adoção, `agendar-itens.ts:569`): o gate não o apaga nem o
   reaponta — devolve o item como está, com o veredito (a última versão boa permanece).

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
(`falhas[].codigo`) e no `ajustar-arte` draft-only (CP4: `AJUSTE_PIOROU_ARTE` + veredito da versão
que ficou). O manual ganha uma linha: "a tool pode devolver REVISAO_HUMANA_NECESSARIA com achados: não
insista, relate" — sem mudar o `validar-registro-mcp` (o manual é validado só para nomes de tools
hifenizados; `REVISAO_HUMANA_NECESSARIA` é maiúsculo com sublinhado, fora da regex).

## 10. Última versão boa

- DRAFT existente: o CP4 recusa o ajuste que piora ANTES de gravar a página (nada muda: página,
  render, veredito); a recomposição que recusa já deixa a arte antiga e grava `recusaDaRecomposicao`
  (`recompor.ts:1137-1167`). O CP5 só soma: com `apenasRascunho`, um ajuste recusado por piora
  **não reabre o render** (`invalidateScheduledRenders` só roda depois de gravar; sem gravação, não roda).
- Não existe hoje "última versão boa" como conceito: `reverter-arte` volta ao `layersSnapshot` de
  nascimento (sobrescrito pela recomposição); as Generations de ajuste não guardam camadas. O CP5 **não**
  cria histórico de versões: a garantia é "não piorar o que está" (CP4) + "não criar DRAFT ruim" (gate).
  Um histórico por versão fica para depois, com decisão do owner.

## 11. Fail-closed

No autônomo, `resultado = 'APTO'` só quando, para TODAS as regras críticas, a cobertura é `avaliada` e
não há achado de severidade `problema`/`aviso` com `certeza: 'medida'` ou `'estimada'`. Qualquer regra
crítica `nao-avaliada` ou `parcial` → `REVISAO_HUMANA_NECESSARIA` com o motivo da cobertura
(ex.: "logo-sem-leitura: o arquivo da logo não carregou"). A visão (`regra: 'visao'`) **não entra** no
veredito (nem aprova nem reprova). Render que falha, régua que falha, fonte não carregada, foto
indisponível: tudo cai no "não medido" → humano.

## 12. Regras críticas (mapa para o que existe)

| Regra do owner | Regra/medida existente | Observação |
|---|---|---|
| fonte carregada | `fonte-nao-carregada` (`regras.ts`) | `fontesQueFaltam` e `familiasNaoCarregadas` divergem (frente CP4-E); o gate usa a do revisor |
| texto não cortado | `texto-cortado` (linhas e largura) | rich text é `estimada`/`parcial` → humano |
| colisão | `colisao` | tolerância por corpo + `encaixe` |
| safe area | `fora-da-area-segura` (`CANVAS_MARGIN` 120/70/100/70) | o piso de interface do story (188/224) existe só no compositor (`assinatura.ts:140`) e no oráculo do CP0; **lacuna**: o revisor não o mede — ou entra como regra, ou o gate o confere com `foraDaInterface` |
| texto legível | `texto-sem-leitura` | p98/p02 contra o alvo 3:1 |
| tratamento não piorou | `tratamento-piorou-leitura` (CP1/CP2A) | |
| região protegida | `texto-sobre-assunto` (catálogo hard 0,25; estimado soft 0,40) | sem catálogo é `estimada` → não decide sozinha |
| logo legível | `logo-sem-leitura` (CP3) | `fora-do-contrato`/`indisponivel` → humano |
| logo sem colisão | `logo-sobre-texto` | |
| ajuste não piorou | CP4 (`AJUSTE_PIOROU_ARTE`, recusa antes da escrita) | não é regra do relatório; é garantia do executor |
| copy completa | `Page.copyAutoral` (lacunas do contrato, `copy-autoral/revisar-pagina.ts`) | **lacuna**: não é regra do revisor; o gate lê `copyAutoral.lacunas` da página |

Regra não medida: nunca "aprovado" (seção 11).

## 13. Retorno de `REVISAO_HUMANA_NECESSARIA`

Em `agendar-leva`: item em `falhas` com `{ itemId, codigo: 'REVISAO_HUMANA_NECESSARIA', generationId,
pageId, editUrl, veredito: { pageVersion, motivos, achados, cobertura } }`. Em `ajustar-arte`
draft-only: o retorno do CP4 (recusa `AJUSTE_PIOROU_ARTE`) mais `veredito` da versão que permaneceu.
Campos novos no RETORNO não mudam o snapshot do `validar-registro-mcp`.

## 14. Como impedir o bypass pela fila/lote

- A fila (`COMPOR`) não cria DRAFT; `compor-leva` só enfileira. O único funil autônomo é `agendar-leva`
  (seção 2) — o gate mora dentro da transação com trava, na decisão sob trava (`decidirEscrita` 2ª
  passada), então uma edição concorrente entre a medida e a escrita é pega pelo `pageVersion`
  (re-medir ou recusar).
- `recriarRascunhoApagado` já é recusado no perfil (`CONFIRMACAO_HUMANA_NECESSARIA`).
- `colocar-na-agenda`, `postar-agora`, `aprovar-rascunhos`, `voltar-para-rascunho` ficam fora da
  allowlist (conferido: `perfil.ts:29-51`); o teste `perfil-draft-only.test.ts` fixa a lista — o CP5
  acrescenta a asserção "toda tool da allowlist que cria DRAFT passa pelo gate" (hoje é uma só).
- O cron de render não é bypass: só redesenha depois de uma escrita na página, e no autônomo a única
  escrita é o `ajustar-arte`, fechado pelo CP4.

## 15. Testes (a escrever no CP5)

1. `vereditoDoRelatorio` puro: APTO só com todas as críticas avaliadas e sem achado medido; cada
   `nao-avaliada`/`parcial` → humano com motivo; visão não decide; `rulesVersion` gravada.
2. `agendar-leva` draft-only com peça reprovada → `falhas[].codigo = REVISAO_HUMANA_NECESSARIA` com
   refs e achados; nenhum `socialPost.create` (o harness de `piloto-portao.test.ts` já tem o espião).
3. O mesmo item fora do perfil → DRAFT criado, sem gate (warn-only).
4. Veredito válido reaproveitado (sem re-medir) quando `pageVersion` bate; stale quando a página mudou
   (editor, recompor) ou `rulesVersion` mudou.
5. DRAFT existente + peça reprovada → o DRAFT permanece como está, item devolvido com o veredito.
6. Corrida: página editada entre a medida e a escrita → re-medida ou recusa, nunca DRAFT com veredito
   de outra versão.
7. `ajustar-arte` draft-only com piora (CP4) → página intacta, render não reaberto,
   `REVISAO_HUMANA_NECESSARIA` (o `hojeViola` do `piloto-ciclo.test.ts:275` vira `it()`).
8. Regra crítica com render falhando → humano (fail-closed), nunca APTO.
9. `piloto-portao.test.ts:188-215` vira `it()`.
10. `validar-registro-mcp` inalterado (retorno novo não entra no snapshot); manual do Dot atualizado.

## 16. Arquivos futuros

- novo: `src/lib/creatives/revisao/veredito.ts` (puro) + `__tests__/veredito.test.ts`;
- `src/lib/lotes/agendamento.ts` (decisão pura ganha `veredito` como entrada) e
  `src/lib/lotes/agendar-itens.ts` (obtém/mede o veredito sob trava, só com `apenasRascunho`);
- `src/lib/creatives/revisao/revisar-arte.ts`: expor uma função que mede sem banco de página
  (`revisarCamadas`) para o gate e o CP4 reutilizarem — hoje tudo mora em `revisarArte`;
- `src/lib/mcp/catalogo/compositor.ts` (retorno de `agendar-leva`), `arte-ia.ts` (`ajustar-arte`),
  `operacao-dot.ts` (manual), `ver-geracao-retorno.ts` e `auditar-operacao` (expor `veredito`);
- docs: `docs/regras/dot-lagosta-operacao.md`, `docs/regras/revisor-da-arte.md`, `lotes.md`.

## 17. Checkpoints de implementação (pequenos, cada um com PR)

- **CP5a — veredito puro**: `veredito.ts` + testes; nada de produção o chama. (sem risco)
- **CP5b — medir sem banco**: extrair de `revisarArte` a função que mede `Layer[]` em memória
  (fontes, geometria, régua, logo, assunto, referências), mantendo `revisarArte` igual. Testes de
  equivalência (o mesmo relatório pelos dois caminhos).
- **CP5c — gate no `agendar-leva` (draft-only)**: veredito obtido/medido sob trava; `falhas` com
  `REVISAO_HUMANA_NECESSARIA`; persistência em `fieldValues.veredito`; `piloto-portao` vira `it()`.
- **CP5d — `ajustar-arte` draft-only**: com o CP4, recusa por piora não reabre render e devolve o
  veredito da versão que ficou; `piloto-ciclo` P11 vira `it()`.
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
  (`ensure-post-generation.ts:164-187`); o veredito deve ser gravado e lido na MESMA regra de
  `arteDaPagina`, com teste.
- **Piso de interface (188/224) e copy completa** não são regras do revisor hoje (lacunas da seção 12).
- **Concorrência**: a medida é cara e roda fora da trava na 1ª passada; a 2ª passada (sob trava) tem
  de re-conferir `pageVersion` — nunca confiar no veredito medido antes da trava sem comparar.

## 19. Rollback

Cada checkpoint é um PR revertível; nenhum cria coluna, status ou migration. `fieldValues.veredito` é
uma chave Json que pode ficar órfã sem efeito (ninguém a lê fora do gate). Reverter o CP5c devolve o
`agendar-leva` ao comportamento de hoje (cria o DRAFT sem gate). Não há dado a migrar de volta.
