# PLANO-MESTRE — Autonomia, direção de arte e manutenção do MCP (15/10/2026)

**Este é o roadmap único desta frente.** Ele resume decisões, registra dependências, dá a ordem dos
checkpoints e aponta para os documentos especializados. Não repete a documentação técnica: quem for
implementar lê o documento da área (índice em `AGENTS.md`) e o checkpoint aqui.

**Main auditada:** `69706ea2669dab82afbaa95261b70c8d2f2c63e4` (merge do PR #233, CP4.1). Esse commit
contém CP0, CP1, CP2A, T0, T1a, CP2B, CP3, CP4 e CP4.1. **Nada deste plano está implementado além
disso.** Todo "estado real" abaixo foi conferido no código dessa main por sete frentes de auditoria
somente leitura (seção 13) e consolidado pelo agente principal; o que não foi conferido está marcado
como tal. Os números de linha são do commit auditado e envelhecem; a fonte de verdade é o código.

Vocabulário (explicado uma vez):

- **Checkpoint (CP)**: uma entrega pequena, com PR próprio, revisão adversarial e Codex, que só avança
  quando a anterior está na `main` verde.
- **DRAFT_ONLY / draft-only**: o perfil efetivo da conexão MCP em que o agente autônomo (o Dot, no
  ChatGPT) só alcança a allowlist de tools de leitura + `compor-leva`, `ver-geracao`, `agendar-leva`,
  `revisar-arte`, `conferir-arte`, `ajustar-arte` e só cria rascunhos (`DRAFT`); aprovar, publicar e
  cancelar ficam com a pessoa. Detalhe: `docs/regras/dot-lagosta-operacao.md` (H4) e
  `src/lib/mcp/registro/perfil.ts` (`perfilDoPrincipal`, `TOOLS_DRAFT_ONLY`).
- **Gate**: um ponto de decisão determinístico que impede uma escrita quando a prova exigida não existe.
- **Fail-closed**: quando não foi possível medir, a resposta é "não aprovado", nunca "aprovado".
- **Veredito do gate**: o resultado do CP5: `APTO` ou `REVISAO_HUMANA_NECESSARIA`. Hoje esse código
  **não existe em produção** — só como texto do manual do Dot (`src/lib/mcp/operacao-dot.ts:84`) e em
  testes `hojeViola`. (O nome do campo persistido não deve ser `veredito`: esse nome já é vocabulário do
  feedback humano, `VereditoDeArte` em `src/lib/aprendizado/feedback-de-arte.ts`; ver 4.4.)
- **CAS**: escrita condicional ("compare-and-set"), só grava se o estado lido não mudou.

---

## 1. Linha de base — o que está CONCLUÍDO na main

Nota estrutural: `src/lib/direcao-de-arte/` tem **só testes** (oráculos, `hojeViola`, fixture do piloto).
A produção da trilha mora em `src/lib/compositor/` (arquétipos, régua, tratamento, logo) e
`src/lib/creatives/revisao/` (revisor, não-piora, executor de ajustes).

| CP | Objetivo (uma frase) | Garantia conquistada | Principal limitação que sobrou |
|---|---|---|---|
| **CP0** | Caracterizar a peça piloto por propriedades P1–P12 medidas por fora, com o renderer de produção, sem tocar produção. | Oráculos em `direcao-de-arte/__tests__/suporte/propriedades.ts`; `hojeViola` só aceita `AssertionError` — o que ainda viola fica marcado e nunca passa em silêncio; regra do CP0: cada CP troca `hojeViola` por `it()` no mesmo PR. | 12 `hojeViola` ativos (lista em 1.2); a fixture mede só 4 janelas; limiar 45 da logo "mantido até REA". |
| **CP1** | Nada em silêncio no executor de ajustes; diagnóstico correto de força/polaridade. | `revisao/contrato.ts` (`CAMPOS_DO_AJUSTE`, `problemaEstruturadoDoAjuste`: `CAMPO_FORA_DO_TIPO`, `SEM_EFEITO`…); `compositor/regua.ts` (`TOLERANCIA_DE_PIORA=2`, `pioraDaLeitura`). | Diagnostica, não corrige (serviço sem leitura com correção executável segue `hojeViola`); não há seção própria do CP1 em `docs/regras/`. |
| **CP2A** | Tratamento de leitura decidido por borda, com UMA polaridade para quem escolhe, quem detecta piora e quem mede. | `compositor/tratamento-de-leitura.ts` (`planejarTratamentoDaBorda`, `POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA`); `regua.ts` (`polaridadeDoTexto`). | Não move nada: A/A' dos sintéticos seguem `hojeViola` — são peças SEM arquétipo, e o CP2B não as alcança. |
| **T0** | Catálogo imutável e validado de 3 arquétipos minimalistas, sem ligação com o compositor. | `compositor/arquetipos/{catalogo,validar,impressao}.ts`; impressão `id@versao` travada por teste. | `minimal-fb-base-esquerda@1` está no catálogo mas **não compõe**: `ARQUETIPO_INDISPONIVEL` até T1b (`na-spec.ts:47-53, 266`). |
| **T1a** | Arquétipo opt-in na spec, no compor, no medir-copy, na fila e na recomposição, com uma fonte só de geometria. | `arquetipos/na-spec.ts` (portão único), `materializar.ts` (unidades, ornamentos presos), `no-compositor.ts`; 15 recusas `ARQUETIPO_*` antes da medida. | Elementos não desenhados (`elementosMaterializados: []`); recusa quadrado, `cta`, camada extra, modelo 2; área segura com arquétipo é `assinatura.pisoDoProjeto`. |
| **CP2B** | A foto escolhe corte e deslocamento por faixa dentro das zonas; eliminar antes de pontuar; a recomposição reproduz a escolha. | `arquetipos/{busca-espacial,candidatos-espaciais,pontuacao-espacial}.ts`; `escolhaEspacialOriginal` (`defasagem.ts`); `PREFERENCIA_INVIAVEL`. | Só vertical, só com arquétipo; o catálogo real não tem caixa de assunto — a região ESTIMADA é a única proteção; nenhuma escolha automática de arquétipo. |
| **CP3** | A logo só sai se ler contra o fundo real (p10 ≥ 45 nos pixels opacos), trocando variante/canto autorizados ou recusando. | `compositor/legibilidade-da-logo.ts` (pura + E/S), `logo-da-peca.ts` (passo 8b do `comporPeca`); regra `logo-sem-leitura` no revisor. | No legado (sem arquétipo) só sinaliza; +1 render por peça (~+42%); `fetchBuffer` sem timeout; logo em arranjo/fora do contrato é conserto no editor. |
| **CP4** | Todo ajuste de `ajustar-arte` é medido antes e depois em memória e recusado se piorar qualquer propriedade; uma escrita no fim. | `revisao/nao-piora.ts` (comparador puro, sem pontuação global), `ajustar-sem-piorar.ts` (mede com `corrigir:false`, catraca contra a entrada), `revisar-arte.ts` (`contextoDaMedicao` + `medirCamadasDaPeca` — UMA medição para revisor e executor); `AJUSTE_PIOROU_ARTE`, `AJUSTE_NAO_MEDIDO` (fail-closed), `AJUSTE_NAO_MELHOROU_O_ACHADO`, `CONTEUDO_NAO_PODE_SER_OCULTADO`. | Não é gate de aptidão: o ajuste aceito ainda reabre o render sem veredito da versão nova (P11 segue `hojeViola`, `piloto-ciclo.test.ts:615`); a comparação não enxerga oclusão por camada acima (4.3); custo 2 renders por ajuste (+1 da logo). |
| **CP4.1** | O agente não apaga copy por nenhuma sintaxe; `texto-pequeno` entra no não-piorar; foto lida sem assunto é "não se aplica", não "não medido". | Ver 1.1. | `texto-pequeno` exclui `headline`/`headline2` (CP4.2a); valor de tipo errado em `slotValues` é no-op silencioso (CP4.2b); auditoria durável da remoção humana depende do render (MCP-M5); oclusão por z-order não medida (CP5). |

**Perímetros das garantias duras hoje** (frente A): (a) com `spec.arquetipo` — T1a/CP2B/CP3 recusam;
(b) em `ajustar-arte` — CP4/CP4.1 recusam em qualquer perfil (`CONTEUDO_NAO_PODE_SER_REMOVIDO` só em
draft-only). **No compor legado (sem arquétipo), CP2A trata por borda, CP3 só diagnostica, e nada impede
a peça de sair**; não há portão de aptidão em lugar nenhum (`piloto-portao.test.ts:157-163` caracteriza
isso como comportamento atual). **Nenhum caminho que cria DRAFT chama `revisarArte`** (frente B).

### 1.1 CP4.1 — garantias novas (registradas)

1. **Draft-only não remove copy por `ajustes`**: `visibilidade: false` em texto com conteúdo →
   `CONTEUDO_NAO_PODE_SER_OCULTADO`, recusa estrutural do ajuste inteiro (CP4).
2. **Draft-only não remove copy por `slotValues`**: `hidden: true`, `""`, só espaço, `{ content: "" }`,
   também por `_slots`/`_papeis` → `CONTEUDO_NAO_PODE_SER_REMOVIDO`, antes de qualquer escrita
   (`copyRemovidaDoBake`, `src/lib/creatives/bake-layers.ts`; guard em `arte-rapida.ts` ~1224).
3. **Vazio, invisíveis e pontuação sem conteúdo não contornam o gate**: caracteres de formato
   (`\p{Cf}`, `Default_Ignorable_Code_Point`, braille em branco) são removidos antes de julgar; "." /
   "..." / "—" / "___" / "!!!" / "()" / "/" / "•••" são `sem-conteudo`.
4. **Texto substantivo usa Unicode**: letra (`\p{L}` menos modificadoras), número (`\p{N}`) ou
   pictograma/emoji (`Extended_Pictographic` menos pontuação/matemática/©®™, mais bandeiras e keycaps).
   Sem lista ASCII. `temTextoVisivel` (geometria/revisor) NÃO mudou.
5. **Remoção humana continua possível e auditada**: `copyRemovida` no retorno e em
   `Generation.fieldValues` com `escondido` / `esvaziado` / `sem-conteudo`; `camposAlterados` é só
   "texto trocado por outro texto".
6. **`texto-pequeno` de apoio/serviço entra no não-piorar** com a gravidade da própria regra
   (`max(0, piso1080 − corpo1080)`), inclusive quando o encolhimento vem do autofix.
7. **Foto realmente lida sem assunto localizável é diferente de falha na medição**:
   `CoberturaDaRegra.naoSeAplica` (sem foto; `assuntoOrigem: 'nenhum'` gravado para a mesma
   foto/corte/formato; mapa de calma sem região forte) → o comparador trata como inaplicável nos dois lados.
8. **Falha real de leitura continua fail-closed**: foto que não baixou / sharp que não leu → cobertura
   `nao-avaliada` sem a marca → `AJUSTE_NAO_MEDIDO`.

### 1.2 Dívidas da linha de base que os próximos checkpoints herdam

- `hojeViola` ativos — 12 pontos de chamada, 16 casos (os 4 de `piloto-portao` rodam em duas versões): sintéticos **A/A'** (polaridades incompatíveis na mesma borda, sem arquétipo),
  **G** (alinhamento à esquerda sobre a região protegida sem `PREFERENCIA_INVIAVEL`); piloto-compositor
  **P6** (texto/logo dentro do piso de interface do story 188/224 — a composição legada usa
  `assinatura.geometria.story` 250/350, "a reconciliar"), **P7** (ordem de leitura); piloto-ciclo
  `:554` (apta ou escalada em 2 ciclos), `:599` (correção executável), `:615` (P11 draft-only);
  piloto-portao `:190-205` (4 × P11 "não cria rascunho / devolve referências", em duas versões). **Os de P11
  só podem virar `it()` quando o gate estiver integrado em `agendar-leva` (CP5c) — eles chamam a simulação e
  a escrita do lote, não a decisão pura; P6/P7/A/G ficam para a trilha de design (seção 7) ou para a regra
  de piso de interface do CP5a.**
- `VERSAO_DAS_REGRAS = 'revisao-v1'` (`revisao/contrato.ts:27`) **nunca foi bumpada** após CP3 e CP4.1:
  como chave de invalidação é fraca por hábito, não por desenho (política no CP5b).
- `copyVersion` não existe em produção (só nos testes do piloto); `foraDaInterface` (piso 188/224)
  existe só no compositor e no oráculo, não é regra do revisor.
- `ajusteSchema` aceita `fontSize ≥ 8` e `escala ≥ 0,5` (`contrato.ts:109-110`) — o freio é a não-piora,
  não o schema.

---

## 2. Semântica de cobertura (vale para CP4, CP4.2 e CP5)

Onde nasce (frente A): `EstadoDaCobertura` e `CoberturaDaRegra` em `revisao/contrato.ts:53, 79-88`;
`avaliarPeca` (`regras.ts`) marca `avaliada` por padrão, `nao-avaliada` por regra quando a etapa não rodou
(logo, régua, título, assunto, visão, fontes, `motivoSemMedida`), `parcial` para fonte não cadastrada,
rich text e `textosSemMetrica`, e `naoSeAplica` hoje só em `texto-sobre-assunto`. Quem consome:
`nao-piora.ts` (`naoMedidas()`: `nao-avaliada` de um lado → `AJUSTE_NAO_MEDIDO`; `parcial` conta como
medida; `naoSeAplica` dos dois lados → `naoAplicaveis`), o executor (`semMetrica` por camada) e o piloto
(`regraMediu`). **A cobertura é por REGRA, não por camada**: uma camada de tipo que o revisor não mede
(`shape`/`svg-path`, frente G) sai **não contada**, não `nao-avaliada` — é a lacuna de oclusão (4.3).

Três estados que o gate NUNCA pode confundir:

| Estado | Significado | Exemplo já provado | Efeito no não-piorar (CP4) | Efeito no veredito (CP5) |
|---|---|---|---|---|
| **MEDIDO E APROVADO** | a regra rodou e não acusou | `fora-da-area-segura: avaliada`, sem achado | comparável | comprova |
| **NÃO SE APLICA** | a regra rodou e não tem objeto nesta peça | foto lida, mapa de calma sem região forte → `texto-sobre-assunto` com `naoSeAplica: true` (CP4.1) | inaplicável dos dois lados: não recusa | **não bloqueia por si** — a política por regra decide (4.2) |
| **NÃO FOI POSSÍVEL MEDIR** | download/render/análise falhou, fonte não carregou, camada sem métrica, regra que não existe para aquele tipo de camada | `o assunto da foto não foi estimado: HTTP 403`; régua `contraste === null`; `motivoSemFontes`; `shape` acima de texto | `AJUSTE_NAO_MEDIDO` (fail-closed) | `REVISAO_HUMANA_NECESSARIA` (fail-closed) |

Regra: **"não há" não é "não medimos"; "não medimos" nunca vira "aprovado"; e "não contamos" é "não
medimos"** (a regra do CP5 precisa enumerar o que ela não vê).

---

## 3. CP4.2 — PISO DA MANCHETE E ENTRADAS INVÁLIDAS (próximo)

Checkpoint pequeno, duas dívidas separadas, nada além delas.

### 3.1 CP4.2a — manchete pequena

**Hoje** (frente A): a regra 9 (`texto-pequeno`) pula os títulos em `regras.ts:1157`
(`if (idsDeTitulo.includes(m.layerId) …) continue`); `idsDeTitulo` (`:1059-1071`) é o papel
`headline`/`headline2` ou o maior corpo ≥ 1,5× o segundo. O não-piorar do CP4.1 herda a exclusão.
Consequência (documentada em `revisor-da-arte.md`): manchete 84 → 8 px não é detectada por esta
propriedade; as outras (colisão, safe area, leitura) continuam valendo.

**Objetivo:** impedir a deterioração da hierarquia do título. **Não inventar um mínimo universal isolado.**

**De onde o critério deve nascer** (contratos que JÁ existem; investigar e escolher no CP4.2):

| Contrato existente | Onde | Como serve |
|---|---|---|
| `referencias[id].fontSize1080` por camada — da variante da assinatura casada por papel ou da página-modelo por id | `revisar-arte.ts:166-225` (`referenciasDaPagina`), `ContextoDaMedicao.referencias` | a referência "do modelo" para a manchete |
| `LIMITES_DA_REVISAO.pisoRelativo = 0.8`, `pisoDeFonte1080 = 24`, `tituloRelativo = 1.15` e a fórmula do piso dos não-títulos | `regras.ts:224-227, 1160` | o `pisoRelativo` que o owner citou |
| Regra 7 `titulo-grande` já calcula `razao` contra a referência e um piso de escala | `regras.ts:1084-1103` | o lado "pequeno" é o espelho que falta |
| Escada de 80 % do compositor (unidade manchete + segunda voz) | `compositor/blocos.ts:310-320` | coerência com o que o compositor já aceita |
| Hierarquia headline × apoio/serviço — hoje só estrutural (ordem vertical, `servicoDisputaEntrada`); escala é telemetria (`K_REFERENCIA_HIERARQUIA = 1.25`, decisão do owner "sem K como hard gate") | `pontuacao-espacial.ts:141-149`, `propriedades.ts:381, 396` | a hierarquia a preservar sem transformar K em limiar |

Se o CP4.2a usar referência + `pisoRelativo` dentro da regra 9 para os títulos, o não-piorar o herda
automaticamente (`REGRAS_COMPARADAS` já contém `texto-pequeno`). Um modelo deliberadamente discreto não
pode receber um mínimo externo arbitrário: o piso é relativo ao modelo, como já é para apoio/serviço.

**Testes obrigatórios (futuros):** headline saudável → 8 px: recusa; headline → 50 % da referência:
recusa; redução pequena permitida quando necessária e ainda hierárquica; headline continua maior/prioritária
frente a apoio/serviço; `headline2` segue o mesmo conjunto hierárquico; modelo deliberadamente discreto
não recebe mínimo arbitrário externo.

**A fórmula final é decidida no CP4.2** (seção 10, decisão 3).

### 3.2 CP4.2b — `slotValues` inválidos

**Hoje** (caça-bypass do CP4.1): valor de tipo errado em `slotValues` — número, array,
`{ hidden: "true" }`, `{ visible: false }`, `{ content: 123 }` — é ignorado por `bakeLayers`
(`bake-layers.ts`: só string, `{ content: string }` e `{ hidden: true }` têm efeito), mas `temAjuste` é
verdadeiro (`arte-rapida.ts` ~1134): a página é regravada igual, re-renderizada, e a chamada responde
sucesso. Não perde copy; desperdiça render, mente para o agente e dificulta automação. O schema da tool
aceita `z.record(z.any())` (`mcp/catalogo/arte-ia.ts`).

**Planejar:** validação estrita do legado como o semântico já valida (`valorSemanticoValido`,
`src/lib/semantica/resolver-valores.ts`): valor inválido → `VALOR_INVALIDO` (código que já existe para
`_slots`/`_papeis`) → zero escrita → zero render. Decidir no CP4.2 se a validação entra no schema da tool,
no handler ou no bake — uma só fonte, antes do guard de copy.

**Fora do CP4.2:** qualquer outra coisa.

---

## 4. CP5 — GATE DE AUTONOMIA (em checkpoints pequenos)

### 4.0 O que o plano antigo dizia e o que a main já mudou

O documento `docs/research/CP5-GATE-AUTONOMIA-2026-10.md` (6 auditores + Codex R5 APTO) nasceu com a
main no CP2B (53eda0c9). A versão trazida para este branch recebeu, no topo, a nota "Atualização para a
main 69706ea2" com a tabela abaixo (frente B). O que continua válido não foi reescrito.

| O doc CP5 dizia | A main 69706ea2 hoje |
|---|---|
| CP3/CP4 "não presentes"; `ajustarArte` grava mesmo quando piora | CP3, CP4 e CP4.1 estão na main; `piloto-ciclo.test.ts:271` ("todos recusados → nenhuma escrita") é `it()`; só `:554` e `:615` (CP5d) seguem `hojeViola` |
| CP5b "medir sem banco já entregue pelo CP4" | confirmado (`contextoDaMedicao` + `medirCamadasDaPeca`); `copyVersion` e `foraDaInterface` continuam só em testes |
| `rulesVersion = VERSAO_DAS_REGRAS` invalida o veredito quando as regras mudam | `'revisao-v1'` nunca foi bumpada após CP3 e CP4.1 — chave fraca por hábito; o CP5b define a política (bump por PR que muda regra, ou hash das regras) |
| `texto-sobre-assunto` comprova SÓ com catálogo; "sem assunto → humano" | **o doc não conhece `naoSeAplica`** (CP4.1): seguindo-o à letra, todo story de fundo liso ou foto sem região forte iria ao humano para sempre. Política em 4.2 |
| Oclusão por forma/imagem acima do texto | **o doc não trata**; não há regra em `REGRAS_DA_REVISAO` (`contrato.ts:29-46`). Lacuna real — 4.3 |
| "Copy completa" só por `revisaoDaPaginaComCamadas` | CP4.1 acrescentou `copyRemovida` na Generation e `CONTEUDO_NAO_PODE_SER_REMOVIDO`; o gate pode usar `copyRemovida` como evidência extra |
| Chave `fieldValues.veredito` livre | tecnicamente livre, mas o NOME colide com o feedback humano (`VereditoDeArte`) e o crivo (`conforme/reprova`) — usar outro nome (ex.: `gate`) |
| Linhas citadas (`agendar-itens.ts:702, :569, :683, :755`; `arte-rapida.ts:1390, :1474`) | deslocadas; os pontos existem (criação `:702`, guarda do ligado `:569`, adoção `:686-688`, efeitos `:758`; FOR UPDATE `arte-rapida.ts:1438`) |
| `simular: true` só leitura | confirmado — o gate na simulação mede sem gravar |
| `efeitosPendentes` do item ligado é escrita sem gate | confirmado (`agendar-itens.ts:574`) — o doc § 7 já cobre |
| "toda tool da allowlist que cria DRAFT passa pelo gate" | hoje a allowlist tem uma só (`agendar-leva`); a asserção do doc § 14 ainda não existe — entra no CP5c |

### 4.1 CP5a — veredito puro

Função pura que recebe a MEDIDA completa (`MedidaDaPeca` + `RelatorioDaRevisao` + identidade), não só o
relatório, e produz `APTO` ou `REVISAO_HUMANA_NECESSARIA` com cobertura, achados e motivos. Sem banco, sem
DRAFT, sem gate ainda. Nada de produção a chama; só testes PUROS novos (fixtures de medida → veredito). Os
`hojeViola` de P11 em `piloto-portao` NÃO viram `it()` aqui: eles exercitam `agendar-leva` de ponta a ponta
e só passam com o gate integrado (CP5c).

Regras críticas mínimas (mapa para o que existe): fontes (`fonte-nao-carregada`); texto cortado
(`texto-cortado`); geometria (`tinta-fora-da-caixa`); colisão (`colisao`); safe area
(`fora-da-area-segura` + piso de interface do story 188/224 — hoje só no compositor/oráculo:
`foraDaInterface` vira função de produção ou regra do revisor); contraste (`texto-sem-leitura`);
tratamento que piora (`tratamento-piorou-leitura`); região protegida (`texto-sobre-assunto`, política em
4.2); logo legível (`logo-sem-leitura`, CP3); logo sem colisão (`logo-sobre-texto`); copy íntegra/completa
(reconciliação pura `revisaoDaPaginaComCamadas` em `sem-mudanca` + `lacunas` vazias, mais `copyRemovida`
da arte como evidência); piso/hierarquia (`texto-pequeno` de apoio/serviço hoje; manchete quando o CP4.2a
existir — por isso o CP4.2 vem antes); **oclusão** (4.3). Achado crítico é predicado executável: achado de
regra crítica com `certeza: 'medida'`, de qualquer severidade; `certeza: 'estimada'` conta como "não
comprovado"; a visão (`regra: 'visao'`) não entra.

### 4.2 Política para `texto-sobre-assunto` (decisão a aprofundar no CP5a)

| Caso | O que a medida diz | Recomendação técnica | Trade-off autonomia × segurança | Testes necessários |
|---|---|---|---|---|
| A. assunto do catálogo | `assunto.origem === 'catalogo'` | comprova (teto hard 0,25) | o mais seguro; depende de catálogo preenchido — o catálogo real hoje não tem caixa de assunto (frente A), então este caso é raro até o acervo ter caixas | sobreposição > 0,25 reprova; ≤ 0,25 aprova |
| B. assunto estimado | `origem === 'estimado'` (achado sai `certeza: 'estimada'`) | **não comprova por si** → humano, SALVO se o piloto sintético mostrar concordância estimado × catálogo em ≥ X % — então promover a "comprova com teto hard", em decisão explícita | mais bloqueios; evita aprovar texto em cima do prato por palpite | peça com estimado e sem sobreposição → humano (até a decisão); fixture com assunto real que o mapa não achou |
| C. foto lida, `assuntoNaoSeAplica = true` | mapa de calma sem região forte / `assuntoOrigem: 'nenhum'` gravado | **não se aplica → não bloqueia por si**; as outras regras decidem | ganho de autonomia em fotos lisas/texturas; risco: assunto real de baixo contraste que o mapa não vê | foto lisa com texto → APTO se o resto comprova; foto com assunto de baixo contraste → fixture, para medir o risco |
| D. erro ao analisar foto | `motivoSemAssunto` sem a marca | **não medido → humano** (fail-closed) | seguro | HTTP 403 / sharp falha → `REVISAO_HUMANA_NECESSARIA` com o motivo |
| E. peça sem foto | `naoSeAplica` por "sem foto de fundo" | não se aplica | — | peça só com fundo liso → não bloqueia |

**Não decidir por acidente**: B e C são a decisão 1 da seção 10; o CP5a implementa o veredito com a
política ESCOLHIDA e testes para os cinco casos.

### 4.3 Oclusão — lacuna crítica nova (entra no CP5a/CP5b, não no CP4.1)

**Estado real** (frentes A e G): o z-order existe nos dados (`Layer.order`) e o render o respeita
(`render-engine.ts:95`), mas `regras.ts` não lê `.order`; `colisao`/`logo-sobre-texto` são interseção de
caixas sem ordem; o revisor mede só `text`/`rich-text`, a foto de fundo e a logo — `shape`/`svg-path` e
imagens que não são o fundo são INVISÍVEIS para ele; e a régua de contraste tira a tinta dos textos e
renderiza TODAS as outras camadas, inclusive as acima do texto, como "fundo" (`regua.ts:342`): uma forma
opaca sobre a manchete pode até melhorar o p98 e nunca é acusada.

Antes de o gate declarar `APTO`, precisa existir UMA das duas garantias: **(A) medição determinística de
oclusão** (render do texto sem as camadas acima × com elas, ou interseção de caixas por z-order com a
tinta real); ou **(B) detecção do cenário não comprovável** — qualquer camada não-texto (forma, imagem
que não é o fundo, vídeo) com `order` acima de um texto que intersecta a caixa dele → não medido →
`REVISAO_HUMANA_NECESSARIA`. **Nunca "não medir → APTO".** Preferência: (B) no CP5a, barato e seguro
(é uma função pura sobre `Layer[]`); se o piloto sintético mostrar falsos bloqueios demais, (A) no CP5b.
Ligação com a trilha do editor: quando T1b materializar o fio/L do arquétipo, o acento tem de entrar
ABAIXO dos textos (order) e com `metadata.compositor` identificável, senão a própria peça do compositor
cai em (B). Decisão 2 da seção 10.

### 4.4 CP5b — persistência e identidade

Persistir o veredito como AUDITORIA/CACHE, não como autoridade: `Generation.fieldValues.<gate>` (nome
distinto de `veredito`) com `pageVersion` (`versaoDaPagina`, sem áudio — a mesma chamada do revisor),
`copyVersion` (hash `estavel` + sha256 do `copyAutoral`; `null` → `'sem-contrato'`), `rulesVersion`
(política de bump definida aqui), `resultado`, `cobertura`, `achados`, `medidoEm`, `origem`; gravado por
`mesclarFieldValuesDaArte` (merge no banco, regra 🔴 do `AGENTS.md`). Nenhuma migration (o Json basta).
**Veredito stale nunca autoriza nada**: toda decisão relê a identidade; o consumidor (`ver-geracao`,
`auditar-operacao`) compara as três versões e rotula "histórico" quando divergem.

### 4.5 CP5c — gate de `agendar-leva` (só perfil efetivo draft-only)

Fluxo humano continua WARN-ONLY. No draft-only, antes de novo DRAFT: medir (FORA da transação de 20 s)
→ veredito → identidade (`pageVersion` + `copyVersion`) → trava (`pg_advisory_xact_lock` + `FOR UPDATE`
que já existem, `agendar-itens.ts:647-669`) → reler identidade sob trava → só então
`criarPostDoAgendamento`. Falha → o item volta `situacao: 'falhou'` + `codigo: 'REVISAO_HUMANA_NECESSARIA'`
(o formato real de `ItemAgendadoDoLote`, via `falhou()`), com `generationId`, `pageId`, `editUrl`,
`achados`, `motivos`. Nenhum status novo. As três respostas (`criar` / `adotar` / `reaproveitar` com
`efeitosPendentes`) passam pelo gate como o doc CP5 § 7 descreve; a simulação mede e não grava. **É aqui
que os 4 `hojeViola` de P11 em `piloto-portao.test.ts` (duas versões) viram `it()`.**

**Reforços do relatório do Dot — entram como TESTES do CP5c** (estado real conferido pela frente F e B):

| # | Reforço | Estado hoje | O que o CP5c prova |
|---|---|---|---|
| 1 | `lembrete: true` em draft-only não gera mensagem/WhatsApp | **já verdadeiro**: `agendar-leva` grava DRAFT com `publishType: REMINDER`; o cron de lembretes exige `status: SCHEDULED` (`cron/reminders/route.ts:50-71`); `colocar-na-agenda` não existe no perfil; WAHA só para post ≠ DRAFT | teste que fixa: DRAFT REMINDER nunca passa pelo `sendPublishReminder` |
| 2 | Webhook/efeito externo não dispara por criação/edição autônoma | **já verdadeiro**: nenhum webhook de saída existe (o de lembrete por projeto foi removido); Zernio só com SCHEDULED; os únicos efeitos do draft-only são internos e idempotentes (sinais, pasta da semana, refila da página) | teste que fixa: espião de `sendToLater`/WAHA/Zernio nunca chamado no draft-only |
| 3 | `adotado` sobre post protegido: não altera, não duplica, não conta como DRAFT novo | **guardado** (`decidirPostsDaPagina` → `POST_APROVADO_INTOCAVEL` nas duas passadas); adoção de DRAFT bom existente não escreve no post | o gate decide se a adoção de um DRAFT existente reprovado fica "intocada" (última versão boa) |
| 4 | Post aprovado entre medida e commit: recusa | **parcial**: a 2ª `decidirEscrita` sob trava recusa `POST_APROVADO_INTOCAVEL`; falta comparar a identidade medida | identidade relida sob trava ≠ medida → `REVISAO_HUMANA_NECESSARIA` |
| 5 | Worker pós-commit revalida a condição de segurança | render, envio, recomposição e fila já revalidam por CAS; `executarEfeitos` relê o post mas não a página | rechecagem de identidade antes de `efeitosPendentes` (doc § 7) |
| 6 | `laterPostId` presente: intocável | **guardado** em 5 lugares (`postAprovado`, `decidirPostsDaPagina`, `responderLigado`, `invalidate-renders`, `ajustarArte`) | teste de regressão |
| 7 | Tool nova fora de `TOOLS_DRAFT_ONLY` até decisão explícita | **guardado** (`perfil-draft-only.test.ts:206` "tool nova nasce proibida"); **mas** tool nova DENTRO da allowlist que criasse DRAFT não passaria pelo gate | asserção "toda tool da allowlist que cria DRAFT passa pelo gate" (doc § 14) |
| 8 | Argumento do agente nunca altera o próprio perfil | **guardado**: `porta.ts:59`, `compositor.ts:727`, `arte-ia.ts:214/237` leem só `principal`; único "modo" alternativo é env do processo stdio | teste de regressão |

Reusar `perfilDoPrincipal`, `TOOLS_DRAFT_ONLY`, `guardas-draft-only.ts` (`assertPaginaSoEmRascunho`,
`postAprovado`), `decidirPostsDaPagina({ apenasRascunho })`, `horarioOcupado`. **Não reconstruir o H4.**

> **Estado em 16/10/2026 (noite)** — contrato `docs/PLANO-2026-10-16-CP5C-CONTRATO.md` (PR #241, Codex APTO na
> rodada 9) e implementação no PR #242. O desenho MUDOU em relação ao parágrafo acima, pela revisão do Codex (R2/R3
> do contrato): a medição acontece **DENTRO** da transação, sob as travas (agenda → fontes → ItemDeLote →
> ItemDePlano → posts da página `ORDER BY id` → Page → Generation da peça → FOR SHARE Project/assinatura/modelo/
> CustomFont) — não existe "reler identidade sob trava", porque medir e escrever são a mesma leitura; o registro
> (APTO ou não) é gravado na mesma transação; os efeitos pós-commit NÃO rodam no draft-only (proposta 8.7 B, do
> owner); `reaproveitar` não declara veredito. Os 8 `hojeViola` de P11 viraram `it()` com a medição real. As
> decisões 8.1–8.9 do contrato seguem do owner, implementadas como PROPOSTA nomeada. A tabela de reforços acima:
> 1, 2, 6, 8 fixados por teste (C11, inventário, C12); 3 e 4 resolvidos por trava (C5b, C19); 5 deixou de existir
> (no draft-only não há worker pós-commit do agendamento); 7 virou o inventário C9 (por código-fonte).
Limite a dizer ao owner (fora do CP5): um cliente OAuth novo nasce `normal`, e o `clientId` do ChatGPT é
compartilhado com humanos — o gate fail-closed só vale onde o perfil é draft-only.

