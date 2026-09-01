# Padrão de design de canvas — Bacana (projeto 5)

Escrito em 29/08/2026 para a produção da cadência nova (começa segunda
31/08). Fonte da verdade, nesta ordem: **manual do designer**
(`manual-bacana.png`, prioridade absoluta), **DNA da marca** (BrandDNA do
projeto 5) e as **artes aprovadas do próprio cliente** — 4 referências de
estrela (`Generation.styleRefAt`) + stories publicados dos últimos 30 dias
(94 posts POSTED: 88 stories + 6 feeds), lidos um a um em `refs/`.

Regra de ouro herdada das artes: **a ênfase é de PESO, nunca de tamanho nem
de cor gritada. A informação vem antes da criatividade: unidade e horário
são obrigatórios em toda peça com horário.**

---

## 1. Paleta (hex do manual, pixel medido)

| papel | hex | uso |
|---|---|---|
| `laranja-bacana` | **`#EF6400`** | O ÚNICO acento. Uma palavra da manchete, OU o pino do serviço, OU a frase de fecho itálica — um por peça, além do ponto da logo (intrínseco). Nunca linha inteira, nunca fundo/faixa/selo, nunca sobre foto já laranja. |
| `dark-bacana` | `#1A1410` | Fundo de segurança do artboard e cor dos véus. |
| `branco` | `#FFFFFF` | Todo o texto. Apoio secundário pode cair a 60% de opacidade. |

⚠️ **Divergência registrada**: o DNA e o `BrandColor` do banco dizem
`#EF6A00`; o manual do designer diz e PINTA `#EF6400` (medido no pixel do
swatch). O manual manda — este padrão usa `#EF6400`. Cadastrar no banco (ver
pendências no fim).

## 2. Assinatura tipográfica

Cada corte da Cannon é uma **família própria** (usWeightClass 310–390, fora
do padrão) — declare cada um pelo nome com `font-weight: 400`; nunca
selecione corte por peso no CSS.

Medidas tiradas das artes aprovadas (caps-height medida por varredura de
pixel; razão caps/corpo da Cannon = 0,71):

| papel | fonte | corpo @1080 | caixa | tracking | cor |
|---|---|---|---|---|---|
| **Linha 1 do lockup** (contexto: "TERÇA PEDE AQUELE") | Cannon Book | **64px** | ALTA | 0.04em | branco |
| **Linha 1, voz itálica** ("ALMOÇO DE SÁBADO") | United Italic Cond Medium | **72px** | ALTA | 0.01em | branco |
| **Linha 2 do lockup** (a coisa: "CHURRASCO BACANA") | Cannon **Extra Bold** | **72px** | ALTA | 0.01em | branco (laranja só em UMA palavra) |
| **Apoio** | Cannon Book | **34px** | frase normal | — | branco |
| **Serviço — unidade** | Cannon Book | **32px** | ALTA | 0.06em | branco |
| **Serviço — horário** | Cannon **Bold** | **32px** | ALTA | 0.06em | branco |

- **O passo de corpo do lockup é 1,125** (64 → 72). O contraste vem do PESO
  (Book → Extra Bold). Teto: linha 2 nunca passa de 96px, e só sobe do 72
  em palavra curta (o "KIDS" da arte de maio é 82px de caps por ser
  palavra só).
- **Entrelinha justa no lockup** (1.0 / 1.04); apoio 1.35; serviço 1.15.
- **No serviço, o dado pesa mais que o rótulo**: unidade em Book, horário em
  Bold — é o arranjo das duas artes-estrela mais recentes (04/08 e 09/08).
- Caixa alta é o padrão do DISPLAY (manual + 10 de 10 artes lidas). O que o
  DNA proíbe é caixa alta em texto corrido/legenda — apoio longo vai em
  frase normal.
- Fallbacks: `'Century Gothic', sans-serif` (lista do DNA).
- Pesos NÃO usados no padrão: Thin/Light ficam para peça especial; Black e
  guttery não aparecem em nenhuma arte aprovada — não usar sem decisão nova.

## 3. Estrutura da peça (story 1080×1920)

```
topo 200px  ── lockup (linha 1 + linha 2) + apoio, alinhado à ESQUERDA
              [espaçador flex]
rodapé 150px ─ serviço: pino SVG 72px + pares UNIDADE/HORA · logo no canto OPOSTO
laterais 84px
```

- **Margens medidas das artes reais**: manchete nasce ~187px do topo,
  serviço morre ~163px do fundo, logo termina ~85px da borda direita.
  Padrão: 200 / 150 / 84.
- **Serviço no rodapé, título no topo** — regra aprendida do DNA (11/08,
  vale para todos os clientes). A diagramação pode variar a âncora
  (topo-esq é o padrão; rodapé-dir apareceu na estrela de 09/08), mas
  nunca centralizar TUDO (o DNA chama de "cara de convite" — e a peça
  publicada de 25/08 que centralizou é o contraexemplo).
