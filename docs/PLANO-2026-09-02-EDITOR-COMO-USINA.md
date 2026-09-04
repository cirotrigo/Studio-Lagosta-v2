# O editor como usina: gerar a semana em lote pelo backend do Konva

Escrito em 02/09/2026, a pedido do Ciro, depois da nota "Canvas e Editor, Lado a
Lado" (artifact `cdb769d5`) e da leva de setembro da Lagosta Criativa (72 peças
pelo canvas de design). A pergunta: **o que muda no backend do editor para que o
modelo gere a programação semanal por ele, em lote, com a equipe ajustando na
tela, e aprendendo com o uso?**

Escrito como análise e proposta; executado no mesmo dia (F0–F5) — o placar está
na §10 e as regras que ficaram, no CLAUDE.md § "O editor como usina".

## 1. Onde estamos, em número (medido em 02/09/2026, produção, só leitura)

### Artes dos últimos 30 dias, por via

| via | Generations | o que é |
|---|---:|---|
| `arte-enviada` | **772** | canvas de design (HTML → Chrome → upload) |
| `arte-ia` | 622 | geração por IA (gpt-image / nano-banana) |
| `post-schedule` | 222 | render de post agendado a partir de página |
| `ai_improvement` | 133 | melhoria com IA |
| `arte-rapida` | **57** | **a via de MODELO do editor** |
| `ajuste-arte` | 31 | ajuste pelo chat |

A via de modelo, que é a única via de LOTE que o editor tem hoje, é 7% do que o
canvas produziu no mesmo período.

### Os 147 modelos do editor

- **147 páginas `isTemplate`, TODAS `STORY`. Zero de FEED, zero SQUARE.** A
  leva da Lagosta tinha 36 slides de feed em 72 peças: metade dela não teria
  onde nascer no editor hoje.
- Uso: TERO usou os seus 19 modelos 39 vezes. Os outros oito clientes somam
  **14 usos em 128 modelos**; Real, Seu Quinto e Bacana têm 0 usos em 8, 18 e
  18 modelos. As famílias "(3 layouts)" geradas em 26-27/08 estão paradas.
- `prepareCreative` (`arte-rapida.ts:257`) é `type: 'STORY'` cravado. Modelo de
  feed, se existisse, seria invisível para `escolher-modelo`.

### O que o feedback diz (todos os "gostei"/"preciso melhorar" desde 11/08)

| via | gostei | melhorar |
|---|---:|---:|
| `arte-ia` | 25 | 53 |
| `arte-enviada` (canvas) | 7 | 61 |
| `arte-rapida` (modelo) | 0 | 33 |

Duas leituras honestas:

1. **Nenhuma via está ganhando.** O canvas não é "a que faz arte melhor" — os
   61 do canvas são a semana 1 do TERO (1/20, cancelada), o Espeto no véu (6/25),
   o Quintal (0/7) e o By Rock (0/9). As 72 da Lagosta ainda não foram avaliadas.
   O que o canvas ganhou foi **iteração**: a peça é medida, a medida volta ao
   código, e a leva inteira é refeita em minutos.
2. **A via de modelo é a pior do placar**, e 32 dos 33 são do TERO — os
   templates 317/318/319 nascem com o lockup colidindo em 19-38px (CLAUDE.md,
   "Na via de MODELO, o defeito é outro e continua aberto"). Não é o Konva que
   falha; é o gerador de template que produz caixa sobre caixa e o autofix que
   não enxerga.

## 2. O que o canvas faz que o backend do editor não faz (e o contrário)

Lido lado a lado: `design-canvas/lagosta-padrao/gerar.py` (677 linhas),
`medir.py`, `aferir.py`, `_halo.py` contra `arte-rapida.ts`,
`gerador-de-templates.ts`, `halo/*`, `render-engine.ts`.

