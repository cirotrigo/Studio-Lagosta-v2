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
| CP5a veredito puro | § CP5a; contrato CP5A | aprovado para implementação pelo owner (16/10): 9.2 e 9.4–9.7 adotadas; 9.1 (caso B) segue proposta (ver 1.3) |
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

### 1.3 Decisões do owner: o que já foi ADOTADO e o que segue PROPOSTA

**Adotadas pelo owner** (não reabrir): CP4.2 (contrato "aprovado pelo owner"); CP5a — aprovado para implementação em 16/10
(`PLANO-2026-10-15-CP5A-CONTRATO.md:3`; `revisor-da-arte.md:831`): oclusão (B) conservadora (9.2), copy sem contrato exige
humano (9.4), ausência de logo solta = aviso (9.5), `texto-pequeno` crítica (9.6), tolerância texto × texto = a de `colisao`
(9.7), e a política do assunto como parâmetro OBRIGATÓRIO; caso C do assunto = humano (17/10).

**Seguem PROPOSTA nomeada** (implementadas como recomendação, trocáveis numa constante, nenhuma aprovada): caso B
`estimado: 'humano'` (9.1 do CP5a, ainda no valor de `POLITICA_DO_ASSUNTO_RECOMENDADA`); CP5b § 9 "Decisões pendentes do owner"
(9.1–9.13, entre elas `rulesVersion` por bump manual cobrado por impressão digital e validador — hash do fonte descartado, CP5b § 5 — = decisão 7 do plano); CP5c § 8 (8.1–8.9, entre elas efeitos pós-commit que NÃO
rodam no draft-only); CP5d § 8 (8.1–8.8, entre elas P1 "só grava versão APTA"); CP5e § 5 (5.1–5.5). Do piloto e do adendo: B, 2
(janelas), 3 (assinatura real × piso), T1a (92 px × margem 96), H, estimador, 5.1/5.2/5.3. Do plano-mestre: 4, 5 e 6.

