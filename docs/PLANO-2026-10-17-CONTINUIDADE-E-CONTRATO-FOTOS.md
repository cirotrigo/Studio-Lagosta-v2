# Continuidade do plano-mestre e contrato PROPOSTO do exportador `--fotos` (17/10/2026)

> **Estado: PROPOSTA para decisão do owner.** Nada aqui está implementado nem autorizado. Este documento (1) reconcilia o
> plano-mestre (`docs/PLANO-2026-10-15-AUTONOMIA-DIRECAO-DE-ARTE-E-MCP.md`) com a main `ac69d767`, (2) dá a ordem de
> continuidade com dependências e critérios de aceite, e (3) detalha, a partir do § 4 do adendo
> (`docs/PLANO-2026-10-17-PILOTO-ADENDO-DIAGNOSTICO.md`), o contrato técnico do modo `--fotos` do exportador e a sua matriz de
> testes offline. Não seleciona clientes, não lê dados reais, não autoriza exportação. Revisão técnica do Codex: ver o fim.
>
> Método: inspeção ESTÁTICA da main `ac69d767` (documentos, schema, código citado por arquivo). Nenhum teste foi executado
> nesta preparação; os números de rodadas citados são os dos resumos versionados em `docs/piloto-sintetico/` e do relatório da
> sessão anterior, não reproduzidos aqui.

## 1. Reconciliação: plano-mestre × main `ac69d767`

### 1.1 Concluído na main (código + testes + doc da área)

| Item do plano | Onde está | Observação |
|---|---|---|
| CP0–CP4.1 | linha de base do plano (main `69706ea2`) | inalterado |
| CP4.2a/b | `docs/regras/revisor-da-arte.md` § CP4.2; contrato `PLANO-2026-10-15-CP4-2-CONTRATO.md` "aprovado pelo owner" | a decisão 3 do plano-mestre (piso da manchete) foi tomada no contrato |
| CP5a veredito puro | § CP5a; contrato CP5A | decisões 9.1–9.7 implementadas como PROPOSTA nomeada (ver 1.3) |
| CP5b registro/identidade/`rulesVersion` | § CP5b | decisão 7 do plano (`rulesVersion`) implementada como PROPOSTA (9.10 do CP5b) |
| CP5c gate em `agendar-leva` (draft-only) | § CP5c; PR #242 | desenho mudou: medição DENTRO da transação, sob travas (nota no § 4.5 do plano) |
| CP5d gate em `ajustar-arte` (draft-only) | § CP5d | P1 (só grava versão APTA) como PROPOSTA |
| CP5e provas de autonomia | § CP5e; `piloto-ponta-a-ponta.test.ts` | `auditar-operacao` com bloco `gate`; não prova travas/SQL reais, Blob, autorização MCP |
| Piloto sintético (§ 4.8, lote CONTROLADO) | PR #249; resumos `docs/piloto-sintetico/2026-10-17-*` | 5.1 = proposta "sintéticas": **não cumpre o § 4.8** (contrato do piloto § 6) |
| Caso C do assunto | PR #250; contrato CASO-C | **decidido pelo owner**: humano |
| Adendo do diagnóstico | PR #251 | rodada `--completo` HEAD 61a6d4a0: 306 specs → 132 compostas → 124 medidas → 24 APTAS; falso APTO 0 em peça medida; repetibilidade 306/306 |

### 1.2 Evidência que falta (o que o plano exige e ninguém mediu)

