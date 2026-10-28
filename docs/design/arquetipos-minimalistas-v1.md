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

## T1a — o arquétipo na spec e no compositor (14/10/2026)

O T1a liga o catálogo ao compositor sem busca dentro da zona: a posição é a **referência**. A peça
continua Page normal + `Layer[]` normal + Generation normal.

**O pedido e a forma resolvida.** A spec pública traz `arquetipo: { id }` ou `{ id, versao }`.
Antes de compor (e já na fila e no medir-copy) ela vira `{ id, versao, impressao }`
(`arquetipos/na-spec.ts`), e é essa forma que se grava em `fieldValues.spec`. Uma spec que já traz
a impressão é conferida: divergente, recusa. A recomposição exige a versão e nunca resolve a mais
recente, nem quando o catálogo publica uma versão nova.

**As recusas antes da medida** (`CreativeError`, 422, detalhes estruturados):

| Código | Quando |
|---|---|
| `ARQUETIPO_DESCONHECIDO` / `ARQUETIPO_VERSAO_INEXISTENTE` | id ou versão fora do catálogo |
| `ARQUETIPO_VERSAO_AUSENTE` | peça persistida sem versão (a impressão sem versão já é recusada na forma, `SPEC_INVALIDA`, pelo `validarSpec`) |
| `ARQUETIPO_IMPRESSAO_AUSENTE` | peça persistida sem impressão (a equivalência nunca é presumida) |
| `ARQUETIPO_IMPRESSAO_DIVERGENTE` | a impressão gravada não é a da definição |
| `ARQUETIPO_INDISPONIVEL` | modelo com elemento obrigatório (o L do base-esquerda aguarda o T1b) |
| `ARQUETIPO_FORMATO_NAO_SUPORTADO` | `quadrado` (não se aproxima por story/feed) |
| `ARQUETIPO_SELECAO_NAO_SUPORTADA` | com `selecaoExperimental` |
| `ARQUETIPO_PREFERENCIA_CONFLITANTE` | âncora, alinhamento ou canto da spec ≠ os do arquétipo (`auto` não conta; igual é aceito e dito) |
| `ARQUETIPO_PAPEIS_INCOMPATIVEIS` | papel sem lugar (o `cta`), papel obrigatório ausente, camada extra / `herdaDe`, marca sem logo |
| `ARQUETIPO_LINHAS_EXCEDIDAS` | linhas com texto acima de `linhasMax` (o compositor recusa; o medir-copy declara) |
| `ARQUETIPO_TEXTO_NAO_CABE` / `ARQUETIPO_FORA_DA_ZONA` / `ARQUETIPO_ZONA_EFETIVA_VAZIA` | a caixa (ou seus ornamentos) não cabe na referência ou na zona efetiva — ver a materialização |
| `ARQUETIPO_AJUSTE_FINAL` | na referência, o ajuste final teria de encolher ou mover texto |
| `ARQUETIPO_LOGO_SEM_PROPORCAO` | a logo de referência fixa não tem proporção legível |

**A materialização** (`arquetipos/materializar.ts` e `no-compositor.ts`, as mesmas no compor e no
medir-copy):

- **Unidades.** Cada papel é uma unidade posicional; papéis que a página agrupa não se fundem. A
  segunda voz vai na unidade da manchete. Cada unidade ganha `groupId` próprio
  (`grupo-arq-<papel>`), que a régua e o autofix leem. Dentro da unidade, a página não decide geometria:
  - a ordem é a da copy (a segunda voz depois da manchete; o serviço repartido na ordem das linhas
    do autor), nunca a vertical da página;
  - o vão é o ritmo da casa (`vaoEntre`), nunca o que a página desenhou (`vaoAntes`/encaixe);
  - a pilha que pousa na referência é a dos TEXTOS: os ornamentos do arranjo (ícone, filete, selo)
    são desenhados presos à tinta, sem deslocar a âncora (a extensão conferida é a união dos
    ornamentos de TODO texto da unidade, também o do meio);
  - se, com o texto na referência, os ornamentos saem da zona efetiva, a recusa é
    `ARQUETIPO_FORA_DA_ZONA`, igual no compor e no medir-copy.
- **Coluna.** É a largura da referência menos o padding de desenho, para a caixa caber nela. A
  `larguraMaxima` da assinatura (geometria) sai da conta.
- **Capacidade.** É a altura (e a largura) da referência.
  - A escada de corpo sancionada (até 80%) vale para a altura também, bloco a bloco.
  - Vale também na UNIDADE (`prepararNoArquetipo`): quando a pilha de um papel (manchete + segunda
    voz, texto + elementos presos) passa da referência, a escada daquele papel recomeça um degrau
    abaixo, com o mesmo passo e o mesmo piso.
  - Se nem no piso cabe, `ARQUETIPO_TEXTO_NAO_CABE` traz a referência, a medida e o orçamento da
    unidade: a caixa, a escala e cada bloco. A recusa do bloco por largura traz coluna, altura e
    orçamento por linha.
  - O medir-copy roda a mesma escada e marca como `nao-cabe` os blocos da unidade recusada.
  - **O ajuste final não encolhe peça com arquétipo.** Antes do autofix, as camadas na referência
    passam pela mesma conferência que ele faria (transbordo e colisão, `ajusteFinalNecessario`);
    havendo o que ajustar, a recusa é `ARQUETIPO_AJUSTE_FINAL`, e o medir-copy declara o mesmo
    (`ajustesFinais`). Se o autofix ainda assim mexer num texto, a recusa é a mesma: abaixo da
    escada, a peça sairia menor que o piso de 80% e diferente do que foi medido.
  - A logo de referência fixa sem proporção legível é recusada (`ARQUETIPO_LOGO_SEM_PROPORCAO`).
- **Posição.** A caixa pousa no topo da referência, alinhada como o arquétipo manda. A zona
  efetiva é a do arquétipo ∩ `assinatura.pisoDoProjeto`: a área segura do projeto, antes das
  margens da página, que são geometria da página. Fora dela, `ARQUETIPO_FORA_DA_ZONA`, sem mover
  nada. A zona é conferida de novo depois do autofix e dos elementos presos.
