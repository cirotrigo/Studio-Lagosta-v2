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
  Drive, `google-drive-download/route.ts:136-145`: o NOME vira `.jpg` e o MIME é declarado `image/jpeg`, mas o `buffer` recebido
  é enviado sem recodificar — bytes preservados pela rota, formato real NÃO comprovado pelo nome); `posts/<user>/ai-images/…`
  (`ai-images-download/route.ts:109-121`, mesmo padrão);
  `uploads/<user>/drive-…` (`api/upload/google-drive`). A camada de fundo do compositor tem `id === 'bg-foto'`
  (`defasagem.ts:214`, que em produção cai para `imagens[0]` quando falta — heurística que este contrato NÃO adota).
- `HOSTS_PROPRIOS` (`src/lib/creatives/ingerir-midia.ts:32-40`) inclui o Blob, `lh3.googleusercontent.com` e `.supabase.co`, e
  `ehHostProprio` testa `url.includes(host)` — serve à pergunta "a arte sobrevive?", **não** a autorizar download. O `--fotos`
  NÃO a usa como validação (3.3 E7).
- Status: `SCHEDULED` é gravado na CRIAÇÃO do post agendado, antes de qualquer envio (`later-scheduler.ts:359-382`); `POSTED` só
  depois do retorno da publicação (`later-scheduler.ts:935-954`). `scheduledDatetime` pode ser nulo (publicação imediata).
- Visibilidade da imagem no render: `drawImage` aplica `style.opacity` como `globalAlpha` (`render-engine.ts:1515-1528`) — uma
  camada com `opacity: 0` está no snapshot e não deixa pixel.
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

Por cliente: `SocialPost` com `projectId = <id>`, `postType = 'STORY'`, `createdAt < ate` (um post não é publicado antes de
existir); junto, as `PostRenderProof` desse post. Nenhuma outra tabela entra no critério; `Generation` só como metadado auxiliar
opcional (tema), nunca como vínculo. Janela, status e todo o resto são decididos em TypeScript pela função pura (3.3) sobre as
linhas lidas — o SQL não filtra por janela nem por status, para que todo descarte apareça contado.

**Data de referência** por população: **publicados** (a amostra principal) — `latePublishedAt ?? sentAt` (o campo usado fica
registrado); **agendados** (população SEPARADA, só se o owner pedir, D3) — `scheduledDatetime`. Ordem: data de referência DESC,
`id` ASC.

### 3.3 Elegibilidade — predicado puro, em ordem, primeiro motivo vence

| # | Condição | Exclusão contada como |
|---|---|---|
| E1 | população publicados: `status === 'POSTED'`; população agendados (opcional, separada): `status === 'SCHEDULED'`. Uma peça nunca está nas duas, e o relatório nunca soma as duas | `status-fora` (por status) |
| E1b | data de referência (3.2) existe e está em `[desde, ate)` | `sem-data-de-referencia` · `fora-da-janela` |
| E2 | `mediaUrls.length === 1` | `midia-multipla-ou-vazia` |
| E3 | `pageId !== null` | `midia-direta-sem-pagina` |
| E4 | existe prova com `mediaUrl === mediaUrls[0]` (igualdade exata de string) | `sem-prova` (nenhuma prova) · `prova-de-outra-midia` (há provas, nenhuma da mídia efetiva) |
| E5 | `layersSnapshot` é array de objetos (aceita string JSON uma vez decodificada; nada além) | `snapshot-ilegivel` |
| E6 | exatamente UMA camada `id === 'bg-foto'`, `type === 'image'`, `fileUrl` `https:` | `fundo-ausente` · `fundo-duplicado` · `fundo-nao-imagem` · `fundo-nao-https` |
| E6b | contribuição visual NÃO trivialmente nula, avaliada só no caso SIMPLES: `visible !== false`; `style.opacity` ausente ou número finito > 0; `size` com largura e altura > 0; `rotation` ausente ou 0; sem `style.mask`; `Page.width × Page.height` atuais = 1080 × 1920 (o snapshot não traz o canvas); caixa (`position`/`size`) intersecta 1080 × 1920 com área > 0. Rotação ≠ 0, máscara, dimensões da página diferentes ou campo de transformação não previsto → a P1 NÃO avalia: exclusão, nunca aceite | `fundo-invisivel` (oculto / opacidade 0 / sem área / fora do canvas) · `fundo-nao-avaliavel` (rotação / máscara / dimensões da página / transformação desconhecida) |
| E7 | URL de download segura: `URL` parseável; protocolo `https:`; sem usuário/senha nem porta; `hostname` (minúsculas) IGUAL a um item da lista FECHADA `STORES_DO_STUDIO` — constante revisada no PR (proposta: `2rhsgfleozgl5jbm.public.blob.vercel-storage.com`, o store atual, citado em `scripts/recover-blob-files.ts:5`), confirmada pelo owner em D7; nunca sufixo, nunca `includes`, nunca os outros hosts de `HOSTS_PROPRIOS` | `host-nao-autorizado` |
| E8 | classe de origem (3.4) ≠ `render` | `fundo-e-render` (arte dentro de arte) |
| E9 | `fileUrl` (sem query) ainda não selecionado neste cliente | `arquivo-repetido` |

