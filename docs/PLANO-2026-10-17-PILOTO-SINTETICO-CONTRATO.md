# Piloto SINTÉTICO de autonomia — o checkpoint depois do CP5e (contrato)

**Estado: PROPOSTA, em revisão do Codex (rodada 4). Rodada 3: NÃO APTO — 2 BLOQUEADOR, 1 IMPORTANTE, 1 MENOR, endereçados abaixo
(o modo G força a RELEITURA real da foto — a página é editada depois da composição para a composição não ser reaproveitada — e
confere que `fetchBuffer` falhou, que saiu `motivoSemAssunto` e que o gate recusou; o juiz do piso é declarado PARCIAL — caixas, sem
glifos/rotação/efeitos, com a folga de 1 px do CP5a — e o "falso APTO = 0" do piso vale só nesse recorte; § 2 e § 4 alinhados à
matriz; a conta das specs refeita). Rodada 2: NÃO APTO — 3 BLOQUEADOR, 1 IMPORTANTE, 1 MENOR, endereçados abaixo
(o piloto CONTROLADO não autoriza a passagem para o MCP-M0 — § 6 exige a alternativa de 5.1 ou a alteração explícita do § 4.8 pelo
owner; a matriz 2.1 rebaixa para "mesma medida — não é juiz" o que reaproveita `pisoDeInterface`/`checkTextGeometry` e ganha
`logo-sobre-texto`; o caso D (falha de leitura) vira falha INJETADA depois da composição, no caminho de leitura do revisor;
`human-output/` entra no `.gitignore`; a conta do lote bate com a lista de fotos). Rodada 1: NÃO APTO — 5 BLOQUEADOR, 3 IMPORTANTE, 1 MENOR, endereçados abaixo
(lote CONTROLADO, não "representativo" — a representatividade do § 4.8 depende da decisão 5.1; matriz regra → juiz com estado
"não coberto" e "falso APTO = 0" só nas regras cobertas; decisão 1 por leitura PAREADA estimado × catálogo sintético × verdade;
decisão 2 só sobre camadas realmente produzidas + cenários injetados à parte; o PNG final é renderizado pelo piloto e contado;
repetibilidade sobre camadas/crop/assets/PNG normalizados; duração como hipótese a calibrar; exportador de leitura com conferência
do compute; pseudonimização; resumo versionado em `docs/` e relatório integral fora do repositório; denominadores por etapa e copies
por arquétipo). Nada aqui está implementado; este PR é documental.** Base: `main` `61ca3e15`
(CP5a–CP5e mergeados). Plano-mestre: `docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md` § 4.8 ("ainda NÃO cliente real;
lote sintético representativo medindo taxa APTO, motivos de revisão humana por regra, falsos bloqueios, custo, estabilidade,
repetibilidade; o resultado alimenta as decisões 1 e 2 da § 10; só depois discutir piloto real, § 9") e § 9 (critério para
voltar a piloto real: itens 4 e 5 são este checkpoint). Herda os harnesses do CP5e: `suporte/banco-com-travas.ts` (banco falso
com travas), `piloto-ponta-a-ponta.test.ts` (compositor, revisor, CP4, gate dos produtores e `agendar.ts` REAIS sobre o banco
falso, medição REAL) e os oráculos do CP0 (`suporte/propriedades.ts`).

## 0. O que o piloto É e o que NÃO é

