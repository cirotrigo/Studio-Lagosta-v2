# Catálogo candidato — 17 modelos-base minimalistas para o Studio

> Parte 7. Cada modelo-base = **um arquétipo + parâmetros fixos** (um "preset"), no vocabulário de papéis do compositor
> (`pre`, `headline`, `apoio`, `cta`, `servico`, `logo`) mais `foto`, `fundo` e `acento`. Coordenadas em 0–100 da
> largura × altura, **já presas à área segura do Studio** (não às do Canva):
>
> | Formato | Margem lateral | y útil | Fonte |
> |---|---|---|---|
> | Story 1080×1920 | 92 px = **8,5** | **9,8 → 88,3** (188/224 px) | `src/lib/compositor/assinatura.ts:137-143`; decisão do owner no CP0 |
> | Feed 1080×1350 | 92 px = **8,5** | **8,9 → 92,3** (120/104 px) | idem |
>
> Fonte, tamanho, cor e caixa de cada papel **não** são do modelo: vêm da assinatura da marca. As caixas abaixo são ZONAS
> (onde o papel pode pousar); a posição final continua decidida pela foto real (mapa de calma + régua do compositor)
> dentro da zona. Limites de texto são de partida: quem decide é a medição do compositor (`medir-copy`), que recusa por
> orçamento.
>
> **O que é restrição e o que é alvo (correção da revisão do Codex).** No MVP, as RESTRIÇÕES efetivas de cada preset são
> só as preferências que o compositor já obedece — `ancora`, `alinha`, `cantoDaMarca`, `enquadramento` — e o acento. As
> coordenadas desta página são o ALVO de QA: depois de compor, o diagnóstico compara a caixa de cada papel com a zona e
> **avisa** se ela saiu da tolerância (regra da casa: o verificador avisa, nunca veta). A área segura usada é a
> **efetiva da marca** (a assinatura deriva `safeTopo/safeRodape/margemH` da própria página —
> `src/lib/compositor/assinatura.ts:415-427`), não os números padrão desta tabela, que são só o piso.

---

## 1. Visão geral

| # | id | Arquétipo | Família | Prioridade | Depende de |
|---|---|---|---|---|---|
| 1 | `minimal-fb-topo-esquerda` | MIN-01 | A | **MVP** | CP-T1 |
| 2 | `minimal-fb-base-esquerda` | MIN-01 | A | **MVP** | CP-T1 + `moldura-aberta` (CP-V2) |
| 3 | `minimal-fb-centro-optico` | MIN-02 | A | **MVP** (logo no canto; topo-centro é P1) | CP-T1 + `spark-4` |
| 4 | `minimal-fb-base-centro` | MIN-01 | A | P1 | CP-T1 |
| 5 | `minimal-fb-topo-centro` | MIN-01 | A | P1 | CP-T1 |
| 6 | `minimal-marca-heroi` | MIN-03 | A | P1 | gate de logo do CP1 |
| 7 | `minimal-titulo-gigante` | MIN-10 | A | P1 | parâmetro de escala dominante |
| 8 | `minimal-divisao-foto-topo` | MIN-04 | B | P1 | foto em caixa (CP-T3) + aval do estilo da casa |
| 9 | `minimal-divisao-cor-topo-arco` | MIN-04 | B | P1 | CP-T3 + máscara `arco-janela` |
| 10 | `minimal-coluna-foto` | MIN-05 | B | P1 | CP-T3 |
| 11 | `minimal-moldura-arco` | MIN-06 | C | P1 | CP-T3 + máscara `arco-janela` |
| 12 | `minimal-moldura-circulo` | MIN-06 | C | P1 | CP-T3 |
| 13 | `minimal-editorial-deslocado` | MIN-07 | C | P1 | CP-T3 |
| 14 | `minimal-editorial-faixa` | MIN-07 | C | P1 (Feed primeiro) | CP-T3 |
| 15 | `minimal-tipografico-lista` | MIN-09 | E | P1 | spec sem foto |
| 16 | `minimal-tipografico-convite` | MIN-09 | E | P1 | spec sem foto + `cantoneiras` |
| 17 | `minimal-produto-pedestal` | MIN-08 | D | P2 | recorte de fundo confiável |