### 4.6 CP5d — `ajustar-arte` autônomo

CP4/CP4.1 garantem "não piorou"; isso NÃO é "está apta para agendamento". No draft-only, depois de um
ajuste aceito pela não-piora: medir a versão final (a candidata já medida) → veredito CP5. Se não APTO:
não substituir a última versão boa quando a política exigir preservação (`REVISAO_HUMANA_NECESSARIA`,
nada gravado, render não reaberto). **Definir exatamente a fronteira transacional antes de implementar**:
o CP4 já grava página + trava numa transação e renderiza depois; o veredito tem de ser decidido ANTES
dessa transação, sobre a candidata medida, e o ajuste PARCIAL (texto/foto + ajuste recusado) que hoje grava
e reabre o render (`arte-rapida.ts:1308`) precisa da mesma decisão. Humano continua warn-only + CP4.
`piloto-ciclo.test.ts:615` vira `it()`.

### 4.7 CP5e — provas de autonomia

Ponta a ponta sintético: compor → revisar → ajustar → revisar → agendar DRAFT. Casos: APTO → DRAFT;
não APTO → nenhum DRAFT novo; edição concorrente → recusa; DRAFT anterior bom → preservado; post
aprovado → intocável; regra não medida → humano. Sem publicação, sem lembrete, sem webhook, sem alteração
de agenda protegida. Mais: `ver-geracao`/`auditar-operacao` expõem o veredito com rótulo atual/histórico;
manual do Dot e docs.

