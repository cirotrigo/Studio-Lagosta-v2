# Constituição de Design — especificação operacional (derivada)

> **Este documento NÃO substitui a Constituição.** O texto canônico é
> [`constituicao-design-v1.md`](constituicao-design-v1.md). Em qualquer divergência, vale o canônico.
> Aqui está só a **proposta** de como, no futuro, as regras humanas poderão virar critérios utilizáveis
> por um **agente criador** e por um **agente revisor**. Nada aqui está implementado.
>
> Escopo deliberado (12/10/2026): sem prompt, sem agente, sem visão computacional, sem REA. Rich-text
> continua fora (backlog #209). Este documento não altera o B1d.

## 1. Fluxo pretendido

```text
norma humana (constituicao-design-v1.md)
  → especificação operacional (este documento: uma entrada por regra)
  → agente CRIADOR  (usa as regras para decidir a solução)
  → agente REVISOR  (usa as MESMAS regras para avaliar o resultado, de forma independente)
```

## 2. Princípio soberano: prioridade de resolução, não licença

A Constituição (§2) fixa a ordem **FOTOGRAFIA → MENSAGEM → COMPOSIÇÃO → DNA DA MARCA → ORNAMENTAÇÃO**.

Operacionalmente, essa ordem é uma **prioridade de RESOLUÇÃO DE CONFLITOS COMPOSITIVOS**: quando duas
decisões de composição disputam o mesmo espaço, peso ou atenção, vence a de nível mais alto.

Ela **não autoriza violar a identidade factual da marca**. Os fatos de identidade continuam valendo em
qualquer composição — inclusive como proibições estruturais (P12 "DNA incorreto de outra marca.", P13
"Logo incorreta.", P02 "Logo deformada.", P09 "Informação factual divergente do briefing.").

| A fotografia PODE justificar                 | A fotografia NÃO justifica   |
| -------------------------------------------- | ---------------------------- |
| mover o título                               | fonte de outra marca         |
| trocar o alinhamento (R19)                   | logo errada                  |
| usar outra versão **aprovada** da logo (R86) | cor incompatível com a marca |
| reduzir grafismos (R88, R91, §38)            | informação factual incorreta |

O próprio texto sustenta essa leitura: R96 diz que o DNA não justifica ilegibilidade, falta de margem ou
assunto coberto; R51 diz que a tipografia segue prioritariamente o DNA. A ordem do §2 resolve conflitos
de composição; não rebaixa fatos de identidade a "ornamentação".

## 3. Precedência constitucional: P01–P14 prevalecem sobre as R-regras

**Em caso de conflito, as proibições estruturais P01–P14 prevalecem sobre qualquer R-regra.**

Fundamento no canônico (§32): "Qualquer proibição estrutural P01–P14 reprova a peça independentemente da
pontuação." Uma exceção prevista numa R-regra, portanto, não alcança uma P-regra.

Aplicação concreta: R02 admite que elementos gráficos atravessem olhos ou expressões quando há "uma
intenção editorial explícita"; P05 reprova "Olhos atravessados por texto ou elemento gráfico." **P05
prevalece**: a exceção editorial de R02 continua valendo para **expressões** (ex.: boca)
que não sejam olhos, mas não permite atravessar olhos.

## 4. Criador × revisor

Os dois agentes compartilham a **mesma** especificação, com papéis diferentes:

- **CRIADOR** — usa as regras para _decidir_ a solução (ordem do §29: mensagem → prioridade → foto →
  zonas → região → hierarquia → grid → tipografia → DNA → contraste → retirar → validar).
- **REVISOR** — avalia o _resultado final_ de forma independente. **Não confia na justificativa do
  criador**: a evidência vem da peça (camadas, PNG, foto original) e das fontes estruturadas externas
  (briefing, hierarquia da mensagem, registro editorial, DNA, perfil do formato), nunca do texto explicativo de quem criou.

Compartilham o contrato (as regras e as fontes estruturadas), não o julgamento: o revisor recalcula a sua
própria análise da peça final.

Toda reprovação automática futura deverá produzir:

| Campo              | Conteúdo                                                       |
| ------------------ | -------------------------------------------------------------- |
| `ruleId`           | ex.: `P10`                                                     |
| `evidencia`        | o que foi medido ou observado (valores, recortes, textos)      |
| `regiao`           | elemento(s) ou região afetada, quando aplicável (camada, bbox) |
| `confianca`        | 0–1                                                            |
| `explicacao`       | em linguagem humana, citando a regra                           |
| `correcaoSugerida` | a menor intervenção que resolve (R10, R16, R69, §38)           |

**Pontuação nunca compensa HARD_GATE** (§32).

## 5. Classes

Cada regra tem **uma única** `classePrimaria`. Características adicionais (condição de aplicação, ordem de
tentativas, pontuação ligada) ficam em campos separados — uma regra normativa não precisa pertencer a duas
classes para expressar uma estratégia interna.

| classePrimaria          | Significado operacional                                                                                                                                                                                                                                                                       | Base no canônico                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `HARD_GATE`             | Reprova a peça, independente da nota                                                                                                                                                                                                                                                          | §30 (P01–P14) e §32              |
| `INVARIANTE`            | Obrigação ou proibição textual ("é proibido", "nunca", "não poderá", "deve", "vem antes") **fora** da lista P. A violação exige correção; justificativa editorial só é saída nas regras cuja entrada admite exceção (`excecaoEditorialPermitida` diferente de `nao`). **Não** reprova sozinha | R-regras com linguagem normativa |
| `CRITERIO_DE_QUALIDADE` | Orienta a qualidade e entra na nota de 100 pontos (§31) e na classificação (§32), sem obrigação pontual                                                                                                                                                                                       | §31                              |
| `PREFERENCIA`           | Desempate entre soluções igualmente eficazes                                                                                                                                                                                                                                                  | §38                              |

> **Proposta, não texto canônico:** a Constituição só define consequência automática para P01–P14. A
> classe `INVARIANTE` é uma proposta deste documento para as regras normativas fora da lista P; elevar
> alguma delas a reprovação exigiria decisão explícita.

Campos adicionais (ver §7): `condicional` (a regra só se aplica sob uma condição do próprio texto, ex.:
R03 "quando houver alternativa de composição"), `ordemDePreferencia` (uma sequência de tentativas que o
próprio texto ordena, ex.: R10, R16) e `pontuacaoRelacionada` (os itens do §31 afetados).

## 6. Classe constitucional × modo de aplicação

A classe diz **o que a Constituição exige**. O modo de aplicação diz **como o Studio consegue verificar
hoje**. São independentes: uma regra pode ser `HARD_GATE` constitucional e ainda **não** estar pronta para
reprovação automática.

| Campo                | Valores                                         |
| -------------------- | ----------------------------------------------- |
| `modoDeAplicacao`    | `AUTOMATICO` · `ASSISTIDO` · `HUMANO`           |
| `estadoDeCalibracao` | `NAO_CALIBRADO` · `EM_CALIBRACAO` · `CALIBRADO` |

- `AUTOMATICO`: o sistema decide sozinho, com evidência.
- `ASSISTIDO`: o sistema mede e aponta; uma pessoa confirma.
- `HUMANO`: a verificação é humana; o sistema só organiza o checklist e as evidências disponíveis.

**`confiancaMinimaParaReprovar` só produz reprovação automática quando `modoDeAplicacao = AUTOMATICO` e
`estadoDeCalibracao = CALIBRADO`.** Em qualquer outro estado, uma violação de HARD_GATE detectada vira
alerta para confirmação humana — a peça não segue como aprovada, mas a reprovação não é automática.

Nenhum limiar numérico é proposto agora: todos os exemplos estão `NAO_CALIBRADO` e
`confiancaMinimaParaReprovar` fica "a definir na calibração". O `modoDeAplicacao` dos exemplos é o
**inicial proposto**, não o definitivo.

## 7. Schema operacional proposto

```yaml
ruleId: string # "R01".."R103", "P01".."P14" — exatamente como no canônico
titulo: string # o título curto do canônico, quando houver
textoCanonico: string # CITAÇÃO literal do canônico (nunca paráfrase)
secao: string # ex.: "4. MAPA DE PROTEÇÃO DA FOTOGRAFIA"
classePrimaria: HARD_GATE | INVARIANTE | CRITERIO_DE_QUALIDADE | PREFERENCIA
condicional: boolean # a regra só vale sob uma condição do próprio texto
condicaoDeAplicacao?: string # a condição, quando condicional = true
ordemDePreferencia?: [string] # sequência de tentativas ordenada pelo próprio texto
categoria: fotografia | hierarquia | composicao | espacamento | tipografia | contraste_cor | dna | simplicidade | factual | formato
severidade: bloqueante | alta | media | baixa
objetoObservado: string # o que precisa ser observado na peça
condicao: string # quando a regra é violada, em termos observáveis
fonteDaEvidencia: # de onde a evidência vem
  - camadas # Page.layers: geometria, fontes, cores, visibilidade
  - render # PNG final: pixels, contraste local
  - fotoOriginal # comparação foto original × arte final (§36)
  - analiseDaFoto # o modelo de dados da §12 (assunto, zonas, direção...)
  - hierarquiaDaMensagem # H1/H2/H3/serviço/marca declarados (ver §10)
  - briefing # fatos e informações obrigatórias estruturados (ver §10)
  - dna # BrandDNA: fontes, paleta, logo, padrões aprovados
  - perfilDoFormato # área segura e zonas de interface do formato/plataforma (ver §11)
  - registroEditorial # intenção editorial declarada para a peça (evidência preferida de "intenção")
  - fundoEfetivo # derivado de camadas + render: o fundo de cada bloco SEM a camada de texto (render sem ela, ou composição das camadas abaixo)
  - dnaDeOutrasMarcas # DNAs de outras marcas conhecidas (ex.: as marcas da carteira), para provar "de outra marca"
verificavelPorGeometria: sim | parcial | nao
dependeDeVisao: sim | parcial | nao # visão semântica (reconhecer rosto, prato, produto)
dependeDeBriefing: sim | parcial | nao
dependeDeDNA: sim | parcial | nao
percepcaoSubjetiva: sim | parcial | nao # depende de julgamento estético ainda não mensurável
limiaresIndefinidos: [string] # termos do texto sem medida
modoDeAplicacao: AUTOMATICO | ASSISTIDO | HUMANO
estadoDeCalibracao: NAO_CALIBRADO | EM_CALIBRACAO | CALIBRADO
confiancaMinimaParaReprovar: number | null # só HARD_GATE; só age com AUTOMATICO + CALIBRADO
exigeEvidencia: boolean # obrigatoriamente true em HARD_GATE com modoDeAplicacao AUTOMATICO
excecaoEditorialPermitida: nao | sim_com_evidencia_de_intencao | sim
acaoSugerida: string # a correção mínima, seguindo R10/R16/R69/§38
pontuacaoRelacionada?: [{ bloco: string, item: string, pontos: number }] # itens do §31
relacionadas: [ruleId]
observacoes?: string
```

Convenções:

- `textoCanonico` é sempre citação literal; a interpretação vai em `condicao`, `objetoObservado` e
  `observacoes`, nunca reescrevendo a regra.
- `excecaoEditorialPermitida: sim_com_evidencia_de_intencao` significa que o **registro editorial** (`registroEditorial`, no briefing ou numa marca editorial da peça) é a **evidência preferida** da intenção — a justificativa posterior do criador não é evidência. O canônico não exige que a intenção seja registrada antes: **sem evidência conclusiva sobre a intenção, a regra vai para avaliação humana, sem presumir violação**. Nenhuma exceção de R-regra alcança uma P-regra (§3).
- **Contrato de evidência:** todo `HARD_GATE` em `modoDeAplicacao = AUTOMATICO` exige `exigeEvidencia = true` e uma `fonteDaEvidencia` identificável que prove a condição **inteira** do enunciado (ex.: P12 exige provar "de outra marca", não só divergência do DNA). Quando a evidência não prova a condição inteira, o modo é `ASSISTIDO` ou `HUMANO`.

## 8. Exemplos representativos

Os enunciados em `textoCanonico` são citações literais do canônico. Em todos os exemplos:
`estadoDeCalibracao = NAO_CALIBRADO` e `confiancaMinimaParaReprovar = a definir na calibração` (só nos
HARD_GATE; nas demais classes é `null`).

### R01

| Campo                     | Valor                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "É proibido esconder o assunto principal apenas para facilitar a diagramação."                                                                                                                                                     |
| secao                     | 4 — Zona A                                                                                                                                                                                                                         |
| classePrimaria            | `INVARIANTE` · condicional: não                                                                                                                                                                                                    |
| categoria · severidade    | fotografia · alta                                                                                                                                                                                                                  |
| objetoObservado           | sobreposição de texto, logo, selo ou grafismo sobre o assunto principal                                                                                                                                                            |
| condicao                  | elemento gráfico encobre o assunto principal **apenas para facilitar a diagramação**. O motivo não é observável na peça: o encobrimento detectado é evidência para avaliação humana e não é marcado, sozinho, como violação de R01 |
| fonteDaEvidencia          | camadas + analiseDaFoto (máscara do assunto)                                                                                                                                                                                       |
| geometria · visão         | parcial (interseção bbox × máscara) · sim (identificar o assunto)                                                                                                                                                                  |
| briefing · DNA            | não · não                                                                                                                                                                                                                          |
| percepcaoSubjetiva        | não para o encobrimento; **sim** para "apenas para facilitar a diagramação" (o motivo não é observável na peça)                                                                                                                    |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                                                                                                                                                        |
| excecaoEditorialPermitida | `sim_com_evidencia_de_intencao` (R07: uso consciente da Zona A; registro editorial como evidência preferida; sem evidência conclusiva, avaliação humana)                                                                           |
| acaoSugerida              | reposicionar o conteúdo para Zona C, depois B (R06); reduzir texto (R16)                                                                                                                                                           |
| pontuacaoRelacionada      | A. Fotografia · assunto preservado · 8                                                                                                                                                                                             |
| relacionadas              | R04, R07, P04, P06, P07                                                                                                                                                                                                            |
| observacoes               | O revisor só vê o encobrimento. Quando ele é "significativo", o caso também é P06/P07 (HARD_GATE), que prevalece (§3) — e P06/P07 não têm exceção editorial.                                                                       |

### R03

| Campo                     | Valor                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Em gastronomia, não cobrir a região visualmente mais apetitosa do alimento quando houver alternativa de composição."                   |
| classePrimaria            | `INVARIANTE` · **condicional: sim** — condicaoDeAplicacao: "quando houver alternativa de composição" (e "Em gastronomia")               |
| categoria · severidade    | fotografia · alta                                                                                                                       |
| objetoObservado           | região mais apetitosa do alimento × elementos sobrepostos; existência de região alternativa (Zona C/B)                                  |
| condicao                  | elemento cobre a região mais apetitosa **e** existe outra região viável para o conteúdo                                                 |
| fonteDaEvidencia          | camadas + analiseDaFoto                                                                                                                 |
| geometria · visão         | parcial · **sim**                                                                                                                       |
| briefing · DNA            | não · não                                                                                                                               |
| percepcaoSubjetiva        | **sim** — "visualmente mais apetitosa" é julgamento estético; "houver alternativa" exige comparar outras composições, não só a entregue |
| modoDeAplicacao (inicial) | `HUMANO`                                                                                                                                |
| excecaoEditorialPermitida | não (a própria condição já delimita a regra)                                                                                            |
| acaoSugerida              | mover o bloco para a região alternativa; reduzir interferência (§40)                                                                    |
| pontuacaoRelacionada      | A. Fotografia · assunto preservado · 8                                                                                                  |
| relacionadas              | R12, §40, P07                                                                                                                           |

### R10

| Campo                     | Valor                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "O fato de texto branco funcionar sobre imagem escura não autoriza escurecer indiscriminadamente a fotografia inteira."                                                                   |
| classePrimaria            | `INVARIANTE` · condicional: não                                                                                                                                                           |
| ordemDePreferencia        | a lista ordenada do canônico ("Priorizar, nesta ordem:"): reposicionamento → redução do texto → mudança de cor → sombra sutil → gradiente localizado → overlay maior apenas se necessário |
| categoria · severidade    | fotografia · media                                                                                                                                                                        |
| objetoObservado           | overlays, gradientes e sombras: área coberta e intensidade; escurecimento global foto original × render                                                                                   |
| condicao                  | escurecimento da fotografia inteira quando uma intervenção anterior da ordemDePreferencia resolveria                                                                                      |
| fonteDaEvidencia          | camadas (tamanho e opacidade de overlay/gradiente) + render + fotoOriginal                                                                                                                |
| geometria · visão         | **sim** para "overlay cobre o quadro inteiro"; parcial para "indiscriminadamente" · não (comparação de luminância)                                                                        |
| briefing · DNA            | não · não                                                                                                                                                                                 |
| percepcaoSubjetiva        | parcial                                                                                                                                                                                   |
| limiaresIndefinidos       | "indiscriminadamente"                                                                                                                                                                     |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                                                                                                               |
| excecaoEditorialPermitida | não (a própria ordem admite overlay maior "apenas se necessário")                                                                                                                         |
| acaoSugerida              | aplicar a próxima intervenção da ordemDePreferencia antes do overlay maior                                                                                                                |
| pontuacaoRelacionada      | A. Fotografia · tratamento preserva qualidade fotográfica · 4                                                                                                                             |
| relacionadas              | R09, R66–R69, P14                                                                                                                                                                         |

### R15

| Campo                     | Valor                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "O texto deve procurar o espaço adequado dentro da fotografia." e "A fotografia não deve ser destruída para receber o texto." |
| classePrimaria            | `INVARIANTE` · condicional: não                                                                                               |
| categoria · severidade    | fotografia · media                                                                                                            |
| objetoObservado           | posição dos blocos de texto × espaço negativo/Zona C da foto; intervenções feitas na foto para receber o texto                |
| condicao                  | texto fora do espaço adequado quando havia espaço; ou foto degradada para acomodar o texto                                    |
| fonteDaEvidencia          | camadas + analiseDaFoto (espaço negativo, zonas) + fotoOriginal                                                               |
| geometria · visão         | parcial · sim                                                                                                                 |
| briefing · DNA            | não · não                                                                                                                     |
| percepcaoSubjetiva        | parcial — "espaço adequado"                                                                                                   |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                                                   |
| excecaoEditorialPermitida | não                                                                                                                           |
| acaoSugerida              | mover o texto para o espaço negativo identificado; seguir a ordem de R16 antes de alterar a foto                              |
| pontuacaoRelacionada      | A. Fotografia · uso inteligente do espaço negativo · 5; integração foto/design · 5                                            |
| relacionadas              | R06, R16, R17, P14                                                                                                            |

### R21

| Campo                     | Valor                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------ |
| textoCanonico             | "Toda peça deve possuir um ponto de entrada visual identificável."                   |
| classePrimaria            | `INVARIANTE` · condicional: não                                                      |
| categoria · severidade    | hierarquia · alta                                                                    |
| objetoObservado           | o elemento percebido primeiro (§8 teste dos 2 segundos, §9 teste de desfoque)        |
| condicao                  | nenhum elemento domina; tudo com peso semelhante                                     |
| fonteDaEvidencia          | camadas (escala, peso, contraste) + render reduzido/desfocado + hierarquiaDaMensagem |
| geometria · visão         | parcial (razão de escala entre H1 e o restante) · parcial                            |
| briefing · DNA            | sim (qual mensagem é H1, ver §10) · não                                              |
| percepcaoSubjetiva        | **sim** — "identificável" é perceptivo                                               |
| modoDeAplicacao (inicial) | `HUMANO`                                                                             |
| excecaoEditorialPermitida | não                                                                                  |
| acaoSugerida              | aumentar a diferença de escala/peso do H1 (R80–R82); reduzir concorrentes            |
| pontuacaoRelacionada      | B. Hierarquia · H1 inequívoco · 6                                                    |
| relacionadas              | R22, R23, R80, R81, §8, §9                                                           |

### R29

| Campo                     | Valor                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Elementos quase alinhados são considerados erro." e "Ou alinhe claramente." e "Ou diferencie claramente."                 |
| classePrimaria            | `INVARIANTE` · condicional: não                                                                                            |
| categoria · severidade    | composicao · media                                                                                                         |
| objetoObservado           | bordas e eixos (esquerda, centro, direita, topo, base) entre elementos                                                     |
| condicao                  | dois elementos com bordas/eixos a uma distância pequena e não nula (nem alinhados, nem claramente diferentes)              |
| fonteDaEvidencia          | camadas                                                                                                                    |
| geometria · visão         | **sim** (a regra mais diretamente mensurável do conjunto) · não                                                            |
| briefing · DNA            | não · não                                                                                                                  |
| percepcaoSubjetiva        | não, depois de definido o limiar                                                                                           |
| limiaresIndefinidos       | o que é "quase"; ver também "poucos pixels" em R30                                                                         |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                                                |
| excecaoEditorialPermitida | não — o texto declara "quase alinhados" como erro; a função visual de um deslocamento é avaliada em R30, sem dispensar R29 |
| acaoSugerida              | encaixar no eixo mais próximo ou afastar até a diferença ficar evidente                                                    |
| pontuacaoRelacionada      | C. Composição · alinhamento · 4                                                                                            |
| relacionadas              | R28, R30, R31, P11 (a versão bloqueante, que prevalece — §3)                                                               |

### R37

| Campo                     | Valor                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Nenhum texto importante poderá parecer colado à borda."                                                                                                                      |
| classePrimaria            | `INVARIANTE` · condicional: não                                                                                                                                               |
| categoria · severidade    | espacamento · alta                                                                                                                                                            |
| objetoObservado           | distância de cada bloco de texto às bordas do canvas                                                                                                                          |
| condicao                  | texto importante **parece colado** à borda. A distância abaixo da margem do perfil do formato é evidência para a avaliação visual, não a condição sozinha                     |
| fonteDaEvidencia          | camadas + perfilDoFormato (área segura, §11) + hierarquiaDaMensagem ("importante", §10)                                                                                       |
| geometria · visão         | **sim**, com a margem do perfil do formato · não                                                                                                                              |
| briefing · DNA            | parcial (o que é "importante" vem da hierarquia declarada) · não                                                                                                              |
| percepcaoSubjetiva        | parcial — "parecer colado"                                                                                                                                                    |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                                                                                                   |
| excecaoEditorialPermitida | não — R40 trata de sangria de fotografias ou elementos gráficos e diz que texto "raramente" deve romper a margem; isso não autoriza texto importante a parecer colado à borda |
| acaoSugerida              | trazer o bloco para dentro da área segura                                                                                                                                     |
| pontuacaoRelacionada      | D. Espaçamento · margens · 3                                                                                                                                                  |
| relacionadas              | R38, R39, R40, R103, P03 (a versão bloqueante, que prevalece — §3)                                                                                                            |

### R52

| Campo                     | Valor                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| textoCanonico             | "Legibilidade vem antes de personalidade."                                                      |
| classePrimaria            | `INVARIANTE` · condicional: não — é uma obrigação de prioridade, não um desempate               |
| categoria · severidade    | tipografia · alta                                                                               |
| objetoObservado           | recursos de personalidade (fonte decorativa, peso fino, efeitos, caixa) × legibilidade do texto |
| condicao                  | um recurso de personalidade compromete a legibilidade                                           |
| fonteDaEvidencia          | camadas (fonte, corpo, efeitos) + render (contraste) + dna                                      |
| geometria · visão         | parcial (corpo, efeitos presentes) · não                                                        |
| briefing · DNA            | não · sim                                                                                       |
| percepcaoSubjetiva        | parcial                                                                                         |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                     |
| excecaoEditorialPermitida | não (R96: o DNA não justifica texto ilegível)                                                   |
| acaoSugerida              | trocar pela variante legível dentro do DNA; remover efeito (R55)                                |
| pontuacaoRelacionada      | E. Tipografia · legibilidade · 4                                                                |
| relacionadas              | R55, R57, R58, R96, P10                                                                         |

### R66

| Campo                     | Valor                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Texto deve possuir contraste suficiente em relação à região real da fotografia em que está inserido."                                 |
| classePrimaria            | `INVARIANTE` · condicional: não                                                                                                        |
| categoria · severidade    | contraste_cor · alta                                                                                                                   |
| objetoObservado           | cor do texto × pixels **imediatamente atrás de cada bloco** (R67), não a média da foto                                                 |
| condicao                  | contraste local abaixo do mínimo                                                                                                       |
| fonteDaEvidencia          | camadas (bbox de cada bloco) + fundoEfetivo                                                                                            |
| geometria · visão         | **sim** (contraste do fundo efetivo sob o bbox; não é visão semântica — o PNG final, sozinho, inclui os pixels do próprio texto) · não |
| briefing · DNA            | não · parcial (R75: marca + contraste + fotografia)                                                                                    |
| percepcaoSubjetiva        | não, depois de definido o limiar                                                                                                       |
| limiaresIndefinidos       | "suficiente"; R70 aponta parâmetros de acessibilidade digital como referência técnica para informações críticas                        |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                                                            |
| excecaoEditorialPermitida | não                                                                                                                                    |
| acaoSugerida              | a menor intervenção necessária (R69); as opções de R68 não são ordenadas pelo canônico                                                 |
| pontuacaoRelacionada      | F. Contraste e cor · contraste texto/fundo · 5                                                                                         |
| relacionadas              | R67, R68, R69, R70, R10, P10 (a versão bloqueante, que prevalece — §3)                                                                 |

### R83

| Campo                     | Valor                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "A logo identifica." e "Ela não precisa dominar."                                                                                                 |
| classePrimaria            | `CRITERIO_DE_QUALIDADE` · condicional: não                                                                                                        |
| categoria · severidade    | dna · baixa                                                                                                                                       |
| objetoObservado           | área e peso visual da logo × hierarquia da mensagem (H1) e assunto principal                                                                      |
| condicao                  | a logo prejudica a hierarquia ou a leitura da mensagem (a ordem logo × H1, sozinha, não é falha: o texto diz só que a logo "não precisa dominar") |
| fonteDaEvidencia          | camadas (área da logo, área do H1) + dna                                                                                                          |
| geometria · visão         | parcial (razão de áreas) · não                                                                                                                    |
| briefing · DNA            | não · sim (tamanho e área de proteção da marca, R84)                                                                                              |
| percepcaoSubjetiva        | **sim** — "dominar" é perceptivo                                                                                                                  |
| modoDeAplicacao (inicial) | `HUMANO`                                                                                                                                          |
| excecaoEditorialPermitida | não se aplica (critério de qualidade)                                                                                                             |
| acaoSugerida              | reduzir a logo respeitando a área de proteção da marca                                                                                            |
| pontuacaoRelacionada      | G. DNA da marca · logo · 2                                                                                                                        |
| relacionadas              | R27, R84, R87                                                                                                                                     |

### R88

| Campo                     | Valor                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| textoCanonico             | "Nenhum elemento decorativo deve existir sem função." e "“Porque ficou vazio” não é função suficiente."                                                                                                                                                      |
| classePrimaria            | `INVARIANTE` · condicional: não                                                                                                                                                                                                                              |
| categoria · severidade    | simplicidade · media                                                                                                                                                                                                                                         |
| objetoObservado           | cada elemento decorativo e o que ele resolve (§37: "Se eu remover isto, a comunicação piora?")                                                                                                                                                               |
| condicao                  | elemento decorativo sem função demonstrável (as respostas listadas no canônico são exemplos de funções válidas, não uma lista fechada)                                                                                                                       |
| fonteDaEvidencia          | camadas (elementos decorativos) + render com e sem o elemento + dna (R90)                                                                                                                                                                                    |
| geometria · visão         | parcial (agrupamento e contraste local têm assinatura geométrica) · parcial                                                                                                                                                                                  |
| briefing · DNA            | não · sim (função "identidade")                                                                                                                                                                                                                              |
| percepcaoSubjetiva        | **sim** para direcionamento e profundidade                                                                                                                                                                                                                   |
| modoDeAplicacao (inicial) | `HUMANO`                                                                                                                                                                                                                                                     |
| excecaoEditorialPermitida | não — a função "identidade" já está entre as respostas válidas do próprio texto                                                                                                                                                                              |
| acaoSugerida              | remover o elemento (§37, §38)                                                                                                                                                                                                                                |
| pontuacaoRelacionada      | H. Simplicidade · ausência de elementos gratuitos · 3                                                                                                                                                                                                        |
| relacionadas              | R89, R90, R91, §37                                                                                                                                                                                                                                           |
| observacoes               | Possíveis respostas válidas citadas no canônico: agrupamento, contraste, direcionamento, identificação, profundidade, identidade. "Porque ficou vazio" não é função suficiente. O revisor infere a função pela peça, não pela justificativa do criador (§4). |

### P01

| Campo                     | Valor                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| textoCanonico             | "Texto importante cortado."                                                        |
| classePrimaria            | `HARD_GATE` · condicional: não                                                     |
| categoria · severidade    | espacamento · bloqueante                                                           |
| objetoObservado           | blocos de texto × limites do canvas e da própria caixa de texto                    |
| condicao                  | parte de um texto importante fica fora do canvas ou é truncada pela caixa          |
| fonteDaEvidencia          | camadas + render + hierarquiaDaMensagem ("importante", §10)                        |
| geometria · visão         | **sim** · não                                                                      |
| briefing · DNA            | parcial (o que é "importante") · não                                               |
| limiaresIndefinidos       | se "cortado" inclui truncamento dentro da própria caixa, não só o limite do canvas |
| modoDeAplicacao (inicial) | `ASSISTIDO` (candidato a `AUTOMATICO` depois da calibração)                        |
| excecaoEditorialPermitida | não                                                                                |
| acaoSugerida              | encurtar a mensagem (R16, R58) antes de reduzir corpo; reposicionar                |
| relacionadas              | R37, R57, R58, P03                                                                 |

### P04

| Campo                     | Valor                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Rosto coberto sem intenção explícita."                                                                                                                                                                                                                                                                                                     |
| classePrimaria            | `HARD_GATE` · condicional: não                                                                                                                                                                                                                                                                                                              |
| categoria · severidade    | fotografia · bloqueante                                                                                                                                                                                                                                                                                                                     |
| objetoObservado           | rostos na foto × elementos sobrepostos                                                                                                                                                                                                                                                                                                      |
| condicao                  | elemento gráfico cobre um rosto **e** há evidência conclusiva de que a intenção explícita está **ausente**. O silêncio do registro editorial é **inconclusivo** — salvo se essa fonte estiver definida como completa e obrigatória para registrar a intenção. Intenção inconclusiva vai para avaliação humana e não é marcada como violação |
| fonteDaEvidencia          | analiseDaFoto (rostos) + camadas + registroEditorial (evidência preferida da intenção)                                                                                                                                                                                                                                                      |
| geometria · visão         | parcial (depois da máscara do rosto) · **sim**                                                                                                                                                                                                                                                                                              |
| briefing · DNA            | parcial (onde a intenção é registrada) · não                                                                                                                                                                                                                                                                                                |
| limiaresIndefinidos       | "coberto" (parcial ou total)                                                                                                                                                                                                                                                                                                                |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                                                                                                                                                                                                                                                                                 |
| excecaoEditorialPermitida | `sim_com_evidencia_de_intencao` — a exceção é do **próprio texto** de P04 ("sem intenção explícita"); o registro editorial é a evidência preferida; sem evidência conclusiva, avaliação humana, sem presumir violação                                                                                                                       |
| acaoSugerida              | mover o elemento para fora da região do rosto                                                                                                                                                                                                                                                                                               |
| relacionadas              | R01, R02, R07, P05 (olhos: sem exceção, prevalece sobre R02 — §3)                                                                                                                                                                                                                                                                           |

### P06

| Campo                     | Valor                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------ |
| textoCanonico             | "Produto principal significativamente obstruído."                                    |
| classePrimaria            | `HARD_GATE` · condicional: não                                                       |
| categoria · severidade    | fotografia · bloqueante                                                              |
| objetoObservado           | produto principal × elementos sobrepostos                                            |
| condicao                  | parte do produto encoberta acima do limiar de "significativamente"                   |
| fonteDaEvidencia          | analiseDaFoto (máscara do produto) + camadas + briefing (qual é o produto anunciado) |
| geometria · visão         | parcial · **sim**                                                                    |
| briefing · DNA            | parcial · não                                                                        |
| limiaresIndefinidos       | "significativamente" (fração de área? região essencial como o rótulo?)               |
| modoDeAplicacao (inicial) | `ASSISTIDO`                                                                          |
| excecaoEditorialPermitida | não                                                                                  |
| acaoSugerida              | reposicionar o conteúdo (R06, R15)                                                   |
| relacionadas              | R01, R03, P07                                                                        |

### P08

| Campo                     | Valor                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| textoCanonico             | "Informação obrigatória ausente."                                                                                  |
| classePrimaria            | `HARD_GATE` · condicional: não                                                                                     |
| categoria · severidade    | factual · bloqueante                                                                                               |
| objetoObservado           | textos desenhados na peça × lista **estruturada** de informações obrigatórias (§10)                                |
| condicao                  | item obrigatório não aparece na arte                                                                               |
| fonteDaEvidencia          | briefing estruturado + textos da peça (pelas camadas; OCR do render só sem camadas)                                |
| geometria · visão         | não (é verificação de conteúdo) · não quando há camadas                                                            |
| briefing · DNA            | **sim** · não                                                                                                      |
| percepcaoSubjetiva        | não                                                                                                                |
| modoDeAplicacao (inicial) | `ASSISTIDO`; sem fonte estruturada de obrigatórios, `HUMANO` (o revisor não infere livremente o que é obrigatório) |
| excecaoEditorialPermitida | não                                                                                                                |
| acaoSugerida              | incluir a informação; se não couber, rever a densidade (R92–R95)                                                   |
| relacionadas              | P09, R26, R93                                                                                                      |

### P09

| Campo                     | Valor                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Informação factual divergente do briefing."                                                                    |
| classePrimaria            | `HARD_GATE` · condicional: não                                                                                  |
| categoria · severidade    | factual · bloqueante                                                                                            |
| objetoObservado           | fatos desenhados (preço, data, horário, endereço, unidade, condição) × fatos **estruturados** do briefing (§10) |
| condicao                  | valor desenhado diferente do valor do briefing                                                                  |
| fonteDaEvidencia          | briefing estruturado + textos da peça                                                                           |
| geometria · visão         | não · não quando há camadas                                                                                     |
| briefing · DNA            | **sim** · não                                                                                                   |
| percepcaoSubjetiva        | não                                                                                                             |
| modoDeAplicacao (inicial) | `ASSISTIDO`; sem fonte estruturada, `HUMANO`                                                                    |
| excecaoEditorialPermitida | não                                                                                                             |
| acaoSugerida              | corrigir o texto pelo briefing                                                                                  |
| relacionadas              | P08                                                                                                             |
| observacoes               | Exemplo direto de identidade factual que a ordem do §2 não autoriza violar.                                     |

### P10

| Campo                     | Valor                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Contraste que impeça leitura normal."                                                                                       |
| classePrimaria            | `HARD_GATE` · condicional: não                                                                                               |
| categoria · severidade    | contraste_cor · bloqueante                                                                                                   |
| objetoObservado           | contraste local de cada bloco de texto (R67)                                                                                 |
| condicao                  | o bloco de texto não tem leitura normal sobre o fundo efetivo (contraste local é parte da evidência, não a condição inteira) |
| fonteDaEvidencia          | camadas + fundoEfetivo + render final (legibilidade do bloco)                                                                |
| geometria · visão         | parcial: o contraste do fundo efetivo é mensurável; "impeça leitura normal" exige validar a legibilidade do bloco · não      |
| briefing · DNA            | não · não                                                                                                                    |
| limiaresIndefinidos       | "leitura normal" — R70 indica parâmetros de acessibilidade digital como referência técnica                                   |
| modoDeAplicacao (inicial) | `ASSISTIDO` (candidato a `AUTOMATICO` depois da calibração); evidência inconclusiva vai para avaliação humana                |
| excecaoEditorialPermitida | não                                                                                                                          |
| acaoSugerida              | a menor intervenção que restaure a leitura (R69; ordem de R10)                                                               |
| relacionadas              | R66–R70, R52                                                                                                                 |

### P12

| Campo                     | Valor                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| textoCanonico             | "DNA incorreto de outra marca."                                                                                                                                                                                                                                                |
| classePrimaria            | `HARD_GATE` · condicional: não                                                                                                                                                                                                                                                 |
| categoria · severidade    | dna · bloqueante                                                                                                                                                                                                                                                               |
| objetoObservado           | fontes, paleta, logo e grafismos da peça × DNA do projeto                                                                                                                                                                                                                      |
| condicao                  | a identidade da peça usa, de forma **indevida**, elemento com evidência **positiva** de pertencer a **outra** marca (fonte, logo, paleta ou grafismo). Presença autorizada de outra marca (ex.: peça conjunta) não é violação; contexto inconclusivo vai para avaliação humana |
| fonteDaEvidencia          | camadas (famílias de fonte, cores, logo) + dna do projeto + dnaDeOutrasMarcas + briefing/registroEditorial (presença autorizada de outra marca)                                                                                                                                |
| geometria · visão         | parcial: fontes e cores das camadas provam **divergência** do DNA do projeto, não "de outra marca" · não                                                                                                                                                                       |
| briefing · DNA            | parcial (só para verificar se a presença de outra marca é autorizada) · **sim**                                                                                                                                                                                                |
| percepcaoSubjetiva        | parcial (para "linguagem visual")                                                                                                                                                                                                                                              |
| modoDeAplicacao (inicial) | `ASSISTIDO`; divergência do DNA sem identificação da outra marca vai para revisão humana                                                                                                                                                                                       |
| excecaoEditorialPermitida | não                                                                                                                                                                                                                                                                            |
| acaoSugerida              | trocar pelos ativos do DNA do projeto                                                                                                                                                                                                                                          |
| relacionadas              | R51, R53, R96, P13                                                                                                                                                                                                                                                             |
| observacoes               | Exemplo direto de identidade factual que a ordem do §2 não autoriza violar.                                                                                                                                                                                                    |

### P14

| Campo                     | Valor                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| textoCanonico             | "Fotografia severamente prejudicada pela intervenção gráfica."                                          |
| classePrimaria            | `HARD_GATE` · condicional: não                                                                          |
| categoria · severidade    | fotografia · bloqueante                                                                                 |
| objetoObservado           | foto original × arte final (§36 teste da foto limpa): textura, profundidade, atmosfera, cor do alimento |
| condicao                  | perda severa de qualidade fotográfica causada por overlays, gradientes, filtros ou cobertura            |
| fonteDaEvidencia          | fotoOriginal + render + camadas                                                                         |
| geometria · visão         | parcial (área coberta, opacidade de overlays) · **sim**                                                 |
| briefing · DNA            | não · não                                                                                               |
| percepcaoSubjetiva        | **sim** — "severamente" é julgamento                                                                    |
| limiaresIndefinidos       | "severamente"                                                                                           |
| modoDeAplicacao (inicial) | `HUMANO` — continua HARD_GATE constitucional; só deixa de ser humano depois de calibrado                |
| excecaoEditorialPermitida | não                                                                                                     |
| acaoSugerida              | reduzir a intervenção na ordem de R10; remover grafismos (§38)                                          |
| relacionadas              | R08, R09, R10, R11, R12, §36                                                                            |

## 9. Ordem de criação (§29) × tipografia no DNA (R51)

Resolução operacional, sem alterar o canônico:

- O **DNA da marca é CONTEXTO disponível desde o início** do fluxo do §29.
- **Etapa 8 — aplicar tipografia:** a IA escolhe a tipografia **já limitada pelo DNA da marca** (R51,
  R53). As decisões da etapa 8 são de função tipográfica (escala, peso relativo, entrelinha, quebras)
  dentro do repertório do DNA.
- **Etapa 9 — aplicar DNA da marca:** aplica os demais aspectos do §26 — cores, grafismos, logo e
  assinatura, tom visual, densidade, personalidade e padrões aprovados.
- Não existe autorização para escolher tipografia fora do DNA antes da etapa 9.

## 10. Termos que dependem de dados estruturados

Este documento **não** define "importante" (P01, P03, R37, R103) nem "obrigatória" (P08) de forma
universal. Esses termos precisam vir, no futuro, de dados explícitos:

- **hierarquia da mensagem** — a classificação que o próprio §7 do canônico exige antes de diagramar
  (H1, H2, H3, serviço, marca), declarada por peça;
- **fatos obrigatórios do briefing/contrato** — a lista estruturada do que a peça precisa conter e dos
  valores factuais (preço, data, horário, endereço, unidade, condição).

Quando a fonte estruturada existir, P08 e P09 dependem dela e **não** de inferência livre do revisor.
Quando não existir, a verificação é `HUMANO`.

## 11. Área segura

A Constituição exige área segura (R37, R38, R39, P03, R103), mas **não** fixa números, e este documento
também não fixa.

- Os **valores numéricos** de área segura pertencem à configuração do **FORMATO / PLATAFORMA** (feed,
  story, reel cover, carrossel, anúncio — §28, R102, R103): margens e zonas de interface de cada um.
- A Constituição exige a área segura; o **perfil do formato** define os números (`perfilDoFormato` na
  fonte de evidência).

## 12. Fotografia como primeira classe — dados futuros

A análise visual futura deverá conseguir representar, por foto (sem implementação agora; sem visão
computacional; sem REA):

| Dado                                | Representação proposta                                                                                                                     | Regras que consomem    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Assunto principal                   | máscara ou polígono + tipo (pessoa, rosto, prato, corte de carne, drink, garrafa, sobremesa, produto, ambiente, fachada, ação) + confiança | R01, R04, P06, P07     |
| Assuntos secundários                | lista de máscaras + tipo + confiança                                                                                                       | R05, Zona B            |
| Centro de interesse                 | ponto ou região de saliência antes do design                                                                                               | §3.3, R21, §9          |
| Direção visual                      | vetores: olhar, corpo, perspectiva, diagonais, linhas arquitetônicas, movimento                                                            | R17, R18, R28          |
| Espaço negativo                     | regiões de baixa informação visual, com área                                                                                               | R15, R45, R46          |
| Zona A (protegida)                  | máscara: rostos, olhos, expressões, mãos na ação, alimento principal e sua textura, produto, bebida, rótulo relevante                      | R01–R04, R07, P04, P05 |
| Zona B (sensível)                   | máscara: objetos secundários, mesas, mobiliário, ambiente, pessoas secundárias, texturas, desfocados parciais                              | R05, R06               |
| Zona C (disponível)                 | máscara: paredes, céu, superfícies homogêneas, desfocados, sombras uniformes, espaço negativo                                              | R06, R15               |
| Regiões de contraste                | mapa de luminância/cor: onde texto claro ou escuro tem melhor legibilidade                                                                 | §3.6, R66, R67, R75    |
| Elementos narrativamente relevantes | lista de máscaras que não podem ser encobertas, mesmo fora do assunto principal                                                            | §3.7                   |

Requisitos transversais: toda região com **confiança**; coordenadas no espaço do canvas (para cruzar com
as camadas); a mesma análise disponível ao criador e ao revisor, mas o revisor **recalcula** sobre a arte
final em vez de confiar na análise do criador.

## 13. Rich-text

Fora deste documento e da automação semântica. Backlog: issue #209.

## 14. Ambiguidades do texto canônico

Registradas para decisão; nenhuma foi resolvida por reescrita do canônico.

| #   | Ambiguidade                                                                                                                                                                                                                           | Situação                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | R02 admite atravessar olhos com intenção editorial explícita; P05 reprova olhos atravessados sem exceção                                                                                                                              | **Resolvido operacionalmente:** P-regras prevalecem (§3); P05 vence                                                                                                   |
| 2   | R-regras com "é proibido"/"nunca" (R01, R02, R85, R96, R62…) não têm consequência definida além da nota                                                                                                                               | Classe `INVARIANTE` proposta (§5); elevar a reprovação exige decisão                                                                                                  |
| 3   | Limiares sem medida: "significativamente" (P06, P07), "severamente" (P14), "quase alinhados" (R29), "poucos pixels" (R30), "suficiente" (R39, R61, R66), "leitura normal" (P10), "colado à borda" (R37), "ligeiramente maiores" (R81) | Aberto — calibração (§6); nenhum número inventado                                                                                                                     |
| 4   | "Importante" (P01, P03, R37, R103) e "obrigatória" (P08) sem definição                                                                                                                                                                | **Resolvido operacionalmente:** vêm de hierarquia declarada e briefing estruturado (§10)                                                                              |
| 5   | Intenção não observável na peça: "apenas para facilitar" (R01), "por conveniência" (R07), "acidental" (R04, P03, R39, R96, §39), "por erro" (P11), "sem intenção explícita" (P04)                                                     | Proposta: registro editorial como evidência preferida da intenção; sem evidência conclusiva, avaliação humana sem presumir violação (`sim_com_evidencia_de_intencao`) |
| 6   | Área segura sem valores numéricos                                                                                                                                                                                                     | **Resolvido operacionalmente:** números no perfil do formato/plataforma (§11)                                                                                         |
| 7   | Ordem do §29 (tipografia na etapa 8, DNA na 9) × R51 (tipografia segue o DNA)                                                                                                                                                         | **Resolvido operacionalmente:** DNA é contexto desde o início (§9)                                                                                                    |
| 8   | Ordem do §2 (DNA abaixo da composição) × P12/P13 (identidade bloqueante)                                                                                                                                                              | **Resolvido:** prioridade de resolução, não licença (§2)                                                                                                              |
| 9   | "Peso visual" (R05, R48, R78, §35): fatores listados em R78 sem ponderação                                                                                                                                                            | Aberto                                                                                                                                                                |
| 10  | R03 "quando houver alternativa" exige comparar composições possíveis, não só a entregue                                                                                                                                               | Aberto — R03 `HUMANO` por ora                                                                                                                                         |
| 11  | "Aprovada com ressalvas: pode publicar" (§32) convive com P01–P14                                                                                                                                                                     | A classificação só vale quando nenhuma proibição estrutural ocorreu (§32, última frase)                                                                               |

## 15. Próximos passos (não iniciados)

- Operacionalizar as demais regras no mesmo schema, só depois de validar estes 19 exemplos.
- Calibrar os limiares da ambiguidade 3 com peças reais aprovadas e reprovadas.
- Definir onde ficam a hierarquia declarada da mensagem, os fatos obrigatórios do briefing, a intenção
  editorial explícita e o perfil de cada formato.
- Só então desenhar criador e revisor.
