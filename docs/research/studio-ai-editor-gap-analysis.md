# Gap analysis: Studio Lagosta como editor operável por IA

Base: [`studio-current-architecture.md`](studio-current-architecture.md), auditoria de 12/10/2026
sobre `f509b0fd` (linhas conferidas em `137a1e7e`), revista depois da revisão adversarial do Codex.
A arquitetura alvo é uma **proposta, ainda não implementada**. A proposta está em
[`studio-target-architecture.md`](studio-target-architecture.md).

Prioridades:

- **P0** — fundação mínima. Sem isso, um agente não manipula criativos com confiança.
- **P1** — importante depois da fundação.
- **P2** — só quando um caso real pedir (YAGNI).

Escalas:

- **Complexidade:** S (dias), M (1–2 semanas), L (mais que isso).
- **Risco:** chance de quebrar produção ou dados.

---

## Objetivo A — Scene graph semântico

**Conclusão:** lista plana + identidade semântica dá autonomia útil. Hierarquia não é P0.

### A1. Não há vocabulário de papel canônico. Há seis. — **P0**

- **Estado atual:**
  - o papel vive em `metadata.compositor.papel` (compositor), em `Page.copyAutoral` (contrato),
    em `name` (lido por sinônimo), em ids reservados (`bg-foto`, `logo`) e em regex de conteúdo
    (horário, endereço);
  - duas leituras divergem: `papelDaCamada` é exata, `papelDoNome` aceita sinônimos;
  - `foto` e `logo` não são papéis.
- **Problema:** não há uma resposta única para "qual camada é o CTA?".
- **Impacto:** alto.
- **Dependências:** nenhuma.
- **Complexidade:** S. O campo e o vocabulário já existem.
- **Risco:** baixo. A leitura é nova e o legado continua no fallback.

### A2. Não há identidade de slot, e o papel se repete. — **P0**

- **Estado atual:**
  - o compositor gera `servico` e `servico-2` (`compositor/camadas-extras.ts:102`);
  - a identidade disponível é o `layer.id`, que **a duplicação regenera** (`copy-autoral/duplicacao.ts`);
  - o `bloco` do contrato identifica conteúdo, não um lugar do modelo.
- **Problema:** endereçar só pelo papel escolheria uma ocorrência arbitrária; endereçar pelo id
  quebra na clonagem.
- **Impacto:** alto. É o que faz um agente editar o endereço achando que é o horário.
- **Dependências:** A1.
- **Complexidade:** S–M.
- **Risco:** baixo, se seguir o precedente de `materializarVinculosDoIdFisico` (o vínculo vira
  marca na camada antes da troca de ids).

### A3. Três laços reimplementam a gravação com revisão. — **P0**

- **Estado atual:**
  - `gravarCamadasComRevisao` (`copy-autoral/persistir.ts:93`) já faz compare-and-set, revisão
    atômica de `copyAutoral`, autoria e conflito (409). É usada pelo PATCH de camada, pelo PUT do
    template e por `reverter`;
  - o **PATCH do editor**, o **`ajustarArte`** e a **recomposição** têm um laço próprio;
  - a invalidação roda dentro da transação em uns e fora em outros.
- **Problema:** cada caminho novo de agente seria mais um laço, e a regra de revisão do contrato
  pode divergir entre eles.
- **Impacto:** alto. Os bugs PR3-F01/F03 (camadas X com contrato Y) vieram exatamente disso.
- **Dependências:** nenhuma.
- **Complexidade:** M.
- **Risco:** médio, porque o PATCH do editor é o caminho mais usado. Exige testes de
  caracterização antes.

### A4. `Page.layers` em três codificações. — **P2** (rebaixado)

- **Estado atual:** o banco tem array nativo, string e string dupla. `gravarCamadasComRevisao`
  grava string, e `lerCamadas` lê as três.
- **Conclusão:** está contido pelo leitor. Normalizar exige medição em produção e mexe em todos
  os leitores.

### A5. Não há hierarquia (árvore, frames, grupos com transformação). — **P2**

- **Estado atual:** `groupId` plano; `parentId` não é interpretado.
- **Conclusão:** o compositor gera blocos coerentes e `aplicarAjustes` já move a pilha da coluna.
  O caso real é coberto sem árvore.

