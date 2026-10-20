# Elementos vetoriais — o que o Canva faz e a biblioteca proposta para o Studio

> Partes 8, 9 e 10 da sessão. Observação black-box no editor do Canva (design de Story em branco, aberto numa aba própria
> do Chrome isolado do REA), só como usuário: buscar, inserir, selecionar, abrir menus, trocar cor, excluir. A leitura de
> cada barra de ferramentas foi feita pela **árvore de acessibilidade** da página (o que um leitor de tela anuncia: nome
> dos botões e o hex de cada swatch), mais captura de tela. Evidências em `evidencias/canva-elementos/`
> (`familias/resultado.json` tem os 78 elementos testados, com cores, botões e alças).
>
> **Esta página especifica a biblioteca; não cria nenhum arquivo SVG** (pedido da sessão).

---

## 1. O painel Elementos do Canva (OBSERVADO)

- Barra lateral: Canva IA · Modelos · **Elementos** · Texto · Marca · Uploads · Ferramentas · Projetos · Apps · Fundo
  (`00-painel-elementos.jpg`).
- Painel Elementos: busca no topo ("Busque elementos"), "Usados recentemente" e **14 categorias** — Formas, Elementos
  gráficos, 3D, Animações, Fotos, Molduras, Grades, Vídeos, Áudios, Formulários, Mockups, Gráficos, Planilhas, Tabelas.
- Resultado de busca separado em abas: Tudo · Elementos gráficos · Formas · Fotos · Molduras · Gráficos · Vídeos · 3D ·
  Mockups · Áudios (`12-busca-minimal-line.jpg`). Dentro de uma categoria, a busca fica restrita a ela.
- Categoria **Formas** (nativas): Linhas, Formas básicas, Polígonos, Estrelas, Setas, Formas de fluxograma, Balões de
  fala, Nuvens, Corações… (`01-categoria-formas.jpg`, `10-forma-editar.jpg`).
- **Inserção:** clique insere no **centro da página** com ~30% da largura — o círculo nativo entrou com 324×324 px em
  x=378, y=798 de uma página 1080×1920, ou seja, centrado (`11-forma-posicao.jpg`).

## 2. Quatro classes de elemento e seus controles (OBSERVADO)

| Controle | Linha nativa | Forma nativa | Gráfico vetorial (SVG) | Gráfico raster |
|---|---|---|---|---|
| Recolor | 1 cor (o traço) | 1 cor (preenchimento) + cor da borda | **1 swatch por cor distinta do arquivo** (1–3 na amostra) | swatches aproximados em 5 de 6 |
| Traço/borda | estilo (contínuo, tracejado longo/curto, pontilhado), extremidades arredondadas, espessura | borda: nenhuma/contínua/tracejada/pontilhada + espessura | "Estilo do traço" = **borda na CAIXA do elemento**, não no desenho; a borda ganha um swatch próprio (`21-grafico-traco-aplicado.jpg`) | idem |
| Extremidades | 10 marcadores de início e de fim (seta, círculo, quadrado, losango, barra, vazados e cheios), botão "trocar extremidades" | — | — | — |
| Tipo | reta · com ângulo de 90° · curva | — | — | — |
| Trocar a forma no lugar | — | **"Editar"** abre a biblioteca de formas e troca mantendo posição e tamanho | "Substituir" | "Substituir" |
| Texto dentro | sim (a linha ganha rótulo) | sim (fonte, tamanho, cor na barra) | não | não |
| Transparência | sim | sim | sim (0–100) | sim |
| Inverter | — (as extremidades fazem o papel) | — | **Inverter horizontalmente / verticalmente** (`16-menu-inverter.jpg`) | sim |
| Cortar · Arredondar cantos | — | — | sim | sim + Removedor de fundo + Borracha |
| Alças | 2 pontas | 4 cantos + 4 lados (estica livre) | **só 4 cantos (proporção travada)** | 4 cantos + 4 lados |
| Posição | painel com Largura, Altura, **cadeado de proporção**, X, Y, Girar; alinhar à página; camadas | idem | idem | idem |

Capturas: `02-linha-nativa-selecionada.jpg`, `03-05-linha-menus.jpg`, `06-linha-tipo-reta-curva.jpg`,
`08-forma-circulo-selecionada.jpg`, `09-forma-borda.jpg`, `14-grafico-linha-selecionado.jpg`,
`18-20-slot-traco-transparencia.jpg`.

## 3. Teste das famílias pedidas (26 buscas × 3 primeiros "Elementos gráficos" = 78 elementos)

Para cada elemento: inserir, ler a barra (nº de swatches = cores; presença de Removedor de fundo e de alças laterais =
raster), excluir.

