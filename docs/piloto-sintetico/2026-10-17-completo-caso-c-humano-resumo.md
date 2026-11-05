# Piloto sintético de autonomia — resumo da rodada completo-caso-c-humano (2026-10-17)

HEAD `5afe09e4` · lote `piloto-sintetico-cdce41047cff` · ambiente darwin arm64 node v22.23.3 · relatório integral: `human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/relatorio.json` (SHA-256 `8cf2988eb41802e3889a9aabb058e2e36ad9d8dcac179af2770842f43cd9afb7`).

**O que este piloto NÃO mede** (ao lado do veredito, sempre): fontes da marca não instaladas (declaradas presentes; render com fonte de reserva); a visão (gpt-5.2) não roda; fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1); banco falso com travas: travas/SQL reais e Blob não provados; custo medido nesta máquina, não na Vercel; clientes: cliente-00, cliente-fixture (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2).

## Denominadores
elegíveis 126 → peças da rodada 126 → compostas 54 (recusas estruturais 72, erros 0) → chegaram ao gate e foram MEDIDAS 50 → APTAS na v1 6 → APTAS ao fim 6 → DRAFTs 6.
Desfechos BRUTOS do fluxo (incluem as 4 peças NÃO MEDIDAS, fora das janelas fiéis — § 3b): chegaram ao gate 54 · APTAS ao fim 6 · DRAFTs 6. As seções 1–4 e 8 são sobre as peças MEDIDAS; custo (5), estabilidade (6) e repetibilidade (7) cobrem todas as peças da rodada.
Exclusões do lote por motivo (não são peças): arquetipo-indisponivel 78 · arquetipo-exige-assunto 108 · arquetipo-sem-formato 0.

## 1. Taxa APTO por eixo, peças MEDIDAS (v1 composta · ao fim dos ciclos · DRAFT)
### cliente
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| cliente-00 | 34 | 17.6 % (6/34) | 17.6 % (6/34) | 17.6 % (6/34) |
| cliente-fixture | 16 | 0.0 % (0/16) | 0.0 % (0/16) | 0.0 % (0/16) |
### formato
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| feed | 18 | 22.2 % (4/18) | 22.2 % (4/18) | 22.2 % (4/18) |
| story | 32 | 6.3 % (2/32) | 6.3 % (2/32) | 6.3 % (2/32) |
### foto
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| A1 | 7 | 14.3 % (1/7) | 14.3 % (1/7) | 14.3 % (1/7) |
| A2 | 7 | 14.3 % (1/7) | 14.3 % (1/7) | 14.3 % (1/7) |
| B | 6 | 0.0 % (0/6) | 0.0 % (0/6) | 0.0 % (0/6) |
| C | 6 | 0.0 % (0/6) | 0.0 % (0/6) | 0.0 % (0/6) |
| D | 6 | 0.0 % (0/6) | 0.0 % (0/6) | 0.0 % (0/6) |
| E | 6 | 0.0 % (0/6) | 0.0 % (0/6) | 0.0 % (0/6) |
| F | 6 | 0.0 % (0/6) | 0.0 % (0/6) | 0.0 % (0/6) |
| sem-foto | 6 | 66.7 % (4/6) | 66.7 % (4/6) | 66.7 % (4/6) |
### copy
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| curta | 26 | 15.4 % (4/26) | 15.4 % (4/26) | 15.4 % (4/26) |
| longa | 24 | 8.3 % (2/24) | 8.3 % (2/24) | 8.3 % (2/24) |
### arquetipo
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| minimal-fb-centro-optico | 2 | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| sem | 48 | 8.3 % (4/48) | 8.3 % (4/48) | 8.3 % (4/48) |

## 2. Motivos de revisão humana (gate final) por regra × código
| regra | ACHADO_CRITICO | NAO_COMPROVADA | NAO_MEDIDO | IDENTIDADE_ILEGIVEL |
|---|---|---|---|---|
| piso-de-interface | 16 | 0 | 0 | 0 |
| texto-sem-leitura | 4 | 0 | 0 | 0 |
| texto-sobre-assunto | 0 | 42 | 0 | 0 |
| tinta-fora-da-caixa | 8 | 0 | 0 | 0 |

### 2b. Motivos de revisão humana por cliente (gate final)
| cliente | piso-de-interface | texto-sem-leitura | texto-sobre-assunto | tinta-fora-da-caixa |
|---|---|---|---|---|
| cliente-00 | 0 | 2 | 28 | 0 |
| cliente-fixture | 16 | 2 | 14 | 8 |

## 3. Falso APTO (gate APTO ∧ juiz coberto acusa, só peças MEDIDAS) — NENHUM nas regras cobertas

