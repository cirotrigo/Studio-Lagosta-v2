# Plano — a melhoria de artes para toda a carteira (01/09/2026)

Continuação de `docs/HANDOFF-2026-09-01-MELHORIA-DE-ARTES.md`. O fluxo-alvo é
o que o Ciro já decidiu: a semana nasce no **canvas de design** (custo zero),
vai para a agenda como rascunho, e "melhorar com IA" é um **rediagramador**:
posiciona melhor os textos e destaca as palavras-chave. Foto, copy e
identidade são invariantes.

Este plano parte de medição, não do handoff. O que foi medido em 01/09 à noite:

## 0. O que os números dizem

**Uso da melhoria desde 01/08/2026 (141 gerações, 10 clientes):**

| cliente | melhorias | conferência OK | sem régua (`skipped`) |
|---|---:|---:|---:|
| By Rock | 57 | 14 | 43 |
| TERO | 24 | 2 | 22 |
| Espeto Gaúcho | 21 | 19 | 0 |
| Empório Fonseca | 12 | 4 | 8 |
| Bacana | 10 | 1 | 9 |
| Real Gelateria | 9 | 0 | 9 |
| Quintal, Wine Vix, Seu Quinto, Lagosta | 8 | 3 | 4 |
| **total** | **141** | **43** | **95 (67%)** |

Dois terços das melhorias rodaram **sem régua de texto** — o modelo lia o
serviço da própria imagem e completava o que não entendia. O Espeto é a
exceção que prova a regra: as artes dele vinham com `slotValues` e a régua
existia por construção.

**Depois do conserto nº 7** (`a801fe7f`, deploy 19:26 de 01/09): o Ciro rodou
**9 melhorias no By Rock**, duas pelo caminho do carrossel (`skip=true`,
índices 4 e 1) e sete pelo caminho comum. **As 9 passaram na conferência**, as
duas do carrossel com régua por visão. No eixo do TEXTO, o defeito está
fechado — falta o olho dele confirmar o eixo da FOTO, que nenhuma régua mede.

**Feedback capturado: 3 sinais em 141 melhorias.** Não dá para medir se a
melhoria melhora. Isto vem antes de qualquer ajuste de prompt.

**A copy existe em TODAS as 9 pastas do canvas** (`slots.json`, `dados.py`,
`mapa.json` com `copy` no Quintal) e **nenhuma chega ao `upload-creative`**:
nenhum script de pasta chama a tool, e a skill `agendar-artes` não menciona o
parâmetro `textos`. É um fio solto, não um problema de modelo.

## 1. Princípios (o que as duas semanas ensinaram)

1. **Régua por construção vence régua por visão.** A copy nasce no gerador;
   transcrever a arte é o fallback, nunca o caminho.
2. **Instrução de prompt não segura fidelidade de foto** — medido três vezes.
   O que segura é tirar do prompt o que manda refazer (`photoDirection`,
   direção de arte) e, adiante, limitar o que o modelo PODE tocar.
3. **Verificador avisa; regenera sozinho só quando a saída é inutilizável**
   (regra do Ciro, 12/08). Endereço inventado é inutilizável; caixa de letra
   diferente não é.
4. **Nada muda sem medir na mesma peça, mesma proporção, n≥2.** A bancada é
   `scripts/medir-fidelidade-da-melhoria.ts`; ela cresce, não se substitui.
5. **A composição que o canvas erra se corrige primeiro no canvas**, que é
   determinístico e de graça. A IA é o que sobra.

## 2. As fases

### F0 — Fechar o dia de ontem (hoje, sem custo)

- **Confirmar o conserto nº 7 com o Ciro**: 9 de 9 passaram na régua; ele
  julga a foto de 2 delas (uma de carrossel, uma comum). Se aprovar, o
  handoff fecha.
- **O post de quarta 02/09 15h do By Rock** (`SCHEDULED`, arte alterada pela
  IA): voltar a rascunho → `trocar-arte-do-post` para a arte de origem →
  reaprovar. Decisão dele, 2 minutos.
- **Registrar de onde veio a régua** em `fieldValues.regua`
  (`banco | linhagem | visao | nenhuma`) — hoje isso só existe espalhado em
  `reguaPorVisao`/`textCheckReason`, e o handoff mostrou que
  `textCheckReason` mente por omissão. Uma coluna de leitura, zero risco.

### F1 — A régua por construção nos 9 clientes (1 dia)

