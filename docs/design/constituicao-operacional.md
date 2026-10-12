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
qualquer composição — inclusive como proibições estruturais (P12 "DNA incorreto de outra marca", P13
"Logo incorreta", P02 "Logo deformada", P09 "Informação factual divergente do briefing").

| A fotografia PODE justificar                 | A fotografia NÃO justifica   |
| -------------------------------------------- | ---------------------------- |
| mover o título                               | fonte de outra marca         |
| trocar o alinhamento (R19)                   | logo errada                  |
| usar outra versão **aprovada** da logo (R86) | cor incompatível com a marca |
| reduzir grafismos (R88, R91, §38)            | informação factual incorreta |

O próprio texto sustenta essa leitura: R96 diz que o DNA não justifica ilegibilidade, falta de margem ou
assunto coberto; R51 diz que a tipografia segue prioritariamente o DNA. A ordem do §2 resolve conflitos
de composição; não rebaixa fatos de identidade a "ornamentação".

## 3. Criador × revisor

Os dois agentes compartilham a **mesma** especificação, com papéis diferentes:

- **CRIADOR** — usa as regras para _decidir_ a solução (ordem do §29: mensagem → prioridade → foto →
  zonas → região → hierarquia → grid → tipografia → DNA → contraste → retirar → validar).
- **REVISOR** — avalia o _resultado final_ de forma independente. **Não confia na justificativa do
  criador**: a evidência vem da peça (camadas, PNG, foto original) e das fontes externas (briefing, DNA),
  nunca do texto explicativo de quem criou.

Toda reprovação automática futura deverá produzir:

| Campo              | Conteúdo                                                             |
| ------------------ | -------------------------------------------------------------------- |
| `ruleId`           | ex.: `P10`                                                           |
| `evidencia`        | o que foi medido ou observado (valores, recortes, textos)            |
| `regiao`           | elemento(s) ou região afetada, quando aplicável (id de camada, bbox) |
| `confianca`        | 0–1                                                                  |
| `explicacao`       | em linguagem humana, citando a regra                                 |
| `correcaoSugerida` | a menor intervenção que resolve (R10, R16, R69, §38)                 |

**Pontuação nunca compensa HARD_GATE.** O texto é explícito no §32: "Qualquer proibição estrutural
P01–P14 reprova a peça independentemente da pontuação."

## 4. Classes

| Classe                  | Significado operacional                                                                                                                                                                    | Base no texto canônico                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `HARD_GATE`             | Reprovação automática, independente da nota                                                                                                                                                | §30 (P01–P14) e §32                       |
| `INVARIANTE`            | Obrigação ou proibição textual ("é proibido", "nunca", "não poderá", "deve") **fora** da lista P. A violação exige correção ou justificativa editorial registrada; **não** reprova sozinha | R-regras com linguagem normativa          |
| `CRITERIO_DE_QUALIDADE` | Entra na nota de 100 pontos (§31) e na classificação (§32)                                                                                                                                 | §31                                       |
| `PREFERENCIA`           | Desempate ou ordem de tentativa entre soluções válidas (tie-breaker)                                                                                                                       | §38, listas ordenadas como R10 e R16, R06 |

> **Proposta, não texto canônico:** a Constituição só define consequência automática para P01–P14. A
> classe `INVARIANTE` é uma proposta deste documento para as regras normativas fora da lista P; elevar
> alguma delas a reprovação automática exigiria decisão explícita (ver §9, ambiguidades).

Uma mesma regra pode ter mais de uma face (ex.: R10 é `INVARIANTE` na proibição e `PREFERENCIA` na ordem
de intervenções). Nesse caso, registra-se a classe principal e a face secundária em `observacoes`.

## 5. Schema operacional proposto

