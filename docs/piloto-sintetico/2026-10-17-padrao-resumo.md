# Piloto sintético de autonomia — resumo da rodada padrao (2026-10-17)

HEAD `e0384186` · lote `piloto-sintetico-3b5a315d803d` · ambiente darwin arm64 node v22.23.3 · relatório integral: `human-output/relatorios/piloto-sintetico/2026-10-17-padrao/relatorio.json` (SHA-256 `d4d9841a1b9e253fac16b12a191ff449bd984c52195dd5b8735fcdb3c5718f1c`).

**O que este piloto NÃO mede** (ao lado do veredito, sempre): fontes da marca não instaladas (declaradas presentes; render com fonte de reserva); a visão (gpt-5.2) não roda; fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1); banco falso com travas: travas/SQL reais e Blob não provados; custo medido nesta máquina, não na Vercel; clientes: cliente-00, cliente-fixture (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2).

## Denominadores
elegíveis 126 → peças da rodada 42 → compostas 25 (recusas estruturais 17, erros 0) → chegaram ao gate 25 → APTAS na v1 18 → APTAS ao fim 18 → DRAFTs 18. Peças NÃO MEDIDAS (fora das janelas fiéis): 2.
Exclusões do lote por motivo (não são peças): arquetipo-indisponivel 78 · arquetipo-exige-assunto 108 · arquetipo-sem-formato 0.

## 1. Taxa APTO por eixo (v1 composta · ao fim dos ciclos · DRAFT)
### cliente
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| cliente-00 | 23 | 78.3 % (18/23) | 78.3 % (18/23) | 78.3 % (18/23) |
| cliente-fixture | 2 | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
### formato
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| feed | 17 | 70.6 % (12/17) | 70.6 % (12/17) | 70.6 % (12/17) |
| story | 8 | 75.0 % (6/8) | 75.0 % (6/8) | 75.0 % (6/8) |
### foto
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| A1 | 3 | 33.3 % (1/3) | 33.3 % (1/3) | 33.3 % (1/3) |
| A2 | 2 | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| B | 3 | 100.0 % (3/3) | 100.0 % (3/3) | 100.0 % (3/3) |
| C | 3 | 33.3 % (1/3) | 33.3 % (1/3) | 33.3 % (1/3) |
| D | 3 | 100.0 % (3/3) | 100.0 % (3/3) | 100.0 % (3/3) |
| E | 3 | 66.7 % (2/3) | 66.7 % (2/3) | 66.7 % (2/3) |
| F | 3 | 100.0 % (3/3) | 100.0 % (3/3) | 100.0 % (3/3) |
| real | 2 | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| sem-foto | 3 | 100.0 % (3/3) | 100.0 % (3/3) | 100.0 % (3/3) |
### copy
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| curta | 16 | 75.0 % (12/16) | 75.0 % (12/16) | 75.0 % (12/16) |
| longa | 9 | 66.7 % (6/9) | 66.7 % (6/9) | 66.7 % (6/9) |
### arquetipo
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| minimal-fb-centro-optico | 1 | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) |
| sem | 24 | 70.8 % (17/24) | 70.8 % (17/24) | 70.8 % (17/24) |

## 2. Motivos de revisão humana (gate final) por regra × código
| regra | ACHADO_CRITICO | NAO_COMPROVADA | NAO_MEDIDO | IDENTIDADE_ILEGIVEL |
|---|---|---|---|---|
| piso-de-interface | 2 | 0 | 0 | 0 |
| texto-sem-leitura | 1 | 0 | 0 | 0 |
| texto-sobre-assunto | 0 | 4 | 0 | 0 |
| tinta-fora-da-caixa | 2 | 0 | 0 | 0 |

### 2b. Motivos de revisão humana por cliente (gate final)
| cliente | piso-de-interface | texto-sem-leitura | texto-sobre-assunto | tinta-fora-da-caixa |
|---|---|---|---|---|
| cliente-00 | 0 | 1 | 4 | 0 |
| cliente-fixture | 2 | 0 | 0 | 2 |

## 3. Falso APTO (gate APTO ∧ juiz coberto acusa, só peças MEDIDAS) — NENHUM nas peças MEDIDAS — mas 2 peça(s) NÃO MEDIDA(S) APTA(S) com o juiz acusando (§ 3b): INCONCLUSIVO sobre essa regra até as janelas da fixture cobrirem as caixas