O fio copy → upload, fechado nas três pontas:

1. **Todo gerador de leva escreve um `entrega.json`** ao lado dos renders:
   `[{ arquivo, textos[] }]`, um item por artboard, `textos: []` explícito
   nas capas de carrossel (é o que liga `semTexto` no `importarArte`). O
   Quintal já grava `copy` no `mapa.json`; vira o mesmo campo nos 9
   (`_entrega.py` compartilhado em `design-canvas/`, irmão do `_halo.py`).
2. **`upload-creative` ganha `entregaPath`**: lê o `entrega.json`, sobe cada
   arquivo com os SEUS textos numa chamada só. Hoje "com vários arquivos a
   mesma lista vale para todos" — uma leva de 21 stories exigiria 21
   chamadas, e é por isso que ninguém passa `textos`.
3. **A skill `agendar-artes` passa a exigir o `entrega.json`** quando a arte
   vem do canvas, e recusa subir leva de canvas sem ele (o mesmo espírito do
   "é `upload-creative`, nunca `upload-to-drive`").

Backfill: as levas vivas com halo (By Rock já tem; Wine Vix e Quintal serão
refeitas e nascem com régua). Espeto (no ar) e Real (rascunhos) recebem a
copy do `slots.json` por script, como se fez no By Rock com 54 artes.

**Efeito esperado**: `skipped` cai de 67% para perto de zero em leva nova, e
a régua deixa de depender da visão — que é onde "Rua Gomes de Carvalho" nasceu.

### F2 — Conferência de texto A MAIS (meio dia)

`verifyImageTexts` já devolve `extracted` e `numerosNaoEsperados`. Falta a
regra sobre bloco que não existe na régua:

- **Texto a mais com DADO** (número, hora, "Rua/Av.", nome de cidade, R$):
  **alerta vermelho** na galeria, na agenda e na bancada, citando o bloco
  inventado. É o caso "endereço de outro estado". **Não regenera** — decisão
  do Ciro em 01/09, coerente com o desfazimento da escada automática de 12/08.
- **Texto a mais sem dado** (uma palavra decorativa, um CTA extra): aviso
  discreto.
- O nome da marca e o que veio da régua por visão não contam.

### F3 — Feedback que dá para medir (meio dia)

- **Um clique depois de cada melhoria**: o card da agenda e o modal mostram
  "Gostei / Preciso melhorar" assim que a arte chega (hoje o botão existe na
  galeria e ninguém vai lá — 3 sinais em 141).
- **`scripts/medir-melhoria.ts` semanal**: por cliente, % com régua, %
  conferência OK, % texto a mais, % "gostei", tier, custo. Entra no relatório
  de segunda 08h que já existe.

Sem F3, F4 e F5 são palpite.

### F4 — Bancada por cliente e o prompt de cada marca (2 dias, ~US$ 1)

- **Conjunto fixo de teste**: 1 story + 1 feed por cliente, 18 peças, com a
  régua da F1. `medir-fidelidade-da-melhoria.ts` ganha `--carteira`: roda
  as 18 em `low`, 2 rodadas, monta uma folha de contato por cliente
  (antes | depois A | depois B). Custo: 36 × US$ 0,008 ≈ US$ 0,30.
- **O que medir**: (a) foto intacta (olho, na folha); (b) régua OK; (c)
  texto a mais; (d) serviço no rodapé; (e) palavras-chave destacadas.
- **Prompt por marca**: hoje o prompt é 66% identidade (15,4k chars). A
  bancada diz, por cliente, o que da identidade ainda manda refazer a foto
  (`brandStyleDescription` é a suspeita seguinte — é prosa do designer). O
  `Project.artImprovementPrompt` passa a ser SÓ a `[A TAREFA]` daquela marca
  (439 chars por padrão), nunca uma direção de arte.
- **Tier**: medido na MELHORIA (o 12/08 foi na trilha `arte`): `low` ×
  `medium` nas mesmas 18. Se `low` empatar, fica; se perder em destaque de
  palavra-chave, `medium` (US$ 0,045) vira padrão.

### F5 — Rediagramar sem regenerar a foto (spike de 1 dia, depois decide)

`images.edit` regenera a imagem inteira — é a raiz de "6 de 8 alteraram a
foto". Dois caminhos que preservam pixels, para medir na bancada da F4:

- **Máscara no `images.edit`**: a API aceita `mask`; fora dela a foto sai
  intacta por construção. A máscara é a união das zonas de texto
  (topo/rodapé/coluna), que o gerador do canvas já conhece (`mapa.json` do
  Quintal grava a `caixa` de cada halo). Limite: o texto só pode ir para onde
  a máscara deixa — que é exatamente o que "rediagramar" precisa.
- **Rediagramar no próprio canvas**: "melhorar" numa arte nascida do canvas
  vira "gerar 3 variantes de layout" (topo/rodapé/coluna, halo recalibrado),
  renderizadas de graça, e a pessoa escolhe. Foto e copy intactas por
  construção. Hoje o gerador é Python + Chrome na pasta da leva — o spike é
  medir se vale expor isso como serviço (rota que roda o gerador da leva) ou
  se fica como gesto de chat ("rediagrama o story de terça 9h").

A decisão entre os dois (ou os dois: máscara para arte de fora, canvas para
arte do canvas) sai da folha de contato, não de argumento.

## 3. Ordem e o que depende de quê

```
F0 (hoje) → F1 (régua + entrada na bancada) → F3 (feedback + melhorar na bancada) → F2 (texto a mais) → F4 (bancada de medição, pelas duas portas) → F5 (spike)
```

F1 antes de tudo: sem régua, F2 não tem contra o que comparar e F4 mede a
coisa errada. F3 antes de F4 porque a bancada precisa do "gostei" para
calibrar o olho. F5 por último, com números.

## 4. O que NÃO fazer

- Não escrever mais regra de prompt sobre fidelidade da foto — três
  rodadas provaram que não segura.
- Não medir "quanto a foto mudou" por diferença de pixel — mistura troca de
  foto com rediagramação.
- Não concluir de n=1 nem testar story em tamanho de feed.
- Não completar a paridade das regras da melhoria com as da geração — duas
  delas contradizem o feedback do Ciro (`regras-da-melhoria.ts`, cabeçalho).
- Não confiar em `textCheckReason`; ler o `GenerationJob.payload`.

## 5. Decisões

**Decididas pelo Ciro em 01/09/2026 (noite):**

- **Texto a mais com dado inventado: SÓ AVISA.** Nada de regeneração
  automática — a F2 vira alerta vermelho na galeria, na agenda e na bancada,
  com o bloco inventado citado. Coerente com "verificador avisa, nunca veta".
- **Margem: PRESERVAR os 90px da arte.** A regra 2 de
  `regras-da-melhoria.ts` fica como está; a safe area continua sendo assunto
  de quem CRIA a peça. A tensão com o avatar do Instagram está aceita.
- **As duas portas de entrada têm a mesma melhoria** (§ 6).

**Ainda com ele:**

1. Conserto nº 7: as 9 de ontem à noite estão boas na FOTO?
2. Trocar a arte de quarta 15h do By Rock.
3. F5: vale um dia de spike antes de a bancada da F4 existir, ou depois?

## 6. As duas portas de entrada — a melhoria é UMA só

Arte criada fora do Studio (canvas, export, arquivo do cliente) entra por dois
caminhos, e o Ciro exige que "melhorar com IA" se comporte igual nos dois:

1. **Fila da bancada** — a arte fica como card `pronto`, ele revisa, e dali
   agenda.
2. **Rascunho direto na agenda** — `upload-creative` → `colocar-na-agenda`.

**O que existe hoje (medido em 01/09):** só a porta 2 funciona. Dos 330 itens
de plano criados desde 15/08, **nenhum** aponta para arte do canvas
(`arte-enviada`): `criar-plano` e `editar-item-do-plano` não aceitam
`generationId`, só `executar-plano` grava um. A bancada **não tem botão de
melhorar** — a melhoria só é chamada da galeria e do detalhe do post na
agenda. E o runner da melhoria **não conhece `ItemDePlano`**: uma melhoria
feita pela galeria numa arte que está na fila cria outra Generation e o card
continua apontando para a antiga. O que já existe a favor: **todo item da
bancada carrega `copyProposta`** — é a régua por construção desta porta, e
os 330 itens têm copy.

**O desenho, para as duas portas convergirem:**

- **Uma Generation, uma régua.** A copy mora na Generation
  (`fieldValues.textos`, F1). Quem entra pela bancada grava a mesma coisa:
  o item com arte pronta recebe `generationId` e a Generation recebe
  `textos = copyProposta`. O resolvedor de régua é um só
  (`banco → linhagem → visão`), sem saber por qual porta a arte veio.
