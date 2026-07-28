# Sessão 28/07/2026 (tarde) — letterSpacing no render, quebra sem config e o Auto que não crescia

Continuação de [SESSAO-2026-07-28-RENDER-AGENDADOS.md](./SESSAO-2026-07-28-RENDER-AGENDADOS.md):
ataca as duas divergências de maior alcance da tabela §3 (letterSpacing e texto
sem `textboxConfig`) e o defeito relatado do modo Auto da caixa de texto.

Cada item diz **o que mudou**, **por que** e **a armadilha**.

---

## 1. `letterSpacing` desenhado e medido no render (752 camadas)

**Arquivo:** `src/lib/render-engine.ts` (`applyLetterSpacing`)

O RenderEngine não tinha uma referência sequer a `letterSpacing`; o editor
Konva aplica sempre. Além do desenho, a **medição de quebra** errava: 116
camadas quebravam linha em ponto diferente do editor.

O fix é um atributo só: `ctx.letterSpacing` do @napi-rs/canvas, setado em
`renderText` (escalado por `scaleFactor`), cobre medição (`measureText`),
alinhamento e desenho de uma vez. Funciona porque a semântica bate com a do
Konva, **verificado empiricamente** antes de escrever o código:

- Konva mede `measureText(texto) + ls × length` — um espaçamento após **cada**
  caractere, inclusive o último (`_getTextWidth`, Text.js:281). O
  `ctx.letterSpacing` do napi-rs conta igual (testado: `AB` com ls=50 mede
  base+100, não base+50). Valores negativos idem (`-10px` = base−n×10).
- O Konva alinha center/right pela largura **com** o espaçamento final; o
  `ctx.textAlign` nativo também. Diferença medida do início de linha: 0.7px.
- `save()/restore()` preservam o atributo (o `renderLayer` já isola por
  camada) e **reatribuir `ctx.font` não o reseta**.

**Divergência residual (aceita):** kerning. O Konva desenha letra a letra e
descarta o kerning entre pares; o canvas desenha a linha inteira e o mantém.
~1px por par kernado, a favor da legibilidade. A **medição** dos dois inclui
kerning (o Konva mede a linha inteira), então quebra e alinhamento não mudam.

**Armadilhas:**
- O espaçamento é *por contexto*, não por chamada: quem criar caminho novo de
  texto no RenderEngine herda o valor setado — o `save/restore` por camada é o
  que impede vazamento entre camadas.
- `generation-utils.ts` pré-escala o design e renderiza 1:1: o `letterSpacing`
  precisa ser escalado **junto do fontSize** ali (feito), senão o thumbnail sai
  com gaps de tamanho cheio em texto reduzido.
- rich-text também recebe o espaçamento: o editor dele
  (`konva-multi-styled-text`) lê `style.letterSpacing` do estilo base — ao
  contrário da sombra, aqui aplicar no render **aproxima** do editor.

## 2. Texto sem `textboxConfig` quebra linha em vez de espremer (448 camadas)

**Arquivo:** `src/lib/render-engine.ts` (`renderText`)

Sem `textboxConfig`, o render caía em `ctx.fillText(line, x, y, width)` — e o
4º argumento (maxWidth) **comprime os glifos horizontalmente** quando a linha
não cabe. O editor Konva sempre quebra (`wrap="word"`). Texto publicado saía
deformado e ilegível; no editor aparecia certo.

Agora todo texto passa pelo caminho com quebra (`renderAutoWrapFixed`), com
`{ textMode: 'auto-wrap-fixed' }` sintético quando o config não existe — os
fallbacks internos resolvem o resto (`lineHeight` de `style`, breakMode
`word`, anchor `top`), idênticos ao que o caminho legado usava.

Junto, **todos os `fillText` de texto perderam o maxWidth**: palavra única
maior que a caixa agora transborda, como no editor, em vez de espremer.