- **Logo.**
  - Na referência fixa, entra em contain: a maior caixa com a proporção do arquivo, rente ao lado
    do canto e centrada na altura.
  - Na automática (centro-óptico), entra no canto mais calmo de sempre (`escolherCanto`), no piso
    do projeto.
  - A logo presa a um arranjo da assinatura sai dele, com aviso: a marca fica uma vez, onde o
    arquétipo manda.
- **Elementos.** Os elementos do arquétipo (fio, spark) não são desenhados no T1a; o diagnóstico
  traz `elementosDeclarados` e `elementosMaterializados: []`. Os elementos dos arranjos da
  assinatura (ícone, filete) continuam, presos aos textos.
- **Corte.** É o central: o T1a não pontua alternativas.
- **CP2A.** O tratamento de leitura por borda, a régua e `TRATAMENTO_PIOROU_LEITURA` rodam como
  sempre sobre as caixas finais.

**A procedência.**

- `fieldValues.spec.arquetipo` guarda `{ id, versao, impressao }`; é a fonte da recomposição.
- `fieldValues.composicao.arquetipo` guarda a procedência:
  - o código taxonômico, o formato e `modo: 'referencia'`;
  - as preferências coincidentes;
  - por papel, a referência, a zona efetiva e a posição;
  - a logo e os elementos.
- `posicao` do diagnóstico traz a âncora e o alinhamento do arquétipo, `candidatos: []`.

**Recomposição.**

- `specComAPosicaoOriginal` não injeta âncora/alinhamento em peça com arquétipo (seriam uma segunda
  fonte); a variante, que é estilo, continua fixada.
- A página editada à mão segue a política de sempre (re-render como está). O arquétipo é
  procedência da peça original: não se "aprende" o arquétipo da edição.

**MCP.** `arquetipo` nas três portas que constroem a peça (compor-arte, compor-leva, medir-copy), com
o schema da spec. `medir-copy` devolve `fixacao.arquetipo` (a versão exata) e a medida contra a
referência. `ver-assinatura` lista os arquétipos com `disponibilidade` (`disponivel` /
`aguarda-t1b`). Nenhuma tool nova.

**Limites conhecidos do piloto.** Nenhum desses casos é escondido; cada um é recusado com o código
correspondente.

- A copy com `cta` ou com camada extra não compõe com arquétipo.
- O modelo 2 espera o T1b.
- A posição é a referência. Uma foto que pede outra posição dentro da zona é o CP2B.

## CP2B — a posição pela foto (14/10/2026)

A busca é PEQUENA e explicável: faixas × candidatos × cortes, sem grid denso, sem aleatoriedade.

| Etapa | Onde | O que faz |
|---|---|---|
| Portão estrutural | `candidatos-espaciais.ts` → `partidaNoArquetipo` | capacidade, logo, zona vazia; o intervalo vertical de cada faixa; resgate da referência cortada pela área segura; recusa o que nenhum `dy` conserta (horizontal, intervalo vazio) |
| Candidatos | `candidatosDasFaixas`, `combinacoesDasFaixas` | ≤ 5 por faixa (≥ 16 px entre si), produto ≤ 25 por corte, ordem fixa (índice 0 = tudo na partida) |
| Foto | `compor.ts` | `cortesCandidatos` (1 ou 3); por corte, raster 540 px b-w, mapa de calma, região protegida (catálogo, ou estimada) |
| Avaliação | `pontuacao-espacial.ts` → `avaliarCombinacao` | elimina pelos hard constraints; estima o tratamento com o planejador do CP2A; componentes da pontuação |
| Escolha | `ordenarAvaliacoes` | filtro sequencial: custo do tratamento → pontuação → referência → corte central → ordem fixa |
| Orquestração | `busca-espacial.ts` → `selecionarNoArquetipo` | busca, ou reprodução da escolha gravada; diagnóstico compacto |

**Decisões.**

- **Faixa, não papel solto.** Mover pre, headline e apoio separadamente quebraria o ritmo e a ordem
  que a referência desenha (e o fio/spark do T1b, presos à manchete). A faixa sai das ZONAS, sem
  campo novo no catálogo (versão publicada é imutável).
- **Logo de referência fixa acompanha a faixa do serviço**: a linha de baixo do topo-esquerda é
  serviço + logo. Ela não é avaliada (sem inteligência nova); o contraste dela é do CP3 — a busca
  pode pousá-la sobre uma borda de tom (visto nas provas).
- **Só a região anotada é hard.** A do catálogo elimina; a estimada pela energia é um patamar antes
  do custo do véu (não cobrir vence cobrir; nunca elimina — como recusa dura, a borda de uma faixa de
  luz zerava a foto; atrás do véu, o texto ia para cima do prato). Catálogo indisponível (erro que
  não é `SEM_CATALOGO`) recusa a peça com arquétipo (`CATALOGO_INDISPONIVEL`, transitório) em vez de
  cair na estimada; o diagnóstico diz a origem (`regiaoProtegida`, só quando ela existiu: sem foto, ou
  sem região estimável, o campo some). O CORTE que mostra menos de 75% do assunto do catálogo é inválido
  sempre: se nenhum preserva, a peça nova recusa (`SEM_COMBINACAO`, motivo `CORTE_PERDE_O_ASSUNTO`); só a
  peça do T1a reproduzida segue com aviso. A foto pedida é obrigatória e vem
  por uma fonte: a que não carregou é `FOTO_INDISPONIVEL` (transitório), `url` + `driveFileId` é
  `ARQUETIPO_FOTO_AMBIGUA` (o resolvedor desenharia uma e o catálogo protegeria a outra); a URL do Drive
  usa o catálogo do id que carrega.
- **A borda do véu é a geométrica da posição candidata** (a da régua). A primeira versão fixava a da
  referência e, no centro-óptico, a régua corrigia o véu da outra borda (revisão adversarial).
- **Resgate vertical.** A referência é preferência: com a área segura do projeto cortando a
  referência, a faixa desce/sobe o mínimo para caber (aviso). Na horizontal não há resgate.
