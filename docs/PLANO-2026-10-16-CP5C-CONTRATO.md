# CP5c — contrato técnico do GATE em `agendar-leva` (perfil draft-only) — proposta para revisão, 16/10/2026

**Estado: PROPOSTA (rodada 0). Nada aqui está implementado; este PR é documental.** Base: `main` `6e468abc` (CP5b
mergeado: contrato #239 → `c7c461b8`, implementação #240 → `6e468abc`). Fontes: plano-mestre
`docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` § 4.5 (e a tabela de reforços do Dot), contrato do CP5b
`docs/PLANO-2026-10-16-CP5B-CONTRATO.md` § 12 (o handoff, itens 1–9), contrato do CP5a (`gate.ts`), e o código de
`src/lib/lotes/agendar-itens.ts` como está na main (linhas citadas por função, não por número — o arquivo muda).

## 0. O que o CP5c entrega, em uma frase

No perfil efetivo **draft-only**, `agendar-leva` só cria, adota ou completa um RASCUNHO depois de **medir a página
relida e decidir de novo** com `decidirEMontarRegistro` (CP5b) — `decisao: 'ok'` E `gate.resultado === 'APTO'` —, grava
o registro do veredito **dentro da transação, antes do efeito**, e devolve `REVISAO_HUMANA_NECESSARIA` com as
referências da peça em todo outro caso. O fluxo humano continua WARN-ONLY. **O registro gravado nunca entra na decisão.**
`simular: true` mede e decide igual e não grava nada.

## 1. O que a main tem hoje (o que o contrato muda e o que preserva)

| Ponto | Hoje (`agendar-itens.ts`) | CP5c |
|---|---|---|
| Quem decide o perfil | `compositor.ts` (`agendar-leva`): `apenasRascunho = perfilDoPrincipal(principal) === 'draft-only'` | igual; o gate liga SÓ com `apenasRascunho` |
| Decisão sem trava | `decidirEscrita(ctx.leitor, …)` → `criar` / `adotar` / `recusar` | igual; **depois** dela, no draft-only, a MEDIÇÃO + `decidirEMontarRegistro` (§ 3) |
| Simulação | mede horário ocupado, `recusaComoImagem`, thumbnail; devolve `concluido` sem gravar | igual + o gate: não APTO → `falhou` `REVISAO_HUMANA_NECESSARIA`; nada gravado (nem o registro) |
| Transação (20 s) | `pg_advisory_xact_lock(projeto)` → `FOR UPDATE` do item, do item do plano, da página → `decidirEscrita(tx)` de novo → `pedidoDoAgendamento` → `resolverAgendamento` + `criarPostDoAgendamento` (criar) ou adota → CAS da linha → item do plano | igual + (§ 4): `SELECT … FOR UPDATE` da Generation; releitura da página com os campos da identidade; **identidade relida ≡ medida**; releitura do post (adotar); `gravarGateDaArte(tx, registro)` ANTES de criar/ligar; `sem-vinculo`/exceção → `RecusaSobTrava` com `REVISAO_HUMANA_NECESSARIA` |
| Efeitos pós-commit | `executarEfeitos` (catálogo, refilagem da pasta, item do plano → `agendado`) nas três vias | igual + (§ 5): no draft-only, revalidação PROTEGIDA antes de cada efeito |
| Linha já ligada com efeitos pendentes (`reaproveitar`) | roda os efeitos direto | (§ 5) decisão fresca + revalidação antes dos efeitos |
| `ItemAgendadoDoLote` | `situacao`, `codigo`, `motivo`, `generationId`, `pageId`, `editUrl`, … | + `revisao?` (§ 6): o veredito resumido, nunca autoridade |
| Testes | `piloto-portao.test.ts` P11: 8 `hojeViola` (v1 e v2 × simulação/escrita × não-criar/referências) | viram `it()` neste PR (regra do CP0) |

**Nada muda para o perfil normal** (humano): `apenasRascunho === false` → nenhuma medição, nenhum registro, nenhuma
recusa nova. É a mesma regra do H4: o gate fail-closed só vale onde o perfil é draft-only (plano-mestre § 4.5,
"limite a dizer ao owner": o `clientId` do ChatGPT é compartilhado com humanos; um cliente OAuth novo nasce `normal`).

## 2. Escopo e não-escopo

**Entra**: (a) medição + decisão fresca em `agendarItem` para `criar`, `adotar` e `reaproveitar com efeitos pendentes`,
só no draft-only; (b) gravação do registro sob trava antes do efeito (`gravarGateDaArte`), com os códigos de recusa;
(c) releitura da página (campos de `identidadeDaPagina`), da Generation e do post sob trava, e a comparação com a
medida; (d) revalidação protegida antes de cada efeito pós-commit; (e) `revisao` no retorno do item; (f) a política
EFETIVA do assunto (decisão 9.12 do CP5b, § 8.1); (g) `agendar-itens.ts` entra na lista de produtores da regra de
lint e do inventário H12; (h) P11 vira `it()`; (i) o inventário "toda tool da allowlist draft-only que cria DRAFT passa
pelo gate"; (j) docs (`revisor-da-arte.md` § CP5c, `mcp.md`, manual do Dot).

**Não entra** (dito para não parecer garantia): `ajustar-arte` autônomo e a fronteira da não-piora (CP5d); provas
ponta a ponta sintéticas e o piloto (CP5e, § 4.7/4.8 do plano-mestre); bloco `gate` em `auditar-operacao` (§ 8.4:
fica para o CP5e, com os números do piloto); oclusão por pixels; qualquer mudança no fluxo humano; `colocar-na-agenda`,
`postar-agora`, `aprovar-rascunhos` (fora da allowlist draft-only — continuam fora); migration; mexer em `gate.ts`,
`gate-registro.ts` ou `gate-persistido.ts` (consumidos como estão; se um deles precisar mudar, é PR próprio com bump).

## 3. A decisão fresca (fora da transação, depois de `decidirEscrita`)

Só com `ctx.apenasRascunho`, e só quando a decisão sem trava foi `criar` ou `adotar` (uma `recusa` já é resposta).

```ts
// agendar-itens.ts (novo trecho; a lógica de medição é a já existente em revisar-arte.ts)
async function medirEDecidir(ctx, antes: { peca; pagina }, pedido, principal): Promise<DecisaoFresca>
  // 1. Página INTEIRA, pelo leitor (db ou leitor da simulação): id, name, tags, width, height, background, layers,
  //    copyAutoral, audio, isTemplate, Template.projectId — a mesma leitura alimenta identidade, medição e vínculo.
  // 2. `recusaComoImagem(page.layers, page.audio)` → recusa → REVISAO_HUMANA_NECESSARIA (vídeo/música: o CP5a manda ao humano).
  // 3. `lerCamadas(page.layers)` ilegível → REVISAO_HUMANA_NECESSARIA (`decidirEMontarRegistro` daria IDENTIDADE_ILEGIVEL; aqui nem mede).
  // 4. `contextoDaMedicao({ projectId, page, camadas })` + `medirCamadasDaPeca(camadas, ctx, { corrigir: false })`
  //    — a MESMA medição do revisor e do executor do CP4; `corrigir: false` porque mede a peça COMO VAI SER GRAVADA.
  //    Qualquer exceção aqui (banco, fontes) → REVISAO_HUMANA_NECESSARIA com o motivo (fail-closed; nunca `ERRO`).
  // 5. identidade = identidadeDaPagina(page)
  // 6. decidirEMontarRegistro({
  //      entrada: { medida, identidade: { pageVersion, copyVersion }, politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA },
  //      page, vinculo: { projectId, generationId: antes.peca.id, postType: pedido.postType }, origem: 'agendar-leva',
  //      principal: { tipo: principal.kind, id: clientId/userId }, agora: () => new Date() })
  // 7. `sem-vinculo` → REVISAO_HUMANA_NECESSARIA (motivo do vínculo); `ok` com resultado ≠ APTO → REVISAO_HUMANA_NECESSARIA
  //    com `revisao` (§ 6); `ok` APTO → segue com { registro, identidade }.
```

- **A medida nasce da MESMA leitura da página** cujas camadas, canvas, formato e `copyAutoral` entram no vínculo
  (§ 12.5 do CP5b): `camadas` = `lerCamadas(page.layers)`, e `contextoDaMedicao` recebe a mesma `page`. Métricas,
  contraste e leitura da logo saem de `medirCamadasDaPeca` sobre essas camadas — e é isso que o teste C5 prova (a
  medida passada a `decidirEMontarRegistro` é a dessas camadas; uma medida de outra página é `sem-vinculo`).
- `vinculo.postType` é o tipo do post que VAI nascer (`criar`: `pedido.postType`) ou do post relido (`adotar`,
  `reaproveitar`: `post.postType`) — § 12.6 do CP5b. Divergência com `TIPO_DO_POST_POR_FORMATO[formato]` é `sem-vinculo`
  dentro de `decidirEMontarRegistro` (já implementado no CP5b).
- O registro NÃO é consultado: `lerGateDaArte` não é importado por `agendar-itens.ts` (a regra de lint do CP5b o
  barra; `agendar-itens.ts` entra só na lista de quem pode `decidirEMontarRegistro`). Um registro `APTO`/`coincidente`
  já gravado na Generation não muda nada (teste C3).
- **Custo**: `medirCamadasDaPeca` registra fontes uma vez por contexto, mede texto, roda a régua (render) e lê a logo
  (download). Estimativa pela medição do CP3/CP4: 1–4 s por item, FORA da transação de 20 s. Um lote de 21 itens leva
  ~1 min a mais; dito na descrição da tool ("a simulação e a chamada de verdade medem cada peça").

## 4. Sob a trava: reler, comparar, gravar, só então criar/ligar

Dentro da transação existente, depois das travas de hoje e do `decidirEscrita(tx, …)` que já relê a peça:

1. `SELECT id FROM "Generation" WHERE id = ${peca.id} AND "projectId" = ${projectId} FOR UPDATE` (nova trava; a Generation
   é o dono do registro — § 12.2). Ordem das travas: projeto → ItemDeLote → ItemDePlano → Page → Generation. Ninguém
   mais pega Generation depois de Page nesta ordem (`persist.ts` trava Generation sem Page), então não forma ciclo —
   dito e conferido no PR.
2. **Página relida sob trava** com os campos de `identidadeDaPagina` (hoje `lerPagina` lê só `templateId`, `isTemplate`,
   tamanho e tags): `identidadeDaPagina(relida)` tem de ser IGUAL à da medição em `pageVersion`, `copyVersion`,
   `formato` e `formatoDoCompositor`; e `recusaComoImagem(relida.layers, relida.audio)` tem de continuar nulo.
   Divergência → `RecusaSobTrava({ codigo: 'REVISAO_HUMANA_NECESSARIA', motivo: 'A página mudou entre a medição e a
   escrita; nada foi agendado. Repita a chamada para medir de novo.' })` (plano-mestre § 4.5, reforço 4).
   *Observação dita*: é uma condição de concorrência, não um defeito da peça; o código é o do plano-mestre porque o
   fluxo autônomo não distingue "mudou" de "não provado" — repetir a chamada mede de novo.
3. **Via `adotar`** (§ 12.3/4a/4b): o post relido sob trava (`SELECAO_DO_POST` + `projectId`) tem de ter
   `status === 'DRAFT'`, `laterPostId === null`, `projectId === projectId`, `pageId === page.id`,
   `postType === TIPO_DO_POST_POR_FORMATO[formato relido]` e `generationId === peca.id`. Hoje a seleção para adoção
   (`decidirPostsDaPagina`) não confere tipo nem Generation; `generationId` nulo ou outro → `REVISAO_HUMANA_NECESSARIA`
   ("o rascunho desta página aponta outra arte; confira na agenda"). Nada é escrito no post adotado.
4. **`gravarGateDaArte(tx, registro)`** ANTES de `resolverAgendamento`/`criarPostDoAgendamento` (criar) e antes do CAS da
   linha (adotar). `'sem-vinculo'` (0 linhas: a Generation não é desta página/projeto, ou a página não é do projeto) →
   `RecusaSobTrava` `REVISAO_HUMANA_NECESSARIA`; `'sem-proveniencia'` idem (não acontece com o registro selado; fica
   como guarda); **exceção do banco PROPAGA** e a transação volta atrás — e o item volta `falhou` com
   `REVISAO_HUMANA_NECESSARIA` (não com o `codigo: 'ERRO'` genérico do `catch` externo de `agendarItensDoLote`): o
   `try/catch` em volta de `$transaction` passa a mapear a exceção da gravação para esse código (teste C10).
5. Só então o que já existe: `horarioOcupado`, `resolverAgendamento`, `criarPostDoAgendamento`, CAS da linha, item do plano.

**Registro quando NÃO é APTO** (item recusado antes da transação): gravado FORA da transação pelo `db` (não pelo
`leitor`), depois da decisão e antes de devolver o item — auditoria do veredito reprovado, "o registro novo substitui o
antigo" (§ 12.1). Falha nessa gravação: `console.warn` + o item segue `falhou` (a decisão já foi tomada e nada foi
criado). Em `simular`, nada é gravado nunca.

