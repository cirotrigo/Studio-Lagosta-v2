# ⚠️ SEMANA CANCELADA em 31/08/2026 — o que fica é o PADRÃO v5

Os 24 rascunhos foram cancelados pelo Ciro (a semana começou sem tempo de
aprovação; a próxima leva sai quando ele avisar). As artes seguem na
galeria de Criativos. **Esta pasta é a fonte do padrão v5**: `gerar.py`
(famílias de canto + `editorial`, padding zero entre vozes, margens
100/90), `slots.json` com as 6 peças calibradas, renders em `render/` e
o contato `padrao-final.jpg`. Arco completo em
`docs/SESSAO-2026-08-31-TERO-SEMANA1-PADRAO-V5.md`.

# 01/09/2026 — o VÉU virou HALO (aguardando o aval do Ciro)

O mecanismo de leitura do padrão v5 mudou: as duas bandas de gradiente
(760px no topo, 720px no rodapé, opacidade calibrada à mão por peça no
`slots.json`) deram lugar a uma **mancha escura desfocada atrás de cada
bloco** — `filter: blur()` na própria caixa, nunca `backdrop-filter`
(que desfocaria a fotografia). Ideia do Ciro no By Rock, portada aqui.

**Medido nas 21 peças da leva, mesma copy e mesmas fotos:**

| | véu | halo | |
|---|---:|---:|---|
| luminância média da peça | 66,9 | 84,4 | **+26,0%** |
| saturação média | 127,5 | 132,5 | +4,0% |
| pior fundo sob o TÍTULO (p75) | 108 | **86** | mais escuro = mais leitura |
| pior fundo sob o SERVIÇO (p75) | 68 | **61** | |
| pior fundo sob a MARCA (p75) | 89 | **54** | |

Ou seja: o halo devolve um quarto da luz da fotografia **e** dá ao texto
um fundo melhor no pior caso do que o véu dava. Não é uma troca entre
foto e leitura — os dois lados melhoram, porque o véu escurecia onde não
precisava e faltava onde precisava.

**`MODO=veu python3 gerar.py` reconstrói a versão antiga**, para
comparar. O padrão é `halo`.

## O que é específico DESTE cliente (não herdar do By Rock)

- **Raio 74–96px, não 124–158.** Os blocos do TERO são baixos (lockup
  ~150px, serviço ~120px) contra os ~470px do By Rock, e o `blur(r)` é
  uma gaussiana: caixa menor que ~2× o raio nunca atinge a tinta cheia
  no miolo, que é justo onde a letra cai.
- **A tinta sai de um ALVO de fundo, não de uma faixa interpolada**
  (`_halo.tinta_para_alvo`). Título 62, serviço 46, marca 40 — a ordem é
  a fragilidade de cada um. Efeito colateral desejado: **16 dos 63
  blocos da leva não recebem halo nenhum**, porque a foto já era escura
  o bastante. O véu escurecia esses também (o SegFuncionamento levava
  0,66 sobre uma faixa de 21,5).
- **A marca pede inset 62/56**, contra 34/30 do By Rock. A logo do TERO
  é branca chapada (luminância 255 medida em todo pixel visível) e o
  único contraste dela é o `drop-shadow`; a do By Rock é vermelha com
  letra branca. É o elemento mais frágil da peça, não o texto.
- **A cor da mancha é o #130D0A do véu**, não o quase-preto do By Rock.
  Trocar o mecanismo não é licença para trocar a paleta.

## Como refazer a calibragem quando a leva mudar

```
python3 medir.py      # sonda a geometria no Chrome e mede a foto -> halos.json
python3 gerar.py      # escreve os artboards
python3 render.py <artboard>.dc.html
```

🔴 **`medir.py` é obrigatório depois de mexer no `slots.json`.** Sem
medida o halo não é emitido e a peça sai sem mecanismo de leitura
nenhum — foto crua com texto por cima. O `gerar.py` avisa em vermelho
quando isso acontece; não ignore.

`slots.json` mantém `veuTopo`/`veuRodape` por peça: eles não são usados
no modo halo, e existem para `MODO=veu` continuar reconstruindo o padrão
anterior.

Arquivos novos desta troca: `medir.py` (roda a medição),
`medir_halos.py` (a sonda de geometria no Chrome + a leitura da foto) e
`halos.json` (o resultado). Os renders em `render/` são os do halo; as
quatro peças de véu usadas na comparação ficaram em
`render-veu-amostra/`, e o comparativo montado em `comparativo-halo.jpg`
e `comparativo-halo-peca.jpg`.