- **Entrada na bancada** (F1, junto com o `entrega.json`): `upload-creative`
  ganha `planoId`/`itemId` opcional — subiu a arte, o item vira `pronto` com
  o `generationId`; sem item, cria um item `pronto` no plano em aberto.
  `editar-item-do-plano` passa a aceitar `generationId` ("usa esta arte").
- **"Melhorar com IA" na bancada** (F3, meio dia a mais): o mesmo
  `ImproveCreativeModal` na prévia do card, com `applyToItemId` no lugar de
  `applyToPostId`. O runner, ao terminar, **reaponta o item** (ou o slide,
  em carrossel) para a Generation melhorada — o equivalente do
  compare-and-swap que ele já faz em `mediaUrls` do post. Sem isso o card
  mente, que é o defeito que a hidratação da bancada já teve de corrigir.
- **Mesmas travas nas duas portas**: só `pronto`/`editado` na bancada (como
  só `DRAFT`/`SCHEDULED` na agenda); em carrossel, o slide NA TELA; o
  feedback de um clique nos dois lugares.
- **A bancada de medição (F4) roda as 18 peças pelas DUAS portas**, e o
  resultado tem de ser o mesmo — é o teste de que a melhoria é uma só.

## 7. A rodada do Quintal (01/09, noite) — o que as duas portas mostraram

Teste real pedido pelo Ciro: quinta 03/09 pelo caminho padrão das ferramentas
(modelo do cliente → rascunho na agenda) e sexta 04/09 pela fila da bancada
(`criar-plano` → ele executou). Depois ele mandou melhorar as três de quinta.

### 7.1 A melhoria inventou endereço COM a régua no ar e a conferência verde

A arte de happy hour de quinta voltou com `Rua Fernandes Tourinho, 133 ·
Savassi, Belo Horizonte` no rodapé, com ícone de pino — o Quintal fica em
Vitória. `textCheck: passed`, régua do banco (6 blocos), tier `low`.