| Exigência | Fonte | Por que falta |
|---|---|---|
| Lote REPRESENTATIVO (fotos reais) | plano § 4.8; contrato do piloto § 6 (a) | 5.1 decidiu sintéticas como proposta; a alternativa nunca foi executada |
| Taxa real de caso C e de caso A nas fotos dos clientes | adendo § 4 | só existe em pixels sintéticos |
| Concordância estimado × catálogo em fotos reais (decisão 1 / caso B) | plano § 10 dec. 1 | sintético: estimador localizou 32/60 pares (0/20 em A3, borda); nada em foto real |
| Quantas peças reais têm camada não-texto acima de texto (decisão 2 / oclusão) | plano § 10 dec. 2 | a política (B) foi implementada sem a contagem real |
| As 8 peças da foto real da fixture fora das janelas | resumo do adendo § 3b | NÃO MEDIDAS; dependem da decisão 2 (janelas) ou da etapa representativa |
| Travas/SQL reais, Blob, autorização MCP do gate | § CP5e "não prova" | o piloto roda sobre banco falso com travas |
| § 9 itens 4, 5 e 8 (piloto satisfatório, bloqueios entendidos por cliente, autorização) | plano § 9 | dependem do representativo e do owner |

### 1.3 Decisões exclusivas do owner, hoje em vigor como PROPOSTA nomeada

Implementadas e trocáveis numa constante; nenhuma foi aprovada. Lista para o owner revisar em bloco, sem pressa — nenhuma delas
bloqueia a preparação técnica abaixo:

- CP5a 9.1 (caso B `estimado: 'humano'`), 9.2 (oclusão B), 9.4 (copy sem contrato), 9.5 (sem logo solta), 9.6 (`texto-pequeno`
  crítica), 9.7 (tolerância texto × texto); CP5b 9.1–9.13 (nome `gateDaArte`, fonte da `copyVersion`, histórico, `rulesVersion`
  por hash, política efetiva…); CP5c 8.1–8.9 (política efetiva, códigos de concorrência, registro do reprovado, efeitos
  pós-commit NÃO rodam no draft-only, prazos 8 s / 4 s); CP5d 8.1–8.8 (P1, `AJUSTE_CONCORRENTE`…); CP5e 5.1–5.5.
- Do piloto e do adendo: B, 2 (janelas), 3 (assinatura real × piso), T1a (92 px × margem 96), H (reler catálogo quando o cache
  cai), estimador (assunto na borda), 5.1/5.2/5.3.
- Do plano-mestre ainda abertas: 4 e 5 (MCP-M), 6 (T1b × CP-V2).

### 1.4 Bloqueios que continuam

- **MCP-M0 bloqueado** pelo contrato do piloto § 6: só abre com (a) a etapa representativa executada ou (b) o owner alterar o
  § 4.8 do plano-mestre por escrito. Nenhuma das duas aconteceu.
- **Piloto real (§ 9)**: depende do representativo e de autorização explícita.
- **TERO (§ 6)**: depende de MCP-M1.
- **Trilha do editor (§ 7)**: a primeira ação ("commitar a pesquisa `docs/research/canva-minimal-editor-2026-10/`") continua
  pendente — a pasta segue untracked no checkout compartilhado e ausente da main (conferido: 0 arquivos no `git ls-tree`).
  Revisá-la e commitá-la é trabalho independente do CP5, mas **não há autorização registrada para ela**; d01–d11 e a decisão 6
  são do owner.
- **Crash do canvas**: sessão separada; fora deste documento.

### 1.5 Trabalho sintético já autorizado e pendente

**Nenhum.** O § 5 do adendo (único escopo sintético autorizado em aberto) foi entregue no PR #251 (relatório da sessão
anterior: "Desvios: nenhum"). Não há outra frente com contrato aprovado esperando implementação.

## 2. Continuidade: ordem, dependências, aceite

Cada passo só começa com o anterior aceito. "Autorização" = palavra do owner registrada; contrato revisado não é autorização.