**É**: um LOTE sintético **CONTROLADO** (não "representativo das fotos dos clientes" — ver 1.2 e a decisão 5.1), determinístico e
reprodutível, de peças que atravessam o fluxo autônomo REAL (compor → revisar →
ajustar → revisar → agendar DRAFT, no perfil draft-only, sobre o banco falso), MEDIDO por: (a) taxa APTO por cliente, por formato
e com/sem arquétipo; (b) motivos de revisão humana por regra e por código; (c) **falso APTO** (o gate aprova e um oráculo do CP0
acusa violação) — tem de ser ZERO **nas regras que os oráculos cobrem** (a matriz regra → juiz está na § 2.1; o que não é
coberto é dito "não coberto", nunca "zero"); (d) **candidatos a falso bloqueio** (o gate recusa e nenhum oráculo acusa)
— listados com o PNG para inspeção humana, nunca decididos pelo piloto; (e) custo: renders por peça por etapa (compor, revisar,
gate, ajustar, agendar) e tempo; (f) estabilidade: exceções, `nao-medida`, `sem-vinculo`, timeouts; (g) repetibilidade: a mesma
entrada duas vezes → o mesmo veredito, os mesmos motivos e a mesma impressão do gate; (h) para a decisão 1 da § 10: a leitura PAREADA
`assunto estimado × caixa de catálogo × verdade` nas fotos sintéticas (que têm o assunto POR CONSTRUÇÃO — § 3.8); para a decisão 2:
quantas peças do lote têm camada não-texto REALMENTE produzida acima de texto, à parte dos cenários de oclusão injetados (§ 3.9). Sai um RELATÓRIO (JSON + markdown + PNGs das recusas) em
`human-output/relatorios/piloto-sintetico/<data>/` para o owner julgar "satisfatório".

**NÃO é**: cliente real, DRAFT real, agenda, publicação, mensagem, webhook ou banco de produção — nada disso é tocado (o
piloto roda sobre o banco falso; as fixtures saem de exports LOCAIS feitos em leitura, como a de 13/10); mudança na DECISÃO do
gate, no compositor ou no revisor (o que o piloto achar vira PR próprio, com contrato); decisão de limiares ("satisfatório",
X % da decisão 1) — o piloto MEDE, o owner decide (seção 5); MCP-M (só depois de um piloto satisfatório); ampliação da allowlist.

## 1. O lote

### 1.1 Clientes e assinaturas (reais, anonimizadas)

Fixtures por cliente em `src/lib/direcao-de-arte/__tests__/fixtures/piloto-sintetico/<cliente-NN>/`, geradas UMA vez em DOIS passos, como a de
13/10: (1) `scripts/fixtures/exportar-piloto-sintetico.ts --cliente <id>… <pasta-dos-exports>` — o EXPORTADOR de leitura: conecta
SÓ ao endpoint do branch de desenvolvimento do Neon (lê `.env.development.local`; confere por `computeDe` que o compute NÃO é o da
produção e aborta se for ou se o arquivo não existir — nunca cai no `.env`), abre a sessão com `default_transaction_read_only=on`,
e escreve JSON local (páginas do template "Assinatura", `Project.assinatura`, gradientes da marca, logos baixadas); (2)
`scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts <pasta-dos-exports> <pasta-das-fixtures>` — o GERADOR, que não fala com
banco, Blob nem Drive (como `gerar-fixture-piloto-direcao-de-arte.ts`). Por cliente: as páginas do
template "Assinatura" (todas as variantes, story e feed), `Project.assinatura` (números), as candidatas do véu e as logos (pixel a
pixel, como `marca.json`), as fontes DECLARADAS (família e pesos — as fontes não entram; o harness as declara presentes, como os
pilotos). **Pseudonimização** (dito assim: as logos e as assinaturas
identificam a marca; o que sai é o NOME e as URLs): nome do cliente → `cliente-NN` (a tabela nome ↔ NN fica FORA do repositório,
em `human-output/`); nenhuma URL real (tokens `fixture:*`); nenhuma foto de cliente (ver 1.2); textos de exemplo das assinaturas
trocados por copy sintética (1.3). **Quantos**: os clientes ativos com assinatura de story (hoje
≈ 8–10, decisão 5.2); o gerador lista e o owner confirma a lista antes de gerar.

### 1.2 Fotos (sintéticas, com assunto por construção)