Nenhuma das propostas bloqueia a preparação técnica abaixo.

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
| P3 | Decisões 5.1/5.2 e D8 com os números de P2: clientes, candidatos e cota final, janela de datas, pixels versionáveis, destino | P2 | **sim** (são as decisões) | registro escrito das escolhas no plano |
| P4 | **Exportação** (`--fotos` sem `--contar`) para pasta privada fora do repositório | P3 | **sim** | manifesto com SHA-256 por arquivo; exclusões contadas; nada no repositório |
| P5 | Marcação humana (região protegida, categoria, difusa/forte) | P4 | **sim** (quem marca; custo ~1 h/cliente) | arquivo de marcação por foto, versionado só se P3 permitir |
| P6 | Fixtures ("representativas" só com D8 decidida) + generalizar `exigirMedidaFiel` por foto (§ 3.9) + rodada | P5 | contrato próprio + Codex | resumo versionado; falso APTO = 0; repetibilidade 100 %; NÃO MEDIDAS contadas |
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
  é enviado sem recodificar; MAS `projects/[projectId]/google-drive/download/route.ts:110-149` grava no MESMO prefixo depois de tentar recortar para 4:5 (e, se o recorte falhar, envia os bytes recebidos) — pelo pathname não se distingue um fluxo do outro); `posts/<user>/ai-images/…`
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
exportar-piloto-sintetico.ts --fotos           --cliente <id>… --desde <ISO> --ate <ISO> --candidatos <n> <pasta-privada>
```

- `--cliente` obrigatório e explícito (a ferramenta nunca escolhe cliente; sem `--cliente` recusa).
- `--desde`/`--ate` obrigatórios, ISO absolutos (`[desde, ate)` em UTC; nada relativo a "hoje" → a mesma entrada no mesmo
  snapshot dá o mesmo manifesto).
- `--candidatos` só no modo de exportação: quantos arquivos EXPORTAR por cliente (proposta: 2× a cota final, para P5 classificar e
  escolher; teto rígido 20, recusa acima). A **cota final** da leva (proposta 10, estratificada 4/3/3) NÃO é parâmetro da
  ferramenta: é aplicada em P5, sobre os candidatos já classificados por pessoa.
- A mesma guarda (`recusaDoExportador`) e UMA transação `READ ONLY`; a guarda roda antes de qualquer conexão.

### 3.2 Consulta (uma só, igual nos dois modos)

Por cliente: `SocialPost` com `projectId = <id>`, `postType = 'STORY'`, `createdAt < ate` (um post não é publicado antes de
existir); junto, as `PostRenderProof` desse post. Nenhuma outra tabela entra no critério (a `Page` atual inclusive: só o `pageId` do post é lido); `Generation` só como metadado auxiliar
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
| E4 | existe prova com `mediaUrl === mediaUrls[0]` (igualdade exata de string) e, na população publicados, `proof.createdAt` ≤ data de publicação (3.2); nos agendados não há data de publicação e a condição não se aplica | `sem-prova` (nenhuma prova) · `prova-de-outra-midia` (há provas, nenhuma da mídia registrada) · `prova-posterior-a-publicacao` |
| E5 | `layersSnapshot` é array de objetos (aceita string JSON uma vez decodificada; nada além) | `snapshot-ilegivel` |
| E6 | exatamente UMA camada `id === 'bg-foto'`, `type === 'image'`, `fileUrl` `https:` | `fundo-ausente` · `fundo-duplicado` · `fundo-nao-imagem` · `fundo-nao-https` |
| E6b | contribuição visual NÃO trivialmente nula, avaliada só no caso SIMPLES: `visible !== false`; `style.opacity` ausente ou número finito > 0; `size` com largura e altura > 0; `rotation` ausente ou 0; `style` contém SÓ chaves da lista fechada do caso simples (`opacity`, `objectFit`, `cropPosition`, `flipH`, `flipV`) — qualquer outra (`filter`, `mask`, ajustes de imagem, sombra, borda…) pode alterar ou anular pixels (`render-engine.ts:1530` aplica `style.filter` antes de desenhar) e a P1 não a avalia; dimensões do canvas DO RENDER comprovadas pelo cabeçalho PNG (IHDR) da própria mídia da prova (`proof.mediaUrl`, lida só nos primeiros 64 bytes, com as regras de E7) = 1080 × 1920 — a `Page` atual NUNCA entra (pode ter mudado depois do render); caixa (`position`/`size`) intersecta 1080 × 1920 com área > 0. Rotação ≠ 0, máscara, mídia que não é PNG, IHDR ilegível, dimensões ≠ 1080 × 1920 ou campo de transformação não previsto → a P1 NÃO avalia: exclusão, nunca aceite. Na `--contar` (sem rede) a dimensão não é lida: os elegíveis da contagem são TETO, rotulados "canvas não comprovado" | `fundo-invisivel` (oculto / opacidade 0 / sem área / fora do canvas) · `fundo-nao-avaliavel` (rotação / chave de `style` fora da lista / canvas do render não comprovado ou ≠ story / transformação desconhecida) |
| E7 | URL de download segura: `URL` parseável; protocolo `https:`; sem usuário/senha nem porta; `hostname` (minúsculas) IGUAL a um item da lista FECHADA `STORES_DO_STUDIO` — constante revisada no PR (proposta: `2rhsgfleozgl5jbm.public.blob.vercel-storage.com`, o store atual, citado em `scripts/recover-blob-files.ts:5`), confirmada pelo owner em D7; nunca sufixo, nunca `includes`, nunca os outros hosts de `HOSTS_PROPRIOS` | `host-nao-autorizado` |
| E8 | classe de origem (3.4) ≠ `render` | `fundo-e-render` (arte dentro de arte) |
| E8b | identidade histórica dos bytes: (i) o pathname NÃO casa o padrão de nenhum escritor que sobrescreve — inventário FECHADO de todo `allowOverwrite: true` do repositório (`src/` E `scripts/`; hoje: `creatives/persist.ts:174` `drive-cache/`, `creatives/chat-upload.ts:128` `chat-uploads/`, `templates/miniatura.ts:55`, `api/templates/generate-thumbnail/route.ts:69`, `scripts/compor-leva-setembro.ts:50` — grava a foto da spec em caminho estável e sobrescreve quando o `head` falha —, `scripts/importar-brand-manuais.ts:102`, `scripts/miniaturas-para-blob.ts:101`, `scripts/reparar-lh3-legado.ts:269`), mantido por teste no PR que falha quando surgir outro; o inventário só enxerga o código da main — script de outro branch ou já apagado que tenha sobrescrito não é visto, e isso é dito no manifesto ("imutabilidade inferida do código da main, não provada por hash"); e (ii) a condição da nota de imutabilidade (padrão do Blob desde 12/10) comprovada. Escritor de caminho livre (`generations/konva-export/route.ts:159`, `fileName` do corpo) grava com `addRandomSuffix: true` — cria caminho novo, não sobrescreve. A prova não guarda hash dos bytes de origem, por isso sem (i) e (ii) não há identidade | `origem-sobrescrevivel` · `imutabilidade-nao-comprovada` |
| E9 | `fileUrl` (sem query) ainda não selecionado neste cliente | `arquivo-repetido` |

**O que E1–E9 provam, e o que não**: a foto é a camada de fundo REFERENCIADA nas camadas que produziram a mídia REGISTRADA HOJE
no banco para um post marcado `POSTED`, com opacidade, área e posição que não a anulam. **Não provam que essa mídia é a que o
publicador tem**: a rota PUT do post legado pode trocar `mediaUrls` e preservar a troca local quando a sincronização falha
(`api/projects/[projectId]/posts/[postId]/route.ts:207, 413`) — publicar A, trocar para B, voltar a A sem sincronizar faz E4
casar com a prova de A. A P1 não lê o publicador; o manifesto rotula toda seleção "mídia registrada no banco, não conferida
contra o publicador". Também não provam que ela ficou VISÍVEL na arte final: uma camada opaca
acima pode cobri-la (é a lacuna de oclusão, § 4.3 do plano-mestre). O manifesto rotula toda foto como "fundo referenciado no
render, não anulado" e registra, sem decidir, quantas camadas de `order` maior intersectam a caixa do fundo.

Registrado por elegível: `postId`, `status`, data de referência e o campo de onde veio, `pageId`, `mediaUrl` da prova, `proof.createdAt`,
`proofVersion`, `fileUrl` do fundo, `cropPosition` (valor ou `ausente` — nunca preenchido com padrão), classe de origem, formato
`story` (do `postType`). Quando E6 recusar muito (páginas legadas sem `bg-foto`), isso é DITO na contagem; adotar uma heurística
de fundo é decisão, não código.

### 3.4 Classe de origem — função pura sobre o `pathname` (minúsculas, sem query, sem `..`)

| Prefixo | Classe (INDÍCIO pelo prefixo) | "Original"? | Escritor conhecido (indício; quem decide é E8b) |
|---|---|---|---|
| `uploads/` | `upload` | não afirmado em P1 (ver 3.6) | a confirmar no PR: `put` sem `allowOverwrite` (`api/upload/google-drive/route.ts:65`) — o PR cita o padrão da versão instalada de `@vercel/blob`; até lá `imutabilidade-nao-comprovada` |
| `chat-uploads/` | `chat-reduzida` | não (INDÍCIO de conversão/redução pela rota conhecida) | **não**: `addRandomSuffix: false` + `allowOverwrite: true` (`chat-upload.ts:127-128`) → excluída por E8b |
| `drive-cache/` | `drive-miniatura` | não (INDÍCIO de miniatura s1920 pela rota conhecida; original no Drive, só com autorização) | **não**: `allowOverwrite: true` (`persist.ts:173-174`) → excluída por E8b |
| `posts/<x>/google-drive/` | `drive-download` (DUAS rotas no mesmo prefixo: uma envia os bytes recebidos, outra tenta recortar para 4:5; nome `.jpg` e MIME declarados) | não | sim (`addRandomSuffix: true` nas duas rotas: `google-drive-download/route.ts:143`, `projects/[projectId]/google-drive/download/route.ts:149`) |
| `posts/<x>/ai-images/` | `ia-download` (mesmo padrão) | não se aplica | sim (`addRandomSuffix: true`, `ai-images-download/route.ts:119`) |
| `posts/rendered/` | `render` | — (excluída por E8) | (vale para a MÍDIA da prova em E6b: ver nota abaixo) |
| `posts/<x>/normalized/` | `normalizada` | não | sim (`addRandomSuffix: true`, `later-scheduler.ts`) |
| qualquer outro `posts/…` ou prefixo | `desconhecida` | não | não comprovada |

**Nota de imutabilidade (vale para TODA classe em E8b e para a mídia `posts/rendered/` lida em E6b)**: as duas rotas chamam `put` sem
`allowOverwrite` (`api/upload/google-drive/route.ts:65`, `story-renderer.ts:148`); na versão instalada (`@vercel/blob` 2.0.0) o
padrão documentado é ERRO ao reusar o pathname (declaração do pacote instalado no checkout de trabalho, `dist/index.d.ts`, a
conferir e anexar no PR de P1 — o `package-lock.json` só registra a versão), e o pathname leva timestamp. Isso só prova para arquivos gravados com uma versão de mesmo padrão: o PR de P1 tem de mostrar, pelo histórico do `package-lock.json`,
qual versão estava em produção desde 12/10/2026 (início das provas) e que o padrão era o mesmo; enquanto isso não estiver
comprovado, todo fundo fica `imutabilidade-nao-comprovada` e o canvas de E6b fica `fundo-nao-avaliavel`.

Tabela fechada; prefixo novo cai em `desconhecida`. **O prefixo é INDÍCIO, não proveniência**: há escritor de caminho livre
(`konva-export`, `fileName` arbitrário), então nenhum pathname prova qual rota o gravou nem o que ela fez com os pixels. Cada linha
cita, no PR, as rotas CONHECIDAS que escrevem ali. Por foto o manifesto registra
SEPARADOS: (i) a classe; (ii) nome/MIME declarados; (iii) o formato e as dimensões lidos do próprio arquivo baixado; (iv) a
transformação de pixels INDICADA pelo prefixo (`indicio`: reduzida, miniatura, recorte possível, normalizada, nenhuma
conhecida), sempre rotulada como indício — nada no manifesto diz "comprovada" nem "preservada", e nenhuma foto é chamada de
"original". Afirmação forte exigiria proveniência fora do pathname (ex.: registro da ingestão ligado à URL), que a P1 não lê.

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
- Seleção com REPOSIÇÃO determinística: percorre os elegíveis na ordem de 3.2 e baixa até ter `candidatos` arquivos EXPORTADOS; cada
  falha (`download-falhou`, com o subcódigo) é contada e o próximo elegível entra no lugar; acabaram os elegíveis → déficit de
  candidatos. Na ferramenta: déficit de candidatos e "cliente fora da leva" (`< 6` exportados) sobre os arquivos **efetivamente
  exportados**, nunca sobre elegíveis. Em P5 (fora da ferramenta): cota final e déficit por categoria sobre os candidatos
  CLASSIFICADOS, com o mesmo corte `< 6` aplicado de novo aos aproveitáveis.
  Sem categoria: a ferramenta não sabe o que é produto/ambiente/pessoa — a estratificação 4/3/3 do adendo exige marcação humana
  em P5 (decisão D4).
- Download só de URL que passou em E7: `redirect: 'manual'`; cada redirecionamento é revalidado por E7 antes de seguir (até 3;
  destino fora → `download-falhou:redirecionamento-nao-autorizado`); prazo 10 s; teto 25 MB lido em fluxo (aborta ao passar, não
  confia em `content-length`); `content-type image/*` E assinatura do arquivo (PNG/JPEG/WebP) conferida nos bytes. Arquivo gravado
  como `cliente-<id>-<n>.<ext da assinatura>` + SHA-256 no manifesto.
- **Só os bytes HOJE na URL do fundo referenciado no render da mídia registrada (a)** — não "os bytes publicados" (3.3, D8). O "original" (b) fica FORA de P1: nenhuma classe comprova preservação hoje; lê-lo do Drive
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
- E8b pode excluir a MAIOR parte da amostra: os padrões `drive-cache/` (onde a rota conhecida `persist.ts` publica a cópia das
  fotos do Drive) e `chat-uploads/` têm escritor que sobrescreve. Se P2 mostrar isso, a saída honesta é uma decisão (aceitar origem sobrescrevível
  ROTULADA "bytes de hoje, não necessariamente os do render", ou uma prova futura com hash dos bytes) — não afrouxar o critério.
- E7 restringe a P1 aos stores listados em `STORES_DO_STUDIO`: fundos servidos pelo Drive ou pelo Supabase saem como `host-nao-autorizado` (contados);
  incluí-los é decisão, com regra de host própria.
- O snapshot de dev envelhece; recriar é decisão do owner (P2).

### 3.9 Para P6 (registrado agora, contratado depois)

`exigirMedidaFiel` passa a receber as janelas da foto da peça (hoje lê a fixture única); a peça cuja caixa sai das janelas
continua "não medida" e contada. O estimador, na fixture pseudonimizada, mede "estimador sobre foto pseudonimizada" (adendo § 4).

## 4. Matriz de testes OFFLINE de P1 (sem banco, sem rede)

| # | Alvo | Casos | Espera |
|---|---|---|---|
| T1 | guarda | reaproveita `guarda-do-exportador.test.ts`; + sem `--cliente`; datas ausentes/inválidas/`desde ≥ ate`; `--candidatos` 0, > 20; `--cota` (inexistente) recusado | recusa antes de conectar |
| T2 | destino | pasta em `src/`, `docs/`, raiz do repo, `../repo/src` por caminho relativo/symlink; pasta fora | recusa nos 4 primeiros; aceita fora (e `human-output/` conforme D5) |
| T3 | E1–E3 | cada status nas duas populações (SCHEDULED nunca entra em publicados; nada aparece nas duas); `latePublishedAt` presente / só `sentAt` / ambos nulos; limites `desde` (entra) e `ate` (sai); `scheduledDatetime` nulo num POSTED (elegível); `mediaUrls` [] / 2; `pageId` null | motivo exato; campo de referência registrado |
| T4 | E4 | sem prova; prova de outra URL; duas provas, uma casa; URL com query diferente | `sem-prova` / `prova-de-outra-midia` / elegível / `prova-de-outra-midia` (igualdade exata) |
| T4b | E4 × publicador | prova de A antes da publicação; mídia trocada para B e de volta para A localmente; prova criada DEPOIS de `latePublishedAt` | o primeiro e o segundo elegíveis com o rótulo "não conferida contra o publicador" (o segundo é o limite dito); o terceiro `prova-posterior-a-publicacao` |
| T5 | E5 | array; string JSON de array; string dupla-codificada; objeto; JSON inválido; `null` | só os dois primeiros elegíveis |
| T6 | E6–E6b | 0 / 2 `bg-foto`; `type: 'shape'`; `data:`; `http:`; outras imagens sem `bg-foto` (não cai em `imagens[0]`); oculta; `style.opacity` 0 / −1 / `NaN` / `'0'` (string) / 0,01; `size` 0 × N; caixa inteira fora do canvas; caixa parcialmente dentro; camada opaca acima cobrindo o fundo; `rotation` 45 com a caixa dentro antes de girar e fora depois; `rotation` 0 explícito; `style.mask` presente; `style.filter: 'opacity(0)'` com `style.opacity` 1; `style.filter: 'none'`; `style.brightness` presente; `style` vazio; IHDR da mídia 1080 × 1350 com a caixa em y 1500 (página alterada depois para 1920: a `Page` atual não é lida); mídia JPEG; IHDR truncado; campo de transformação desconhecido | motivo exato; 0,01, parcial e `rotation` 0 elegíveis; `style` vazio elegível; rotação ≠ 0, qualquer chave de `style` fora da lista (inclusive `filter: 'none'`), canvas ≠ story ou não comprovado e campo desconhecido → `fundo-nao-avaliavel`; na `--contar`, elegíveis rotulados "canvas não comprovado"; "coberta" elegível com a contagem de camadas acima registrada (não decide) |
| T7 | E7–E8 | o host de `STORES_DO_STUDIO` (ok); OUTRO store válido da Vercel (`abcdefghijklmnop.public.blob.vercel-storage.com`); o store antigo `sqc9qfyearji7bel`; `a.b.public.blob.vercel-storage.com`; `public.blob.vercel-storage.com.evil.com`; `evil.com/?x=.public.blob.vercel-storage.com`; `lh3.googleusercontent.com`; `x.supabase.co`; `user@host`; porta; maiúsculas no host; `posts/rendered/` | só o host listado (e a variante em maiúsculas) autorizado; motivos exatos |
| T8 | 3.4 | cada prefixo; os DOIS fluxos que gravam `posts/<x>/google-drive/` (com e sem recorte) e um pathname com esse prefixo escrito pelo `konva-export` dão a mesma classe; toda transformação sai como `indicio`, nunca `comprovada`; maiúsculas; query; `%2e%2e`/`..`; prefixo novo | classe da tabela; desconhecida no resto |
| T9 | E9 + ordem | mesma URL com query diferente; empate da data de referência | repetido; desempate por `id`; mesma entrada → manifesto byte a byte igual (hash) |
| T10 | transação | `tx` falso que registra chamadas | 1ª chamada `SET TRANSACTION READ ONLY`; nenhum SQL com `INSERT/UPDATE/DELETE/ALTER` (lista das strings enviadas) |
| T11 | `--contar` | `fetch` espião em todos; (a) tabela ausente; (b) migração não registrada com tabela presente; (c) os dois; (d) tabela e migração presentes, nenhuma prova na seleção | `fetch` nunca chamado e nenhum arquivo escrito em (a)–(d); (a), (b), (c): recusa com o(s) sinal(is) exatos e causa "indeterminada"; (d): não recusa, reporta "nenhuma prova nesta seleção" + `COUNT` global |
| T12 | download | 403, timeout, `text/html` com status 200, bytes que não são imagem com `image/png`, 30 MB sem `content-length`, redirecionamento para host autorizado, para host alheio, cadeia de 4; OK | exclusões `download-falhou:<subcódigo>` contadas; redirecionamento autorizado segue; OK com SHA-256 certo e extensão pela assinatura |
| T13 | candidatos/déficit/reposição | 3 elegíveis com `--candidatos 20`; 24 elegíveis com `--candidatos 20` e 2 falhas; 7 elegíveis com 2 falhas e `--candidatos 20` | fora da leva (< 6 exportados); 20 exportados com os 2 reservas seguintes no lugar, na ordem; 5 exportados → fora da leva, déficit de candidatos 15 (a cota final não é testada aqui: é de P5) |
| T16 | E6b × imutabilidade da mídia | flag "imutabilidade de `posts/rendered/` comprovada" falsa × verdadeira (constante do módulo, fixada pelo PR com a evidência) | falsa → todo elegível vira `fundo-nao-avaliavel`; verdadeira → IHDR decide |
| T15 | E8b | inventário: o teste lista todo `allowOverwrite: true` de `src/` e `scripts/` e falha com um a mais; pathname no padrão de `compor-leva-setembro.ts` (com `head` falho → sobrescrita); pathname de cada escritor do inventário; `konva-export` com `fileName` = `drive-cache/x.jpg` (cai no padrão → `origem-sobrescrevivel`); condição da nota falsa × verdadeira; cada classe da tabela 3.4; `chat-uploads/` e `drive-cache/` com a mesma URL e bytes trocados entre o render e o download (sobrescrita) | `origem-sobrescrevivel` nessas duas; `imutabilidade-nao-comprovada` em todas enquanto a condição da nota for falsa; com ela verdadeira, elegível só fora dos padrões do inventário |
| T14 | pureza | `selecao-de-fotos.ts` | não importa `@/lib/db` nem `node:fs`/rede (teste de import, padrão do repo) |

Gates do PR de P1: matriz verde; `npx vitest run` dos arquivos novos; typecheck; lint; `git diff --check`; Codex APTO no HEAD;
CI e Vercel verdes. Sem rodada do piloto (nada nele muda).

## 5. Decisões mínimas pedidas ao owner (em ordem)

| # | Decisão | Proposta | Alternativa |
|---|---|---|---|
| D1 | Autorizar ESCREVER o `--fotos` (P1, só código + testes offline) | sim | não: a etapa representativa fica parada, e com ela o MCP-M0 |
| D2 | Autorizar a CONTAGEM no branch de dev (P2) e recriá-lo se for anterior a 12/10 | sim, depois de P1 na main | export manual do Blob pelo owner (adendo § 4, alternativa) |
| D3 | Populações | só PUBLICADOS (`POSTED`, janela por `latePublishedAt ?? sentAt`) | + agendados (`SCHEDULED`) como população SEPARADA, nunca somada |
| D4 | Estratificação | sem categoria na ferramenta; exportar `--candidatos` = 2× a cota final (20 para cota 10) e escolher 4/3/3 em P5 sobre os classificados | sem estratificação: `--candidatos` = cota final, menos fotos lidas |
| D8 | Evidência da mídia | **escolha expressa do owner**, porque muda o requisito do adendo § 4 ("vínculo verificável com o que foi PUBLICADO"): (a) aceitar "mídia registrada no banco, não conferida contra o publicador" e registrar essa alteração do requisito no plano; ou (b) exigir conferência da mídia no publicador antes de chamar a leva de representativa — leitura de serviço externo, autorização e contrato próprios, fora da P1 | — (não há recomendação neutra: (a) é mais barata e mais fraca; (b) é a que o adendo pedia) |
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
- **R3 (HEAD a68d2af1) — NÃO APTO**: R2 2 e 3 resolvidos, 1 parcial → corrigidos: (1) E6b julgava o render histórico pela `Page`
  ATUAL (`story-renderer.ts:69, 139`; a prova não guarda o canvas) → canvas comprovado pelo IHDR da própria mídia da prova; a
  `Page` sai do critério; na contagem o canvas fica "não comprovado"; (2) `chat-uploads/` e `drive-cache/` são sobrescrevíveis
  (`allowOverwrite: true`) e a prova não tem hash dos bytes de origem → E8b exclui origem sem imutabilidade comprovada (T15);
  (3) T11 com os quatro casos nomeados.
- **R4 (HEAD f7abfea7) — NÃO APTO**: R3 2 e 3 resolvidos, 1 parcial → corrigidos: (1) o IHDR lido hoje só vale se a mídia
  `posts/rendered/` for imutável → nota de imutabilidade (`@vercel/blob` 2.0.0, padrão "erro ao sobrescrever",
  `index.d.ts:235`), exigência de provar a versão em produção desde 12/10 e, sem prova, `fundo-nao-avaliavel` (T16); (2) o
  prefixo `posts/<x>/google-drive/` tem DUAS rotas, uma que recorta (`projects/[projectId]/google-drive/download/route.ts`) →
  transformação `desconhecida`, nunca "preservada"; `normalized/` como transformação comprovada; T8 com os dois fluxos.
- **R5 (HEAD 7c4f5931) — NÃO APTO**: R4 resolvidos (o 1 condicionalmente: a evidência da versão do Blob fica para P1) → novos,
  corrigidos: (1) § 1.3 reclassificava decisões do CP5a ADOTADAS pelo owner como propostas → separadas; (2) E6b não excluía
  `style.filter` (`render-engine.ts:1530`) → lista fechada de chaves de `style` no caso simples, T6 com `filter: 'opacity(0)'`;
  (3) a declaração do `@vercel/blob` passa a evidência a anexar em P1.
- **R6 (HEAD b3a67c9e) — NÃO APTO**: R5 resolvidos → novos, corrigidos: (1) o prefixo não prova a rota (`konva-export` aceita
  `fileName` livre, `route.ts:21, 159`) → classe e transformação viram INDÍCIO, nunca "comprovada"; E8b decide pela ausência de
  escritor que sobrescreve (inventário fechado de `allowOverwrite: true`, por teste) + a condição do Blob; T8/T15 com o caso;
  (2) `rulesVersion` proposto é bump manual cobrado por impressão digital, não hash (CP5b § 5).
- **R7 (HEAD bdc299f4) — NÃO APTO**: R6 2 resolvido, 1 parcial → corrigidos: (1) o inventário de sobrescrita ignorava `scripts/`
  (`compor-leva-setembro.ts:40-50` grava a foto da spec em caminho estável) → inventário do repositório inteiro e o limite dito
  (código fora da main não é visto; imutabilidade inferida, não provada por hash); (2) E4 casa com a mídia REGISTRADA, não com a
  publicada (PUT legado, `posts/[postId]/route.ts:207, 413`) → afirmação reduzida, rótulo "não conferida contra o publicador",
  `prova-posterior-a-publicacao`, T4b; (3) "convertida/reduzida" e "miniatura" viram indício nas células e no risco.
- **R8 (HEAD 0d2da9bb) — NÃO APTO**: R7 resolvidos → dois MAIORES que impediam a decisão, corrigidos: (1) D4 prometia 2× a cota,
  mas a exportação parava na cota → `--candidatos` (exportados) separado da cota final (aplicada em P5), déficits e corte `< 6`
  para cada um, T1/T13; (2) a evidência "mídia registrada no banco" é mais fraca que o "publicado" do adendo § 4 → D8, escolha
  expressa do owner, e P6 só se chama "representativa" com D8 decidida. A imutabilidade do Blob fica como exigência do PR de P1.
