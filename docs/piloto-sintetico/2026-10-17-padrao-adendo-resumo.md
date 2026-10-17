# Piloto sintético de autonomia — resumo da rodada padrao-adendo (2026-10-17)

HEAD `61a6d4a0` · lote `piloto-sintetico-fab993509e07` · ambiente darwin arm64 node v22.23.3 · relatório integral: `human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/relatorio.json` (SHA-256 `b2ae1f25e5d87a7f53aabfa4ccfc3daf8f2a794c01d52bbc42beb2f2727833db`).

**O que este piloto NÃO mede** (ao lado do veredito, sempre): fontes da marca não instaladas (declaradas presentes; render com fonte de reserva); a visão (gpt-5.2) não roda; fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1); banco falso com travas: travas/SQL reais e Blob não provados; custo medido nesta máquina, não na Vercel; clientes: cliente-00, cliente-00-m90, cliente-fixture, cliente-fixture-piso (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2; cliente-00-m90 e cliente-fixture-piso são VARIANTES DE TESTE do lote, não assinaturas reais).

## Denominadores
elegíveis 306 → peças da rodada 70 → compostas 34 (recusas estruturais 36, erros 0) → chegaram ao gate e foram MEDIDAS 32 → APTAS na v1 9 → APTAS ao fim 9 → DRAFTs 9.
Desfechos BRUTOS do fluxo (incluem as 2 peças NÃO MEDIDAS, fora das janelas fiéis — § 3b): chegaram ao gate 34 · APTAS ao fim 9 · DRAFTs 9. As seções 1–4 e 8 são sobre as peças MEDIDAS; custo (5), estabilidade (6) e repetibilidade (7) cobrem todas as peças da rodada.
Exclusões do lote por motivo (não são peças): arquetipo-indisponivel 174 · arquetipo-exige-assunto 216 · arquetipo-sem-formato 0.

## 1. Taxa APTO por eixo, peças MEDIDAS (v1 composta · ao fim dos ciclos · DRAFT)
### cliente
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| cliente-00 | 7 | 28.6 % (2/7) | 28.6 % (2/7) | 28.6 % (2/7) |
| cliente-00-m90 | 21 | 33.3 % (7/21) | 33.3 % (7/21) | 33.3 % (7/21) |
| cliente-fixture | 2 | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| cliente-fixture-piso | 2 | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
### formato
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| feed | 21 | 33.3 % (7/21) | 33.3 % (7/21) | 33.3 % (7/21) |
| story | 11 | 18.2 % (2/11) | 18.2 % (2/11) | 18.2 % (2/11) |
### foto
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| A1 | 5 | 60.0 % (3/5) | 60.0 % (3/5) | 60.0 % (3/5) |
| A2 | 3 | 33.3 % (1/3) | 33.3 % (1/3) | 33.3 % (1/3) |
| A3 | 4 | 50.0 % (2/4) | 50.0 % (2/4) | 50.0 % (2/4) |
| B | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| C | 4 | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) |
| D | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| E | 4 | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) |
| F | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| sem-foto | 3 | 100.0 % (3/3) | 100.0 % (3/3) | 100.0 % (3/3) |
### copy
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| curta | 27 | 25.9 % (7/27) | 25.9 % (7/27) | 25.9 % (7/27) |
| longa | 5 | 40.0 % (2/5) | 40.0 % (2/5) | 40.0 % (2/5) |
### arquetipo
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| minimal-fb-centro-optico | 4 | 100.0 % (4/4) | 100.0 % (4/4) | 100.0 % (4/4) |
| minimal-fb-topo-esquerda | 2 | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| sem | 26 | 11.5 % (3/26) | 11.5 % (3/26) | 11.5 % (3/26) |