**O que este lote NÃO é**: o § 4.8 fala em "fotos reais já no Blob de teste"; o Blob de teste não existe e nenhuma foto de cliente
entra sem a decisão 5.1 do owner. Com fotos SINTÉTICAS o lote é CONTROLADO: mede o fluxo, o gate, a régua e o assunto em casos
construídos, e NÃO mede a distribuição de textura, recorte e contraste das fotos dos clientes — o relatório diz isso ao lado do
veredito, e a representatividade do § 4.8 só se reivindica depois da alternativa de 5.1 (fotos reais anonimizadas por peça, com
janelas, como a de 13/10). As fotos são GERADAS localmente por `suporte/fotos-sinteticas.ts` (sharp, determinístico por semente),
em 1080×1920 e 1080×1350, cobrindo os CINCO casos da § 4.2 do plano-mestre e os piores casos da régua: (A1) assunto forte
localizado (região de alto contraste/textura com caixa CONHECIDA — a verdade do `texto-sobre-assunto`); (A2) assunto de BAIXO
contraste (a estimativa tende a errar: é o caso que a decisão 1 precisa); (B) textura difusa sem região forte (`naoSeAplica`
esperado); (C) fundo liso claro; (D) fundo liso escuro; (E) gradiente vertical claro → escuro; (F) ruído em toda a área (o pior
caso da régua); (G) a FALHA de leitura (caso D do § 4.2) — NÃO é uma foto: é um MODO aplicado a uma peça composta com a foto
A1 VÁLIDA (bytes inválidos abortariam a composição em `carregarFoto` → `sharp.metadata()`). Como o revisor devolve o assunto do
CACHE da composição antes de chamar `fetchBuffer` quando a composição é reaproveitável, o modo G primeiro EDITA a página
composta (um texto movido 1 px: a `versaoRenderizada` deixa de ser a da página e o cache cai — a regra do CP5c) e só então faz
`fetchBuffer` da foto FALHAR durante a leitura do revisor e do gate dos produtores (precedente: `fotoIlegivel` do harness do
CP0); o piloto CONFERE que a chamada falhou (contador do harness), que saiu `motivoSemAssunto` sem a marca, que o gate do revisor
e o do `agendar-leva` recusaram por `texto-sobre-assunto` NÃO COMPROVADA e que nenhum DRAFT nasceu — uma leitura em que o cache
foi usado é contada como "modo G inválido", nunca como caso D; (H) peça SEM foto (caso E do § 4.2). Cada foto leva `assuntoVerdade: Rect | null`. Mais UMA foto real: a da fixture de 13/10 (anonimizada, com a região
protegida anotada) — o único caso real do lote, dito; toda medida de texto/logo sobre ela passa por `exigirMedidaFiel`, inclusive
DEPOIS de cada ajuste (medida fora das janelas é "não medida", nunca contada).

### 1.3 Specs

Por cliente × formato (story, feed quando houver assinatura de feed) × entrada do eixo "foto" (7 sintéticas A1–F + a real de
13/10 quando story + "sem foto" H; o modo G à parte) × copy (3
copies sintéticas: curta — headline + apoio + serviço, o mínimo que TODO arquétipo do catálogo aceita (`apoio` é obrigatório em
dois deles); média — pré-título, headline, apoio, serviço; longa — headline de 2 linhas, apoio de 3, serviço de 2) × arquétipo
(sem; `minimal-fb-topo-esquerda`; `minimal-fb-centro-optico`; `minimal-fb-base-esquerda` entra SÓ se `disponibilidadeNoT1a` o der
disponível — hoje aguarda o T1b e é registrado como EXCLUSÃO, não como peça — só nos formatos que o arquétipo aceita e só com foto
com caixa de assunto quando o arquétipo a exige, como o T1a/CP2B mandam).
Teto do lote: ~10 clientes × 2 formatos × 9 entradas do eixo "foto" (7 sintéticas A1, A2, B, C, D, E, F + a real de 13/10 +
"sem foto" H) × 3 copies × 3 arquétipos ≈ 1.620 specs ELEGÍVEIS, mais o modo G (falha injetada) aplicado a cada peça composta com
A1 (≈ +180 leituras, contadas à parte como "leituras com falha injetada", não como peças). O lote PADRÃO é uma amostra
determinística de 1 em 6 (≈ 270 peças) **com cobertura mínima de cada eixo** (todo cliente, formato, entrada de foto, copy e
arquétipo aparece ≥ 3 vezes), e `--completo` roda tudo. **Denominadores por etapa**, sempre: specs elegíveis → recusas ESTRUTURAIS esperadas
do compositor (T1a/CP2B/CP3, `FOTO_INDISPONIVEL`, `ASSINATURA_INCOMPLETA`) → peças compostas → peças que chegaram ao gate →
APTAS → DRAFTs. **A duração é HIPÓTESE, não promessa**: a conta do CP5e é 3–4 renders por composição, +2 por `revisar-arte`,
+2 por `ajustar-arte` e mais o PNG final do piloto — ~10–14 renders por peça, ×2 pela repetição; a implementação começa por uma
RODADA DE CALIBRAÇÃO de 20 peças, reporta renders e ms (mediana e p95) e só então fixa o tamanho da rodada padrão (decisão 5.5
pode mudar com o número medido). O teste do piloto tem timeout próprio (horas, por caso), não o padrão de 20 s do vitest. As specs
são DITAS (função pura `specsDoLote(fixtures, amostra)`, `loteId` determinístico), nunca sorteadas em runtime.

