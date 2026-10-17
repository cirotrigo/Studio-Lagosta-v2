# Piloto sintético de autonomia — resumo da rodada completo (2026-10-17)

HEAD `439f7fad` · lote `piloto-sintetico-cdce41047cff` · ambiente darwin arm64 node v22.23.3 · relatório integral: `human-output/relatorios/piloto-sintetico/2026-10-17-completo/relatorio.json` (SHA-256 `2d1c7d37d7f1f5074d405d91bb3c00892d8cd38c9144ee80f2ce82accf7346b8`).

**O que este piloto NÃO mede** (ao lado do veredito, sempre): fontes da marca não instaladas (declaradas presentes; render com fonte de reserva); a visão (gpt-5.2) não roda; fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1); banco falso com travas: travas/SQL reais e Blob não provados; custo medido nesta máquina, não na Vercel; clientes: cliente-00, cliente-fixture (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2).

## Denominadores
elegíveis 126 → peças da rodada 126 → compostas 54 (recusas estruturais 72, erros 0) → chegaram ao gate e foram MEDIDAS 50 → APTAS na v1 24 → APTAS ao fim 24 → DRAFTs 24.
Desfechos BRUTOS do fluxo (incluem as 4 peças NÃO MEDIDAS, fora das janelas fiéis — § 3b): chegaram ao gate 54 · APTAS ao fim 26 · DRAFTs 26. As seções 1–4 e 8 são sobre as peças MEDIDAS; custo (5), estabilidade (6) e repetibilidade (7) cobrem todas as peças da rodada.
Exclusões do lote por motivo (não são peças): arquetipo-indisponivel 78 · arquetipo-exige-assunto 108 · arquetipo-sem-formato 0.

## 1. Taxa APTO por eixo, peças MEDIDAS (v1 composta · ao fim dos ciclos · DRAFT)
### cliente
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| cliente-00 | 34 | 70.6 % (24/34) | 70.6 % (24/34) | 70.6 % (24/34) |
| cliente-fixture | 16 | 0.0 % (0/16) | 0.0 % (0/16) | 0.0 % (0/16) |
### formato
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| feed | 18 | 72.2 % (13/18) | 72.2 % (13/18) | 72.2 % (13/18) |
| story | 32 | 34.4 % (11/32) | 34.4 % (11/32) | 34.4 % (11/32) |
### foto
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| A1 | 7 | 14.3 % (1/7) | 14.3 % (1/7) | 14.3 % (1/7) |
| A2 | 7 | 14.3 % (1/7) | 14.3 % (1/7) | 14.3 % (1/7) |
| B | 6 | 66.7 % (4/6) | 66.7 % (4/6) | 66.7 % (4/6) |
| C | 6 | 33.3 % (2/6) | 33.3 % (2/6) | 33.3 % (2/6) |
| D | 6 | 66.7 % (4/6) | 66.7 % (4/6) | 66.7 % (4/6) |
| E | 6 | 66.7 % (4/6) | 66.7 % (4/6) | 66.7 % (4/6) |
| F | 6 | 66.7 % (4/6) | 66.7 % (4/6) | 66.7 % (4/6) |
| sem-foto | 6 | 66.7 % (4/6) | 66.7 % (4/6) | 66.7 % (4/6) |
### copy
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| curta | 26 | 53.8 % (14/26) | 53.8 % (14/26) | 53.8 % (14/26) |
| longa | 24 | 41.7 % (10/24) | 41.7 % (10/24) | 41.7 % (10/24) |
### arquetipo
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| minimal-fb-centro-optico | 2 | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| sem | 48 | 45.8 % (22/48) | 45.8 % (22/48) | 45.8 % (22/48) |

## 2. Motivos de revisão humana (gate final) por regra × código
| regra | ACHADO_CRITICO | NAO_COMPROVADA | NAO_MEDIDO | IDENTIDADE_ILEGIVEL |
|---|---|---|---|---|
| piso-de-interface | 16 | 0 | 0 | 0 |
| texto-sem-leitura | 4 | 0 | 0 | 0 |
| texto-sobre-assunto | 0 | 12 | 0 | 0 |
| tinta-fora-da-caixa | 8 | 0 | 0 | 0 |

### 2b. Motivos de revisão humana por cliente (gate final)
| cliente | piso-de-interface | texto-sem-leitura | texto-sobre-assunto | tinta-fora-da-caixa |
|---|---|---|---|---|
| cliente-00 | 0 | 2 | 8 | 0 |
| cliente-fixture | 16 | 2 | 4 | 8 |

## 3. Falso APTO (gate APTO ∧ juiz coberto acusa, só peças MEDIDAS) — NENHUM nas peças MEDIDAS — mas 2 peça(s) NÃO MEDIDA(S) APTA(S) com o juiz acusando (§ 3b): INCONCLUSIVO sobre essa regra até as janelas da fixture cobrirem as caixas