## Armadilhas pagas aqui (as duas primeiras estão no `_halo.py`)

- **Elemento opaco vizinho de um bloco com halo precisa de
  `position: relative; z-index: 1`.** O print da avaliação (um `<img>`
  em fluxo) saiu CINZA: o halo mora num wrapper posicionado e pinta
  acima de irmão não-posicionado, venha antes ou depois no DOM.
- **A MÉDIA é a estatística errada para calibrar.** O que apaga a letra
  é a mancha clara por onde parte do traço passa. O serviço do
  QuaFuncionamento tem fundo de média 54 e cai sobre uma cadeira branca
  (15% da área acima de 200): calibrado pela média, sumiu no celular com
  o número dizendo que estava tudo bem. A luz de calibragem é metade
  média, metade p75.
- **Meça a luz no retângulo do TEXTO, não na área alargada pelo inset** —
  o entorno é mais escuro e puxa a média para baixo (62 contra 80 no
  TerFuncionamento, e o bloco ficou sem halo por causa disso).
- **Olhe a peça em tamanho de CELULAR, não em miniatura de contato.** Em
  250px de largura o halo parece fraco em quase tudo — em 400px, que é o
  tamanho real, lê. Duas peças foram julgadas ruins por engano assim.

# TERO — Semana 1 do teste de cadência (31/08 a 06/09/2026)

Produzida em 30/08/2026 pelo canvas de design, zero crédito de imagem.
**24 posts, todos RASCUNHO** na agenda: 21 stories (grade 3/dia) + 3
carrosséis de feed (seg 16h rolha free · qui 17h happy hour · sáb 11h30
cupim prensado). O story de qui 17h (rolha free) deslizou para **17h30**
pela regra da grade (feed no mesmo horário → story desliza 30 min).

- Canvas publicado: https://claude.ai/code/artifact/66aa3009-020b-4c1b-a35d-e2af503f15c1
- Gerador: `gerar.py` (layouts `peca` story 1080x1920, `capa` feed
  1080x1350 e `avaliacao`) + `slots.json`. O padrão é o de
  `tero-sexta-domingo/` (margens 200/150/96, lockup 80/76 tracking zero,
  entrelinha 0.91); o FEED usa margens próprias 120/110/96 e véus mais
  curtos (540/500px) porque não tem a faixa do Instagram.
- Render: `render.py` (lê a altura do artboard — story e feed saem pelo
  mesmo caminho). Fotos ORIGINAIS em `fotos/`; previews ≤70KB em `img/`.
- Cartões de avaliação: `gerar_cartoes.py` desenha com os DADOS REAIS
  lidos em 30/08 (inicial em círculo, nunca o rosto do cliente):
  - Google (dom 06/09 12h): **Gustavo assumcao**, 5★, selo Novo, itens
    5/5, cita o funcionário **Júlio** — OK do Ciro pendente.
  - TripAdvisor (seg 31/08 9h): **Paula J**, 5 bolhas, "Almoço em
    casal", feita em 28/08 — cita **Júlio César**, OK pendente.
- TripAdvisor do TERO: id **d24154045**, nota 4,9 (1.733), selo
  Travellers' Choice **2025 próprio** (seção Sobre do perfil).
- Carrosséis por `mediaUrls` (fotos ORIGINAIS, o enquadramento 1080x1350
  é escolha do Ciro no editor da agenda). **Curadoria SÓ de fotos por
  padrão** (decisão do Ciro em 30/08/2026): capa = a foto mais forte, e
  capa-arte só entra com pedido explícito dele. As duas capas-arte
  geradas nesta leva (`FeedRolhaFree`/`FeedHappyHour`) foram tiradas dos
  posts e do canvas (`"fora": true` no slots.json — o gerar.py ainda
  escreve o arquivo, mas ele não entra no canvas nem no mapa); seguem na
  galeria para uso sob pedido. A mecânica e a janela ficam na LEGENDA.
- 40 fotos do acervo, nenhuma repetida, registradas com
  marcar-foto-como-usada na data de cada peça. **Se a leva for refeita
  com outras fotos, esse registro fica errado.**
- Copy do rolha free deliberadamente enxuta: nome + janela (seg–qui, no
  jantar) + "o seu vinho na nossa mesa"; a mecânica detalhada não está
  na base, detalhes vão para o Direct.
