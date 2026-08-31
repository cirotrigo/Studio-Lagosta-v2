# Canvas de design: a arte do Instagram feita em HTML, editável e sem crédito

Sessão de 24-25/08/2026. Começou como programação semanal do O Quintal
Parrilla e terminou num **método novo de produzir arte**: a peça é escrita em
HTML, publicada num canvas que o Ciro edita no navegador, renderizada em
1080x1920 com as fontes reais da marca e ingerida no Studio pelo caminho de
sempre. **Zero crédito de imagem.**

O que motivou: o placar de qualidade do Quintal na via de IA era **0 "gostei"
contra 14 "preciso melhorar"**, com as mesmas queixas se repetindo desde
17/08 — título grande demais, véu cobrindo a foto, logo no canto que o
Instagram ocupa, e texto com erro de grafia dentro do PNG (irreparável sem
regerar).

---

## 1. O que foi feito antes do canvas

### 1.1 A cadência do Quintal virou regra escrita

Não existia. A grade era inferida do histórico a cada semana. O Ciro definiu
e foi gravada na base como **`Padrões de Postagem — O Quintal Parrilla`**
(categoria POLITICAS):

- **08h, todo dia**: funcionamento e endereço, sempre com foto de ambiente. O
  horário é o do próprio dia (seg 11h-16h, ter-sáb 11h-00h, dom 11h-17h).
- **Entre 9h e 10h, seg a sex**: almoço executivo, anunciando 11h às 16h.
- **Entre 14h e 14h30, ter a sex**: happy hour, 16h às 19h.
- O resto é livre, nos horários que a casa já pratica.

### 1.2 🔴 O happy hour estava errado em TRÊS entradas da base

A base dizia 17h às 19h; o `approvalChecklist` do DNA dizia 16h às 19h. O Ciro
confirmou **16h**, e as três entradas foram corrigidas — a terceira estava
escondida na frase *"happy hour, que começa 17h, é postado às 14h30"*, numa
entrada cujo título não menciona happy hour.

**Depois disso, QUATRO das artes de referência do próprio cliente foram lidas
e todas trazem "16h às 19h" escrito na peça.** A base mentia contra quatro
fontes visuais independentes.

> **Regra**: ao corrigir um dado da base, procure TODAS as ocorrências — o
> mesmo fato se repete em entradas que não têm o assunto no título. E as
> artes aprovadas do cliente são fonte de verdade tão boa quanto a base.

### 1.3 Os formatos de serviço são vocabulário fechado da marca

As correções que o Ciro fez à mão na bancada (`Funcionamento - 11h às 00h`,
`Almoço Executivo - 11h às 16h`, `Segunda a sexta - 11h às 16h`) **não eram
preferência pessoal**: aparecem literalmente nas artes do designer. O padrão
já existia, só não estava escrito.

Estrutura de copy que ele aplica: **3 blocos, sem CTA** — título, apoio,
serviço. Foi disso que a biblioteca de layouts saiu.

### 1.4 O Quintal voltou ao modo estrito de referência