- **Tratamento como custo dominante** (a ordem do owner: sem véu → véu mais leve → calma → assunto →
  referência). Consequência medida: em foto clara e uniforme com texto claro no centro-óptico, o
  conjunto central desce para perto do rodapé, onde o véu do rodapé fica mais leve — é a regra, não
  ruído.

**Exemplos de candidatos (story, piso padrão, as caixas das provas).** Topo-esquerda: {headline,
apoio} `dy ∈ [−109, 144]` → 0, −109, −54, 72, 144; {servico, logo} `dy ∈ [−172, 23]` → 0, −172, −86,
23 (20 combinações por corte). Centro-óptico: {headline, apoio} `dy ∈ [−47, 212]` → 0, −47, −23, 106,
212; {servico} `dy ∈ [−153, 31]` → 0, −153, −76, 31. O intervalo depende da caixa REAL de cada peça.

**Provas visuais**: `direcao-de-arte/__tests__/cp2b-provas.test.ts` (com `PROVAS_DIR`) renderiza, pelo
renderizador do Studio, a referência, a vencedora, a rejeitada e a eliminada de 8 cenários, mais
estabilidade e recomposição.

## CP3 — a legibilidade da logo (15/10/2026)

A logo é medida pixel a pixel contra o fundo efetivo (`legibilidade-da-logo.ts`, p10 ≥ 45 sob alfa ≥ 128)
depois da régua, com as camadas finais. No **topo-esquerda** a logo é FIXA: só a variante muda (entre as
autorizadas: a da página de assinatura e as `Logo` principais do projeto), na mesma caixa (contain da caixa
materializada). No **centro-óptico** a logo automática pode ir a outro canto livre quando o mais calmo não
lê. Nenhuma variante é fabricada e nenhum véu nasce para a logo; sem solução, `LOGO_SEM_VARIANTE_LEGIVEL`;
arquivo que não carrega, `LOGO_INDISPONIVEL`. A escolha grava `escolha.logo` e a recomposição a reproduz.
Detalhe em `docs/regras/compositor.md`, seção "Legibilidade da logo (CP3)".

## Próximos checkpoints

- **T1a — materialização.** Feito em 14/10/2026 (ver a seção T1a acima); o que segue é o plano original.
  - Arquétipo + parâmetros + foto + assinatura viram `Layer[]` de uma Page normal.
  - A peça registra o arquétipo, a versão e a impressão.
  - Ficam para lá:
    - a geometria efetiva por projeto (zona ∩ piso da assinatura daquele projeto);
    - onde e em que forma a procedência é gravada;
    - como a assinatura cede a posição sem duas fontes;
    - o que fazer com um bloco `cta` e com o formato `quadrado` sob arquétipo (hoje, fora do
      vocabulário: recusar ou mapear).
- **T1b — elementos.** Feito localmente em 24/10/2026 (ver a seção "T1b — os acentos" abaixo); o que segue
  é o plano original.
  - Materializar `fio-fino`, `moldura-aberta` (com o canto) e `spark-4`.
  - O SVG nasce ali, não aqui, com espessura e proporção próprias.
  - Fica para lá também como o elemento acompanha o papel a que está preso.
- **CP2B — posição pela foto.** Feito em 14/10/2026 (ver a seção CP2B acima).

## T1b — os acentos (24/10/2026)

Os elementos declarados viram camadas `shape` com o desenho do asset V2 de mesmo id (`SHAPES_LIBRARY`):

| Elemento | Forma | Canal | Cor | Como acompanha a headline |
|---|---|---|---|---|
| `fio-fino` (topo-esquerda, opcional) | `line`, traço 2 | preenchimento | a da manchete | o vão declarado (.003 da altura) abaixo do FIM da caixa real; rente à tinta |
| `moldura-aberta` ┌ (base-esquerda, obrigatória) | `svg-path` `M0 100 L0 0 L100 0`, traço 2 | contorno | a da manchete | braço de cima parado em `y`; fim do vertical o vão declarado (3–4 unidades) acima do topo real |
| `spark-4` (centro-óptico, opcional) | `svg-path`, travado | preenchimento | o destaque da manchete (sem destaque de cor: a dela) | o vão declarado acima do topo real, centrado na caixa real |

Com a manchete na referência, cada acento pousa na caixa declarada (os testes conferem os 3 × story/feed).
Opcional que não cabe (área segura do projeto, encosta em texto ou logo) sai, dito; obrigatório recusa
(`ARQUETIPO_ELEMENTO_NAO_CABE`). A receita e a cor resolvida ficam em `composicao.arquetipo.acentos` e a
recomposição só desenha por elas (sem depender do catálogo de elementos vivo); a logo do CP3 desvia dos acentos;
`elementosMaterializados` lista os desenhados. Regras e lacunas em `docs/regras/compositor.md`,
seção "Acentos do arquétipo presos ao texto (T1b)".

## T4-A — o título gigante (24/10/2026)

### `minimal-titulo-gigante@1` — `codigoTaxonomico: MIN-10`

A palavra é a imagem: a headline ocupa a largura útil no topo; o apoio pequeno faz contraponto alinhado à direita;
serviço e logo fecham a faixa de baixo.

**Preferências e escala**

- `ancora: topo` · `alinha: esquerda` · `cantoDaMarca: inferior-direito`.
- Papéis: `headline` (obrigatória, **`escala: 'dominante'`**) → `apoio` (opcional, **`alinha: 'direita'`**) → `servico` → `logo`.
- Sem elemento declarado.

**Foto ideal**: metade de cima lisa ou escura; o assunto no meio ou na base. Referências: S025, F014, F018.

**Story**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| headline | .085 .12 .83 .26 | [.085, .915] × [.098, .397] | 2 (≈10) |
| apoio | .55 .70 .365 .07 | [.50, .915] × [.64, .82] | 2 (≈20) |
| servico | .085 .84 .55 .043 | [.085, .635] × [.78, .883] | 1 (≈30) |
| logo | .74 .82 .175 .063 | [.65, .915] × [.78, .883] | — |