### A6. Dois renderizadores. — **P2**

- **Estado atual:** Konva no browser e Canvas2D no servidor, com paridade mantida à mão.
- **Conclusão:** paridade por teste quando uma divergência aparecer.

---

## Objetivo B — Templates + slots

### B1. O slot é implícito (id ou nome da camada). — **P0**

- **Estado atual:**
  - `slotValues[layer.id] ?? slotValues[layer.name]`, duplicado em `bakeLayers` e em
    `aplicarSlotNaCamada`;
  - chave sem camada só gera um `warn`;
  - `dynamicFields` é morto.
- **Problema:** o agente não sabe quais campos existem e erra em silêncio.
- **Impacto:** alto.
- **Dependências:** A1 e A2.
- **Complexidade:** S–M. A resolução de alvo é uma função pura.
- **Risco:** baixo. O legado continua no fallback.

### B2. Cada via tem um contrato de preenchimento próprio, e isso é correto. — Reclassificado

A primeira versão chamou de lacuna o fato de o story agendado e o "criar do template" não
fazerem autofix. **A revisão do Codex mostrou que isso não é lacuna.**

- Cada via tem contrato próprio (tabela na seção 3 da arquitetura alvo).
- No agendado, um autofix na hora do render mudaria uma peça já vista e aprovada, sem ninguém
  olhar.

O que sobra:

| Ponto | Prioridade |
|---|---|
| Duplicação do casamento de slot | **P0**, dentro de B1 |
| Aviso de "não cabe" **antes** de agendar post de modelo | **P1** |
| O "criar do template" da UI sem autofix | **P1**: decidir se é intencional |

### B3. Trocar a imagem herda o crop anterior e estica sem `cover`. — **P0**

- **Estado atual:** o `bakeLayers` troca só o `fileUrl` (`bake-layers.ts:57`); o crop manual tem
  precedência; sem `objectFit: 'cover'` a imagem estica (`image-fit.ts:25`).
- **Problema:** a foto nova sai cortada no lugar errado ou deformada.
- **Impacto:** alto para agentes, que trocam foto o tempo todo.
- **Complexidade:** S.
- **Risco:** baixo.
- **Política própria:** zera o crop, aplica `cover` centralizado e preserva o contêiner. Ela é
  testável e **não depende de pesquisa externa** (ver a seção do REA).

### B4. Editar um modelo muda os posts que o renderizam. — **P1**

- **Estado atual:** o story agendado renderiza a própria página-modelo a cada vez.
- **Mínimo:** a gravação de um modelo informa quantos posts agendados ela afeta.

### B5. Não há redimensionamento determinístico. — **P2**

- **Conclusão:** regerar pela spec em outro formato cobre o caso de hoje.

### B6. As cores da marca não entram sozinhas; gradientes fixos no código. — **P2**

---

## Objetivo C — Command layer comum entre UI e IA

**Conclusão:** já existe uma camada de operações informal em `src/lib`. Não é preciso um
framework de comandos; é preciso convergir para ela.

### C1. Operações de camada: o executor existe, mas é estreito. — **P0** (alvo semântico) / **P1** (operações novas)

- **Estado atual:** `aplicarAjustes` (`revisao/aplicar-ajustes.ts:272`) é puro, testado e
  revisado.
  - Tem cinco operações: `fonte`, `mover`, `gradiente`, `visibilidade` e `caixa`.
  - Endereça só por id de camada.
  - Recusa o que não aplica e nunca aplica pela metade.
  - Em produção, só o `ajustarArte` o chama.
- **Problema:** um agente precisa saber o id físico, e não pode mudar cor, família, alinhamento,
  ordem nem adicionar ou remover camada.
- **Divisão:**
  - **P0:** os alvos `slot` e `papel` no ajuste, que dependem de A2.
  - **P1:** as operações novas, uma a uma.
- **Risco:** baixo, porque a função é pura e tem testes.

### C2. Operações de post divergem entre web e MCP. — **P1**

- **Estado atual:**
  - criar post tem três caminhos;
  - cancelar tem três variantes (a web apaga até `POSTED`, o MCP recusa);
  - a edição e o reagendamento da web estão inline no `PUT`.
- **Mínimo:** as rotas chamam as funções de `posts/agenda-acoes.ts` e `creatives/agendar.ts`.