[PR #76](https://github.com/cirotrigo/Studio-Lagosta-v2/pull/76), mergeado
como `312fe96b`. O projeto 2 entrou em `PROJETOS_COM_MODELO_ESTRITO`
(`src/lib/ai/modelo-livre.ts`): a arte de referência do rodízio volta a mandar
na POSIÇÃO dos blocos, não só em tipografia e cor.

O Quintal foi o piloto do modo livre em 17/08 e foi o primeiro a regredir. O
feedback que decidiu: *"o título e o subtítulo ficaram muito grandes **e fora
do padrão da arte de referência**"* — proporção entre níveis é justamente o
que o modo livre promete preservar.

---

## 2. O método do canvas

### 2.1 O ciclo, ponta a ponta

```
plano do Studio  →  gerar artboards  →  canvas publicado  →  [Ciro revisa]
                                                                  ↓
     agenda  ←  upload-creative  ←  render 1080x1920  ←  ler o canvas de volta
```

Nenhuma etapa gasta crédito de imagem. As 21 peças da semana custariam ~525
créditos pela via de IA.

### 2.2 Os arquivos de trabalho

Em `design-canvas/semana-quintal/`:

| arquivo | o que faz |
|---|---|
| `gerar.py` | monta os 21 artboards a partir de `slots.json`, nos 5 layouts |
| `render.py` | achata o `.dc.html` em HTML puro e renderiza em 1080x1920 |
| `medir.py` | mede o contraste do fundo na faixa onde o texto pousa |
| `slots.json` | a grade exportada do plano (horário, tema, copy, foto) |
| `mapa.json` | liga artboard ↔ slot ↔ layout ↔ arquivo de foto |
| `canvas-c{1,2,3}.json` | o layout de cada canvas (posição dos artboards) |

### 2.3 A biblioteca de layouts

**Sai das artes marcadas com estrela na galeria** (`Generation.styleRefAt`) —
não de invenção. No Quintal eram 17: 6 peças do designer, 6 de template e 5
geradas por IA que ficaram boas. Todas lidas, cinco padrões identificados:

| | descrição | quando usar |
|---|---|---|
| **L1** | headline no topo à esquerda; rodapé com marca, divisória e serviço | institucional |
| **L2** | foto domina; bloco no terço inferior esquerdo | prato, produto |
| **L3** | script grande centralizado no topo; serviço no canto inferior | celebração |
| **L4** | headline centralizada; faixa de rodapé com serviço e marca | funcionamento |
| **L5** | marca no topo; bloco centralizado no rodapé | foto com miolo forte |

O que atravessa os cinco: headline em dois níveis (serifada/leve + script
Amithen), uma palavra-chave em verde dentro da frase creme, separadores
discretos, serviço em Acumin. **Caixa alta só na Acumin** — nunca na Amithen
ou Domani, como o DNA manda.

---

## 3. Como replicar para outro cliente

### Passo 1 — Levantar o kit da marca

```
CustomFont  (projectId) → arquivos .ttf/.otf das fontes
Logo        (projectId) → variantes de cor e formato
BrandDNA               → paleta, regras de composição, checklist
```

No Quintal apareceram **13 arquivos de logo**: a marca em 4 cores (branca,
verde, marrom, preta) × 2 formatos (horizontal 3,8:1 e vertical), mais setas
manuscritas. Isso resolve contraste sozinho — branca sobre foto escura, verde
sobre clara. **Meça a luminância da tinta para saber qual é qual**; não confie
no nome do arquivo (`Ativo_1logo.png`, `Ativo_3logo.png`…).

### Passo 2 — Subsetar as fontes

```bash
python3 -m fontTools.subset FONTE.otf --text="<alfabeto PT-BR>" \
  --flavor=woff --layout-features='*' --output-file=FONTE.woff
```

woff2 corta mais ~30%, mas exige `pip install brotli`.

⚠️ **Fonte script não comprime**: a Amithen ficou em 230 KB com ou sem as
features de layout (testado). São os contornos, não as ligaturas.

### Passo 3 — Ler as referências e montar a biblioteca

Buscar `styleRefAt IS NOT NULL` do projeto, baixar tudo, olhar uma a uma e
catalogar os padrões. **Não invente layout** — o repertório da marca já
existe nas peças aprovadas.

### Passo 4 — Exportar a grade e as fotos

Do `PlanoDeConteudo` do cliente: horário, tema, copy e `fotoDriveId` de cada
item, consolidando duplicados pelo `updatedAt` mais recente. Baixar as fotos
do Drive (`GOOGLE_DRIVE_REFRESH_TOKEN` no `.env`), recortar em 9:16 e reduzir
para **520x924 a ~50 KB** — o canvas só precisa de preview; o render final
pode usar a original.

### Passo 5 — Gerar, sementear, publicar

```bash
python3 gerar.py                      # 21 artboards + mapa.json
node "<skill>/seed-canvas.mjs" --template ... --out CLIENTE-BLOCO.html \
  --title "..." --artboard X.dc.html --image img/x.jpg --canvas canvas-c1.json
node "<skill>/seed-canvas.mjs" --check CLIENTE-BLOCO.html
```

Publicar com o `Artifact`, **pinado em `contract: "0.1.31"`** e com
`capabilities: {self: {}, downloads: {}}` no primeiro publish.

**Três canvases por semana**, não um: cada artboard carrega ~376 KB de fontes
embutidas, e 21 numa página só dariam ~11,6 MB contra o teto de 16 MB. Com 6
a 9 peças cada, ficam entre 4 e 6 MB.

### Passo 6 — Render e ingestão

```bash
python3 render.py Seg0800.dc.html ...   # PNG 1080x1920
python3 medir.py *.dc.html              # contraste do fundo
```

Depois `upload-creative` (MCP local, lê do disco) e `colocar-na-agenda` com o
`generationId` devolvido. **Sempre como rascunho.**

🔴 **FOTO de carrossel não passa por aqui** (decisão do Ciro em 30/08/2026):
o canvas renderiza ARTE (peça com texto diagramado no quadro, que sai fechada
em 1080x1350 no feed e 1080x1920 no story). Carrossel de curadoria — que é o
padrão do feed — leva a foto **ORIGINAL**, sem pré-corte: o enquadramento é
escolhido no editor da agenda, slide a slide. Cortar antes tira essa escolha.

🔴 **É `upload-creative` — NUNCA `upload-to-drive` + `colocar-na-agenda` com
`mediaUrls`.** A leva do By Rock de 30/08/2026 foi pelo atalho do Drive e as
sete artes chegaram à agenda **sem existir nos Criativos**: sem Generation não
há revisão da arte, e sem PÁGINA não há `ajustar-arte` nem `conferir-arte` —
some o ciclo inteiro de correção. `upload-creative` cria os dois (Generation +
página editável) lendo o PNG do disco; o Drive é destino de FOTO de acervo,
não de peça pronta. Desde 30/08 `agendarPost` registra uma Generation por
mídia como rede de segurança, mas ela nasce **sem página** — a rede evita o
buraco, não substitui o caminho certo.

⚠️ Antes de renderizar para valer, **leia o canvas de volta**: WebFetch da URL
do artifact → `seed-canvas.mjs --extract <arquivo salvo> --to <pasta nova>`.
As edições feitas no navegador vivem no artifact, não nos arquivos locais.

---

## 4. 🔴 Armadilhas medidas — leia antes de escrever qualquer artboard

### 4.1 O editor faz layout por FLUXO, não posicionamento livre

Três tentativas gastas até entender:

1. **`position: absolute` com left/top** — o editor não move nada. Não há
   container onde reordenar.
2. **Flex, com todo o texto num bloco** — move o grupo inteiro, nada dentro.
3. **Flex, cada linha como item direto** — funciona: selecionar, reordenar,
   alinhar e espaçar cada linha.

Mesmo na forma 3 **não existe arrastar para uma coordenada arbitrária**. O que
há é ordem, `align-self`, `gap` e margem. Para posição exata, ajuste no
gerador — e aí vale para as 21 de uma vez.

### 4.2 🔴 Nenhum bloco pode depender de herdar do pai

Tamanhos em `em` sobre um `--base` declarado no elemento raiz: ao mover um
bloco no editor, ele sai da hierarquia, **a fonte encolhe e o item encosta no
topo**. Sintoma exato relatado pelo Ciro.

**Cada bloco carrega o próprio tamanho em px e cada véu o próprio `--veu`.**
O preço é perder o controle global de escala do texto — que só existia para
multiplicar a variável herdada.

### 4.3 🔴 A fórmula do véu não pode viver em dois lugares

O gerador escreve o `.dc.html`; o achatador do render precisa chegar ao mesmo
resultado. Se os dois calculam o gradiente, divergem sem ninguém ver.

**Solução**: a fórmula vive só no CSS do artboard (classes `.veu-t` / `.veu-b`
usando `var(--veu)`), e o `.dc.html` carrega apenas números. O achatador copia
o CSS literalmente.

`calc()` dentro do alpha (`rgb(31 27 22 / calc(var(--veu) + 0.10))`) funciona
no Chrome — testado contra o `rgba()` literal equivalente.

### 4.4 🔴 O véu precisa de PLATÔ na faixa do texto

Um gradiente que nasce forte na borda e decai enfraquece justamente embaixo
das letras. Medido: o texto sumia sobre prato branco e teto claro.

O véu correto fica **denso e constante até ~36-40% da faixa** e só então
decai. E a altura da faixa tem de ser grande o bastante para o texto caber
dentro do platô, em vez de cair na cauda.

### 4.5 🔴 A medição de contraste se mede a si mesma

Medir a peça renderizada inclui as próprias letras creme (~240) no percentil.
Resultado: uma peça legível foi reprovada (p90 = 178) e o número não dizia
nada sobre o fundo.

**`medir.py` renderiza com texto e logo ocultos** (`display: none` nos filhos
que não são a foto nem os véus) e mede só foto + véu. Referência: **p98 abaixo
de 150** é confortável.

Foi essa medição que pegou três peças de sábado com a **foto quebrada** —
mediam luminância 27 constante, que é a cor de fundo pura.

### 4.6 🔴 Acento em nome de arquivo quebra em silêncio

`sáb0800.jpg` não resolve como referência e o helper do canvas recusa o nome.
Foi corrigido uma vez com um remendo depois da geração — e a regeração
desfez. **O slug tem de estar no gerador**, não num passo posterior.

### 4.7 🔴 Imagem entra por `<img src>`; `url()` no CSS não resolve

Medido em 26/08/2026 no carrossel de domingo do By Rock. Na mesma peça:

- a logo, como `<img src="./logo-byrock.png">` — **apareceu**;
- a foto de fundo, como `background-image: linear-gradient(...), url('./dom-capa.jpg')`
  — **não apareceu**.

Os quatro slides foram publicados com fundo preto e nenhum aviso. A
substituição do runtime só alcançou o atributo `src` de `<img>`.

O engano custou caro porque tudo o mais estava certo: as imagens foram para o
estado como base64 PURO (sem prefixo `data:`), sob chaves idênticas aos nomes
citados, e o `--check` passou. **O defeito não estava no seed nem no arquivo —
estava só na forma de citar.** Para diagnosticar, abra o bloco de estado e
compare o que resolveu com o que não resolveu; o sintoma é exatamente esse:
o que é `<img>` aparece, o que é `url()` some.

⚠️ A documentação da própria ferramenta afirma que `url(./foto.png)` funciona
em qualquer forma de aspas. **Não funcionou.** Não gaste rodada variando aspas,
`./` ou ordem dentro do `background` — troque a forma.

**A foto de fundo é um `<img>` de verdade atrás do conteúdo**, com o véu como
camada irmã por cima:

```html
<div style="position: relative; overflow: hidden; width: 1080px; height: 1350px;">
  <img src="./foto.jpg" style="position: absolute; top: 0; left: 0;
       width: 1080px; height: 1350px; object-fit: cover; display: block;">
  <div style="position: absolute; top: 0; left: 0; width: 1080px; height: 1350px;
       background: linear-gradient(...);"></div>
  <div style="position: relative; ...">…o texto, em fluxo…</div>
</div>
```

O `position: absolute` daqui **não** contradiz a 4.1: quem é absoluto é o
FUNDO, que ninguém arrasta no editor. O texto segue em fluxo, cada linha como
item direto do flex, como a 4.1 exige.

### 4.8 Peso: o que cabe

| item | tamanho |
|---|---|
| fontes por artboard | ~376 KB (Amithen sozinha, 230 KB) |
| foto 520x924 q≈60 | ~50 KB |
| editor | ~2 MB |
| **teto do artifact** | **16 MB** |

### 4.9 O render precisa do HTML ao lado das imagens

As referências são relativas (`./foto.jpg`). O HTML temporário do achatador
tem de ser escrito **na mesma pasta do `.dc.html`**, senão as imagens não
resolvem e a peça sai só com texto — sem erro nenhum.

---

## 5. Estado da semana de 25 a 31/08

- **21 peças** nos três canvases, revisão pendente com o Ciro.
- **Uma já passou pelo ciclo completo** (segunda 12h, queijo coalho): está na
  galeria e na agenda como rascunho para 31/08 12:00. Foi renderizada com o
  véu ANTIGO — refazer junto com o resto.
- **Nove peças existem em versão de IA** (5 na agenda, 4 com arte pronta), o
  que permite a comparação lado a lado que motivou o piloto.
- 🔴 **Typo "Com melhor da parrila"** na arte de terça 25/08 09:00, que já
  está na agenda. Está dentro do PNG — só sai refazendo a peça.

## 6. O que ficou combinado

- Se o método funcionar, **vira o caminho padrão para os outros clientes**.
- Depois disso, uma **página no Studio** onde a pessoa confirma fotos e copies,
  que eu leio para montar os canvases — fechando o ciclo sem passar pelo chat.
- A escolha de foto acontece **antes** do canvas: dentro dele só existem as
  imagens embutidas, e trocar exige re-seed.