```yaml
ruleId: string                  # "R01".."R103", "P01".."P14" — exatamente como no canônico
titulo: string                  # o título/enunciado curto do canônico
textoCanonico: string           # CITAÇÃO literal do canônico (nunca paráfrase)
secao: string                   # ex.: "4. MAPA DE PROTEÇÃO DA FOTOGRAFIA"
classe: HARD_GATE | INVARIANTE | CRITERIO_DE_QUALIDADE | PREFERENCIA
categoria: fotografia | hierarquia | composicao | espacamento | tipografia | contraste_cor | dna | simplicidade | factual | formato
severidade: bloqueante | alta | media | baixa
objetoObservado: string         # o que precisa ser observado na peça
condicao: string                # quando a regra é violada, em termos observáveis
fonteDaEvidencia:               # de onde a evidência vem
  - camadas                     # Page.layers: geometria, fontes, cores, visibilidade
  - render                      # PNG final: pixels, contraste local
  - fotoOriginal                # para comparação foto original × arte final (§36)
  - analiseDaFoto               # o modelo de dados da §7 (assunto, zonas, direção...)
  - briefing                    # informação obrigatória e fatos (preço, data, horário...)
  - dna                         # BrandDNA: fontes, paleta, logo, margens, padrões aprovados
verificavelPorGeometria: sim | parcial | nao
dependeDeVisao: sim | parcial | nao      # visão semântica (reconhecer rosto, prato, produto)
dependeDeBriefing: boolean
dependeDeDNA: boolean
percepcaoSubjetiva: boolean     # o enunciado depende de julgamento estético ainda não mensurável
limiaresIndefinidos: [string]   # termos do texto sem medida ("significativamente", "poucos pixels")
confiancaMinimaParaReprovar: number | null   # só para HARD_GATE; null = não reprova sozinha
exigeEvidencia: boolean
excecaoEditorialPermitida: nao | sim_com_registro_previo | sim
acaoSugerida: string            # a correção mínima, seguindo R10/R16/R69/§38
pontuacao: { bloco: string, item: string, pontos: number } | null   # mapeamento para o §31
relacionadas: [ruleId]
observacoes: string
```

Convenções:

- `textoCanonico` é sempre citação literal; a interpretação vai em `condicao`, `objetoObservado` e
  `observacoes`, nunca reescrevendo a regra.
- `confiancaMinimaParaReprovar` só existe em `HARD_GATE`. Os valores abaixo são **pontos de partida para
  calibração**, não verdades: até haver dados, reprovação que dependa de visão semântica ou percepção
  subjetiva deve ir para confirmação humana em vez de reprovar sozinha.
- `excecaoEditorialPermitida: sim_com_registro_previo` significa que a intenção precisa estar registrada
  **antes** (no briefing ou numa marca editorial da peça), para o revisor poder conferi-la sem depender
  da justificativa do criador.

## 6. Exemplos representativos

Os enunciados abaixo são citações literais do canônico.

### R01

| Campo                       | Valor                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "É proibido esconder o assunto principal apenas para facilitar a diagramação."                                                                                  |
| secao                       | 4 — Zona A                                                                                                                                                      |
| classe                      | `INVARIANTE`                                                                                                                                                    |
| categoria                   | fotografia · severidade **alta**                                                                                                                                |
| objetoObservado             | sobreposição de texto, logo, selo ou grafismo sobre o assunto principal                                                                                         |
| condicao                    | elemento gráfico encobre o assunto principal                                                                                                                    |
| fonteDaEvidencia            | camadas + analiseDaFoto (máscara do assunto)                                                                                                                    |
| verificavelPorGeometria     | parcial (interseção bbox × máscara, depois de a máscara existir)                                                                                                |
| dependeDeVisao              | sim (identificar o assunto) · briefing: não · DNA: não                                                                                                          |
| percepcaoSubjetiva          | não para o encobrimento; **sim** para "apenas para facilitar a diagramação" (motivo não é observável na peça)                                                   |
| confiancaMinimaParaReprovar | null (não reprova sozinha)                                                                                                                                      |
| exigeEvidencia              | sim · excecaoEditorialPermitida: `sim_com_registro_previo` (R07: uso consciente da Zona A)                                                                      |
| acaoSugerida                | reposicionar o conteúdo para Zona C, depois B (R06); reduzir texto (R16)                                                                                        |
| pontuacao                   | A. Fotografia · assunto preservado · 8                                                                                                                          |
| relacionadas                | R04, R07, P04, P06, P07                                                                                                                                         |
| observacoes                 | O motivo ("apenas para facilitar") não é verificável; o revisor só vê o encobrimento. Quando o encobrimento é "significativo", o caso vira P06/P07 (HARD_GATE). |

### R03

| Campo                       | Valor                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "Em gastronomia, não cobrir a região visualmente mais apetitosa do alimento quando houver alternativa de composição." |
| classe                      | `INVARIANTE` (condicional: só vale "quando houver alternativa")                                                       |
| categoria                   | fotografia · severidade **alta**                                                                                      |
| objetoObservado             | região mais apetitosa do alimento × elementos sobrepostos; existência de região alternativa (Zona C/B)                |
| condicao                    | elemento cobre a região mais apetitosa **e** existe outra região viável para o conteúdo                               |
| fonteDaEvidencia            | camadas + analiseDaFoto                                                                                               |
| verificavelPorGeometria     | parcial · dependeDeVisao: **sim** · briefing: não · DNA: não                                                          |
| percepcaoSubjetiva          | **sim** — "visualmente mais apetitosa" é julgamento estético; "houver alternativa" exige simular outras composições   |
| confiancaMinimaParaReprovar | null                                                                                                                  |
| excecaoEditorialPermitida   | sim (o próprio texto: só quando houver alternativa)                                                                   |
| acaoSugerida                | mover o bloco para a região alternativa; reduzir interferência (§40)                                                  |
| pontuacao                   | A. Fotografia · assunto preservado · 8                                                                                |
| relacionadas                | R12, §40, P07                                                                                                         |