| # | Passo | Depende de | Autorização necessária | Critério de aceite |
|---|---|---|---|---|
| P0 | Este documento revisado (Codex APTO) | — | nenhuma (preparação autorizada) | Codex APTO no HEAD do documento |
| P1 | **Escrever** o modo `--fotos` (código + testes OFFLINE, § 3–4), sem executar contra banco | P0 | **sim** — "escrever a ferramenta" (o adendo já listava isso como decisão) | matriz do § 4 verde; typecheck/lint; Codex APTO no código; merge só com APTO no HEAD exato e CI/Vercel verdes |
| P2 | **Contagem** (`--fotos --contar`) no branch de dev, sem baixar pixel | P1 na main | **sim** — ler o branch de dev (cópia de dados reais) e, se velho, **recriá-lo** (`db:dev:setup --recriar`, também decisão do owner) | relatório de elegíveis/exclusões por cliente e motivo, data do snapshot, déficits ditos |
| P3 | Decisões 5.1/5.2 com os números de P2: clientes, cota, janela de datas, pixels versionáveis, destino | P2 | **sim** (são as decisões) | registro escrito das escolhas no plano |
| P4 | **Exportação** (`--fotos` sem `--contar`) para pasta privada fora do repositório | P3 | **sim** | manifesto com SHA-256 por arquivo; exclusões contadas; nada no repositório |
| P5 | Marcação humana (região protegida, categoria, difusa/forte) | P4 | **sim** (quem marca; custo ~1 h/cliente) | arquivo de marcação por foto, versionado só se P3 permitir |
| P6 | Fixtures representativas + generalizar `exigirMedidaFiel` por foto (§ 3.9) + rodada | P5 | contrato próprio + Codex | resumo versionado; falso APTO = 0; repetibilidade 100 %; NÃO MEDIDAS contadas |
| P7 | Owner lê e decide "satisfatório" (5.3) → só então MCP-M0 pode ser discutido | P6 | **sim** | decisão registrada no plano |

## 3. Contrato técnico PROPOSTO do modo `--fotos` (P1)

### 3.0 Fatos do código que o contrato respeita (inspeção estática, main `ac69d767`)

- `PostRenderProof` (`prisma/schema.prisma`): chave `(postId, mediaUrl)`, `layersSnapshot Json`, `createdAt`; nasce **só** em
  `render-post-art.ts` na MESMA transação do CAS que grava `mediaUrls: [result.url]`; append-only. `layersSnapshot` =
  `camadasEfetivas` de `story-renderer.ts` (cópia JSON das camadas após aplicar os slots). Logo: num post de página
  renderizado, a mídia efetiva É `mediaUrls[0]` e é a `mediaUrl` da prova.
- **A tabela nasceu na migração `20261012120000_post_render_proof`**: não há prova antes de ~12/10/2026. A "janela das últimas 4
  semanas" do adendo tem, na prática, só os dias desde então — e só se o branch de dev for posterior a isso.
- O render grava `posts/rendered/<post>-<ts>.png`; `later-scheduler` normaliza FEED/CAROUSEL para
  `posts/<user>/normalized/…jpg` (STORY não passa por ali — a confirmar no PR por teste/inspeção, ver 3.5).
- Prefixos de upload (inspeção): `chat-uploads/<proj>/<token>.jpg` (`chat-upload.ts`, convertida/processada);
  `drive-cache/<proj>/…-s1920.jpg` (`persist.ts`, miniatura); `posts/<user>/google-drive/<ts>-<nome>.jpg` (rotas de download do
  Drive: extensão trocada para `.jpg` → **convertida**); `posts/<user>/ai-images/…` (imagem de IA baixada);
  `uploads/<user>/drive-…` (`api/upload/google-drive`). A camada de fundo do compositor tem `id === 'bg-foto'`
  (`defasagem.ts:214`, que em produção cai para `imagens[0]` quando falta — heurística que este contrato NÃO adota).
- Hosts próprios: `HOSTS_PROPRIOS` (`src/lib/creatives/ingerir-midia.ts`) — reutilizar, não duplicar.
- Guarda existente: `recusaDoExportador` (fail-closed por compute) + transação `SET TRANSACTION READ ONLY`
  (`exportar-piloto-sintetico.ts`). `human-output/` está no `.gitignore` da main (linha 126).
