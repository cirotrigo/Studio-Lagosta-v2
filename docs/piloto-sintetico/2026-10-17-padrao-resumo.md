# Piloto sintético de autonomia — resumo da rodada padrao (2026-10-17)

HEAD `6c63620a` · lote `piloto-sintetico-fce97e844ba6` · ambiente darwin arm64 node v22.23.3 · relatório integral: `human-output/relatorios/piloto-sintetico/2026-10-17-padrao/relatorio.json` (SHA-256 `001fa00b349f2cd440e8896da07ff2f46b5a56d851b61b0d35b6d55d3a63f4ac`).

**O que este piloto NÃO mede** (ao lado do veredito, sempre): fontes da marca não instaladas (declaradas presentes; render com fonte de reserva); a visão (gpt-5.2) não roda; fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1); banco falso com travas: travas/SQL reais e Blob não provados; custo medido nesta máquina, não na Vercel; clientes: cliente-00, cliente-fixture (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2).

## Denominadores
elegíveis 126 → peças da rodada 42 → compostas 25 (recusas estruturais 17, erros 0) → chegaram ao gate 25 → APTAS na v1 18 → APTAS ao fim 18 → DRAFTs 18.

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

## 3. Falso APTO (gate APTO ∧ juiz coberto acusa) — **2** — o piloto é INSATISFATÓRIO por definição
- cliente-00|story|real|curta|sem: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_story_real_curta_sem.png
- cliente-00|story|real|longa|sem: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_story_real_longa_sem.png

## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — 4 para inspeção humana
(4 só com motivos NÃO COMPROVADOS — o gate não mediu; 0 com ACHADO_CRITICO — o gate mediu e o juiz discorda)
- cliente-00|feed|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A1_curta_sem.png
- cliente-00|feed|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A1_longa_sem.png
- cliente-00|feed|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A2_curta_sem.png
- cliente-00|feed|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-padrao/png/cliente-00_feed_A2_longa_sem.png

## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95)
| etapa | renders med | renders p95 | ms med | ms p95 |
|---|---|---|---|---|
| compor | 3 | 3 | 523 | 1138 |
| revisar | 4 | 4 | 626 | 1459 |
| ajustar | 0 | 0 | 0 | 0 |
| agendar | 2 | 2 | 323 | 749 |
| juizes | 2 | 2 | 289 | 728 |
| png | 1 | 1 | 105 | 312 |

## 6. Estabilidade: exceções 0 · nao-medida 0 · sem-vinculo 0 · timeouts 0

## 7. Repetibilidade: 100.0 % (25/25) iguais (veredito, motivos, impressão, camadas normalizadas, hash do PNG)

## 8. Decisão 1 — assunto estimado × catálogo × verdade (24 peças com verdade): IoU est×cat 0.29 · est×verdade 0.29 · cat×verdade 1.00 · o estimado acertou a invasão em 0 e errou em 4
| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |
|---|---|---|---|---|
| A-catalogo | 1 | 0 | 0 | 0 |
| B-estimado | 2 | 2 | 2 | 0 |
| C-nao-se-aplica | 17 | 0 | 0 | 2 |
| D-falha-de-leitura | 2 | 2 | 2 | 0 |
| E-sem-foto | 3 | 0 | 0 | 0 |

## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): 0; `oclusao` não comprovada no gate: 0
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
