# Sessão 2026-08-29 (tarde) — Padrões de design de canvas: os 4 clientes que faltavam

Com a cadência da carteira gravada de manhã e a decisão do Ciro de que **a
criação de posts por padrão é pela ferramenta de design (canvas)**, faltava o
padrão de 4 contas que nunca passaram pela ferramenta. Quatro agentes em
paralelo, cada um seguindo o manual do canvas (seções 3 e 4) e o método do
TERO: estudar o manual do designer + artes aprovadas/publicadas da PRÓPRIA
marca, medir em pixel, escrever o padrão com números e provar com render real.

Com isto, **as 9 contas estão preparadas para o canvas** (as outras 5 já
tinham padrão/levas: TERO, Quintal, Wine Vix, Espeto, By Rock).

## O que existe agora (pastas em `design-canvas/<cliente>-padrao/`)

| Cliente | Canvas publicado | Assinatura em uma linha |
|---|---|---|
| Seu Quinto | claude.ai/code/artifact/598c4fda-704c-48ba-960d-c7b63e51cb02 | Bonoco CAPS com **extrude 5px sem blur**; The Kathy só manuscrito; paleta estrita vermelho/verde/amarelo; Q em círculo ~13% da largura |
| Empório Fonseca | claude.ai/code/artifact/e4b24314-3898-4e61-b269-f45aa6769e35 | Lockup Trajan 3 vozes (versalete → CAPS → dourado em UMA voz); Friz Quadrata no serviço; véu na cor da marca `#2C3445` |
| Bacana | claude.ai/code/artifact/fab68e99-3ffb-4d18-b596-9439962c8acb | Caixa alta com contraste de PESO (Cannon Book→Extra Bold); laranja `#EF6400` como acento único; serviço com pino e unidade |
| Real Gelateria | claude.ai/code/artifact/f24b6e39-43a6-426d-80a1-ad1e707cc1d3 | Branley em **Title Case, nunca caixa alta**; 2 vozes por COR (Crema/Menta); véu tingido de Verde Real; selo R dourado fixo |

Cada pasta tem `PADRAO.md` (números medidos + "nunca fazer"), fontes reais
baixadas (TTF/OTF + woff subsetadas), logos por papel, `gerar.py`/`render.py`
da leva e provas renderizadas nos DOIS formatos da cadência (story 1080×1920 +
feed 1080×1350) com fotos reais.

## Técnicas novas que valem para qualquer cliente

- **Régua objetiva de véu**: `medir.py` renderiza a peça com o texto oculto e
  exige **p98 de luminância < 150** na faixa do texto — tira o "véu bom" do
  olho e põe em número (nasceu no Empório, usada em SQ e Real).
- **Verificador de largura no gerar.py** (PIL): mede a manchete ANTES do
  render e pega estouro de caixa — pegou 2 no Empório e 1 no Bacana.
- **O medido vence o escrito quando o DNA diverge da prática publicada**, e a
  divergência é DOCUMENTADA, nunca corrigida em silêncio: o Q do Seu Quinto
  (DNA diz ~2% da largura; as 10 peças medem 12–16%), o Palatino do manual do
  Empório (nenhuma peça usa; o designer titula em Trajan), o "Bintang" do DNA
  do SQ (a fonte real é The Kathy).

## Armadilhas registradas

- 🔴 **Cada corte da Cannon (Bacana) é uma FAMÍLIA própria** com usWeightClass
  310–390 — declarar por NOME, nunca selecionar por `font-weight` (mesma
  classe do bug conhecido do napi-rs com pesos fora de múltiplos de 100).
- **Trajan não tem minúscula**: caixa mista vira versalete sozinha — nunca
  aplicar `text-transform`, a caixa é decidida na STRING (a lei da casa vale
  também no canvas).
- **O platô do véu depende de onde o bloco pousa**: a Real usa rodapé alto
  (safezone de 350px) e o platô de 38% deixava o texto na cauda do gradiente —
  subiu para 52%, medido na primeira prova.
- **Nomes de arquivo de logo MENTEM** ("Ativo 1branco" do SQ é a colorida;
  "Ativo 2icones" do Empório É a logomarca): sempre olhar, nunca confiar no
  nome. Luminância medida decide versão clara × escura.

## Pendências levantadas (nada gravado no banco pelos agentes)

**Para conferir com as casas antes de segunda 31/08:**
1. 🔴 **Bacana/Fátima na segunda**: a base diz seg–sex 17h–23h, a arte-estrela
   de segunda estampa "BAIRRO DE FÁTIMA — FECHADO". Afeta o story de seg 31/08.
2. **Seu Quinto/domingo**: base e DNA dizem 16h; peça publicada de 28/08 diz
   16h30.
3. **Empório/Quarta da Pizza**: a base fala em "identidade visual própria" da
   mecânica e nenhuma das 22 peças do feed a tem — existe arte antiga fora do
   feed?

**Correções de cadastro (decisão do Ciro):**
4. Hex divergentes: laranja do Bacana (`BrandColor`/DNA `#EF6A00` × manual
   `#EF6400` — padrões seguiram o manual) e Menta/Crema da Real (BrandColor ×
   manual). Rótulos de cor TROCADOS no manual do Empório (dourado↔azul).
5. DNA do Seu Quinto cita a script "Bintang"; a fonte cadastrada e publicada é
   The Kathy.
6. `Generation.styleRefAt` está ZERADO em SQ e Empório — quando a produção
   começar, marcar as aprovadas para alimentar também a via de IA.

**Produção:** fotos 9:16 nativas para stories do Empório (a prova usou 4:5
coberta); crepe NOMEADO na capa de 02/09 da Real (rodízio da base).
