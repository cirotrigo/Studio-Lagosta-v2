# Peça COM FALA no `04_DAVINCI/montagem.json` — `segmentos` (montar_fala.py)

Mesmo arquivo e mesma raiz do `montagem.md`. Uma peça com **`segmentos`** é montada pelo
`montar_fala.py`; uma peça com **`planos`** continua no `montar.py`, que ignora as de fala (rodar
sem `IDS` é seguro). O `estabilizar.py` e o `render.py` servem às duas: na peça de fala, o segmento
*i* é o item *i* da V1.

## Trilhas

| trilha | conteúdo |
|---|---|
| V1 `MONTAGEM` | um item por segmento: a imagem da própria fala **ou** a cobertura |
| V2 `LEGENDA` | o vídeo da legenda (com alfa), do quadro 0 ao fim da V1 |
| V3 `LOGO` | a logo animada (igual ao `montar.py`) |
| A1 `FALA` | a voz do arquivo `fala`, um item por segmento com fala, contínua |
| A2 `TRILHA` | a música, do quadro 0 ao fim da V1 (dois itens quando há `subida`) |

## Forma

Dados do V1 do Costela do Edd (24/09/2026), encurtados; os valores são daquela peça, não padrão.

```json
{
  "id": "V1",
  "timeline": "QP-COSTELA-V1 - A história do prêmio - v01",
  "saida": "QP-COSTELA-V1 - A história do prêmio",
  "fala": "01_BRUTO/clip/20260921_C0100.MP4",
  "estabilizar": false,
  "voz": { "isolamento": 60, "nivelador": "MORE_LIFT_FOR_LOW_LEVELS", "saida_db": -3 },
  "musica": { "arquivo": "05_AUDIO/Trilhas/85 - Texas (Tarantino Country Rock) - Infraction (instrumental).mp3",
              "inicio_s": 77.3439, "volume_db": -24, "fade_out_s": 1.4,
              "subida": { "em_s": 54.688, "volume_db": -12 } },
  "legenda": { "arquivo": "06_ELEMENTOS/Motion/QP-COSTELA-V1-legenda.mov", "alfa": "Premultiplied" },
  "logo": { "arquivo": "06_ELEMENTOS/Logo/Quintal-logo-01-1080x1920-2997.mov", "entrada_s": 54.688, "escala": 1.0 },
  "segmentos": [
    { "de_s": 36.2696, "ate_s": 39.2058,
      "cobertura": { "arquivo": "01_BRUTO/clip/20260921_C0095.MP4", "inicio_q": 36, "velocidade": 25 },
      "estabilizar": true, "nota": "gancho" },
    { "de_s": 1.4014, "ate_s": 3.7371, "nota": "Ed se apresenta: imagem da própria fala" },
    { "de_s": 28.1948, "ate_s": 32.0654, "volume_db": 3,
      "cobertura": { "arquivo": "01_BRUTO/clip/20260921_C0102.MP4", "inicio_q": 527, "velocidade": 50 },
      "estabilizar": true, "nota": "fala do Diogo sob cobertura: ganho no trecho inteiro" },
    { "de_s": 46.046, "ate_s": 48.1481, "nota": "rosto, parte 1/3" },
    { "de_s": 48.1481, "ate_s": 49.049, "volume_db": 9, "nota": "rosto, parte 2/3: o Diogo, longe do microfone" },
    { "de_s": 49.049, "ate_s": 52.9529, "nota": "rosto, parte 3/3" },
    { "de_s": 68.2015, "ate_s": 69.7363, "nota": "brinde" },
    { "sem_fala_s": 3.07, "cobertura": { "arquivo": "01_BRUTO/clip/20260921_C0100.MP4", "inicio_q": 8360, "velocidade": 50 },
      "nota": "o brinde segue em câmera lenta e MUDO; o tim-tim cai aqui, com a logo" }
  ]
}
```

