# Adendo ao piloto sintético — próximo diagnóstico (17/10/2026)

> Codex: rodada 1 NÃO APTO (variante da fixture fora da área segura em x e fora das janelas fiéis; rastro `anotacao` não provava a
> origem usada pelo revisor; proposta representativa sem ferramenta de seleção das fotos e sem conferência de cobertura das
> janelas; A3 descrita escura mas gerada média; par sem conferência de corte) → corrigido abaixo. Rodada 2 NÃO APTO (A3 na borda
> esquerda compunha mas caía em `texto-sem-leitura`; origem das fotos confundia bytes desenhados com originais; `--listar` não
> discrimina formato e o branch de dev envelhece; a janela fiel não valida o estimador sobre a foto inteira) → corrigido abaixo:
> A3 passou à borda SUPERIOR e a rodada exploratória `--so '|A3|'` mostra `centro-optico` APTO (4/4 compostas, 4 APTAS). Rodada 3
> NÃO APTO só no § 4 (a seleção por `imageUrl` da Generation não prova que o post publicou AQUELA foto; "original em `uploads/`"
> não vale para upload recortado em `posts/` nem para foto do chat reduzida em `chat-uploads/`) → § 4 reescrito: vínculo
> verificável post → prova de render → versão da página → bg-foto (URL + corte), exclusões contadas; origem classificada e
> "original" só com preservação comprovada. Rodada 4 NÃO APTO (§ 4: a prova de render é `PostRenderProof` por post + `mediaUrl`
> com `layersSnapshot`, não `versaoRenderizada`; `posts/` é ambíguo; § 5: o par contava recusas e deixava o estimado nulo nas peças
> com arquétipo) → § 4 e § 1 reescritos; o par só com duas leituras efetivas; estimado do harness no mesmo recorte, rotulado.
> Rodada 5 NÃO APTO (a descrição do `--fotos` ainda resolvia Generations; o IoU escondia que o estimado localizou caixa em 8 dos 16
> pares; `mesmoCorte: null` entrava na decisão 1) → `--fotos` com a MESMA consulta da seleção; denominadores próprios no § 8
> (localizou/não localizou; IoU com estimado só sobre os que localizaram); par só com corte CONHECIDO e igual. Rodada 6 **APTO
> para implementar** (1 ajuste de redação na linha do par, feito).

Pedido do owner (verbatim, 17/10/2026, depois de conferir o fechamento do caso C):

> Retome a preparação do próximo diagnóstico, mantendo MCP-M0 bloqueado: 1. Prepare casos sintéticos integralmente fiéis, com
> assunto conhecido, comparando catálogo presente e ausente sobre os mesmos pixels e recorte. Verifique a preservação da anotação
> até revisão e agendamento. 2. Acrescente casos válidos que efetivamente componham pelos arquétipos. Preserve os casos de recusa
> existentes. 3. Proponha uma variante exclusivamente de teste da assinatura que respeite piso e folga, mantendo a fixture
> histórica como regressão. Não altere assinatura real nem crie exceção ao piso. 4. Prepare uma proposta objetiva para a etapa
> representativa: clientes candidatos, quantidade de fotos, origem dos arquivos, regiões necessárias, anonimização e destino dos
> dados. Não execute exportação ou catalogação real ainda. […] Mudanças de política ou comportamento de produção voltam para
> decisão. […] Não transforme limitações da fixture em defeitos comprovados do estimador, nem trate o cadastro de uma região
> como garantia automática de aptidão.

Base: contrato do piloto (`docs/PLANO-2026-10-17-PILOTO-SINTETICO-CONTRATO.md`), política efetiva com o caso C em `humano`
(`docs/PLANO-2026-10-17-CASO-C-HUMANO-CONTRATO.md`, main `1942e3e4`), e a evidência corrigida do relatório do caso C. Tudo aqui
é LOTE, HARNESS e DOCUMENTO: nenhuma mudança de política, de gate, de compositor ou de produção. O que o diagnóstico encontrar
sobre comportamento de produção volta como decisão, não como código.

## 0. A evidência que faltava (do relatório do caso C, corrigida)