**Fora do catálogo:** MIN-11 (placa sobre foto) conflita com o estilo da casa ("sem formas, placas, caixas, faixas nem
molduras como leitura; só gradiente localizado" — `docs/research/design-tools-clean-room-2026-10/RELATORIO.md:41-43`);
continua disponível à mão no editor. MIN-12 (mosaico) fica para depois de "foto em caixa" com N fotos.

**Parâmetro `tratamento`:** em todos os modelos vale o comportamento atual do compositor (gradiente de leitura quando há
foto). Os modelos minimalistas do Canva quase não usam gradiente (2/96), mas `tratamento: nenhum/claro/escuro` é área do
CP1 da direção de arte — **não entra antes dele**.

---

## 2. MVP — família A (o compositor já materializa)

### 1 · `minimal-fb-topo-esquerda` — MIN-01

```
Story                    Feed
┌──────────────────┐     ┌──────────────────┐
│ PRÉ              │     │ PRÉ              │
│ HEADLINE LINHA 1 │     │ HEADLINE LINHA 1 │
│ HEADLINE LINHA 2 │     │ apoio apoio      │
│ apoio apoio      │     │                  │
│                  │     │   foto inteira   │
│   foto inteira   │     │                  │
│  (área calma no  │     │ serviço     LOGO │
│      topo)       │     └──────────────────┘
│                  │
│ serviço     LOGO │
└──────────────────┘
```

| Papel | Story x y w h | Feed x y w h | Limite de texto |
|---|---|---|---|
| foto | 0 0 100 100 | 0 0 100 100 | — |
| pre | 8,5 12 50 3 | 8,5 11 50 4 | ≤ 17 caracteres |
| headline | 8,5 15,5 70 12 | 8,5 15,5 70 14 | 2 linhas × ~16 (story) / 1–2 × ~18 (feed) |
| apoio | 8,5 28,5 60 6 | 8,5 30,5 60 7 | ≤ 2 linhas × ~28 |
| servico | 8,5 81 55 7 | 8,5 84 55 8 | ≤ 2 linhas × ~30 |
| logo | 74 81 17,5 7 | 74 84 17,5 8 | variante cadastrada |
| acento (opcional) | `fio-fino` 8,5 27 18 0,3 | idem | — |

- **Foto ideal:** assunto no meio ou na base; topo escuro ou liso (parede, céu, fundo desfocado). Ref. Canva: S005,
  S034, F034.
- **Parâmetros fixos:** `titulo.zona = topo`, `titulo.alinha = esquerda`, `servico.zona = base`, `logo.zona = canto
  inferior direito`, `acento ∈ {nenhum, fio-fino}`.
- **Mapeamento no compositor de hoje:** `ancora: topo` · `alinha: esquerda` · `cantoDaMarca: inferior-direito` ·
  `enquadramento: auto`; o grupo do serviço pousa no rodapé ("serviço sozinho vai ao rodapé").
- **Variações permitidas:** sem pré; sem apoio; acento ausente.
- **Adaptação Story→Feed:** headline perde uma linha antes de reduzir corpo; serviço desce até 92.

### 2 · `minimal-fb-base-esquerda` — MIN-01 com fio em L

```
Story                    Feed
┌──────────────────┐     ┌──────────────────┐
│ ┌─────────  LOGO │     │ ┌─────────  LOGO │
│ │                │     │ │                │
│ │  foto inteira  │     │ │ foto inteira   │
│ │ (área calma na │     │ │                │
│ │      base)     │     │ HEADLINE LINHA 1 │
│ │                │     │ apoio · serviço  │
│ HEADLINE LINHA 1 │     └──────────────────┘
│ HEADLINE LINHA 2 │
│ apoio apoio      │
│ serviço          │
└──────────────────┘
```

| Papel | Story x y w h | Feed x y w h | Limite |
|---|---|---|---|
| foto | 0 0 100 100 | 0 0 100 100 | — |
| acento `moldura-aberta` (L) | 8,5 11 60 52 | 8,5 10 60 46 | traço 2 px; papel `texto` |
| logo | 74 10,5 17,5 6 | 74 9,5 17,5 7 | — |
| headline | 8,5 66 80 11 | 8,5 64 80 12 | 2 linhas × ~18 |
| apoio | 8,5 78 60 4,5 | 8,5 78 60 5 | 1 linha × ~32 (caixa alta espaçada) |
| servico | 8,5 83,5 60 4,5 | 8,5 85 60 6 | 1–2 linhas |

- **Foto ideal:** base escura e lisa (mesa, sombra, balcão); assunto no meio. Ref.: S027, F035, F029.
- **Parâmetros:** `titulo.zona = base`, `alinha = esquerda`, `logo.zona = canto superior direito`, `acento = fio-em-L`.
- **Regra do acento:** o fio vertical do L fica na MESMA margem do texto e termina 3–4 unidades acima do headline
  (conduz o olho até ele). Cor = papel `texto` (a cor do headline na assinatura) — garante a polaridade do texto.
- **Mapeamento:** `ancora: rodape` · `alinha: esquerda` · `cantoDaMarca: superior-direito` + acento (CP-T1).

### 3 · `minimal-fb-centro-optico` — MIN-02

```
Story                    Feed
┌──────────────────┐     ┌──────────────────┐
│       LOGO       │     │       LOGO       │
│                  │     │                  │
│   foto inteira   │     │        ✦         │
│                  │     │   HEADLINE CURTA │
│        ✦         │     │   apoio curto    │
│  HEADLINE CURTA  │     │                  │
│   apoio curto    │     │     serviço      │
│                  │     └──────────────────┘
│                  │
│     serviço      │
└──────────────────┘
```

| Papel | Story x y w h | Feed x y w h | Limite |
|---|---|---|---|
| foto | 0 0 100 100 | 0 0 100 100 | — |
| logo | canto mais calmo (MVP) · 41 10,5 18 5 no topo-centro (P1) | idem · 41 9,5 18 6 (P1) | — |
| acento `spark-4` | 48 41 4 2,5 | 48 38 4 3 | papel `destaque` |
| headline | 20 44,5 60 10 | 20 42 60 11 | 1–2 linhas × ~14 (escala regular) |
| apoio | 25 56 50 5 | 25 55 50 6 | 1 linha × ~26 |
| servico | 25 84 50 4 | 25 87 50 5 | 1 linha |

- **Foto ideal:** área lisa e ampla no centro (toalha, parede, fundo desfocado), assunto deslocado. Ref.: S006, S040, S009.
- **Parâmetros:** `titulo.zona = meio`, `alinha = centro`, `logo.zona = canto (auto)` no MVP; `topo-centro` no P1;
  `acento ∈ {nenhum, spark-4}`.
- **Mapeamento (MVP):** `ancora: meio` · `alinha: centro` · `cantoDaMarca: auto` (o canto mais calmo, como hoje).
  Logo no topo centralizado pede `logo.zona = topo-centro`, que hoje não existe (os cantos são 4) — fica fora do MVP
  para o CP-T1 não crescer.

---

## 3. P1 — família A

### 4 · `minimal-fb-base-centro` — MIN-01 centrado na base
Foto inteira com base calma; headline centrado 66–78 (story) / 64–76 (feed); serviço 80–88; logo topo-centro 10,5–15.
Ref.: F029, F020. Mapeamento: `ancora: rodape` · `alinha: centro`.

### 5 · `minimal-fb-topo-centro` — MIN-01 centrado no topo
Logo 10,5–14; headline 16–27; apoio 29–34; serviço em pílula de contorno (`pilula-contorno`, papel `texto`) 82–87.
Ref.: S005, F010. Mapeamento: `ancora: topo` · `alinha: centro`.

### 6 · `minimal-marca-heroi` — MIN-03
Logo em escala de herói (largura 26–40 da peça) no topo 10,5–30; headline curto 66–72; serviço 76–86. Peça institucional
(abertura, reserva, horário). Ref.: S003, F005. **Depende do gate de logo do CP1** (leitura regional p10 ≥ 45; usar só
variantes cadastradas).

### 7 · `minimal-titulo-gigante` — MIN-10
Headline dominante: 1–2 palavras, largura 80–100, altura 22–38, topo 10–48; apoio pequeno alinhado à direita 70–80;
serviço 84–88. Sem sangrar pela borda no v1 (o compositor mede dentro da margem). Ref.: S025, F014, F018.
Precisa de `titulo.escala = dominante` (novo).

---

## 4. P1 — família B (precisa de "foto em caixa" no compositor)

> ⚠ Pedir o aval do owner: o bloco de cor sólida da divisão pode ser lido como "faixa/caixa" pelo estilo da casa.

### 8 · `minimal-divisao-foto-topo` — MIN-04

```
┌──────────────────┐
│                  │
│   foto (topo,    │
│    0 → 60)       │
│                  │
│░░░░░░░░░░░░░░░░░░│ ← junção reta
│ HEADLINE LINHA 1 │   fundo = papel escuro ou claro (oposto da luz do texto)
│ HEADLINE LINHA 2 │
│ apoio apoio      │
│ serviço          │
└──────────────────┘
```

| Papel | Story | Feed |
|---|---|---|
| foto | 0 0 100 60 | 0 0 100 58 |
| fundo | 0 60 100 40 (`escuro` ou `claro`) | 0 58 100 42 |
| headline | 8,5 65 70 11 | 8,5 63 70 13 |
| apoio | 8,5 77,5 70 5 | 8,5 78 70 6 |
| servico | 8,5 84 60 4 | 8,5 86 60 5 |
| logo | 74 83 17,5 5 | 74 85 17,5 6 |

Ref.: S056, F028. Foto ideal: assunto no terço central da foto (o corte de baixo é reto).

### 9 · `minimal-divisao-cor-topo-arco` — MIN-04
Fundo de cor 0–46 com pré, headline e apoio alinhados à esquerda (14–40); foto 42–100 recortada com o topo em arco
(máscara `arco-janela`, a criar na biblioteca de máscaras); logo 10,5–14 à direita. Ref.: S024, S034.

### 10 · `minimal-coluna-foto` — MIN-05
Foto em coluna 58–100 × 0–100 (sangra à direita); coluna de texto 8,5–52 sobre `claro`/`escuro`; headline 14–40, apoio
62–78, serviço 82–88; `fio-fino` opcional entre as colunas. Variação espelhada (foto à esquerda) por parâmetro. Ref.:
S050, S014.

---

## 5. P1 — família C (foto contida)

### 11 · `minimal-moldura-arco` — MIN-06

```
┌──────────────────┐
│       LOGO       │
│    ╭────────╮    │
│    │        │    │
│    │  foto  │    │  máscara arco-janela
│    │        │    │
│    └────────┘    │
│  HEADLINE LINHA  │
│   apoio curto    │
│     serviço      │
└──────────────────┘
```

| Papel | Story | Feed |
|---|---|---|
| fundo | 0 0 100 100 (`claro` ou `escuro`) | idem |
| logo | 41 10,5 18 4 | 41 9,5 18 5 |
| foto (máscara arco) | 22 17 56 44 | 26 16 48 44 |
| headline | 15 64 70 9 | 15 63 70 11 |
| apoio | 22 74 56 4 | 22 75 56 5 |
| servico | 25 82,5 50 4,5 | 25 85 50 5 |
| acento opcional `moldura-fina` | 8,5 9,8 83 78,5 | 8,5 8,9 83 83,4 |

Ref.: S047, F031. Foto ideal: assunto centrado e vertical (prato de cima, pessoa, garrafa).

### 12 · `minimal-moldura-circulo` — MIN-06
Fundo `claro`; pré 12–14, headline 15–26 centrado; foto em máscara círculo (diâmetro 70% da largura: 15–85 × 31–70 no
story); apoio 74–79; serviço 82–88; fios opcionais saindo do círculo para as bordas (`fio-fino`, papel `texto`).
Ref.: S010. Foto ideal: prato visto de cima.

### 13 · `minimal-editorial-deslocado` — MIN-07
Foto inserida e deslocada à direita (30–91,5 × 10–58); headline à esquerda invadindo a base da foto (8,5–70 × 54–68);
apoio 70–80; serviço 83–88. Ref.: S053, F009.

### 14 · `minimal-editorial-faixa` — MIN-07 (Feed primeiro)
Micro cabeçalhos nos cantos 9–11; headline 17–25 à esquerda; faixa de foto de lado a lado 32–62; apoio em coluna à
direita 68–80; rodapé 86–90. Ref.: F038, F017.

---

## 6. P1 — família E (sem foto)

### 15 · `minimal-tipografico-lista` — MIN-09
Fundo `claro`; headline 3 linhas à esquerda 12–36; lista de 3 itens (cardápio, horários, diferenciais) 50–76 com
`fio-fino` acima de cada item; rodapé em 2 colunas 84–88. Ref.: S055. Uso no Studio: horários, serviços, "nesta semana".

### 16 · `minimal-tipografico-convite` — MIN-09
`cantoneiras` nos 4 cantos (8,5–91,5 × 10–88); marca 14–16; pré 30–34; headline 36–46; `fio-fino` 50; apoio 53–56;
serviço 62–66; URL 80–84; tudo centrado. Ref.: F036. Uso: evento, inauguração, data especial.

---

## 7. P2 — família D

### 17 · `minimal-produto-pedestal` — MIN-08
Fundo `claro`; headline 10–27 à esquerda; apoio 30–37; produto recortado 13–91 × 41–88 sobre pedestal/onda
(`onda-assimetrica`, papel `escuro`); selo opcional (`circulo`, papel `destaque`). Ref.: S039, S029. **Depende de
recorte de fundo confiável** e de foto de produto adequada — raro no acervo dos clientes.

---

## 8. Regras que valem para todos

1. **Zona segura primeiro.** Nenhum papel sai de x 8,5–91,5 e y 9,8–88,3 (story) / 8,9–92,3 (feed); acento e foto
   podem sangrar.
2. **Cor só por papel.** `escuro`, `claro`, `destaque`, `destaque2`, `texto` — resolvidos da assinatura e da paleta
   (`ARQUITETURA-VETORES.md` §4). Acento preso a texto usa `texto` (mesma polaridade do texto, sem véu novo).
3. **Tipografia da assinatura.** O modelo não carrega fonte; a hierarquia sai dos papéis da página de assinatura.
4. **Story e Feed = compor duas vezes**, nunca redimensionar a página pronta.
5. **Depois de materializado, é página normal** (`isTemplate: false`), editável como qualquer outra; o modelo fica só
   como procedência (`Generation.fieldValues`).
