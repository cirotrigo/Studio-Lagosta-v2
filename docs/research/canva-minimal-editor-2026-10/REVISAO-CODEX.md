# Revisão adversarial do Codex

> `codex exec -s read-only -m gpt-6-sol -c model_reasoning_effort=high`, 14/10/2026, sobre os documentos desta pasta e o
> worktree em `origin/main` `1cab1ab8`. Revisão estática (sem app, testes, banco ou rede); ~200 mil tokens.
> As afirmações de código dos achados 5, 6, 9 e 10 foram **reconferidas por mim** antes de corrigir o plano.

## 1. As 15 perguntas

| # | Pergunta | Veredito do Codex | Resumo |
|---|---|---|---|
| 1 | Arquitetura paralela ao editor? | **OK** (ressalva) | reutiliza `shape`, `Page.layers` e os ramos `svg-path`; `/gerar-criativo` e desktop precisam de decisão |
| 2 | VectorLayer é necessário? | **OK** | como conceito sim; como `type` novo não |
| 3 | Forma melhor de reutilizar a layer? | **OK** | estender `ShapeDefinition` e copiar o desenho para a camada segue a inserção atual |
| 4 | Color slots cabem no modelo? | **RISCO** | `fill`/`strokeColor` cabem, mas a canonização grava `rgba` e `hexValido` recusa `rgba` e `transparent` |
| 5 | SVG quebra o servidor? | **RISCO** | trocar parser e traçado de todos os paths exige comparação real de pixels; a miniatura avulsa não injeta `Path2D` |
| 6 | SVG quebra o desktop? | **PROBLEMA** | o normalizador não leva `pathData`/`vetor`; o PUT apaga páginas ausentes; a guarda vinha tarde |
| 7 | `Page.layers` backward compatible? | **PROBLEMA** na afirmação ampla | legível sim; pixels não todos iguais (`fillRule` no editor, parser, traço) |
| 8 | Arquétipo no banco? | **OK** | não precisa de tabela |
| 9 | Arquétipo como código? | **RISCO** | só `id` + `versao` não reproduz receita antiga se o código mudar |
| 10 | Materialização bem definida? | **PROBLEMA** | `ancora`/`alinha` não implementam as zonas fracionárias; a área segura efetiva vem da página da marca |
| 11 | BrandColor duplicada? | **OK** no modelo | mas trocar os resolvedores do halo não preserva o comportamento |
| 12 | XSS/SVG injection? | **RISCO** | `pathData` não executa, mas o PATCH aceita qualquer camada; logo SVG já sobe cru |
| 13 | Checkpoint grande demais? | **PROBLEMA** | CP-T1 juntava spec, posição, acento, logo, recomposição e 4 interfaces MCP |
| 14 | Faltam testes de render? | **PROBLEMA** | sem comparação editor × PNG publicado na mesma fixture; sem `/gerar-criativo` e push do desktop |
| 15 | O MVP é mínimo? | **PROBLEMA** | 6 PRs sem Layouts nem celular: não entrega a experiência de editor descrita |

## 2. Os 12 achados e o que foi feito

| # | Grav. | Achado | Decisão | Onde mudou |
|---|---|---|---|---|
| 1 | alta | Mudança de pixel subcontada (CP-V0 também muda `fillRule` no editor e o parser) | **Aceito.** Inventário de diferenças obrigatório antes do deploy; 3 mudanças listadas; `laterPostId` intocável | PLANO §0, §18, CP-V0; ARQUITETURA-VETORES §5 |
| 2 | alta | `/gerar-criativo` publica retângulo no lugar de vetor | **Aceito.** CP-X1 vira **P0 antes do CP-V2** (desenhar pelo traçado, recusar ou aposentar) | PLANO CP-X1, §22 |
| 3 | alta | Guarda do desktop tarde e só de camadas | **Aceito.** CP-X0 vira **P0 antes do CP-V2**, protege camadas **e** páginas (ou aposentar o push) | PLANO CP-X0, §19; ARQUITETURA-VETORES §5 |
| 4 | alta | Validação de path não alcança o PATCH (porta principal) | **Aceito.** Novo **CP-X2**: validação nas 4 portas, com varredura prévia para não travar o autosave | PLANO CP-X2, §15, §16; ARQUITETURA-VETORES §6.8 |
| 5 | alta | Resolvedor novo não é equivalente ao do halo (véu da página primeiro) | **Aceito** (reconferido em `fundo-de-texto.ts:348-365`). Resolvedor novo **só para vetores**; unificação vira P2 (CP-V7) com fixtures reais | PLANO §10, CP-V3, CP-V7; ARQUITETURA-VETORES §4.2 |
| 6 | alta | `medir-copy` perderia o arquétipo | **Aceito** (reconferido em `medir-copy-service.ts:72-83`: só `variante` e `arranjos`). Entra no CP-T1a com teste medir = compor | PLANO §20, CP-T1a |
| 7 | média | Receita versionada não reproduzível | **Aceito.** Preferências efetivas e acento **congelados na spec**; recomposição não relê o catálogo; versão publicada imutável | PLANO §12, CP-T1a/T1b; ARQUITETURA-EDITOR-PROPOSTA §6 |
| 8 | média | CP-V2 inseria com a cor de vitrine antes do resolvedor (CP-V3) | **Aceito.** Resolvedor mínimo nasce no CP-V2; CP-V3 fica só UI | PLANO CP-V2, CP-V3 |
| 9 | média | Preset não garante as zonas; área segura efetiva vem da página | **Aceito** (reconferido em `assinatura.ts:415-427`). Restrições = preferências efetivas + acento; zonas = alvo de QA com aviso; geometria efetiva da marca | PLANO §11, §12, CP-T0; CATALOGO (nota de topo); ARQUITETURA-EDITOR-PROPOSTA §6 |
| 10 | média | Rota "Usar layout" sem contrato | **Aceito** (reconferido `somenteAvaliar`, `compor.ts:1148`). Contrato de entrada, erros, foto, textos, placeholders, ordem e teste de página reaberta | PLANO CP-T2 |
| 11 | média | Teste de paridade parava antes da publicação | **Aceito.** Função de desenho pura única + **fixture comum** desenhada pelo `CanvasRenderer`, pela miniatura avulsa, pelo caminho do post e pelo `/gerar-criativo`; comparação manual editor × servidor | PLANO §7, §17 |
| 12 | média | Escopo do MVP diverge do critério | **Aceito.** MVP declarado como **duas entregas** (MVP-V editor web desktop; MVP-T composição por MCP) com critérios próprios; Layouts e celular explicitamente P1 | PLANO §23 |

Também atendido: pergunta 13 — o CP-T1 foi dividido em **CP-T1a** (spec, MCP, `medir-copy`, recomposição) e **CP-T1b**
(acento, `ver-assinatura`), e o logo `topo-centro` saiu do MVP (preset #3 usa o canto mais calmo). Pergunta 4 — três
estados de cor separados e leitor único `lerCor` (ARQUITETURA-VETORES §3.3; PLANO §8). Pergunta 12 — o risco do logo SVG
cru foi registrado como item fora do escopo (ARQUITETURA-VETORES §6.9; PLANO §16).

## 3. O que não mudou (e por quê)

- A decisão central (estender `shape`/`svg-path`, sem `type` novo; arquétipo como código no compositor; cor congelada
  com papel como proveniência) foi confirmada pelas perguntas 1, 2, 3, 8 e 11.
- O MVP continua sem aba Layouts e sem celular — o achado 12 pedia escolher entre declarar isso ou trazer as duas
  interfaces; a escolha foi **declarar**, para manter o MVP pequeno e com critérios verificáveis.
