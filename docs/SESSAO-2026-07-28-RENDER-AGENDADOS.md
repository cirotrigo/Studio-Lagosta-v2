# Sessão 27–28/07/2026 — O caminho do render agendado

Continuação de [SESSAO-2026-07-27-TEXTO-ALINHAMENTO.md](./SESSAO-2026-07-27-TEXTO-ALINHAMENTO.md).
O tema da noite foi um só: **a arte que o cliente vê no editor não era a arte
que publicava**. Cada correção puxou a próxima — entrelinha, sombra, o cron que
nunca re-renderiza, e a fonte que só existia no navegador.

Cada item diz **o que mudou**, **por que** e **a armadilha**.

---

## 1. Saneamento da entrelinha aplicado ao banco

**Script:** `scripts/fix-lineheight-divergente.ts` (commit `8417e03`)

A sessão anterior descobriu que os controles de entrelinha escreviam só em
`style.lineHeight`, enquanto o render prefere `textboxConfig.autoWrap.lineHeight`.
O saneamento alinhou o dado gravado:

- **1.132 camadas corrigidas** (512 páginas + 71 designData, 93 templates),
  rodado primeiro no template 95 isolado, depois no resto.
- Backup completo antes (120 templates, 978 páginas) e conferência campo a
  campo depois: **0 páginas sumidas, 0 camadas perdidas, 0 diferenças além da
  entrelinha**.
- Padrão dominante: `autoWrap 1.2 → style 1` (710 casos) — anos de ajustes de
  entrelinha feitos no editor que nunca chegaram à arte publicada.

**Armadilha:** o script protege a intenção do usuário copiando o `style` (o que
o editor mostra) para o `autoWrap` (o que o render lê) — nunca o contrário.

---

## 2. Sombra de texto nunca foi desenhada na arte publicada

**Commits:** `1ae1c31`, `6c5ed5f`

`applyShadow` do RenderEngine só lia `style.shadow` — um formato que **nada no
editor escreve**. A sombra real mora em `layer.effects.shadow`, e o RenderEngine
não tinha uma única referência a `layer.effects`. **743 camadas com sombra ativa
em 93 templates: nenhuma aparecia na arte publicada.**

- `applyShadow` passou a ler `layer.effects.shadow`; `shadowOpacity` vira alfa
  da cor via `applyOpacityToColor` (o canvas não tem opacidade de sombra
  separada como o Konva).
- **Escala**: deslocamento e difusão agora multiplicam pelo `scaleFactor` —
  sem isso a miniatura saía com a sombra ~6× maior que a arte.
- **`rich-text` fica de fora**: o editor dele (`konva-multi-styled-text`) lê
  sombra **por segmento** (`segment.style.shadow`) e ignora `effects.shadow`.
  Desenhar no render criaria a divergência ao contrário — sombra publicada que
  o usuário nunca viu e não sabe desligar.

**Armadilha:** a configuração de sombra recomendada (opacidade 100%, difusão 0,
X/Y ~5) estava **certa no dado** desde sempre — o defeito era o render ignorar
o campo. Antes de mexer em configuração, conferir se o campo é sequer lido.

---

## 3. Auditoria editor ↔ render: as divergências conhecidas

Auditoria adversarial (agentes tentando refutar cada achado lendo o código)
sobre tudo que o editor desenha e o RenderEngine faz diferente.

**Confirmadas e ainda em aberto** (cada uma muda arte publicada; consertar é
decisão consciente):

| divergência | alcance medido |
|---|---|
| `letterSpacing` ignorado — erra desenho E medição de quebra | 752 camadas; 116 quebram linha em ponto diferente |
| Texto sem `textboxConfig` não quebra — `fillText` com maxWidth **espreme** as letras | 448 camadas (142 em páginas com post) |
| Corte de linhas pela altura — render desenha uma linha a mais que o editor | 293 camadas divergem |
| Fundo/pílula de texto (`effects.background`) não existe no render | 25 camadas (badges/CTAs) |
| Negrito parcial de rich-text some (render ignora `richTextStyles`) | 94 camadas |
| Contorno (`effects.stroke`) — nenhum `strokeText` no render | 0 ativos hoje |
| Texto curvo (`effects.curved`) sai reto | 5 camadas |
| Blur de texto (`effects.blur`) sai nítido | 1 camada |
| Borda legada de texto (`style.border`) | 3 camadas |