### 3b. Peças NÃO MEDIDAS (caixas fora das janelas fiéis da foto da fixture) — 4; indício, nunca contado
- cliente-00|story|real|curta|sem: fora das janelas: headline, servico, logo · gate: REVISAO_HUMANA_NECESSARIA (texto-sobre-assunto:NAO_COMPROVADA) · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_real_curta_sem.png (SHA-256 `d7a0cdbb5abd4d4feac47e4c61dda0ed8208e53889987e008920b75af0282dd0`)
- cliente-00|story|real|longa|sem: fora das janelas: headline, apoio, servico, logo · gate: REVISAO_HUMANA_NECESSARIA (texto-sobre-assunto:NAO_COMPROVADA) · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_real_longa_sem.png (SHA-256 `372b771da8e77b1bb9af723ef064f8bbb2c0403ee678f01a91abf8cebea618b7`)
- cliente-fixture|story|real|curta|sem: fora das janelas: headline, apoio, logo · gate: REVISAO_HUMANA_NECESSARIA (tinta-fora-da-caixa:ACHADO_CRITICO, texto-sobre-assunto:NAO_COMPROVADA, piso-de-interface:ACHADO_CRITICO) · juiz acusaria: piso-de-interface (headline, servico, logo); fora-da-area-segura (headline, apoio, servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-fixture_story_real_curta_sem.png (SHA-256 `dc14b721cb25077f8716841e8aefc33379887d3099864e46da3eae17fb65a902`)
- cliente-fixture|story|real|longa|sem: fora das janelas: headline, apoio, logo · gate: REVISAO_HUMANA_NECESSARIA (texto-sobre-assunto:NAO_COMPROVADA, piso-de-interface:ACHADO_CRITICO) · juiz acusaria: piso-de-interface (headline, servico, logo); fora-da-area-segura (headline, apoio, servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-fixture_story_real_longa_sem.png (SHA-256 `14973683c7387190443ad40dcde15818199bf71246fb25622ef0c6d1528941f9`)

## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — 26 para inspeção humana
(26 só com motivos NÃO COMPROVADOS — o gate não mediu; 0 com ACHADO_CRITICO — o gate mediu e o juiz discorda)
- cliente-00|feed|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_A1_curta_sem.png (SHA-256 `222e921687ab39ea9e5d8b2ce6b24676b0e0efebd83983252ebf3019721fd1a7`)
- cliente-00|feed|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_A1_longa_sem.png (SHA-256 `3f626f75961fa0e481b19abaadbee16e7cef94be46c13006535c535c83febd69`)
- cliente-00|feed|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_A2_curta_sem.png (SHA-256 `c984f7c974005cf8f12a40bb994afe4e8d0ef67f9b94715d1e8482082260ffdc`)
- cliente-00|feed|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_A2_longa_sem.png (SHA-256 `e952e35edde3b5cec4947273ab35d0823a8e5730ba28c8f0416be1eb916941d2`)
- cliente-00|feed|B|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_B_curta_sem.png (SHA-256 `ab1e2acceb5b691fb6bb100e84e862dfa8deb72afca892305c5bfc173d1fcf72`)
- cliente-00|feed|B|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_B_longa_sem.png (SHA-256 `0a43a07d4dbcd09a8e5e8351d955ff52a8f2011fcb78842c8f30e1524b77a49a`)
- cliente-00|feed|C|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_C_curta_sem.png (SHA-256 `922939f6724f373079ba8c01f6eab5304cf7812036fdf1dd29101ad46915c2d8`)
- cliente-00|feed|D|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_D_curta_sem.png (SHA-256 `b0471bc976d08be9fe804dfbd123e6c2dab209a20cf31adde9f1cd6696c8558f`)
- cliente-00|feed|D|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_D_longa_sem.png (SHA-256 `e3ea1e2f4f4efd49372ec483b012550ded1a08fc7598602c92be428926828b38`)
- cliente-00|feed|E|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_E_curta_sem.png (SHA-256 `cfce78d5d4ed420c8e7c1a1e8e99a89992ccdbec721aadf52b87a672f3d3bfbd`)
- cliente-00|feed|E|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_E_longa_sem.png (SHA-256 `a05cea5446429755e2d7930c5e34ade8a8046173cc9787b59ffe6c53638d78aa`)
- cliente-00|feed|F|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_F_curta_sem.png (SHA-256 `6f3c25ca35e4b2e9cdfcb2f7e34bf59b6b43e1465d2d3fccfe3eb49c7194939e`)
- cliente-00|feed|F|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_feed_F_longa_sem.png (SHA-256 `0aa30936cc55a1b4ccebdfe45ffcf8c2592206684cc1eb4cd2a6efc950809352`)
- cliente-00|story|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_A1_curta_sem.png (SHA-256 `94c4f30032afe6698ae5a2ddfa7740aacf263d0e9d75de3c2d74c62ac59937a4`)
- cliente-00|story|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_A1_longa_sem.png (SHA-256 `6d9fa50e3cc4ea9dfa3c6f7778352918aafd735c193ed2613fa842db4daef03a`)
- cliente-00|story|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_A2_curta_sem.png (SHA-256 `08fc74e70f0ed418fbcbfef2f4fd14a5bef100053df55fca843609a723c973f4`)
- cliente-00|story|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_A2_longa_sem.png (SHA-256 `4134f3f8dcf96fa6405acea7488a4a0d8708aa4f0466ebb9f5ae88980deb0e82`)
- cliente-00|story|B|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_B_curta_sem.png (SHA-256 `0fd46d78fa58bcb06403d99133e165b85cb7beb068bd7eaf60907e14dc6f2ae7`)
- cliente-00|story|B|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_B_longa_sem.png (SHA-256 `bf5497111c244e2bacb4c0de420e748debc685c8151d64da5f35ca184693167a`)
- cliente-00|story|C|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_C_curta_sem.png (SHA-256 `4a911d92a575aaf02fce52d8817585ddc98e3c56c756419f6b0dfb8cb0539719`)
- cliente-00|story|D|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_D_curta_sem.png (SHA-256 `0c11ddc7af6ef11b506f619f4bafa8fdbf7a8adf271e7d28cf17c99b7975cc04`)
- cliente-00|story|D|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_D_longa_sem.png (SHA-256 `375226b5e95886172c0e85695ea91b1b3c086aa9710f9462c088f2741910d8b4`)
- cliente-00|story|E|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_E_curta_sem.png (SHA-256 `568b2088e3e4fb7d17d57a4e269e68e3eef000224799abc22e950202ddd07146`)
- cliente-00|story|E|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_E_longa_sem.png (SHA-256 `77d747eb8da24384424d38762979212cd7a3a23061c8b0eb66f887b7d7c1648a`)
- cliente-00|story|F|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_F_curta_sem.png (SHA-256 `9f41ce60cd2f5d31c6573090a091d39e7f84ed3184adf3885342b1bd4bbeb3b4`)
- cliente-00|story|F|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo-caso-c-humano/png/cliente-00_story_F_longa_sem.png (SHA-256 `ba704776413798a17dd076a7612dfb548b4d09a9973611cfcbf2915395cfb26e`)

## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95) — a peça principal (compor…png), a leitura pareada, a repetição e a injeção em linhas próprias
| etapa | renders med | renders p95 | ms med | ms p95 |
|---|---|---|---|---|
| compor | 3 | 3 | 608 | 1426 |
| revisar | 4 | 4 | 766 | 1896 |
| ajustar | 0 | 0 | 0 | 0 |
| agendar | 2 | 2 | 386 | 965 |
| juizes | 2 | 2 | 363 | 888 |
| png | 1 | 1 | 132 | 379 |
| pareada | 0 | 9 | 31 | 3606 |
| repeticao | 0 | 10 | 34 | 4054 |
| injecao | 4 | 4 | 262 | 402 |
| modoG | 6 | 6 | 2266 | 2480 |
Renders somados por etapa: 1426 · observados pelo contador do renderer na rodada: 1426.

## 6. Estabilidade: exceções 0 · nao-medida 0 · sem-vinculo 0 · timeouts 0

## 7. Repetibilidade: 100.0 % (126/126) iguais (compostas: impressão COMPLETA do gate final sem medidoEm, camadas normalizadas e hash do PNG; recusas estruturais: o mesmo código)

## 8. Decisão 1 — assunto estimado × catálogo × verdade (72 peças com verdade): IoU est×cat 0.30 · est×verdade 0.30 · cat×verdade 1.00 · o estimado acertou a invasão em 0 e errou em 12
A linha D é o gate DEPOIS da falha de leitura injetada (as mesmas peças também aparecem no seu caso de origem).
| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |
|---|---|---|---|---|
| A-catalogo | 2 | 0 | 0 | 0 |
| B-estimado | 12 | 12 | 12 | 0 |
| C-sem-assunto-localizavel | 30 | 30 | 0 | 0 |
| D-falha-de-leitura | 12 | 12 | 6 | 0 |
| E-sem-foto | 6 | 0 | 0 | 0 |

## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): 0; `oclusao` não comprovada no gate: 0
Cenário INJETADO (shape acima da headline em peça APTA): 4 injeções, 4 recusadas pelo gate — motivos: oclusao:NAO_MEDIDO 4.
Modo G (falha de leitura injetada): 12 leituras, 12 válidas (12 recusadas pelo REVISOR e pelo PRODUTOR — item desligado, sem DRAFT na página, resposta REVISAO_HUMANA_NECESSARIA por texto-sobre-assunto e nenhum post criado), 0 inválidas (cache usado).

## 10. O que NÃO está coberto por juiz (inspeção humana nos PNGs amostrados)
- colisao — mesma-medida: só checkTextGeometry mede — repetir não é juiz
- texto-cortado — mesma-medida: idem
- tinta-fora-da-caixa — mesma-medida: idem
- texto-pequeno — nao-coberta: sem juiz externo
- copy-completa — nao-coberta: sem juiz externo
- identidade — nao-coberta: sem juiz externo
- oclusao — nao-coberta: só nos cenários injetados
- fonte-nao-carregada — nao-coberta: fontes declaradas presentes; fora do lote
