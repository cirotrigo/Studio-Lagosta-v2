# Piloto SINTÉTICO de autonomia — o checkpoint depois do CP5e (contrato)

**Estado: PROPOSTA, em revisão do Codex (rodada 1). Nada aqui está implementado; este PR é documental.** Base: `main` `61ca3e15`
(CP5a–CP5e mergeados). Plano-mestre: `docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` § 4.8 ("ainda NÃO cliente real;
lote sintético representativo medindo taxa APTO, motivos de revisão humana por regra, falsos bloqueios, custo, estabilidade,
repetibilidade; o resultado alimenta as decisões 1 e 2 da § 10; só depois discutir piloto real, § 9") e § 9 (critério para
voltar a piloto real: itens 4 e 5 são este checkpoint). Herda os harnesses do CP5e: `suporte/banco-com-travas.ts` (banco falso
com travas), `piloto-ponta-a-ponta.test.ts` (compositor, revisor, CP4, gate dos produtores e `agendar.ts` REAIS sobre o banco
falso, medição REAL) e os oráculos do CP0 (`suporte/propriedades.ts`).

## 0. O que o piloto É e o que NÃO é

**É**: um LOTE sintético, determinístico e reprodutível, de peças que atravessam o fluxo autônomo REAL (compor → revisar →
ajustar → revisar → agendar DRAFT, no perfil draft-only, sobre o banco falso), MEDIDO por: (a) taxa APTO por cliente, por formato
e com/sem arquétipo; (b) motivos de revisão humana por regra e por código; (c) **falso APTO** (o gate aprova e um oráculo
independente do CP0 acusa violação) — tem de ser ZERO; (d) **candidatos a falso bloqueio** (o gate recusa e nenhum oráculo acusa)
— listados com o PNG para inspeção humana, nunca decididos pelo piloto; (e) custo: renders por peça por etapa (compor, revisar,
gate, ajustar, agendar) e tempo; (f) estabilidade: exceções, `nao-medida`, `sem-vinculo`, timeouts; (g) repetibilidade: a mesma
entrada duas vezes → o mesmo veredito, os mesmos motivos e a mesma impressão do gate; (h) para a decisão 1 da § 10: a concordância
`assunto estimado × verdade` nas fotos sintéticas (que têm o assunto POR CONSTRUÇÃO); para a decisão 2: quantas peças do lote
têm camada não-texto acima de texto (os elementos dos arquétipos). Sai um RELATÓRIO (JSON + markdown + PNGs das recusas) em
`human-output/relatorios/piloto-sintetico/<data>/` para o owner julgar "satisfatório".

**NÃO é**: cliente real, DRAFT real, agenda, publicação, mensagem, webhook ou banco de produção — nada disso é tocado (o
piloto roda sobre o banco falso; as fixtures saem de exports LOCAIS feitos em leitura, como a de 13/10); mudança na DECISÃO do
gate, no compositor ou no revisor (o que o piloto achar vira PR próprio, com contrato); decisão de limiares ("satisfatório",
X % da decisão 1) — o piloto MEDE, o owner decide (seção 5); MCP-M (só depois de um piloto satisfatório); ampliação da allowlist.

## 1. O lote

### 1.1 Clientes e assinaturas (reais, anonimizadas)

Fixtures por cliente em `src/lib/direcao-de-arte/__tests__/fixtures/piloto-sintetico/<cliente-NN>/`, geradas UMA vez por
`scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts <pasta-dos-exports> <pasta-das-fixtures>` a partir de exports LOCAIS
feitos em leitura (`default_transaction_read_only=on`, como o gerador de 13/10 — `scripts/fixtures/gerar-fixture-piloto-direcao-
de-arte.ts`), do branch de DESENVOLVIMENTO do Neon (`npm run db:dev:*`; nunca o `.env` de produção). Por cliente: as páginas do
template "Assinatura" (todas as variantes, story e feed), `Project.assinatura` (números), as candidatas do véu e as logos (pixel a
pixel, como `marca.json`), as fontes DECLARADAS (família e pesos — as fontes não entram; o harness as declara presentes, como os
pilotos). **Anonimização**: nome do cliente → `cliente-NN`; nenhuma URL real (tokens `fixture:*`); nenhuma foto de cliente (ver 1.2);
textos de exemplo das assinaturas trocados por copy sintética (1.3). **Quantos**: os clientes ativos com assinatura de story (hoje
≈ 8–10, decisão 5.2); o gerador lista e o owner confirma a lista antes de gerar.

### 1.2 Fotos (sintéticas, com assunto por construção)