### 3b. Peças NÃO MEDIDAS (caixas fora das janelas fiéis da foto da fixture) — 2; indício, nunca contado
- cliente-00|story|real|curta|sem: fora das janelas: headline, servico, logo · gate: APTO · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_story_real_curta_sem.png (SHA-256 `d7a0cdbb5abd4d4feac47e4c61dda0ed8208e53889987e008920b75af0282dd0`)
- cliente-00|story|real|longa|sem: fora das janelas: headline, apoio, servico, logo · gate: APTO · juiz acusaria: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_story_real_longa_sem.png (SHA-256 `372b771da8e77b1bb9af723ef064f8bbb2c0403ee678f01a91abf8cebea618b7`)

## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — 4 para inspeção humana
(4 só com motivos NÃO COMPROVADOS — o gate não mediu; 0 com ACHADO_CRITICO — o gate mediu e o juiz discorda)
- cliente-00|feed|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A1_curta_sem.png (SHA-256 `222e921687ab39ea9e5d8b2ce6b24676b0e0efebd83983252ebf3019721fd1a7`)
- cliente-00|feed|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A1_longa_sem.png (SHA-256 `3f626f75961fa0e481b19abaadbee16e7cef94be46c13006535c535c83febd69`)
- cliente-00|feed|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A2_curta_sem.png (SHA-256 `c984f7c974005cf8f12a40bb994afe4e8d0ef67f9b94715d1e8482082260ffdc`)
- cliente-00|feed|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A2_longa_sem.png (SHA-256 `e952e35edde3b5cec4947273ab35d0823a8e5730ba28c8f0416be1eb916941d2`)

## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95) — a peça principal (compor…png), a leitura pareada, a repetição e a injeção em linhas próprias
| etapa | renders med | renders p95 | ms med | ms p95 |
|---|---|---|---|---|
| compor | 3 | 3 | 533 | 1134 |
| revisar | 4 | 4 | 624 | 1460 |
| ajustar | 0 | 0 | 0 | 0 |
| agendar | 2 | 2 | 322 | 751 |
| juizes | 2 | 2 | 293 | 707 |
| png | 1 | 1 | 105 | 311 |
| pareada | 0 | 9 | 23 | 2296 |
| repeticao | 10 | 10 | 575 | 3173 |
| injecao | 4 | 4 | 321 | 1490 |
| modoG | 6 | 6 | 1506 | 1531 |
Renders somados por etapa: 643 · observados pelo contador do renderer na rodada: 643.

## 6. Estabilidade: exceções 0 · nao-medida 0 · sem-vinculo 0 · timeouts 0

## 7. Repetibilidade: 100.0 % (42/42) iguais (compostas: veredito, motivos, camadas normalizadas e hash do PNG; recusas estruturais: o mesmo código)

## 8. Decisão 1 — assunto estimado × catálogo × verdade (24 peças com verdade): IoU est×cat 0.29 · est×verdade 0.29 · cat×verdade 1.00 · o estimado acertou a invasão em 0 e errou em 4
| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |
|---|---|---|---|---|
| A-catalogo | 1 | 0 | 0 | 0 |
| B-estimado | 2 | 2 | 2 | 0 |
| C-nao-se-aplica | 15 | 0 | 0 | 0 |
| D-falha-de-leitura | 2 | 2 | 2 | 0 |
| E-sem-foto | 3 | 0 | 0 | 0 |

## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): 0; `oclusao` não comprovada no gate: 0
Cenário INJETADO (shape acima da headline em peça APTA): 6 injeções, 6 recusadas pelo gate — motivos: oclusao:NAO_MEDIDO 6.
Modo G (falha de leitura injetada): 2 leituras, 2 válidas (2 recusadas pelo gate), 0 inválidas (cache usado).

## 10. O que NÃO está coberto por juiz (inspeção humana nos PNGs amostrados)
- colisao — mesma-medida: só checkTextGeometry mede — repetir não é juiz
- texto-cortado — mesma-medida: idem
- tinta-fora-da-caixa — mesma-medida: idem
- texto-pequeno — nao-coberta: sem juiz externo
- copy-completa — nao-coberta: sem juiz externo
- identidade — nao-coberta: sem juiz externo
- oclusao — nao-coberta: só nos cenários injetados
- fonte-nao-carregada — nao-coberta: fontes declaradas presentes; fora do lote