### 4.8 Checkpoint após CP5e — piloto SINTÉTICO de autonomia

Ainda NÃO cliente real. Lote sintético representativo (fixtures por cliente: fotos reais já no Blob de
teste, assinaturas reais, com e sem arquétipo) medindo: taxa APTO; motivos de revisão humana (por regra);
falsos bloqueios; custo (renders por peça — hoje 3–4 por composição e 2 por ajuste); estabilidade;
repetibilidade (mesma entrada → mesmo veredito). O resultado alimenta as decisões 1 e 2 da seção 10. Só
depois discutir piloto real (seção 9).

---

## 5. Trilha MCP-M — manutenção segura das FONTES (somente DEPOIS do CP5)

A auditoria operacional do Dot (relato do owner, 15/10) trouxe um problema que não se mistura ao CP5:
a manutenção das fontes que alimentam a arte (Base, Marca, modelos, DRAFTs). Trilha separada,
MCP-M0 → MCP-M5.

**Achado factual TERO (projeto 3):** o `content` da entrada de horários estava correto e `dados.horarios`
ficou antigo — duas representações do mesmo fato divergiram. **Não criar lógica especial para TERO**: é
fixture/caso de aceitação futuro (seção 6). **Pelo código, a divergência é esperada** (frente C):
`atualizar-entrada-base` com `content` novo mantém os `dados` antigos (`metadataDaEdicao`,
`marca-de-indexado.ts:281` — e o teste `metadata-do-sistema.test.ts:177` ASSEVERA isso); o painel nunca
envia `metadata`; o treinamento substitui `dados` pelo que o gpt-4o extraiu (`z.record(z.any())`, sem
schema); ninguém deriva `dados` de `content` nem confere coerência; o índice vetorial indexa só `content`.