Nenhuma foto real entra (o Blob de teste não existe — decisão 5.1). As fotos são GERADAS localmente por `suporte/fotos-sinteticas.ts`
(sharp, determinístico por semente), em 1080×1920 e 1080×1350, cobrindo os casos da § 4.2 do plano-mestre: (A) assunto forte
localizado (uma região de alto contraste/textura com caixa CONHECIDA — a verdade do `texto-sobre-assunto`); (B) textura difusa sem
região forte (`naoSeAplica` esperado); (C) fundo liso claro, (D) fundo liso escuro, (E) gradiente vertical claro → escuro, (F)
"foto ruidosa" (ruído em toda a área: o pior caso da régua). Cada foto leva `assuntoVerdade: Rect | null`. Mais UMA foto real:
a da fixture de 13/10 (anonimizada, com a região protegida anotada) — o único caso real do lote, dito.

### 1.3 Specs

Por cliente × formato (story, feed quando houver assinatura de feed) × foto (6 sintéticas + a real quando story) × copy (3
copies sintéticas: curta — headline + serviço; média — pré-título, headline, apoio, serviço; longa — headline de 2 linhas, apoio
de 3, serviço de 2) × arquétipo (sem; `minimal-fb-topo-esquerda`; `minimal-fb-base-esquerda`; `minimal-fb-centro-optico` — só nos
formatos que o arquétipo aceita e só com foto com caixa de assunto quando o arquétipo a exige, como o T1a/CP2B mandam).
Teto do lote: ~10 clientes × 2 formatos × 7 fotos × 3 copies × 4 arquétipos ≈ 1.700 peças — **grande demais para cada
rodada**; o lote PADRÃO é uma amostra determinística de 1 em 6 (≈ 280 peças, ~15 min a 3–4 renders por peça), e `--completo`
roda tudo (uma vez, ~1,5 h). As specs são DITAS (geradas por função pura `specsDoLote(fixtures, amostra)`, com `loteId`
determinístico), nunca sorteadas em runtime.

## 2. O fluxo por peça (o REAL, sobre o banco falso)

Para cada spec, no banco falso recém-semeado com o cliente da peça (`criarBancoComTravas()` + fixtures): 1. `comporPeca(spec)`
REAL (persistência falsa: Page + Generation no banco, como no CP5e) — conta renders e ms; recusa do compositor (T1a/CP2B/CP3,
`FOTO_INDISPONIVEL`, `ASSINATURA_INCOMPLETA`…) é um DESFECHO registrado, não falha do piloto; 2. `revisarArte` REAL (sem visão: a
visão é gpt-5.2 e o piloto é hermético) — guarda `gate` (informação), achados, ajustes propostos; 3. se o gate recusar e houver
`ajustes`, até 2 ciclos de `ajustarArte` draft-only com os ajustes do revisor (o CP4 e o gate dos produtores decidem), revisando
depois de cada; 4. `agendarItensDoLote` draft-only (item do lote apontando a Generation): `criado` ou recusa (REVISAO_HUMANA_
NECESSARIA com motivos); 5. os ORÁCULOS do CP0 sobre a versão FINAL da página (`leiturasDosTextos`, `leituraDaLogo`, `foraDaInterface`,
`textosQueInvadem` com a `assuntoVerdade`, `ordemDeLeituraInvertida`) — independentes do gate; 6. repetição: a MESMA spec roda uma
segunda vez num banco novo; veredito, motivos (regra:código:camadas) e `serializarParaImpressao(gate)` têm de ser iguais; 7. PNG
da versão final (render real, já feito pelo fluxo) guardado para toda peça recusada e para 1 em 10 das aptas (controle visual).

Limites ditos (os do CP5e, § 3.1): o banco falso não prova travas/SQL reais nem Blob; a visão não roda; as fontes da marca não
estão instaladas (as famílias são declaradas presentes — `fonte-nao-carregada` real fica fora do lote, dito no relatório); o custo
medido é o do ambiente local (renders e ms), não o da Vercel.

## 3. As medidas e o relatório

`human-output/relatorios/piloto-sintetico/<AAAA-MM-DD>/relatorio.json` (toda peça: spec, cliente, desfechos por etapa, gate,
motivos, oráculos, renders, ms, repetibilidade, caminho do PNG) e `relatorio.md` com:

1. **Taxa APTO** (gate informativo da v1 composta; APTO final depois dos ciclos; DRAFT criado) por cliente, formato, foto, copy e
   arquétipo — tabelas, sem média geral escondendo cliente ruim.
2. **Motivos de revisão humana** por regra × código (ACHADO_CRITICO / NAO_COMPROVADA / NAO_MEDIDO / IDENTIDADE_ILEGIVEL) e por
   cliente — o que mais bloqueia, e se é medido ou "não comprovado".
3. **Falso APTO** (gate APTO ∧ algum oráculo acusa): a lista COMPLETA com PNG — tem de estar VAZIA; se não estiver, o piloto é
   insatisfatório por definição e o item vira BLOQUEADOR do próximo PR (gate ou oráculo, a ver).