**Mapeadas mas NÃO verificadas** (a verificação esbarrou no limite de sessão):
`objectFit: cover` transborda em vez de recortar quando a camada é menor que o
canvas (~1.307 camadas), pivô de rotação divergente (76 camadas), z-index por
`order` vs posição no array (24 páginas), filtros/ajustes de imagem ignorados,
cor de fundo do canvas não persistida, resize de canvas não persistido. Tratar
como suspeitas fortes, não como confirmadas.

---

## 4. Editar página agendada agora invalida a arte renderizada

**Commit:** `5f76939` — a mudança arquitetural da sessão.

O cron `render-stories` **nunca revisita um post RENDERED**. Só o PUT do
template invalidava; salvar uma **página** (o autosave do editor!) ou uma
camada não invalidava nada. Editar um story agendado publicava a arte antiga
em silêncio — dois posts da semana estavam exatamente nessa condição.

### A regra agora vive num lugar só

`src/lib/posts/invalidate-renders.ts` — três alvos (`templateId`, `pageIds`,
`postIds`), `updateMany`, e três chamadores: PUT do template, PATCH da página,
PATCH de layer. Volta post SCHEDULED para `PENDING`, zera tentativas, limpa
`renderedImageUrl` **e `mediaUrls`** (o recover-stuck-post reconstrói a
publicação desse campo — com ele preenchido, um recover manual num post
PENDING mandaria a arte velha).

### As guardas que evitam re-render em loop

O mesmo PATCH da página recebe **thumbnail e autosave do PageSync a cada troca
de página**. Invalidar em todo PATCH re-renderizaria os agendados toda vez que
alguém abre o editor. Por isso:

- só campos **visuais** invalidam (`layers`, `background`, `width`, `height`);
- e só quando as layers **mudam de verdade** — comparação normalizada
  (`normalizeLayersString`) contra o que está gravado.

A guarda foi verificada contra as **979 páginas reais**: um autosave sem
mudança bate com o gravado em 978. A única instável é um shape legado
(tpl 131) cujo hex vira `rgba()` na canonicalização — se autocura na primeira
gravação e não tem posts.

### A corrida que engoliria a invalidação

Os updates finais do cron eram incondicionais: invalidação no meio de um
render em voo era sobrescrita pelo resultado velho. Agora sucesso e falha são
`updateMany where renderStatus: RENDERING` — se a invalidação venceu, o
resultado é descartado com log e o ciclo seguinte re-renderiza.

### Prova em produção

Duas vezes na mesma noite: edições no editor às 03:51 → posts re-renderizados
às 03:54; varredura de fontes às 04:0x → re-renders às 04:12. Sem script de
recuperação.

**Ferramenta que ficou:** `scripts/rerender-agendados.ts` — força o re-render
do que já está RENDERED (para quando o **código** de render muda). Dry-run por
padrão; pula post publicando em <15 min; **rodar só com o deploy no ar**,
senão o cron re-renderiza com o código velho.

**Armadilha para rotas novas:** qualquer endpoint que grave `Page.layers`
precisa chamar `invalidateScheduledRenders` — senão reabre o buraco. Os que
não invalidam de propósito: reorder/duplicate/toggle-template/tags (não mudam
a arte de página com post).

---

## 5. Fontes: a troca da Konsteady e as três armadilhas de fonte

**Contexto:** a Konsteady ("de botecar!" e afins) renderizava diferente entre
editor e arte final.

### Por quê

`Konsteady.otf` é **OTF/CFF de uma face só**, e as camadas pediam
`fontWeight 500/600`. O navegador **fabrica** o peso que não existe
(faux-bold); o napi-rs canvas **não** — desenha a face real. Editor mostrava
semibold, a arte saía regular.