Rodada completa, 126 peças, política `humano` (HEAD 5afe09e4): 50 medidas → 6 APTAS (24 → 6: redução líquida de **18** — as 18
APTAS que o caso C tinha entre suas **30 peças**; as outras 12 já caíam por piso/tinta/leitura). Oclusão injetada **4/4**, não 8/8:
a injeção só roda em peça APTA de foto B ou sem foto; as 4 de foto B deixaram de ser APTAS pela política, sobraram as 4
sem-foto. Os **26 "candidatos a falso bloqueio"** são 8 do caso B (assunto só estimado; a verdade aprovaria — custo da
PROPOSTA `estimado: 'humano'`, não erro de medida) e 18 do caso C (foto difusa sem assunto por construção: NÃO há verdade de
assunto, logo ninguém pode chamar o bloqueio de errado nem de certo — custo da decisão). Zero candidatos com `ACHADO_CRITICO`.
Catálogo não é passe: a peça com região cadastrada entra no caso A, que é MEDIDO (reprova se o texto cobrir a região).

## 1. Casos integralmente fiéis, assunto conhecido, catálogo presente × ausente, anotação preservada

**O que já existe**: fotos sintéticas (A1, A2, B–F) são fiéis por construção (sem janelas); a leitura PAREADA roda a mesma spec
duas vezes — com a caixa de catálogo (= a verdade) e sem — sobre os MESMOS pixels e o MESMO corte (mesma foto, mesmo formato,
mesmo `cropPosition` do compositor). Só a foto real da fixture tem janelas (e por isso é "não medida").

**O que entra**:

- **Foto A3** (`fotos-sinteticas.ts`, `VERSAO_DAS_FOTOS_SINTETICAS = 2`): assunto forte (xadrez) colado à BORDA SUPERIOR,
  centrado (40 % × 17 % em x 30 %, y 3 %), sobre fundo ESCURO (72 ± 5; o xadrez do assunto em 150 ± 95): é o "assunto
  deslocado para a borda" que `minimal-fb-centro-optico` pede, FORA das zonas de texto dele (headline a partir de y 0,42), e dá
  leitura ao texto claro. (A primeira tentativa, borda ESQUERDA a meia altura, compunha mas caía em `texto-sem-leitura`: a zona da
  headline do arquétipo começa em x 0,15 e a caixa pousava sobre o xadrez.) A1/A2 ficam como estão (assunto centrado, fundo
  médio 128). Rodada exploratória `--so '|A3|'` com os pixels finais: `centro-optico` APTO no feed e no story para `cliente-00` e
  `cliente-00-m90`; `topo-esquerda` APTO só em `cliente-00-m90` (§ 2).
- **Anotação rastreada por peça** (registro `anotacao`), com CAPTURA no harness — nenhum campo novo em produção:
  (a) COMPOSITOR: `diagnostico.assunto`/`assuntoOrigem` (catálogo, estimado, nenhum) e o `cropPosition` da `bg-foto` composta;
  (b) REVISOR: o harness embrulha `estimarAssunto` de `@/lib/compositor/mapa-de-calma` (importado por `revisar-arte.ts`) e conta
  as estimativas por chamada de `revisarArte` — zero estimativas + cobertura `avaliada` sem motivo = a anotação do compositor
  foi REAPROVEITADA (é o único caminho em `assuntoDaPeca` que não estima nem declara `naoSeAplica`); ≥ 1 estimativa = NOVA
  leitura (origem estimado ou nenhum, conforme `NAO_COMPROVADA` + o motivo da cobertura); exceção na leitura = falha (modo G);
  (c) PRODUTOR: o harness embrulha `contextoDaMedicao` (chamado de fora por `agendar-itens.ts`) e guarda o `assunto` do
  contexto (origem + caixa) usado sob trava, além dos `motivos` do registro. Para toda peça do caso A: compositor = catálogo ⇒
  revisor REAPROVEITOU (0 estimativas) e produtor usou `catalogo` com a MESMA caixa — **anotação preservada**; qualquer outra
  combinação é "anotação não preservada", classificada em: reestimada / sem assunto / falha de leitura. O resumo lista cada
  caso A com os três elos.
