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
   Cria (ou abre) o projeto, timeline **1080x1920 a 29,97**, bruto 16:9 preenche o
   9:16 (`scaleToCrop`), proxy ligado quando existe, transcrição em português;
   importa `01_BRUTO`, `05_AUDIO` e `06_ELEMENTOS` em bins com os mesmos nomes das
   pastas. É idempotente: rodar de novo só importa o que falta e religa proxies.

## 3. Proxies

```bash
npx tsx .claude/skills/editar-video/proxies.ts "<pasta>" --jobs 2      # em segundo plano
```

H.264 1080p pelo hardware do Mac, em `02_PROXIES` espelhando `01_BRUTO`. **Mesmo
fps e mesmos quadros do bruto** — conferido arquivo a arquivo; o que não confere
aparece no resultado. Depois, rode o passo 2 de novo para ligar os proxies.

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

## 5 em diante — pauta, copy, som, montagem, render

| Etapa | Situação |
|---|---|
| ⏸ Pauta das peças (tipo, duração, mensagem) | caixa de pergunta; peças: Reel sem texto com logo no fim, Story com texto animado, vídeo com fala, corte curto para anúncio, animação de logo e textos |
| ⏸ Copy do texto na tela | skill `revisar-copy` |
| Música: sugerir e baixar da biblioteca do Studio (lagostacriativa.com.br/biblioteca-musicas) → `05_AUDIO/Trilhas` | **a desenhar** com o Ciro (pode precisar de tool no conector) |
| Grade de batidas com fase conferida | `batidas.py` do TERO — **a portar** |
| Locução pela ElevenLabs → `05_AUDIO/Locucao` | **a desenhar** |
| Efeitos sonoros pela Envato → `05_AUDIO/Efeitos Sonoros` | **a desenhar** (o MCP da Envato já busca: `search_sound_effects`) |
| Plano de montagem `04_DAVINCI/montagem.json` e montagem no Resolve | scripts do Empório (`plano.py`, `montar_resolve.py`, `estabilizar.py`) — **a portar** |
| Animação de logo e textos (Fusion no Resolve; Remotion se ficar melhor) → `06_ELEMENTOS/Motion` | **em teste** (`texto_fusion.py` do Empório; skill `human-motion`) |
| ⏸ Timeline pronta | o Ciro olha no Resolve |
| Render → `08_EXPORTACOES/01_PREVIAS`; aprovado → `02_APROVADOS` | `render.py` do Empório — **a portar** |

## Armadilhas medidas

- `MediaPool.ImportMedia` no 21.1 só aceita **caminho como texto**; com
  `{"FilePath": ...}` (a forma da documentação) importa zero, sem erro.
- `ImportMedia` importa no **bin atual**: sempre `SetCurrentFolder` antes.
- O resto do MCP (append com fim exclusivo, durações inalcançáveis, Fusion por
  script, recordFrame, 60 s por chamada) está na memória `reference_davinci_resolve_mcp`.