### A armadilha do `addGoogleFont`

O editor tem um caminho (`font-manager.ts`) que carrega fonte por nome **do
CDN do Google, só no navegador**. A primeira tentativa de troca usou esse
caminho: a Caveat aparecia perfeita na tela e **não existia no servidor** — o
render cairia em fallback. Fonte de projeto só vale quando o **arquivo** é
enviado (registro `CustomFont`): é o que `registerProjectFonts` baixa e
registra no napi-rs canvas.

### Como a Caveat entrou

- TTFs **estáticos** (Regular e Bold, TrueType, sem `fvar`, charset completo
  com acentos PT) obtidos do css2 do Google com UA antigo — sem `unicode-range`
  o Google serve o arquivo inteiro.
- Registrados como `CustomFont` do projeto Seu Quinto (famílias `Caveat` e
  `Caveat Bold`), seguindo as convenções da rota de upload.
- Acentos provados no napi-rs canvas antes de usar ("terça, ção, é, ã").

### Trocar fonte muda a métrica — medir a caixa é obrigatório

O primeiro re-render pós-troca saiu **só com o "de"**: a Caveat a 180px mede
678px onde a Konsteady cabia em 600 — quebrou em duas linhas e a segunda foi
cortada pela altura (a divergência nº 3 da auditoria em ação). A varredura
final mediu **cada caixa** com a métrica real da Caveat:

- 14 intervenções em 10 páginas + 3 designData + 1 combinação; backup antes.
- Caixas alargadas mantendo o centro; alturas crescidas onde precisou.
- Único caso em que nem o canvas bastava ("Funcionamento no domingo", mede
  1080px): **fontSize 120→115** para manter uma linha — encolher até 20% é
  aceitável, mais que isso é outra arte.
- Peso normalizado para 400 em tudo (o negrito "de verdade" é a família
  `Caveat Bold`, nunca `fontWeight` sintético).
- Dry-run final: **zero Konsteady restante** no projeto.

**Nota:** o tpl 158 tem colisão entre dois textos que **já existia** (as caixas
se sobrepunham antes da troca; o encolhimento até reduziu). Template da final
da copa, sem posts — arrumar se for reutilizar.

---

## Estado ao fim da sessão

| Área | Situação |
|---|---|
| Entrelinha (controles + dado) | ✅ dois campos alinhados; 1.132 camadas saneadas |
| Sombra no render | ✅ desenhada, com escala; rich-text excluído de propósito |
| Invalidação ao editar página/camada | ✅ em produção, provada 2× |
| Corrida cron × invalidação | ✅ resultado velho é descartado |
| Konsteady | ✅ zero camadas; Caveat estática nos dois lados |
| Divergências da auditoria (§3) | ⏳ conhecidas, decisão caso a caso |
| objectFit/rotação/z-index/filtros | ⚠️ mapeadas, não verificadas |
| Colisão tpl 158 | ⚠️ pré-existente; arrumar se reutilizar |

### Próximos passos sugeridos

1. Decidir quais divergências da §3 atacar — começaria por `letterSpacing`,
   texto sem `textboxConfig` e fundo de texto (silenciosas e de maior alcance).
   Cada uma muda arte agendada: usar `rerender-agendados.ts` após cada deploy.
2. Verificar as suspeitas não confirmadas (objectFit, rotação, z-index) antes
   de tratá-las como reais.
3. Se o tpl 158 voltar a ser usado, corrigir o espaçamento dos dois textos do
   rodapé.

### Nota de processo

O padrão que rendeu a noite inteira: **o export do editor
(`stage.toDataURL()`) valida o editor contra ele mesmo** — toda divergência
desta sessão só aparecia renderizando pelo caminho de produção
(`Page.layers → RenderEngine`) e comparando pixels. Os scripts temporários da
sessão faziam exatamente isso; `rerender-agendados.ts` e
`fix-lineheight-divergente.ts` ficaram no repositório.