## 5. Efeitos pós-commit, nas três vias (§ 12.4/4a do CP5b)

No draft-only, `executarEfeitos` passa a receber a identidade medida e, ANTES de cada efeito (catálogo, refilagem da
pasta, item do plano), relê sob uma transação curta (`FOR UPDATE` da página e do post, mesma ordem) e exige:
`identidadeDaPagina(relida)` ≡ medida nos 4 campos; `post.status === 'DRAFT'`, `laterPostId === null`,
`postType === TIPO_DO_POST_POR_FORMATO[formato relido]`, `post.pageId === page.id`, `post.generationId === peca.id`,
`post.projectId === projectId`; `Page.Template.projectId === projectId`; `Generation.projectId === projectId` e
`Generation.fieldValues.pageId === page.id`; `recusaComoImagem(layers, audio)` nulo. Divergiu → o efeito NÃO roda; o
item volta `concluido` com aviso ("o rascunho existe; o registro do agendamento não terminou porque a página/post mudou;
repita a chamada") e `efeitosDoAgendamentoEm` fica nulo (a repetição mede de novo).

- **Refilagem e o nome da página**: `refilarPaginasDoPost` renomeia a página (`nomeDaPagina`) e muda `templateId`; o
  classificador do REVISOR lê o nome. Logo DEPOIS desse efeito a identidade (`formato`) pode divergir da medida — por
  isso a revalidação é ANTES de cada efeito, nunca depois, e o registro gravado pode ficar `historico` por `formato` já
  no primeiro `ver-geracao`. Dito: é auditoria honesta ("medido com este nome"), não defeito. O teste C6 cobre.
- `reaproveitar com efeitos pendentes` (linha já ligada): no draft-only passa pela decisão fresca (§ 3) com
  `vinculo.postType = post.postType` e grava o registro sob trava (§ 4) ANTES dos efeitos; não APTO → efeitos não rodam,
  item `falhou` `REVISAO_HUMANA_NECESSARIA` com o aviso de que o rascunho existe e continua como está.
- Fluxo humano: `executarEfeitos` como hoje.

## 6. O retorno do item (`ItemAgendadoDoLote.revisao`)

```ts
revisao?: {
  resultado: 'APTO' | 'REVISAO_HUMANA_NECESSARIA' | 'SEM_VINCULO'
  rulesVersion: string; versaoDoGate: string
  motivos: Array<{ regra: string; codigo: string; motivo: string; camadas: string[] }>   // os do gate (vazio em APTO)
  achados: Array<{ regra: string; camadas: string[]; id: string; severidade: string; certeza: string }>
  naoMedidos: Array<{ regra: string; motivo: string; camadas: string[] }>
  medidoEm: string
}
```

- Item `falhou` por `REVISAO_HUMANA_NECESSARIA` traz SEMPRE `generationId`, `pageId`, `editUrl` (template atual) e
  `revisao` — é o que `piloto-portao.test.ts` (`referenciasQueFaltam`) exige: achados estruturais (regra + camadas) e,
  na v1, um achado sobre a camada do serviço. `sem-vinculo` traz `revisao.resultado = 'SEM_VINCULO'` com um motivo.
- Item `concluido` no draft-only traz `revisao` com `resultado: 'APTO'` e listas vazias (o veredito que autorizou), e
  o aviso fixo do CP5b continua em `ver-geracao`.
- Fluxo humano: sem `revisao`.
- Nenhum parâmetro novo na tool (`validar-registro-mcp` continua igual); a descrição de `agendar-leva` ganha o
  parágrafo do gate (snapshot do validador atualizado, deliberado).

## 7. Invariantes (os testes provam)

1. Draft-only: nenhum DRAFT nasce, é adotado ou ganha efeitos sem `decidirEMontarRegistro` → `ok` + `APTO` na MESMA
   chamada; o registro gravado nunca é lido (`lerGateDaArte` não importado; teste C3 com registro APTO antigo + medida
   reprovada → nada criado).
2. Registro APTO gravado DENTRO da transação, ANTES do efeito; falha na gravação → nenhum post (C1, C10).
3. Identidade relida sob trava ≡ medida (4 campos) e página ainda imagem; senão nada escrito (C4).
4. `adotar`: tipo, Generation, projeto, `DRAFT` sem `laterPostId` conferidos sob trava (C5b).
5. Efeitos só depois da revalidação protegida (C6).
6. `simular` nunca grava (nem registro); mede e devolve a mesma decisão (C8).
7. Fluxo humano byte a byte igual ao de hoje (C7: os testes de `agendar-itens` atuais passam sem mudar).
8. Reforços do Dot (plano-mestre § 4.5): `lembrete: true` em draft-only nunca chama `sendPublishReminder`/WAHA (C11);
   `sendToLater`/Zernio nunca chamados (C11); post aprovado intocável (C12); tool nova fora da allowlist nasce proibida
   (já existe) + toda tool da allowlist que cria DRAFT passa pelo gate (C9, inventário).

## 8. Decisões pendentes do owner

| # | Decisão | Recomendação | Se decidir o contrário |
|---|---|---|---|
| 8.1 | **Política EFETIVA do assunto** (9.12 do CP5b) | `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA = POLITICA_DO_ASSUNTO_RECOMENDADA` (`estimado: 'humano'`, `semAssuntoLocalizavel: 'nao-se-aplica'`) — constante nomeada em `agendar-itens.ts`, e `ver-geracao` passa a comparar com ela | `estimado: 'comprova'` deixa o assunto estimado reprovar sozinho; `semAssuntoLocalizavel: 'humano'` manda toda foto sem região forte ao humano |
| 8.2 | Código da divergência entre medição e trava | `REVISAO_HUMANA_NECESSARIA` (plano-mestre § 4.5) | código próprio `PECA_MUDOU_APOS_MEDICAO`: mais preciso, mais um código no vocabulário |
| 8.3 | Registro do veredito reprovado | gravar fora da transação (auditoria) | não gravar: `ver-geracao` nunca mostra por que a peça não entrou |
| 8.4 | Bloco `gate` em `auditar-operacao` (9.9 do CP5b) | CP5e, com os números do piloto (seleção de peças definida junto) | agora: `posts/auditar-operacao.ts` passa a selecionar `generationId` e ler o registro — PR maior |
| 8.5 | `adotar` com `post.generationId` nulo (DRAFT criado pelo humano sem arte ligada) | `REVISAO_HUMANA_NECESSARIA` (não adota) | adotar e ligar: o agente "assume" um rascunho humano |

## 9. Matriz de testes (unitários com banco falso; o fluxo humano pelos testes existentes)

| Caso | Entrada | Esperado |
|---|---|---|
| C1 | draft-only, `criar`, peça APTO | ordem no cliente falso: travas → `UPDATE Generation … gateDaArte` → `INSERT` do post → CAS da linha; `revisao.resultado = 'APTO'` |
| C2 | draft-only, `criar`, peça reprovada (v1 do piloto: `texto-sem-leitura:servico`) | nenhum post; `falhou` `REVISAO_HUMANA_NECESSARIA` com `generationId`, `pageId`, `editUrl`, `revisao.achados` com `servico`; registro reprovado gravado pelo `db` fora da transação |
| C3 | Generation JÁ com `gateDaArte` APTO coincidente; medida nova reprovada | igual a C2: o registro antigo não é lido; o novo (reprovado) o substitui |
| C4 | página editada entre a medição e a trava (hash muda) / só o nome / só as tags / só a copy | nada escrito; `REVISAO_HUMANA_NECESSARIA`; repetir a chamada mede de novo e cria |
| C5 | medida de OUTRA página passada ao vínculo (teste de unidade do `medirEDecidir`) | `sem-vinculo` → `REVISAO_HUMANA_NECESSARIA` |
| C5b | `adotar`: DRAFT `STORY` numa página `feed`; DRAFT com `generationId` nulo/outro; DRAFT que virou `SCHEDULED`; página que ganhou música | `REVISAO_HUMANA_NECESSARIA` sem tocar no post (os de hoje `POST_APROVADO_INTOCAVEL` continuam) |
| C6 | `reaproveitar` com efeitos pendentes + edição concorrente (camadas / copy / nome / tags) antes do efeito | efeito não roda; aviso; `efeitosDoAgendamentoEm` nulo |
| C7 | perfil normal, mesmas peças | igual a hoje: v1 vira rascunho RENDERED; sem `revisao`; nenhum `UPDATE … gateDaArte` |
| C8 | `simular: true`, draft-only, v1 e limpa | mede e decide; nenhuma escrita (nem registro); `falhou`/`concluido` iguais aos da chamada de verdade |
| C9 | inventário | toda tool em `TOOLS_DRAFT_ONLY` cujo handler cria `SocialPost` DRAFT importa `decidirEMontarRegistro` (hoje só `agendar-leva`); `agendar-itens.ts` está nas listas da regra de lint e do H12 |
| C10 | `gravarGateDaArte` lança dentro da transação | rollback; item `falhou` `REVISAO_HUMANA_NECESSARIA` (não `ERRO`); nenhum post |
| C11 | draft-only, `lembrete: true` | DRAFT `REMINDER`; `sendPublishReminder`/WAHA/`sendToLater` nunca chamados |
| C12 | página com post aprovado / `laterPostId` | `POST_APROVADO_INTOCAVEL`, como hoje; o gate nem roda |
| P11 | `piloto-portao.test.ts` | os 8 `hojeViola` viram `it()`: v1 e v2 não criam rascunho (simulação e escrita) e voltam `REVISAO_HUMANA_NECESSARIA` com as referências; o controle positivo (peça limpa) continua criando |

## 10. Arquivos (os principais)

- `src/lib/lotes/agendar-itens.ts`: `medirEDecidir`, trava da Generation, releituras, `gravarGateDaArte`, revalidação dos
  efeitos, `revisao` no item, código `REVISAO_HUMANA_NECESSARIA`;
- `src/lib/lotes/agendamento.ts` (ou vizinho): `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`, tipo `revisao`;
- `src/lib/mcp/catalogo/compositor.ts` (`agendar-leva`): descrição + `principal` passado ao serviço (já passa
  `apenasRascunho`); `scripts/validar-registro-mcp.ts` (snapshot da descrição);
- `src/lib/mcp/catalogo/ver-geracao-retorno.ts`: a política comparada passa a ser `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA`;
- `eslint.config.mjs` (lista de produtores) e `inventario-gate-da-arte.test.ts` (listas fechadas + C9);
- testes: `src/lib/lotes/__tests__/agendar-itens-gate.test.ts` (C1–C12), `piloto-portao.test.ts` (P11 → `it()`);
- docs: `docs/regras/revisor-da-arte.md` § CP5c, `docs/regras/mcp.md`, `docs/regras/dot-lagosta-operacao.md` +
  `operacao-dot.ts` (bump: "agendar-leva no draft-only só cria rascunho com veredito APTO medido na hora").

Fora: `gate.ts`, `gate-registro.ts`, `gate-persistido.ts`, `revisar-arte.ts` (consumidos como estão), `arte-rapida.ts`,
`persist.ts`, schema do Prisma, fluxo humano.

## 11. Gates do PR de implementação

Suíte completa com `MOSTRAR_VIOLACOES=1` (só os 8 `hojeViola` de P11 mudam, para `it()`), `typecheck`, `lint`,
`git diff --check`, `validar-registro-mcp`, `validar-oauth-mcp`, `validar-impressao-digital` (nenhuma impressão muda:
`gate.ts` e `regras.ts` não são tocados); Codex no HEAD exato; CI e Vercel verdes; merge por merge commit com
`--match-head-commit`. Nenhum cliente real, DRAFT real, agenda, publicação, mensagem, webhook ou banco de produção
como teste (ordem do owner).