## 2. Motivos de revisão humana (gate final) por regra × código
| regra | ACHADO_CRITICO | NAO_COMPROVADA | NAO_MEDIDO | IDENTIDADE_ILEGIVEL |
|---|---|---|---|---|
| piso-de-interface | 2 | 0 | 0 | 0 |
| texto-sem-leitura | 1 | 0 | 0 | 0 |
| texto-sobre-assunto | 0 | 23 | 0 | 0 |
| tinta-fora-da-caixa | 4 | 0 | 0 | 0 |

### 2b. Motivos de revisão humana por cliente (gate final)
| cliente | piso-de-interface | texto-sem-leitura | texto-sobre-assunto | tinta-fora-da-caixa |
|---|---|---|---|---|
| cliente-00 | 0 | 0 | 5 | 0 |
| cliente-00-m90 | 0 | 0 | 14 | 0 |
| cliente-fixture | 2 | 0 | 2 | 2 |
| cliente-fixture-piso | 0 | 1 | 2 | 2 |

## 3. Falso APTO (gate APTO ∧ juiz coberto acusa, só peças MEDIDAS) — NENHUM nas regras cobertas

### 3b. Peças NÃO MEDIDAS (caixas fora das janelas fiéis da foto da fixture) — 2; indício, nunca contado
- cliente-00-m90|story|real|curta|sem: fora das janelas: headline, servico, logo · gate: REVISAO_HUMANA_NECESSARIA (texto-sobre-assunto:NAO_COMPROVADA) · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_story_real_curta_sem.png (SHA-256 `d7a0cdbb5abd4d4feac47e4c61dda0ed8208e53889987e008920b75af0282dd0`)
- cliente-00-m90|story|real|longa|sem: fora das janelas: headline, apoio, servico, logo · gate: REVISAO_HUMANA_NECESSARIA (texto-sobre-assunto:NAO_COMPROVADA) · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_story_real_longa_sem.png (SHA-256 `372b771da8e77b1bb9af723ef064f8bbb2c0403ee678f01a91abf8cebea618b7`)

## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — 20 para inspeção humana
(19 só com motivos NÃO COMPROVADOS — o gate não mediu; 1 com ACHADO_CRITICO — o gate mediu e o juiz discorda)
- cliente-00-m90|feed|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_A1_curta_sem.png (SHA-256 `222e921687ab39ea9e5d8b2ce6b24676b0e0efebd83983252ebf3019721fd1a7`)
- cliente-00-m90|feed|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_A1_longa_sem.png (SHA-256 `3f626f75961fa0e481b19abaadbee16e7cef94be46c13006535c535c83febd69`)
- cliente-00-m90|feed|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_A2_curta_sem.png (SHA-256 `c984f7c974005cf8f12a40bb994afe4e8d0ef67f9b94715d1e8482082260ffdc`)
- cliente-00-m90|feed|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_A2_longa_sem.png (SHA-256 `e952e35edde3b5cec4947273ab35d0823a8e5730ba28c8f0416be1eb916941d2`)
- cliente-00-m90|feed|A3|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_A3_curta_sem.png (SHA-256 `956ef3e67f6346d4dd86eeebcaa7270e48d4b13a0b735e48d0a5c46d5dd639fd`)
- cliente-00-m90|feed|A3|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_A3_longa_sem.png (SHA-256 `8034aaf9fc8b3d2e98700143991dd6607c636b5b6e9fd50390871ccfadc51aa1`)
- cliente-00-m90|feed|B|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_B_curta_sem.png (SHA-256 `ab1e2acceb5b691fb6bb100e84e862dfa8deb72afca892305c5bfc173d1fcf72`)
- cliente-00-m90|feed|C|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_C_curta_sem.png (SHA-256 `922939f6724f373079ba8c01f6eab5304cf7812036fdf1dd29101ad46915c2d8`)
- cliente-00-m90|feed|D|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_D_curta_sem.png (SHA-256 `b0471bc976d08be9fe804dfbd123e6c2dab209a20cf31adde9f1cd6696c8558f`)
- cliente-00-m90|feed|E|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_E_curta_sem.png (SHA-256 `cfce78d5d4ed420c8e7c1a1e8e99a89992ccdbec721aadf52b87a672f3d3bfbd`)
- cliente-00-m90|feed|F|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_feed_F_curta_sem.png (SHA-256 `6f3c25ca35e4b2e9cdfcb2f7e34bf59b6b43e1465d2d3fccfe3eb49c7194939e`)
- cliente-00-m90|story|B|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_story_B_curta_sem.png (SHA-256 `0fd46d78fa58bcb06403d99133e165b85cb7beb068bd7eaf60907e14dc6f2ae7`)
- cliente-00-m90|story|D|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_story_D_curta_sem.png (SHA-256 `0c11ddc7af6ef11b506f619f4bafa8fdbf7a8adf271e7d28cf17c99b7975cc04`)
- cliente-00-m90|story|F|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00-m90_story_F_curta_sem.png (SHA-256 `9f41ce60cd2f5d31c6573090a091d39e7f84ed3184adf3885342b1bd4bbeb3b4`)
- cliente-00|feed|B|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00_feed_B_curta_sem.png (SHA-256 `ab1e2acceb5b691fb6bb100e84e862dfa8deb72afca892305c5bfc173d1fcf72`)
- cliente-00|feed|D|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00_feed_D_curta_sem.png (SHA-256 `b0471bc976d08be9fe804dfbd123e6c2dab209a20cf31adde9f1cd6696c8558f`)
- cliente-00|feed|F|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00_feed_F_curta_sem.png (SHA-256 `6f3c25ca35e4b2e9cdfcb2f7e34bf59b6b43e1465d2d3fccfe3eb49c7194939e`)
- cliente-00|story|C|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00_story_C_curta_sem.png (SHA-256 `4a911d92a575aaf02fce52d8817585ddc98e3c56c756419f6b0dfb8cb0539719`)
- cliente-00|story|E|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-00_story_E_curta_sem.png (SHA-256 `568b2088e3e4fb7d17d57a4e269e68e3eef000224799abc22e950202ddd07146`)
- cliente-fixture-piso|story|E|curta|sem: tinta-fora-da-caixa:ACHADO_CRITICO, texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-adendo/png/cliente-fixture-piso_story_E_curta_sem.png (SHA-256 `f35405bcf297dc92b8458ebc978506a041d6b97be76a8e7e436d1d9a71501fb2`)

## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95) — a peça principal (compor…png), a leitura pareada, a repetição e a injeção em linhas próprias
| etapa | renders med | renders p95 | ms med | ms p95 |
|---|---|---|---|---|
| compor | 3 | 3 | 764 | 1167 |
| revisar | 4 | 4 | 978 | 1519 |
| ajustar | 0 | 0 | 0 | 0 |
| agendar | 2 | 2 | 497 | 768 |
| juizes | 2 | 2 | 480 | 732 |
| png | 1 | 1 | 217 | 320 |
| pareada | 0 | 9 | 21 | 2407 |
| repeticao | 0 | 10 | 67 | 3314 |
| injecao | 4 | 4 | 1028 | 1540 |
| modoG | 6 | 6 | 1590 | 2237 |
| cenarioH | 6 | 6 | 1566 | 2343 |
Renders somados por etapa: 970 · observados pelo contador do renderer na rodada: 970.

## 6. Estabilidade: exceções 0 · nao-medida 0 · sem-vinculo 0 · timeouts 0

## 7. Repetibilidade: 100.0 % (70/70) iguais (compostas: impressão COMPLETA do gate final sem medidoEm, camadas normalizadas e hash do PNG; recusas estruturais: o mesmo código)