## 2. O fluxo por peça (o REAL, sobre o banco falso)

Para cada spec, no banco falso recém-semeado com o cliente da peça (`criarBancoComTravas()` + fixtures): 1. `comporPeca(spec)`
REAL (persistência falsa: Page + Generation no banco, como no CP5e) — conta renders e ms; recusa do compositor (T1a/CP2B/CP3,
`FOTO_INDISPONIVEL`, `ASSINATURA_INCOMPLETA`…) é um DESFECHO registrado, não falha do piloto; 2. `revisarArte` REAL (sem visão: a
visão é gpt-5.2 e o piloto é hermético) — guarda `gate` (informação), achados, ajustes propostos; 3. se o gate recusar e houver
`ajustes`, até 2 ciclos de `ajustarArte` draft-only com os ajustes do revisor (o CP4 e o gate dos produtores decidem), revisando
depois de cada; 4. `agendarItensDoLote` draft-only (item do lote apontando a Generation): `criado` ou recusa (REVISAO_HUMANA_
NECESSARIA com motivos); 5. os JUÍZES da matriz da § 2.1 sobre a versão FINAL da página (independência PARCIAL, dita: o mesmo `CanvasRenderer`; os
limites da régua importados; o piso por geometria pura reimplementada; o que só repete a medida do revisor — `checkTextGeometry`,
`foraDaInterface` — NÃO é juiz e fica em inspeção); 6. repetição: a MESMA spec roda uma segunda vez num banco novo;
têm de ser iguais o veredito, os motivos (regra:código:camadas), `serializarParaImpressao(gate)`, as CAMADAS finais (ids, posições,
tamanhos, estilos, crop — normalizadas: ids voláteis, `createdAt`, URLs falsas e `medidoEm` fora da comparação) e o HASH do PNG
final; 7. o PNG da versão FINAL é renderizado PELO PILOTO com `CanvasRenderer` (o harness do CP5e não produz PNG: `persistAndRender
Creative`/`renderPageAndRegister` são falsos e gravam uma URL) e esse render é CONTADO à parte ("render do piloto", não do fluxo);
guardado para toda peça recusada, todo candidato a falso APTO/bloqueio e 1 em 10 das aptas (controle visual).

### 2.1 Matriz regra → juiz (o que "falso APTO = 0" significa)

Um "juiz" é uma SEGUNDA OPINIÃO sobre a peça renderizada ou sobre as camadas finais, com implementação própria; o que só
REPETE a função que o gate/revisor já usa não é juiz (pode repetir o mesmo erro) e fica "mesma medida — não é juiz".
"Falso APTO = 0" só se afirma nas linhas "coberta"/"coberta (parcial)".