**O que E1–E9 provam, e o que não**: a foto é a camada de fundo REFERENCIADA nas camadas que produziram a mídia efetiva do post
publicado, com opacidade, área e posição que não a anulam. Não provam que ela ficou VISÍVEL na arte final: uma camada opaca
acima pode cobri-la (é a lacuna de oclusão, § 4.3 do plano-mestre). O manifesto rotula toda foto como "fundo referenciado no
render, não anulado" e registra, sem decidir, quantas camadas de `order` maior intersectam a caixa do fundo.

Registrado por elegível: `postId`, `status`, data de referência e o campo de onde veio, `pageId`, `mediaUrl` da prova, `proof.createdAt`,
`proofVersion`, `fileUrl` do fundo, `cropPosition` (valor ou `ausente` — nunca preenchido com padrão), classe de origem, formato
`story` (do `postType`). Quando E6 recusar muito (páginas legadas sem `bg-foto`), isso é DITO na contagem; adotar uma heurística
de fundo é decisão, não código.

### 3.4 Classe de origem — função pura sobre o `pathname` (minúsculas, sem query, sem `..`)

| Prefixo | Classe | "Original"? |
|---|---|---|
| `uploads/` | `upload` | não afirmado em P1 (ver 3.6) |
| `chat-uploads/` | `chat-reduzida` | não (convertida/reduzida) |
| `drive-cache/` | `drive-miniatura` | não (s1920; original no Drive, só com autorização) |
| `posts/<x>/google-drive/` | `drive-download` (bytes enviados sem recodificar pela rota; nome `.jpg` e MIME declarados — formato real só pelo cabeçalho do arquivo, registrado à parte) | não afirmado: o arquivo do Drive pode já ser derivado; "original" exige comparar com o Drive (fora da P1) |
| `posts/<x>/ai-images/` | `ia-download` (mesmo padrão) | não se aplica |
| `posts/rendered/` | `render` | — (excluída por E8) |
| `posts/<x>/normalized/` | `normalizada` | não |
| qualquer outro `posts/…` ou prefixo | `desconhecida` | não |