- `exigirMedidaFiel`/`caixasForaDasJanelas` (`__tests__/suporte/fixture.ts:124-139`) leem as janelas de UMA foto
  (`fixture.foto().janelas`): para N fotos precisam receber as janelas da foto da peça (P6, não P1).

### 3.1 Forma

Novo módulo puro `scripts/fixtures/selecao-de-fotos.ts` (sem `@/lib/db`, sem rede) + a casca no exportador existente:

```
exportar-piloto-sintetico.ts --fotos --contar  --cliente <id>… --desde <ISO> --ate <ISO>
exportar-piloto-sintetico.ts --fotos           --cliente <id>… --desde <ISO> --ate <ISO> --cota <n> <pasta-privada>
```

- `--cliente` obrigatório e explícito (a ferramenta nunca escolhe cliente; sem `--cliente` recusa).
- `--desde`/`--ate` obrigatórios, ISO absolutos (`[desde, ate)` em UTC; nada relativo a "hoje" → a mesma entrada no mesmo
  snapshot dá o mesmo manifesto).
- `--cota` só no modo de exportação; teto rígido 20 por cliente (proposta), recusa acima.
- A mesma guarda (`recusaDoExportador`) e UMA transação `READ ONLY`; a guarda roda antes de qualquer conexão.

### 3.2 Consulta (uma só, igual nos dois modos)

Por cliente: `SocialPost` com `projectId = <id>`, `postType = 'STORY'`, `scheduledDatetime ∈ [desde, ate)`; ordem
`scheduledDatetime DESC, id ASC`; junto, as `PostRenderProof` desse post. Nenhuma outra tabela entra no critério; `Generation`
só como metadado auxiliar opcional (tema), nunca como vínculo. A decisão de elegibilidade é tomada em TypeScript pela função pura
(3.3) sobre as linhas lidas — o SQL só filtra por cliente, tipo e janela, para que todo descarte apareça contado.

### 3.3 Elegibilidade — predicado puro, em ordem, primeiro motivo vence

| # | Condição | Exclusão contada como |
|---|---|---|
| E1 | `status ∈ {POSTED, SCHEDULED}` (proposta do adendo; alternativa: só POSTED) | `status-fora` (por status) |
| E2 | `mediaUrls.length === 1` | `midia-multipla-ou-vazia` |
| E3 | `pageId !== null` | `midia-direta-sem-pagina` |
| E4 | existe prova com `mediaUrl === mediaUrls[0]` (igualdade exata de string) | `sem-prova` (nenhuma prova) · `prova-de-outra-midia` (há provas, nenhuma da mídia efetiva) |
| E5 | `layersSnapshot` é array de objetos (aceita string JSON uma vez decodificada; nada além) | `snapshot-ilegivel` |
| E6 | exatamente UMA camada `id === 'bg-foto'`, `type === 'image'`, `visible !== false`, `fileUrl` `https:` | `fundo-ausente` · `fundo-duplicado` · `fundo-oculto-ou-nao-imagem` · `fundo-nao-https` |
| E7 | host do `fileUrl` em `HOSTS_PROPRIOS` | `host-nao-proprio` |
| E8 | classe de origem (3.4) ≠ `render` | `fundo-e-render` (arte dentro de arte) |
| E9 | `fileUrl` (sem query) ainda não selecionado neste cliente | `arquivo-repetido` |

Registrado por elegível: `postId`, `status`, `scheduledDatetime`, `pageId`, `mediaUrl` da prova, `proof.createdAt`,
`proofVersion`, `fileUrl` do fundo, `cropPosition` (valor ou `ausente` — nunca preenchido com padrão), classe de origem, formato
`story` (do `postType`). Quando E6 recusar muito (páginas legadas sem `bg-foto`), isso é DITO na contagem; adotar uma heurística
de fundo é decisão, não código.

### 3.4 Classe de origem — função pura sobre o `pathname` (minúsculas, sem query, sem `..`)