| capacidade | canvas | editor hoje | onde está |
|---|---|---|---|
| Descrever a peça como CÓDIGO (spec → arquivo) | `gerar.py` por marca: blocos, linhas, alinhamento, âncora | **Não existe.** Ou se preenche slot de template pronto, ou se despeja JSON cru em `create-page` sem validação | `mcp-server.ts:544` aceita qualquer JSON |
| Assinatura tipográfica da marca como parâmetro | `F`, `GEO`, tamanhos por papel, tracking, gradiente | `KITS` em `kits-de-marca.ts` (9 clientes, cravado no script), `assinatura-tipografica.ts` (só prompt de IA) | não vive no banco |
| Medir se o texto cabe ANTES de gerar | `cabe()` com métrica PIL | `measureTextLayerBox` existe (napi), mas `prepareCreative` não devolve orçamento — o modelo escreve às cegas e leva `TEXTO_NAO_CABE` 422 depois | `arte-rapida.ts:100-110` |
| Luz sob o bloco → tinta do halo | `luz_sob` + `alvo_por_contraste` + `tinta_para_alvo` | `aplicar-halo.ts` faz o mesmo (média + p75, cover, por cor) — **só na família `lote-tema-2026-08`** | `integracao-arte-rapida.ts:60` |
| Aferir a peça PRONTA e realimentar | `aferir.py`: p98 no retângulo REAL, `cob`, converge em 2 passadas | **Não existe.** Nada mede contraste na peça renderizada | — |
| Canto da logo pela luz | `canto_da_marca` | logo em y fixo no template; `logo-compositor` só na trilha IA | `gerador-de-templates.ts:528` |
| Layout escolhido pela foto | fixo por peça na tabela | **existe** (`layout-pela-foto.ts`): calma em cima → Topo, embaixo → Rodapé | vantagem do editor |
| Halo que SEGUE o texto quando a equipe move | não se aplica (não há edição) | **existe desde este branch** (`effects.background` fit `texto` + blur, F4 por grupo) — mas `aplicar-halo.ts` ainda grava halo como SHAPE solta (`halo-N`) | divergência a fechar |
| Dry-run: ver a leva sem gravar nada | `render/` local, git | **Não existe.** Todo render cria Page + Generation + Blob | `persist.ts:221` |
| Histórico / voltar atrás | git | nenhum: `Page.layers` é sobrescrito pelo autosave | — |
| Lote de 72 sem teto de tempo | processos locais em paralelo | sequencial dentro de 210s por invocação; **a via de modelo não tem fila durável** (só a IA) | `executar-plano.ts:257` |
| Formato | qualquer | modelos só STORY | — |
| Fonte | qualquer arquivo | `CustomFont` (uma por família, sem peso); `fontWeight` fora de múltiplo de 100 quebra o parser | `render-engine.ts:2058` |
| Headline em gradiente (Lagosta) | CSS | `style.color` sólido; sem gradiente em texto | perda real |
| Equipe ajusta na tela | não | **sim**, e a agenda re-renderiza sozinha | vantagem decisiva do editor |

O que sobra quando se tira a tabela: **o canvas venceu porque eu escrevo a peça
diretamente, como código, a partir de uma spec por marca — e porque a peça é
medida.** Nenhuma das duas coisas é intrínseca ao HTML. O `Layer[]` do editor é
o equivalente do `.dc.html`; o que falta é o `gerar.py` do lado de lá: uma camada
de COMPOSIÇÃO tipada e ciente da marca.

## 3. O diagnóstico, sem rodeio

1. **O render engine não é o problema.** Ele já tem quebra de linha, letterSpacing,
   fundo de texto com blur (halo), blur de forma, crop, máscara, fontes do
   projeto. As lacunas são de borda (kerning ~1px, rich-text sem sombra, sem
   gradiente em texto).
2. **O problema é a ausência do MEIO.** Há duas portas para o `Layer[]`: preencher
   slot de template (rígido, mapeamento posicional em `execucao.ts:196`, id/nome
   sem contrato) ou `create-page` com JSON cru (sem validação, sem autofix, sem
   halo). Não existe "descreva a peça e o sistema compõe".
3. **Template como mecanismo de lote está morto na prática.** 128 modelos com 14
   usos, 0/33 de aprovação, colisão de fábrica. A energia gasta em gerar famílias
   "(3 layouts)" produziu páginas que ninguém usa. O caminho é o template virar
   KIT (parâmetros da marca), não página.