| Classe | Elementos | Critério |
|---|---|---|
| **VECTOR_RECOLORABLE** | **71** | barra com swatches, só 4 alças de canto, sem ferramentas de raster |
| **VECTOR_PARTIAL** | 1 | gradiente: cada parada vira um swatch ("Simple Gradient Flowy Wave Shape", 2 swatches) |
| **RASTER** | 6 | Removedor de fundo + Borracha + 8 alças; 5 deles ainda mostram swatches (recolor aproximado de bitmap) |
| UNKNOWN | 0 | — |

**Cores por vetor (72 vetores): 1 cor = 57 (79%) · 2 cores = 11 (15%) · 3 cores = 4 (6%).**

| Família buscada | 1º | 2º | 3º |
|---|---|---|---|
| line | V·1 | V·1 | V·1 |
| minimal line | V·1 | V·1 | V·1 |
| curve | V·1 | V·1 | V·1 |
| wave | V·1 | parcial·2 (gradiente) | V·3 |
| minimal wave | V·1 | V·1 | V·1 |
| blob | V·1 | V·1 | V·1 |
| organic shape | V·1 | V·1 | R·1 |
| circle | V·1 | V·1 | V·2 |
| ellipse | V·2 | V·1 | V·1 |
| rounded rectangle | V·1 | V·1 | V·2 |
| pill | V·2 | R·1 | R·2 |
| star | V·1 | V·2 | V·1 |
| spark | V·1 | V·1 | V·1 |
| arrow | V·1 | V·1 | V·1 |
| curved arrow | V·1 | V·1 | V·1 |
| editorial shape | V·3 | V·3 | V·3 |
| minimal shape | V·1 | V·1 | V·2 |
| underline | V·1 | V·1 | R·1 |
| highlight | V·1 | V·1 | V·1 |
| border | V·1 | V·1 | V·1 |
| frame | R·1 | V·1 | V·1 |
| corner | V·1 | V·1 | V·1 |
| bracket | V·1 | V·1 | V·1 |
| outline | V·1 | R·0 | V·1 |
| badge | V·2 | V·2 | V·2 |
| abstract shape | V·1 | V·2 | V·1 |

V = vetor recolorível, R = raster; número = swatches de cor. Nomes e hex de cada um em `familias/resultado.json`.

## 4. Color slots no Canva (OBSERVADO)

- **Um swatch por cor distinta do SVG.** A onda de 3 tons ("Flat Wave Border Shape") mostra 3 swatches (`#1a3987`,
  `#2d4796`, `#509fd6`) (`15-onda-3-cores.jpg`).
- **Os slots são independentes.** Trocar o 2º swatch para laranja mudou só a faixa do meio; os outros dois ficaram
  (`18-slot-2-recolorido.jpg`; a árvore de acessibilidade passou a ler `#1a3987 / #ff751f / #509fd6`).
- **Gradiente vira um slot por parada** (o gradiente é mantido, só as cores trocam).
- **A borda da caixa acrescenta um slot** (o swatch preto que apareceu depois de aplicar "Estilo do traço").
- **Painel de cor, na ordem** (`17-slot-2-painel-cor.jpg`, `07-painel-cor.jpg`):
  1. busca por nome ou hex ("azul", "#00c4cc");
  2. **Cores do elemento** (+ seletor livre, conta-gotas, as cores atuais, com a do slot destacada);
  3. **Cores desse design** (as usadas na página);
  4. **Kit de marca** (nome da marca, "Editar", "Adicionar cores da marca");
  5. Cores sólidas padrão;
  6. Gradientes padrão (no traço da linha).
- Não foi observado, nesta sessão, nenhum vínculo "slot acompanha a cor da marca": o kit de marca entrega swatches que
  copiam a cor. INFERÊNCIA: o vínculo por papel é algo que o Studio faria além do Canva.

## 5. Checklist de comportamento (Parte 9)

| Pergunta | Linha nativa | Forma nativa | Gráfico vetorial | Raster |
|---|---|---|---|---|
| Recolorível? | sim | sim | **sim** | aproximado |
| Quantas cores? | 1 | 1 + borda | 1–3 (até ~6 em ilustrações; não visto na amostra minimalista) | 0–2 |
| fill? | — | sim | sim (o desenho) | — |
| stroke? | sim | borda | **só como borda da caixa** | borda da caixa |
| fill + stroke? | — | sim | o traço do desenho é parte do arquivo (cor = slot, espessura fixa) | — |
| Transparência? | sim | sim | sim | sim |
| Espessura? | sim | sim (borda) | não (do desenho) | — |
| Gradiente? | sim (painel) | sim (painel) | herdado do arquivo; paradas = slots | — |
| Rotate? | sim | sim | sim | sim |
| flipX / flipY? | não (extremidades) | não visto | **sim** | sim |
| scaleX / scaleY livre? | comprimento livre | **sim** (alças laterais) | **não** (só cantos) | sim |
| Proporção bloqueada? | — | opcional (cadeado) | **sim por padrão** | opcional |