- **O par** (catálogo presente × ausente) só existe com DUAS leituras EFETIVAS: as duas execuções compuseram sobre os mesmos
  bytes (SHA-256), dimensões e `cropPosition`; se uma recusou, a peça é "não pareada" (dita, com o código) e sai da conta;
  par com corte diferente idem ("corte divergente"). Onde o arquétipo EXIGE catálogo (a execução principal nasce com ele), o
  ESTIMADO não vem do compositor: o harness calcula a estimativa (`lerFotoComoCover` → `mapaDeCalma` → `estimarAssunto`) sobre
  os MESMOS bytes e o MESMO corte da peça composta, e o resumo rotula a origem do estimado (compositor × harness no mesmo
  recorte). Hoje as fotos sintéticas têm a dimensão do canvas e o `cover` não corta; a conferência vale para quando as fotos
  forem outras.
- **Cenário H — anotação perdida de propósito** (injetado, como o modo G): numa peça A APTA, a página composta é editada de modo
  que o cache da composição deixe de casar (troca do `cropPosition` da `bg-foto` — `assuntoDaPeca` em `revisar-arte.ts` só
  reaproveita a anotação quando formato, `imageUrl` e corte coincidem; fora disso ele ESTIMA e não lê o catálogo). Espera-se:
  o revisor faz NOVA MEDIDA E DECISÃO (≥ 1 estimativa) e, sob a política atual, estimado ou sem-assunto vai ao humano
  (`texto-sobre-assunto:NAO_COMPROVADA`), o produtor idem, nenhum DRAFT. O registro diz QUAL ocorreu (reestimou com assunto /
  reestimou sem assunto / falha de leitura) — `NAO_COMPROVADA` sozinho não distingue. É o comportamento de hoje, medido e dito;
  **se o owner quiser que o revisor releia o catálogo quando o cache cai, é mudança de produção → decisão**. O resumo ganha a
  linha "anotação: preservada N/N (caso A) · cenário H: N reavaliadas, N ao humano, por tipo".
- A leitura pareada passa a cobrir A3 (já cobre A1/A2 e a real). A decisão 1 ganha, no texto, a distinção "catálogo = região
  protegida anotada; não é garantia de APTO".
- **Já observado na rodada exploratória** (`--so minimal-fb`, 16 pares reais com arquétipo, estimado pelo harness no mesmo
  recorte): o estimador (`mapaDeCalma` 6×10 → `estimarAssunto`) localizou caixa em 8/16 — as 8 de A1/A2 (assunto a meia altura,
  IoU com o catálogo 0,29) — e em NENHUMA das 8 de A3 (assunto colado à borda superior). É um comportamento MEDIDO sobre pixels
  sintéticos fiéis, não um defeito comprovado nas fotos dos clientes: diz que, nesta construção, assunto encostado na borda não é
  localizado pela estimativa — e, sem catálogo, essa foto cai no caso C (humano). Vai ao relatório como achado; o que fazer com o
  estimador é decisão/trilha à parte, não deste adendo.

## 2. Casos que efetivamente compõem pelos arquétipos (sem perder os de recusa)

Diagnóstico (rodada exploratória `--so minimal-fb`, 108 specs com o lote novo; motivos agora registrados em `compor.motivo`):

| recusa | causa | o que se faz |
|---|---|---|
| `ARQUETIPO_FORA_DA_ZONA` em `minimal-fb-topo-esquerda` (todas as peças de `cliente-00` e `cliente-fixture`) | a referência x do arquétipo é 0,085 × 1080 = **92 px**; a zona efetiva é cortada pela área segura do projeto (`margemH` **96**) → a caixa real nasce 4 px fora da zona **por construção**, para qualquer foto e copy | **cliente sintético `cliente-00-m90`** (mesma assinatura, `geometria.margemH = 90` nos dois formatos): compõe e sai APTO (feed A1/A2/A3 curta e longa; story A3 curta e longa). `cliente-00` (margem 96) FICA, como caso de recusa que é — e o conflito referência-do-arquétipo × margem do projeto vai ao relatório como ACHADO DO COMPOSITOR/T1a a decidir (não é mexido aqui) |
| `SEM_COMBINACAO` em `minimal-fb-centro-optico` story (A1/A2/real) | o assunto centrado (A1/A2) ou a vitrine (real) fica sob as zonas de texto do centro — "INVADE_REGIAO_PROTEGIDA" em todas as 15 combinações | **foto A3** (assunto na borda superior, fundo escuro): compõe e sai APTO no story e no feed. A1/A2/real continuam como recusa |
| `ARQUETIPO_LINHAS_EXCEDIDAS` (`centro-optico` × copy longa) | o arquétipo limita apoio e serviço a 1 linha | fica (recusa legítima por desenho) |
| `ARQUETIPO_PAPEIS_INCOMPATIVEIS` / `PAPEIS_INCOMPATIVEIS` (copy `media`, com pré-título) | nenhum arquétipo do T1a nem a assinatura sintética têm o papel `pre` | fica (recusa legítima); a assinatura sintética NÃO ganha `pre` neste adendo (o compositor sem arquétipo teria de ser estudado à parte) |