**As ferramentas já existem.** O relatório do Dot enxergava só as tools do perfil draft-only. O catálogo
normal já tem `atualizar-dna`, `virar-regra`, `criar-entrada-base`, `atualizar-entrada-base`,
`arquivar-entrada-base`, `listar-modelos`, `marcar-como-modelo`, `editar-post`, `trocar-arte-do-post`,
`reagendar-post`, `cancelar-post`, `voltar-para-rascunho` (e mais). **Não criar duplicatas sem
auditoria**: o problema costuma ser contrato insuficiente OU tool propositalmente fora do perfil.

### 5.0 MCP-M0 — inventário

Auditar tools, aliases, handlers, APIs do painel, serviços internos, autorização, versões, indexadores,
caches e consumidores, e produzir a matriz CAPACIDADE × EXISTE? × ONDE? × QUEM USA? × PERFIL NORMAL? ×
DRAFT_ONLY? × FALTA QUAL GARANTIA?. As frentes C, D, E e F já produziram a primeira versão (resumo abaixo;
detalhe nos relatórios das frentes, seção 13). O MCP-M0 a confirma no código do momento, fecha o que ficou
"não conferido" e acrescenta os aliases e a camada inglesa do stdio.

| Capacidade | Existe? | Onde (porta) | Normal | Draft-only | Garantia que falta (resumo) |
|---|---|---|---|---|---|
| Ler base | sim | `consultar-base` | ✔ | ✔ | teto de tokens; `dados` sem as marcas da indexação (`dadosDe` vaza `indexadoEm`, `chaveDoFato`…); vigência pela data da peça no RAG |
| Criar / atualizar texto da base | sim | `criar-entrada-base`, `atualizar-entrada-base`, rotas `/api/knowledge*` | ✔ | ✘ | CAS do chamador (`expectedUpdatedAt` — o `updatedAt` já é devolvido), dry-run, diff, histórico |
| Atualizar `dados` da base | **parcial** | só PUT web com `metadata` (substitui tudo) e o confirm do treinamento (`preview.metadata ?? null` **apaga** `dados`) | ✔ (rota) | ✘ | tool MCP; patch parcial; ausente ≠ null ≠ vazio ≠ remover; schema por categoria |
| Ler DNA / voz | sim | `consultar-dna`, `consultar-voz` | ✔ | ✔ | `consultar-dna` não diz qual campo manda na copy e devolve `toneOfVoice` cru no cliente migrado |
| Atualizar DNA | sim | `atualizar-dna` → `updateBrandDNA` | ✔ (qualquer membro visível; a rota HTTP exige `hasProjectWriteAccess`) | ✘ | mescla por campo mas SUBSTITUI a seção citada inteira (apaga "Regras aprendidas"); sem confirmado/dry-run/diff/CAS/histórico; grava `toneOfVoice`/`contentRules` no migrado sem avisar |
| Virar regra | sim | `virar-regra` | ✔ | ✘ | texto no migrado tem o molde certo (proposta → confirmado, CAS, conflito, trava); visual/legado só avisa conflito, sem CAS |
| Editar números da assinatura (`Project.assinatura`) | **não** | só scripts | — | — | nenhuma rota/tool; sem versão, diff, log |
| Ler camadas completas de um modelo com versão | web sim / MCP só stdio | `GET .../template-pages`; `get-template-pages` (stdio) | ✔ | ✘ | tool remota (layers + `versaoDaPagina`) |
| Patch de camada por `layerId` | só web | `PATCH /api/pages/[pageId]/layers/[layerId]` (merge por spread, CAS interno, revisão de copy, invalidação) | — | — | porta MCP com gate curador; `versaoEsperada` de conteúdo |
| Marcar/despromover modelo | sim | `marcar-como-modelo` (curador), toggle no editor | ✔ | ✘ | tags substituem sem mostrar; sem "quem usa este modelo"; sem histórico/reversão de camadas de modelo |
| Editar caption / data / cancelar / reverter post | sim | `editar-post`, `reagendar-post`, `cancelar-post`, `voltar-para-rascunho` | ✔ | ✘ | **sem CAS** `where {status: DRAFT, laterPostId: null}` (aprovação/envio entre leitura e escrita); sem `PostLog` |
| Trocar arte do post | sim | `trocar-arte-do-post` (CAS, PostLog EDITED) | ✔ | ✘ (só `ajustar-arte`, na página) | — |
| Reordenar slides | **não** | só PUT web / EN `update-post` | — | — | não há tool |

