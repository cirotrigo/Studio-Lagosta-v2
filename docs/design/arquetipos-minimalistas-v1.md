# Arquétipos minimalistas — v1 (T0, 14/10/2026)

O contrato e o catálogo dos primeiros arquétipos de layout. **O T0 não muda nenhuma peça**: não
toca o compositor, a régua, o tratamento de leitura, a seleção de combinação, o MCP, a Page, o
Prisma nem o editor. Código: `src/lib/compositor/arquetipos/` (`tipos.ts`, `catalogo.ts`,
`validar.ts`, `impressao.ts`). Fonte dos números: `docs/research/canva-minimal-editor-2026-10/`.

## O que é um arquétipo

Uma **gramática de layout**: onde cada papel pode pousar, em que ordem se lê, que elementos
acompanham e que foto favorece a composição.

**Não é** Page, template do banco, assinatura, segunda variante nem tipo novo de arte. Nada aqui
é persistido. No T1a/CP2B, arquétipo + parâmetros + foto + assinatura serão **materializados em
camadas normais**, e a peça persistida continua uma `Page` normal: o editor abre, edita e salva
como sempre.

O arquétipo **não guarda**:

- fonte, peso ou tamanho;
- cor (hex, rgb ou hsl);
- projeto ou cliente.

Isso é da assinatura e do DNA da marca. A cor de um elemento é um **papel** (`texto`,
`destaque`), resolvido depois. O validador recusa `fontFamily`, `fontWeight`, `fill`, `color`,
`projectId` e cor literal em qualquer nível (`CAMPO_PROIBIDO`).

A tipografia entra só como relação:

- o **papel** (`pre`, `headline`, `apoio`, `servico`, `logo`);
- a **prioridade** (`ordemDeLeitura`);
- a **largura** da caixa;
- as **linhas máximas**;
- o **alinhamento preferido**.

**Hierarquia** (a pesquisa distingue três níveis, e o T0 só modela os dois primeiros):

| Nível | O que é | No T0 |
|---|---|---|
| entrada do catálogo | o arquétipo concreto e versionado (`id@versao`, p.ex. `minimal-fb-topo-esquerda@1`) | é o que o catálogo publica |
| `codigoTaxonomico` | o agrupamento conceitual da taxonomia da pesquisa: `MIN-01`, `MIN-02`… | campo obrigatório de cada entrada |
| família macro | a família A–E da pesquisa | **não modelada** |

`codigoTaxonomico` **não** é a família macro A–E. Nenhuma definição publicada tem a chave
`familia` (o teste guarda isso, e o contrato fechado a recusa como `CAMPO_DESCONHECIDO`). Se o
T1a ou um ranking futuro precisar da família macro, ela entra depois, conscientemente, com nome
próprio.

## Assinatura × arquétipo

- **Sem arquétipo** (todo o caminho de hoje): a assinatura decide a geometria, como sempre.
- **Com arquétipo** (a partir do T1a): o arquétipo define as **zonas de composição**. A
  assinatura continua dona da tipografia, das cores, da logo, dos recursos da marca e dos números
  de estilo compatíveis.
- **Nunca duas fontes decidem a mesma posição.** Quando o arquétipo está em jogo, a posição sai
  dele (e da foto, dentro da zona). A assinatura não compete pela posição.
- **Nem dentro do próprio arquétipo há duas fontes.** As `preferencias` (`ancora`, `alinha`,
  `cantoDaMarca`) estão no vocabulário que a spec do compositor já aceita, e o validador exige que
  digam o mesmo que a geometria (`PREFERENCIA_INCOERENTE`):
  - a âncora põe a zona da headline na faixa dela:
    - topo: até 40% da altura;
    - meio: entre 1/3 e 2/3;
    - rodapé: a partir de 50%;
  - o alinhamento prende a referência da headline à borda ou ao eixo da zona;
  - `cantoDaMarca: 'auto'` exige a logo automática; um canto fixo exige que a zona da logo fique
    nesse quadrante.

## Área segura

A área segura é uma **restrição global do formato**, não parte da identidade do arquétipo. Os
números não são copiados para o catálogo: o validador lê o piso padrão do compositor,
`NUMEROS_PADRAO.geometria` (em `assinatura.ts`) e `DIMENSOES` (em `spec.ts`).

| Formato | Peça | Margem lateral | Topo | Rodapé |
|---|---|---|---|---|
| story | 1080×1920 | 92 | 188 | 224 |
| feed | 1080×1350 | 92 | 120 | 104 |

**O piso recorta a zona.** A zona efetiva é zona ∩ área segura, e o validador confere que esse
recorte ainda comporta a caixa da referência. Se não comporta, recusa com `FORA_DA_AREA_SEGURA`:
o arquétipo é estruturalmente impossível naquele formato. `AREA_SEGURA_IMPOSSIVEL` recusa um piso
que não deixa espaço útil.