### R10

| Campo                       | Valor                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "O fato de texto branco funcionar sobre imagem escura não autoriza escurecer indiscriminadamente a fotografia inteira." — com a lista ordenada do canônico ("Priorizar, nesta ordem:"): reposicionamento → redução do texto → mudança de cor → sombra sutil → gradiente localizado → overlay maior apenas se necessário |
| classe                      | `INVARIANTE` (a proibição) + `PREFERENCIA` (a ordem de intervenções, como tie-breaker)                                                                                                                                                                                                                                  |
| categoria                   | fotografia / contraste_cor · severidade **media**                                                                                                                                                                                                                                                                       |
| objetoObservado             | overlays/gradientes/sombras: área coberta e intensidade; escurecimento global foto original × render                                                                                                                                                                                                                    |
| condicao                    | escurecimento aplicado à fotografia inteira quando uma intervenção anterior da lista resolveria                                                                                                                                                                                                                         |
| fonteDaEvidencia            | camadas (tamanho e opacidade de overlay/gradiente) + render + fotoOriginal                                                                                                                                                                                                                                              |
| verificavelPorGeometria     | **sim** para "overlay cobre o quadro inteiro"; parcial para "indiscriminadamente"                                                                                                                                                                                                                                       |
| dependeDeVisao              | não (comparação de luminância) · briefing: não · DNA: não                                                                                                                                                                                                                                                               |
| percepcaoSubjetiva          | parcial — "indiscriminadamente" não tem limiar                                                                                                                                                                                                                                                                          |
| limiaresIndefinidos         | "indiscriminadamente"                                                                                                                                                                                                                                                                                                   |
| confiancaMinimaParaReprovar | null                                                                                                                                                                                                                                                                                                                    |
| acaoSugerida                | aplicar a próxima intervenção da lista, na ordem, antes do overlay maior                                                                                                                                                                                                                                                |
| pontuacao                   | A. Fotografia · tratamento preserva qualidade fotográfica · 4                                                                                                                                                                                                                                                           |
| relacionadas                | R09, R66–R69, P14                                                                                                                                                                                                                                                                                                       |

### R15

| Campo                       | Valor                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "O texto deve procurar o espaço adequado dentro da fotografia. A fotografia não deve ser destruída para receber o texto." |
| classe                      | `CRITERIO_DE_QUALIDADE`                                                                                                   |
| categoria                   | fotografia · severidade **media**                                                                                         |
| objetoObservado             | posição dos blocos de texto × espaço negativo/Zona C da foto                                                              |
| condicao                    | texto colocado fora do espaço disponível quando havia espaço adequado                                                     |
| fonteDaEvidencia            | camadas + analiseDaFoto (espaço negativo, zonas)                                                                          |
| verificavelPorGeometria     | parcial · dependeDeVisao: sim · briefing: não · DNA: não                                                                  |
| percepcaoSubjetiva          | parcial — "espaço adequado"                                                                                               |
| confiancaMinimaParaReprovar | null                                                                                                                      |
| acaoSugerida                | mover o texto para o espaço negativo identificado; seguir R16 antes de alterar a foto                                     |
| pontuacao                   | A. Fotografia · uso inteligente do espaço negativo · 5                                                                    |
| relacionadas                | R06, R16, R17, P14                                                                                                        |

### R21

| Campo                       | Valor                                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| textoCanonico               | "Toda peça deve possuir um ponto de entrada visual identificável."            |
| classe                      | `INVARIANTE`                                                                  |
| categoria                   | hierarquia · severidade **alta**                                              |
| objetoObservado             | o elemento percebido primeiro (§8 teste dos 2 segundos, §9 teste de desfoque) |
| condicao                    | nenhum elemento domina; tudo com peso semelhante                              |
| fonteDaEvidencia            | camadas (escala, peso, contraste) + render reduzido/desfocado                 |
| verificavelPorGeometria     | parcial (razão de escala entre H1 e o restante) · dependeDeVisao: parcial     |
| dependeDeBriefing           | sim (qual mensagem é H1) · DNA: não                                           |
| percepcaoSubjetiva          | **sim** — "identificável" é perceptivo                                        |
| confiancaMinimaParaReprovar | null                                                                          |
| acaoSugerida                | aumentar a diferença de escala/peso do H1 (R80–R82); reduzir concorrentes     |
| pontuacao                   | B. Hierarquia · H1 inequívoco · 6                                             |
| relacionadas                | R22, R23, R80, R81, §8, §9                                                    |