- **Pino de localização**: SVG de LINHA (stroke 1.1, sem preenchimento),
  72px, atravessando o bloco de serviço inteiro — como nas artes. Laranja
  OU branco (se a manchete já gastou o laranja, pino branco).
- **Máximo três presenças**: foto, UM bloco de texto, logotipo.

### Feed 1080×1350

- **O feed normal da cadência é FOTO PURA** (carrossel de 5 a 7 fotos reais
  com legenda) — as 6 capas publicadas nos últimos 30d não têm texto
  NENHUM. Arte com texto no feed é EXCEÇÃO: data comemorativa ou aviso
  (ex.: feriado de 07/09).
- Na exceção: mesma assinatura, margens 96 / 96 / 84 (feed não tem faixa
  reservada do Instagram — não inventar safe area).

## 4. Leitura do texto: HALO, não véu (01/09/2026)

O véu escurecia a faixa inteira (760px no story) para dar contraste a um
bloco de ~270px. O halo (`../_halo.py`) escurece só a área do bloco e
desmancha nas bordas com `filter: blur()` na própria caixa.

🔴 `filter: blur()`, NUNCA `backdrop-filter: blur()` — este desfocaria a
fotografia, que é a protagonista pelo DNA (55% a 70% da peça).

- **São TRÊS halos**, não um: bloco de texto, serviço e **logo**. Aqui o
  serviço está no fluxo e a logo é absoluta no canto oposto, então cada um
  mede o SEU retângulo. Elemento que dependia do véu e ficar sem halo some.
- **Cor `26,20,16`** = `#1A1410`, o dark da marca — não o `17,17,17` que é o
  default do módulo. Trocar o mecanismo não é licença para trocar a paleta.
- **A tinta sai da MEDIÇÃO da foto** na região exata de cada bloco
  (`luz_da_regiao`), não de um número escrito à mão. Some o slider de véu do
  canvas: o artboard passa a carregar só números literais, e a fórmula existe
  num lugar só (o módulo).
- 🔴 **O raio é limitado pela ALTURA do bloco** (`RAIO_POR_ALTURA = 0.42`).
  O raio grande do módulo (124-158px) foi calibrado num bloco alto; num bloco
  baixo quase toda a tinta cai FORA da caixa — escurece foto onde não há
  letra e deixa de escurecer onde há. Encolher o raio ganha nos DOIS eixos.
- **`MODO=veu python3 gerar.py`** regera a versão antiga para comparar.

Medido (p98 do fundo sob cada bloco; referência do manual: **< 150**):

| peça | bloco | véu | halo |
|---|---|---:|---:|
| Main | texto | **184** ⚠️ | **121** |
| Main | serviço / logo | 75 / 71 | 84 / 129 |
| Story1200 | texto | 97 | 108 |
| Story1200 | serviço / logo | 81 / 64 | 116 / 136 |
| FeedFeriado | texto | 92 | 83 |
| FeedFeriado | serviço / logo | 110 / 66 | 117 / 127 |

O véu REPROVAVA a manchete do Main (184) e sobrava nos rodapés. Devolvido à
fotografia, na peça inteira: **+4,9% de luz e +3,5% de cor no Main, +14,3% e
+6,5% no Story1200, +14,8% e +1,3% no feed**.

### Como conferir (nenhum dos três é opcional)

| ferramenta | o que pega |
|---|---|
| `python3 medir.py` | contraste real sob cada bloco, com o texto apagado e o halo preservado (armadilha 4.5 do manual) |
| `python3 sonda.py` | a geometria REAL no Chrome contra a estimada por métrica de fonte — a calibragem inteira depende dela |
| olhar o PNG | os quatro defeitos do By Rock passaram por lint e por conferidor; quem os pegou foi o olho |

## 5. Logo

- **`logo-bacana.png`** (= `bacana-principal.png` do banco, com o
  "CHURRASCARIA" embaixo): é a assinatura de TODAS as artes aprovadas.
- **170px de largura** (mínimo do DNA: 120px), canto OPOSTO ao bloco de
  serviço, dentro da safe area, `drop-shadow` leve. **Uma vez por peça,
  nunca duas.** Só sobre área escura da foto.
- Variantes no kit (`logos/`): slin (sem tagline, clara/escura) para faixa
  estreita; ícone do garçom sozinho (`icone-02` branco) NUNCA junto do
  logotipo — ou um, ou outro (nas artes aprovadas: sempre o logotipo).

## 6. Fatos que TODA peça respeita (da base, conferidos em 29/08)

- **Toda peça com horário nomeia a unidade.** Praia da Costa primeiro.
- Dia útil: **Praia da Costa 11h30–23h · Bairro de Fátima 17h–23h** (Fátima
  NÃO tem almoço em dia útil — nunca convidar). Sábado/feriado: as duas
  11h–23h. Domingo: as duas 11h–22h.
- **Almoço Bacana**: SÓ Praia da Costa, seg–sex 11h30–16h, não vale em
  feriado/emenda.