Resultado esperado: de 2/48 para ≥ 17/108 peças com arquétipo compostas, com APTO em `topo-esquerda` (m90) e `centro-optico`
(A3), e as recusas existentes preservadas e nomeadas. Oclusão injetada volta a ter cobertura além de sem-foto: passa a rodar
também em peça APTA de caso A (catálogo).

## 3. Variante EXCLUSIVAMENTE DE TESTE da assinatura da fixture, respeitando piso e folga

A assinatura de 13/10 (`cliente-fixture`) tem headline em y 148 (piso topo 188), serviço em y 1768 e logo em y 1669–1764 (piso
rodapé: base 1696) — todo story cai no piso (18/18). Entra **`cliente-fixture-piso`**: as MESMAS camadas, cores, fontes e
números, com as caixas movidas para dentro do piso COM folga e INTEIRAS na área segura do projeto (margemH 96 → x 96…984;
safeTopo 250; safeRodape 350 → base ≤ 1570): headline x 243 w **741** y 250 (h 164 → base 414), apoio x 243 w **741** y 420
(h 92 → base 512), logo x 442 w 197 y 1395 (h 95 → base 1490), serviço x 200 w 680 y 1500 (h 52 → base 1552). Nada toca
188/1696 nem a folga de 1 px; nada passa de x 984. **A variante vale para as fotos SINTÉTICAS** (fiéis por construção). Com a
foto REAL da fixture as caixas novas caem FORA das janelas fiéis — essas peças continuam "não medidas" (§ 3b), como hoje, até o
owner decidir sobre as janelas (decisão 2); a variante NÃO é prova de leitura fiel da foto real. **`cliente-fixture` continua no
lote como regressão** (as 18 recusas por piso são o comportamento esperado da assinatura histórica). Nenhuma assinatura real é
alterada; nenhuma exceção ao piso é criada — a variante é só do harness, e o resumo a rotula "variante de teste".

## 4. Proposta objetiva para a etapa representativa (decisão 5.1/5.2) — NADA É EXECUTADO AQUI

