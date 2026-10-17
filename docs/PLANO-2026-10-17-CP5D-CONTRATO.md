# CP5d — contrato técnico do GATE em `ajustar-arte` (perfil draft-only) — proposta para revisão, 17/10/2026

**Estado: PROPOSTA (rodada 0 — ainda sem revisão do Codex).** Nada aqui está implementado; este PR é documental. Base:
`main` `cc6b01f0` (CP5c mergeado: PR #242; contrato do CP5c em `docs/PLANO-2026-10-16-CP5C-CONTRATO.md`). Fontes:
plano-mestre `docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` § 4.6, contratos do CP5b (§ 12) e do CP5c
(§ 2 "não entra"), o executor do CP4 (`revisao/ajustar-sem-piorar.ts`, `nao-piora.ts`) e `ajustarArte`
(`creatives/arte-rapida.ts`) como estão na main (citados por função). As decisões da seção 8 são do OWNER; a
implementação, quando autorizada pelo ciclo, usa as recomendações como PROPOSTA nomeada (constante ou `if` trocável
numa linha), nenhuma rotulada aprovada.

## 0. O que o CP5d entrega, em uma frase

No perfil efetivo **draft-only**, `ajustar-arte` só GRAVA a página (e só reabre o render dos rascunhos) depois de a
versão FINAL que seria gravada — a candidata que o executor do CP4 aceitou, com os textos/foto da chamada — ser
MEDIDA sob as travas da transação que escreve e aceita pelo gate (`decidirEMontarRegistro`, `gate.resultado ===
'APTO'`); o veredito é registrado na Generation que o render desta chamada vai fechar; todo outro caso volta
`REVISAO_HUMANA_NECESSARIA` com `ajusteGravado: false`, página intacta, render NÃO reaberto, última versão preservada.
"Não piorou" (CP4) continua necessário e deixa de ser suficiente para o agente escrever. O fluxo humano continua
WARN-ONLY + CP4, byte a byte.

## 1. O que a main tem hoje (o que o contrato muda e o que preserva)

| Ponto | Hoje (`ajustarArte`) | CP5d (só `apenasRascunho`) |
|---|---|---|
| Pré-checagens | formato dos `slotValues`, versão esperada, `CONTEUDO_NAO_PODE_SER_REMOVIDO` (draft-only), foto, bake, reflow, `PAGINA_COM_VIDEO`, autofix da base | iguais |
| Executor do CP4 | `aplicarAjustesSemPiorar` mede N candidatas FORA de transação; todos recusados e nada mais a gravar → `AJUSTE_PIOROU_ARTE`/… (422, nada gravado) | igual; a recusa do CP4 continua a mesma e vem ANTES do gate (§ 3.1) |
| Transação de escrita (20 s) | draft-only: posts da página `ORDER BY "id" FOR UPDATE` e `POST_APROVADO_INTOCAVEL`; CAS da página (`updatedAt`/`isTemplate`, ou releitura por conteúdo); `travarRecomposicaoDaArte` | igual + (§ 4): travas do que a medição lê; Generation PROCESSING criada na transação; **a medição do gate e a decisão acontecem aqui**, sobre a candidata final; `gravarGateDaArte(tx, registro)`; não APTO → `RecusaSobTrava` → rollback inteiro (nada gravado) |
| Depois do commit | `renderPageAndRegister` (Generation nova, `versaoEsperada`), `invalidateScheduledRenders` (`apenasRascunho` → só DRAFT), aprendizado | `renderPageAndRegister({ generationId })` FECHA a Generation criada na transação; o resto igual. Nenhum efeito roda quando o gate recusou (não há commit) |
| Retorno (`AjustarArteResult`) | `ajustada`, `versao`, `ajustesAplicados/Recusados`, … | + `revisao` (§ 6) no draft-only; a recusa do gate é `CreativeError('REVISAO_HUMANA_NECESSARIA', …, 422, { ajusteGravado: false, revisao, achados, motivos })` |
| Testes | `piloto-ciclo.test.ts` P11 "o ajuste que piora é recusado ANTES de substituir a versão do rascunho" (`hojeViola`) | vira `it()` neste PR (regra do CP0); o `hojeViola` "em até 2 ciclos … apta ou REVISAO_HUMANA_NECESSARIA" (fluxo HUMANO) fica para o CP5e (§ 2) |

**Nada muda para o perfil normal** (humano): `apenasRascunho === false` → nenhuma medição do gate, nenhum registro,
nenhuma trava nova, nenhuma recusa nova. Regra do H4 (plano-mestre § 4.5).

## 2. Escopo e não-escopo

**Entra**: (a) medição + decisão do gate SOB TRAVA na transação de escrita de `ajustarArte`, só no draft-only, sobre a
candidata FINAL (ajustes aceitos + textos/foto/nome da chamada); (b) Generation PROCESSING criada na mesma transação
(é dela o `generationId` do registro) e fechada pelo render (`generationId` já existe em `renderPageAndRegister`);
(c) gravação do registro na mesma transação (APTO; o reprovado NÃO é gravado — § 8.3); (d) `revisao` no retorno e na
recusa; (e) travas novas e a ordem comum (§ 4); (f) `arte-rapida.ts` entra nas listas de produtores (lint do CP5b e
inventário H12); (g) P11 de `piloto-ciclo.test.ts` vira `it()`; (h) docs (`revisor-da-arte.md` § CP5d, `mcp.md`,
manual do Dot: "ajustar-arte no draft-only só grava versão APTA").

**Não entra**: o `hojeViola` humano "em até 2 ciclos" (exige o gate como INFORMAÇÃO no `revisar-arte` humano —
CP5e, § 8.6); provas ponta a ponta e o piloto (CP5e); bloco `gate` em `auditar-operacao` (CP5e); mudar o executor do
CP4 além de expor a medida crua da candidata final (§ 3.2); mexer em `gate.ts`, `gate-registro.ts`,
`gate-persistido.ts`, `agendar-itens.ts`; migration; qualquer mudança no fluxo humano; `melhorar-arte`,
`criar-arte-de-modelo`, `compor-arte` (fora da allowlist — continuam fora).

## 3. A medição e a decisão

### 3.1 Ordem das recusas (nada do CP4 muda de lugar)

1. Pré-checagens de hoje (formato, versão, copy removida, vídeo) — iguais, antes de medir qualquer coisa.
2. Executor do CP4 (fora de transação, como hoje): todos recusados e nada mais a gravar → a recusa do CP4 de hoje
   (`AJUSTE_PIOROU_ARTE` > `AJUSTE_NAO_MELHOROU_O_ACHADO` > `AJUSTE_NAO_MEDIDO` > `CONTEUDO_NAO_PODE_SER_OCULTADO` >
   `AJUSTE_SEM_EFEITO`), com `ajusteGravado: false`. **No draft-only, `details.revisao` acompanha** (§ 6): a peça como
   está não foi medida pelo gate nesta chamada (`tipo: 'nao-medida'`, motivo "nenhuma versão nova para medir") — é
   isso que faz P11 ("recusado ANTES de substituir") ter `REVISAO_HUMANA_NECESSARIA` na resposta sem inventar um
   veredito: a recusa do CP4 já preserva a última versão, e o chat lê o código do CP4 + a escalada (§ 6).
3. Há o que gravar (candidata final = `revisao.camadas` ou `fixDaBase.layers`, com `dadosDaPagina`) → transação (§ 4).

### 3.2 A medida crua da candidata final

O executor mede cada candidata por `medidaDe(camadas, ctx)` (→ `MedidaComparavel`: relatório + contraste, não a
`MedidaDaPeca`). O gate precisa da `MedidaDaPeca` da candidata FINAL, medida pelo cliente da transação (as linhas que
ela lê estão travadas). Por isso a medição do gate é UMA medida nova, DENTRO da transação, com `contextoDaMedicao({
cliente: tx, sinal, prazoPorDownloadMs, composicaoReaproveitavel: false, generationDaPeca: null })` +
`medirCamadasDaPeca(candidata, ctx, { corrigir: false })` — a mesma medição do CP4 e do CP5c. `composicaoReaproveitavel:
false` e `generationDaPeca: null` de propósito: a candidata é uma versão NOVA da página; nenhuma Generation tem a arte
dela, então o assunto é estimado de novo pela foto e a variante da logo vem da página; as referências de corpo vêm da
assinatura/modelo apontadas pela Generation do compositor da página (lida pela transação, `FOR SHARE`, como no CP5c
— § 4). Custo: +1 medida (~0,4–0,6 s medido no CP5c) dentro dos 20 s; os N renders do CP4 continuam fora. **Não** se
reaproveita a última `medidaAtual` do executor: ela foi medida fora da transação, pelo `db`, antes das travas.

### 3.3 A decisão

```ts
// arte-rapida.ts (novo, dentro da transação): medirEDecidirAjuste(tx, …)
//  1. recusaComoImagem(candidata, page.audio) → 'nao-medida' (já recusado antes por PAGINA_COM_VIDEO; música idem)
//  2. contextoDaMedicao + medirCamadasDaPeca (§ 3.2), com Promise.race(PRAZO_DA_MEDICAO_MS = 8_000) sobre a cadeia inteira
//  3. decidirEMontarRegistro({ entrada: { medida, identidade: identidadeDaPagina(paginaFutura), politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA },
//       page: paginaFutura, vinculo: { projectId, generationId: generationNova.id, postType: TIPO_DO_POST_POR_FORMATO[formato] },
//       origem: 'ajustar-arte', principal, agora })
//  paginaFutura = { id, name: pageName, tags, width, height, background, layers: candidata, copyAutoral: contrato que vai ser gravado }
```

- `paginaFutura` é EXATAMENTE o que `dadosDaPagina` grava (camadas, nome, `copyAutoral` revisado): a identidade do
  registro (`pageVersion`, `copyVersion`) é a da versão que o commit cria — `ver-geracao` a rotula `coincidente`
  enquanto ninguém editar depois. A copy é reconciliada DENTRO de `decidirEMontarRegistro` sobre `paginaFutura`
  (`revisaoDaPaginaComCamadas(copyAutoral, candidata)`): com o contrato revisado pelo próprio ajuste
  (`revisaoDaCopy.copy`), reconcilia `sem-mudanca`; sem contrato → `copy-completa` não comprovada → não APTO (dito: no
  draft-only, página sem contrato de copy não é ajustável pelo agente — o compositor sempre grava o contrato).
- `vinculo.postType`: o da página pelo formato (`TIPO_DO_POST_POR_FORMATO[formatoDaPaginaGravada(page)]`); o ajuste
  não cria post, e `decidirEMontarRegistro` já recusa a divergência entre os dois classificadores (sem-vinculo).
- `vinculo.generationId`: a Generation PROCESSING criada NESTA transação (§ 4.3) — a arte que o render vai fechar. A
  política do assunto é a MESMA constante do CP5c (`POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`, decisão 8.1 do CP5c): um só
  gate, uma só política.
- `principal`: `{ tipo, id }` repassado pela tool (como no `agendar-leva`).

## 4. A transação do draft-only

**Ordem COMUM das travas** (a do CP5c, sem as do lote): `pg_advisory_xact_lock(agenda do projeto)` →
`pg_advisory_xact_lock(fontes do projeto)` → **posts da página `ORDER BY "id" FOR UPDATE`** (já existe) → `Page FOR
UPDATE` (nova: hoje a escrita é por CAS sem trava de linha; a trava serializa com o gate do `agendar-leva`, que trava
a página depois dos posts — mesma ordem) → `FOR SHARE`: `Project`, página de assinatura e página-modelo apontadas pela
Generation do compositor da página, `CustomFont` do projeto. Não trava Generation nenhuma existente: a medição lê só
a candidata em memória e as referências (`FOR SHARE`); a Generation NOVA nasce na transação (linha própria). Ciclo:
`agendar-leva` toma agenda → fontes → ItemDeLote → ItemDePlano → posts → Page → Generation → shares; `ajustar-arte`
toma agenda → fontes → posts → Page → shares — subsequência, sem inversão. **A trava consultiva da agenda entra no
`ajustar-arte` draft-only** porque é ela que serializa com o `agendar-leva` do mesmo projeto antes de qualquer trava
de linha (sem ela, A trava posts e espera Page; B trava Page e espera posts? Não: B também trava posts antes de Page.
Então a consultiva da agenda é redundante para o ciclo — fica como **decisão 8.4**, recomendação: tomar, pelo custo
zero e pela simetria com o `agendar-leva`; alternativa: não tomar).

Passos (dentro de `db.$transaction`, isolamento `ReadCommitted`, 20 s):

1. Travas acima. `POST_APROVADO_INTOCAVEL` como hoje (post não-DRAFT ou `laterPostId`).
2. **Conferência da versão sob trava**: `tx.page.findUnique` → `versaoDaPagina(atual) === versaoAntes` e mesmo
   contrato (as duas conferências que hoje acontecem no CAS/releitura passam a ser feitas EXPLICITAMENTE antes de medir,
   com a página travada: se a página mudou, `VERSAO_DIVERGENTE`/`PAGINA_MUDOU_DURANTE_O_AJUSTE` como hoje, sem medir).
   A candidata foi derivada da página lida ANTES das travas; com a página travada e na mesma versão, a candidata é a
   versão seguinte dela — não há janela entre "o que medi" e "o que gravo".
3. **Generation PROCESSING** criada pela transação (`tx.generation.create`: `status: 'PROCESSING'`, `projectId`,
   `templateId`, `authorName: 'ajuste-arte'`, `canal`, `fieldValues: { source: 'ajuste-arte', pageId: page.id,
   sourcePageId: page.id, … os mesmos campos que hoje vão no render }`) — é a linha que o render fecha
   (`renderPageAndRegister({ generationId })`, caminho que já existe para a fila). Se o gate recusar, a transação volta
   atrás e a linha não existe.
4. `medirEDecidirAjuste(tx, …)` (§ 3.3).
5. Resultado:
   - `nao-medida` / `sem-vinculo` / `medida` com `gate.resultado !== 'APTO'` → `throw new RecusaDoGate(…)` → **rollback
     inteiro**: nenhuma página, nenhuma Generation, nenhuma trava de recomposição, nenhum render, nenhuma invalidação.
     O `catch` em volta da transação mapeia para `CreativeError('REVISAO_HUMANA_NECESSARIA', 422, { ajusteGravado:
     false, pageId, versao: versaoAntes, editUrl, revisao, achados?, motivos? })`. **O registro reprovado NÃO é
     gravado** (§ 8.3: a Generation não existe fora da transação; gravá-lo na Generation do compositor rotularia a arte
     antiga com um veredito de outra versão).
   - APTO → `gravarGateDaArte(tx, registro)` (vínculo: a Generation nova tem `fieldValues.pageId = page.id` e a página é
     do projeto; `'sem-vinculo'`/`'sem-proveniencia'` → `RecusaDoGate`) → `tx.page.updateMany` (CAS como hoje) →
     `travarRecomposicaoDaArte` (como hoje) → commit.
6. Exceção do banco em `medirEDecidirAjuste` vira `nao-medida` (fail-closed, nunca `ERRO`); exceção em
   `gravarGateDaArte` ou timeout da transação (`P2028`) → rollback → `REVISAO_HUMANA_NECESSARIA`; deadlock (`40P01`,
   `P2034`) → `PAGINA_MUDOU_DURANTE_O_AJUSTE`? Não: código próprio `AJUSTE_CONCORRENTE` ("repita") — **decisão 8.5**.

**Depois do commit** (igual a hoje, com a Generation já existente): `renderPageAndRegister({ …, generationId:
generationNova.id, versaoEsperada: versaoGravada })` fecha a linha (COMPLETED + `resultUrl`, `fieldValues` por merge —
o registro do gate, já gravado, sobrevive ao merge porque `mesclarFieldValuesDaArte` é raso por chave e o render não
escreve `gateDaArte`); render que falha → a Generation fica PROCESSING com o registro (dito: `ver-geracao` mostra
`coincidente` numa arte sem `resultUrl`; o cron de render pendente a fecha); `invalidateScheduledRenders(apenasRascunho)`
e aprendizado como hoje. **Nenhuma escrita nova depois do commit** além das de hoje (C6 do CP5c vale aqui: inventário).

## 5. Política de preservação (a decisão de produto, § 8.2)

O plano-mestre diz "não substituir a última versão boa quando a política exigir preservação". Duas leituras:

- **P1 (recomendada)** — o agente só grava versão APTA. Fail-closed e simples: toda escrita autônoma deixa a página
  numa versão que o gate aceitou; não existe "versão intermediária não apta" gravada pelo agente. Custo: o agente não
  consegue melhorar aos poucos uma peça com vários problemas — ou corrige todos numa chamada (o `revisar-arte` devolve
  todos os ajustes), ou escala. É o laço do manual (≤ 2 ciclos → `REVISAO_HUMANA_NECESSARIA`).
- **P2** — "última versão BOA": grava candidata não apta SE a página ANTES também não era apta (nada bom é substituído)
  e o CP4 provou não-piora; recusa só quando a versão atual é APTA e a candidata não. Permite progresso incremental;
  custa UMA medida a mais (a página atual, sob trava) e deixa o agente gravar versões não aptas — que o `agendar-leva`
  vai recusar depois, de qualquer forma.

O contrato implementa **P1**; P2 fica como alternativa documentada (uma constante `POLITICA_DE_PRESERVACAO`).

## 6. O retorno

```ts
// AjustarArteResult, só no draft-only (sucesso = candidata APTA gravada)
revisao: { tipo: 'medida'; resultado: 'APTO'; rulesVersion; versaoDoGate; medidoEm; naoMedidos; generationId }
// CreativeError REVISAO_HUMANA_NECESSARIA (gate recusou), details:
{ ajusteGravado: false, pageId, versao: versaoAntes, editUrl, revisao: RevisaoDoItem (medida reprovada | sem-vinculo | nao-medida), achados?, motivos?, ajustesAplicados?, ajustesRecusados? }
// Recusa do CP4 (todos recusados, nada a gravar) no draft-only: details ganha revisao: { tipo: 'nao-medida', motivo: 'nenhuma versão nova para medir: a peça ficou como estava' }
// e a mensagem termina com "Revisão humana necessária." — o código continua o do CP4 (a causa é a piora/não-medição, não o gate).
```

`RevisaoDoItem` é o tipo já exportado por `agendar-itens.ts` (CP5c § 6); move para `lotes/agendamento.ts` ou módulo puro
compartilhado (`revisao/revisao-do-item.ts`) para `arte-rapida.ts` não importar o serviço do lote. Fluxo humano: sem o
campo. Nenhum parâmetro novo na tool; a descrição de `ajustar-arte` ganha o parágrafo do gate.

## 7. Invariantes (os testes provam)

1. Draft-only: nenhuma escrita em `Page` (nem Generation nova, nem trava de recomposição, nem render, nem invalidação)
   sem `decidirEMontarRegistro` → `ok` + `APTO` sobre a candidata FINAL, na MESMA transação (A1, A2, A10).
2. A identidade do registro é a da versão gravada: `pageVersion === versaoDaPagina(página depois do commit)` e
   `copyVersion === copyVersionDe(copyAutoral gravado)` (A3); `ver-geracao` → `coincidente`.
3. Registro gravado na Generation que o render FECHA (mesmo id em `revisao.generationId`, no render e no registro) e
   sobrevive ao merge do render (A4).
4. Recusa do gate → rollback inteiro: página, Generation, trava e render intactos; `invalidateScheduledRenders` NUNCA
   chamado (A2 — é o P11 "render não reaberto").
5. Página/assinatura/fontes/projeto travados da medição ao commit (A5: edição concorrente espera; a chamada seguinte
   mede a versão nova com `VERSAO_DIVERGENTE`); ordem comum sem inversão com o `agendar-leva` (inventário C13 do CP5c
   ganha as linhas de `arte-rapida.ts`).
6. Fluxo humano byte a byte igual (A6: perfil normal, mesmas chamadas, mesmo rastro de escritas e nenhuma trava nova).
7. A recusa do CP4 continua a mesma e vem antes (A7); `CONTEUDO_NAO_PODE_SER_REMOVIDO` antes de tudo (A8).
8. `agendar-leva` sobre a versão gravada pelo ajuste APTO mede de novo e cria o DRAFT (A9 — ponta a ponta mínima do
   CP5d → CP5c, com o mesmo gate e a mesma política).

## 8. Decisões pendentes do owner

| # | Decisão | Recomendação | Se decidir o contrário |
|---|---|---|---|
| 8.1 | Política do assunto no `ajustar-arte` | a MESMA constante do CP5c (`POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`; renomear para `POLITICA_DO_ASSUNTO_DO_GATE` neste PR, sem mudar o valor) | política própria por tool: dois gates com vereditos diferentes para a mesma peça |
| 8.2 | Preservação (§ 5) | **P1**: o agente só grava versão APTA | **P2**: grava não apta sobre não apta (não-piora), protege só a versão APTA; +1 medida |
| 8.3 | Registro do veredito reprovado no ajuste | NÃO gravar (a Generation da versão recusada não existe; a do compositor é de outra versão) | gravar na Generation do compositor com identidade da candidata: `ver-geracao` mostraria `historico` sempre |
| 8.4 | Trava consultiva da agenda no `ajustar-arte` | tomar (simetria com `agendar-leva`, custo zero) | não tomar (a ordem posts → Page já evita o ciclo) |
| 8.5 | Código da concorrência (deadlock, CAS perdido depois de medir) | `AJUSTE_CONCORRENTE` novo ("repita") | reaproveitar `PAGINA_MUDOU_DURANTE_O_AJUSTE` (que manda NÃO repetir sem olhar — semântica diferente) |
| 8.6 | O `hojeViola` humano "em até 2 ciclos" | CP5e: `revisar-arte` humano devolve o veredito do gate como INFORMAÇÃO (`decidirEMontarRegistro` com origem `revisar-arte`, sem gravar) | agora: amplia o CP5d ao fluxo humano (warn-only) |
| 8.7 | Prazo da medição do gate no ajuste | `PRAZO_DA_MEDICAO_MS` 8 s / `PRAZO_POR_DOWNLOAD_MS` 4 s (as do CP5c) | valores próprios |

## 9. Matriz de testes (banco falso com travas de linha e eventos — o harness de `agendar-itens-gate.test.ts`, estendido)

| Caso | Entrada | Esperado |
|---|---|---|
| A1 | draft-only, ajustes aceitos pelo CP4, candidata APTA | ordem: travas → conferência da versão → `INSERT Generation PROCESSING` → medição pela `tx` → `UPDATE Generation … (registro)` → `UPDATE Page` → trava de recomposição → commit → render fecha a MESMA Generation → invalidação; `revisao.resultado = 'APTO'` |
| A2 | draft-only, candidata NÃO apta (v2 do piloto com ajustes que o CP4 aceita mas deixam blocker) | `REVISAO_HUMANA_NECESSARIA` 422, `ajusteGravado: false`, `achados`/`motivos`, `editUrl`; página byte a byte igual; nenhuma Generation; `invalidateScheduledRenders` não chamado; render não chamado |
| A3 | identidade | `registro.identidade.pageVersion === versaoDaPagina(página gravada)`; `copyVersion` do contrato gravado; `ver-geracao` → `coincidente` |
| A4 | render depois do commit | fecha a Generation criada (mesmo id); `gateDaArte` presente depois do merge do render; render que falha → Generation PROCESSING com o registro, página gravada, invalidação como hoje |
| A5 | edição concorrente da página / assinatura / fonte / projeto durante a medição | espera a trava; a chamada seguinte recusa `VERSAO_DIVERGENTE` (página) ou mede com o novo |
| A6 | perfil normal, mesmas chamadas | rastro de escritas idêntico ao de hoje; nenhuma trava nova; sem `revisao` |
| A7 | todos os ajustes recusados pelo CP4 (draft-only) | o código do CP4 de hoje; `details.revisao.tipo = 'nao-medida'`; mensagem com "Revisão humana necessária"; nada medido pelo gate (0 medidas da `tx`) |
| A8 | `slotValues` que esvaziam texto (draft-only) | `CONTEUDO_NAO_PODE_SER_REMOVIDO` antes de qualquer medida |
| A9 | ajuste APTO gravado → `agendar-leva` draft-only na mesma página | o lote mede de novo (Generation da peça = a do ajuste? NÃO: a do compositor; `composicaoReaproveitavel` decide) e cria o DRAFT; dois registros (um por Generation), ambos `coincidente` |
| A10 | gravação do registro falha / timeout / deadlock | rollback; `REVISAO_HUMANA_NECESSARIA` (ou `AJUSTE_CONCORRENTE` no deadlock); nada gravado |
| A11 | página sem contrato de copy (draft-only) | `copy-completa` não comprovada → recusa do gate, dita no motivo ("página sem contrato de copy: o agente não ajusta") |
| A12 | `nao-medida` por prazo (rede presa na foto da candidata) | recusa no prazo; travas liberadas; nenhuma Generation órfã |
| P11 | `piloto-ciclo.test.ts` "o ajuste que piora é recusado ANTES de substituir…" | vira `it()`: página intacta, render não reaberto, `REVISAO_HUMANA_NECESSARIA` na resposta |
| I1 | inventário | `arte-rapida.ts` nas listas do lint e do H12; C13 do CP5c com as travas novas de `arte-rapida.ts` na ordem comum; `revisao-do-item.ts` puro sem `@/lib/db` |

## 10. Arquivos (os principais)

- `src/lib/creatives/arte-rapida.ts`: travas, Generation PROCESSING na transação, `medirEDecidirAjuste`, `gravarGateDaArte`,
  `RecusaDoGate` e o mapeamento no `catch`, `revisao` no retorno e nas recusas, `renderPageAndRegister({ generationId })`;
- `src/lib/creatives/revisao/revisao-do-item.ts` (novo, puro): `RevisaoDoItem` (movido de `agendar-itens.ts`, que reexporta);
- `src/lib/lotes/agendamento.ts`: `POLITICA_DO_ASSUNTO_DO_GATE` (renome; `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA` reexportado);
- `src/lib/mcp/catalogo/arte-ia.ts` (`ajustar-arte`): descrição + `principal` ao serviço; `scripts/validar-registro-mcp.ts` (snapshot só de schema: não muda);
- `eslint.config.mjs`, `inventario-gate-da-arte.test.ts`, `inventario-gate-agendar-leva.test.ts` (listas + travas);
- testes: `src/lib/creatives/__tests__/ajustar-arte-gate.test.ts` (A1–A12), `piloto-ciclo.test.ts` (P11 → `it()`);
- docs: `docs/regras/revisor-da-arte.md` § CP5d, `docs/regras/mcp.md`, `docs/regras/dot-lagosta-operacao.md` + `operacao-dot.ts` (v7).

Fora: `gate.ts`, `gate-registro.ts`, `gate-persistido.ts`, `agendar-itens.ts` (só o reexport), `ajustar-sem-piorar.ts`,
`nao-piora.ts`, `persist.ts` (o caminho `generationId` já existe), schema do Prisma, fluxo humano.

## 11. Gates do PR de implementação

Os do CP5c § 11: suíte completa com `MOSTRAR_VIOLACOES=1` (só o P11 de `piloto-ciclo` muda para `it()`), `typecheck`,
`lint`, `git diff --check`, os 3 validadores (nenhuma impressão digital muda), Codex no HEAD exato, CI e Vercel verdes,
merge por merge commit com `--match-head-commit` (SHA completo). Nenhum cliente real, DRAFT real, agenda, publicação,
mensagem, webhook ou banco de produção como teste.