### R29

| Campo                       | Valor                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "Elementos quase alinhados são considerados erro. Ou alinhe claramente. Ou diferencie claramente."            |
| classe                      | `INVARIANTE`                                                                                                  |
| categoria                   | composicao · severidade **media**                                                                             |
| objetoObservado             | bordas e eixos (esquerda, centro, direita, topo, base) entre elementos                                        |
| condicao                    | dois elementos com bordas/eixos a uma distância pequena e não nula (nem alinhados, nem claramente diferentes) |
| fonteDaEvidencia            | camadas                                                                                                       |
| verificavelPorGeometria     | **sim** (é a regra mais diretamente mensurável do conjunto)                                                   |
| dependeDeVisao              | não · briefing: não · DNA: não                                                                                |
| percepcaoSubjetiva          | não, desde que o limiar seja definido                                                                         |
| limiaresIndefinidos         | o que é "quase" (faixa em px, relativa ao canvas); ver também "poucos pixels" em R30                          |
| confiancaMinimaParaReprovar | null (a versão bloqueante é P11)                                                                              |
| excecaoEditorialPermitida   | sim (deslocamento com função visual, R30)                                                                     |
| acaoSugerida                | encaixar no eixo mais próximo ou afastar até a diferença ficar evidente                                       |
| pontuacao                   | C. Composição · alinhamento · 4                                                                               |
| relacionadas                | R28, R30, R31, P11                                                                                            |

### R37

| Campo                       | Valor                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| textoCanonico               | "Nenhum texto importante poderá parecer colado à borda."                                        |
| classe                      | `INVARIANTE`                                                                                    |
| categoria                   | espacamento · severidade **alta**                                                               |
| objetoObservado             | distância de cada bloco de texto às bordas do canvas                                            |
| condicao                    | texto importante a uma distância da borda menor que a margem mínima                             |
| fonteDaEvidencia            | camadas + dna (margens da marca)                                                                |
| verificavelPorGeometria     | **sim**, depois de definida a margem mínima                                                     |
| dependeDeVisao              | não · dependeDeBriefing: parcial (o que é "importante" vem da hierarquia) · dependeDeDNA: sim   |
| percepcaoSubjetiva          | parcial — "parecer colado"                                                                      |
| limiaresIndefinidos         | margem mínima por formato e por marca (o texto não fixa valores; R102/R103 dependem do formato) |
| confiancaMinimaParaReprovar | null (a versão bloqueante é P03)                                                                |
| excecaoEditorialPermitida   | sim, raramente (R40: "Texto raramente deverá romper a margem")                                  |
| acaoSugerida                | trazer o bloco para dentro da área segura                                                       |
| pontuacao                   | D. Espaçamento · margens · 3                                                                    |
| relacionadas                | R38, R39, R40, R103, P03                                                                        |

### R52

| Campo                       | Valor                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| textoCanonico               | "Legibilidade vem antes de personalidade."                                                         |
| classe                      | `PREFERENCIA` (regra de desempate entre critérios)                                                 |
| categoria                   | tipografia · severidade **alta**                                                                   |
| objetoObservado             | conflitos entre um recurso de personalidade (fonte decorativa, peso fino, efeito) e a legibilidade |
| condicao                    | escolha de personalidade que reduz a legibilidade quando havia opção legível dentro da identidade  |
| fonteDaEvidencia            | camadas (fonte, corpo, efeitos) + render (contraste) + dna                                         |
| verificavelPorGeometria     | parcial (corpo mínimo, efeitos presentes) · dependeDeVisao: não                                    |
| dependeDeBriefing           | não · dependeDeDNA: sim                                                                            |
| percepcaoSubjetiva          | parcial                                                                                            |
| confiancaMinimaParaReprovar | null                                                                                               |
| acaoSugerida                | trocar pela variante legível dentro do DNA; remover efeito (R55)                                   |
| pontuacao                   | E. Tipografia · legibilidade · 4                                                                   |
| relacionadas                | R55, R57, R58, R96, P10                                                                            |

### R66