Imagem sem som de um arquivo com fala: `cobertura` apontando para o próprio arquivo da fala (como o
último segmento acima). Entra só na V1; a A1 não recebe nada.

## Campos

**Peça**

| campo | obrigatório | o que é |
|---|---|---|
| `id`, `timeline`, `saida` | sim, sim, não | como no `montagem.md` |
| `fala` | sim | arquivo cuja VOZ vai na A1 (o bruto, com o proxy ligado). Um por peça |
| `segmentos` | sim | em ordem; cada um vira um item na V1 e, se tiver fala, um na A1 |
| `voz` | não | tratamento de cada item da A1 (abaixo) |
| `musica` | não | a trilha na A2 (abaixo) |
| `legenda` | não | o vídeo da legenda na V2 (abaixo) |
| `logo` | não | como no `montagem.md` (`arquivo`, `entrada_s`, `escala`) |
| `transcricao` | não | caminho do JSON de palavras da fala com tempo **na fonte**: a saída do `transcrever.py` revisada, `[{"palavra", "ini_s", "fim_s", "publico", …}]` (`"publico": false` fica de fora da legenda). Quem lê é o `legenda.py --peca`; o `montar_fala.py` não |
| `cdl` | não | cor padrão das imagens da V1, como no `montagem.md` |
| `estabilizar` | não | `false` tira a peça da fila do `estabilizar.py`. Com a fala no tripé é o recomendado: cada cobertura feita na mão volta com `"estabilizar": true` no segmento |
| `notas` | não | livre (objeto ou texto), ignorado pelos scripts: é onde fica o porquê das decisões |

**`voz`** — aplicado em cada item da A1, pelo `SetProperty` do item:

| campo | o que é |
|---|---|
| `isolamento` | 0–100: liga o Voice Isolation com essa força. 0 ou ausente = desligado |
| `nivelador` | modo do Dialogue Leveler: o sufixo de `resolve.DIALOGUE_LEVELER_MODE_*` (ex.: `MORE_LIFT_FOR_LOW_LEVELS`), com "reduzir o alto" e "levantar o baixo" ligados. Nome que não existe na versão vira aviso |
| `saida_db` | dB somados ao volume de todo item da A1 (a "saída" da fala). Vai em `AudioVolume` porque `AudioDialogueLevelerOutputGain` aceita o Set e fica em 0 no 21.1 (medido em 24/09) |

O script relê o `AudioVolume` depois de gravar: se a API aceitar e não guardar, vira aviso.

**`musica`** — como no `montagem.md` (`arquivo`, `inicio_s` **ou** `fim_s`, `fade_in_s`,
`fade_out_s`: padrão 1,4 s com `inicio_s` e 0 com `fim_s`), e mais:

| campo | o que é |
|---|---|
| `volume_db` | volume da trilha, padrão **−22** (no V1: −24 sob a fala) |
| `subida` | `{"em_s": segundo da peça, "volume_db": dB}`: a trilha passa para esse volume nesse quadro e segue até o fim. Vira DOIS itens contíguos da mesma fonte (a API não faz keyframe de volume); o fade de entrada fica no primeiro e o de saída no último |

**`legenda`**

| campo | o que é |
|---|---|
| `arquivo` | vídeo com alfa (ProRes 4444, 1080×1920, 29,97) gerado pelo `legenda.py`, do quadro 0 até o fim da V1. Fora do disco = peça sem legenda, com aviso |
| `alfa` | `Alpha mode` do clipe no Media Pool; padrão `"Premultiplied"` (é como o `legenda.py` grava); `null` não mexe |
| `estilo` | objeto: aparência da legenda (fonte, cores, contorno, posição…). Lido pelo `legenda.py` ao GERAR o vídeo — os campos estão no cabeçalho dele |
| `titulo` | objeto: título fixo por cima do começo da peça (texto, até quando fica). Também do `legenda.py` |

O `montar_fala.py` só usa `arquivo` e `alfa`; mudou `estilo` ou `titulo`, gere o vídeo de novo e
troque a mídia (ver "Legenda").

