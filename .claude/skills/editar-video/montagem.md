# `04_DAVINCI/montagem.json` — plano de montagem das peças

Um arquivo por projeto (pasta), com uma ou mais peças. Quem escreve é a etapa de plano
(à mão ou por um script da edição); quem lê são `montar.py`, `estabilizar.py` e `render.py`,
que rodam dentro do Resolve pelo MCP (`run_script_unsafe`, 60 s por chamada).

Caminhos são **relativos à pasta do projeto** (`RAIZ`); absoluto também vale. JSON puro, sem
comentários.

## Forma

```json
{
  "projeto": "QUINTAL - Costela do Edd",
  "pecas": [
    {
      "id": "V2",
      "timeline": "QP-COSTELA-V2 - A costela - v01",
      "saida": "QP-COSTELA-V2 - A costela",
      "velocidade": 25,
      "musica": {
        "arquivo": "05_AUDIO/Trilhas/48 - Zeca Pagodinho - Toda A Hora - ZecaPagodinhoVEVO (instrumental).mp3",
        "inicio_s": 0.49,
        "fade_out_s": 1.4
      },
      "planos": [
        { "arquivo": "01_BRUTO/clip/20260921_C0098.MP4", "inicio_q": 0,   "dur_s": 1.99617, "nota": "panorâmica" },
        { "arquivo": "01_BRUTO/clip/20260921_C0095.MP4", "inicio_s": 0.5, "dur_s": 1.99617, "zoom": 1.1 },
        { "arquivo": "01_BRUTO/clip/20260921_C0101.MP4", "inicio_q": 0,   "dur_s": 1.99617, "velocidade": 50 }
      ],
      "logo": { "arquivo": "06_ELEMENTOS/Logo/<logo animada>.mov", "entrada_s": -3.0, "escala": 0.65 }
    }
  ]
}
```

(Exemplo de FORMA: os pontos de entrada e a entrada da música acima não são o plano do vídeo 2.)

## Campos

**Raiz**

| campo | obrigatório | o que é |
|---|---|---|
| `projeto` | sim | nome do projeto no Resolve. Os scripts **recusam** rodar se o projeto aberto for outro — o Resolve é compartilhado e eles nunca trocam de projeto |
| `pecas` | sim | lista de peças; `IDS` escolhe quais rodar |

**Peça**

| campo | obrigatório | o que é |
|---|---|---|
| `id` | sim | curto e único (`V2`, `S01`); é o que vai em `IDS` |
| `timeline` | sim | nome da timeline. Remontar recria a timeline com esse nome |
| `saida` | não | nome do MP4 sem extensão (padrão: o da timeline) |
| `velocidade` | não | velocidade padrão dos planos, em % (padrão 100) |
| `cdl` | não | cor padrão dos planos: `{"Slope": "1.02 1.0 0.97", "Offset": "0 0 0", "Power": "1 1 1", "Saturation": "1.05"}` (nó 1) |
| `estabilizar` | não | `false` tira a peça inteira da fila de estabilização (padrão `true`) |
| `musica` | não | ver abaixo |
| `planos` | sim | em ordem, na V1 |
| `logo` | não | ver abaixo |

**Música** (A1)

| campo | o que é |
|---|---|
| `arquivo` | a faixa (em `05_AUDIO/Trilhas`; o instrumental é o padrão da casa) |
| `inicio_s` | segundo da faixa que toca no quadro 0 da peça. É ele que põe a batida no corte — confira a fase antes (`reference_grade_de_batidas_fase`) |
| `fim_s` | em vez de `inicio_s`: a faixa **termina** aqui no fim da peça (fim natural); o início sai do total REAL montado. Sem fade padrão |
| `fade_out_s` | padrão 1,4 s com `inicio_s`, 0 com `fim_s` |
| `fade_in_s` | padrão 0 |

A faixa é cortada no comprimento real da V1 (não no pedido).

**Plano** (V1)

| campo | obrigatório | o que é |
|---|---|---|
| `arquivo` | sim | o **bruto** (`01_BRUTO/...`), que é o item do Media Pool com o proxy ligado. Os quadros do proxy são os mesmos: pode olhar no proxy e escrever o número aqui |
| `inicio_q` | um dos dois | quadro de entrada no arquivo, contado do 0 |
| `inicio_s` | um dos dois | segundo de entrada no arquivo, em tempo real; vira `round(s × fps do arquivo)` |
| `dur_s` | sim | duração **na timeline**, já em câmera lenta. Pode ter decimais (4 batidas a 120,23 bpm = 1,99617 s) |
| `velocidade` | não | % (25 = um quarto); vence a da peça |
| `zoom` | não | `ZoomX = ZoomY` fixo (1,0 = sem zoom) |
| `cdl` | não | vence o da peça; `null` tira a cor deste plano |
| `estabilizar` | não | `false` pula este plano na estabilização |
| `nota` | não | livre, ignorado pelos scripts |