Consequências:

- **Mudar o piso global não obriga a publicar v2**, enquanto o recorte couber. O teste prova isso
  com 20 px a mais no topo do story.
- Hoje toda referência e todo elemento já pousam dentro do piso, e o teste confere isso
  independentemente.
- A conferência tem meio pixel de tolerância: 8,5% de 1080 dá 91,8 px contra a margem de 92, e
  isso é arredondamento, não invasão.
- **O autofix confere outro piso**, o `CANVAS_MARGIN`: lateral 70, topo 120, rodapé 100. Ele é
  mais frouxo em todos os lados, então o que passa aqui passa lá.
- A geometria efetiva de cada projeto é assunto do T1a. A assinatura pode sobrescrever
  `geometria`, e o `montarAssinatura` relê o piso da página.

## Coordenadas e zonas

Tudo em **frações da peça** (0–1): `x` e `w` da largura, `y` e `h` da altura. O pixel não é a
fonte da verdade.

Cada papel posicionado tem duas coisas:

- **referência** `{x, y, w, h}`: a posição base, a da pesquisa;
- **zona permitida** `{xMin, xMax, yMin, yMax}`: a região que a caixa **inteira** do papel pode
  ocupar. O CP2B escolhe a posição final dentro dela, pela foto.

A zona preserva a identidade, e os testes fixam isso:

- a headline fica na faixa da âncora;
- nenhuma zona de texto passa de 30% da altura;
- **as faixas da headline dos três modelos não se sobrepõem** em nenhum formato. Topo-esquerda
  vai até 1/3 da altura; centro-óptico começa em .42 (story) e .40 (feed); base-esquerda começa
  em .66 e .63. A zona sozinha já distingue o modelo.

A logo do centro-óptico não tem caixa. Ela é `{automatica: 'canto-mais-calmo'}`, como o
`cantoDaMarca: 'auto'` de hoje, e só a logo pode ser automática.

**Elementos presos a um papel** (`presoA`) o acompanham na materialização (T1b). A caixa
declarada do elemento vale para o papel na referência. A espessura do traço e a proporção do
desenho são do catálogo de elementos do T1b (encaixe com proporção mantida), não do `h` da caixa.

**Story e feed são definições próprias.** As caixas do feed não são a escala das do story: em
frações, uma escala daria as mesmas caixas, e o teste exige que difiram. A identidade se mantém:

- os mesmos papéis;
- a mesma ordem vertical;
- o mesmo alinhamento.

## Limites de texto

- `linhasMax` é **HARD** (estrutural: a zona não comporta mais) e **obrigatório** para todo papel
  de texto declarado, em cada formato.
- `caracteresPorLinha` é **SOFT**: é a estimativa editorial da pesquisa.

Ninguém recusa copy por contagem de caracteres. Quem decide se cabe é a medição (`medir-copy`),
com a fonte real.

## Versionamento

- A identidade publicada é **`id@versao`**, com `versao` inteira ≥ 1.
- **Versão publicada é imutável.** **Qualquer** mudança é versão nova, publicada ao lado; a
  antiga nunca muda em silêncio nem sai do catálogo. Isso vale para:
  - a geometria e as zonas;
  - os papéis e os elementos;
  - até o texto descritivo.
- `verArquetipo(id, versao)` devolve exatamente aquela versão.
- `verArquetipo(id)` sem versão devolve a **mais recente**, e a cópia traz o `versao` resolvido:
  é o que a peça deve registrar. Para **reproduzir** uma peça, passe sempre a versão gravada; a
  forma sem versão serve só para escolher um arquétipo novo.
- A regra de resolução é pura (`resolverArquetipo`) e testada com várias versões fora de ordem.
- **Impressão** (`impressaoDoArquetipo`): hash determinístico (cyrb53, prefixo `arq1-`) do JSON
  canônico, com as chaves ordenadas.
  - A mesma definição dá a mesma impressão em qualquer ordem de chaves.
  - `undefined` segue o JSON, então a impressão da fonte é a da cópia.
- **A trava das impressões.** O teste fixa a impressão de cada `id@versao` publicada:
  - editar uma versão falha com a mensagem "publique `id@versao+1` ao lado";
  - remover uma versão falha porque uma peça gravada com ela não reproduz;
  - uma versão nova sem impressão cadastrada também falha.
- No T1a, a peça registrará `archetypeId`, `archetypeVersion` e a impressão. O T0 não grava nada,
  não muda a Page e não fixa a forma desse registro.

**Mutabilidade.**

- O tipo é `readonly` inteiro: atribuir é erro de compilação, e o `tsc` confere isso no teste.
- `listarArquetipos` e `verArquetipo` devolvem **cópias**.
- A fonte é privada ao módulo e congelada em profundidade.

## Os três modelos (v1)

