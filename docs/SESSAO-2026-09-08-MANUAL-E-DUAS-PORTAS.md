# Sessão 2026-09-08 — o manual como design system, o prompt do manual e as duas portas da bancada

Continuação direta de 07/09 (PRs #102 a #106: tier `low` por padrão, canto da
marca escolhido por quem vê a foto, halo sem fim visível, margens do story por
canto, modo estrito como padrão da carteira). Esta sessão fecha os três passos
que o Ciro aprovou de manhã ("Aprovado, pode aplicar e seguir com os três
passos"): **(1)** aplicar os manuais novos, **(2)** rerodar o teste D com eles,
**(3)** as duas portas na bancada. E, no meio, o pedido de "montar algo parecido
para cada cliente" a partir do prompt do happy hour da Wine Vix que ele escreveu
à mão.

Tudo aqui foi testado **direto na API** (foto + imagens + prompt, `runImageEdit`,
tier `low`, ~US$ 0,008 por peça). **A porta da bancada ainda não foi medida em
produção** — é o que a próxima sessão testa. Ver § 6.

---

## 1. De onde veio: a medição de 07-08/09

O Ciro relatou que as artes da bancada tinham piorado em relação às que o
Claudinho fazia, e apostou na receita: "o correto é você enviar a arte escolhida
de referência e a copy que o usuário escreveu", sem "várias proibições e
negativas". Medido nos nove clientes, duas rodadas, mesma foto e mesma copy:

| estratégia | imagens | prompt | resultado |
|---|---|---|---|
| A | foto + referência | "ajuste a copy desta arte com esta foto e esta copy" (1 linha) | mistura o texto da referência |
| **B** | **foto + referência** | **5 linhas: foto intocada, herda tipografia/cor/ornamento/logo/layout, trava dupla, copy por último** | **melhor em 8 de 9** |
| C | foto + referência + card/prancha | B + as imagens do sistema | cada imagem a mais afastou da referência |
| D | foto + manual (antigo) | prompt do manual | o manual antigo não segurava (caixa da logo copiada, elementos ilegíveis) |
| E | foto + manual NOVO | prompt do manual (§ 3) | **9 de 9** com copy certa, foto intocada e logo do manual |

Lição de arquitetura que vale para toda a trilha `arte`: **a peça sai melhor com
MENOS imagens e MENOS regra**. Prancha, âncoras, referência de clima e o arquivo
da logo — cada um deles puxou a peça para longe do que a referência ou o manual
pedia. E as duas travas que sobraram não são "proibições": são a declaração de
que o texto e a cena da referência pertencem a um post antigo.

---

## 2. O manual de marca virou um design system (16:9, 3000x1688)

`src/lib/ai/manual-de-marca.ts` (reescrito) + `scripts/gerar-manual-de-marca.ts`.
Aplicado em produção nos 11 projetos em 08/09 às 04:52 UTC
(`Project.brandManualUrl`); as URLs anteriores estão em
`.tmp-medicao-estilo-chatgpt/manuais/ANTERIORES.txt` para voltar se preciso.

O que mudou, e por quê (cada item veio de uma reprovação do Ciro ou de um
defeito medido no teste D):

- **16:9 em vez de 9:16** — "por que está montando nesse formato vertical, tem
  alguma razão técnica?" Não tinha: a referência é uma imagem qualquer, o único
  limite é o lado maior ≤ 3000px (`MAX_REF_DIM`). Em 16:9 cabem mais pixels e um
  grid de painéis.
- **A logo mora num PAINEL cinza médio inteiro**, não numa caixa escura
  arredondada: em 4 de 8 peças do teste D o modelo copiou a caixa junto com a
  marca. Painel de página não é "contêiner" para copiar; e cinza médio é o único
  fundo em que as logos brancas (Quintal, TERO, Bacana) e as pretas (Vix, By
  Rock) leem ao mesmo tempo (regra da casa desde 10/08). Variações de logo em
  faixa abaixo da principal (até 7).
- **Cada elemento tem o próprio ladrilho, claro ou escuro pelo que ELE precisa**
  (`fundoDoLadrilho`): os ícones vermelhos do By Rock sobre a faixa vermelha da
  marca não liam; os do Empório também não.
- **A prosa de "como usar a marca" SAIU** (decisão do Ciro): texto longo numa
  imagem é lido mal; ele vai no PROMPT.
- **Os alfabetos oficiais entraram**, desenhados na largura do painel numa grade
  2×N (`familiasDaPrancha`, exportada de `type-specimen.ts`) — embutir a prancha
  vertical reduzida deixava a letra pequena demais. Sem peso forçado: `700`
  sintetizava um negrito falso na Amithen do Quintal ("parece que foi aplicado
  um negrito").
- **Duas vozes na manchete** via `fonts.subtitle` (Quintal: Amithen + Domani),
  pedido do Ciro.
- **Filtros de elemento**: sombra/mockup/teste/hz-gastrô/páscoa/natal fora;
  categoria `legado` fora; foto ou print detectado por variedade de cor
  (`pareceFotoOuPrint`: cobertura > 0,97 ou > 14 cores quantizadas) fora;
  logos de parceiro (`LOGO_DE_PARCEIRO`: lagunitas, heineken, tripadvisor…) fora
  do painel de logo. Buckets: ícones (8) + selos (6) + gráficos (8).
- Dados que mudaram em produção junto: elementos 309–312 do By Rock → categoria
  `legado` ("só os elementos do By Rock que estão errados, use os que eu te
  mandei, e não os que você puxou do estúdio"); elementos #425
  `selo-rock-steaks-25-almoco` e #426 `selo-happy-hour-50` cadastrados (projeto
  7, categoria selos); `Project.specimenFontFamilies` do Bacana ganhou
  `guttery`; ícones/variações do Seu Quinto, variações + guarda-chuvas +
  TripAdvisor do Quintal, wordmark + selo-promo da Real vieram do Drive.

Regenerar (dry-run grava em `.tmp-medicao-estilo-chatgpt/manuais/<id>-manual.png`):

```bash
npx dotenv-cli -e .env -- npx tsx scripts/gerar-manual-de-marca.ts --projeto 11
npx dotenv-cli -e .env -- npx tsx scripts/gerar-manual-de-marca.ts --todos --aplicar
```

Ficou de fora, anotado: as pranchas da Vix mostram Lato Black/BlackItalic (o DNA
não usa); o Empório mostra duas Friz Quadrata; o selo de páscoa foi excluído
como sazonal — se o Ciro quiser de volta, é o filtro de `escolherElementos`.

---

## 3. O prompt do manual (`src/lib/ai/prompt-do-manual.ts`)

Molde do prompt de 12 seções que o Ciro escreveu para o happy hour da Vix,
tornado GENÉRICO para qualquer foto (ele mandou um tartare visto de cima e uma
cliente de taça na mão como exemplos) e por CLIENTE: cor, filete, caixa,
posição da logo, alinhamento e direção estética vêm do banco
(`BrandContext` + `BrandDNA.estiloDasReferencias`), nunca de texto fixo.

Estrutura: intro (3 insumos) → DIREÇÃO ESTÉTICA (resumo do estilo + 2 "evite")
→ 1 FUNDO → 2 LOGOTIPO → 3 BLOCO PRINCIPAL (prefere o topo; se ali tem rosto ou
o assunto, desce ao terço inferior) → 4 TÍTULO (UMA palavra-chave na cor de
destaque; duas vozes se a marca tem `fonts.subtitle`) → 5 SUBTÍTULO/APOIO →
6 FILETE → 7 ÁREA CENTRAL livre → 8 RODAPÉ (só se a copy tem serviço, por
`blocosDeServico`; 89–94% da altura no story) → 9 PALETA → 10 HIERARQUIA →
11 NÃO FAÇA (7 itens) → OBSERVAÇÃO de quem pediu (opcional) → TEXTOS EXATOS
por último. Em português, porque quem lê e edita é gente.

Cinco defeitos lidos nos primeiros textos e consertados ANTES da segunda rodada
(cada um tem teste em `__tests__/prompt-do-manual.test.ts`):

1. **A caixa vem do mapa da casa** (`CAIXA_DA_MANCHETE`), não da leitura das
   peças — a Vix saiu "alta" na leitura porque uma referência estava em caps.
2. **A cor de destaque é encaixada na paleta**: o dourado lido (#D6B15A) virou
   "Amarelo da logo (#FCE77B)" — a leitura vê a cor sob a luz da foto, e
   "destaque (#D61E1E)" sem nome era uma quinta cor inventada.
3. **A direção estética perde as orações sobre tratamento da foto**
   (`semTratamentoDaFoto`: tarja, véu, degradê, escurecimento, vinheta, "fundo
   fotográfico") — elas contradiziam a regra do FUNDO.
4. **"Evite" sem pontuação dobrada** (ponto final dos itens removido).
5. **Numeração contígua** (havia salto 7 → 9 quando não há rodapé).

Mais duas variações que o runner manda: `logo: { modo: 'compor', canto }` (a
seção da logo vira reserva do canto, a marca sai da hierarquia) e
`instrucaoImagem` (vira "a ÚNICA alteração permitida na fotografia").

Gerar os textos e testar direto na API (não toca no banco nem em crédito):

```bash
npx dotenv-cli -e .env -- npx tsx scripts/prompts-do-manual.ts            # só escreve prompts/<rot>.txt
npx dotenv-cli -e .env -- npx tsx scripts/prompts-do-manual.ts --gerar    # + gpt-image low, E-<rot>.png
npx dotenv-cli -e .env -- npx tsx scripts/prompts-do-manual.ts --gerar --so=tero,by-rock
```

Saída em `.tmp-medicao-estilo-chatgpt/prompts/`: `<rot>.txt`, `foto-<rot>.jpg`,
`E-<rot>.png`, `geracao.log`, a folha de contato `E-v2-folha.jpg` e a primeira
rodada em `v1/`. Os casos (`CASOS` no script) usam a copy e a foto reais de cada
cliente; TERO, Bacana e By Rock pegam a foto do último `arte-ia` com `subject`.

Resultado da v2 (9 de 9, 18–35s cada): copy certa em todos, foto intocada,
logo do manual reproduzida, serviço no rodapé com filetes onde a copy tinha
horário. Observações para a próxima rodada: no By Rock a "palavra-chave" de
"Bora!" virou a letra A em vermelho (título de uma palavra); no Empório o
título pousou sobre a placa da fachada; no Seu Quinto a logo cobriu o topo da
garrafa; no TERO a logo saiu DESENHADA (no teste direto não há `compor` — na
bancada ela será colada).

---

## 4. As duas portas no runner (`creative-generation-runner.ts`)

Decididas logo depois de `loadedRefs`, antes de `ordered`:

| condição | porta | imagens ao modelo | prompt |
|---|---|---|---|
| há `style-guide` (arte escolhida na bancada) | `referencia` | foto (1) + referência (2) | `montarPromptDaReferencia` (§ 4.1) |
| não há, e o projeto tem `brandManualUrl` | `manual` | foto (1) + manual (2) | `montarPromptDoManual` (§ 3) |
| carrossel, peça com cartão, `finalPrompt` do MCP, sem foto, sem manual, `ARTE_PORTAS=off` | — | as de sempre | planejador (F6) → `buildArtePrompt` |

Nas duas portas, colados ao FIM do prompt (onde pesam mais): o bloco da logo
(`montarBlocoLogo`, só quando há canto a reservar) e `regraDeSafeArea` em pixel.
A copy passa por `copyComCaixaDaMarca` — a caixa é decidida na STRING, lei de
16-17/08. O preâmbulo por papel NÃO entra (o prompt da porta já descreve as
imagens pelo índice). Telemetria: `fieldValues.porta = 'referencia' | 'manual'`;
`refsUsadas` mostra as 2 imagens; `planejador` fica ausente.

Logo colada por código (`compor`: TERO, Wine Vix, Lagosta): prompt e compositor
leem a MESMA variável (`cantoParaCompor`) — com referência, o canto da
assinatura dela (`cantoDaAssinatura`); na porta do manual, o canto que as peças
aprovadas usam (`cantoDaLogoDoEstilo`); sem nenhum, `LOGO_CORNER`. Divergência
entre os dois foi o defeito de 07/09 (marca no rodapé com o canto superior
reservado).

A referência do RODÍZIO (`style`, sem escolha à mão) fica de fora da porta do
manual e por isso **não é marcada como usada** — marcar queimaria a vez dela.

### 4.1 `src/lib/ai/prompt-da-referencia.ts`

O prompt B verbatim, em inglês (idioma em que o gpt-image foi medido aqui):

```
Image 1 is the photograph for a 1080x1920 Instagram Story of {marca}. Use it as the background, exactly as it is.
Image 2 is an approved {marca} Story — the design model. Give the new piece the same typography, colours, ornaments, logo and layout as Image 2. Only the photograph and the words change: nothing from Image 2's scene or text appears here.
Two hard limits on Image 2: every word, number, price, date or headline lettered in it belongs to that OLD post — never copy, adapt or echo any of it; and nothing from its photo, dish, people or objects appears here.
Render exactly these N copy blocks, each once, and nothing else — the piece letters EXCLUSIVELY these lines:
"…"
```

Variações: `logoColadaDepois` tira "logo" da herança e diz que a peça não leva
marca; `layoutLivre` (`modelo-livre.ts`, vazio hoje) tira "layout" e manda
compor para esta foto; `instrucaoImagem` vira a única exceção ao "exactly as it
is"; `pedido` vira uma linha "Note from the client". Testes em
`__tests__/prompt-da-referencia.test.ts`.

---

## 5. O que foi para produção nesta sessão

- Código: manual 16:9, alfabetos na prancha, `prompt-do-manual`,
  `prompt-da-referencia`, as duas portas no runner, `NOME_DO_SEPARADOR`
  exportado, scripts `gerar-manual-de-marca` e `prompts-do-manual`.
- Dados (já aplicados, sem migration): `brandManualUrl` dos 11 projetos,
  elementos By Rock (#425, #426, 309–312 → legado), `specimenFontFamilies` do
  Bacana.
- Nenhuma mudança de schema.

---

## 6. Como continuar (próxima sessão)

**O que ainda não foi medido: a porta em produção.** Tudo até aqui é teste
direto na API. Roteiro:

1. **Porta da referência** — na bancada, escolher uma arte de referência e
   gerar (Wine Vix, Real, By Rock: os três que reclamaram de "não seguiu a
   referência"). Conferir em `Generation.fieldValues`: `porta: 'referencia'`,
   `refsUsadas` com 2 itens, `prompt` de ~600 chars terminando na copy.
   Nos projetos `compor` (Vix, TERO) olhar se a marca colada pousou no canto
   que a referência usa e se o modelo NÃO desenhou uma segunda.
2. **Porta do manual** — gerar SEM referência nos mesmos clientes. Conferir
   `porta: 'manual'`, o prompt em português, a logo (desenhada nos `modelo`,
   colada nos `compor`) e o serviço no rodapé.
3. **Ajuste na foto** (`instrucaoImagem`) — tier sobe para `high` sozinho;
   conferir que o prompt traz "The ONLY change allowed…" / "A ÚNICA alteração".
4. **Feed e quadrado** — as duas portas foram escritas para os três formatos
   mas só o story foi medido.
5. Ler o feedback (`ver-feedback-das-artes` ou `fieldValues.feedback`) e
   comparar com o placar de 07/09 (`modelo-livre.ts` tem a tabela).

Consulta útil (produção, só leitura):

```sql
select id, "createdAt", "fieldValues"->>'porta' porta, "fieldValues"->>'planejador' planejador,
       jsonb_array_length("fieldValues"->'refsUsadas') imagens, "fieldValues"->'feedback'->>'veredito' feedback
from "Generation" where "projectId" = 11 and "fieldValues"->>'source' = 'arte-ia'
order by "createdAt" desc limit 20;
```

Para voltar atrás sem deploy: `ARTE_PORTAS=off` (volta ao planejador);
`ARTE_PLANNER=off` (volta ao `buildArtePrompt`). Para mexer no texto de uma
porta, o lugar é o módulo puro + o teste dele — nunca o runner.

Riscos e pendências conhecidas:

- **Título de UMA palavra + "UMA palavra-chave em destaque"** faz o modelo
  colorir uma LETRA (By Rock "BorA!"). Candidato: pular a palavra-chave quando
  o título tem uma palavra só.
- **A porta da referência não manda o arquivo da logo nem a prancha**: nos
  projetos `modelo` a marca vem da referência. Se a fidelidade da logo cair,
  `conferirLogo` (QA) avisa — olhar `fieldValues.qa`.
- **`pedido` livre entra numa linha nas duas portas.** A lição de 07/09 é que
  direção cheia de negativas piora a peça — se o campo da bancada voltar a
  carregar prosa longa, o lugar de conter é a UI, não o prompt.
- Dez arquivos `* 2.ts` duplicados seguem rastreados no git (`prisma/generated`,
  `estilo-das-referencias`) — flagrados, não tocados.
- O manual do projeto 9 (Ciro Trigo) foi gerado sem nunca ter tido um; o 8
  (Lagosta) e o 9 não são restaurante — não foram testados.
