# Piloto sintético de autonomia — resumo da rodada completo (2026-10-17)

HEAD `6c63620a` · lote `piloto-sintetico-fce97e844ba6` · ambiente darwin arm64 node v22.23.3 · relatório integral: `human-output/relatorios/piloto-sintetico/2026-10-17-completo/relatorio.json` (SHA-256 `b611b2f0c37b87728330ef8842fa971258b11dc13de3c1c0565d3cc4495a0c8f`).

**O que este piloto NÃO mede** (ao lado do veredito, sempre): fontes da marca não instaladas (declaradas presentes; render com fonte de reserva); a visão (gpt-5.2) não roda; fotos SINTÉTICAS + a real anonimizada de 13/10 — lote CONTROLADO, não representativo das fotos dos clientes (decisão 5.1); banco falso com travas: travas/SQL reais e Blob não provados; custo medido nesta máquina, não na Vercel; clientes: cliente-00, cliente-fixture (fixtures reais pseudonimizadas aguardam a lista do owner — decisão 5.2).

## Denominadores
elegíveis 126 → peças da rodada 126 → compostas 54 (recusas estruturais 72, erros 0) → chegaram ao gate 54 → APTAS na v1 26 → APTAS ao fim 26 → DRAFTs 26.

## 1. Taxa APTO por eixo (v1 composta · ao fim dos ciclos · DRAFT)
### cliente
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| cliente-00 | 36 | 72.2 % (26/36) | 72.2 % (26/36) | 72.2 % (26/36) |
| cliente-fixture | 18 | 0.0 % (0/18) | 0.0 % (0/18) | 0.0 % (0/18) |
### formato
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| feed | 18 | 72.2 % (13/18) | 72.2 % (13/18) | 72.2 % (13/18) |
| story | 36 | 36.1 % (13/36) | 36.1 % (13/36) | 36.1 % (13/36) |
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
| real | 4 | 50.0 % (2/4) | 50.0 % (2/4) | 50.0 % (2/4) |
| sem-foto | 6 | 66.7 % (4/6) | 66.7 % (4/6) | 66.7 % (4/6) |
### copy
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| curta | 28 | 53.6 % (15/28) | 53.6 % (15/28) | 53.6 % (15/28) |
| longa | 26 | 42.3 % (11/26) | 42.3 % (11/26) | 42.3 % (11/26) |
### arquetipo
| valor | peças | APTO v1 | APTO final | DRAFT |
|---|---|---|---|---|
| minimal-fb-centro-optico | 2 | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| sem | 52 | 46.2 % (24/52) | 46.2 % (24/52) | 46.2 % (24/52) |

## 2. Motivos de revisão humana (gate final) por regra × código
| regra | ACHADO_CRITICO | NAO_COMPROVADA | NAO_MEDIDO | IDENTIDADE_ILEGIVEL |
|---|---|---|---|---|
| piso-de-interface | 18 | 0 | 0 | 0 |
| texto-sem-leitura | 4 | 0 | 0 | 0 |
| texto-sobre-assunto | 0 | 12 | 0 | 0 |
| tinta-fora-da-caixa | 9 | 0 | 0 | 0 |

## 3. Falso APTO (gate APTO ∧ juiz coberto acusa) — **2** — o piloto é INSATISFATÓRIO por definição
- cliente-00|story|real|curta|sem: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_real_curta_sem.png
- cliente-00|story|real|longa|sem: texto-sobre-assunto (servico) — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_real_longa_sem.png

## 4. Candidatos a falso bloqueio (gate recusa ∧ nenhum juiz coberto acusa) — 8 para inspeção humana
(8 só com motivos NÃO COMPROVADOS — o gate não mediu; 0 com ACHADO_CRITICO — o gate mediu e o juiz discorda)
- cliente-00|feed|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A1_curta_sem.png
- cliente-00|feed|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A1_longa_sem.png
- cliente-00|feed|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A2_curta_sem.png
- cliente-00|feed|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_feed_A2_longa_sem.png
- cliente-00|story|A1|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A1_curta_sem.png
- cliente-00|story|A1|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A1_longa_sem.png
- cliente-00|story|A2|curta|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A2_curta_sem.png
- cliente-00|story|A2|longa|sem: texto-sobre-assunto:NAO_COMPROVADA — human-output/relatorios/piloto-sintetico/2026-10-17-completo/png/cliente-00_story_A2_longa_sem.png

## 5. Custo por etapa (renders mediana/p95 · ms mediana/p95)
| etapa | renders med | renders p95 | ms med | ms p95 |
|---|---|---|---|---|
| compor | 3 | 3 | 597 | 1391 |
| revisar | 4 | 4 | 759 | 1837 |
| ajustar | 0 | 0 | 0 | 0 |
| agendar | 2 | 2 | 382 | 967 |
| juizes | 2 | 2 | 359 | 882 |
| png | 1 | 1 | 135 | 374 |

## 6. Estabilidade: exceções 0 · nao-medida 0 · sem-vinculo 0 · timeouts 0

## 7. Repetibilidade: 100.0 % (54/54) iguais (veredito, motivos, impressão, camadas normalizadas, hash do PNG)

## 8. Decisão 1 — assunto estimado × catálogo × verdade (72 peças com verdade): IoU est×cat 0.30 · est×verdade 0.30 · cat×verdade 1.00 · o estimado acertou a invasão em 0 e errou em 12
| caso (§ 4.2) | peças | bloqueadas por texto-sobre-assunto | das quais a verdade aprovaria | APTAS que a verdade reprovaria |
|---|---|---|---|---|
| A-catalogo | 2 | 0 | 0 | 0 |
| B-estimado | 6 | 6 | 6 | 0 |
| C-nao-se-aplica | 34 | 0 | 0 | 2 |
| D-falha-de-leitura | 6 | 6 | 6 | 0 |
| E-sem-foto | 6 | 0 | 0 | 0 |

## 9. Decisão 2 — peças com camada não-texto acima de texto (produzidas): 0; `oclusao` não comprovada no gate: 0
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