## 6. O que isso diz para o Studio (INFERÊNCIA sobre o observado + a auditoria)

1. **Duas semânticas de elemento, como no Canva:** "forma nativa" (estica livre, traço em px constante — fios, molduras,
   cápsulas de CTA) e "gráfico" (proporção travada, o desenho escala junto — curvas, ondas, sparks, ornamentos). No Studio
   as duas cabem no `shape` existente: formas nativas já são `rectangle/rounded-rectangle/circle/line`; o gráfico é o
   `svg-path` com proporção travada por padrão.
2. **1–2 slots resolvem 94% dos vetores observados** (1 cor 79% + 2 cores 15%). No Studio, "preenchimento" + "contorno"
   já existem no `svg-path` (`style.fill` + `style.strokeColor`) → o MVP não precisa de renderer multicolor.
3. **3 cores** (6%) e gradiente pedem partes por slot dentro do `svg-path` — fase posterior (`ARQUITETURA-VETORES.md`).
4. **Ordem do seletor:** o Canva põe as cores do elemento e as "desse design" antes do kit de marca. No Studio a regra do
   owner é "a cor sai de BrandColor, DNA, assinatura ou escolha explícita" → **cores da marca primeiro**, depois "nesta
   página", depois personalizada (validada).
5. **Flip e proporção travada são de série** num gráfico — no Studio, hoje, nenhum dos dois existe para forma.

---

## 7. Biblioteca proposta para o Studio (Parte 10)

### 7.1 Regras de autoria (valem para todo item)

- **Forma de dado, não arquivo.** Cada item é uma entrada de dados no padrão de `src/lib/assets/shapes-library.ts`
  (já declara "forma nova é UMA entrada de dados"): `pathData` em viewBox próprio, normalizado em comandos ABSOLUTOS
  `M L C Q Z` (arcos convertidos em cúbicas, transforms aplicados), para que o parser do Konva e o `Path2D` do servidor
  leiam a mesma coisa (`auditor-B` §4.7).
- **Sem hex arbitrário.** A entrada declara PAPÉIS de cor por slot; a cor padrão de vitrine (prévia do painel) é neutra
  (`currentColor` na prévia, como o painel já faz). O hex na camada sai do resolvedor de papéis da marca ou da escolha
  explícita no editor.
- **Proporção:** `ajuste: 'travado'` (gráfico: curvas, ondas, sparks, ornamentos) ou `'livre'` (fios, molduras, cápsulas).
- **Traço:** em px da camada, constante ao redimensionar (é a semântica do `svg-path` de hoje no editor). Exige a paridade
  do servidor (CP-V0).
- **Teto:** ≤ 4 subpaths, ≤ 120 segmentos, `pathData` ≤ 4 KB por item no v1.

### 7.2 Catálogo (31 itens; MVP marcado ★)

Legenda de "Como entra": **nativo** = preset de `shapeType` que já existe; **existe** = já está na biblioteca de formas;
**svg-path novo** = entrada de dados nova. Slots: P = preenchimento (`fill`), C = contorno (`strokeColor`).
Papel padrão = de onde a cor vem na inserção (ver `ARQUITETURA-VETORES.md` §4).