- Proibido: "rodízio", urgência de varejo, fine dining, "Você merece",
  pergunta retórica de abertura, caixa alta de ênfase em frase corrida.
- Pré-títulos e CTAs saem das listas FECHADAS do DNA ("[DIA] PEDE AQUELE…",
  "…DO JEITO BACANA", "TEM QUE SER BACANA"; "Te esperamos na brasa" etc.).

## 7. O que NUNCA fazer (resumo de reprova)

1. Horário sem unidade; almoço na Fátima em dia útil.
2. "Rodízio" em qualquer lugar da peça.
3. Laranja em linha inteira, fundo, faixa ou selo; laranja sobre foto
   dominada por laranja (ex.: escorregador do kids); dois acentos laranja
   na mesma peça (fora o ponto da logo).
4. Manchete colorida ou ênfase por tamanho — ênfase é peso.
5. Centralizar tudo / simetria total.
6. Duas logos, logo grande, logo sobre área clara.
7. Texto fora das margens (story: 200/150/84) ou sobre o miolo da foto.
8. Cortar borda de prato, chapa ou tábua no enquadramento do artboard.
9. Selecionar corte da Cannon por `font-weight` no CSS.
10. `url()` no CSS para imagem (foto entra por `<img src>`), tamanho em
    `em`/herdado, `position: absolute` em bloco de texto (armadilhas do
    manual do canvas, seção 4).
11. Herdar o raio do halo do By Rock sem medir: bloco baixo pede raio
    menor, e o serviço daqui tem metade da altura do bloco de lá.
12. Pôr a logo em `topo-dir`/`topo-esq` sem olhar o aviso de colisão — a
    manchete do Main chega a x=945 e a logo começa em x=826.

## 8. Arquivos desta pasta

| arquivo | o quê |
|---|---|
| `gerar.py` | escreve os artboards-base a partir de `PECAS` (medidas do padrão embutidas) |
| `medir.py` | contraste sob cada bloco (foto + halo, sem texto) — referência p98 < 150 |
| `sonda.py` | geometria real dos halos no Chrome × a estimada em `geometria()` |
| `../_halo.py` | o módulo do halo, compartilhado com os outros clientes |
| `render.py` | achata o `.dc.html` e renderiza no tamanho exato (story/feed, altura lida do artboard) |
| `Main.dc.html` | prova: slot 9h30 de terça — nomeia as DUAS unidades |
| `Story1200.dc.html` | prova: slot 12h de sábado — voz itálica + palavra laranja |
| `FeedFeriado.dc.html` | prova: aviso 07/09 (a exceção com texto no feed) |
| `fonts/*.woff` | Cannon Book/XBold/Bold/Light + United Italic subsetadas (~11KB cada) |
| `fotos/` | originais (render usa estas); `img/` = previews 520px p/ canvas |
| `logo-bacana.png` | assinatura oficial (branca, com CHURRASCARIA) |
| `refs/` | as artes aprovadas analisadas; `manual-bacana.png` = manual do designer |
| `render/` | provas renderizadas 1080×1920 e 1080×1350 |

Grade da cadência (base de conhecimento): stories 9h30 (o dia na Bacana) ·
12h (almoço) · 17h30 (tema do dia), todos os dias; feed ter 11h / qui 18h30 /
dom 11h30, foto pura. Teste de 31/08 a 20/09, revisão 21/09.

## 9. Pendências (não gravadas — decidir e cadastrar)

1. **Hex do laranja**: banco (`BrandColor` "Laranja" e DNA) = `#EF6A00`;
   manual = `#EF6400`. Alinhar o banco ao manual (ou o designer confirma o
   contrário). Sugestão de cadastro em `BrandColor`: laranja `#EF6400`,
   dark `#1A1410`, creme impresso `#F4EFE8`.
2. ~~**Fátima na segunda-feira**~~ — RESOLVIDA em 29/08/2026: o Ciro
   confirmou que a unidade NÃO abre mais às segundas (a arte-estrela de
   09/08 estava certa e a base estava velha). As 4 entradas da base foram
   corrigidas na mesma data (horários, grade de stories, Almoço Bacana e
   Fatos que a copy confere): Fátima é TERÇA a sexta 17h–23h; segunda
   fechada. Peça de segunda fala só da Praia da Costa; Fátima, quando
   citada na segunda, é como fechada, com convite para terça.
3. **Canvas publicado desatualizado**: `bacana-padrao.html` foi semeado em
   29/08 com os artboards do véu. Os `.dc.html` mudaram — reseme pelo
   `/design` antes de editar no canvas, senão o editor abre a versão velha.
4. **Laranja em linha inteira da manchete**: duas artes-estrela antigas
   (29/07 e 09/08) têm a linha 2 inteira laranja; o DNA (mais novo) diz
   manchete SEMPRE branca. Este padrão segue o DNA (laranja só em palavra).
   Se o Ciro preferir a licença da linha, é uma linha a mudar em `linha2()`.
