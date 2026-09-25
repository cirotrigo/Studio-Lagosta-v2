---
name: editar-video
description: Processo padrão de edição de vídeo do Studio Lagosta no DaVinci Resolve (MCP) — da pasta bruta ao MP4 aprovado. Use quando o Ciro mandar o endereço de uma pasta de filmagem para editar ("edita os vídeos dessa pasta", "monta os reels da sessão do Quintal", "organiza e abre no Resolve"). Organiza a pasta na estrutura padrão, cria o projeto no Resolve, gera e liga os proxies, decupa com o Gemini (skill analisar-video) e segue até pauta, música, montagem e render. Não use para gerar vídeo por IA (human-cinematic) nem para motion graphics isolado (human-motion).
---

# Editar vídeo (Resolve)

O Ciro manda **o endereço da pasta**. A skill não guarda endereço: cada projeto é a
pasta informada naquela conversa.

## Regra de conversa

**Toda decisão vai numa caixa de pergunta (AskUserQuestion)**, com a opção
recomendada em primeiro lugar e marcada "(Recommended)". Nada de pergunta solta
no texto. Três paradas são obrigatórias: **pauta das peças**, **copy do texto na
tela** e **timeline pronta antes do render**.

## Estrutura de pastas

```
PROJETO/
├── 00_BRIEFING/            pauta, pedido do cliente, manifestos da organização
├── 01_BRUTO/<origem>/      clipes da câmera por origem (clip/, drone/, celular/…) + _analise/
├── 02_PROXIES/<origem>/    H.264 1080p, mesmo fps e mesmos quadros do bruto
├── 03_DECUPAGEM/           folhas de contato, resumo da decupagem
├── 04_DAVINCI/             montagem.json, scripts, fusion
├── 05_AUDIO/               Trilhas/ · Efeitos Sonoros/ · Locucao/
├── 06_ELEMENTOS/           Logo/ · Motion/ · Fotos/ · IA/ · Assets/
├── 07_TEMPORARIOS/
└── 08_EXPORTACOES/         01_PREVIAS/ · 02_APROVADOS/
```

Os scripts ficam nesta pasta da skill e rodam a partir da raiz do repo.

## 1. Organizar

```bash
npx tsx .claude/skills/editar-video/organizar.ts "<pasta>"            # plano, não mexe em nada
npx tsx .claude/skills/editar-video/organizar.ts "<pasta>" --aplicar --decisoes <respostas.json>
```

- Leia o plano. Mostre o resumo (quantos vão para onde) e as **dúvidas** numa caixa
  de pergunta — uma pergunta por dúvida, até 4 por caixa, com a `sugestao` do
  plano como recomendada. As respostas viram o `--decisoes`
  (`{"caminho/relativo": "pasta destino" | "manter"}`).
- Só **move**, dentro do mesmo volume (instantâneo, a data do arquivo não muda e o
  cache da análise continua valendo). Nunca copia nem apaga arquivo. A `_analise`
  de uma pasta vai junto com os vídeos dela.
- Cada aplicação grava um manifesto em `00_BRIEFING/organizacao-<data>.json`.
  Para voltar: `organizar.ts --desfazer <manifesto>`.
- Classificação (`estrutura.ts`): vídeo de câmera e os arquivos que a câmera grava
  ao lado → `01_BRUTO/<origem>`; nome com logo → Logo; vídeo com transparência ou
  "motion" → Motion; IA → IA; áudio por nome (sfx/efeito → Efeitos, voz/locução →
  Locucao, trilha/música → Trilhas); foto → Fotos; fonte → Assets/fontes;
  documento → 00_BRIEFING. PNG solto, áudio sem pista e "vídeo que parece
  exportado" são dúvida.

## 2. Projeto no Resolve

1. **O Resolve é compartilhado** (Codex e outras sessões). Antes de criar ou abrir
   projeto, leia o fim de
   `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/logs/mcp.log`:
   chamada recente sem `claudecode` é de outro cliente — pergunte antes de trocar.
2. Nome do projeto: `<CLIENTE> - <assunto>` (ex.: `QUINTAL - Costela do Edd`),
   confirmado na caixa de pergunta.