4. **A régua não existe no editor.** É o buraco que a nota de produção apontou
   e o que a leva provou: dois defeitos só apareceram porque a peça foi medida.
5. **O aprendizado que só o editor pode ter ainda não é capturado.** Hoje o
   PATCH da página registra mudança de TEXTO (copy). A equipe mover a logo 40px,
   encolher a manchete, trocar o alinhamento — o sinal mais rico de "como esta
   marca quer a peça" — vira autosave e some.

## 4. A proposta: um compositor no backend, com régua e memória

### F0 — Contrato do `Layer` (pequeno, destrava o resto)

- Schema zod do `Layer` (texto, imagem, logo, forma) com os campos que o render
  de fato lê, e um **normalizador** que aplica as regras que hoje só vivem em
  comentário: `fontWeight` múltiplo de 100, `lineHeight` escrito nos DOIS campos,
  `order` renumerado, `autoExpand`/`anchor` explícitos.
- `create-page` e `create-template` (MCP local) passam pelo schema. `FEED_PORTRAIT`
  sai do enum (não existe em `TemplateType`).
- `page-to-design-data.ts` usa `lerCamadas` (o `parseLayers` dele devolve string
  tipada como array na forma dupla-codificada — bug real, ver chip da sessão).

### F1 — O compositor: `compor-arte` e `compor-leva`

O port do que `gerar.py` faz de genérico, em TypeScript, no backend:

```
Spec {
  projectId, formato: story|feed|quadrado,
  foto: { driveFileId | url },           // ou fundo liso
  blocos: [                               // a copy JÁ dividida por papel e por LINHA
    { papel: 'pre',      linhas: ['Produção de conteúdo'] },
    { papel: 'headline', linhas: ['Foto Nova a Cada', 'Quinze Dias'] },
    { papel: 'apoio',    linhas: ['O executivo muda…', 'a produção acompanha.'] },
    { papel: 'cta',      linhas: ['Conheça nossos pacotes'] },
    { papel: 'servico',  linhas: ['Quinta, das 11h às 00h'] },
  ],
  preferencias?: { ancora: 'topo'|'rodape'|'auto', alinha: 'left'|'center'|'right', cantoDaMarca: 'auto'|… },
  itemDePlanoId?, quando?
}
```

O compositor:

1. lê o **kit da marca no banco**: os ESTILOS por papel vêm da **página de
   assinatura** do projeto (§ 8) e os números de geometria (margens, safe area,
   faixa de tinta e raio do halo) de um JSON curto no projeto, editado na aba
   Marca — o que hoje é `KITS` no script e `PADRAO.md` no canvas;
2. mede cada linha com o medidor napi já existente (`measureTextLayerBox`) e
   **recusa antes de gerar** quando a linha não cabe na coluna, devolvendo o
   orçamento (quantos caracteres cabem em cada papel) — é o `cabe()`;
3. escolhe âncora pela foto (`layout-pela-foto`, já existe) quando `auto`;
4. calcula o halo por bloco (`halo.ts`, já existe) e o grava como
   **`effects.background` no texto líder do grupo** (`metadata.groupId`), não
   como shape solta — assim a mancha segue o texto quando a equipe o move;
5. escolhe o canto da logo pela luz (port de `canto_da_marca`, 30 linhas);
6. passa por `aplicarAutofixOuFalhar` e persiste pelo `persistAndRenderCreative`
   de sempre (Page editável + Generation + Blob), com `fieldValues.spec` e
   `fieldValues.assinaturaVersao`.

`compor-leva` recebe N specs e **só enfileira** (ver F3). Modo `provar: true`
renderiza em memória e devolve uma folha de contato sem gravar Page nem
Generation — é o dry-run que fez o canvas ser iterável.

O que NÃO entra: importador HTML → Konva. O `.dc.html` é fluxo flex; o Konva é
absoluto. A ponte é a spec, não o HTML.

### F2 — A régua no servidor

O editor tem uma vantagem que o canvas nunca terá: **o render é em processo**, sem
Chrome, sem pendurar. Então a aferição cabe na mesma chamada:

