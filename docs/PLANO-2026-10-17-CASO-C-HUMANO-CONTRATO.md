# Contrato — política do assunto, caso C: "foto lida sem assunto localizável" vai ao HUMANO (17/10/2026)

> Codex: rodada 1 NÃO APTO (mock da medida ainda forçava "sem foto" e o catálogo cruzava o serviço; previsão 8 → 6; limite
> temporal do "nada é apagado") → rodada 2 **APTO para implementar**, com 1 MENOR (H5: acrescentar o caso do registro gravado
> na política ANTIGA lido pela efetiva) incorporado na implementação.

## 0. A decisão do owner (verbatim, 17/10/2026)

> Decisão do caso C: semAssuntoLocalizavel = 'humano' (foto lida sem assunto localizável vai ao humano). Prepare o contrato da
> mudança e a rodada nova do piloto.

É a primeira metade da decisão 9.1 do CP5a / 9.12 do CP5b / 8.1 do CP5c–CP5e, até aqui uma PROPOSTA nomeada
(`POLITICA_DO_ASSUNTO_RECOMENDADA = { estimado: 'humano', semAssuntoLocalizavel: 'nao-se-aplica' }`). O que a motivou: o piloto
sintético (PR #249, `docs/piloto-sintetico/2026-10-17-completo-resumo.md`, § 3b) mostrou que, sem catálogo, o estimador que não
localiza assunto fazia a regra `texto-sobre-assunto` "não se aplicar" — um APTO silencioso com o serviço sobre a vitrine.

## 1. Escopo (o que muda)

1. **Uma constante**: `POLITICA_DO_ASSUNTO_DO_GATE` (`src/lib/lotes/agendamento.ts`) deixa de ser a RECOMENDADA e passa a ser
   `{ estimado: POLITICA_DO_ASSUNTO_RECOMENDADA.estimado, semAssuntoLocalizavel: 'humano' }`, com o comentário dizendo o que é
   DECIDIDO (caso C, owner, 17/10/2026) e o que continua PROPOSTA (caso B, `estimado: 'humano'`). É a única fonte: `agendar-leva`
   (CP5c), `ajustar-arte` (CP5d), `revisar-arte` informativo e `auditar-operacao`/`ver-geracao` (CP5e) e a impressão digital leem
   dela — nenhum deles muda.
2. **`gate.ts` não muda**: `PoliticaDoAssunto` continua com as duas opções no caso C; `POLITICA_DO_ASSUNTO_RECOMENDADA` fica como a
   proposta histórica do CP5a (comentário atualizado: o caso C foi DECIDIDO fora dela). A validação de registros gravados
   (`validadeDoGate`, `DivergenciaDoGate 'politica'`) já compara a política gravada com a do leitor.
3. **Testes**: os que dependem da política EFETIVA (não os que passam uma política explícita ao `gateDaMedida`) passam a afirmar o
   novo comportamento — "foto lida sem assunto localizável → `REVISAO_HUMANA_NECESSARIA` por `texto-sobre-assunto:NAO_COMPROVADA`"
   — sem enfraquecer nenhuma asserção (nada vira `hojeViola`, nada é removido). A lista exata sai da rodada exploratória (§ 5).
4. **Piloto**: rodada nova OFICIAL (padrão e `--completo`, com repetição) no HEAD da mudança, resumo versionado em
   `docs/piloto-sintetico/2026-10-17-caso-c-humano-{padrao,completo}-resumo.md`. Para isso o runner ganha `PILOTO_ROTULO`
   (um rótulo no nome da rodada; NÃO é filtro — a rodada continua oficial e exige a cobertura dos cenários).
5. **Docs**: `docs/regras/revisor-da-arte.md` ganha a seção datada "Caso C decidido: humano"; os contratos CP5a/b/c/d/e não são
   reescritos (histórico), só apontados.

## 2. O que NÃO muda

- Nenhuma allowlist, nenhuma capacidade de publicação autônoma, nada de MCP-M, editor ou canvas.
- `estimado` (caso B) continua `'humano'` como PROPOSTA — o owner não decidiu o caso B.
- `VERSAO_DO_GATE` e `VERSAO_DAS_REGRAS` NÃO sobem: a política é parte da identidade do registro (`registro.politica`), e a
  divergência `politica` já torna `historico` todo registro gravado com a política antiga — ele é re-medido no próximo
  `agendar-leva`/`ajustar-arte`/`revisar-arte`. A troca da constante não migra nem apaga registro algum; posts, artes
  aprovadas e `laterPostId` ficam intactos (item já ligado volta sem nova medição). O que PODE acontecer depois: uma nova
  tentativa sem APTO grava o veredito novo na mesma chave `gateDaArte` — o APTO antigo deixa de ser o último registro de
  auditoria (`ver-geracao` mostra o gravado com o rótulo `historico` e o aviso; nunca o usa para autorizar agenda).
- As decisões 2 (janelas da fixture: anonimização × fidelidade) e 3 (assinatura × piso) do relatório do piloto continuam
  ABERTAS; 5.1 (fotos reais) e 5.2 (lista de clientes) idem. A rodada nova NÃO as resolve e o resumo continua dizendo
  "INCONCLUSIVO" sobre as peças fora das janelas.

## 3. Efeito esperado (dito antes, medido depois)

- **Produção**: toda peça com foto de fundo LIDA, sem região protegida no catálogo e sem assunto localizável pelo estimador vai ao
  humano com `texto-sobre-assunto:NAO_COMPROVADA`. A DIREÇÃO do efeito é certa (mais revisão humana); a MAGNITUDE não foi
  medida — o lote do piloto é controlado e não representa as fotos dos clientes (resumo, linha de limites), e nenhuma leitura
  de produção faz parte deste contrato. É o custo da decisão; só uma rodada com fotos reais (decisão 5.1) o mede.
- **Piloto** (rodada completa de 17/10 como base): das 50 peças medidas, 30 eram caso C e 24 APTAS; com a decisão, as 30 vão ao
  humano. PREVISÃO (sujeita à nova medição): APTAS = as 2 de catálogo + as 4 APTAS de sem-foto (das 6 peças sem foto, caso E —
  "sem foto de fundo" não é caso C e continua não se aplicando) = **6**. Falso APTO medido continua 0 (não há peça APTA nova). As 2 peças não medidas (foto real) continuam em § 3b, agora
  recusadas pelo gate — o indício desaparece porque a política mudou, não porque a medida ficou fiel.
- **Reversibilidade**: trocar a constante de volta é uma linha; os registros gravados com a política nova viram `historico` do
  mesmo jeito.

## 4. Gates do PR

Contrato revisado pelo Codex ANTES da implementação; implementação só no escopo acima; testes ajustados sem enfraquecer; rodada
nova do piloto (padrão + completo) no HEAD final com resumo versionado; typecheck; lint; `git diff --check <base>`; 3 validadores;
suíte completa sozinha; Codex APTO no HEAD final; CI e Vercel verdes; merge por merge commit com `--match-head-commit` (SHA
completo); CI da main verde depois.

## 5. Testes a ajustar (rodada exploratória: a constante trocada localmente, 9 arquivos dependentes rodados)

Falharam 12 testes em 4 arquivos (+ 4 de `gate-registro.test.ts` quando o leitor de teste passou à política efetiva) — nenhum por defeito do gate; todos por fixtures que carregavam a política ANTIGA ou por um
mock inconsistente. O ajuste é sempre "a fixture passa a dizer a política efetiva", nunca uma asserção afrouxada:

| Arquivo | Por que caiu | Ajuste |
|---|---|---|
| `revisao/__tests__/suporte/pagina-limpa.ts` (`entradaDa`) | monta o registro com `POLITICA_DO_ASSUNTO_RECOMENDADA`; os LEITORES (`gate-resumo`, `ver-geracao`, `auditar-operacao`) comparam com `POLITICA_DO_ASSUNTO_DO_GATE` → `historico` por `politica` | o registro de teste nasce com `POLITICA_DO_ASSUNTO_DO_GATE` (a efetiva) — `gate-resumo.test` (5), `auditar-operacao.test` (1) e `ver-geracao-retorno.test` (2) voltam a `coincidente`; o `ver-geracao` passa a esperar `politica`/`politicaComparada` = a efetiva |
| `lotes/__tests__/agendar-itens-gate.test.ts` (4 "presa → … a chamada seguinte não espera") | o mock (CONTEXTO e MEDIDA simulada) devolve SEMPRE `assuntoNaoSeAplica: 'a peça não tem foto de fundo'`, mas o `cenarioReal` TEM `bg-foto`: o gate vê a foto, lê o `naoSeAplica` como caso C e, com `humano`, manda ao humano (fail-closed correto para entradas contraditórias) | o mock passa a ser coerente com a página nos DOIS pontos (contexto e medida): com `bg-foto` devolve assunto de CATÁLOGO em `{x:0,y:900,w:1080,h:500}` — entre o apoio (y 560) e o serviço (y 1500), nenhuma caixa de texto o cruza —, sem foto devolve o `naoSeAplica` de hoje. As asserções `desfecho: 'criado'`, teto de 5 s, nenhum post e nada gravado na chamada que expira ficam como estão. **Teste novo** (prova do caminho efetivo): página com `bg-foto` cuja foto foi LIDA sem assunto localizável → `falhou`, `REVISAO_HUMANA_NECESSARIA`, `revisao` medida, `motivos = [texto-sobre-assunto:NAO_COMPROVADA]`, nenhum post; a mesma página com assunto de catálogo → `criado`; página sem foto (caso E) → `criado` |
| `gate-registro.test.ts` (política do LEITOR e H5) | o leitor de teste comparava com a RECOMENDADA; a linha de H5 que simulava "política diferente" usava justamente `semAssuntoLocalizavel: 'humano'`, que agora é a efetiva | o leitor compara com `POLITICA_DO_ASSUNTO_DO_GATE`; a divergência de H5 passa a ser a PROPOSTA antiga (`'nao-se-aplica'`) — registro gravado com ela vira `historico` |
| `gate.test.ts`, `corpus-do-gate.ts` (`POLITICA = RECOMENDADA`) | NÃO caíram: testam `gateDaMedida` com política explícita (as duas opções do caso C continuam no tipo) | sem mudança; `corpus-do-gate` continua a RECOMENDADA como política explícita dos testes do gate puro |
| `piloto-ponta-a-ponta.test.ts`, `piloto-ciclo.test.ts`, `ajustar-arte-*.test.ts`, `gate-registro.test.ts` | passaram com a política nova (as peças de fixture sem foto caem no caso E, "sem foto de fundo", que não depende da política) | nenhum |

Gate.ts: o caso E (sem foto de fundo) é decidido ANTES da política (`fotoDeFundo` do gate) — provado pelos testes acima que não
caíram. Nenhuma mudança em `gate.ts`.

## 6. Decisões que continuam do owner

| # | Decisão | Estado |
|---|---|---|
| B | `estimado` ('humano' proposta × 'comprova') | ABERTA — proposta vale |
| 2 | Janelas da fixture de 13/10 (anonimização × fidelidade) | ABERTA |
| 3 | Assinatura da fixture × piso de interface | ABERTA |
| 5.1 / 5.2 | Fotos reais do lote / lista de clientes | ABERTAS |