| Regra/conferência do gate | Juiz do piloto | Estado |
|---|---|---|
| `texto-sem-leitura`, `tratamento-piorou-leitura` | `leiturasDosTextos` + `leituraDentroDoAlvo` + `tratamentosQuePioram` (CP0) sobre o PNG final — leitura de pixels própria, com os limites da régua importados | coberta (parcial: mesmos limites) |
| `logo-sem-leitura` | `leituraDaLogo` + `resumoDaLogo` (CP0) sobre o PNG final | coberta (parcial) |
| `texto-sobre-assunto` | `textosQueInvadem` com a `assuntoVerdade` (fotos sintéticas) / região protegida anotada (fixture) — a verdade é POR CONSTRUÇÃO, não a estimativa | coberta — e é o juiz da decisão 1 |
| `piso-de-interface` | geometria PURA reimplementada em `suporte/oraculos-do-piloto.ts`: caixas de texto e logo (`position`/`size`) × 188/224 no canvas canônico, COM a folga de 1 px do CP5a (caixa que toca 188/224 reprova); NÃO chama `pisoDeInterface`/`foraDaInterface` | coberta (PARCIAL — dito: caixas, não glifos medidos; sem rotação nem efeitos — uma peça com texto rotacionado ou com sombra/halo que avance no piso pode passar no juiz e reprovar no gate; o "falso APTO = 0" do piso vale só para caixas sem rotação/efeitos, e as peças com rotação/efeitos vão à inspeção) |
| `fora-da-area-segura` | geometria pura das caixas × margens do projeto (`oraculos-do-piloto.ts`) | coberta |
| `logo-sobre-texto` | interseção pura das caixas da logo e dos textos (`oraculos-do-piloto.ts`) | coberta (parcial: caixas, não tinta) |
| `colisao`, `texto-cortado`, `tinta-fora-da-caixa` | o único medidor é `checkTextGeometry` (o mesmo do revisor) — repetir não é juiz | **mesma medida — não é juiz**; INSPEÇÃO humana nos PNGs amostrados |
| `texto-pequeno`, `copy-completa`, `identidade` | sem juiz externo | **não coberta** — INSPEÇÃO humana nos PNGs amostrados |
| `oclusao` | cenários INJETADOS (§ 3.9) com verdade por construção | coberta só nos cenários injetados |
| `fonte-nao-carregada` | fora do lote (fontes declaradas presentes; render com fonte de reserva) | **não coberta — dito ao lado do veredito** |
| visão (gpt-5.2) | não roda | **não coberta — dito ao lado do veredito** |

Limites ditos (os do CP5e, § 3.1): o banco falso não prova travas/SQL reais nem Blob; a visão não roda; as fontes da marca não
estão instaladas (as famílias são declaradas presentes — `fonte-nao-carregada` real fica fora do lote, dito no relatório); o custo
medido é o do ambiente local (renders e ms), não o da Vercel.

## 3. As medidas e o relatório

Dois produtos: (i) VERSIONADO, `docs/piloto-sintetico/<AAAA-MM-DD>-resumo.md` — HEAD, `loteId`, ambiente (máquina, versões),
denominadores por etapa, as tabelas 1–10 abaixo e os hashes (SHA-256) do `relatorio.json` e de cada PNG citado — é o que o PR
commita e o Codex lê; (ii) FORA do versionamento: `human-output/` é saída local (como o plano-mestre a usa) e hoje está só NÃO rastreada — o PR de
implementação a põe no `.gitignore` (regra do repositório, não só deste piloto), para que relatório integral e PNGs nunca entrem
num commit; `human-output/relatorios/piloto-sintetico/<AAAA-MM-DD>/relatorio.json` (toda peça: spec, cliente, desfechos por etapa, gate, motivos, oráculos, renders, ms,
repetibilidade, caminho do PNG) e os PNGs — com os hashes conferíveis pelo resumo. O resumo traz:

1. **Taxa APTO** (gate informativo da v1 composta; APTO final depois dos ciclos; DRAFT criado) por cliente, formato, foto, copy e
   arquétipo — tabelas, sem média geral escondendo cliente ruim.
2. **Motivos de revisão humana** por regra × código (ACHADO_CRITICO / NAO_COMPROVADA / NAO_MEDIDO / IDENTIDADE_ILEGIVEL) e por
   cliente — o que mais bloqueia, e se é medido ou "não comprovado".
3. **Falso APTO** (gate APTO ∧ algum oráculo acusa): a lista COMPLETA com PNG — tem de estar VAZIA; se não estiver, o piloto é
   insatisfatório por definição e o item vira BLOQUEADOR do próximo PR (gate ou oráculo, a ver).