## 8. Decisão 1 — assunto estimado × catálogo × verdade (14 PARES reais, mesmo corte conhecido): o estimado localizou caixa em 8/14 e NÃO localizou em 6/14; IoU est×cat 0.31 e est×verdade 0.31 (denominador: os 8 com caixa) · cat×verdade 1.00 (denominador: 14) · o estimado acertou a invasão em 0 e errou em 4. Em peça com arquétipo o par é "catálogo × estimativa do HARNESS no mesmo recorte" (as duas composições nascem com catálogo).
A linha D é o gate DEPOIS da falha de leitura injetada (as mesmas peças também aparecem no seu caso de origem).
| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |
|---|---|---|---|---|
| A-catalogo | 6 | 0 | 0 | 0 |
| B-estimado | 4 | 4 | 4 | 0 |
| C-sem-assunto-localizavel | 19 | 19 | 2 | 0 |
| D-falha-de-leitura | 5 | 5 | 2 | 0 |
| E-sem-foto | 3 | 0 | 0 | 0 |

## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): 0; `oclusao` não comprovada no gate: 0
Cenário INJETADO (shape acima da headline em peça APTA): 9 injeções, 9 recusadas pelo gate — motivos: texto-sobre-assunto:NAO_COMPROVADA 6, oclusao:NAO_MEDIDO 9.
Modo G (falha de leitura injetada): 5 leituras, 5 válidas (5 recusadas pelo REVISOR e pelo PRODUTOR — item desligado, sem DRAFT na página, resposta REVISAO_HUMANA_NECESSARIA por texto-sobre-assunto e nenhum post criado), 0 inválidas (cache usado).

## 9b. Anotação do assunto (adendo § 1) — caso A: 6 peças; preservada nos três elos (compositor gravou catálogo → revisor reaproveitou sem estimar e avaliou → produtor usou catálogo com a mesma caixa): 6; não preservada: nenhuma
Par catálogo presente × ausente: 14 pares REAIS (as duas execuções compuseram; SHA-256, dimensões e corte registrados), 0 com corte divergente (fora do IoU), 36 não pareadas (uma das execuções recusou, ou o corte ficou desconhecido num dos lados). Origem do estimado nos pares (inclusive quando não localizou caixa): harness-mesmo-corte 4, compositor 4, harness-mesmo-corte (sem caixa) 2, compositor (sem caixa) 4 — compositor = peça sem arquétipo; harness-mesmo-corte = peça com arquétipo (nasce com catálogo; a leitura sem catálogo é o cálculo do harness sobre os mesmos bytes e corte).
Cenário H (anotação perdida de propósito: corte da bg-foto trocado numa peça APTA do caso A → nova medida e decisão): 6 peças, 6 ao humano pelo revisor E pelo produtor; tipo da nova medida: reestimada-com-assunto 4, reestimada-sem-assunto 2. Hoje o revisor NÃO relê o catálogo quando o cache cai (comportamento medido; mudar é decisão do owner).
- cliente-00-m90|feed|A1|curta|minimal-fb-centro-optico: center-middle → left-top → reestimada-com-assunto → humano
- cliente-00-m90|feed|A1|curta|minimal-fb-topo-esquerda: center-middle → left-top → reestimada-com-assunto → humano
- cliente-00-m90|feed|A1|longa|minimal-fb-topo-esquerda: center-middle → left-top → reestimada-com-assunto → humano
- cliente-00-m90|feed|A3|curta|minimal-fb-centro-optico: center-middle → left-top → reestimada-sem-assunto → humano
- cliente-00|feed|A2|curta|minimal-fb-centro-optico: center-middle → left-top → reestimada-com-assunto → humano
- cliente-00|story|A3|curta|minimal-fb-centro-optico: center-middle → left-top → reestimada-sem-assunto → humano

## 10. O que NÃO está coberto por juiz (inspeção humana nos PNGs amostrados)
- colisao — mesma-medida: só checkTextGeometry mede — repetir não é juiz
- texto-cortado — mesma-medida: idem
- tinta-fora-da-caixa — mesma-medida: idem
- texto-pequeno — nao-coberta: sem juiz externo
- copy-completa — nao-coberta: sem juiz externo
- identidade — nao-coberta: sem juiz externo
- oclusao — nao-coberta: só nos cenários injetados
- fonte-nao-carregada — nao-coberta: fontes declaradas presentes; fora do lote