**Feed**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres por linha) |
|---|---|---|---|
| headline | .085 .11 .83 .27 | [.085, .915] × [.089, .388] | 2 (≈10) |
| apoio | .55 .68 .365 .08 | [.50, .915] × [.62, .80] | 2 (≈20) |
| servico | .085 .86 .55 .062 | [.085, .635] × [.76, .922] | 1 (≈30) |
| logo | .74 .85 .175 .072 | [.65, .915] × [.76, .922] | — |

**A escala dominante.** `escala` é uma relação do papel, não um corpo (o contrato continua recusando `fontSize`). Sem
ela, a escada só desce a partir do corpo da assinatura (até 80%). Com ela, a escada da headline começa em 8× o corpo
da assinatura e desce até o maior corpo em que a copy cabe na referência (a escada da unidade, com segunda voz, desce
pelo MAIOR corpo dela, para não pular um teto que ainda encolheria a primeira voz); a materialização confere que a caixa real
chega a 80% da largura **ou** 22% da altura da peça, e recusa com `ARQUETIPO_ESCALA_NAO_DOMINANTE` quando não chega.
Copy que não cabe nem no piso continua `ARQUETIPO_TEXTO_NAO_CABE`, nada é cortado. A faixa da headline coincide com a
do topo-esquerda: o que distingue os dois modelos é a escala, não a zona.

**O alinhamento próprio do papel** (`PapelNoArquetipo.alinha`, opcional; rodada 1 do T4-A). Sem ele, o papel segue
`preferencias.alinha`, como sempre (os três do T0 não o têm, e as impressões deles não mudaram). Só em papel de texto que
não é a headline (a dela é o do arquétipo: uma fonte só) e nunca na logo (canto). O validador exige que a referência
encoste na borda da zona do lado dele (ou no eixo, no centro) — `PREFERENCIA_INCOERENTE` se não. A materialização pousa
a caixa por ele, e as camadas saem com o `textAlign` dele (`alinhaDoPapel`), igual no compor, no medir-copy e na busca.

**Desvios da pesquisa**: a zona da headline vai até .397/.388 (não "topo 10–48": a âncora topo pede a zona até 40% e
nenhuma zona de texto passa de 30% da altura); a zona do apoio encosta na do serviço (a busca espacial tem duas faixas);
a logo, que a pesquisa não posiciona, fica no canto inferior direito. Sem sangria no v1.

**Fora desta entrega**: #4 `minimal-fb-base-centro` e #5 `minimal-fb-topo-centro` (logo topo-centro) e #6
`minimal-marca-heroi` (gate de logo) esperam o CP1 (decisão d09).

## T4-E e #15 — o modelo sem foto e a lista tipográfica (24/10/2026)