Números em frações: `x y w h` para a referência e `[xMin, xMax] × [yMin, yMax]` para a zona.

### `minimal-fb-topo-esquerda@1` — `codigoTaxonomico: MIN-01`

O título fica no topo à esquerda; serviço e logo, na faixa de baixo.

**Preferências e elementos**

- `ancora: topo` · `alinha: esquerda` · `cantoDaMarca: inferior-direito`.
- Papéis: `pre` (opcional) → `headline` → `apoio` (opcional) → `servico` → `logo`.
- Elemento: `fio-fino` opcional, na cor do papel `texto`, preso à headline.

**Foto ideal**

- Topo escuro ou liso; o assunto no meio ou na base.
- Referências: S005, S034, F034.

**Story**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| pre | .085 .12 .50 .03 | [.085, .65] × [.098, .18] | 1 (≈17) |
| headline | .085 .155 .70 .12 | [.085, .835] × [.098, .333] | 2 (≈16) |
| apoio | .085 .285 .60 .06 | [.085, .735] × [.20, .42] | 2 (≈28) |
| servico | .085 .81 .55 .07 | [.085, .685] × [.72, .883] | 2 (≈30) |
| logo | .74 .81 .175 .07 | [.62, .915] × [.72, .883] | — |
| fio | .085 .278 .18 .003 | — | — |

**Feed**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| pre | .085 .11 .50 .04 | [.085, .65] × [.089, .19] | 1 (≈17) |
| headline | .085 .155 .70 .14 | [.085, .835] × [.089, .333] | 2 (≈18) |
| apoio | .085 .305 .60 .07 | [.085, .735] × [.22, .46] | 2 (≈28) |
| servico | .085 .84 .55 .08 | [.085, .685] × [.74, .922] | 2 (≈30) |
| logo | .74 .84 .175 .08 | [.62, .915] × [.74, .922] | — |
| fio | .085 .298 .18 .003 | — | — |

A zona da headline não passa do terço superior.

**Desvio da pesquisa:** o fio vai no respiro entre a headline e o apoio. O "27 / idem" da pesquisa
cai dentro da caixa da headline nos dois formatos.

### `minimal-fb-base-esquerda@1` — `codigoTaxonomico: MIN-01`, com fio em L

O título fica na base à esquerda e a logo no topo à direita. O L (┌, `canto:
'superior-esquerdo'`) é a identidade do modelo.

**Preferências e elementos**

- `ancora: rodape` · `alinha: esquerda` · `cantoDaMarca: superior-direito`.
- Papéis, todos obrigatórios: `headline` → `apoio` → `servico` → `logo`.
- Elemento: `moldura-aberta` obrigatória, na cor do papel `texto`, presa à headline.
  - O L fica na margem do texto.
  - Ele termina 3–4 unidades acima da headline, para conduzir o olho até ela.
  - O braço de cima fica parado, e o fim do braço vertical acompanha a headline (T1b).

**Foto ideal**

- Base escura e lisa (mesa, sombra, balcão); o assunto no meio.
- Referências: S027, F035, F029.

**Story**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| logo | .74 .105 .175 .06 | [.71, .915] × [.098, .20] | — |
| headline | .085 .66 .80 .11 | [.085, .915] × [.66, .80] | 2 (≈18) |
| apoio | .085 .78 .60 .045 | [.085, .735] × [.70, .86] | 1 (≈32) |
| servico | .085 .835 .60 .045 | [.085, .735] × [.74, .883] | 2 |
| moldura (L) | .085 .11 .60 .52 | — | — |

**Feed**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| logo | .74 .095 .175 .07 | [.71, .915] × [.089, .20] | — |
| headline | .085 .64 .80 .12 | [.085, .915] × [.63, .80] | 2 (≈18) |
| apoio | .085 .78 .60 .05 | [.085, .735] × [.70, .87] | 1 (≈32) |
| servico | .085 .85 .60 .06 | [.085, .735] × [.76, .922] | 2 |
| moldura (L) | .085 .10 .60 .50 | — | — |

Duas zonas protegem o L:

- a da headline começa 3 unidades abaixo do fim do L, então ela nunca sobe para dentro dele;
- a da logo começa mais de 24 px depois do braço de cima, que é a folga de colisão do compositor.

**Desvio da pesquisa:** no feed o L tem h .50. A pesquisa dá .46, que termina 8 unidades acima da
headline e quebra a própria regra do acento.

### `minimal-fb-centro-optico@1` — `codigoTaxonomico: MIN-02`

O título curto fica centralizado no meio e o serviço embaixo.

**Preferências e elementos**

- `ancora: meio` · `alinha: centro` · `cantoDaMarca: auto`.
- Papéis, todos obrigatórios: `headline` → `apoio` → `servico` → `logo`.
- A logo vai no canto mais calmo (o MVP da pesquisa). O topo-centro é P1, porque os cantos de hoje
  são quatro.