| # | id | Família | Desenho (descrição) | Como entra | Slots | Ajuste | Papel padrão | Origem na amostra |
|---|---|---|---|---|---|---|---|---|
| 1 | `fio-fino` ★ | Linhas | linha reta, 2 px | nativo (`line`) | C | livre (comprimento) | texto do grupo | 33% dos modelos (S014, S034, F036) |
| 2 | `fio-medio` | Linhas | linha reta, 4–6 px | nativo (`line`) | C | livre | texto do grupo | S034 |
| 3 | `fio-duplo` | Linhas | duas paralelas finas, vão = 3× a espessura | svg-path novo (2 subpaths) | C | livre | texto do grupo | S020 (ornamentos de base) |
| 4 | `fio-tracejado` | Linhas | linha tracejada | existe (`line-dashed`) | C | livre | texto do grupo | — |
| 5 | `curva-suave` | Curvas | arco aberto raso (flecha ~12% do vão) | svg-path novo | C | travado | destaque | S024 (junção em arco) |
| 6 | `curva-editorial` | Curvas | S alongado de traço único | svg-path novo | C | travado | texto do grupo | F023 (floreio) |
| 7 | `onda-suave` ★ | Ondas | linha ondulada de 3 cristas, traço | svg-path novo | C | livre (horizontal) | destaque | onda em 6% dos modelos |
| 8 | `onda-assimetrica` | Ondas | faixa cheia com a borda de cima ondulada | svg-path novo | P | livre | claro/escuro (polaridade do fundo) | S039 (onda de base) |
| 9 | `onda-base` | Ondas | 2–3 ondas sobrepostas em tons | **svg-path multiparte** (fase CP-V5) | P1, P2 (P3) | livre | escuro + destaque | Canva "Flat Wave Border" (3 cores) |
| 10 | `circulo` | Formas | círculo cheio | existe (`circle`) | P | travado | destaque | selos (S029, S039) |
| 11 | `anel-fino` | Formas | círculo só contorno | nativo (`circle`, fill transparente) | C | travado | texto do grupo | S051 (CTA em círculo) |
| 12 | `elipse` | Formas | elipse (2 arcos → cúbicas) | svg-path novo | P ou C | livre | destaque | S015 (moldura oval) |
| 13 | `pilula-contorno` ★ | Formas | cápsula de raio = metade da altura, só contorno | nativo (`rounded-rectangle`, raio = h/2) | C | **livre** (o raio acompanha a altura) | texto do grupo | pílula de CTA em 17% dos modelos |
| 14 | `retangulo-arredondado` | Formas | retângulo com raio | existe (`rounded`) | P/C | livre | claro/escuro | — |
| 15 | `moldura-fina` ★ | Formas | retângulo só contorno | nativo (`rectangle`, fill transparente) | C | livre | texto do grupo | moldura/contorno em 26% (S038, S047) |
| 16 | `blob-suave-01` | Orgânicos | blob arredondado | existe (`blob`) | P | travado | claro/destaque | F007 (mancha) |
| 17 | `blob-suave-02` | Orgânicos | blob alongado assimétrico | svg-path novo | P | travado | claro/destaque | S043 |
| 18 | `contorno-organico` | Orgânicos | blob só contorno | svg-path novo | C | travado | texto do grupo | — |
| 19 | `sublinhado-suave` ★ | Destaques | traço levemente curvo, pontas redondas | svg-path novo | C | livre (horizontal) | destaque | S023 (sublinhado à mão) |
| 20 | `sublinhado-mao` | Destaques | pincelada fina sob a palavra | svg-path novo | P | livre | destaque | F014 (CTA sublinhado) |
| 21 | `pincelada` | Destaques | faixa de pincel atrás da palavra | svg-path novo | P (com opacidade) | livre | destaque | Canva "Brush Stroke Element" |
| 22 | `circulo-marcacao` | Destaques | volta solta à mão em torno de uma palavra | svg-path novo | C | livre | destaque | — |
| 23 | `seta-fina` | Direção | linha com ponta | existe (`line-arrow`) | C | livre | texto do grupo | S033 |
| 24 | `seta-curva` | Direção | arco com ponta | svg-path novo | C | travado | texto do grupo | Canva "Curved Arrow" |
| 25 | `chevron-fino` | Direção | chevron só traço | svg-path novo | C | travado | texto do grupo | S001 (chevrons) |
| 26 | `spark-4` ★ | Ornamentos | estrela de 4 pontas (cheia) | existe (`sparkle`) | P | travado | destaque | spark em 11% (S011, S026, S040) |
| 27 | `spark-6` | Ornamentos | asterisco fino de 6 raios | svg-path novo | C | travado | destaque | S016, S023 |
| 28 | `pontos` ★ | Ornamentos | 3 pontos em linha | svg-path novo (3 subpaths) | P | travado | texto do grupo | S034 (grade de pontos), S055 |
| 29 | `moldura-aberta` ★ | Editorial | canto em L (2 segmentos) | svg-path novo | C | livre | texto do grupo | S027 (fio em L conduz ao título) |
| 30 | `cantoneiras` ★ | Editorial | 4 cantos em L (4 subpaths) | svg-path novo | C | livre | destaque | F036 |
| 31 | `colchete` ★ | Editorial | "(" fino; o direito sai do **inverter** | svg-path novo | C | livre (vertical) | texto do grupo | F006 (parênteses como colchete) |

**31 itens:** 11 por preset nativo ou entrada que já existe, **20 svg-path novos** (1 deles multiparte).

### 7.3 MVP de 10 (★)

`fio-fino`, `moldura-fina`, `pilula-contorno`, `spark-4` (presets do que já existe) + `onda-suave`, `sublinhado-suave`,
`pontos`, `moldura-aberta`, `cantoneiras`, `colchete` (6 svg-path novos de **uma** cor). Critérios:

1. frequência na amostra (fio, moldura, pílula e spark somam a maioria dos acentos);
2. **zero renderer novo**: todos são 1 slot, cabem em `fill` ou `strokeColor` de uma camada `shape` de hoje;
3. 6 dos 10 são de CONTORNO em caixa não quadrada → dependem da paridade de traço (CP-V0) — por isso o CP-V0 é P0;
4. `colchete` direito e o espelhamento de `moldura-aberta` dependem do **inverter** (CP-V1); sem ele, entram como itens
   espelhados.