Tabela fechada; prefixo novo cai em `desconhecida`. Cada linha cita, no PR, a rota que a produz. Por foto o manifesto registra
SEPARADOS: (i) a classe; (ii) nome/MIME declarados; (iii) o formato e as dimensões lidos do próprio arquivo baixado; (iv) a
transformação de pixels COMPROVADA pelo código da rota (hoje: só `chat-uploads/` e `drive-cache/`; nas outras, "nenhuma
comprovada", o que não é o mesmo que "original").

### 3.5 Contagem (`--contar`)

Zero `fetch`, zero arquivo de pixel. Saída (stdout + JSON opcional): por cliente — lidos, elegíveis, exclusões por motivo (E1–E9),
elegíveis por classe de origem, `cropPosition` ausente/presente; global — `min/max(proof.createdAt)` e `max(SocialPost.updatedAt)`
observados como **marcador do snapshot** (rotulado "estimado pelo dado mais recente do branch"; a idade real é a de
`db:dev:status`, que fica com o owner). Dois casos distintos, nunca confundidos: **(i) a contagem não pode rodar** → recusa,
dizendo QUAL sinal falhou, separados — `tabela PostRenderProof ausente` e/ou `migração 20261012120000_post_render_proof não
registrada em _prisma_migrations` — com causa "indeterminada" (nenhum dos dois data o branch); **(ii) a tabela existe e a SELEÇÃO não tem prova** → não recusa, reporta "nenhuma prova nesta seleção" com o
total de provas do branch inteiro (só `COUNT` e `min/max(createdAt)`, sem ler linhas) para o owner julgar — sem atribuir a causa à
idade do branch. Também mostra se algum STORY elegível tem mídia em `normalized/` (deveria ser 0; se não for,
o fato vai ao relatório).

### 3.6 Exportação

- Destino: pasta passada por argumento; **recusa se estiver dentro do repositório** fora de `human-output/` (proposta do owner a
  confirmar: pasta fora do repositório; `human-output/` ignorado é a alternativa).
- Seleção com REPOSIÇÃO determinística: percorre os elegíveis na ordem de 3.2 e baixa até ter `cota` arquivos EXPORTADOS; cada
  falha (`download-falhou`, com o subcódigo) é contada e o próximo elegível entra no lugar; acabaram os elegíveis → déficit. Cota,
  déficit e "cliente fora da leva" (`< 6`) são calculados sobre os arquivos **efetivamente exportados**, nunca sobre elegíveis.
  Sem categoria: a ferramenta não sabe o que é produto/ambiente/pessoa — a estratificação 4/3/3 do adendo exige marcação humana
  em P5 (decisão D4).
- Download só de URL que passou em E7: `redirect: 'manual'`; cada redirecionamento é revalidado por E7 antes de seguir (até 3;
  destino fora → `download-falhou:redirecionamento-nao-autorizado`); prazo 10 s; teto 25 MB lido em fluxo (aborta ao passar, não
  confia em `content-length`); `content-type image/*` E assinatura do arquivo (PNG/JPEG/WebP) conferida nos bytes. Arquivo gravado
  como `cliente-<id>-<n>.<ext da assinatura>` + SHA-256 no manifesto.
- **Só os bytes desenhados (a).** O "original" (b) fica FORA de P1: nenhuma classe comprova preservação hoje; lê-lo do Drive
  exige autorização própria. O manifesto diz `original: indisponivel` em toda foto.
- Manifesto: args, HEAD do repositório, marcador do snapshot, por foto os campos de 3.3 + SHA-256 + dimensões lidas do arquivo,
  totais (lidos, elegíveis, tentados, exportados) e déficits por cliente. Sem pixel no manifesto.

### 3.7 O que P1 NÃO faz

Não lê produção, não escreve em banco, não lê Drive, não cataloga, não marca região, não pseudonimiza foto, não gera fixture,
não roda a rodada, não executa contra o branch de dev (os testes usam linhas falsas). Não muda produção nem política.

### 3.8 Riscos ditos

- A janela real disponível é curta (prova desde 12/10): a cota de 10/cliente pode não fechar — só P2 diz.
- Posts de STORY anteriores ao compositor (sem `bg-foto`) são excluídos por E6, enviesando a amostra para peças do
  compositor; o relatório tem de dizer a proporção.
- As datas do post são gravadas em UTC sem fuso: os limites `--desde`/`--ate` são UTC e assim rotulados.
- E7 restringe a P1 aos stores listados em `STORES_DO_STUDIO`: fundos servidos pelo Drive ou pelo Supabase saem como `host-nao-autorizado` (contados);
  incluí-los é decisão, com regra de host própria.
- O snapshot de dev envelhece; recriar é decisão do owner (P2).

### 3.9 Para P6 (registrado agora, contratado depois)

`exigirMedidaFiel` passa a receber as janelas da foto da peça (hoje lê a fixture única); a peça cuja caixa sai das janelas
continua "não medida" e contada. O estimador, na fixture pseudonimizada, mede "estimador sobre foto pseudonimizada" (adendo § 4).

## 4. Matriz de testes OFFLINE de P1 (sem banco, sem rede)

| # | Alvo | Casos | Espera |
|---|---|---|---|
| T1 | guarda | reaproveita `guarda-do-exportador.test.ts`; + sem `--cliente`; datas ausentes/inválidas/`desde ≥ ate`; `--cota` 0, > 20 | recusa antes de conectar |
| T2 | destino | pasta em `src/`, `docs/`, raiz do repo, `../repo/src` por caminho relativo/symlink; pasta fora | recusa nos 4 primeiros; aceita fora (e `human-output/` conforme D5) |
| T3 | E1–E3 | cada status nas duas populações (SCHEDULED nunca entra em publicados; nada aparece nas duas); `latePublishedAt` presente / só `sentAt` / ambos nulos; limites `desde` (entra) e `ate` (sai); `scheduledDatetime` nulo num POSTED (elegível); `mediaUrls` [] / 2; `pageId` null | motivo exato; campo de referência registrado |
| T4 | E4 | sem prova; prova de outra URL; duas provas, uma casa; URL com query diferente | `sem-prova` / `prova-de-outra-midia` / elegível / `prova-de-outra-midia` (igualdade exata) |
| T5 | E5 | array; string JSON de array; string dupla-codificada; objeto; JSON inválido; `null` | só os dois primeiros elegíveis |
| T6 | E6–E6b | 0 / 2 `bg-foto`; `type: 'shape'`; `data:`; `http:`; outras imagens sem `bg-foto` (não cai em `imagens[0]`); oculta; `style.opacity` 0 / −1 / `NaN` / `'0'` (string) / 0,01; `size` 0 × N; caixa inteira fora do canvas; caixa parcialmente dentro; camada opaca acima cobrindo o fundo; `rotation` 45 com a caixa dentro antes de girar e fora depois; `rotation` 0 explícito; `style.mask` presente; `Page` 1080 × 1350; campo de transformação desconhecido | motivo exato; 0,01, parcial e `rotation` 0 elegíveis; rotação ≠ 0, máscara, página ≠ story e campo desconhecido → `fundo-nao-avaliavel`; "coberta" elegível com a contagem de camadas acima registrada (não decide) |
| T7 | E7–E8 | o host de `STORES_DO_STUDIO` (ok); OUTRO store válido da Vercel (`abcdefghijklmnop.public.blob.vercel-storage.com`); o store antigo `sqc9qfyearji7bel`; `a.b.public.blob.vercel-storage.com`; `public.blob.vercel-storage.com.evil.com`; `evil.com/?x=.public.blob.vercel-storage.com`; `lh3.googleusercontent.com`; `x.supabase.co`; `user@host`; porta; maiúsculas no host; `posts/rendered/` | só o host listado (e a variante em maiúsculas) autorizado; motivos exatos |
| T8 | 3.4 | cada prefixo; maiúsculas; query; `%2e%2e`/`..`; prefixo novo | classe da tabela; desconhecida no resto |
| T9 | E9 + ordem | mesma URL com query diferente; empate da data de referência | repetido; desempate por `id`; mesma entrada → manifesto byte a byte igual (hash) |
| T10 | transação | `tx` falso que registra chamadas | 1ª chamada `SET TRANSACTION READ ONLY`; nenhum SQL com `INSERT/UPDATE/DELETE/ALTER` (lista das strings enviadas) |
| T11 | `--contar` | `fetch` espião; tabela ausente; migração não registrada com tabela presente; os dois; tabela com provas fora da seleção | `fetch` nunca chamado; nenhum arquivo escrito; recusa nos três primeiros, com o(s) sinal(is) exatos e causa "indeterminada"; no segundo, "nenhuma prova nesta seleção" + `COUNT` global |
| T12 | download | 403, timeout, `text/html` com status 200, bytes que não são imagem com `image/png`, 30 MB sem `content-length`, redirecionamento para host autorizado, para host alheio, cadeia de 4; OK | exclusões `download-falhou:<subcódigo>` contadas; redirecionamento autorizado segue; OK com SHA-256 certo e extensão pela assinatura |
| T13 | cota/déficit/reposição | 3 elegíveis com cota 10; 12 elegíveis com cota 10 e 2 falhas; 7 elegíveis com 2 falhas e cota 10 | fora da leva (< 6 exportados); 10 exportados com os 2 reservas seguintes no lugar, na ordem; 5 exportados → fora da leva, déficit 5 |
| T14 | pureza | `selecao-de-fotos.ts` | não importa `@/lib/db` nem `node:fs`/rede (teste de import, padrão do repo) |

Gates do PR de P1: matriz verde; `npx vitest run` dos arquivos novos; typecheck; lint; `git diff --check`; Codex APTO no HEAD;
CI e Vercel verdes. Sem rodada do piloto (nada nele muda).

## 5. Decisões mínimas pedidas ao owner (em ordem)

| # | Decisão | Proposta | Alternativa |
|---|---|---|---|
| D1 | Autorizar ESCREVER o `--fotos` (P1, só código + testes offline) | sim | não: a etapa representativa fica parada, e com ela o MCP-M0 |
| D2 | Autorizar a CONTAGEM no branch de dev (P2) e recriá-lo se for anterior a 12/10 | sim, depois de P1 na main | export manual do Blob pelo owner (adendo § 4, alternativa) |
| D3 | Populações | só PUBLICADOS (`POSTED`, janela por `latePublishedAt ?? sentAt`) | + agendados (`SCHEDULED`) como população SEPARADA, nunca somada |
| D4 | Estratificação | sem categoria na ferramenta; categoria marcada em P5, sobre-amostra de 2× a cota | sem estratificação |
| D5 | Destino da exportação | fora do repositório | `human-output/` (ignorado) |
| D6 | Fundo sem `bg-foto` | excluído e contado | heurística declarada (`imagens[0]`), rotulada |
| D7 | Stores do Blob autorizados para download (`STORES_DO_STUDIO`) | só o store atual | incluir outro store do Studio, citado por você |

Clientes, cota final, pixels versionáveis e destino das fixtures (5.1/5.2) ficam para P3, com os números de P2.

## 6. Revisão do Codex

- **R1 (HEAD b4a7974e, `gpt-6-sol`) — NÃO APTO**, 3 BLOQUEADORES e 3 MAIORES, todos conferidos no código e corrigidos:
  (1) "publicado" incluía `SCHEDULED` e a janela usava `scheduledDatetime` (nulo em publicação imediata) → só `POSTED` na amostra,
  janela por `latePublishedAt ?? sentAt`, agendados como população separada (E1/E1b, D3); (2) E6 não provava contribuição visual
  (`style.opacity: 0` fica no snapshot) → E6b + rótulo "referenciado, não anulado" e a oclusão por camada acima dita, não
  decidida; (3) `HOSTS_PROPRIOS`/`includes` não valida download → E7 por hostname exato do Blob e redirecionamento revalidado;
  (4) `drive-convertida` afirmava transformação que a rota não faz → `drive-download`, com nome/MIME declarados × formato lido ×
  transformação comprovada registrados à parte; (5) "nenhuma prova" na seleção ≠ branch anterior à migração → dois casos
  distintos; (6) cota calculada sobre elegíveis → reposição determinística e cota/déficit sobre exportados. Matriz T3, T6, T7,
  T11, T12, T13 ampliada.
- **R2 (HEAD c29453ce) — NÃO APTO**: R1 1, 4 e 6 resolvidos; 2, 3 e 5 parciais → corrigidos: (1) E6b não considerava rotação,
  máscara nem as dimensões da página (`render-engine.ts:189-208, 1657-1669`; `story-renderer.ts:138-143`) → a P1 só avalia o
  caso simples e exclui o resto como `fundo-nao-avaliavel`; (2) E7 aceitava qualquer store da Vercel → lista fechada
  `STORES_DO_STUDIO` (D7) e teste com outro store recusado; (3) tabela ausente e migração não registrada relatadas
  separadamente, causa indeterminada.