| Campo                       | Valor                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| textoCanonico               | "Texto deve possuir contraste suficiente em relação à região real da fotografia em que está inserido." |
| classe                      | `INVARIANTE`                                                                                           |
| categoria                   | contraste_cor · severidade **alta**                                                                    |
| objetoObservado             | cor do texto × pixels **imediatamente atrás de cada bloco** (R67), não a média da foto                 |
| condicao                    | razão de contraste local abaixo do mínimo                                                              |
| fonteDaEvidencia            | render + camadas (bbox de cada bloco)                                                                  |
| verificavelPorGeometria     | **sim** (amostragem de pixels sob o bbox; não é visão semântica)                                       |
| dependeDeVisao              | não · briefing: não · DNA: parcial (R75: marca + contraste + fotografia)                               |
| percepcaoSubjetiva          | não, depois de definido o limiar                                                                       |
| limiaresIndefinidos         | "suficiente"; R70 aponta parâmetros de acessibilidade digital como referência para informação crítica  |
| confiancaMinimaParaReprovar | null (a versão bloqueante é P10)                                                                       |
| acaoSugerida                | menor intervenção (R69): reposicionar, depois cor, depois sombra sutil, depois gradiente localizado    |
| pontuacao                   | F. Contraste e cor · contraste texto/fundo · 5                                                         |
| relacionadas                | R67, R68, R69, R70, R10, P10                                                                           |

### R83

| Campo                       | Valor                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| textoCanonico               | "A logo identifica. Ela não precisa dominar."                      |
| classe                      | `CRITERIO_DE_QUALIDADE`                                            |
| categoria                   | dna · severidade **baixa**                                         |
| objetoObservado             | área e peso visual da logo × H1 e assunto principal                |
| condicao                    | a logo é percebida antes do H1 ou do assunto                       |
| fonteDaEvidencia            | camadas (área da logo, área do H1)                                 |
| verificavelPorGeometria     | parcial (razão de áreas) · dependeDeVisao: não                     |
| dependeDeBriefing           | não · dependeDeDNA: sim (tamanho e área de proteção da marca, R84) |
| percepcaoSubjetiva          | **sim** — "dominar" é perceptivo                                   |
| confiancaMinimaParaReprovar | null                                                               |
| acaoSugerida                | reduzir a logo respeitando a área de proteção da marca             |
| pontuacao                   | G. DNA da marca · logo · 2                                         |
| relacionadas                | R27, R84, R87                                                      |

### R88

| Campo                       | Valor                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "Nenhum elemento decorativo deve existir sem função." e "“Porque ficou vazio” não é função suficiente." — com a lista de respostas válidas do canônico: agrupamento, contraste, direcionamento, identificação, profundidade, identidade |
| classe                      | `INVARIANTE`                                                                                                                                                                                                                            |
| categoria                   | simplicidade · severidade **media**                                                                                                                                                                                                     |
| objetoObservado             | cada elemento decorativo e o que ele resolve (§37: "Se eu remover isto, a comunicação piora?")                                                                                                                                          |
| condicao                    | elemento decorativo sem nenhuma das funções listadas                                                                                                                                                                                    |
| fonteDaEvidencia            | camadas (lista de elementos decorativos) + render com e sem o elemento + dna (R90)                                                                                                                                                      |
| verificavelPorGeometria     | parcial (algumas funções têm assinatura geométrica: agrupamento, contraste local)                                                                                                                                                       |
| dependeDeVisao              | parcial · briefing: não · DNA: sim (função "identidade")                                                                                                                                                                                |
| percepcaoSubjetiva          | **sim** para direcionamento e profundidade                                                                                                                                                                                              |
| confiancaMinimaParaReprovar | null                                                                                                                                                                                                                                    |
| excecaoEditorialPermitida   | sim (função "identidade", conforme o DNA)                                                                                                                                                                                               |
| acaoSugerida                | remover o elemento (§37, §38)                                                                                                                                                                                                           |
| pontuacao                   | H. Simplicidade · ausência de elementos gratuitos · 3                                                                                                                                                                                   |
| relacionadas                | R89, R90, R91, §37                                                                                                                                                                                                                      |
| observacoes                 | O revisor precisa inferir a função pela peça, não pela justificativa do criador (§3).                                                                                                                                                   |

### P01