| Prefixo | Classe | "Original"? |
|---|---|---|
| `uploads/` | `upload` | não afirmado em P1 (ver 3.6) |
| `chat-uploads/` | `chat-reduzida` | não (convertida/reduzida) |
| `drive-cache/` | `drive-miniatura` | não (s1920; original no Drive, só com autorização) |
| `posts/<x>/google-drive/` | `drive-convertida` | não |
| `posts/<x>/ai-images/` | `ia` | não se aplica |
| `posts/rendered/` | `render` | — (excluída por E8) |
| `posts/<x>/normalized/` | `normalizada` | não |
| qualquer outro `posts/…` ou prefixo | `desconhecida` | não |

Tabela fechada; prefixo novo cai em `desconhecida`. Cada linha cita, no PR, a rota que a produz.

### 3.5 Contagem (`--contar`)

Zero `fetch`, zero arquivo de pixel. Saída (stdout + JSON opcional): por cliente — lidos, elegíveis, exclusões por motivo (E1–E9),
elegíveis por classe de origem, `cropPosition` ausente/presente; global — `min/max(proof.createdAt)` e `max(SocialPost.updatedAt)`
observados como **marcador do snapshot** (rotulado "estimado pelo dado mais recente do branch"; a idade real é a de
`db:dev:status`, que fica com o owner). **Se não houver nenhuma prova no branch → recusa** com "branch anterior à prova de
render (migração de 12/10/2026)". Também mostra se algum STORY elegível tem mídia em `normalized/` (deveria ser 0; se não for,
o fato vai ao relatório).

### 3.6 Exportação

- Destino: pasta passada por argumento; **recusa se estiver dentro do repositório** fora de `human-output/` (proposta do owner a
  confirmar: pasta fora do repositório; `human-output/` ignorado é a alternativa).
- Seleção: as primeiras `cota` elegíveis na ordem de 3.2 (sem categoria: a ferramenta não sabe o que é produto/ambiente/pessoa —
  a estratificação 4/3/3 do adendo exige marcação humana em P5; ver decisão D4).
- Download só de `fileUrl` elegível: prazo 10 s, teto 25 MB, `content-type image/*`; falha → exclusão `download-falhou`
  (contada; não aborta a leva). Arquivo gravado com nome `cliente-<id>-<n>.<ext>` + SHA-256 no manifesto.
- **Só os bytes desenhados (a).** O "original" (b) fica FORA de P1: nenhuma classe comprova preservação hoje; lê-lo do Drive
  exige autorização própria. O manifesto diz `original: indisponivel` em toda foto.
- Manifesto: args, HEAD do repositório, marcador do snapshot, por foto os campos de 3.3 + SHA-256 + dimensões lidas do arquivo,
  totais e déficits por cliente (`< 6` elegíveis → "cliente fora da leva", dito). Sem pixel no manifesto.

### 3.7 O que P1 NÃO faz

Não lê produção, não escreve em banco, não lê Drive, não cataloga, não marca região, não pseudonimiza foto, não gera fixture,
não roda a rodada, não executa contra o branch de dev (os testes usam linhas falsas). Não muda produção nem política.

### 3.8 Riscos ditos

- A janela real disponível é curta (prova desde 12/10): a cota de 10/cliente pode não fechar — só P2 diz.
- Posts de STORY anteriores ao compositor (sem `bg-foto`) são excluídos por E6, enviesando a amostra para peças do
  compositor; o relatório tem de dizer a proporção.
- `scheduledDatetime` é UTC sem fuso (`reference_horario_do_post_no_banco`): os limites são UTC e assim rotulados.
- O snapshot de dev envelhece; recriar é decisão do owner (P2).

### 3.9 Para P6 (registrado agora, contratado depois)

`exigirMedidaFiel` passa a receber as janelas da foto da peça (hoje lê a fixture única); a peça cuja caixa sai das janelas
continua "não medida" e contada. O estimador, na fixture pseudonimizada, mede "estimador sobre foto pseudonimizada" (adendo § 4).

## 4. Matriz de testes OFFLINE de P1 (sem banco, sem rede)