**Armadilhas:**
- O corte pela altura segue a regra existente do caminho com config (desenha
  uma linha além da caixa — divergência nº 3 da auditoria, **não** resolvida
  aqui). Texto que antes "cabia" espremido numa linha pode aparecer cortado
  onde o editor também corta: é o editor que manda.
- O fallback de fonte agora viaja com o estilo (`resolvedStyle`): antes os
  sub-renderers remontavam `ctx.font` com a família original e o fallback do
  `fontChecker` só valia na primeira atribuição — medição numa fonte, desenho
  noutra.

### Verificação (frentes 1 e 2)

Renderizado pelo caminho de produção (`convertPageToDesignData` +
`registerProjectFonts` + RenderEngine) contra o engine do HEAD, em páginas
reais com fonte real registrada: quebra de linha **idêntica à simulação do
editor** nos casos com ls +5 (Branley GC 90px) e ls −2 (FRZQUADN 72px);
pixel-diff mostra exatamente o tracking aplicado (1.47% e 0.43% dos pixels).
Caso sintético da frente 2: título de 96px que saía espremido numa linha
ilegível passa a quebrar em 4 linhas centradas.

⚠️ **As duas mudanças alteram arte agendada.** Após o deploy:
`npx dotenv-cli -e .env -- npx tsx scripts/rerender-agendados.ts` (dry-run) e
depois `--apply`. No dry-run de hoje: **6 posts RENDERED** na fila.

---

## 3. Modo Auto: a caixa não crescia — fonte assíncrona e altura mudada por fora

**Arquivo:** `src/components/templates/konva-editable-text.tsx`

Relato do usuário: com o Auto ligado, a caixa não acompanha o texto. A
auditoria dos dados (800 páginas) não achou caixa dessincronizada *gravada* —
as 10 camadas com Auto estavam certas no banco — o que aponta para defeitos
**de sessão de edição**, que o usuário desfaz na mão antes de salvar. Três
causas estruturais no código, todas da mesma família: **a medição rodava uma
vez por assinatura, e o mundo mudava sem mudar a assinatura**.

1. **Fonte carregada depois da medição.** As fontes chegam por `FontFace`
   assíncrona — as de projeto no boot (mitigado pelo pré-load do editor-shell)
   e as do Google **na troca de família no seletor** (`addGoogleFont`, por
   demanda). Trocar a fonte re-media na hora **com a métrica do fallback**;
   quando a fonte real chegava, o Konva redesenhava com outra quebra, mas
   nenhum campo da camada mudava → a trava `ultimoAjusteRef` engolia a
   re-medição. Recarregar a página "consertava" (fonte em cache) — o sintoma
   clássico que faz o controle parecer intermitente.
2. **Altura mudada por fora.** Alça de baixo do transformer e undo alteram
   `size.height` sem tocar na assinatura: o efeito rodava (height estava nas
   *deps*), batia na assinatura já vista e retornava — a caixa ficava menor
   que o texto até a próxima mudança de conteúdo.
3. **`textTransform` e `fontStyle` fora da assinatura.** Ligar uppercase ou
   itálico muda a métrica e não re-media.

**O fix:** um `fontsTick` (state incrementado em `document.fonts`
`loadingdone` + um tick garantido em `fonts.ready`) entra nas **duas**
assinaturas, e a `assinaturaQuebra` ganhou `size.height`, `textTransform` e
`fontStyle`. Entrar na `assinaturaRender` importa tanto quanto: sem isso, o
**cache bitmap** (fontSize > 24) continuava blitado com o fallback mesmo com a
fonte carregada — defeito irmão, visível em qualquer título, com ou sem Auto.

**Armadilhas:**
- `size.height` na assinatura de quebra parece loop (o efeito escreve height)
  — não é: a escrita re-executa o efeito uma vez e `|diff| < 1` encerra sem
  escrever. A trava por assinatura segura o caso *oscilante* (medição que muda
  entre execuções, ex.: fonte carregando no meio); o guard de diff, o estável.
  **Tirar qualquer um dos dois reabre o "Maximum update depth exceeded".**