### 5.1 MCP-M1 — Base íntegra

Estado real (frente C): `KnowledgeBaseEntry` não tem coluna `dados` — "dados" é `metadata` menos as chaves
do sistema (partição em `marca-de-indexado.ts`); sem versão nem histórico; `consultar-base` devolve
`dados` (desde 12/09) mas **ninguém além dela lê `dados`** — todos os consumidores (RAG com teto 1200
tokens, sugerir-posts, dica de copy, chat, crivo…) leem `content`; compositor, copy-autoral, lotes e
direção de arte não leem a base. Validação de `dados` por categoria: não existe.

Planejar `content + dados` como atualização coerente/atômica NA TOOL EXISTENTE (`atualizar-entrada-base`,
que já grava por `editarEntradaCoordenada` com CAS interno e reindexa sob arrendamento): `dados` como
parâmetro com semântica explícita (ausente = mantém; `null` = remove; objeto = patch por chave ou
substituição declarada); `expectedUpdatedAt`/CAS do chamador; dry-run com diff `content`/`dados`/validade;
preservar não citados; schema zod por categoria OU derivar `dados` de `content` na gravação e recusar
divergência; histórico mínimo para recuperação; `dadosDe` limpo das marcas do sistema; indexação e cache
como hoje. **Não inferir**: funcionamento geral, happy hour, promoção, serviço e vigência são fatos
diferentes (entradas/categorias diferentes).