- renderizar a peça sem as camadas de texto (é só filtrar o `Layer[]`), medir com
  sharp o p98 sob o retângulo REAL de cada bloco (`retanguloDasLinhas` já dá o
  retângulo que o Konva desenha), comparar com `alvoPorContraste` da cor;
- fora do alvo → uma segunda passada com a tinta corrigida por `cob`, como o
  `aferir.py`; ainda fora → **entregar com aviso** (`fieldValues.contraste`),
  nunca reprovar — regra da casa desde 10/08;
- o mesmo número aparece no painel de efeitos do editor ("este bloco está a p98
  131 contra alvo 76") — é a régua que a nota pediu para levar ao editor, ao lado
  do autofix geométrico.

### F3 — Fila durável para a via de composição

Render de modelo custa ~2-4s e zero crédito; 72 peças são minutos, não a
invocação de 210s. `GenerationJob` ganha o tipo de composição (migration escrita
à mão + `db:deploy`), o cron processa mais de 3 por varredura quando o job é
barato, e a bancada mostra o progresso como já faz para a IA. O MCP só enfileira.

### F4 — Memória: histórico e o sinal geométrico

- **Snapshot de `layers` na Generation** (`fieldValues.layersSnapshot`) e ação
  "reverter" — o `git` do canvas, na escala de uma peça.
- **`LearningSignal tipo: 'geometria'`** no PATCH da página quando a página veio
  do compositor: diff de posição, tamanho, fonte, alinhamento entre o gerado e o
  salvo (balde de 10 min, como a captura de copy). É o sinal que só o editor
  produz.
- **Destilação para a assinatura**: delta sistemático por marca (a equipe SEMPRE
  encolhe a manchete do TERO em ~10%, sempre sobe a logo do Quintal) vira
  proposta de mudança do kit, aprovada por gente — o mesmo desenho dos pilares
  (propor → aprovar → usar), nunca automático.
- O "gostei/preciso melhorar" já existente passa a carregar a `spec` e a versão
  da assinatura, para o placar ser por PARÂMETRO (âncora, alinhamento, faixa de
  tinta) e não só por peça.

### F5 — Feed e a aposentadoria dos "(3 layouts)"

- O compositor nasce com os três formatos; `prepareCreative` deixa de ser
  STORY-only.
- As famílias "(3 layouts)" não são regeradas. Os kits que as produziram viram a
  `assinatura` de F1; as páginas ficam como acervo até a curadoria despromover.
- Os 10 projetos com canvas (`design-canvas/<cliente>-…/PADRAO.md`) já têm o
  padrão escrito; portar é ler o PADRAO e preencher a assinatura — não é
  redesenhar.

## 5. O que o editor perde em relação ao canvas, e eu aceito perder

- **Gradiente em texto** (headline da Lagosta). Sem `fillLinearGradient` no texto
  do render, a manchete sai sólida. Adicionar é possível (Konva suporta), mas
  não é F1.
- **Liberdade de CSS por linha** (sombra em três camadas presa ao glifo). O
  editor tem UMA sombra por camada; dá para aproximar, não igualar.
- **Trabalhar sem rede.** O compositor grava no banco e no Blob; o dry-run
  resolve a revisão, não a autonomia.

## 6. Ordem e esforço

| fase | esforço | valor |
|---|---|---|
| F0 contrato | 1-2 dias | destrava F1 e mata uma classe de render invisível |
| F1 compositor + dry-run | 1-2 semanas (o `gerar.py` já é o desenho) | é a usina |
| F2 régua | 3-4 dias (as funções existem, falta a passada) | qualidade medida |
| F3 fila | 2-3 dias (precedente F0.3) | lote de verdade |
| F4 memória | 1 semana | o que só o editor pode aprender |
| F5 feed | junto com F1 | metade da leva da Lagosta |

Recomendação de sequência: **F0 → F1 (só STORY, um cliente: Lagosta, que tem
`dados.py` pronto como spec) → F2 → medir contra a leva de setembro** (mesma
copy, mesma foto, editor × canvas, avaliada pelo Ciro) **→ F3/F4 → F5.** Só
depois de a comparação sair a favor é que os outros nove clientes entram.

## 7. Riscos que eu não esconderia

- **O placar é ruim em todas as vias.** Trocar de ferramenta não resolve copy
  fraca, foto errada ou direção. O que F4 compra é a chance de aprender com o
  ajuste da equipe, que hoje evapora.
- **`Page.layers` continua sendo string JSON dupla-codificada em parte do
  banco.** Todo consumidor novo passa por `lerCamadas`, ou repete o bug.
- **Duas pipelines com garantias diferentes** (`arte-rapida` com autofix + halo;
  `story-renderer` só com reflow). O compositor precisa nascer na primeira, e o
  cron de posts agendados precisa ser alinhado — senão a arte que a equipe
  aprova na galeria e a que o cron publica divergem.
- **A equipe editar a peça descongela o halo, mas não o refaz.** Com o fundo em
  `effects.background` ele SEGUE o texto; a TINTA não se recalcula quando o
  texto pousa em outra parte da foto. A régua de F2 no painel é o que avisa.

## 8. E os templates? (observação do Ciro, 02/09/2026)

"Template" hoje são três coisas diferentes, e a resposta é diferente para cada uma:

| o que é | onde vive | com o compositor |
|---|---|---|
| **Contêiner**: pasta com formato e dimensões | `Template` (toda `Page` exige `templateId`) | **fica, sem trabalho.** As peças compostas nascem no coletor de cada formato (`Arte Rápida`, `— Feed`, `— Quadrado`), como a arte rápida já faz. É onde a equipe as abre. |
| **Layout pronto para preencher** | `Page.isTemplate = true` (147 páginas, 6 temas × 3 layouts por cliente) | **não se define mais nenhum.** É isso que está morto (14 usos em 128) e é o que o compositor substitui: posição vem da foto e da spec, não de uma página por tema. |
| **Kit da marca**: fonte, tamanho, caixa, cor e efeito por papel; logo; halo | hoje em CÓDIGO (`KITS` no script, `PADRAO.md` no canvas) | **é o que precisa existir**, e precisa ser editável pela equipe. |

### A página de assinatura

O kit vira **UMA página por projeto e formato** (2-3 por cliente em vez de 18),
`isTemplate: true` com a tag `assinatura`, cujas camadas de texto se chamam pelo
PAPEL (`pre`, `headline`, `apoio`, `cta`, `servico`) e carregam só o ESTILO:
fonte, tamanho, caixa, tracking, entrelinha, cor, sombra, preset de halo. Mais a
camada da logo com o tamanho certo. A posição nela é ilustrativa — o compositor
lê o estilo e compõe a posição.

Por que página e não JSON no DNA: **a equipe edita página no editor, não edita
JSON.** Trocar a fonte da headline do TERO é abrir a página de assinatura e
mudar; o próximo lote sai com ela. É exatamente o ajuste fino que este plano
existe para permitir — e é o que o `KITS` cravado em TypeScript nunca deu.
Os 10 `PADRAO.md` do canvas viram essas páginas por leitura, não por redesenho.

O que NÃO cabe numa camada, porque não é estilo: margens, safe area por
formato, faixa de tinta e raio do halo, preferência de canto da logo. Isso é um
JSON curto no projeto (`Project.assinatura`), com defaults sensatos e edição na
aba Marca. As RECEITAS de layout (topo/rodapé/dividido, serviço no rodapé, logo
oposta ao bloco) continuam sendo código, parametrizado por esses números — como
o `GEO` do `gerar.py`.

### Consequências para quem consome modelo hoje

53 arquivos leem `isTemplate`. Nenhum é removido neste plano; o pool só deixa de
ser alimentado e deixa de ser o caminho:

- `propor-semana` decide `via: modelo ? 'template' : 'ia'`
  (`propor-semana.ts:590`). Passa a `'compor'` quando o projeto tem página de
  assinatura para o formato; `'ia'` continua sendo o fallback sem ela.
- `executar-plano` ganha a via `compor` ao lado de `template` e `ia`.
- `escolher-modelo`, `listar-modelos`, `plan-week` e o `modeloDoDia` de
  `sugerirPosts` continuam funcionando sobre o pool legado, para os posts e
  skills que ainda o usam. Tema deixa de escolher template: os pilares seguem
  servindo ao PLANEJAMENTO (o que dizer), não à diagramação.
- Variedade entre peças vem da foto (âncora), do rodízio de alinhamento e do
  canto da logo pela luz — não de três páginas irmãs.

## 9. A área livre da foto é o coração do compositor (Ciro, 02/09/2026)

> "A equipe não usa os templates porque depende muito de qual foto será usada de
> fundo: o texto vai onde a foto tem área livre. Definir a área livre é o ideal,
> e não engessar template."

É a confirmação do diagnóstico pelo lado de quem usa: template é posição
decidida ANTES de ver a foto. O compositor decide DEPOIS. O que existe hoje e o
que falta para isso ser bom:

### O que já existe (e é semente, não solução)

- `halo/halo-medicao.ts` mede a foto como ela APARECE (cover), em duas faixas
  apenas: topo (0–40%) e rodapé (60–100%), com luz (média + p75) e energia de
  borda (desvio do laplaciano). `layout-pela-foto.ts` escolhe a faixa mais calma.
  É binário demais: uma foto com o prato à esquerda tem a coluna direita livre
  de cima a baixo, e essa resposta não existe.
- `logo-compositor.ts` (trilha IA) escolhe canto por calma E contraste, com a
  armadilha do `extract().stats()` já resolvida. É o mesmo cálculo, só para a
  logo.
- No canvas, a âncora de cada peça foi escolhida à MÃO no `dados.py`. O editor
  já está à frente do canvas nisto.

### O que o compositor precisa fazer

**1. Mapa de calma da foto, determinístico e de graça.** Grade de ~6×10 células
sobre a foto em cover, cada célula com luz (p98 para a letra, média para a
mancha) e energia de borda. Custa ~100ms no sharp, zero API, sempre igual para
a mesma foto e o mesmo enquadramento.

**2. Candidatos de bloco.** O texto já foi medido (F1 mede cada linha antes de
gerar), então a caixa do bloco tem tamanho conhecido. Os candidatos são os
retângulos dessa caixa nas posições que a receita permite: topo/meio/rodapé ×
esquerda/centro/direita, dentro das margens e fora da safe area do formato.
Cada candidato é pontuado por calma (energia baixa), luz compatível com a cor
do texto (menos halo necessário), distância do assunto (item 3) e preferência da
spec/rodízio. Vence o mais calmo; empate, o mais escuro para texto claro.

**3. Onde está o ASSUNTO.** Calma não basta: uma parede lisa atrás do prato é
calma e é onde o prato está. Duas fontes, em ordem:
- a **descrição do catálogo** já diz o que a foto mostra; falta pedir à visão,
  na análise que a reconciliação já roda por foto, a **caixa do assunto em
  bandas** (lição de 17/08: `gpt-4o` acerta banda e lado com calibração; o
  `mini` numera pela ordem de leitura). Gravar `assunto: {x0,y0,x1,y1}` na
  entrada do catálogo. É UMA chamada por foto, para sempre; as fotos antigas
  precisam de backfill (o diff da reconciliação não retoca entrada existente).
- sem caixa no catálogo, o mapa de energia é a aproximação: o assunto é onde a
  energia é alta.
A regra 4 da geração por IA ("o assunto da foto nunca é coberto") vira regra
mecânica aqui: candidato que cobre a caixa do assunto é descartado, não
penalizado.

**4. O ENQUADRAMENTO também é variável.** Um story 9:16 de uma foto 3:2 usa
menos de metade da largura; deslocar o `crop` para o assunto ficar num terço
abre a coluna oposta inteira. O compositor pode escolher o crop junto com a
posição do texto (o render já lê `style.crop`, e a equipe já tem a ferramenta de
enquadramento na tela para corrigir).

**5. A logo pelo mesmo mapa**, em canto oposto ao bloco, com contraste
(regra do `logo-compositor`: canto claro e liso é o pior lugar para logo
branca).

### O que isso muda no plano

- Entra na **F1**, não em fase própria: sem o mapa, o compositor seria um
  template com outro nome.
- A **régua da F2** confere o resultado: depois de posicionar e compor o halo,
  medir o p98 real sob o bloco e avisar quando a foto não carrega aquele texto
  ali — o "tinta no teto é curadoria, não defeito" do `_halo.py`.
- O sinal de **geometria da F4** ganha o alvo certo: quando a equipe move o
  bloco que o mapa escolheu, o diff diz "o mapa errou nesta foto" — e, com o
  `driveFileId` na spec, dá para aprender por TIPO de foto (prato de cima,
  ambiente, pessoa) qual preferência a marca tem.
- Na tela, a mesma grade pode virar guia visível no editor (calma em verde,
  assunto em vermelho) para quem ajusta na mão. É útil, mas é UI e fica para
  depois da usina funcionar.

### O que fica para o próximo planejamento

A curadoria das 147 páginas existentes: despromover, nunca excluir (posts
agendados apontam para elas por `pageId`). Só depois de a comparação da § 6
sair a favor do compositor, e cliente a cliente. Até lá elas não atrapalham —
custam só o risco de `escolher-modelo` devolvê-las a quem ainda pedir.

**Decisão sugerida: incluir neste plano.** Não como fase nova, e sim como o
DESENHO da F1: sem a página de assinatura, o compositor nasceria com o kit em
código, repetindo o erro do `KITS`. A página de assinatura é F1, junto com o
contrato de nomes de papel da F0.


## 10. Placar da execução (02/09/2026, mesmo dia)

Tudo implementado no branch `editor-como-usina`, um commit por fase, sem push:

| fase | commit | estado |
|---|---|---|
| F0 contrato do Layer | `c255efc2` | ✅ 8 testes; create-page/create-template passam pelo contrato |
| F1 compositor + F2 régua | `a1653195` | ✅ spec → Layer[] pela área livre; régua em processo |
| F3 fila COMPOR | `7d9f57eb` | ✅ migration em dev e produção; cron pega 12 por varredura |
| MCP (5 tools) | `da764625` + F4 | ✅ 467 verificações no registro, 0 falhas |
| F4 memória | `ab881d06` | ✅ snapshot/reverter, sinal `geometria`, destilação em propostas |
| F5 via `compor` | `8e97003a` | ✅ propor-semana, executar-plano, bancada, tools de plano |

**Teste na Lagosta** (§6): a assinatura foi criada em produção (template 381,
páginas story e feed, `Project.assinatura` do PADRAO.md) e a leva de setembro
inteira — 63 peças, mesma copy e mesmas fotos do `dados.py` do canvas — foi
composta e GRAVADA na galeria da Lagosta pelo compositor:

| | |
|---|---|
| peças | 63 compostas, 0 falhas, 902s (14,3s por peça, incluindo régua com 3 renders) |
| posições escolhidas pelo mapa | topo/direita 25 · topo/esquerda 19 · topo/centro 5 · rodapé/esquerda 5 · rodapé/direita 4 · rodapé/centro 4 · meio/direita 1 |
| contraste dentro do alvo + tolerância | 28 de 63 — as outras 35 ficaram no teto da faixa (0,58) e ainda acima do alvo 76 da headline laranja; a leitura vem da sombra no glifo, por decisão da marca |
| custo | zero crédito |

O que a comparação com o canvas ainda não diz: o "gostei / preciso melhorar"
do Ciro nas 63. É esse placar, e não a régua, que decide se os outros nove
clientes entram (cada um precisa do kit lido do próprio PADRAO.md em
`criar-pagina-de-assinatura.ts`).

Ficou de fora, por decisão ou por tempo:
- o `assunto` no catálogo pela análise de visão (o compositor usa a estimativa
  por energia; o contrato do campo está em `compor.ts`);
- curadoria dos 147 modelos antigos (próximo planejamento, despromover);
- gradiente em texto e sombra em três camadas (perdas aceitas na §5);
- a régua como painel visível no editor (o número está em
  `fieldValues.composicao.contraste`; a UI fica para depois).