| Campo                       | Valor                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| textoCanonico               | "Texto importante cortado."                                                |
| classe                      | `HARD_GATE` · categoria espacamento/tipografia · severidade **bloqueante** |
| objetoObservado             | blocos de texto × limites do canvas e da própria caixa de texto            |
| condicao                    | parte de um texto importante fica fora do canvas ou é truncada pela caixa  |
| fonteDaEvidencia            | camadas + render                                                           |
| verificavelPorGeometria     | **sim** · dependeDeVisao: não                                              |
| dependeDeBriefing           | parcial ("importante" vem da hierarquia/briefing) · DNA: não               |
| limiaresIndefinidos         | "importante"; "cortado" inclui ou não truncamento interno da caixa         |
| confiancaMinimaParaReprovar | 0.95 (geometria)                                                           |
| excecaoEditorialPermitida   | não                                                                        |
| acaoSugerida                | encurtar a mensagem (R16, R58) antes de reduzir corpo; reposicionar        |
| relacionadas                | R37, R57, R58, P03                                                         |

### P04

| Campo                       | Valor                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "Rosto coberto sem intenção explícita."                                                                 |
| classe                      | `HARD_GATE` · categoria fotografia · severidade **bloqueante**                                          |
| objetoObservado             | rostos na foto × elementos sobrepostos                                                                  |
| condicao                    | elemento gráfico cobre um rosto e não há intenção explícita registrada                                  |
| fonteDaEvidencia            | analiseDaFoto (detecção de rosto) + camadas (+ registro editorial da intenção)                          |
| verificavelPorGeometria     | parcial (depois da máscara do rosto) · dependeDeVisao: **sim**                                          |
| dependeDeBriefing           | parcial (onde a intenção é registrada) · DNA: não                                                       |
| percepcaoSubjetiva          | não para "coberto"; "coberto" precisa de limiar (parcial ou total)                                      |
| confiancaMinimaParaReprovar | 0.9 na detecção; abaixo disso, confirmação humana                                                       |
| excecaoEditorialPermitida   | `sim_com_registro_previo` — "intenção explícita" precisa estar registrada antes, não justificada depois |
| acaoSugerida                | mover o elemento para fora da região do rosto                                                           |
| relacionadas                | R01, R02, R07, P05                                                                                      |

### P06

| Campo                       | Valor                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| textoCanonico               | "Produto principal significativamente obstruído."                    |
| classe                      | `HARD_GATE` · categoria fotografia · severidade **bloqueante**       |
| objetoObservado             | produto principal × elementos sobrepostos                            |
| condicao                    | fração do produto encoberta acima do limiar de "significativamente"  |
| fonteDaEvidencia            | analiseDaFoto (máscara do produto) + camadas                         |
| verificavelPorGeometria     | parcial · dependeDeVisao: **sim** · DNA: não                         |
| dependeDeBriefing           | parcial (qual é o produto anunciado)                                 |
| limiaresIndefinidos         | "significativamente" (fração de área? região essencial como rótulo?) |
| confiancaMinimaParaReprovar | 0.9 na identificação do produto; limiar de área a definir            |
| excecaoEditorialPermitida   | não                                                                  |
| acaoSugerida                | reposicionar o conteúdo (R06, R15)                                   |
| relacionadas                | R01, R03, P07                                                        |

### P08

| Campo                       | Valor                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| textoCanonico               | "Informação obrigatória ausente."                                                          |
| classe                      | `HARD_GATE` · categoria factual · severidade **bloqueante**                                |
| objetoObservado             | textos desenhados na peça × lista de informações obrigatórias do briefing                  |
| condicao                    | item obrigatório não aparece na arte                                                       |
| fonteDaEvidencia            | briefing + textos da peça (pelas camadas; OCR do render só quando não houver camadas)      |
| verificavelPorGeometria     | não (é verificação de conteúdo) · dependeDeVisao: não quando há camadas                    |
| dependeDeBriefing           | **sim** · DNA: não                                                                         |
| percepcaoSubjetiva          | não                                                                                        |
| limiaresIndefinidos         | o texto não define o que é "obrigatória": precisa existir no briefing como lista explícita |
| confiancaMinimaParaReprovar | 0.95                                                                                       |
| excecaoEditorialPermitida   | não                                                                                        |
| acaoSugerida                | incluir a informação; se não couber, rever a densidade (R92–R95)                           |
| relacionadas                | P09, R26, R93                                                                              |

### P09

| Campo                       | Valor                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| textoCanonico               | "Informação factual divergente do briefing."                                    |
| classe                      | `HARD_GATE` · categoria factual · severidade **bloqueante**                     |
| objetoObservado             | fatos desenhados (preço, data, horário, endereço, unidade, condição) × briefing |
| condicao                    | valor desenhado diferente do valor do briefing                                  |
| fonteDaEvidencia            | briefing + textos da peça                                                       |
| verificavelPorGeometria     | não · dependeDeVisao: não quando há camadas                                     |
| dependeDeBriefing           | **sim** · DNA: não                                                              |
| percepcaoSubjetiva          | não                                                                             |
| confiancaMinimaParaReprovar | 0.95 (comparação normalizada de valores)                                        |
| excecaoEditorialPermitida   | não                                                                             |
| acaoSugerida                | corrigir o texto pelo briefing                                                  |
| relacionadas                | P08                                                                             |
| observacoes                 | Exemplo direto de identidade factual que a ordem do §2 não autoriza violar.     |