3. Rode pelo MCP (`run_script_unsafe`, teto de 60 s):
   ```python
   RAIZ = "<pasta>"; NOME = "<nome>"
   exec(open("<repo>/.claude/skills/editar-video/resolve_projeto.py").read())
   ```
   Projeto novo nasce do **modelo** `modelo-vertical-2997.drp` (desta pasta), porque
   a **taxa de reprodução** é só leitura na API e todo projeto criado do zero toca
   a **24 qps**. Com timeline 29,97, a timeline "agarra" mesmo com proxy (medido em
   24/09/2026: o visualizador mostrava `● 24`). O retorno traz `reproducao_qps`, e
   o aviso manda ajustar pela interface se não for 29,97. Timeline
   **1080x1920 a 29,97**, bruto 16:9 preenche o
   9:16 (`scaleToCrop`), proxy ligado quando existe, transcrição em português;
   importa `01_BRUTO`, `05_AUDIO` e `06_ELEMENTOS` em bins com os mesmos nomes das
   pastas. É idempotente: rodar de novo só importa o que falta e religa proxies.

## 3. Proxies

```bash
npx tsx .claude/skills/editar-video/proxies.ts "<pasta>" --jobs 2      # em segundo plano
```

H.264 1080p pelo hardware do Mac, em `02_PROXIES` espelhando `01_BRUTO`. **Mesmo
fps, mesmos quadros e mesmo timecode do bruto** — conferido arquivo a arquivo; o que
não confere aparece no resultado. Depois, rode o passo 2 de novo para ligar os proxies.

**A ordem importa: projeto no Resolve ANTES dos proxies.** O Resolve só liga proxy
com o mesmo timecode do bruto, e ele lê a Sony a 120p como `17:28:14;030` enquanto o
ffprobe diz `17:28:14:60` (o mesmo instante, escrito diferente; proxy com o do ffprobe
é recusado, medido em 24/09/2026). Por isso o passo 2 grava
`04_DAVINCI/timecodes.json` com o Start TC que o próprio Resolve leu, e os proxies
nascem com ele.

**Por que não o Resolve gerar os proxies:** a geração de proxy do Resolve 21 e o
Blackmagic Proxy Generator (instalado) são só interface — a API tem apenas
`LinkProxyMedia`, e o Proxy Generator não tem linha de comando nem AppleScript
(conferido em 24/09/2026).

**Câmera lenta continua valendo**: o proxy de um bruto de 119,88 qps também é
119,88; a timeline é 29,97, e a lenta sai dos quadros que sobram (25% num 120p).
O render usa o original.

## 4. Decupar

```bash
npx tsx --env-file=.env .claude/skills/analisar-video/analisar.ts "<pasta>"
```

Skill `analisar-video`: lê só o `01_BRUTO`, envia o **proxy do projeto** ao Gemini
(nada de cópia temporária) e guarda o inventário em `01_BRUTO/<origem>/_analise/`.
Pasta já analisada volta do cache. Leve o resumo para `03_DECUPAGEM`.

## 5. Briefing (aprovado em 24/09/2026)

Depois da decupagem, **a skill propõe o briefing** a partir do material analisado.
Não espera o Ciro escrever. São duas caixas de pergunta:

**Caixa 1: o conceito.** Uma pergunta por vídeo que o material sustenta (até 3) e
uma sobre a música. Cada pergunta tem 3 ideias, com a recomendada primeiro. Cada
ideia tem `preview` com o roteiro: formato e duração, áudio (fala ou só música) e
os planos com arquivo e trecho (ex.: `C0100 0:17–0:38`), incluindo a cobertura
das falas. O que a análise marcou como problema (palavrão no áudio, tropeço na
fala, desfoque) aparece no preview com a saída escolhida.

**Caixa 2: detalhes e fatos.** Música por vídeo, os FATOS que faltam na base (data
do evento, nome do prato, período), estilo da legenda e o que mais bloquear a
montagem. Antes dela, consulte a base do cliente (`consultar-base`). Fato que a
base não tem vira pergunta, com "digite em Other" para dado livre. Nunca
invente data, preço nem nome.

O resultado vai para `00_BRIEFING/briefing.md`: fatos com a fonte, uma seção por
vídeo com a estrutura aprovada e as pendências. É esse arquivo que as etapas
seguintes leem. Fato novo dado pelo Ciro (data de evento, prato por tempo
limitado) é oferecido para entrar na base do cliente, numa caixa de pergunta.
Nunca grave na base sem ele confirmar.

## 6. Música (aprovado em 24/09/2026)

A fonte é a **biblioteca de músicas do Studio**, porque o Studio separa a faixa e o
padrão é usar o **instrumental**, inclusive nos vídeos só com música. Tudo pelo
`trilhas.ts`, com `--env-file=.env`:

1. **Listar** o que já existe:
   `trilhas.ts listar --projeto <id> --genero samba,pagode`.
   É só leitura. A ordem é: do cliente antes das globais, menos usada, mais nova.
2. **Clima que a biblioteca não tem → YouTube.** O Claude procura (`WebSearch`
   com `allowed_domains: ["youtube.com"]`). **Artista conhecido é bem-vindo**:
   não priorize música livre de direitos (decisão do Ciro, 24/09/2026; a casa já
   usa música comercial nos Reels). Prefira a faixa original, de 2 a 5 min, e não
   compilação de 1 hora. Confira título, canal e duração antes de perguntar
   (oEmbed + `lengthSeconds` da página).
3. **Caixa de pergunta** com 3 ou 4 faixas, a recomendada primeiro. **Toda faixa
   leva o link do YouTube para o Ciro ouvir**, na descrição e no preview, inclusive
   as da biblioteca (`listar` devolve `link` quando a faixa veio do YouTube; sem
   link, diga que ela está em `07_TEMPORARIOS/trilhas-candidatas` para ouvir).
   O preview traz ainda a origem (do cliente, global ou YouTube), a duração, o BPM
   quando já medido e em que vídeos ela entra.
4. **Cadastrar** a escolhida:
   `trilhas.ts cadastrar --url <youtube> --nome … --artista … --genero … --humor … --projeto <id> --confirmar`.
   Sem `--confirmar` só mostra o que faria, e já confere autor, projeto e
   duplicata. É o mesmo caminho da tela, com as mesmas recusas: a RapidAPI dá o
   link, o MP3 é baixado **neste Mac** (o CDN só serve IP residencial), e só então
   o job é criado e `saveClientDownloadedMp3` sobe ao Blob, cadastra e enfileira
   a separação. Os casos que ele recusa, sem gravar nada:
   - vídeo já na biblioteca (faixa ativa) → aponta a faixa, e diz de que projeto ela é;
   - download do mesmo vídeo em andamento → aponta o job.

   Quem assina é a pessoa do `.studio-autor` (ou `STUDIO_AUTOR`).
5. **Baixar**: `trilhas.ts baixar --pasta <projeto> --ids 85:instrumental`. Espera a
   separação (cron de 2 em 2 min; `--esperar` em segundos, padrão 540 — acima disso rode em segundo plano), grava em
   `05_AUDIO/Trilhas` sem sobrescrever e mede a grade (`batidas.py`) em
   `04_DAVINCI/batidas.jsonl`. Depois rode o passo 2 de novo para importar no Resolve.

A fase da grade é conferida antes de cortar na batida. A confiança do
`batidas.py` nas sambas fica em 0,10–0,16, então o BPM serve, mas a fase não
(memória `reference_grade_de_batidas_fase`).

## 7 em diante — copy, som, montagem, render

| Etapa | Situação |
|---|---|
| ⏸ Pauta das peças | é o briefing do passo 5; peças: Reel sem texto com logo no fim, Story com texto animado, vídeo com fala, corte curto para anúncio, animação de logo e textos |
| Legenda da fala | passo 9: `transcrever.py` (whisper + energia) → `legenda.py --peca` (palavra a palavra, .mov com alfa; estilo e fontes do cliente via `fontes.ts`) |
| ⏸ Copy do texto na tela | skill `revisar-copy` |
| Música | passo 6 (`trilhas.ts` + `batidas.py`) |
| Fase da grade conferida antes do corte | `desvio.py` (corrigido em 24/09/2026) |
| Locução pela ElevenLabs → `05_AUDIO/Locucao` | **a desenhar** |
| Efeitos sonoros pela Envato → `05_AUDIO/Efeitos Sonoros` | **a desenhar** (o MCP da Envato já busca: `search_sound_effects`) |
| Plano de montagem `04_DAVINCI/montagem.json` e montagem no Resolve | passo 8 (`montar.py`, `estabilizar.py`); peça com fala: passo 9 (`montar_fala.py`) |
| Animação de logo e textos (Fusion no Resolve; Remotion se ficar melhor) → `06_ELEMENTOS/Motion` | **em teste** (`texto_fusion.py` do Empório; skill `human-motion`) |
| ⏸ Timeline pronta | o Ciro olha no Resolve |
| Render → `08_EXPORTACOES/01_PREVIAS`; aprovado → `02_APROVADOS` | passo 8 (`render.py` + `masterizar.py`) |