### 5.2 MCP-M2 — Marca / Voz / DNA

Estado real (frente D): a precedência mora num lugar só (`precedenciaDaVoz`, `src/lib/brand/voz.ts`);
no cliente migrado a voz manda em TODO consumidor de copy; **nos prompts de IMAGEM, `contentRules` do DNA
entra sempre, mesmo migrado** (por desenho: "proibição não é estilo"); compositor e revisor não leem
marca de texto (o compositor lê `Project.assinatura`). **"Arquivado" é só rótulo**: a migração não congela
o DNA; `atualizar-dna`/PATCH gravam `toneOfVoice`/`contentRules` sem olhar `migradaEm` — `toneOfVoice`
fica dormente e ressuscita com `desfazerMigracao` (só por script); `contentRules` vale na hora para a
arte. `virar-regra` de texto no migrado já tem o molde certo (proposta → confirmado, CAS `versaoDaVoz`,
`CONFLITO_DE_REGRA`, trava do projeto). Duas casas para "regra de arte" (`voz.regras[arte]` e
`DNA.contentRules`), somadas nos prompts.

Planejar: endurecer `atualizar-dna` com confirmado + antes/depois por seção + token de versão (padrão do
`virar-regra`); recusar ou alertar `toneOfVoice`/`contentRules` no cliente migrado dentro de
`updateBrandDNA` (relendo `migradaEm` sob a trava do projeto); `consultar-dna` dizer a `fonte` e rotular o
texto arquivado; gate de escrita no conector espelhando `hasProjectWriteAccess`; histórico mínimo antes
de `updateBrandDNA`. Não reativar automaticamente `toneOfVoice`/`contentRules` arquivados. O domínio
visual (`composition`, `visualStyle`, `photoDirection`, `approvalChecklist`) é distinto e hoje é prosa
livre sem validação de shape. Endurecer as tools existentes; não duplicá-las.

### 5.3 MCP-M3 — Assinatura / modelos