| # | Alvo | Casos | Espera |
|---|---|---|---|
| T1 | guarda | reaproveita `guarda-do-exportador.test.ts`; + sem `--cliente`; datas ausentes/inválidas/`desde ≥ ate`; `--cota` 0, > 20 | recusa antes de conectar |
| T2 | destino | pasta em `src/`, `docs/`, raiz do repo, `../repo/src` por caminho relativo/symlink; pasta fora | recusa nos 4 primeiros; aceita fora (e `human-output/` conforme D5) |
| T3 | E1–E3 | cada status; `mediaUrls` [] / 2; `pageId` null | motivo exato |
| T4 | E4 | sem prova; prova de outra URL; duas provas, uma casa; URL com query diferente | `sem-prova` / `prova-de-outra-midia` / elegível / `prova-de-outra-midia` (igualdade exata) |
| T5 | E5 | array; string JSON de array; string dupla-codificada; objeto; JSON inválido; `null` | só os dois primeiros elegíveis |
| T6 | E6 | 0 / 2 `bg-foto`; oculta; `type: 'shape'`; `data:`; `http:`; outras imagens sem `bg-foto` (não cai em `imagens[0]`) | motivo exato |
| T7 | E7–E8 | host próprio × alheio × parecido (`blob.vercel-storage.com.evil`); `posts/rendered/` | motivo exato |
| T8 | 3.4 | cada prefixo; maiúsculas; query; `%2e%2e`/`..`; prefixo novo | classe da tabela; desconhecida no resto |
| T9 | E9 + ordem | mesma URL com query diferente; empate de `scheduledDatetime` | repetido; desempate por `id`; mesma entrada → manifesto byte a byte igual (hash) |
| T10 | transação | `tx` falso que registra chamadas | 1ª chamada `SET TRANSACTION READ ONLY`; nenhum SQL com `INSERT/UPDATE/DELETE/ALTER` (lista das strings enviadas) |
| T11 | `--contar` | `fetch` espião | nunca chamado; nenhum arquivo escrito; recusa sem prova no branch |
| T12 | download | 403, timeout, `text/html`, 30 MB, OK | 4 exclusões `download-falhou` contadas; OK com SHA-256 certo |
| T13 | cota/déficit | 3 elegíveis com cota 10; 12 com cota 10 | "cliente fora da leva" (< 6); 10 selecionados + déficit 0 |
| T14 | pureza | `selecao-de-fotos.ts` | não importa `@/lib/db` nem `node:fs`/rede (teste de import, padrão do repo) |

Gates do PR de P1: matriz verde; `npx vitest run` dos arquivos novos; typecheck; lint; `git diff --check`; Codex APTO no HEAD;
CI e Vercel verdes. Sem rodada do piloto (nada nele muda).

## 5. Decisões mínimas pedidas ao owner (em ordem)

| # | Decisão | Proposta | Alternativa |
|---|---|---|---|
| D1 | Autorizar ESCREVER o `--fotos` (P1, só código + testes offline) | sim | não: a etapa representativa fica parada, e com ela o MCP-M0 |
| D2 | Autorizar a CONTAGEM no branch de dev (P2) e recriá-lo se for anterior a 12/10 | sim, depois de P1 na main | export manual do Blob pelo owner (adendo § 4, alternativa) |
| D3 | Status elegíveis | POSTED + SCHEDULED | só POSTED |
| D4 | Estratificação | sem categoria na ferramenta; categoria marcada em P5, sobre-amostra de 2× a cota | sem estratificação |
| D5 | Destino da exportação | fora do repositório | `human-output/` (ignorado) |
| D6 | Fundo sem `bg-foto` | excluído e contado | heurística declarada (`imagens[0]`), rotulada |

Clientes, cota final, pixels versionáveis e destino das fixtures (5.1/5.2) ficam para P3, com os números de P2.

## 6. Revisão do Codex

(preenchida abaixo após a revisão independente)