**Segmento**

| campo | obrigatório | o que é |
|---|---|---|
| `de_s`, `ate_s` | um dos dois | trecho da fala em segundos **do arquivo `fala`** (o tempo da transcrição por palavra) |
| `sem_fala_s` | um dos dois | segmento só de imagem, com essa duração. **Só nas pontas** (antes da primeira fala ou depois da última): a A1 não pode ter buraco no meio |
| `cobertura` | não | `{"arquivo", "inicio_q" \| "inicio_s", "velocidade"}` (velocidade em %, padrão 100): a imagem que cobre o segmento. Sem ela, a imagem é a da própria fala, a 100% e em sincronia |
| `estabilizar` | não | `true`/`false` para este item da V1; vence o da peça |
| `volume_db` | não | ganho deste trecho da A1, somado a `voz.saida_db` (só em segmento com fala) |
| `zoom`, `cdl` | não | aplicados à imagem do segmento (a da fala ou a cobertura), como no `montagem.md`; `"cdl": null` tira a cor deste item |
| `nota` | não | livre |

Duas imagens seguidas sobre a mesma fala = dois segmentos com a fala contígua (`ate_s` de um =
`de_s` do outro). A voz sai contínua: o corte cai no mesmo quadro da fonte.

## A conta (fonte 119,88 → timeline 29,97)

- **Fala a 100%**: `n` quadros da fonte dão `floor(n × fps_tl/fps_fonte)` quadros na timeline (a
  fórmula medida em 20/09, com o fps REAL); de 119,88 para 29,97, `floor(n/4)`. O trecho é preso
  à grade da timeline: `início = 4 × round(de_s × 29,97)`, `fim = 4 × round(ate_s × 29,97)`, então
  a duração é exata e o áudio não fica com subquadro. Deslocamento máximo: meio quadro (16,7 ms).
- **O corte é da fala.** `corte_i = início da fala na A1 + duração`. A V1 mira esse corte a partir
  de onde ela terminou DE FATO (`GetDuration`).
- **Imagem da própria fala**: entrada na fonte = `início da fala + 4 × (fim real da V1 − início da
  fala na A1)`. Quadro mostrado = quadro falado (sincronia exata), e o erro de quem veio antes
  some ali: a imagem começa 1 quadro antes ou depois do corte de áudio.
- **Cobertura lenta**: como no `montar.py` (`D100 = round(alvo × v/100)`, menor `n` com
  `floor(n/4) = D100`, `SetSpeed` com ripple). A 25% só saem múltiplos de 4, a 50% de 2: erro
  de até ±2 quadros, pago pelo segmento seguinte. Se a peça acabar numa cobertura, a V1 pode
  terminar ±2 quadros fora da fala (aviso). Termine na imagem da fala ou num `sem_fala_s`.

V1 do Costela: 22 segmentos, **1709 q = 57,024 s**; a fala termina em 1617 e os 92 q finais são o
brinde mudo em câmera lenta, com a logo entrando no tim-tim (1639).

## Ordem das chamadas e o que é conferido

Por segmento: **imagem na V1, depois fala na A1**, cada uma no fim da própria trilha
(`recordFrame` só é honrado em trilha vazia; o script passa assim mesmo, e confere). Medido no V1:
o append em duas trilhas intercaladas vai para o fim de CADA trilha.

1. `GetStart` de cada item tem de cair onde a trilha terminava. Se não cair, **para** com a
   mensagem "o append não foi para o fim da trilha".
2. A cobertura com `SetSpeed(ripple)` entra antes da fala do segmento, então nada começa depois
   dela; o script confere que o fim da A1 não mudou.
3. `sinc_q` nos segmentos com a imagem da fala: `(fonte V1 − fonte A1)/4 − (início V1 − início A1)`
   pelo `GetSourceStartFrame`. Tem de dar 0.
4. Duração da fala ≠ conta vira aviso.