### P10

| Campo                       | Valor                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| textoCanonico               | "Contraste que impeça leitura normal."                                                     |
| classe                      | `HARD_GATE` · categoria contraste_cor · severidade **bloqueante**                          |
| objetoObservado             | contraste local de cada bloco de texto (R67)                                               |
| condicao                    | contraste local abaixo do limiar de "leitura normal"                                       |
| fonteDaEvidencia            | render + camadas                                                                           |
| verificavelPorGeometria     | **sim** (amostragem de pixels sob o bbox) · dependeDeVisao: não                            |
| dependeDeBriefing           | não · DNA: não                                                                             |
| limiaresIndefinidos         | "leitura normal" — R70 indica parâmetros de acessibilidade digital como referência técnica |
| confiancaMinimaParaReprovar | 0.9                                                                                        |
| excecaoEditorialPermitida   | não                                                                                        |
| acaoSugerida                | menor intervenção que restaure a leitura (R69, ordem de R10)                               |
| relacionadas                | R66–R70, R52                                                                               |

### P12

| Campo                       | Valor                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| textoCanonico               | "DNA incorreto de outra marca."                                                                      |
| classe                      | `HARD_GATE` · categoria dna · severidade **bloqueante**                                              |
| objetoObservado             | fontes, paleta, logo e grafismos da peça × DNA do projeto                                            |
| condicao                    | elemento de identidade que pertence a outra marca, ou ausência do DNA correto onde ele é obrigatório |
| fonteDaEvidencia            | camadas (famílias de fonte, cores, logo) + dna                                                       |
| verificavelPorGeometria     | **sim** para fontes e cores declaradas nas camadas · dependeDeVisao: não                             |
| dependeDeBriefing           | não · dependeDeDNA: **sim**                                                                          |
| percepcaoSubjetiva          | parcial (para "linguagem visual")                                                                    |
| confiancaMinimaParaReprovar | 0.95 para fonte ou logo de outra marca                                                               |
| excecaoEditorialPermitida   | não                                                                                                  |
| acaoSugerida                | trocar pelos ativos do DNA do projeto                                                                |
| relacionadas                | R51, R53, R96, P13                                                                                   |
| observacoes                 | Exemplo direto de identidade factual que a ordem do §2 não autoriza violar.                          |

### P14

| Campo                       | Valor                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| textoCanonico               | "Fotografia severamente prejudicada pela intervenção gráfica."                                          |
| classe                      | `HARD_GATE` · categoria fotografia · severidade **bloqueante**                                          |
| objetoObservado             | foto original × arte final (§36 teste da foto limpa): textura, profundidade, atmosfera, cor do alimento |
| condicao                    | perda severa de qualidade fotográfica causada por overlays, gradientes, filtros ou cobertura            |
| fonteDaEvidencia            | fotoOriginal + render + camadas                                                                         |
| verificavelPorGeometria     | parcial (área coberta, opacidade de overlays) · dependeDeVisao: **sim**                                 |
| dependeDeBriefing           | não · DNA: não                                                                                          |
| percepcaoSubjetiva          | **sim** — "severamente" é julgamento                                                                    |
| limiaresIndefinidos         | "severamente"                                                                                           |
| confiancaMinimaParaReprovar | sem reprovação automática até calibração; confirmação humana obrigatória                                |
| excecaoEditorialPermitida   | não                                                                                                     |
| acaoSugerida                | reduzir a intervenção na ordem de R10; remover grafismos (§38)                                          |
| relacionadas                | R08, R09, R10, R11, R12, §36                                                                            |

## 7. Fotografia como primeira classe — dados futuros

A análise visual futura deverá conseguir representar, por foto (sem implementação agora; sem visão
computacional; sem REA):