4. **Candidatos a falso bloqueio** (gate recusa ∧ nenhum oráculo acusa): lista com PNG e motivos, para inspeção humana; o piloto
   NÃO os classifica — e diz quantos são `NAO_COMPROVADA` (o gate não mediu) × `ACHADO_CRITICO` (o gate mediu e o oráculo discorda).
5. **Custo**: renders por peça por etapa (mediana e p95), ms por etapa; o teto do plano-mestre (3–4 por composição, 2 por ajuste)
   conferido.
6. **Estabilidade**: exceções, `nao-medida`, `sem-vinculo`, timeouts da medição (8 s), por etapa.
7. **Repetibilidade**: % de peças com veredito + motivos + impressão iguais nas duas rodadas (esperado 100 %; cada divergência
   listada com o diff).
8. **Decisão 1 (§ 10 — estimado × CATÁLOGO, e a taxa de bloqueio por caso)**: leitura PAREADA dos MESMOS bytes e do MESMO
   corte de cada foto (A1/A2): uma vez SEM anotação de catálogo (sai a ESTIMATIVA — `assuntoOrigem: 'estimado'`) e outra COM a
   `assuntoVerdade` entregue como caixa de catálogo (`assuntoOrigem: 'catalogo'` — no compositor a caixa presente SUBSTITUI a
   estimativa, por isso são duas leituras), e a verdade construída como terceiro referencial: IoU estimado × catálogo, estimado ×
   verdade e catálogo × verdade por foto; a taxa de peças em que o estimado acertou/errou a invasão que o oráculo mede com a verdade;
   e, por caso do § 4.2 (A catálogo, B estimado, C `naoSeAplica`, D falha de leitura — pelo modo G, injetada DEPOIS da composição no
   caminho de leitura do revisor/gate, E sem foto), a taxa de bloqueio da política RECOMENDADA e quantas peças ela bloqueou que a
   verdade aprovaria. Dito: a estimativa sobre fotos sintéticas pode ser mais fácil
   ou mais difícil do que sobre fotos reais — o número informa, não decide (5.3).
9. **Decisão 2 (§ 10)**: (a) quantas peças do lote têm camada não-texto REALMENTE produzida acima de texto (o T1a de hoje não
   materializa os elementos dos arquétipos; `minimal-fb-base-esquerda` está indisponível até o T1b — registrado como exclusão), e
   em quantas a conferência `oclusao` do gate foi `nao-comprovada`; (b) à parte, cenários de oclusão INJETADOS no harness (um
   retângulo/`shape` sobre um texto, por construção) para medir se o gate os pega; (c) o que o lote NÃO mede: a prevalência em
   peças REAIS da carteira — fica para uma consulta de leitura à parte (fora deste contrato).
10. **O que o piloto NÃO mediu** (os limites da § 2 e da matriz 2.1: fontes reais, visão, fotos reais, travas/SQL, Blob) — ao
    lado do veredito, em toda rodada.

## 4. Arquivos

`scripts/fixtures/exportar-piloto-sintetico.ts` (exportador de LEITURA do branch de dev, com conferência do compute) e
`scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts` (gerador, sem banco; os dois rodam uma vez, fora da suíte); `src/lib/direcao-de-arte/__tests__/
fixtures/piloto-sintetico/<cliente-NN>/{assinaturas.json, marca.json, LEIAME.md}`; `suporte/fotos-sinteticas.ts` (puro + sharp),
`suporte/lote-do-piloto.ts` (`specsDoLote`, puro), `suporte/oraculos-do-piloto.ts` (envolve as leituras de `propriedades.ts` + geometria pura do piso, da área segura e da logo sobre
texto — SEM `checkTextGeometry` nem `foraDaInterface`, pela matriz 2.1),
`suporte/png-do-piloto.ts` (o render final pelo `CanvasRenderer`, contado à parte), `suporte/relatorio-
do-piloto.ts` (puro: agrega e escreve); `src/lib/direcao-de-arte/__tests__/piloto-sintetico.test.ts` — **roda só com
`PILOTO_SINTETICO=1`** (`describe.skipIf`), fora da suíte normal e do CI (um job manual `workflow_dispatch` opcional, decisão 5.4);
`scripts/piloto-sintetico.ts` (atalho: roda o vitest com a variável, `--completo`, `--cliente NN`, `--so <trecho>`); `.gitignore` (+`human-output/`); docs:
`docs/regras/revisor-da-arte.md § Piloto sintético`, `docs/regras/aprendizado.md` (o que o piloto NÃO grava: nenhum sinal).
Testes do próprio piloto (na suíte normal): `fotos-sinteticas.test.ts` (determinismo, `assuntoVerdade` dentro da foto),
`lote-do-piloto.test.ts` (amostra determinística, cobertura dos eixos), `relatorio-do-piloto.test.ts` (agregações sobre um lote
falso de 20 peças, inclusive um falso APTO, uma regra "não coberta" e uma divergência de repetibilidade por camada e por PNG),
`oraculos-do-piloto.test.ts` (cada linha da matriz 2.1 com um caso positivo e um negativo).