| item | proposta | alternativa |
|---|---|---|
| Clientes candidatos | os clientes ativos com assinatura de story E conteúdo recorrente no Dot: **Espeto, Quintal, TERO, Real, By Rock, Wine Vix** (6); Lagosta Criativa, Choe's e Ciro Trigo como reserva. O exportador `--listar` (branch de dev, leitura) confirma a lista — só roda com a sua ordem | só os 3 do piloto do Dot |
| Quantidade e SELEÇÃO auditável | **10 por cliente**, só de peças com VÍNCULO VERIFICÁVEL entre o que foi publicado e a foto: `SocialPost` de story PUBLICADO ou agendado nas últimas 4 semanas → a sua `PostRenderProof` (chave post + `mediaUrl`), exigindo que a URL de mídia EFETIVA do post seja a `mediaUrl` da prova → da `layersSnapshot` da prova (as camadas efetivamente desenhadas) sai a camada `bg-foto` com URL e `cropPosition` — é essa URL, nesse corte, que entra. Nunca se reconstrói a foto histórica a partir da página ATUAL nem do hash da Generation (`versaoRenderizada` é identidade, não arquivo de camadas). Post sem prova, prova cuja `mediaUrl` não é a mídia efetiva, mídia direta sem página: **excluído e contado** ("sem vínculo verificável"). Do mais recente para o mais antigo, sem repetir arquivo; estratificação 4 produto/vitrine · 3 ambiente difuso · 3 pessoa/rosto; categoria abaixo da cota completa-se com a seguinte e o déficit fica DITO; cliente com < 6 fotos elegíveis sai da leva e é dito. 60 fotos no total se os 6 clientes tiverem cota | 5 por cliente (30) |
| Origem dos arquivos e FERRAMENTA | DUAS coisas distintas, as duas registradas: (a) os **bytes efetivamente desenhados** — a URL da `bg-foto` da versão renderizada (acima), que é o que o gate mediu; (b) o **original**, só quando a preservação é COMPROVADA. A origem REAL é classificada pelo FLUXO que gerou o arquivo (subcaminho + rota de origem), não só pelo prefixo: `uploads/` (foto enviada inteira: original = ela mesma, nome preservado) · `chat-uploads/` (foto do chat CONVERTIDA e REDUZIDA → "original indisponível") · `drive-cache/` (miniatura `s1920` do Drive: o original está no Drive do cliente e **só entra se o owner autorizar a leitura do Drive**) · `posts/` é AMBÍGUO — recebe upload recortado, upload de story sem corte e downloads inteiros do Drive e de imagens de IA — então nele a transformação só é afirmada quando o fluxo é identificável pelo registro (dimensões × origem, rota); do contrário a foto é marcada "origem ou transformação desconhecida" e NÃO é chamada de original. Toda transformação comprovada (recorte, conversão, redução) é registrada por foto; "original" só se chama o que comprovadamente não passou por nenhuma. Sem original comprovado a foto entra na leva só com (a), e isso é dito. **Ferramenta ainda a escrever** (não existe): um modo `--fotos` do exportador que, no branch de dev e em transação `READ ONLY`, faz EXATAMENTE a consulta da linha acima — `SocialPost` de story das últimas 4 semanas por cliente → `PostRenderProof(postId, mediaUrl)` com `mediaUrl` = mídia efetiva do post → `layersSnapshot` → camada `bg-foto` (URL + `cropPosition`) — aplica as MESMAS exclusões (sem prova, prova de outra mídia, mídia direta), classifica a origem da URL pelo fluxo (acima), lista e baixa (a) — e (b) quando comprovado — para a pasta do export, com a mesma guarda fail-closed e registrando cada exclusão; a `Generation` entra só como METADADO auxiliar (tema, formato), nunca como critério de vínculo; o exportador atual só traz assinaturas, logos e imagens das páginas de assinatura. Formatos por cliente: o `--listar` de hoje só conta páginas de assinatura — a consulta futura discrimina story/feed por página (tags/dimensões) e a contagem de specs cai onde não houver feed. **Idade do snapshot**: o branch de dev é cópia e envelhece (`npm run db:dev:status` diz quantos dias); a leva declara a data do snapshot, os totais por cliente e categoria e os déficits ANTES de ser chamada de auditável — e recria o branch se estiver velho | export manual do Blob pelo owner |
| Regiões necessárias | por foto: (a) **região protegida** (vitrine/produto/rosto — a que o catálogo guarda) marcada por pessoa; (b) o **assunto por formato/corte** derivado dela pelo mesmo `cover` do compositor (story e feed, `cropPosition` padrão) — a "verdade" das decisões 1/2; (c) a classificação difusa/forte (para o caso C) | só (a) |
| Anonimização | o método de 13/10 POR PEÇA: grade de luminância + janelas fiéis; as janelas propostas são a UNIÃO das zonas de texto e logo dos arquétipos do T1a e das caixas da assinatura do cliente — isso NÃO garante que toda medida caia nelas (a caixa depende da composição e muda depois dos ajustes): **toda peça, em cada formato e depois de cada ajuste, passa por `exigirMedidaFiel`; a que sair das janelas é "não medida" e assim é contada** (nunca aproximada). Janelas com pixels fiéis de produto ou ROSTO podem identificar o cliente ou uma pessoa mesmo pseudonimizadas: **quais pixels podem ser versionados é decisão explícita do owner, foto a foto ou por categoria** (proposta: produto/vitrine sim; rosto NÃO versionado — fica só no Blob de teste privado). Pseudonimização por `pseudonimizar.ts`; fontes declaradas, não copiadas | sem anonimização, tudo em Blob de TESTE privado (pixels reais, fora do repositório), só o relatório versionado |
| Destino dos dados | fixtures pseudonimizadas em `src/lib/direcao-de-arte/__tests__/fixtures/piloto-representativo/cliente-NN/` (grade + janelas + regiões + JSON), versionadas; a tabela nome ↔ NN e os originais ficam em `human-output/` (fora do repositório); o relatório da rodada em `docs/piloto-sintetico/` | tudo fora do repositório, em Blob de teste, com o relatório versionado |
| Custo estimado | ~1 h por cliente de marcação de regiões (owner ou equipe) + escrever e revisar o modo `--fotos` do exportador (≈ meio dia, com Codex) + gerador de janelas por união de zonas; 60 fotos × (1 ou 2 formatos, conforme a assinatura) × 3 copies × (sem + 2 arquétipos) = 540–1.080 specs; rodada completa ≈ 25–45 min nesta máquina | — |

