# Artes boas pela API, como o ChatGPT faz: o que ele faz de diferente e o que muda no Studio

Escrito em 05/09/2026, a pedido do Ciro, a partir da conversa do ChatGPT
"Melhorar diagramação gelato" (Real Gelateria) e de uma medição A/B feita no
mesmo dia na mesma arte. Pergunta: **se o ChatGPT devolve uma arte bonita com
oito palavras de pedido, por que o Studio, usando o MESMO modelo de imagem pela
API, não devolve — e o que refatorar para devolver, com mais criatividade e
consistência.**

## 1. O caso, turno a turno

A arte enviada ao ChatGPT é a `Generation cmtojggac0010l8046i9xsg6t`: export do
editor (`2026-09-05_Pagina9`, template 87, 2160x3840, `fieldValues` vazio, sem
IA nenhuma). É uma tabela chapada de horários: fundo Menta, título e unidades em
Stage Grotesk bold, horários em Spritz, logo "Real" pequena no rodapé.

| turno | o que o Ciro escreveu | o que voltou |
|---|---|---|
| 1 | "melhore a diagramacao, deixe no estilo real gelato" (+ a arte) | Peça editorial: "HORÁRIO" em caps espaçado, "Especial / Feriado" em serifa alta e fina (a cara da Branley), **pills** verdes com o nome de cada unidade, tabela dia \| horário com filete vertical, respiro generoso, logo "Real" no rodapé. **Inventou** uma foto (pote de pistache com o selo R), **inventou duas frases** ("Mais tempo para você saborear o que importa", "Gelato sempre é uma boa ideia") e desenhou a marca duas vezes (no pote e no rodapé). |
| 2 | "utilize essa imagem de fundo, e substitua a frase Gelato sempre é uma boa ideia por viva o extraordinário" (+ foto real CMT00760) | Aplicou a foto REAL do morango como fundo, manteve a diagramação inteira do turno 1, trocou a frase. |
| 3 | "remova a frase mais tempo para saborear o que importa e substitua a frase de rodapé por viva o extraordinário" | Conforme, sem tocar no resto. |

Cada turno levou ~1 minuto, no modo de raciocínio "Alta". Os horários saíram
corretos nas três peças.

O que vale registrar:

- **O ChatGPT também inventa texto e foto.** Duas frases e uma fotografia que
  não estavam na arte — exatamente a classe de defeito que as regras da casa do
  Studio existem para impedir (e que a régua `blocosAMais` já acusa). A
  diferença é que o Ciro corrigiu em DOIS turnos de conversa, e o modelo editou
  a própria saída sem estragar o resto.
