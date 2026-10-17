# Piloto sintético de autonomia — resumo da rodada padrao-caso-c-humano (2026-10-17)

HEAD `5afe09e4` · lote `piloto-sintetico-cdce41047cff` · ambiente darwin arm64 node v22.23.3 · relatório integral: `human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/relatorio.json` (SHA-256 `a9faff314196673472c441c3a941ec9badbaf79d1444f0bc591ef01d2a74e931`).

**O que este piloto NÃO mede** (ao lado do veredito, sempre): fontes da marca não instaladas (declaradas presentes; render com fonte de reserva); a visão (gpt-5.2) não roda; fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1); banco falso com travas: travas/SQL reais e Blob não provados; custo medido nesta máquina, não na Vercel; clientes: cliente-00, cliente-fixture (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2).

## Denominadores
elegíveis 126 → peças da rodada 42 → compostas 25 (recusas estruturais 17, erros 0) → chegaram ao gate e foram MEDIDAS 23 → APTAS na v1 4 → APTAS ao fim 4 → DRAFTs 4.
Desfechos BRUTOS do fluxo (incluem as 2 peças NÃO MEDIDAS, fora das janelas fiéis — § 3b): chegaram ao gate 25 · APTAS ao fim 4 · DRAFTs 4. As seções 1–4 e 8 são sobre as peças MEDIDAS; custo (5), estabilidade (6) e repetibilidade (7) cobrem todas as peças da rodada.
Exclusões do lote por motivo (não são peças): arquetipo-indisponivel 78 · arquetipo-exige-assunto 108 · arquetipo-sem-formato 0.

## 1. Taxa APTO por eixo, peças MEDIDAS (v1 composta · ao fim dos ciclos · DRAFT)
### cliente
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| cliente-00 | 21 | 19.0 % (4/21) | 19.0 % (4/21) | 19.0 % (4/21) |
| cliente-fixture | 2 | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
### formato
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| feed | 17 | 17.6 % (3/17) | 17.6 % (3/17) | 17.6 % (3/17) |
| story | 6 | 16.7 % (1/6) | 16.7 % (1/6) | 16.7 % (1/6) |
### foto
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| A1 | 3 | 33.3 % (1/3) | 33.3 % (1/3) | 33.3 % (1/3) |
| A2 | 2 | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| B | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| C | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| D | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| E | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| F | 3 | 0.0 % (0/3) | 0.0 % (0/3) | 0.0 % (0/3) |
| sem-foto | 3 | 100.0 % (3/3) | 100.0 % (3/3) | 100.0 % (3/3) |
### copy
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| curta | 15 | 20.0 % (3/15) | 20.0 % (3/15) | 20.0 % (3/15) |
| longa | 8 | 12.5 % (1/8) | 12.5 % (1/8) | 12.5 % (1/8) |
### arquetipo
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| minimal-fb-centro-optico | 1 | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) |
| sem | 22 | 13.6 % (3/22) | 13.6 % (3/22) | 13.6 % (3/22) |

## 2. Motivos de revisão humana (gate final) por regra × código
| regra | ACHADO_CRITICO | NAO_COMPROVADA | NAO_MEDIDO | IDENTIDADE_ILEGIVEL |
|---|---|---|---|---|
| piso-de-interface | 2 | 0 | 0 | 0 |
| texto-sem-leitura | 1 | 0 | 0 | 0 |
| texto-sobre-assunto | 0 | 19 | 0 | 0 |
| tinta-fora-da-caixa | 2 | 0 | 0 | 0 |

### 2b. Motivos de revisão humana por cliente (gate final)
| cliente | piso-de-interface | texto-sem-leitura | texto-sobre-assunto | tinta-fora-da-caixa |
|---|---|---|---|---|
| cliente-00 | 0 | 1 | 17 | 0 |
| cliente-fixture | 2 | 0 | 2 | 2 |

## 3. Falso APTO (gate APTO ∧ juiz coberto acusa, só peças MEDIDAS) — NENHUM nas regras cobertas

### 3b. Peças NÃO MEDIDAS (caixas fora das janelas fiéis da foto da fixture) — 2; indício, nunca contado
- cliente-00|story|real|curta|sem: fora das janelas: headline, servico, logo · gate: REVISAO_HUMANA_NECESSARIA (texto-sobre-assunto:NAO_COMPROVADA) · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_story_real_curta_sem.png (SHA-256 `d7a0cdbb5abd4d4feac47e4c61dda0ed8208e53889987e008920b75af0282dd0`)
- cliente-00|story|real|longa|sem: fora das janelas: headline, apoio, servico, logo · gate: REVISAO_HUMANA_NECESSARIA (texto-sobre-assunto:NAO_COMPROVADA) · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_story_real_longa_sem.png (SHA-256 `372b771da8e77b1bb9af723ef064f8bbb2c0403ee678f01a91abf8cebea618b7`)

## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — 16 para inspeção humana
(16 só com motivos NÃO COMPROVADOS — o gate não mediu; 0 com ACHADO_CRITICO — o gate mediu e o juiz discorda)
- cliente-00|feed|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_A1_curta_sem.png (SHA-256 `222e921687ab39ea9e5d8b2ce6b24676b0e0efebd83983252ebf3019721fd1a7`)
- cliente-00|feed|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_A1_longa_sem.png (SHA-256 `3f626f75961fa0e481b19abaadbee16e7cef94be46c13006535c535c83febd69`)
- cliente-00|feed|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_A2_curta_sem.png (SHA-256 `c984f7c974005cf8f12a40bb994afe4e8d0ef67f9b94715d1e8482082260ffdc`)
- cliente-00|feed|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_A2_longa_sem.png (SHA-256 `e952e35edde3b5cec4947273ab35d0823a8e5730ba28c8f0416be1eb916941d2`)
- cliente-00|feed|B|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_B_curta_sem.png (SHA-256 `ab1e2acceb5b691fb6bb100e84e862dfa8deb72afca892305c5bfc173d1fcf72`)
- cliente-00|feed|B|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_B_longa_sem.png (SHA-256 `0a43a07d4dbcd09a8e5e8351d955ff52a8f2011fcb78842c8f30e1524b77a49a`)
- cliente-00|feed|C|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_C_curta_sem.png (SHA-256 `922939f6724f373079ba8c01f6eab5304cf7812036fdf1dd29101ad46915c2d8`)
- cliente-00|feed|D|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_D_curta_sem.png (SHA-256 `b0471bc976d08be9fe804dfbd123e6c2dab209a20cf31adde9f1cd6696c8558f`)
- cliente-00|feed|D|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_D_longa_sem.png (SHA-256 `e3ea1e2f4f4efd49372ec483b012550ded1a08fc7598602c92be428926828b38`)
- cliente-00|feed|E|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_E_curta_sem.png (SHA-256 `cfce78d5d4ed420c8e7c1a1e8e99a89992ccdbec721aadf52b87a672f3d3bfbd`)
- cliente-00|feed|E|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_E_longa_sem.png (SHA-256 `a05cea5446429755e2d7930c5e34ade8a8046173cc9787b59ffe6c53638d78aa`)
- cliente-00|feed|F|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_F_curta_sem.png (SHA-256 `6f3c25ca35e4b2e9cdfcb2f7e34bf59b6b43e1465d2d3fccfe3eb49c7194939e`)
- cliente-00|feed|F|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_feed_F_longa_sem.png (SHA-256 `0aa30936cc55a1b4ccebdfe45ffcf8c2592206684cc1eb4cd2a6efc950809352`)
- cliente-00|story|B|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_story_B_curta_sem.png (SHA-256 `0fd46d78fa58bcb06403d99133e165b85cb7beb068bd7eaf60907e14dc6f2ae7`)
- cliente-00|story|D|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_story_D_curta_sem.png (SHA-256 `0c11ddc7af6ef11b506f619f4bafa8fdbf7a8adf271e7d28cf17c99b7975cc04`)
- cliente-00|story|F|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao-caso-c-humano/png/cliente-00_story_F_curta_sem.png (SHA-256 `9f41ce60cd2f5d31c6573090a091d39e7f84ed3184adf3885342b1bd4bbeb3b4`)

## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95) — a peça principal (compor…png), a leitura pareada, a repetição e a injeção em linhas próprias
| etapa | renders med | renders p95 | ms med | ms p95 |
|---|---|---|---|---|
| compor | 3 | 3 | 529 | 1172 |
| revisar | 4 | 4 | 642 | 1466 |
| ajustar | 0 | 0 | 0 | 0 |
| agendar | 2 | 2 | 317 | 743 |
| juizes | 2 | 2 | 293 | 710 |
| png | 1 | 1 | 108 | 310 |
| pareada | 0 | 9 | 23 | 2449 |
| repeticao | 10 | 10 | 569 | 3214 |
| injecao | 4 | 4 | 241 | 323 |
| modoG | 6 | 6 | 1588 | 2241 |
Renders somados por etapa: 649 · observados pelo contador do renderer na rodada: 649.

## 6. Estabilidade: exceções 0 · nao-medida 0 · sem-vinculo 0 · timeouts 0

## 7. Repetibilidade: 100.0 % (42/42) iguais (compostas: impressão COMPLETA do gate final sem medidoEm, camadas normalizadas e hash do PNG; recusas estruturais: o mesmo código)

## 8. Decisão 1 — assunto estimado × catálogo × verdade (24 peças com verdade): IoU est×cat 0.29 · est×verdade 0.29 · cat×verdade 1.00 · o estimado acertou a invasão em 0 e errou em 4
A linha D é o gate DEPOIS da falha de leitura injetada (as mesmas peças também aparecem no seu caso de origem).
| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |
|---|---|---|---|---|
| A-catalogo | 1 | 0 | 0 | 0 |
| B-estimado | 4 | 4 | 4 | 0 |
| C-sem-assunto-localizavel | 15 | 15 | 0 | 0 |
| D-falha-de-leitura | 5 | 5 | 2 | 0 |
| E-sem-foto | 3 | 0 | 0 | 0 |

## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): 0; `oclusao` não comprovada no gate: 0
Cenário INJETADO (shape acima da headline em peça APTA): 3 injeções, 3 recusadas pelo gate — motivos: oclusao:NAO_MEDIDO 3.
Modo G (falha de leitura injetada): 5 leituras, 5 válidas (5 recusadas pelo REVISOR e pelo PRODUTOR — item desligado, sem DRAFT na página, resposta REVISAO_HUMANA_NECESSARIA por texto-sobre-assunto e nenhum post criado), 0 inválidas (cache usado).

## 10. O que NÃO está coberto por juiz (inspeção humana nos PNGs amostrados)
- colisao — mesma-medida: só checkTextGeometry mede — repetir não é juiz
- texto-cortado — mesma-medida: idem
- tinta-fora-da-caixa — mesma-medida: idem
- texto-pequeno — nao-coberta: sem juiz externo
- copy-completa — nao-coberta: sem juiz externo
- identidade — nao-coberta: sem juiz externo
- oclusao — nao-coberta: só nos cenários injetados
- fonte-nao-carregada — nao-coberta: fontes declaradas presentes; fora do lote