O que a etapa representativa responde que o lote controlado não responde: a taxa real de caso C (fotos difusas) e de caso A
nas fotos dos clientes e o custo humano da política decidida. Sobre o ESTIMADOR, ela responde menos do que parece: a estimativa
(`estimarAssunto`) lê a foto INTEIRA e, na fixture pseudonimizada, fora das janelas há a grade — então o que se mede é "o
estimador sobre a foto pseudonimizada", rotulado assim no resumo; avaliar o estimador sobre a foto real inteira só pela
alternativa privada (Blob de teste, pixels reais, fora do repositório), se o owner a aprovar. `exigirMedidaFiel` protege as
medidas de texto e logo (caixas dentro das janelas), não a estimativa.
**Nenhuma exportação, catalogação, marcação de região ou escrita de ferramenta nova é executada por este adendo**: a lista
de clientes, a quantidade, a anonimização (quais pixels podem ser versionados) e o destino são decisão sua.

## 5. Escopo de implementação deste adendo (só o sintético)

- `fotos-sinteticas.ts`: caso A3 (+ versão 2); `lote-do-piloto.ts`: entrada A3; `piloto-sintetico.test.ts`: clientes
  `cliente-00-m90` e `cliente-fixture-piso`, `compor.motivo` no registro, rastro `anotacao` por peça (capturas no harness:
  `estimarAssunto` embrulhado para contar estimativas por revisão; `contextoDaMedicao` embrulhado para o assunto usado pelo
  produtor), par com SHA-256/dimensões/corte, cenário H (anotação perdida injetada, com o tipo da nova medida), oclusão
  injetada também em caso A; `relatorio-do-piloto.ts`: seções "anotação" e "variante de teste", `H` nos
  invariantes (rodada oficial exige H > 0 e 100 % → humano); testes unitários dos novos juízes/agregados; docs
  (`revisor-da-arte.md` § Piloto, § Adendo).
- Rodada nova OFICIAL (padrão + `--completo`, rótulo `adendo`) com resumo versionado. Falso APTO = 0 e repetibilidade 100 %
  continuam obrigatórios; "satisfatório" continua do owner (5.3); **MCP-M0 continua bloqueado** (§ 6 do contrato do piloto).
- O que NÃO entra: política, gate, compositor (o conflito referência × margem é achado, não conserto), assinatura real,
  exportação/catalogação real, MCP-M, editor, canvas.

## 6. Gates

Adendo revisado pelo Codex ANTES da implementação; implementação só no § 5; testes sem enfraquecer; rodada nova com resumo
versionado; typecheck; lint; `git diff --check <base>`; 3 validadores; suíte completa sozinha; Codex APTO no HEAD final; CI e
Vercel verdes; merge por merge commit com `--match-head-commit` (SHA completo); CI da main verde.

## 7. Decisões que continuam do owner

| # | Decisão |
|---|---|
| B | `estimado` ('humano' proposta × 'comprova') |
| 2 | Janelas da fixture de 13/10 (ou a etapa representativa a substitui) |
| 3 | Assinatura real × piso (a variante de teste NÃO decide isso) |
| 5.1 / 5.2 | Etapa representativa: aprovar a lista de clientes, a quantidade, a anonimização e o destino (§ 4) |
| T1a | Referência x dos arquétipos de canto (92 px) × margem do projeto (96 px): mexer no arquétipo, na margem ou aceitar que `topo-esquerda` não serve a clientes com margem ≥ 92 |
| H | Se o revisor deve ler o catálogo quando o cache da composição cai (hoje estima e manda ao humano) |