Registro do contrato que já está no código (a lacuna de documentação foi apontada na revisão do preflight do #16).

- **`fundo: 'liso-claro'`** (família E, MIN-09): a peça não tem foto; o fundo é o `numeros.fundoClaro` da marca
  (`Project.assinatura.fundoClaro`), resolvido por `fundoDaPeca` (`arquetipos/fundo.ts`) — a mesma conta no compor, no
  medir-copy e na página que a aba Layouts grava. Marca sem claro, ou com um que não é claro (luminância < 0,5), recusa
  `ARQUETIPO_FUNDO_INDISPONIVEL`; foto pedida recusa `ARQUETIPO_FOTO_NAO_SUPORTADA`. Ausente = `foto`, como sempre.
- **Recomposição**: o `Page.background` congelado vence a marca de hoje (a troca de paleta não se propaga); página sem
  fundo representável recusa antes de subir PNG ou gravar.
- **Sem foto, sem busca**: cada faixa fica na partida (1 combinação, 0 avaliações), com teto de **3** faixas
  (`faixasSemFoto`); com foto o teto de 2 não mudou. Sem foto ideal; logo sempre fixa (`auto` recusa).
- **`cta` entrou nos papéis do arquétipo** (aditivo): quem não o declara continua recusando o bloco cta.

### `minimal-tipografico-lista@1` — `codigoTaxonomico: MIN-09`

Manchete de até 3 linhas no topo à esquerda; a lista do apoio (`lista: true`, um item por linha autoral, até 3) com um
fio fino obrigatório ACIMA de cada item (`porItem`, no vão `itens.apoio.vao`); rodapé em duas colunas (cta | serviço);
logo no canto superior direito (decisão do owner). Geometria e desvios da S055 no comentário de `catalogo.ts`.

## #16 — o convite tipográfico (24/10/2026)

### `minimal-tipografico-convite@1` — `codigoTaxonomico: MIN-09`

Sem foto, fundo claro da marca, tudo centrado: logo no topo-centro, pré, manchete de 2 linhas, apoio com um fio fino
acima, serviço e, na base, a linha final (o papel `cta`). Cantoneiras emolduram a peça. Referência: F036 (grid-06; só
existe em Feed — o Story é adaptação). Decisões do owner (24/10): d09 liberado **só** para a logo fixa topo-centro deste
modelo, em escala normal, sem tratamento novo (não libera #4, #5, #6 nem marca-herói); fundo F1 claro.

**Preferências**: `ancora: meio` · `alinha: centro` · `cantoDaMarca: superior-centro` · `fundo: liso-claro`.
Papéis na ordem: `logo` → `pre` → `headline` → `apoio` → `servico` → `cta`, todos obrigatórios.
Elementos: `cantoneiras` (obrigatória, presa à PEÇA, `destaque`) e `fio` (`fio-fino`, obrigatório, `presoA: apoio`, acima).

**Story**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres) |
|---|---|---|---|
| logo | .41 .13 .18 .04 | [.30, .70] × [.098, .20] | — |
| pre | .30 .30 .40 .035 | [.15, .85] × [.27, .36] | 1 (≈18) |
| headline | .14 .36 .72 .10 | [.10, .90] × [.34, .52] | 2 (≈14) |
| apoio | .25 .53 .50 .035 | [.15, .85] × [.50, .62] | 1 (≈26) |
| servico | .25 .62 .50 .04 | [.15, .85] × [.58, .70] | 1 (≈30) |
| cta | .32 .80 .36 .035 | [.22, .78] × [.76, .86] | 1 (≈26) |
| fio | .36 .497 .28 .002 | — | — |
| cantoneiras | .085 .10 .83 .78 | — | — |

**Feed**

| Papel | Referência | Zona | Linhas máx. (≈ caracteres) |
|---|---|---|---|
| logo | .41 .125 .18 .045 | [.30, .70] × [.089, .20] | — |
| pre | .30 .32 .40 .04 | [.15, .85] × [.29, .40] | 1 (≈18) |
| headline | .14 .375 .72 .12 | [.10, .90] × [.34, .56] | 2 (≈14) |
| apoio | .25 .56 .50 .04 | [.15, .85] × [.52, .64] | 1 (≈26) |
| servico | .25 .655 .50 .045 | [.15, .85] × [.62, .74] | 1 (≈30) |
| cta | .32 .82 .36 .04 | [.22, .78] × [.78, .90] | 1 (≈26) |
| fio | .36 .537 .28 .003 | — | — |
| cantoneiras | .085 .09 .83 .83 | — | — |

Três faixas por formato: {logo} · {pre, headline, apoio, servico} · {cta}.

**Extensões do contrato** (só no arquétipo; a spec pública e `CANTOS` não mudam):

- **Logo `superior-centro`**: `CantoDaLogo = Canto | 'superior-centro'`. O validador exige a logo fixa (nunca
  automática) com referência e zona no eixo da peça, na metade de cima. A materialização e a caixa de variante do CP3
  (`caixaDaVariante`) centram o contain na referência; a troca de variante autorizada fica no mesmo centro, sem cair num
  canto. O critério do CP3 é o de sempre (p10 ≥ 45 nos pixels alfa ≥ 128 contra o fundo efetivo, só a variante da
  assinatura e `Logo.isProjectLogo`); nenhum canto entra na escolha gravada da logo fixa.
- **Acento preso à PEÇA**: `cantoneiras` é o único elemento sem `presoA` (o validador o proíbe nele e o exige nos
  outros). Pousa na caixa declarada, sem seguir texto, e **ocupa só os quatro braços** (`ocupacaoDoAcento`: a caixa de
  cada subpath do path em uso, mais meio traço) — o miolo, onde textos e logo moram, não é obstáculo. A mesma função no
  compor, no medir-copy, no CP3 (`livre`) e na reconciliação da logo; na recomposição, sempre do path CONGELADO.
- **A cor das cantoneiras** é o destaque da MANCHETE (sem destaque de cor, a cor dela), com `fonteDaCor`
  `destaque-da-manchete (cantoneiras)`, congelada como nos outros acentos.

**Desvios da F036**: fundo claro da marca, não o cetim escuro texturizado; um fio só (o segundo, abaixo do apoio, fica
de fora); sem os sparks que ladeiam o apoio; a marca de texto vira a logo em contain; o braço da cantoneira é o do asset
(25% da caixa em cada eixo — no Story, mais longo na vertical: aceite visual pendente do owner); a linha da URL é o `cta`
escrito pelo autor, com o estilo inteiro da assinatura (inclusive o prefixo). Ajuste da execução sobre o preflight: a
referência da manchete no Feed tem h .12 (não .11), a mesma folga proporcional do Story.

## #16 @2 — cantoneiras de braço igual e margens (24/10/2026)

O owner recusou esteticamente o C1 (braço de 25% da caixa por eixo: 224 × 374,5 px no Story) e escolheu o C2. Publicado
`minimal-tipografico-convite@2` (impressão `arq1-01570f16b5b8cb`) **ao lado** do `@1`, que não mudou um byte
(`arq1-1cdd408f7eeb8d`). O asset global `cantoneiras@1`, as áreas seguras e os renderizadores não mudaram.

- **Braço igual**: o elemento `cantoneiras` declara `braco: 0.12` (fração da LARGURA, igual nos dois eixos): round(0,12 ×
  1080) = **130 px** em Story e Feed. A peça nova deriva o path (`pathDasCantoneiras`, mesma ordem de subpaths do asset;
  25/25 reproduz o asset byte a byte) e o congela na receita com `derivacao: { regra: 'bracos-iguais', bracoPx: 130 }`,
  também em `metadata.compositor.acento`. Uma camada, quatro Ls; ocupação de 4 caixas 132 × 132.
- **Guarda do desenho** (`incoerenciaDoDesenho`, em `posicionarAcentos`): confere o PATH congelado no retângulo final
  (4 subpaths M/L de 3 pontos, cada L num canto distinto ±0,5 px, braços H e V = `bracoPx` ±0,5 px para dentro) e a
  derivação contra o elemento. Incoerente: `ARQUETIPO_ELEMENTO_NAO_CABE` 422. Estrutura de `derivacao` malformada:
  `ARQUETIPO_ESCOLHA_ILEGIVEL` 422. A receita sem contexto (inspeção) não tem derivação e é recusada se for usada para
  desenhar o `@2` — não há desenho C1 de reserva. O C1 legado sem derivação segue aceito.
- **Margens**: a caixa da moldura é a do `@1` (já encosta no HARD). Logo e chamada vão para a altura do meio dos Ls,
  conjunto central aberto, manchete com h .11 (Story) e .13 (Feed); toda zona de papel fora da ocupação. Zona do serviço
  no Story **.61–.74** (com .62 só tocava a do apoio: 4 faixas, acima do teto 3 sem foto).

| Story `@2` | referência (x y w h) | zona | | Feed `@2` | referência | zona |
|---|---|---|---|---|---|---|
| logo | .41 .114 .18 .04 | [.30,.70] × [.098,.20] | | logo | .41 .116 .18 .045 | [.30,.70] × [.089,.20] |
| pre | .30 .28 .40 .035 | [.15,.85] × [.27,.36] | | pre | .30 .284 .40 .04 | [.15,.85] × [.27,.40] |
| headline | .14 .352 .72 .11 | [.10,.90] × [.34,.52] | | headline | .14 .35 .72 .13 | [.10,.90] × [.34,.56] |
| apoio | .25 .556 .50 .035 | [.15,.85] × [.50,.62] | | apoio | .25 .572 .50 .04 | [.15,.85] × [.52,.64] |
| servico | .25 .664 .50 .04 | [.15,.85] × [.61,.74] | | servico | .25 .686 .50 .045 | [.15,.85] × [.62,.74] |
| cta | .32 .829 .36 .035 | [.22,.78] × [.76,.875] | | cta | .32 .853 .36 .04 | [.22,.78] × [.78,.90] |
| fio | .36 .523 .28 .002 | — | | fio | .36 .549 .28 .003 | — |

- **Vitrine**: uma versão por id (a mais recente) no Layouts e no `ver-assinatura`; `{ id, versao: 1 }` continua
  resolvível e a recomposição de peça `@1` continua C1.
- **Limites ditos**: a tinta da vertical pinta 1 px fora do `margemH` (colunas de pixel 91 e 988), herdado do C1 — o
  contrato confere a caixa, não a tinta. A folga da manchete no Feed medida é 7,5 px (o preflight previa ≥ 12 supondo o
  corpo do C1; com a referência .13 o corpo sobe de 81 para 84 px). Aceite visual (G-H1) e marcas reais pendentes.

## #8 — divisão com a foto no alto (`minimal-divisao-foto-topo@1`, 24/10/2026)

Publicado ao lado das sete versões (impressão `arq1-03ccaf6af70501`). Fundo novo do arquétipo, **`foto-em-caixa`**: a
foto pousa numa caixa declarada por formato (`formatos.<f>.foto`, em frações) e o texto fica no liso, no **papel** da
marca (escuro `numeros.fundo` ou claro `numeros.fundoClaro`) que atende, pela régua, as tintas que a peça desenha.
Renderizadores, `image-fit`, `NUMEROS_PADRAO`, schema e as sete impressões antigas não mudaram.

| Story | referência (x y w h) | zona | | Feed | referência | zona |
|---|---|---|---|---|---|---|
| foto | 0 0 1 .60 (1080×1152) | — | | foto | 0 0 1 .58 (1080×783) | — |
| headline | .085 .65 .70 .11 | [.085,.835] × [.63,.77] | | headline | .085 .63 .70 .13 | [.085,.835] × [.61,.775] |
| apoio | .085 .775 .70 .05 | [.085,.835] × [.765,.835] | | apoio | .085 .78 .70 .06 | [.085,.835] × [.765,.85] |
| servico | .085 .84 .60 .04 | [.085,.685] × [.83,.883] | | servico | .085 .86 .60 .05 | [.085,.685] × [.845,.922] |
| logo | .74 .83 .175 .05 | [.70,.915] × [.82,.883] | | logo | .74 .85 .175 .06 | [.70,.915] × [.84,.922] |

Papéis: headline obrigatória (2 linhas, com a voz 2), apoio opcional (2), serviço obrigatório (1), logo obrigatória;
`pre` e `cta` recusados no `@1`. Uma faixa por formato, só a partida. Referências = as literais do catálogo candidato;
zonas do preflight T3-B (HARD, abaixo da junção).

Decisões (D1–D8, preflight T3-B):

- **D1** fundo `foto-em-caixa` + caixa por formato; zonas e elementos disjuntos da caixa (`ZONA_SOBRE_A_FOTO`); logo fixa.
- **D2** papel por contraste real, depois da preparação, sobre as tintas ATIVAS (`tintasAtivas` + `papelDoBloco`); no
  medir-copy, por variante.
- **D3** régua pós-render não-ok no liso = aviso (a escolha já usa o mesmo critério).
- **D4** ampliação acima de 1,0× = aviso com o fator (`diagnostico.foto.escala`), sem veto.
- **D5** `pre`/`cta` recusados no `@1`; nos Layouts, recorte autoral pelo histórico do contrato da página nova.
- **D6** sem foto: recusa só no compor (`ARQUETIPO_FOTO_AUSENTE`); medir sem foto é provisório pela falta da identidade.
- **D7** sem `variante.ts`: a síntese em memória do T1a já é a variante do arquétipo.
- **D8** gate de autonomia e revisor inalterados, *fail-closed* para a foto em caixa (R1): toda peça #8 em leva
  autônoma vai para revisão humana até o revisor aprender a foto em caixa.

Limites ditos: elementos do arranjo (ícone, filete, selo) e sombra ficam fora da conta do papel, como na régua; o aceite
visual (G-H1) é do owner depois das provas; marcas reais, Drive e Blob reais não foram exercitados.

## #4 — base centrada com a logo no topo-centro (`minimal-fb-base-centro@1`, 24/10/2026)

**Status (25/10/2026):** guardado para avaliação — fora da vitrine (aba Layouts e `ver-assinatura`), ainda no catálogo e resolvível por id e versão (pedido explícito e replay); o aceite visual G-H1 segue adiado pelo owner.

Publicado ao lado das oito versões (impressão `arq1-15c914b2112ca8`; as oito antigas não mudaram um byte). MIN-01, foto
**inteira** (sem `fundo`), sem elementos. A manchete centrada na base, o serviço logo abaixo e a logo **fixa** no
topo-centro (`cantoDaMarca: 'superior-centro'`), em contain e escala normal. O delta de produto é só a definição no
`catalogo.ts`: `tipos`, `validar`, `materializar`, busca, compor, CP3, medir-copy, Layouts, gate e revisor já tratavam o
`superior-centro` sobre foto (preflight cp-t4-a-4, §2).

| Story | referência (x y w h) | zona | | Feed | referência | zona |
|---|---|---|---|---|---|---|
| logo | .41 .105 .18 .045 | [.30,.70] × [.098,.20] | | logo | .41 .105 .18 .045 | [.30,.70] × [.089,.20] |
| headline | .12 .66 .76 .12 | [.10,.90] × [.63,.79] | | headline | .12 .64 .76 .12 | [.10,.90] × [.61,.775] |
| servico | .20 .80 .60 .08 | [.15,.85] × [.785,.883] | | servico | .20 .80 .60 .08 | [.15,.85] × [.77,.922] |

Limites de texto nos dois formatos: headline 2 linhas (≈16 caracteres, a voz 2 conta), serviço 2 linhas (≈30). Duas
faixas por formato: `[headline, servico]` e `[logo]` — o teto com foto.

**Superação do "Fora desta entrega" do T4-A** (seção "T4-A", acima): o d09 de 24/10 ("#4 e #5") liberou o #4 com a logo
fixa no topo-centro, escala normal, sem tratamento novo. O texto histórico fica como estava; o #5 (pílula) e o #6
(marca-herói, CP1) continuam fora.

**Desvios do catálogo candidato**: o catálogo não dá x/w, e as larguras são as da prévia que o owner viu no d09 (logo
41/18, manchete 12/76, serviço 20/60); a zona do serviço sobe até tocar a da manchete (.785 / .77) para as duas formarem
UMA faixa (separadas seriam 3, acima do teto com foto: `ARQUETIPO_LIMITE_DA_BUSCA`); a logo é a mesma fração nos dois
formatos (o catálogo dá a mesma faixa), e a identidade Story × Feed fica na manchete (.66 contra .64).

Decisões (preflight cp-t4-a-4, D2–D5):

- **D2 papéis**: headline e serviço obrigatórios, logo obrigatória. `pre`, `apoio` e `cta` recusam no `@1`
  (`ARQUETIPO_PAPEIS_INCOMPATIVEIS`, no compor e no medir-copy); nos Layouts saem em `foraDoLayout`, com a revisão do
  sistema no histórico do contrato da página nova. Apoio opcional fica como candidato a `@2`, se o owner pedir.
- **D3 logo fixa**: contain centrado na referência, nunca automática nem num canto. A faixa só da logo fica no `dy` 0
  e só sai dele quando a posição 0 é eliminada (região protegida do catálogo ou colisão) — e então só na vertical,
  dentro da zona, no eixo. Sem posição livre na zona: `SEM_COMBINACAO`.
- **D4 tratamento = o da família A** (aprovado na rodada 1 do preflight como preservação, sem pergunta nova ao
  owner): o CP2A trata o rodapé dos textos; no topo, a borda só da logo, vale a regra antiga de 02/09/2026 — o véu fraco
  automático da logo (metade da necessidade) entra se a necessidade passar de 0,5, FICA quando salva a logo e SAI quando
  não salva (o CP3 mede as variantes sem ele). Nenhum véu novo, nenhum ramo novo, nenhum CP1.
- **D5 CP3 sem mudança**: só variantes cadastradas (`isProjectLogo`), na mesma caixa centrada; sem variante legível,
  `LOGO_SEM_VARIANTE_LEGIVEL`; asset que não carrega, `LOGO_INDISPONIVEL`. A variante escolhida é gravada e reproduzida.

Medido na implementação local (cp-t4-a-4, marca/fotos/logo sintéticas, fontes reais): o véu da logo entra no alto
uniforme ≥ 225 (Story) / ≥ 200 (Feed) e salva a logo clara; no Feed com o alto texturizado em 175 entra e não salva a
escura, e sai. O `tratamentoDeLeitura` do diagnóstico só lista bordas COM texto: o véu da logo no topo do #4 aparece como
camada (`gradiente-leitura-topo`) e, quando sai, em `legibilidade.veusRemovidos` — não em `veuDaLogo`.

Limites ditos:

- **R2**: a posição da logo não é escolhida pela foto; um alto ocupado sem região anotada não a move. A leitura é do
  CP3 (variante) ou recusa.
- **R3**: com a manchete de 1 linha, o vão manchete → serviço na referência cresce (≈163 px no Story, ≈142 no Feed); é
  limite visual para o G-H1, não falha.
- **R4**: o medir-copy não prevê o CP3 — a copy que mede OK pode recusar no compor pela logo, como no #2 e no #16.

O aceite visual (G-H1 do #4) é do owner, depois das provas; marcas reais, Drive e Blob reais não foram exercitados.

## #5 — topo centrado com o serviço em pílula (`minimal-fb-topo-centro@1`, 24/10/2026)

Publicado ao lado das nove versões (impressão `arq1-023d4c649e2482`; as nove antigas não mudaram um byte). MIN-01, foto
**inteira** (sem `fundo`). A logo **fixa** no topo-centro (`cantoDaMarca: 'superior-centro'`, contain, escala normal, CP3
sem mudança), a manchete e o apoio opcional centrados logo abaixo, e na base o serviço de **uma linha** envolvido pela
**pílula de contorno** (`elementos: [{ id: 'pilula', tipo: 'pilula-contorno', opcional: false, corPorPapel: 'texto',
presoA: 'servico' }]`). Preflight e plano: cp-t4-a-5-preflight (rodada 1).

| Story | referência (x y w h) | zona | | Feed | referência | zona |
|---|---|---|---|---|---|---|
| logo | .41 .105 .18 .035 | [.30,.70] × [.098,.17] | | logo | .41 .105 .18 .035 | [.30,.70] × [.089,.17] |
| headline | .12 .155 .76 .12 | [.10,.90] × [.15,.30] | | headline | .12 .16 .76 .12 | [.10,.90] × [.15,.32] |
| apoio | .20 .29 .60 .06 | [.15,.85] × [.27,.40] | | apoio | .20 .30 .60 .07 | [.15,.85] × [.28,.42] |
| servico | .20 .825 .60 .045 | [.15,.85] × [.79,.883] | | servico | .20 .83 .60 .06 | [.15,.85] × [.78,.922] |
| pílula (E) | .17 .815 .66 .065 | — | | pílula (E) | .17 .818 .66 .084 | — |

Limites de texto nos dois formatos: headline 2 linhas (≈16), apoio 2 (≈28), serviço **1** (≈30). Duas faixas por
formato: `[headline, apoio, logo]` (as zonas se tocam) e `[servico]` — o teto com foto; a logo acompanha o `dy` da faixa de
cima dentro da própria zona. Com texto na borda de cima, o véu fraco automático da logo não nasce; a leitura dela é do CP3.

**A pílula** (o acento `pilula-contorno`, o primeiro que ENVOLVE):

- desenho = o asset `pilula-contorno@1` (`rounded-rectangle`, traço 2, raio 9999, contorno), copiado na receita e
  congelado na peça com a cor do serviço (`fonteDaCor: 'texto-do-papel'`); a recomposição desenha pela receita, nunca pelo
  asset vivo;
- medida pela caixa REAL do serviço: borda externa = caixa ⊕ folga da definição (32 × 19 px Story, 32 × 16 Feed), camada
  = borda externa ⊖ 1; acompanha o comprimento do serviço (curto = cápsula curta);
- interior permitido = o contorno CURVO desenhado (os quatro cantos do serviço ≥ 1 px dentro da borda interna do traço);
  medido nas provas sintéticas (serviço 73 × 48 e 395 × 48 px): sobra de 13,6 px no Story e 11,7 no Feed com traço 2;
- a folga conta na zona e na faixa (a busca não tira a pílula da área segura); fora dela, ou encostando noutro texto ou na
  logo, ou cápsula vertical (w < h): `ARQUETIPO_ELEMENTO_NAO_CABE`; abaixo dos textos, fora do piso e da oclusão do gate.

**Desvios do catálogo candidato e do preflight**: a pílula de contorno única é adaptação da casa (S005 tem duas
preenchidas, F010 nenhuma); o catálogo não dá x/w (família do d09/#4); a pílula vai a .815–.88 no Story; **na execução, a
manchete do Feed desceu de .155 para .16** (o literal do catálogo) porque o CP3 exige 24 px entre a logo e os textos e o
vão do preflight era 20 px — com .16 o vão é 27 px (Story: 29 px). A caixa real do serviço (corpo 30, Montserrat 600) mediu
48 px de altura contra 51 estimados no preflight.

Limites ditos: a busca não pontua a calma sob o contorno (L1); acentos não colidem entre si (L2, um só aqui); o asset não é
fixado em versão — peça nova copia o desenho vigente (L3); o medir-copy não prevê o CP3 (L4). O aceite visual (G-H1 do #5)
é do owner, depois das provas; marcas reais, Drive e Blob reais não foram exercitados.

## #9 — divisão com o topo da foto em arco (`minimal-divisao-cor-topo-arco@1`, técnico por fixture, 25/10/2026)

Texto no liso em cima, à esquerda (pré opcional, manchete, apoio opcional), logo FIXA no canto superior direito, foto numa
caixa embaixo (Story y .42 × h .58 = 806,4 · 1080×1114; Feed y .44 × h .56 = 594 · 1080×756) com o topo em ARCO: a
máscara `arco-janela`, raio 0,62 × a largura da caixa (o arco B das amostras aprovadas, "Aprovar B como está"). Sem
serviço nem cta no `@1` (`ARQUETIPO_PAPEIS_INCOMPATIVEIS`); sem o anel claro da referência S024.

- **O que o arquétipo declara**: `mascaraDaFoto: { tipo, raio }` por formato — nunca path. O path é derivado da caixa em
  px na composição, conferido pelos dois parsers e congelado na peça; a recomposição desenha o gravado.
- **Por que derivado e não fixo**: um path fixo 0–100 vira elipse numa caixa não quadrada e muda de forma entre Story e
  Feed. Derivado da caixa real, o alfa é um círculo de raio 0,62 L nos dois formatos (paridade editor × servidor medida
  no Node: 0 px acima de 32 níveis; borda a ≤ 0,4 px do círculo).
- **O assunto conta no arco**: os cantos de cima da caixa ficam no liso; um assunto catalogado escondido ali reprova o
  corte como no #8.
- **A definição final** (adotada na R1 da I9): as referências das amostras, salvo as de TEXTO com w .602 (650 px, a
  coluna justa de 636 que a manchete de 87 px precisa) nos dois formatos e a da logo do Feed com h .0348 (a logo 94×47
  sem passar da área segura pelo arredondamento). Com ela a peça composta tem as quatro tintas iguais às amostras e o
  PNG do Feed byte a byte igual; o Story só difere pela foto em y 806,4.
- **Estado**: só fixture de teste (I técnica). Publicação no catálogo, card do Layouts com o arco, vitrine, MCP e
  candidatos ficam para a habilitação, com essa definição.
- **Limite**: redimensionar a foto à mão estica o arco; o editor não ganha a máscara na barra de imagem
  (`MASCARAS_DE_IMAGEM` não muda).
- **Adendo H9 (25/10/2026)**: publicado no catálogo com essa definição (impressão `arq1-04603bcf9d7623`); a vitrine
  leva a máscara (`mascaraDaFoto` com o path derivado da caixa, igual ao da peça) e o card do Layouts desenha o arco,
  com a legenda "Foto embaixo com o topo em arco · fundo da marca em cima". Fica em 1º na ordem por id (Layouts,
  candidatos, `ver-assinatura`). A máscara segue fora da barra de imagem, e criar Layouts a partir de uma página #9 pede
  foto (409, como no #8).

## #10 — coluna de foto (`minimal-coluna-foto@1` e `minimal-coluna-foto-esquerda@1`, IH 25/10/2026)

Foto numa coluna de altura inteira, 42,5% da largura, sangrando em cima, embaixo e no lado de fora; texto numa coluna
estreita no liso do outro lado (manchete curta em até 3 linhas, fio fino opcional sob ela, apoio e serviço embaixo); logo
FIXA no canto de cima do lado do texto. Dois ids, um por lado (S050 com a foto à direita, S014 com ela à esquerda), sem
parâmetro de espelho. MIN-05, `foto-em-caixa`; pré e cta fora do `@1`.

- **A definição**: as referências das amostras v2 aprovadas no G-A10 ("dois lados, com o fio"), salvo as de TEXTO com
  w .436 (coluna 456, a manchete de 80 px inteira) e a logo em x .086 (D) / .739 (E), que não passa da zona pelo
  arredondamento para nenhuma proporção. O texto E fica em x .479.
- **O que a IH mediu**: corpos 80/40/30, conteúdo e quebras iguais, foto na caixa exata, tinta dos textos, da logo e do
  fio a ±2 px das 5 peças aceitas; a largura da caixa do texto pela regra justa (470/427/351).
- **Limites**: a coluna estreita depende da quebra do autor; o card do Layouts desenha a coluna como retângulo; a marca
  das amostras é sintética (não valida marca real).