A timeline é montada como `"<nome> · montando"`. Só no fim, sem erro, a antiga vira
`"<nome> · anterior"` (a anterior da anterior some; `APAGAR = True` apaga sem cópia) e a nova
ganha o nome. Com erro, nada antigo é tocado e a `· montando` fica para diagnóstico (a próxima
rodada a apaga).

## Voz: quem está longe do microfone

Isolamento + nivelador limpam e aproximam, mas **não levantam quem está sem microfone**: no V1 o
Diogo estava 6 a 15 dB abaixo do Ed (lapela) e o nivelador sozinho subiu só 1–2 dB (medido no
render de 24/09). O que resolve:

- **Trecho de rosto: parta o segmento nas pausas** em volta da fala de quem está longe
  (`ate_s` de uma parte = `de_s` da seguinte) e ponha `volume_db` só na parte dele. O corte é
  invisível: mesma fonte, contígua e em sincronia — a V1 continua contínua, com `dif_q` 0 e
  `sinc_q` 0 em todas as partes (a autoconferência do `montar_fala.py` prova isso). Procure as
  pausas no nível do áudio, não na transcrição.
- **Trecho sob cobertura**: `volume_db` no segmento inteiro (ninguém vê o rosto).
- No V1: +9 e +10 dB nas partes do Diogo, +3 no trecho coberto, e `saida_db` −3 na fala toda.

## Música baixa

`SetProperty("AudioVolumeEnabled", True)` + `SetProperty("AudioVolume", dB)` no item da A2 (usado no
V1 aprovado; o retorno traz `volume_lido`). O −22 dB vem de medida (EBU R128, ffmpeg): a fala do
C0100 tem −13,4 LUFS no arquivo inteiro e a Texas instrumental −11,1 LUFS; com −22 dB a música fica
~18 LU abaixo da voz.

**A `subida` cai num ataque.** O salto de volume é instantâneo (dois itens, sem rampa), então só
soa natural num golpe da música ou num som forte da cena. No V1: −24 → −12 dB no tim-tim do brinde,
com o golpe final da trilha a 13 ms dele.

## Legenda

**A legenda sai antes de montar**, porque a posição da fala na timeline não depende da V1:

```bash
python3 legenda.py --peca "<RAIZ>" V1 --quadros 1.0,4.0   # PNGs para conferir, sem vídeo
python3 legenda.py --peca "<RAIZ>" V1                     # o .mov em legenda.arquivo (nunca sobrescreve: -v2…)
python3 montar_fala.py "<RAIZ>/04_DAVINCI/montagem.json" V1   # só o mapa, para conferir
```

O `legenda.py --peca` lê a peça (`transcricao`, `legenda.estilo`, `legenda.titulo`) e leva as
palavras para a timeline pela conta do `montar_fala.py` (o fps de cada arquivo vem do ffprobe). O
mapa devolve `total_q`/`total_s` (o tamanho do vídeo da legenda) e, por segmento, `fonte_s` (o
trecho já preso à grade) e `timeline_s`: palavra dita no segundo `w` da fonte, dentro de
`fonte_s = [a, b)`, aparece em `timeline_s[0] + (w − a)`. Entra a palavra cujo MEIO cai num trecho
usado, presa às bordas dele; trecho repetido repete a palavra. **Trechos contíguos (a fala partida
nas pausas, um corte de cobertura sobre a fala) são fundidos antes**: presa à borda de um corte
contíguo, a palavra que o cruza atrasaria (no V1, 7 de 194 palavras, até 75 ms). O `montar_fala.py`
devolve o mesmo mapa medido em `fala_na_timeline`.

**Na timeline:** a legenda entra na V2 com `Alpha mode = Premultiplied` (é como o `legenda.py`
grava; alfa lido como direto dá borda escura) e `Scaling = Fit` (sem ele herda o `scaleToCrop` do
projeto). A logo também entra com `Fit`.

**Legenda corrigida depois da cor.** Com a cor já corrigida pelo cliente, **não remonte**: remontar
recria a timeline e apaga a correção. Grave o vídeo novo com outro nome e troque só a mídia:

```python
RAIZ = "/Volumes/.../PROJETO"
VELHO = "06_ELEMENTOS/Motion/<peça>-legenda.mov"; NOVO = "06_ELEMENTOS/Motion/<peça>-legenda-v2.mov"
exec(open("<skill>/trocar_midia.py").read())
```

`ReplaceClip` troca o arquivo do item do Media Pool. **Ainda não foi testado no Resolve**
(24/09/2026): que os itens da timeline ficam onde estão é o que a API promete, não medida. Por isso
o retorno traz o caminho relido e os itens da timeline ABERTA antes e depois: abra a timeline da
peça antes e confira que batem (sem itens do clipe nela, o retorno avisa que não conferiu).
`ReplaceClip` que devolve falso para ali, sem mexer no alfa e sem salvar.

Sem `ALFA`, o `Alpha mode` que o clipe tinha é reaplicado depois da troca (o "and metadata" da API
pode zerá-lo); `ALFA = "Premultiplied"` força, `ALFA = False` não mexe. Serve para qualquer
sobreposição (logo, motion). **O `montagem.json` não é alterado**: o retorno avisa cada campo que
ainda aponta o velho (ex.: `V1.legenda.arquivo`). Troque à mão — remontar com o nome velho
reimportaria a mídia antiga na V2, sem erro.

## Masterização

O render do Resolve pode sair com o áudio acima de 0 dBFS (a mixagem é em ponto flutuante e o AAC
guarda): o V1 saiu com true peak de **+4,5 dBFS**. Depois de cada render:

```bash
python3 masterizar.py "<RAIZ>" "<saida>.mp4"      # --limite -1.5 é o padrão
```

Limita o áudio em −1,5 dBTP sem levantar nada (V1: −16,4 → −16,6 LUFS, pico +4,5 → −1,5), copia
o vídeo sem re-codificar, guarda o render original em `07_TEMPORARIOS/render-bruto/` e põe o
masterizado no lugar. Render de novo = masterizar de novo. Arquivo já dentro do limite (até 0,5 dB
acima: o AAC passa uns décimos) não é tocado (`"feito": false`), então rodar de novo é seguro; se o
pico não descer, nada é movido. `<RAIZ>` tem de ser a pasta do projeto (com `08_EXPORTACOES`).

## Ordem de uso

```python
# 1. montar (só as peças com "segmentos")
RAIZ = "/Volumes/.../PROJETO"; IDS = ["V1"]
exec(open("<skill>/montar_fala.py").read())
# 2. estabilizar até "pendentes": 0 — as coberturas com "estabilizar": true
exec(open("<skill>/estabilizar.py").read())
# 3. ⏸ o Ciro olha  4. render.py  5. python3 masterizar.py (fora do Resolve)
```

Retorno do `montar_fala.py`, por peça: `segmentos[]` com `fala_s`, `fala_q`, `a1_q`, `imagem`,
`imagem_q`, `velocidade`, `alvo_q`, `v1_q`, `dif_q` (V1 − corte) e `sinc_q`; `total_q`, `total_s`,
`fala_fim_q`, `fala_na_timeline`; `musica` (`inicio_q`, `entrada_q`, `dur_q`, `dif_q`, `itens[]` com
`volume_db` e `volume_lido`, `fade_q`, `fades_ok`); `legenda`; `logo`; `itens` (V1 e A1); `avisos` e
`erros`. ID de `IDS` que não é peça com `segmentos` (erro de digitação, peça de `planos`) volta
como uma peça só com `erros`.

Fora do Resolve, `python3 montar_fala.py`, `python3 trocar_midia.py` e
`python3 masterizar.py --checar` rodam as autoconferências. A do `montar_fala.py` roda também o
caminho de DENTRO do Resolve contra um Resolve de mentira (append no fim da trilha, fades, volume
aceito e não guardado, RAIZ em NFD).