Por quê: a régua confere se o esperado ESTÁ; não tem regra contra bloco A
MAIS. E a regra 1 das regras da casa ("horário de funcionamento OU de
endereço… agrupado no rodapé") + a identidade da marca ("endereço sempre no
rodapé") descrevem um rodapé com endereço que a copy desta peça NÃO tinha —
o modelo completou o slot. É o mesmo mecanismo do 01/09 de manhã, agora com
a régua funcionando: **a régua protege o que existe; o buraco é o que não
existe e o prompt sugere**.

O que muda no plano:

- **F2 sobe de prioridade e ganha um segundo braço**: além do alerta de texto
  a mais (decisão: só avisa), o prompt passa a declarar a CONTAGEM e o
  conteúdo dos blocos ("esta peça tem exatamente 6 blocos; não acrescente
  bloco, linha, ícone de serviço nem dado que não esteja na lista"), e as
  regras da casa deixam de citar "endereço" quando a régua não tem endereço
  (a regra 1 vira condicional aos blocos de serviço detectados, que é o que
  `blocosDeServico` já sabe).
- **Os FATOS do cliente entram no prompt como dado, não como licença**: a
  ficha da base (endereço oficial, horário) numa seção `[FATOS DO CLIENTE —
  só para conferir, nunca para acrescentar]`. Sem ela, quando o modelo decide
  escrever um endereço, o único que ele tem é o que inventa.
- A primeira tentativa dessa mesma peça REPROVOU (perdeu o CTA e a
  descrição) e a segunda passou com o endereço inventado: a conferência
  pegou o que faltava e deixou passar o que sobrava. É exatamente a metade
  que falta.

### 7.2 O caminho padrão de "crie os stories de quinta" erra em 3 de 3 peças

| passo | o que a ferramenta fez por padrão | efeito |
|---|---|---|
| `sugerir-posts` | 10h e 13h pelo histórico; a grade da base diz 08h, 9h30, 14h | quem segue a sugestão publica fora da grade que o próprio cliente aprovou |
| `escolher-modelo("funcionamento")` | não há modelo; devolveu "Celebrações Especiais" | peça institucional montada num layout de data comemorativa |
| `escolher-modelo("almoço executivo")` | página legada de dez/2025 (`Pag.01`, campos não dinâmicos) | a foto pedida (ancho) NÃO foi aplicada — o render mostra os pastéis doces da página, com `imageApplied: true`; horário sai em CAIXA ALTA por ser camada fixa |
| `escolher-modelo("happy hour")` | modelo certo, mas com "17h às 19h" de fábrica no slot de serviço | quem não preencher publica horário errado (a base diz 16h) |
| `buscar-fotos("ambiente")` | 1ª sugestão é foto de drink; a panorâmica tem guarda-sol Brahma em destaque | marca de terceiro, que o DNA proíbe |
| `buscar-fotos("almoço executivo")` | 1ª sugestão é `2026-cmt07071`, que tem a carta de vinhos com preço legível | o catálogo não sabe do preço; a régua de texto também não |
| rodízio | fotos dos rascunhos APAGADOS às 22h seguem "usadas em 04 e 05/09" | descem na fila sem ter ido ao ar |
| CTA verde | `#557737` sobre foto escura no rodapé | quase ilegível; o DNA manda `#7A9A5C` sobre escuro |

E cada consulta de foto ou de horário gravou um `LearningSignal` — 7 sinais
numa exploração que não virou decisão.

### 7.3 A fila da bancada trocou a via sem avisar

Os 3 itens de sexta nasceram `via: template` (modelo do cliente, custo
zero). O Ciro apertou "Gerar" na bancada e as três saíram por IA: o hook da
bancada só tem o motor de geração e reescreve a via para `ia` ao gerar
(`use-bancada.ts`, comentário de 23/08). O resultado ficou bom — é a arte
que ele quer —, mas a fila prometeu uma coisa e entregou outra, com
crédito. As duas portas não produzem a mesma arte hoje: a agenda monta no
modelo (véu), a bancada gera por IA (halo).

### 7.4 O que o Ciro quer: a arte de modelo tem de parecer a arte de IA

Lado a lado, quinta (modelo) × sexta (IA), mesma copy e fotos equivalentes:
a de IA lê a foto, põe o texto na área calma, usa véu LOCAL (halo), varia a
diagramação e o rodapé de serviço; a de modelo tem gradiente de faixa
(véu), texto em posição fixa e colisões que a autocorreção só encolhe. Ele
pediu que a arte que sai do design/modelo se aproxime da de IA. Entra como
fase:

### F6 — O halo e a leitura da foto chegam ao render de modelo (3 dias)

- **Camada `halo` no `render-engine` e no editor Konva**: um retângulo
  desfocado atrás do GRUPO de texto (`filter: blur` no próprio nó, nunca no
  fundo), com tinta e raio calibrados pela luz da foto no retângulo do texto
  — é o `_halo.py` portado para TypeScript (`alvo_por_contraste`,
  `tinta_para_alvo`, `luz_de_leitura`, `ajustar_por_geometria`). O véu de
  gradiente dos templates vira opcional.
- **Posição pela foto, não pelo modelo**: os 3 layouts de cada tema já
  existem (dividido/topo/rodapé); `createArteRapida` passa a escolher entre
  eles pela energia e luz das faixas da foto (o `escolher_banda` do By Rock),
  em vez de `candidates[0]`.
- **Saneamento do pool de modelos do Quintal**: despromover `Pag.01`
  (legado, campos fixos), criar o modelo de FUNCIONAMENTO (não existe),
  corrigir o "17h" de fábrica, e tag de dia/tema nos 16.
- **`escolher-modelo` sem match devolve "não há modelo para este tema"**, nunca
  o primeiro da lista: um modelo errado montado com copy certa é pior que
  cair na IA.
- **`sugerir-posts` lê a grade da base quando ela existe** (entrada "Padrões
  de Postagem") e só cai no histórico quando não há grade.
- **Rodízio de fotos**: apagar rascunho desfaz o `PhotoUsage` daquele post; e
  `buscar-fotos` em modo exploração (sem decisão) não emite sinal — ou o
  sinal expira em 1h se ninguém escolher.
- **Foto com preço ou marca de terceiro**: a catalogação por visão ganha as
  duas perguntas ("há preço legível?", "há marca de terceiro em destaque?")
  e a busca rebaixa as positivas. São as duas armadilhas do README da leva
  do Quintal, agora vistas de novo no caminho padrão.

Ordem revisada: **F0 → F1 → F2 (com 7.1) → F3 → F6 → F4 → F5**. A F6 entra
antes da bancada de medição porque é ela que decide o que a melhoria vai
receber como entrada: com o modelo já lendo a foto e usando halo, a melhoria
volta a ser o acabamento que o Ciro descreveu, e não o conserto do layout.