- Elemento: `spark-4` opcional, na cor do papel `destaque`, logo acima da headline.

**Foto ideal**

- Área lisa e ampla no centro; o assunto deslocado.
- Referências: S006, S040, S009.

**Story**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| headline | .20 .445 .60 .10 | [.15, .85] × [.42, .62] | 2 (≈14) |
| apoio | .25 .56 .50 .05 | [.20, .80] × [.50, .70] | 1 (≈26) |
| servico | .25 .84 .50 .04 | [.20, .80] × [.76, .883] | 1 |
| logo | canto mais calmo | — | — |
| spark | .48 .41 .04 .0225 | — | — |

**Feed**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| headline | .20 .42 .60 .11 | [.15, .85] × [.40, .62] | 2 (≈14) |
| apoio | .25 .55 .50 .06 | [.20, .80] × [.48, .70] | 1 (≈26) |
| servico | .25 .87 .50 .05 | [.20, .80] × [.78, .922] | 1 |
| logo | canto mais calmo | — | — |
| spark | .48 .38 .04 .032 | — | — |

A zona da headline fica perto da faixa do MIN-02, que a taxonomia põe entre 45 e 60 da altura.

**Desvio da pesquisa:** a caixa do spark é quadrada em pixels (43,2 px) nos dois formatos. A
pesquisa dá h .025 e .03, o que deformaria o símbolo de jeitos diferentes em cada formato.

## O validador

`validarArquetipo` e `validarCatalogo` são puros: devolvem a lista de problemas e nunca corrigem.
Entrada malformada vira problema, nunca exceção.

O contrato é **fechado**: em cada nível, só as chaves dele. Uma chave a mais (`peso`, `svgData`,
`tema`) é recusada, não ignorada, porque é por onde fonte, cor e desenho entrariam com outro nome.

| Código | Quando recusa |
|---|---|
| `ID_DUPLICADO` | `id@versao` repetido no catálogo |
| `ID_INVALIDO` | o id não é kebab-case |
| `VERSAO_INVALIDA` | a versão não é inteira ou é menor que 1 |
| `FORMATO_AUSENTE` | falta o story ou o feed |
| `FORMATO_DESCONHECIDO` | formato além do story e do feed |
| `COORDENADA_FORA` | coordenada fora de 0–1 (ou em pixel) |
| `TAMANHO_INVALIDO` | w ou h ≤ 0 |
| `ZONA_INVERTIDA` | zona vazia ou invertida |
| `REFERENCIA_FORA_DA_ZONA` | a referência sai da zona |
| `FORA_DA_AREA_SEGURA` | a zona recortada pelo piso não comporta a caixa, ou o elemento invade o piso |
| `AREA_SEGURA_IMPOSSIVEL` | o piso não deixa espaço útil |
| `SEM_HEADLINE` | o modelo não tem headline obrigatória |
| `PAPEL_DUPLICADO` | papel repetido |
| `PAPEL_FORA_DO_CONTRATO` | papel fora do vocabulário, ou posição/limite de papel não declarado |
| `POSICAO_AUSENTE` | papel ou elemento declarado sem posição num formato |
| `ELEMENTO_DESCONHECIDO` | tipo fora de `fio-fino`, `moldura-aberta`, `spark-4`, ou elemento não declarado |
| `PREFERENCIA_INCOERENTE` | âncora, alinhamento ou canto da marca discordam da geometria |
| `CAMPO_PROIBIDO` | fonte, cor literal ou cliente |
| `CAMPO_DESCONHECIDO` | chave fora do contrato, em qualquer nível |
| `CAMPO_INVALIDO` | código taxonômico, preferência, cor ou canto do elemento, limite (ou a falta dele) ou foto ideal mal formados |

## Próximos checkpoints

- **T1a — materialização.**
  - Arquétipo + parâmetros + foto + assinatura viram `Layer[]` de uma Page normal.
  - A peça registra o arquétipo, a versão e a impressão.
  - Ficam para lá:
    - a geometria efetiva por projeto (zona ∩ piso da assinatura daquele projeto);
    - onde e em que forma a procedência é gravada;
    - como a assinatura cede a posição sem duas fontes;
    - o que fazer com um bloco `cta` e com o formato `quadrado` sob arquétipo (hoje, fora do
      vocabulário: recusar ou mapear).
- **T1b — elementos.**
  - Materializar `fio-fino`, `moldura-aberta` (com o canto) e `spark-4`.
  - O SVG nasce ali, não aqui, com espessura e proporção próprias.
  - Fica para lá também como o elemento acompanha o papel a que está preso.
- **CP2B — posição pela foto.** Escolher a posição final dentro da zona e separar as polaridades no
  espaço. É a zona deste catálogo que limita a busca.