**Logo** (V2)

| campo | o que é |
|---|---|
| `arquivo` | a logo **animada** (.mov com alfa, ProRes 4444). Imagem parada não serve (1 quadro) |
| `entrada_s` | quando entra, em segundos da peça; **negativo conta do fim** (`-3` = 3 s antes do fim). Padrão `-3`. Vai até o fim da peça, ou até o último quadro da logo, o que vier antes |
| `escala` | `ZoomX = ZoomY` (0,65 é o que o Ciro usou nos Reels da Real). A logo entra com `Scaling = Fit`, para não herdar o `scaleToCrop` do projeto |

Logo que ainda não existe no disco não trava a montagem: a peça sai sem logo, com aviso.

## Como os quadros são contados (medido em 18–20/09; o que é modelo está dito)

- Timeline a 29,97 = **30000/1001** exatos; bruto Sony a 119,88 = 120000/1001. O Resolve devolve o
  fps arredondado e o script converte para o valor real.
- Os **cortes** saem do acumulado: `corte_i = round((dur_1 + … + dur_i) × fps)`. Cada plano mira o
  seu corte a partir de onde o anterior terminou DE FATO (lido com `GetDuration`), então o erro de
  um plano é absorvido pelo seguinte e a peça não deriva da grade.
- Um plano que precisa de `D` quadros de timeline a `v`% consome `D100 = round(D × v/100)`
  quadros "a 100%" e `n` quadros do arquivo, o menor `n` com `floor(n × fps_tl/fps_arq) = D100`
  (fim **exclusivo**: `endFrame = início + n`). `SetSpeed` com ripple divide `D100` pela velocidade.
- Do 119,88 para o 29,97 a razão é exatamente 1/4, então tudo é alcançável a 100%; **a 50% só
  durações pares e a 25% só múltiplos de 4** (se o Resolve arredonda como na memória). A 120 bpm
  exatos, os cortes de 4 batidas caem em 60, 120, 180, 240… (múltiplos de 4 até ~16 s); a 120,23 bpm
  o 3º corte já é 179 (5,9885 s × 29,97), e a 25% o plano entrega 180: 1 quadro (33 ms) de desvio,
  que o plano seguinte devolve.
- Câmera lenta consome pouco bruto: 2 s de timeline a 25% = 60 quadros = 0,5 s do arquivo; a 50%,
  1 s. O script avisa se `início + n` passar do fim do arquivo.
- Fonte a 24 qps numa timeline 29,97 tem durações **inalcançáveis** (55, 60 e 65 quadros não
  existem); o script usa a vizinha e mostra a diferença.

## Ordem de uso

Cada chamada do MCP é um script novo: `RAIZ` (e `IDS`) vão em todas.

```python
# 1. montar (apaga e recria as timelines de IDS; a antiga fica como "<nome> · anterior")
RAIZ = "/Volumes/.../PROJETO"; IDS = ["V2"]
exec(open("<repo>/.claude/skills/editar-video/montar.py").read())
# 2. estabilizar — repita até "pendentes": 0
exec(open("<repo>/.claude/skills/editar-video/estabilizar.py").read())
# 3. ⏸ o Ciro olha a timeline
# 4. render (só enfileira e dispara) e depois o acompanhamento
exec(open("<repo>/.claude/skills/editar-video/render.py").read())
RAIZ = "/Volumes/.../PROJETO"; MODO = "status"; exec(open("<repo>/.claude/skills/editar-video/render.py").read())
```

O retorno do `montar.py`, por peça: `planos[]` com `pedido_q`, `obtido_q`, `dif_q`,
`corte_pedido_q` e `corte_obtido_q`; `total_pedido_q` × `total_obtido_q`; a trilha (`inicio_q`,
`dur_q`, `dif_q`, fades); a logo (`entrada_q`, `dur_q`); `avisos` e `erros`. Leia as diferenças
antes de seguir. `estabilizar.py` grava a fila em `04_DAVINCI/estabilizados.json`.