## 8. Montar, estabilizar, render (primeira peça: Costela do Edd, 24/09/2026)

O plano de cada peça fica em `04_DAVINCI/montagem.json` (formato em `montagem.md`):
música com entrada e fade, planos com arquivo, `inicio_q` (quadro da fonte),
`dur_s` e velocidade, e a logo com entrada e escala.

- **Cortes na batida medida**, não na grade fixa. Em faixa ao vivo o andamento
  varia (Toda A Hora: 116–122 BPM, confiança 0,16), e a grade escorrega até
  ±250 ms: rastreie as batidas do trecho usado. A fase se confere com
  `desvio.py`, **a cópia desta pasta**. O `desvio.py` dos `_pipeline` antigos lia
  o envelope com passo de 0,9977 ms como se fosse 1 ms: o "viés de +23,5 ms" era
  esse erro.
- **Durações alcançáveis:** a duração na timeline a 100% é
  `floor(n × 29,97/fps_fonte)`. Com fonte de 119,88 a 25%, só saem múltiplos de 4
  quadros; a 50%, de 2. Escolha as durações pela batida entre as alcançáveis.
- **Montar:** `run_script_unsafe`:
  `RAIZ = "<pasta>"; IDS = ["V2a"]; exec(open("<repo>/.claude/skills/editar-video/montar.py").read())`.
  O retorno traz `dif_q` por plano, música e logo: tem de dar 0.
  A timeline antiga vira "· anterior", e nada que o Ciro mexeu se perde.
  Duas variantes de ritmo viram duas peças no mesmo `montagem.json`, para ele comparar.
- **Estabilizar:** `estabilizar.py`, com as mesmas variáveis, até `pendentes: 0`.
  Remontar a timeline zera a estabilização.
- **⏸ Timeline pronta:** o Ciro olha. Só depois vem o `render.py`, que manda para
  `08_EXPORTACOES/01_PREVIAS` (parte do preset "H.264 Master"), e em seguida
  `python3 .claude/skills/editar-video/masterizar.py "<pasta>" "<saida>.mp4"`: o render do
  Resolve sai com true peak acima de 0 dBFS (+4,5 no V1 da Costela); limita em −1,5 dBTP,
  copia o vídeo sem reprocessar e guarda o bruto em `07_TEMPORARIOS/render-bruto`.
  Depois do render, tire o job da fila: disparado de novo, ele sobrescreve o masterizado.
- **Legenda, logo ou motion refeitos com a cor já corrigida:** gere o arquivo novo com
  outro nome e troque com `trocar_midia.py` (ReplaceClip; o item fica no lugar). **Nunca
  remonte** uma timeline que o Ciro já mexeu: a correção de cor some.

## 9. Peça com fala (primeira: V1 da Costela do Edd, 24/09/2026)

"segmentos" no `montagem.json` no lugar de "planos"; formato completo em `montagem-fala.md`.

1. **Transcrever** o clipe da fala: `python3 transcrever.py "<bruto>" "03_DECUPAGEM/transcricao-<clipe>.json"
   --prompt "<nomes e termos>" [--correcoes corr.json]` (tempo da FONTE; falante A = lapela,
   B = fora do microfone). **Nome próprio se confirma com o Ciro**: "Edd" só apareceu na
   revisão da timeline.
2. **Plano de cortes** pela transcrição e pela análise: gancho, cobertura sobre cada salto
   de fala, sem muletas nem comando de gravação. ⏸ Pauta e ⏸ copy da tela como no passo 7.
3. **Voz:** `voz` na peça (isolamento + nivelador; ouça: se o volume "respirar", veja a armadilha do
   nivelador abaixo). Quem está sem microfone não sobe com o
   nivelador (+1–2 dB medidos): parta o segmento de rosto nas pausas em volta da fala dele
   (corte invisível, mesma fonte em sincronia) e dê `volume_db` só à parte dele. Meça num
   render só de áudio (e rode o `render.py` depois: ele religa o vídeo pelo preset).
4. **Fontes do cliente:** `npx tsx --env-file=.env .claude/skills/editar-video/fontes.ts --projeto <id>
   --raiz "<pasta>" --baixar` → `06_ELEMENTOS/Assets/fontes/`, para o estilo da legenda.