- **O bonito veio da liberdade de reestruturar.** Pills, filete, hierarquia de
  três níveis, serifa na manchete: nada disso está na arte de entrada. É
  justamente o que o prompt de melhoria do Studio PROÍBE desde 04/09 ("não mova
  bloco", "não crie nada", "a estrutura é dada").
- **Ele acertou a marca sem ler o DNA.** Doze mil caracteres de `visualStyle`,
  `composition` e `contentRules` não entraram em lugar nenhum. O modelo leu a
  logo na imagem e o nome "Real Gelato" e compôs uma peça que parece da marca.

## 2. O que a API oferece (pesquisa de 05/09/2026)

- **É o mesmo modelo.** ChatGPT Images 2.0 (abril/2026) é o `gpt-image-2` da
  API, o que o Studio já usa. `chatgpt-image-latest` é o snapshot ANTERIOR do
  ChatGPT; a OpenAI recomenda `gpt-image-2` para a API. Não há modelo secreto.
- **Parâmetros do `images.edit` para gpt-image-2**: `quality` `low|medium|high|auto`
  (default `auto`); `size` livre (lados múltiplos de 16, maior lado ≤ 3840, razão
  ≤ 3:1); até **16 imagens** de entrada; prompt até **32 mil** caracteres;
  `n` até 10; `background: transparent` (preview); `moderation`; `stream` com
  `partial_images`. **`input_fidelity` não se aplica ao gpt-image-2** — toda
  entrada já é processada em alta fidelidade (só gpt-image-1/1.5 aceitam).
  Multi-turn existe pela Responses API (`previous_response_id`), com `action`
  `auto|generate|edit`.
- **O guia oficial de prompting** (developers.openai.com/cookbook, "GPT Image
  Generation Models Prompting Guide") pede: ordem fixa "cena → sujeito →
  detalhes → restrições" e o USO pretendido ("ad", "social post") para calibrar
  o acabamento; texto literal **entre aspas, verbatim, "exactly once"**;
  referências **por índice** ("Image 1 is…, Image 2 is…"); em edição, "change
  only X, keep everything else the same" com a **lista de preservação repetida
  a cada iteração**; iterar em passos pequenos ("start with a clean base prompt,
  then refine with small, single-change follow-ups"); `medium`/`high` para
  texto pequeno e denso; prompts "skimmable e maintainable", segmentos curtos
  em vez de parágrafo longo. E a ressalva: "the model can still struggle with
  precise text placement".
- **SDK**: o repo está em `openai@^6.25` (tipa até `gpt-image-1.5`, daí o
  `size as never`); a `7.10.0` tipa `gpt-image-2`, `quality: 'auto'` e
  `moderation`. Upgrade é major — conferir `toFile` (`openai/uploads` virou
  re-export de `core/uploads`).

## 3. O que o Studio faz hoje (lido no código e medido no banco)

- **Melhoria** (`openai-image-client.ts` + `regras-da-melhoria.ts`): o prompt
  da peça da Real tem **22.153 caracteres**, 12 seções. As regras da casa
  PRESERVAM por desenho: estrutura dada, nada se move de zona, nada se cria,
  nenhum contraste acrescentado. Referências enviadas: **só a logo** — o manual
  do designer e a prancha tipográfica, que a GERAÇÃO manda, a melhoria não
  manda. Tier padrão `low`. A hipótese `enxuto` (prompt sem identidade) existe
  em `BuildPromptArgs` desde 01/09 e nunca foi ligada a nenhuma porta.
- **Geração `arte`** (`buildArtePrompt`): 13 a 20 mil caracteres, dez regras
  numeradas, DNA inteiro, lock de tipografia, spine do modelo. O próprio código
  registra que o gpt-image "reescreve o prompt internamente e responde mal a
  paredão de regras" — e a "lei da casa" (a instrução que não se declara
  vencedora perde para a mais enfática, medida três vezes em agosto) é o
  sintoma disso: cada reprovação virou uma regra a mais no prompt do modelo de
  IMAGEM, e as regras passaram a brigar entre si.
- **Números** (produção, 21 dias até 05/09): 133 melhorias (30 em `low` só no
  Quintal), 1 "gostei" registrado contra 2 "preciso melhorar" nas melhorias;
  no total das artes, **26 gostei × 149 preciso melhorar**. Gerações por via:
  arte-enviada 737, arte-ia 529, compositor 353, post-schedule 146,
  editor/export 99, arte-rapida 45.

## 4. Medição A/B de hoje (mesma arte, mesmo tier, mesmo tamanho)

`scripts/medir-melhoria-estilo-chatgpt.ts` (dry-run por padrão; `--confirmar`
gera; não escreve no banco, não cobra crédito, ~US$ 0,05 por rodada em
`medium`). Duas variantes sobre a arte da Real, `gpt-image-2`, `1088x1936`,
`medium`:

- **studio** — o prompt de produção da melhoria, tal e qual `buildPromptSections`
  monta (22.153 chars), pedido "melhore a diagramação, deixe no estilo da
  marca", logo oficial como referência.
- **curto** — 1.451 chars no molde do guia oficial: papel ("art director of
  Real Gelateria"), uma frase de intenção (redesenhar no estilo da marca,
  hierarquia, respiro, serifa na manchete, grotesk na informação, um acento,
  ornamentos discretos), refs por índice (**manual do designer** e **prancha
  tipográfica**, que a melhoria hoje não manda), a copy entre aspas "exactly
  once", lista de proibições (sem texto extra, uma logo, safe area).

| variante | rodada | tempo | régua de texto | blocos a mais | luz média (origem 208,6) | o olho |
|---|---|---:|---|---|---:|---|
| studio | 1 | 37s | OK | 0 | 194,6 | Manteve a tabela chapada e a grotesk; **inventou uma foto** (pote de pistache, com o selo R desenhado nele) e trocou a marca "Real" pelo selo R no topo — duas marcas. |
| curto | 1 | 54s | OK | 0 | 244,5 | Fundo Crema, logo "Real" no alto, filete com folha e espiral **tirados do manual**, "Horário Especial / Feriado" em serifa da marca, **pills** Menta com as unidades, horários em Spritz. Nada inventado. Sem foto — como a origem. |

| studio | 2 | 30s | OK | 0 | 207,8 | Tabela preservada, manchete em serifa; **selo R acrescentado** no topo (não estava na origem), marca "Real" sumiu. |
| studio | 3 | 31s | OK | 0 | 205,2 | Idem; selo R no topo com o texto **"IL VERO GEATO"** (letra a menos) + "Real" no rodapé — duas marcas. |
| studio | 4 | 28s | OK | 0 | 209,5 | Idem; selo R no topo + "Real" no rodapé — duas marcas. |
| curto | 2 | 33s | OK | 0 | 242,5 | Mesmo sistema da rodada 1 (Crema, serifa, pills, filete com folha, onda dourada); "Real" no alto + ícone do pote do manual no rodapé. |
| curto | 3 | 32s | OK | 0 | 246,4 | Mesmo sistema; filete com estrela; "Real" só no rodapé. A mais limpa das oito. |
| curto | 4 | 41s | OK | 0 | 244,1 | Mesmo sistema, fundo Crema, espiral do manual como marca d'água; "Real" no rodapé entre filetes. |

**Placar em n = 4 por variante** (US$ 0,36 no total):

| | studio (22k chars, só logo) | curto (1,4k chars + manual + prancha) |
|---|---|---|
| régua de texto (copy verbatim) | 4/4 | 4/4 |
| bloco de texto inventado com dado | 0/4 | 0/4 |
| **elemento inventado** (foto, selo que não estava na origem) | **4/4** (selo R em todas; foto em 1) | 0/4 |
| marca desenhada com erro de grafia | 1/4 ("GEATO") | 0/4 |
| duas marcas na peça | 3/4 | 2/4 (ícone do pote / selo do manual, além do wordmark) |
| diagramação da MARCA (serifa, pills, filetes, respiro) | manchete em serifa, resto igual à origem | 4/4, consistente entre rodadas |
| consistência entre rodadas | alta (é o desenho: preservar) | alta (mesmo sistema, ornamento variando) |
| tempo médio | 32s | 40s |

O que a medição diz (n = 4 por variante, o piso que a casa fixou em 04/09):

- **Prompt curto + referência VISUAL de marca bate prompt longo + marca em
  prosa, 4 a 0 no que importa.** É o que o Ciro já tinha observado em 01/09
  ("testei com um prompt bem simples e funcionou melhor") e ficou como a
  hipótese `enxuto`, nunca medida. Os ornamentos que o curto usou (folha,
  espiral, onda, pote) estão TODOS no manual do designer — ele leu a imagem.
- **O paredão não protege**: a variante `studio`, com "não crie nada" e "a
  fotografia é intocável" escritos, acrescentou o selo R nas 4 rodadas (que a
  origem não tinha), inventou uma fotografia inteira numa e errou a grafia da
  tagline em outra. A regra estava lá; o modelo não a leu. O que a variante
  `studio` fez BEM — manter a tabela e trocar só a manchete para a serifa — é
  exatamente o que "rediagramar" deve fazer; ela só não serve para o pedido
  "redesenhe no estilo da marca".
- **Duas marcas é o defeito comum às duas** (3/4 e 2/4) — e o ChatGPT também
  fez. É o caso do `compor` (colar o arquivo por código depois): o prompt não
  segura sozinho.
- **A régua de texto passou nas duas** — o que o Studio já tem de verificação
  (texto a menos, texto a mais com dado) continua sendo o que separa o
  publicável do bonito.

### 4.1 A F0 completa: quatro origens, n = 4 (05/09/2026, tarde)

O mesmo A/B nas quatro peças do plano (`--peca=real|winevix|quintal|tero`,
32 gerações, US$ 1,44). A régua de texto passou em **32 de 32**; o que
separa as variantes é o que aconteceu com a FOTO e com a diagramação aprovada:

| peça | origem | studio (preservador) | curto (redesenho) |
|---|---|---|---|
| Real Gelateria — tabela de horários, sem foto | export do editor | 4/4 igual à origem + selo R acrescentado | **4/4 na marca**, nada inventado |
| Wine Vix — agenda de feriado sobre foto de adega | export do editor | 4/4 preservou (uma rodada escureceu a foto, luz 39,7) | 3/4 manteve a foto e acrescentou filetes dourados; **1/4 pintou um painel Crema por cima da foto** (luz 100 → 170) |
| O Quintal — almoço de feriado com halo | compositor | 4/4 preservou o halo e a diagramação | 2/4 acrescentou ramos/ornamentos, **1/4 cobriu o topo da foto com uma faixa Crema** (luz 103 → 175) |
| TERO — domingo em família, marca em `compor` | canvas de design | 4/4 preservou; foto intacta | **4/4 clareou/apagou o topo da foto** (luz 87 → 165-185) e 1/4 desenhou a marca errada ("TROO") |

O que isso decide, e que virou código no mesmo dia:

- **Redesenhar é certo quando a origem é matéria-prima** (a tabela da Real) e
  **errado quando a diagramação já foi aprovada** (compositor, canvas): em 1 de
  cada 4 rodadas o redesenho pinta por cima da foto, e no TERO em 4 de 4. Daí os
  DOIS MODOS com padrão pela origem (`modoPadraoDaMelhoria`): compositor,
  canvas e mídia de post → `rediagramar`; export do editor, arte-rapida,
  ajuste-arte, arte-ia → `redesenhar`; melhoria anterior → `refinar`.
- ⚠️ No TERO o prompt curto disse "Image 1 has no photograph" por uma
  heurística de desvio-padrão do script (foto escura ≈ fundo liso) — é isto que
  fez as 4 rodadas clarearem. É o argumento definitivo para o planejador
  ENXERGAR a peça (F1) em vez de o código adivinhar por estatística.
- **Marca em `compor` não se desenha**: o "TROO" do TERO é o mesmo defeito de
  14-17/08. O planejador recebe `logoCompor` e proíbe desenhar; o código cola.

## 5. Diagnóstico: por que o ChatGPT acerta com oito palavras

Não é o modelo, é o PROCESSO em volta dele:

1. **Um planejador lê a imagem antes de o gerador desenhar.** No ChatGPT, o
   GPT-5 em modo "Alta" olha a arte, entende "estilo Real Gelato", decide a
   diagramação e escreve um prompt curto e concreto para o gerador. No Studio,
   o prompt é montado por código, sem olhar a peça, concatenando tudo que já
   deu errado um dia. A trilha `imagem` já tem esse passo
   (`buildImagePromptViaLLM`, um "diretor de fotografia" que escreve o prompt);
   a trilha `arte` e a melhoria não têm.
2. **Pouca instrução e liberdade de compor.** O guia oficial e a medição de
   hoje apontam na mesma direção: o gpt-image compõe melhor lendo a foto e o
   manual do que seguindo dez regras numeradas. A casa aprendeu isso em 17/08
   ("prescrição de posição compete com a leitura da foto") e criou o modo
   livre — mas manteve o paredão em volta dele.
3. **Iteração por conversa, uma mudança por vez.** O modelo edita a PRÓPRIA
   saída anterior com "troque X, mantenha o resto". No Studio, "melhorar de
   novo" reexecuta o rulebook inteiro sobre a saída, e o pedido concorre com
   22 mil caracteres de regra.
4. **Preservar e redesenhar são pedidos diferentes**, e a melhoria só sabe
   preservar desde 04/09. O caso da Real era REDESENHAR: a arte de entrada não
   tinha diagramação a preservar, era uma tabela. Quando a peça vem do
   compositor ou do canvas, com halo e assinatura aprovados, preservar é
   certo; quando vem de um template chapado, é o oposto do que se quer.

## 6. Plano de refatoração

Ordem de dependência: nada sobe de F2 em diante sem a F0 medida.

### F0 — Medir antes de mexer (1 dia)

Estender `medir-melhoria-estilo-chatgpt.ts` para 4 peças reais (Real Gelateria,
agenda da Wine Vix, uma do TERO em `compor`, uma do Quintal com halo) × n = 4 ×
`medium`, duas variantes: `studio` e `curto`. KPI: régua OK, blocos a mais com
dado, luz média, e a folha de contato para o olho. Custo total ≈ US$ 1,50. É a
prova de que a F1 vale; sem ela é opinião.

### F1 — O diretor de arte por LLM (planner) (2 dias)

Módulo novo `src/lib/ai/diretor-de-arte.ts`, molde de `buildImagePromptViaLLM`:

- Entrada: as imagens (origem, manual, prancha, foto quando houver), o DNA, a
  copy (papel por bloco quando existir), o pedido, o formato, o modo.
- Saída: **um prompt de até ~2.500 caracteres** no molde do guia oficial (papel
  → intenção → refs por índice → copy verbatim → preservar/proibir), mais a
  lista ordenada de referências. Gravado em `fieldValues.prompt` como hoje.
- **As regras da casa viram o system prompt do PLANNER**, não do gpt-image:
  ali um texto longo é lido de verdade, e ele decide quais três ou quatro
  regras ESTA peça precisa. Teto de caracteres mecânico na saída.
- Modelo com visão (o mesmo `gpt-4o`/`gpt-5` que já escreve o prompt da
  trilha `imagem`, ou Claude). Custo por peça: centavos e 5 a 15 segundos.

### F2 — Dois modos de melhoria (1 dia)

`modo: 'rediagramar' | 'redesenhar'` no zod da rota `improve`, no serviço, no
modal (`improve-creative-modal.tsx`) e na tool `melhorar-arte`.

- `rediagramar` = o comportamento atual (regras da casa preservadoras).
- `redesenhar` = F1 + manual + prancha + copy verbatim; layout livre; a régua
  de texto e a contagem de blocos continuam; logo por `compor` onde a casa já
  decidiu isso.
- Default proposto: `redesenhar` quando a origem é export do editor ou
  `arte-rapida` sem halo; `rediagramar` quando vem do compositor ou do canvas.
  Decisão de produto do Ciro — o botão resolve enquanto não há regra.

### F3 — Referências visuais na melhoria (meio dia)

Mandar `getBrandReferenceCard` (o manual do designer vence) e
`renderTypeSpecimen` também na melhoria, como a geração já faz. Vale para os
dois modos: no `rediagramar` elas seguram a fonte quando o modelo redesenha a
letra.

### F4 — Refinar por conversa (1 a 2 dias)

Ação "refinar" sobre uma arte melhorada: `image[0]` = a saída anterior, prompt
= "Change only: <pedido>. Keep everything else exactly the same: layout, fonts,
colours, photo, logo, every other text." Usa a linhagem que já existe
(`sourceGenerationId`). É o turno 2 e 3 da conversa do Ciro. Avaliar a Responses
API com `previous_response_id` para manter o contexto entre turnos (custo e
latência a medir); a versão simples já funciona pelo `images.edit`.

### F5 — Parâmetros da API (meio dia)

- `quality`: `medium` quando a copy tem mais de ~6 blocos ou corpo pequeno
  (o guia oficial e a medição de 12/08: `low` inventa número); `auto` como
  candidato a default — medir.
- SDK `openai@7.x` para tipar `gpt-image-2` e tirar os `as never`.
- `n: 2` como opção da bancada ("me dê duas para escolher") — custa o dobro,
  só sob pedido.
- `input_fidelity`: nada a fazer (não existe no gpt-image-2).

### F6 — O mesmo planner na GERAÇÃO (depois de F0–F2 medidas)

`buildArtePrompt` passa a ser o system prompt do planner; o gpt-image recebe o
prompt curto por peça. Fica mecânico o que é mecânico: régua de texto,
`comporLogo` onde a marca pede, safe area em pixels, blocos a mais avisam,
halo na geração. O LOOK SPINE do carrossel é candidato a continuar como está
(série é o caso em que rigidez é desejada).

### O que NÃO muda

Verificação de texto (a menos e a mais), avisos que nunca vetam, logo composta
nos projetos em `compor`, fila durável, registro do prompt em `fieldValues`.

## 7. Riscos e como medir

- **Variância**: uma rodada não decide nada (a lição de 04/09: n = 2 deu 0,0,0,0
  numa leva e 8,6 na outra). Todo passo acima tem o script de medição antes.
- **Planner verboso**: o risco de a F1 recriar o paredão dentro do planner. O
  teto de caracteres da saída é mecânico, e o prompt gerado é gravado — dá para
  auditar.
- **Latência**: +5 a 15s por peça. Na fila durável isso é invisível; na bancada
  (que espera até 8 min) também.
- **Redesenhar em peça aprovada**: o modo `redesenhar` só entra por escolha ou
  pela heurística de origem; o `rediagramar` continua sendo o que a agenda
  oferece para peça do compositor.

## 9. Execução (05/09/2026, tarde) — o placar

Tudo de F1 a F6 entrou no mesmo dia, no branch `worktree-artes-como-o-chatgpt`.
Regras duráveis na seção "O diretor de arte" do CLAUDE.md.

| fase | o que entrou | onde |
|---|---|---|
| F1 | `planejarMelhoria` / `planejarArte`: `gpt-5.2` com visão escreve o prompt (teto 2.600 / 3.000 chars, até 3 rodadas), copy verbatim conferida por código, **nome de fonte fora da referência recusado**, fallback para o prompt de código | `src/lib/ai/diretor-de-arte.ts` |
| F2 | `modo: rediagramar \| redesenhar \| refinar`, padrão pela origem; `refinar` devolve `copyFinal` (a régua muda com o pedido); seletor de três cartões no modal; `modo` na rota, no serviço, no runner e na tool `melhorar-arte` | `modo-da-melhoria.ts`, `improve-creative-modal.tsx`, `creative-improvement-*.ts`, `catalogo/arte-ia.ts` |
| F3 | manual do designer (`brand-card`) e prancha (`type-specimen`) como referência na melhoria | `creative-improvement-runner.ts`, `openai-image-client.ts` |
| F4 | refinar = "change only X, keep everything else"; entrada pelo modal (padrão em melhoria anterior) e pela tool | idem |
| F5 | `redesenhar` → `medium`; o tier REAL gravado na geração (era `'high'` cravado no registro) | `qualidade-arte.ts`, `creative-generation-runner.ts` |
| F6 | planejador na geração `arte` avulsa; blocos mecânicos (logo, safe area em px) colados ao fim; `ARTE_PLANNER=off` desliga | `creative-generation-runner.ts` |

### Testes reais (peças na galeria, para avaliação visual — não foram apagadas)

| teste | peça | resultado |
|---|---|---|
| redesenhar, sem pedido | Real Gelateria, tabela do editor → `cmtopb3t30001swxnnht4s4wh` | 71s; duas colunas alinhadas, filete, selo R uma vez; régua OK |
| **refinar** ("tire a palavra Especial…, leve a logo para o canto inferior direito") | sobre a anterior → `cmtoperi50001sw2u9ca6mkmi` | 48s; "Horário / Feriado", logo no canto, TUDO o mais idêntico; `copyAntes` gravado; régua nova OK |
| redesenhar **com direção de arte** (adega premium, filete dourado, itálico no rodapé, sem ícones) | Wine Vix agenda → `cmtopevh00001sw3oxpwt6n0z` | 82s; seguiu a direção item a item; ⚠️ a foto voltou desfocada (o `images.edit` regenera o quadro — é a máscara, não prompt) |
| **carteira, 10 clientes**, modo pelo padrão da origem (`validar-melhoria-na-carteira.ts`) | uma peça recente por cliente | **10/10 COMPLETED, 10/10 régua OK**; planejador em 8/10 (Wine Vix caiu no fallback por teto — motivo da 3ª rodada e do teto 3.000 na geração); 3 rediagramar, 7 redesenhar; 73-142s por peça |
| geração `arte` com planejador | Quintal happy hour (repetição de `cmtjdtr2y0007sww6yuk4qxok`) | 1ª rodada: **"Amithen" letrado na peça** (nome de fonte no prompt) → nasceu `fontesForaDaReferencia`; 2ª: caiu no fallback (teto + fonte) → 3 rodadas e teto 3.000; 3ª: planejador OK |
| geração `arte` com modelo à mão + `compor` | Wine Vix sexta (repetição de `cmtkr9s6m003el604uguw3ayu`) → `cmtopn6uw0001swmumlmsvy4n` | 82s; manchete na área calma, serviço no rodapé, logo colada por código; régua OK |

Custo do dia: ~US$ 3 de OpenAI (F0 + testes) e 400 créditos de teste na conta
do Ciro (a conta estava em zero e recebeu 1.000 para os testes).

### O que ficou em aberto

- **Máscara** (`spike-melhoria-com-mascara.ts`): a foto ainda é regenerada pelo
  `images.edit` — no redesenho da Wine Vix ela voltou desfocada.
- **Cobrança em paralelo**: três melhorias simultâneas estouram a transação da
  dedução (`P2028`); a melhoria segue valendo e o ramo de falha agora grava o
  mesmo registro do ramo feliz.
- **Aviso de texto a mais** na geração não acusou "Amithen" (a régua confere o
  que falta); o guard mecânico no planejador cobre o caso, mas um aviso de
  palavra fora da copy na geração continua faltando.
- `n: 2` (duas variantes para escolher) e SDK 7.x não entraram.

## 8. Fontes

- OpenAI — GPT Image Generation Models Prompting Guide
  (developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- OpenAI — gpt-image-1.5 Prompting Guide
  (developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide)
- OpenAI — Image generation guide (developers.openai.com/api/docs/guides/image-generation)
- OpenAI — modelos `gpt-image-2` e `chatgpt-image-latest`
  (developers.openai.com/api/docs/models/…)
- Tipos do SDK `openai@6.25` (instalado) e `openai@7.10.0` (unpkg)
- Conversa do ChatGPT "Melhorar diagramação gelato", 05/09/2026