4. **Candidatos a falso bloqueio** (gate recusa ∧ nenhum oráculo acusa): lista com PNG e motivos, para inspeção humana; o piloto
   NÃO os classifica — e diz quantos são `NAO_COMPROVADA` (o gate não mediu) × `ACHADO_CRITICO` (o gate mediu e o oráculo discorda).
5. **Custo**: renders por peça por etapa (mediana e p95), ms por etapa; o teto do plano-mestre (3–4 por composição, 2 por ajuste)
   conferido.
6. **Estabilidade**: exceções, `nao-medida`, `sem-vinculo`, timeouts da medição (8 s), por etapa.
7. **Repetibilidade**: % de peças com veredito + motivos + impressão iguais nas duas rodadas (esperado 100 %; cada divergência
   listada com o diff).
8. **Decisão 1 (§ 10)**: nas fotos (A) com `assuntoVerdade`, a concordância `assunto estimado × verdade` (IoU por foto, e a taxa
   de peças em que `texto-sobre-assunto` estimado acertou a invasão que o oráculo mede com a verdade) — e quantas peças a política
   RECOMENDADA (estimado → humano) bloqueou que a verdade aprovaria.
9. **Decisão 2 (§ 10)**: quantas peças têm camada não-texto acima de texto (elementos de arquétipo, molduras, fios), e em quantas
   a conferência `oclusao` do gate foi `nao-comprovada`.
10. **O que o piloto NÃO mediu** (os limites da § 2) — em toda rodada.

## 4. Arquivos

`scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts` (gerador, roda uma vez, fora da suíte); `src/lib/direcao-de-arte/__tests__/
fixtures/piloto-sintetico/<cliente-NN>/{assinaturas.json, marca.json, LEIAME.md}`; `suporte/fotos-sinteticas.ts` (puro + sharp),
`suporte/lote-do-piloto.ts` (`specsDoLote`, puro), `suporte/oraculos-do-piloto.ts` (envolve `propriedades.ts`), `suporte/relatorio-
do-piloto.ts` (puro: agrega e escreve); `src/lib/direcao-de-arte/__tests__/piloto-sintetico.test.ts` — **roda só com
`PILOTO_SINTETICO=1`** (`describe.skipIf`), fora da suíte normal e do CI (um job manual `workflow_dispatch` opcional, decisão 5.4);
`scripts/piloto-sintetico.ts` (atalho: roda o vitest com a variável, `--completo`, `--cliente NN`, `--so <trecho>`); docs:
`docs/regras/revisor-da-arte.md § Piloto sintético`, `docs/regras/aprendizado.md` (o que o piloto NÃO grava: nenhum sinal).
Testes do próprio piloto (na suíte normal): `fotos-sinteticas.test.ts` (determinismo, `assuntoVerdade` dentro da foto),
`lote-do-piloto.test.ts` (amostra determinística, cobertura dos eixos), `relatorio-do-piloto.test.ts` (agregações sobre um lote
falso de 20 peças, inclusive um falso APTO e uma divergência de repetibilidade).

## 5. Decisões pendentes do OWNER (o piloto usa a recomendação como PROPOSTA nomeada)

| # | Decisão | Proposta | Alternativa |
|---|---|---|---|
| 5.1 | Fotos do lote | SINTÉTICAS com assunto por construção (+ a real anonimizada de 13/10) — nenhuma foto de cliente, nenhum Blob de teste | criar um Blob de teste com fotos reais anonimizadas por peça (o gerador compõe localmente e recorta janelas — o método de 13/10, ~1 h por cliente) |
| 5.2 | Clientes do lote | todos os ativos com assinatura de story (o gerador lista; o owner confirma) | só os 3 do piloto do Dot |
| 5.3 | O que é "satisfatório" | o owner decide lendo o relatório; o contrato só FIXA: falso APTO = 0 e repetibilidade = 100 % são obrigatórios | limiares numéricos de taxa APTO por cliente neste contrato |
| 5.4 | Onde roda | local, sob demanda (`npm run piloto:sintetico`), relatório em human-output; CI não roda | job manual no GitHub Actions com o relatório como artefato |
| 5.5 | Tamanho da rodada padrão | amostra determinística 1/6 (~280 peças, ~15 min); `--completo` uma vez por semana | lote completo sempre |

## 6. Gates do PR de implementação

Testes do piloto na suíte normal verdes; UMA rodada padrão e UMA `--completo` executadas localmente com o relatório COMMITADO em
`human-output/` (data e HEAD no cabeçalho); falso APTO = 0 na rodada completa (ou o PR traz o achado como BLOQUEADOR nomeado para o
próximo contrato, não como "satisfatório"); repetibilidade 100 %; suíte completa sozinha; typecheck; lint; `git diff --check
<base>`; 3 validadores; Codex APTO no HEAD final; CI e Vercel verdes; merge por merge commit com `--match-head-commit`. Depois:
o owner lê o relatório e decide "satisfatório" (5.3) → só então o contrato do MCP-M0 (§ 5.0, só leitura).