- Com Auto ligado, arrastar a alça de baixo agora "resiste" (a caixa volta a
  abraçar o texto ao soltar). É o contrato do Auto — quem quiser altura manual
  desliga o Auto.
- **Converter texto → rich-text carrega o `autoExpand` gravado junto, mas o
  `KonvaMultiStyledText` não implementa crescimento nenhum** (há 1 camada
  assim no banco). O popover do Auto só aparece para `text`, então não há
  controle mentindo na tela — mas é uma divergência de dado conhecida.

## 4. Auto-height nativo do Konva: avaliado e rejeitado

Konva.Text sem `height` auto-dimensiona: `getHeight() = fontSize × linhas ×
lineHeight + padding×2`. Protótipo headless (Konva + @napi-rs/canvas como
backend, `scripts/.tmp-konva-node.mjs` da sessão) provou:

- a fórmula nativa é **idêntica** ao medidor descartável (184.8 = 184.8);
- `clone({ height: undefined })` mede igual ao medidor manual;
- `setAttrs({ height: undefined })` devolve o nó ao modo auto;
- altura fixa **trunca o `textArr`** (4→2 linhas) — a armadilha nº 1 da sessão
  27/07, agora provada empiricamente.

**Decisão: não usar height auto no nó da tela.** Motivos, em ordem de peso:

1. **A dessincronia ficaria invisível.** O render server-side corta pela
   altura **gravada**. Com altura fixa na tela, uma falha do efeito de
   crescimento aparece como truncamento visível no editor — o mesmo corte que
   a arte publicada teria. Com height auto, a tela abraçaria o texto mesmo com
   `size.height` velho no banco: editor perfeito, arte cortada, ninguém vê.
   É exatamente a classe de divergência invisível que as últimas três sessões
   caçaram; a altura fixa na tela é o contrato visível com o render.
2. **Não elimina o efeito nem as assinaturas.** Gravar `size.height` continua
   obrigatório (contrato acima) e âncora bottom/middle continua exigindo
   recálculo de `y` — o nativo não reposiciona nada.
3. **O transformer mataria o modo auto em silêncio:** `handleTransform` faz
   `setAttrs({ height })` imperativo; a partir daí `attrs.height` existe e o
   nó nunca mais auto-dimensiona (até remount).

O medidor descartável fica. (O clone herdaria os 16 listeners do nó real —
mais bagagem que os 11 props copiados.)

---

## Estado ao fim da sessão

| Área | Situação |
|---|---|
| letterSpacing no render | ✅ medição + desenho + alinhamento, escala ok |
| Texto sem textboxConfig | ✅ quebra como o editor; maxWidth removido dos fillText |
| Re-render dos agendados | ⏳ rodar `rerender-agendados.ts --apply` **após o deploy** (6 posts) |
| Auto da caixa de texto | ✅ re-mede quando fonte chega, height externo e transform/estilo |
| Cache bitmap × fonte tardia | ✅ `fontsTick` na `assinaturaRender` |
| Auto-height nativo | ✅ avaliado; rejeitado com protótipo (§4) |
| Corte de linhas pela altura (divergência nº 3) | ⏳ segue em aberto, decisão consciente |
| rich-text convertido com `autoExpand` gravado | ⚠️ 1 camada; sem efeito e sem controle na tela |

### Nota de verificação

A frente 3 não teve reprodução interativa nesta sessão (o editor exige sessão
Clerk; autenticar pelo agente não rola). O diagnóstico veio do código + dados;
a validação de tela que falta: trocar a família de uma camada com Auto ligado
para uma fonte Google ainda não usada e ver a caixa se ajustar quando a fonte
carregar (antes, ficava presa na métrica do fallback).
