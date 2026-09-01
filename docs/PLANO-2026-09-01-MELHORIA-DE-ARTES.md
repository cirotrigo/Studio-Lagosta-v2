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
