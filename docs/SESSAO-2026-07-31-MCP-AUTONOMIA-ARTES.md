# Sessão 2026-07-31 — MCP autônomo nas artes: melhorar, conferir, ajustar

Seis tools novas no conector remoto (`/api/mcp`, definidas em
`src/lib/mcp/tools.ts`) fecham o ciclo **criar → conferir → ajustar → melhorar**
sem abrir o editor, mais a promoção de artes a modelo. Total: 25 tools.

## O que entrou

| Tool | O que faz |
|---|---|
| `melhorar-arte` | Dispara a melhoria com IA (mesmo pipeline da agenda) numa Generation; opcionalmente aplica a um post APROVADO |
| `ver-melhoria` | Poll do job: em-andamento / pronta (url + textCheck) / falhou |
| `conferir-arte` | Devolve miniatura (bloco `image` no MCP) + conferência de texto por visão contra os textos esperados |
| `ajustar-arte` | Patch de slots/foto na MESMA página + re-render + nova Generation |
| `marcar-como-modelo` | Promove/despromove página a modelo (`isTemplate` + tags de tema) |
| `listar-modelos` | Modelos do cliente + candidatas à promoção |

## Peças de infraestrutura

- **`src/lib/ai/creative-improvement-service.ts`** — `startImprovement()`
  extraído da rota `/api/generations/[id]/improve` (que virou casca fina):
  valida Generation/post/créditos/hosts, cria a Generation-job PROCESSING e
  devolve os args do runner. Quem chama decide o disparo (`after()` nas rotas,
  `await` no E2E). Dedupe opcional por `sourceGenerationId` + PROCESSING +
  janela (o MCP usa 10 min) — retry do modelo não vira segunda cobrança.
- **`renderPageAndRegister()`** em `src/lib/creatives/persist.ts` — miolo de
  render+upload+Generation compartilhado entre criar página nova e re-renderizar
  existente (`ajustarArte`).
- **`ajustarArte()`** em `arte-rapida.ts` — recusa página `isTemplate` (modelo
  se edita no editor), re-usa `bakeLayers`/reflow, grava `slotValues` FINAIS
  (por nome de camada) no fieldValues para a verificação de texto, e chama
  `invalidateScheduledRenders` (regra da casa para escrita em `Page.layers`).
  Fallback próprio para troca de foto em arte-livre (o fundo de lá não é
  `isDynamic`).
- **`/api/mcp` com `maxDuration = 300`** (era 120) — a melhoria roda via
  `after()` dentro da function. INSTRUCTIONS do handshake ganharam o bloco
  "ARTES — crie, confira, corrija".
- **`runMcpTool` aceita `_mcpContent`** — tool que devolve blocos prontos
  (texto + imagem) em vez de JSON serializado.

## Armadilhas corrigidas no caminho

- **`extractExpectedTexts` não lia arte-livre**: procurava `fv.texts`, mas a
  arte-livre grava `fv.textos` (combinação) e `fv.textosLivres` (blocos, campo
  `texto`). Resultado: melhoria de arte criada pelo MCP saía com
  `textCheck: skipped` — sem proteção verbatim justamente no caminho padrão do
  conector. Agora as quatro formas são lidas (`slotValues`, `texts`, `textos`,
  `textosLivres`).
- **`resolverAutor` criava usuário fantasma**: `Project.userId` guarda o id
  INTERNO do User (verificado nos dados — o comentário antigo do tools.ts dizia
  o contrário), e passá-lo por `getUserFromClerkId` CRIAVA um User com
  clerkId=cuid. Dois fantasmas já existem no banco (`cmgw866yc…`,
  `cms5fv2c5…`) — não criar mais. O novo `resolverDono` resolve por `User.id`
  primeiro, cai para clerkId legado, e devolve os DOIS ids (interno para
  createdBy da base, clerk para créditos).

## Regras que ficaram

- **Melhoria em post só APROVADO** — vale igual no MCP (o serviço recusa antes
  de validar créditos). Sem `postId`, a melhoria fica na galeria.
- **Tool nova de arte sempre embrulha lib de `src/lib`** — nada de lógica na
  definição da tool. `melhorar-arte`/rota improve usam o MESMO
  `startImprovement`.
- **`ajustar-arte` nunca toca página-modelo** — o erro `PAGINA_E_MODELO`
  redireciona para o editor. Promover arte a modelo é `marcar-como-modelo`
  (tags SUBSTITUEM, mesmo contrato do resto da casa).
- **Dedupe de melhoria é por `sourceGenerationId`**, não por post — duas
  melhorias da mesma origem em <10 min voltam o mesmo job.

## Validação

E2E real em produção (`scripts/.tmp-test-mcp-arte-tools.ts`, protocolo projeto
8 sem post): 21/21 checks. Melhoria real: geração 94.4s, textCheck `passed` na
1ª tentativa **com textos vindos de `textosLivres`** (prova do fix), dedução de
25 créditos no clerk id correto, dedupe e `ver-melhoria` conferidos, cleanup
completo. `typecheck` e `lint` limpos.