### 3b. Peças NÃO MEDIDAS (caixas fora das janelas fiéis da foto da fixture) — 4; indício, nunca contado
- cliente-00|story|real|curta|sem: fora das janelas: headline, servico, logo · gate: APTO · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_real_curta_sem.png (SHA-256 `d7a0cdbb5abd4d4feac47e4c61dda0ed8208e53889987e008920b75af0282dd0`)
- cliente-00|story|real|longa|sem: fora das janelas: headline, apoio, servico, logo · gate: APTO · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_real_longa_sem.png (SHA-256 `372b771da8e77b1bb9af723ef064f8bbb2c0403ee678f01a91abf8cebea618b7`)
- cliente-fixture|story|real|curta|sem: fora das janelas: headline, apoio, logo · gate: REVISAO_HUMANA_NECESSARIA (tinta-fora-da-caixa:ACHADO_CRITICO, piso-de-interface:ACHADO_CRITICO) · juiz acusaria: piso-de-interface (headline, servico, logo); fora-da-area-segura (headline, apoio, servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-fixture_story_real_curta_sem.png (SHA-256 `dc14b721cb25077f8716841e8aefc33379887d3099864e46da3eae17fb65a902`)
- cliente-fixture|story|real|longa|sem: fora das janelas: headline, apoio, logo · gate: REVISAO_HUMANA_NECESSARIA (piso-de-interface:ACHADO_CRITICO) · juiz acusaria: piso-de-interface (headline, servico, logo); fora-da-area-segura (headline, apoio, servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-fixture_story_real_longa_sem.png (SHA-256 `14973683c7387190443ad40dcde15818199bf71246fb25622ef0c6d1528941f9`)

## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — 8 para inspeção humana
(8 só com motivos NÃO COMPROVADOS — o gate não mediu; 0 com ACHADO_CRITICO — o gate mediu e o juiz discorda)
- cliente-00|feed|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A1_curta_sem.png (SHA-256 `222e921687ab39ea9e5d8b2ce6b24676b0e0efebd83983252ebf3019721fd1a7`)
- cliente-00|feed|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A1_longa_sem.png (SHA-256 `3f626f75961fa0e481b19abaadbee16e7cef94be46c13006535c535c83febd69`)
- cliente-00|feed|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A2_curta_sem.png (SHA-256 `c984f7c974005cf8f12a40bb994afe4e8d0ef67f9b94715d1e8482082260ffdc`)
- cliente-00|feed|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A2_longa_sem.png (SHA-256 `e952e35edde3b5cec4947273ab35d0823a8e5730ba28c8f0416be1eb916941d2`)
- cliente-00|story|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A1_curta_sem.png (SHA-256 `94c4f30032afe6698ae5a2ddfa7740aacf263d0e9d75de3c2d74c62ac59937a4`)
- cliente-00|story|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A1_longa_sem.png (SHA-256 `6d9fa50e3cc4ea9dfa3c6f7778352918aafd735c193ed2613fa842db4daef03a`)
- cliente-00|story|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A2_curta_sem.png (SHA-256 `08fc74e70f0ed418fbcbfef2f4fd14a5bef100053df55fca843609a723c973f4`)
- cliente-00|story|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A2_longa_sem.png (SHA-256 `4134f3f8dcf96fa6405acea7488a4a0d8708aa4f0466ebb9f5ae88980deb0e82`)

## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95) — a peça principal (compor…png), a leitura pareada, a repetição e a injeção em linhas próprias
| etapa | renders med | renders p95 | ms med | ms p95 |
|---|---|---|---|---|
| compor | 3 | 3 | 604 | 1394 |
| revisar | 4 | 4 | 761 | 1853 |
| ajustar | 0 | 0 | 0 | 0 |
| agendar | 2 | 2 | 376 | 973 |
| juizes | 2 | 2 | 364 | 882 |
| png | 1 | 1 | 132 | 375 |
| pareada | 0 | 9 | 29 | 3477 |
| repeticao | 0 | 10 | 33 | 3842 |
| injecao | 4 | 4 | 375 | 1509 |
| modoG | 6 | 6 | 2197 | 2392 |
Renders somados por etapa: 1406 · observados pelo contador do renderer na rodada: 1406.

## 6. Estabilidade: exceções 0 · nao-medida 0 · sem-vinculo 0 · timeouts 0

## 7. Repetibilidade: 100.0 % (126/126) iguais (compostas: veredito, motivos, camadas normalizadas e hash do PNG; recusas estruturais: o mesmo código)

## 8. Decisão 1 — assunto estimado × catálogo × verdade (72 peças com verdade): IoU est×cat 0.30 · est×verdade 0.30 · cat×verdade 1.00 · o estimado acertou a invasão em 0 e errou em 12
A linha D é o gate DEPOIS da falha de leitura injetada (as mesmas peças também aparecem no seu caso de origem).
| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |
|---|---|---|---|---|
| A-catalogo | 2 | 0 | 0 | 0 |
| B-estimado | 12 | 12 | 12 | 0 |
| C-nao-se-aplica | 30 | 0 | 0 | 0 |
| D-falha-de-leitura | 6 | 6 | 6 | 0 |
| E-sem-foto | 6 | 0 | 0 | 0 |

## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): 0; `oclusao` não comprovada no gate: 0
Cenário INJETADO (shape acima da headline em peça APTA): 8 injeções, 8 recusadas pelo gate — motivos: oclusao:NAO_MEDIDO 8.
Modo G (falha de leitura injetada): 6 leituras, 6 válidas (6 recusadas pelo gate), 0 inválidas (cache usado).

## 10. O que NÃO está coberto por juiz (inspeção humana nos PNGs amostrados)
- colisao — mesma-medida: só checkTextGeometry mede — repetir não é juiz
- texto-cortado — mesma-medida: idem
- tinta-fora-da-caixa — mesma-medida: idem
- texto-pequeno — nao-coberta: sem juiz externo
- copy-completa — nao-coberta: sem juiz externo
- identidade — nao-coberta: sem juiz externo
- oclusao — nao-coberta: só nos cenários injetados
- fonte-nao-carregada — nao-coberta: fontes declaradas presentes; fora do lote