5. **Legenda e título:** `python3 legenda.py --peca "<pasta>" <ID> [--quadros 1.0,4.0]` grava o
   .mov em `06_ELEMENTOS/Motion` (nunca sobrescreve: cria -v2, -v3). Confira os PNGs.
6. **Montar:** `montar_fala.py` (mesmas variáveis do `montar.py`; `APAGAR = True` só enquanto
   ninguém mexeu na timeline), depois `estabilizar.py`, ⏸ timeline, render e masterizar.

## Armadilhas medidas

- `MediaPool.ImportMedia` no 21.1 só aceita **caminho como texto**; com
  `{"FilePath": ...}` (a forma da documentação) importa zero, sem erro.
- `ImportMedia` importa no **bin atual**: sempre `SetCurrentFolder` antes.
- **A taxa de REPRODUÇÃO é outra coisa que a taxa da timeline.** Só leitura na API.
  Com 24, o visualizador mostra `● 24` durante o play e a timeline agarra. A
  correção está no modelo do projeto (passo 2); num projeto antigo, ajuste pela
  interface.
- `LinkProxyMedia` devolve `False` sem dizer por quê: rotação diferente é aceita,
  timecode diferente (ou ausente, quando o bruto tem) não.
- **O iPhone grava VFR:** o `avg_frame_rate` do ProRes sai `992400/33083` (~29,997) e o `r_frame_rate` 30/1; o
  proxy sai 30/1 com os MESMOS quadros e o Resolve liga (Noite Chilena, 25/09). Comparar o fps como texto dava
  "não confere" e refazia o proxy a cada rodada (e a análise re-encodava o original de 19 GB). O `proxies.ts` e o
  `analisar.ts` comparam o fps como número (tolerância de 0,1%), junto com quadros (±1) e timecode.
- **Desfazer (Cmd+Z) no Resolve ressuscita timeline apagada pelo script** e tira o nome da
  atual. Antes de renderizar, identifique a timeline pelo `GetUniqueId`, não pelo nome.
- **Render só de áudio desliga o "Export Video" do projeto** e o `ExportVideo: True` da API
  não religa: o job diz vídeo e sai só áudio. O `render.py` carrega o preset "H.264 Master" antes.
- **A legenda é um .mov pré-renderizado:** o Fusion não edita o texto. Uma composição do
  Fusion deixada no item da legenda (Background + FastNoise) clareou o vídeo inteiro
  ("nuvem branca"). `DeleteFusionCompByName` recusa a última comp do item: `AddFusionComp`,
  `LoadFusionCompByName` da nova e só então apagar (guarde antes com `ExportFusionComp`).
  `ExportCurrentFrameAsStill` com a trilha ligada e desligada (`SetTrackEnable`) isola o efeito.
- `AudioDialogueLevelerOutputGain` aceita o Set e fica em 0: o ajuste de saída vai no `AudioVolume`.
- **O Dialogue Leveler do Resolve piora a fala cortada em pedaços** (V3 da Costela, 25/09: "algumas partes
  ficou abaixando o volume"). Medido palavra a palavra: bruto com desvio de 2,4 dB, com isolamento +
  nivelador 4,1 dB (até 10 dB entre palavras fortes e fracas). O isolamento tira o ruído e expõe as palavras
  fracas; o nivelador não as levanta. O que resolveu: render só da A1 com isolamento e nivelador
  DESLIGADO (A2 desligada) → ganho palavra a palavra rumo à mediana pela transcrição (força 0,6, teto
  ±6 dB, suavizado em 60 ms), compressor leve e limitador → WAV numa A3 "VOZ TRATADA", com a A1
  desligada. Desvio de 1,2 dB e LRA de 5,1 para 2,1 LU, sem subir as pausas, e sincronia de +2 ms (o stem sai da
  própria timeline). O método está em `montagem.json` → `V3.notas.voz_tratada` e o script (com o mapa do V3 cravado) em
  `04_DAVINCI/voz-v3-cavalgar.py` do projeto; vira script da skill quando repetir. Remontar apaga a A3.
- **Cache:** o `resolve_projeto.py` põe o cache no mesmo HD da pasta. O padrão do Resolve
  (`~/Movies/CacheClip`) encheu o Mac com 9,9 GB de cache de um projeto só.
- `run_script_unsafe` corta em ~10 s neste servidor: dispare o render e acompanhe em outra chamada.
- O resto do MCP (append com fim exclusivo, durações inalcançáveis, Fusion por
  script, recordFrame, 60 s por chamada) está na memória `reference_davinci_resolve_mcp`.