## 5. Decisões pendentes do OWNER (o piloto usa a recomendação como PROPOSTA nomeada)

| # | Decisão | Proposta | Alternativa |
|---|---|---|---|
| 5.1 | Fotos do lote — **decide a representatividade do § 4.8** | SINTÉTICAS com assunto por construção (+ a real de 13/10): lote CONTROLADO, sem reivindicar o § 4.8 — nenhuma foto de cliente, nenhum Blob de teste | fotos reais anonimizadas POR PEÇA (compor localmente, recortar janelas — o método de 13/10, ~1 h por cliente) num Blob de teste ou em fixtures; só então o lote é "representativo" |
| 5.2 | Clientes do lote | todos os ativos com assinatura de story (o gerador lista; o owner confirma) | só os 3 do piloto do Dot |
| 5.3 | O que é "satisfatório" (para o lote CONTROLADO — não substitui o § 4.8, ver § 6) | o owner decide lendo o resumo; o contrato só FIXA: falso APTO = 0 nas regras cobertas e repetibilidade = 100 % são obrigatórios | limiares numéricos de taxa APTO por cliente neste contrato |
| 5.4 | Onde roda | local, sob demanda (`npm run piloto:sintetico`), relatório em human-output; CI não roda | job manual no GitHub Actions com o relatório como artefato |
| 5.5 | Tamanho da rodada padrão | amostra determinística 1/6 com cobertura mínima por eixo; o tamanho FINAL sai da rodada de calibração (renders e ms medidos) | lote completo sempre |

## 6. Gates do PR de implementação

Testes do piloto na suíte normal verdes; a rodada de CALIBRAÇÃO (20 peças), UMA rodada padrão e UMA `--completo` executadas
localmente, com o RESUMO versionado em `docs/piloto-sintetico/` (HEAD, `loteId`, denominadores, hashes) e o relatório integral +
PNGs em `human-output/` (fora do repositório, hashes conferíveis); falso APTO = 0 nas regras COBERTAS da rodada completa, com as
"não cobertas" ditas ao lado (ou o PR traz o achado como BLOQUEADOR nomeado para o próximo contrato, não como "satisfatório");
repetibilidade 100 % (veredito, motivos, impressão, camadas normalizadas e hash do PNG); suíte completa sozinha; typecheck; lint; `git diff --check
<base>`; 3 validadores; Codex APTO no HEAD final; CI e Vercel verdes; merge por merge commit com `--match-head-commit`. Depois:
o owner lê o resumo e decide "satisfatório" (5.3) **para o lote CONTROLADO** — isso NÃO cumpre o § 4.8 do plano-mestre nem o item 4
do § 9: a passagem para o MCP-M0 exige, além disso, (a) a alternativa da decisão 5.1 executada (fotos reais anonimizadas por peça,
num Blob de teste ou em fixtures, com o mesmo relatório e a mesma matriz) OU (b) o owner alterar EXPLICITAMENTE o § 4.8 do
plano-mestre (decisão registrada no plano, não neste contrato). Enquanto nenhuma das duas acontecer, o MCP-M0 não começa — e este
contrato não o autoriza.