| Dado                                | Representação proposta                                                                                                            | Regras que consomem    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Assunto principal                   | máscara ou polígono + tipo (pessoa, rosto, prato, corte, drink, garrafa, sobremesa, produto, ambiente, fachada, ação) + confiança | R01, R04, P06, P07     |
| Assuntos secundários                | lista de máscaras + tipo + confiança                                                                                              | R05, Zona B            |
| Centro de interesse                 | ponto ou região de saliência antes do design                                                                                      | §3.3, R21, §9          |
| Direção visual                      | vetores: olhar, corpo, perspectiva, diagonais, linhas arquitetônicas, movimento                                                   | R17, R18, R28          |
| Espaço negativo                     | regiões de baixa informação visual, com área                                                                                      | R15, R45, R46          |
| Zona A (protegida)                  | máscara: rostos, olhos, expressões, mãos na ação, alimento principal e sua textura, produto, bebida, rótulo relevante             | R01–R04, R07, P04, P05 |
| Zona B (sensível)                   | máscara: objetos secundários, mesas, mobiliário, ambiente, pessoas secundárias, texturas, desfocados parciais                     | R05, R06               |
| Zona C (disponível)                 | máscara: paredes, céu, superfícies homogêneas, desfocados, sombras uniformes, espaço negativo                                     | R06, R15               |
| Regiões de contraste                | mapa de luminância/cor: onde texto claro ou escuro tem melhor legibilidade                                                        | §3.6, R66, R67, R75    |
| Elementos narrativamente relevantes | lista de máscaras que não podem ser encobertas, mesmo fora do assunto principal                                                   | §3.7                   |

Requisitos transversais: toda região com **confiança**; coordenadas no espaço do canvas (para cruzar com
as camadas); a mesma análise servida ao criador e ao revisor, que **recalcula** sobre a arte final em vez
de confiar na análise do criador.

## 8. Rich-text

Fora deste documento e da automação semântica. Backlog: issue #209.

## 9. Ambiguidades encontradas no texto canônico

Registradas para decisão; nenhuma foi resolvida por reescrita do canônico.

1. **R02 × P05.** R02 admite atravessar olhos "sem uma intenção editorial explícita" (logo, com
   intenção, é admitido). P05 ("Olhos atravessados por texto ou elemento gráfico.") reprova sem exceção.
   P04 (rosto) tem a exceção, P05 não.
2. **Consequência das R-regras normativas.** Só P01–P14 têm reprovação automática. Regras com
   "é proibido" ou "nunca" (R01, R02, R85, R96, R62…) não têm consequência definida além da nota. A
   classe `INVARIANTE` aqui é proposta, não texto.
3. **Limiares sem medida:** "significativamente" (P06, P07), "severamente" (P14), "quase alinhados"
   (R29), "poucos pixels" (R30), "suficiente" (R39, R61, R66), "leitura normal" (P10), "colado à borda"
   (R37), "ligeiramente maiores" (R81).
4. **"Importante" e "obrigatória".** "Texto importante" (P01, R37), "informações importantes" (R103) e
   "informação obrigatória" (P08) dependem de uma classificação que o texto pede (§7: H1, H2, H3,
   serviço, marca), mas não diz quais níveis são "importantes" nem onde fica a lista de obrigatórios.
5. **Intenção não observável.** "apenas para facilitar" (R01), "por conveniência" (R07), "acidental"
   (R04, P03, R39, R96, §39), "por erro" (P11), "sem intenção explícita" (P04). O revisor independente só
   vê a peça; a intenção precisa estar registrada antes (proposta `sim_com_registro_previo`).
6. **Área segura não numérica.** R38 e P03 dependem de uma área segura que o texto não fixa; R102/R103
   dizem que ela varia por formato e interface da plataforma.
7. **Ordem do §29 × R51.** A etapa 8 (tipografia) vem antes da etapa 9 (DNA), mas R51 diz que a
   tipografia segue prioritariamente o DNA. Leitura possível: a etapa 8 decide a função tipográfica e a
   9 aplica os ativos da marca; o texto não diz.
8. **Ordem do §2 × fatos de identidade.** O DNA aparece abaixo da composição na ordem de prioridade, mas
   P12/P13 tornam erros de identidade bloqueantes. Resolvido neste documento pelo §2 (prioridade de
   resolução, não licença), por decisão registrada em 12/10/2026.
9. **"Peso visual"** (R05, R48, R78, §35) é definido por uma lista de fatores (R78) sem ponderação.
10. **R03 "quando houver alternativa"** exige comparar composições possíveis, não só a entregue.
11. **"Aprovada com ressalvas: pode publicar"** (§32) convive com P01–P14; a classificação só se aplica
    quando nenhuma proibição estrutural ocorreu.

## 10. Próximos passos (não iniciados)

- Operacionalizar as demais regras no mesmo schema, só depois de validar estes 19 exemplos.
- Definir os limiares do item 9.3 com exemplos reais aprovados e reprovados (calibração).
- Definir onde o briefing registra "informação obrigatória" e "intenção editorial explícita".
- Só então desenhar criador e revisor.