Estado real (frente E): modelo = `Page.isTemplate`; arte de modelo é CÓPIA (editar o modelo depois não
altera artes criadas); posts que apontam direto para a página-modelo sofrem re-render em cascata e os
entregues ao Zernio ficam congelados. Assinatura em duas casas: ESTILO = páginas do template chamado
literalmente `Assinatura`; NÚMEROS = `Project.assinatura`, **sem rota nem tool de escrita** (só scripts).
O editor grava camadas inteiras por fila com CAS em `updatedAt` ("último a gravar vence"); o único patch
por `layerId` é a rota web `PATCH /api/pages/[pageId]/layers/[layerId]` (merge por spread, preserva não
citados, revisão de copy, invalidação, recomposição) — sem versão do cliente e sem porta MCP. Para camadas
de um modelo não há histórico nem reversão. `replacePageContent` (PR #226) **não está nesta main**.

Planejar, reutilizando o editor: tool remota de leitura completa (layers + `versaoDaPagina`); escrita por
`layerId` no MCP com `versaoEsperada` de conteúdo (padrão `VERSAO_DIVERGENTE` do `ajustar-arte`) e gate
**curador** (`assertCuradorDoProjeto`), não alargando a allowlist; porta de escrita para
`Project.assinatura` com versão, diff e log; diff de camadas antes/depois; "impacto" antes de gravar
(posts que apontam, artes derivadas, se é variante da assinatura); histórico/reversão de camadas de
modelo. **`ajustar-arte` não é bypass para página-modelo** — confirmado: `PAGINA_E_MODELO` na leitura e
`isTemplate: false` na escrita (`arte-rapida.ts:1194, 1451, 1495`), também em `recompor`, `reverter` e
`trocar-arte-do-post`.

### 5.4 MCP-M4 — edição de DRAFT

Estado real (frente F): `editar-post` (só DRAFT), `trocar-arte-do-post` (CAS + PostLog EDITED),
`reagendar-post`, `cancelar-post` e `voltar-para-rascunho` (Zernio primeiro) já existem e já cobrem a
edição de DRAFT com recusa de aprovado — mas `editarPost`, `reagendarPost`, `cancelarPost` e o REVERT
**gravam sem CAS** (`findUnique` + `update where { id }`): aprovação ou envio entre a leitura e a escrita
altera post SCHEDULED, ou zera um `laterPostId` recém-gravado (publicação fantasma). Nenhuma dessas ações
deixa `PostLog`. Não existe tool para reordenar slides. No draft-only, o agente não tem caminho para
corrigir o próprio rascunho além de `ajustar-arte` (a leva recusa caption/data diferentes como conflito).

Auditar `editar-post`, `trocar-arte-do-post` e `agendar-leva` ANTES de qualquer tool nova. Capability
autônoma futura limitada a DRAFT: caption, mídia, slides/ordem, `pageId`, data pretendida — obtida
endurecendo as tools existentes (CAS `where {status: DRAFT, laterPostId: null}`, `PostLog EDITED`,
reaproveitando `postAprovado`/`CODIGO_POST_APROVADO`) e decidindo explicitamente quais entram em
`TOOLS_DRAFT_ONLY`. Nunca por essa capability: aprovação, publicação, cancelar protegido, reagendar
aprovado, voltar aprovado para DRAFT, mensagem, webhook. Toda escrita nova de `Page.layers` continua
chamando `invalidateScheduledRenders` + `pedirRecomposicaoDaArteCongelada`.

### 5.5 MCP-M5 — auditoria e recuperação

Residual do CP4.1: a `copyRemovida` humana gravada na Generation depende de o render concluir; página
alterada + render falho deixa a auditoria durável incompleta. Mais achados das frentes: aprovar/reverter/
reagendar/editar pelo conector não deixam `PostLog`; escrita de DNA/voz/base sem histórico; o webhook
`post.failed` do Zernio grava FAILED sem avisar e o `syncLateStatus` nunca mais vê o post.

Planejar recuperação transversal com a regra: toda mutação é identificável, auditável, segura sob
concorrência e recuperável. **Não impor um "backup novo"** se já houver histórico suficiente: reusar
`layersSnapshot`, Generations, `PostRenderProof` (append-only por mídia), `copyAutoral.revisoes`,
`LearningSignal`, `PostLog`, logs e o versionamento existente (`versaoDaPagina`; `updatedAt` como CAS).
Snapshot novo só onde faltar histórico (as Generations de ajuste não guardam camadas; camadas de modelo;
DNA/voz/base).

---

## 6. TERO (projeto 3) — caso de aceitação FUTURO

Não tocar agora. Fato operacional a RELER no futuro: funcionamento todos os dias, 11h30–23h30. Os textos
já corrigidos não devem ser alterados de novo se continuarem corretos. Pendência conhecida: os dados
estruturados (`dados`) da entrada de horários (o conteúdo real do `metadata` da entrada não foi conferido
nesta auditoria — só o mecanismo que produz a divergência, 5.1). Antes de qualquer escrita futura: reler
Base, reler `dados`, reler voz, reler modelos, produzir diff, pedir autorização. Não alterar happy hour,
promoções, vigências, grade nem agenda por inferência.

---

## 7. Trilha do editor (separada da trilha de segurança/autonomia)

**Aviso de fonte** (frente G): as fases V0/X0/X1/X2/V1/V2/V3/T2/T3 **não estão em nenhum documento
commitado**. Moram em `docs/research/canva-minimal-editor-2026-10/` (10 arquivos), pasta **untracked no
checkout compartilhado e nunca commitada em branch nenhum**; `docs/design/arquetipos-minimalistas-v1.md`
cita essa pasta como fonte dos números. A "página de decisões" do owner (artifact com d01–d11) não foi
acessada. **Primeira ação desta trilha: commitar essa pasta (ou o que dela vale) e registrar o desvio
plano × entregue do T1a** — hoje o único mapa das fases vive num diretório que um `git clean` apaga. Este
plano não a commitou (decisão de escopo: a pasta não foi revisada por esta auditoria).

Estado real: T0, T1a, CP2B e CP3 entregues (seção 1). Arquétipo nunca é escolhido pelo sistema (parâmetro
explícito; o Dot escolhendo é CP-T6). Desvio plano × entregue: o plano previa `preferencias.arquetipo`
com zonas como alvo de QA com aviso; o entregue é `spec.arquetipo` com impressão, zonas HARD, busca
espacial e recusa de conflito — o doc commitado é a fonte válida.

| Fase | O que é | Estado | Depende de |
|---|---|---|---|
| **CP-X0** | guarda do push do desktop (PUT preserva `style`/`metadata` por id, não apaga páginas ausentes — hoje `deleteMany`) | só plano | decisão d02 |
| **CP-X1** | `/gerar-criativo` sem retângulo (hoje a prévia desenha `svg-path` como `Rect` e o `finalize` publica) | só plano | CP-V0, d03 |
| **CP-X2** | validação de `svg-path` nas 4 portas (`pathData` ≤ 16 KB, cores por `lerCor`); toca `layer-contract.ts` que `reverter-arte` usa (PR #225) | só plano | CP-V0 |
| **CP-V0** | traçado único editor ↔ servidor (hoje: editor ignora `pathFillRule`; servidor divide o contorno pela escala média — diverge em caixa não quadrada; dois parsers; miniatura sem `Path2D`); inventário de pixel antes do deploy, `laterPostId` intocável | `traceSvgPath` é o embrião | spike do parser no Node |
| **V1** | primeiras melhorias pequenas de UI: flip + proporção de forma (`style.flipH/V`, `manterProporcao`) | `flipH/flipV` já no tipo (imagem) | CP-V0 |
| **V2** | **primeira grande mudança visível: painel Elementos** ("Formas" → "Elementos", `ShapeDefinition` estendida, 10 itens MVP, cor pelo papel em `style.vetor`) | `shapes-panel`, `elements-panel`, `shapes-library` (não renomear ids: as máscaras dependem) | V0, X0, X1, X2 |
| **V3** | cores por slot (Marca → Nesta página → Personalizada) | `hex-color-field` órfão | V2 |
| **T1b** | materializar `fio-fino`, `moldura-aberta` (o L de `minimal-fb-base-esquerda@1`) e `spark-4` | ver dependência abaixo | T1a ✔ |
| **T2** | aba **Layouts / "Usar layout"** (3ª aba, `POST .../pages/from-layout`, `comporPeca(spec, { somenteAvaliar })` → página nova com tags `layout`/`arquetipo:<id>`; "aplicar na aberta" só via `replacePageContent`) | `somenteAvaliar` e `prepararCamadasParaGravar` existem; **PR #226 (`replacePageContent`) não está na main** | T1b, PR #226 |
| **T3** | foto em caixa (máscara `arco-janela`/círculo) — não existe no compositor | `style.mask` nos dois renderers | T1b, d04 |
| T4/T5/T6, V4–V7 | catálogo completo, promover layout, Dot escolhendo arquétipo; toolbar/celular, multicor, importador SVG, `BrandColor.papel` | — | encadeados |

**Dependência exata do T1b** (frente G): **não é tipo de camada nem render server** — `shape` com
`shapeType: 'svg-path'` existe no tipo, no editor e no servidor. Falta só código do compositor: (a) o
módulo que materializa os três elementos em `Layer[]` com `pathData` próprio; (b) resolver
`corPorPapel: 'texto' | 'destaque'` pela assinatura (não existe resolvedor de papel de cor para vetor);
(c) o "presoA" — e a infraestrutura de ornamento preso que precisa caber na zona **já existe**
(`materializar.ts`, `candidatos-espaciais.ts`, `pontuacao-espacial.ts`). A amarração do plano untracked a
CP-V2 é escolha de arquitetura (catálogo único), não necessidade técnica. Risco: contorno fino é onde o
traçado diverge hoje — desenhar o acento como PREENCHIMENTO (`fill`), não `stroke`, evita depender do
CP-V0. **Não desbloquear por atalho**: a decisão "T1b antes ou depois do CP-V2" é do owner (seção 10,
decisão 6).

**O que NÃO se mistura com o CP5**: V1, V3, V4, a interface do V2 e T2 são só UI. O que o CP5 consome do
editor é o contrato de camadas que o revisor sabe medir — e hoje `shape`/`svg-path` é invisível para ele
(4.3): T1b precisa entrar com o acento ABAIXO dos textos e identificável; CP-X2 toca `layer-contract.ts`
(coordenar com `reverter-arte`); CP-V0 muda o pixel de artes já medidas (`PostRenderProof`, não-piorar) —
rodar após inventário, nunca no mesmo PR de um CP5; `elementosMaterializados` passa de `[]` a lista no T1b
e é gravado por merge (`mesclarFieldValuesDaArte`).

---

## 8. Ordem mestra

| Fase | Checkpoints | Pré-requisito |
|---|---|---|
| CONCLUÍDO | CP0, CP1, CP2A, T0, T1a, CP2B, CP3, CP4, CP4.1 | main `69706ea2` |
| PRÓXIMO | **CP4.2** (a: piso da manchete; b: `slotValues` inválidos) | main verde |
| DEPOIS | **CP5a** veredito puro → **CP5b** persistência/identidade → **CP5c** gate de `agendar-leva` → **CP5d** `ajustar-arte` autônomo → **CP5e** provas | CP4.2 na main; cada um na main antes do seguinte; decisões 1 e 2 tomadas no CP5a |
| DEPOIS | **piloto sintético de autonomia** | CP5e na main |
| DEPOIS | **MCP-M0** inventário → **M1** Base → **M2** Marca → **M3** modelos → **M4** DRAFT → **M5** auditoria/recuperação | piloto sintético satisfatório; decisões 4 e 5 |
| DEPOIS | **piloto factual TERO**, somente com autorização explícita | MCP-M1 na main; seção 6 |
| EM TRILHA SEPARADA | commitar a pesquisa do editor → CP-X0/X1/X2 → CP-V0 → V1 → V2 → V3 → T2 → T3…; **T1b entra antes ou depois do CP-V2 conforme a decisão 6** (tecnicamente depende só de T1a) | documentos do editor (seção 7); nunca bloqueia nem é bloqueada pelo CP5; coordena com ele só em CP-X2, CP-V0 e T1b |

---

## 9. Critério para voltar a piloto REAL

Não voltar a cliente real porque os testes ficaram verdes. Antes: (1) CP4.2 encerrado; (2) CP5a–e
encerrados; (3) main verde; (4) piloto sintético satisfatório; (5) taxa de bloqueios entendida (por regra
e por cliente); (6) nenhuma publicação possível pelo agente (allowlist + gate + `laterPostId`); (7)
última versão boa preservada; (8) owner autoriza explicitamente. Primeiro piloto real: um cliente, uma
peça, composição controlada (com arquétipo, foto com caixa de assunto se houver), DRAFT_ONLY, inspeção
humana antes de qualquer ampliação.

---

## 10. DECISÕES A TOMAR NO CHECKPOINT CERTO

| # | Decisão | Onde se decide | Evidência necessária antes de decidir |
|---|---|---|---|
| 1 | Política do CP5 para `texto-sobre-assunto`: catálogo × estimado × nenhum assunto (`naoSeAplica`) × falha × sem foto | CP5a | concordância estimado × catálogo medida num lote sintético; taxa de bloqueio por caso (4.2) |
| 2 | Estratégia de oclusão: detecção do cenário (B) primeiro, ou medição determinística (A) | CP5a (B) / CP5b (A) | quantas peças reais têm camada não-texto acima de texto; custo de render da medição (4.3) |
| 3 | Piso/hierarquia exato da headline (CP4.2a) | CP4.2 | distribuição de corpos de headline × referência por assinatura; o que `pisoRelativo` e a regra 7 já cobrem (3.1) |
| 4 | Quais capabilities MCP-M poderão ser autorizadas ao agente, e com que perfil (draft-only ampliado × perfil curador × só humano) | MCP-M0 | matriz do inventário confirmada; CP5 encerrado |
| 5 | Manutenção de Base/Marca: só humana via MCP; agente com confirmação; ou outro perfil separado | MCP-M1/M2 | MCP-M0 + o relato de TERO reproduzido como fixture (5.1) |
| 6 | T1b antes ou depois do CP-V2 (acento com path inline no compositor × item do catálogo de vetores) | trilha do editor | a pesquisa do editor commitada e revisada; decisões d01–d11 do owner |
| 7 | Política de `rulesVersion` (bump manual por PR que muda regra × hash das regras) | CP5b | — |

Nenhuma dessas decisões está tomada neste plano. Onde o texto acima diz "recomendação", é recomendação
técnica para a discussão, não decisão.

---

## 11. Limites conhecidos deste plano (dito para não parecer garantia)

- O risco "Dot em perfil normal" (cliente OAuth novo nasce `normal`; `clientId` do ChatGPT compartilhado
  com humanos) fica fora do CP5: o gate só vale onde o perfil é draft-only (`dot-lagosta-operacao.md`
  § perfil efetivo).
- `/api/external` (Claudinho), crons, UI e a camada inglesa do stdio ficam fora da porta MCP: são
  warn-only por decisão do owner.
- Nenhuma das sete frentes executou testes ou tocou o banco; as afirmações "prova" citam o teste pelo
  nome e linha. O conteúdo real do `metadata` da entrada TERO, as decisões d01–d11 do editor e os
  arquivos da pesquisa untracked não foram conferidos por este plano.

---

## 12. Documentos de referência (apontados, não copiados)

- `docs/regras/compositor.md` — compositor, assinatura, arquétipos (T1a, CP2B, CP3), modelos da marca.
- `docs/regras/revisor-da-arte.md` — revisor, CP3, CP4, CP4.1 e as pendências registradas.
- `docs/regras/dot-lagosta-operacao.md` — o Dot, H4 (DRAFT_ONLY), perfil efetivo, dívidas.
- `docs/regras/mcp.md`, `docs/regras/marca-voz-e-base.md`, `docs/regras/modelos.md`,
  `docs/regras/publicacao-e-agenda.md`, `docs/regras/lotes.md`.
- `docs/design/arquetipos-minimalistas-v1.md` — T0/T1a/CP2B/CP3 e próximos checkpoints.
- `docs/research/CP5-GATE-AUTONOMIA-2026-10.md` — o plano detalhado do CP5 (trazido neste branch, com a
  nota de atualização para a main 69706ea2).
- `docs/PLANO-2026-10-13-DOT-OPERACAO-H1.md` — gaps e dívidas do Dot (H1–H6).
- `docs/PLANO-EVOLUCAO-EDITOR.md`, `docs/PLANO-2026-10-02-LINHA-DO-TEMPO-NO-EDITOR.md`,
  `docs/research/studio-*.md` — trilha do editor; a pesquisa de vetores/arquétipos ainda está untracked
  (seção 7).

---

## 13. Como este plano foi produzido

Sete frentes de auditoria somente leitura sobre a main `69706ea2`, em paralelo — A qualidade/direção de
arte CP0→CP4.1; B CP5 e fluxo DRAFT_ONLY; C Base; D Marca/Voz/DNA; E modelos/assinatura/editor; F
agenda/posts/workers/efeitos; G vetores/editor/arquétipos — cada uma respondendo estado real, o que já
existe, lacunas, dívidas, dependências e o que não deve ser recriado, com arquivo:linha. Consolidação pelo
agente principal; Codex somente leitura sobre o plano (12 perguntas do owner) até APTO. Nenhum código de
produção, schema, banco, cliente, agenda ou Dot real foi tocado. Os relatórios das frentes ficaram no
relatório da sessão (`human-output/`), não no repositório.