### C3. Autorização reimplementada em cada porta. — **P1**

- **Estado atual:** web e MCP usam funções de acesso diferentes.
- **Mínimo:** os serviços recebem o `principal` e checam o recurso que tocam. Junto vem o
  `ProjectScope` explícito (D2).

### C4. O editor não usa operações; undo por snapshot. — **P2**

- **Conclusão:** só depois de C1 provar o contrato pelo lado do agente.

---

## Objetivo D — MCP orientado a operações de alto nível

**Ponto forte:** `compor-arte`, `criar-arte-de-modelo`, `ajustar-arte` e `agendar-leva` já são
operações de intenção. O MCP **não** precisa ser redesenhado.

### D1. Vazamento por `projectHint` no `escolher-modelo`. — **Resolvido** (PR #202, mergeado)

### D2. Restos da correção do PR #202. — **P1**

- **LOW 1:** a `prepare-creative` legada do stdio chama `prepareCreative` sem
  `projetosVisiveis`. Não é uma fronteira de confiança nova (o processo local já tem acesso
  total), mas mantém comportamento paralelo. Deve convergir para o catálogo e a porta.
- **LOW 2:** em `PrepareCreativeInput`, "ausente = acesso global" é uma armadilha. Substituir
  por `ProjectScope = { type: 'all' } | { type: 'restricted'; ids: number[] }`.

### D3. 24 tools legadas no stdio, fora do registro (23 além da `prepare-creative` de D2). — **P1**

### D4. Não há auditoria por chamada. — **P1**

- **Mínimo:** uma linha por chamada gravada pela porta única: `principal`, tool, hash dos
  argumentos, resultado e duração.

### D5. Não há idempotency key fora dos lotes. — **P1**

### D6. Annotations imprecisas e escopo OAuth único. — **P1**

### D7. Os modelos não expõem os slots. — **P1**

- **Mínimo:** `listar-modelos` / `escolher-modelo` devolvem `slotId`, papel, tipo,
  cardinalidade e texto atual. Depende de A2.

### D8. Sem resources e prompts; erros em três formatos. — **P2**

---

## Fora do escopo do editor, registrado

Trilha da agenda:

- **Não existem os estados aprovado, rejeitado e cancelado.** **P1** quando houver aprovação
  pelo cliente.
- **Três caminhos marcam `FAILED` sem `handlePublishFailure`.** **P1** (bug).
- **Duas tabelas de status do Zernio que discordam.** **P1** (bug).
- **A documentação diz "render 10 min antes"**, mas o código usa prioridade de 15 min e
  congelamento de 5 min. **P2** (doc).

---

## Resumo

| Prioridade | Itens |
|---|---|
| **P0** | A1 (vocabulário canônico + `foto`/`logo`), A2 (`slotId` + cardinalidade + política de repetição), B1 (resolução de alvo comum), C1-P0 (alvo semântico no `aplicarAjustes`), B3 (troca de imagem), A3 (gravação convergida), testes de caracterização de cada via |
| **P1** | C1-P1 (operações novas), D7 (slots no MCP), D4 (auditoria), D5 (idempotência), D2 (`prepare-creative` legada + `ProjectScope`), D3 (legadas), D6 (annotations e escopos), C2 (post web × MCP), C3 (autorização no serviço), B2 (aviso antes de agendar), B4 (alcance de editar modelo), bugs da agenda, comparação de pixel |
| **P2** | A4 (codificação de `layers`), A5 (hierarquia e frames), A6 (renderizador único), B5 (redimensionamento), B6 (cores e gradientes), C4 (editor por operações), D8 (resources e erros), papéis `preco`/`oferta`/`badge`, vídeo e timeline |

## Alterações após revisão adversarial

A tabela completa (finding, classificação, consequência e mudança) está em
[`studio-target-architecture.md`](studio-target-architecture.md#alterações-após-revisão-adversarial).

Nesta análise, as mudanças foram:

- **A3** deixou de ser "uma gravação nova" e virou "convergir para `gravarCamadasComRevisao`".
- **A2** foi criado, porque o papel não é identidade.
- **B2** foi reclassificado: não há pipeline universal.
- **C1** passou a ser "estender o executor existente".
- **A4** (codificação de `layers`) foi rebaixado para P2.
