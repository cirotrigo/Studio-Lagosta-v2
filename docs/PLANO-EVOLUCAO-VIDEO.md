# Plano de Evolução — Vídeo e Músicas no Editor

**Data**: 28/07/2026 · pedido do Ciro: fluxo de vídeo mais profissional no editor Konva + uma aba **"Músicas"** integrada à Biblioteca de Músicas.

**Origem**: investigação completa do código (editor, export, fila MP4, biblioteca, publicação) + benchmark externo (Canva, CapCut, Polotno, Kapwing) + specs oficiais do Instagram Graph API e do Zernio. Fecha o único corte que restou do `PLANO-EVOLUCAO-EDITOR.md` (§ 5.1/6: camada `video`).

**Legenda**: **P** ≈ meio dia · **M** ≈ 1–2 dias · **G** ≈ 3+ dias.

---

## 1. O que já existe (e é mais do que parece)

A investigação mudou a premissa do plano: **não é um greenfield**. O Studio já tem um pipeline de vídeo com música quase completo — ele só está escondido, despersistido e com a corrente arrebentada em três elos.

1. **Camada `video` no editor** — `konva-layer-factory.tsx:485` (`VideoNode`): `Konva.Image` + `<video>` DOM + `Konva.Animation`, crop para cover, placeholder de carregamento, pausa durante transform. Painel `videos-panel.tsx`: inserir do Drive (`googleDriveVideosFolderId`) ou upload direto ao Blob (MP4/WebM/MOV até 100MB), sempre full-canvas cover com autoplay+loop+muted. Propriedades (`video-properties.tsx`): play/pause, mute, loop, velocidade 0.25–2x, objectFit, duração exibida. **Não há trim, poster frame nem indicação de duração no canvas** (`videoMetadata.posterUrl` e `currentTime` existem no tipo e nunca são usados).
2. **Export com trilha sonora** — `VideoExportButton` (3 pontos do `template-editor-shell.tsx`) abre o `AudioSelectionModal` (`src/components/audio/`): 4 fontes (música da biblioteca / áudio original / mix / mudo), busca com filtros por gênero/humor/projeto, **waveform com trim** (`AudioWaveformTimeline`), volume, fade in/out e **versão instrumental** (stems via MVSEP — diferencial que nem o Canva tem). `exportVideoWithLayers` (`konva-video-export.ts`) grava o stage via MediaRecorder (WebM vp9/vp8, 6–12 Mbps) mixando o áudio via WebAudio — o áudio original vem de um **clone `<video>` ressincronizado a cada 0,1s de drift** (`:770-778`), o ponto mais frágil do fluxo.
3. **Fila server-side de MP4** — WebM sobe ao Blob → `/api/video-processing/queue` (`VideoProcessingJob`) → `/api/video-processing/process` roda **ffmpeg binário** (`ffmpeg-server-converter.ts:259-307`): H.264 **baseline + yuv420p + faststart + AAC 192k 48kHz**, scale+crop para o tamanho do design — **exatamente o perfil que a Graph API exige**. Gera thumbnail, backup no Drive, debita 10 créditos e vira `Generation` com `isVideo: true` na aba Criativos.
4. **Biblioteca de Músicas** — módulo global (`/biblioteca-musicas`): upload direto ao Blob, ingestão do YouTube (RapidAPI + download pelo navegador), separação de stem instrumental via MVSEP (cron a cada 2min, 1 job por vez), player com waveform, download ZIP. **Único consumidor: o modal de export.** `SocialPost`, `Page` e `Template` não têm nenhum campo de música.
5. **Publicação** — story de **vídeo já funciona**: MP4 em `mediaUrls`, `later-scheduler.ts` detecta por extensão, pula normalização e envia por URL com `contentType: 'story'`. O Zernio aceita MP4/MOV H.264 (story ≤100MB/60s, reel ≤300MB/90s, 1080×1920) e auto-comprime excessos.

### Onde a corrente arrebenta

| # | Elo quebrado | Evidência |
|---|---|---|
| 1 | **Nada persiste**: a config de áudio é estado efêmero do botão de export — fechar o editor perde música, trim, volumes. As 8 colunas de áudio de `VideoProcessingJob` (`schema.prisma:876-883`) **nunca são escritas** | `video-export-button.tsx:71-80`, payload da queue sem `audioConfig` (`:450-462`) |
| 2 | **Reel morto na água**: `later-scheduler.ts:675-677` só emite `contentType` para STORY; a heurística das telas de agendamento nunca escolhe REEL (9:16 → STORY, resto → POST) | `creatives-gallery.tsx:603-610` (idêntico em `criativos/page.tsx` e `creatives-panel.tsx`) |
| 3 | **Buraco silencioso**: página de template com camada `video` agendada via `pageId` → `render-engine.ts:143` engole a camada no `default: break`, sai PNG com retângulo transparente, status `RENDERED` | `render-stories/route.ts:60-67` ainda sobrescreve `mediaUrls` |
| 4 | **Fila sem dono**: o processamento é disparado por um `fetch` fire-and-forget do browser (`video-export-button.tsx:509`); fechou a aba, o job fica `PENDING` para sempre — não há cron | `vercel.json` (sem cron de video-processing) |
| 5 | Miudezas: botão órfão `video-export-queue-button.tsx` (fluxo antigo sem áudio); caminho ffmpeg.wasm morto em `konva-video-export.ts:845-867` (ninguém pede `format: 'mp4'` no client); chaves de invalidação erradas `['music-library']` em `use-music-stem.ts:67` e `use-youtube-download.ts:114` (a real é `['biblioteca-musicas']`); 3 regexes divergentes de detecção de vídeo (`later-scheduler.ts:66` vs `:662` vs `media-upload.ts:24`) | — |

---

## 2. Gap: ferramentas profissionais × Studio hoje

| Capacidade (Canva / CapCut / Polotno / Kapwing) | Studio hoje | Veredito |
|---|---|---|
| Aba de músicas no editor com preview e biblioteca | Só modal na hora do export | **Fase 1** (pedido explícito) |
| Música associada ao design, persistida | Estado efêmero do botão | **Fase 1** (`Page.audio`) |
| Trim da faixa com waveform | ✅ `AudioWaveformTimeline` | Reaproveitar na aba |
| Volume, fade in/out, mute do áudio original, mix | ✅ no modal | Reaproveitar |
| Versão instrumental (stem) | ✅ MVSEP | Manter — diferencial |
| Trim do vídeo (start/end) | Inexistente (sempre 0→fim) | **Fase 2** |
| Duração da página visível + limite da plataforma | Número escondido no painel; `validateInstagramFormat` órfão | **Fase 2** |
| Poster frame / capa do vídeo | Campo existe, nunca usado | **Fase 2** |
| Export MP4 H.264+AAC compatível com Instagram | ✅ fila ffmpeg com perfil correto | Manter; dar dono à fila (**Fase 0**) |
| Mix de áudio determinístico | WebAudio em tempo real com clone e drift | **Fase 3** (mix no ffmpeg) |
| Export mais rápido que tempo real (WebCodecs, estilo Polotno) | MediaRecorder tempo real (60s de story = 60s de espera) | Sob demanda |
| Reel publicado como reel | Enum existe, `contentType` nunca emitido | **Fase 0** (é um `if`) |
| Timeline multi-track, beat sync, keyframes (CapCut) | — | **Corte** (§ 7) |
| Render de vídeo server-side a partir do template | render-stories só PNG | **Corte** (guard na Fase 0) |

Modelo de referência (benchmark): **Polotno** — áudio no nível do documento (`store.audios`: src, volume, delay, startTime/endTime) sincronizado com `page.duration`. É Konva-based e prova que **1 faixa por página + trim + volume + fade** cobre o caso de uso; multi-track é o que o CapCut tem e o Canva não precisa.

---

## 3. Visão geral das fases

| Fase | Tema | Estimativa |
|---|---|---|
| **0** | Destravar o que já existe (Reel, guard do render, dono da fila, dead code) | ~2–3 dias |
| **1** | **Aba "Músicas" no editor + persistência da trilha** (o pedido) | ~1 semana |
| **2** | Vídeo profissional no canvas (trim, duração, poster, mute claro) | ~3–4 dias |
| **3** | Export robusto: mix de áudio server-side no ffmpeg | ~3–5 dias |
| **4** | Do editor ao Instagram (exportar-e-agendar, validações, Reel na UI) | ~2–3 dias |
| — | Backlog sob demanda (WebCodecs, imagem+música→vídeo, MP4 nativo no Safari) | quando doer |

Ordem pensada para valor: a Fase 0 destrava publicação de vídeo hoje; a Fase 1 entrega o pedido do Ciro; 2–4 profissionalizam. Fases 1 e 2 são independentes entre si; a 3 depende só da 0; a 4 amarra tudo.

---

## 4. Fase 0 — Destravar o que já existe (~2–3 dias)

1. **Reel de verdade no scheduler — P**: `else if (postType === REEL) → platformSpecificData: { contentType: 'reel' }` em `later-scheduler.ts:675-677`. A receita completa já está em `docs/later-integration.md:564-592`; o checklist de teste de reel está desmarcado — fechar com um post real.
2. **Heurística de agendamento ciente de vídeo — P**: nas 3 telas (`creatives-gallery.tsx:603`, `criativos/page.tsx:409`, `creatives-panel.tsx:233`), quando o `Generation` tem `isVideo`, oferecer STORY/REEL explicitamente (default STORY — é o uso da agência; hoje 9:16 já vira STORY e funciona, mas o usuário nunca consegue escolher REEL).
3. **Guard do buraco silencioso — P**: (a) `render-engine.ts:143` loga warning por camada não suportada; (b) `story-renderer.ts` falha com `RENDER_FAILED` e mensagem clara ("página contém vídeo — use o export de vídeo do editor") quando o design tem camada `video`, em vez de publicar arte furada; (c) o mesmo check na criação de post com `pageId`, para o erro aparecer na hora do agendamento, não às 2h da manhã no cron. Falha de render já cai no `handlePublishFailure` → aviso no WhatsApp (fluxo existente).
4. **Dono para a fila — P**: cron `/api/cron/video-processing` (a cada 2min, mesmo padrão do process-music-stems) processando o job `PENDING`/`PROCESSING` mais antigo com `startedAt` vencido. O fetch do browser continua como acelerador, não como única ignição.
5. **Higiene — P**: deletar `video-export-queue-button.tsx` (órfão, fluxo antigo sem áudio); remover o caminho ffmpeg.wasm de `konva-video-export.ts:845-867` (a conversão é da fila; o wasm pesa >20MB, estoura memória em iOS e o core com x264 é GPL); consertar as chaves `['music-library']`; extrair **um** helper `isVideoUrl()` usado por scheduler, media-upload e composer.

---

## 5. Fase 1 — Aba "Músicas" no editor + persistência (~1 semana)

O coração do pedido. Princípio: **a trilha vira propriedade da página** (como no Polotno), o modal de export vira *editor* dessa propriedade, não um fork efêmero dela.

### 5.1 Persistência — M
- Nova coluna **`Page.audio Json?`** guardando o `AudioConfig` atual (`source`, `musicId`, `audioVersion`, `startTime`, `endTime`, `volume`, `volumeOriginal`, `volumeMusic`, `fadeIn/Out`, durações de fade) + espelho `design.audio` no `DesignData` (`types/template.ts`).
- ⚠️ Migration **à mão** + `npx prisma migrate deploy` (o `.env` aponta para produção — regra do CLAUDE.md; nunca `migrate dev` aqui).
- Gravação pelo **mesmo PATCH do PageSync** que salva layers/canvas (regra transversal 6 do plano do editor: nunca dois writers concorrentes). Mudança de `audio` **não** chama `invalidateScheduledRenders` — música não é visual e o render agendado é PNG; invalidar re-renderizaria stories de imagem à toa.
- Sem campo em `Template`: 1 página = 1 story/reel; default por template é backlog.

### 5.2 A aba — M
- Novo painel `music` na sidebar do editor (`template-editor-shell.tsx:165-175`, ícone `Music`), reutilizando as peças do modal: busca + filtros gênero/humor/projeto (`useBuscaMusicas`), `MusicCard` com preview play/pause via `AudioPlayerContext` (já pausa players concorrentes), estado do stem.
- Clique em "Usar nesta página" grava `design.audio` (source `library`, trecho default = `min(duração da música, duração do vídeo)` — mesma regra do modal).
- Card da **trilha ativa** no topo do painel: waveform com trim (`AudioWaveformTimeline`), volume, fades, toggle instrumental, botão remover. Link "Gerenciar biblioteca →" para `/biblioteca-musicas`.
- Badge de trilha na página (nome da música num chip sobre o canvas ou na PagesBar), como a barra de áudio do Canva — o usuário precisa VER que a página tem música.

### 5.3 Integração com o export — P
- `VideoExportButton` inicializa o `audioConfig` de `design.audio` (hoje nasce `source: 'original'` fixo; o modal nasce `'library'` — inconsistência morre aqui). Ajustes feitos no modal na hora do export oferecem "salvar na página".
- A aba aparece também sem camada de vídeo? **Sim, visível mas com aviso** ("esta página não tem vídeo — a música só é usada no export de vídeo"), preparando o backlog imagem+música→vídeo (§ 8).

### 5.4 Preview música+vídeo no editor — P/M
- MVP: preview da faixa isolada na aba (já existe via player).
- Refinamento: botão "ouvir com o vídeo" — um `<audio>` sincronizado ao `<video>` do `VideoNode` (play/pause conjunto, `currentTime` alinhado ao trecho). Não perseguir sync perfeito de edição — é conferência, não timeline.

Arquivos: `prisma/schema.prisma` + migration, `types/template.ts`, `page-sync-wrapper.tsx`/`multi-page-context.tsx`, `template-editor-shell.tsx`, novo `sidebar/music-panel.tsx`, `audio-selection-modal.tsx` (extração de subcomponentes), `video-export-button.tsx`.

---

## 6. Fase 2 — Vídeo profissional no canvas (~3–4 dias)

1. **Trim do vídeo — M**: `videoMetadata.trimStart/trimEnd` + UI no `video-properties.tsx` (slider duplo sobre uma faixa de thumbnails simples, ou só slider duplo no MVP). `VideoNode` reproduz de `trimStart` e loopa em `trimEnd`; o export posiciona `currentTime = trimStart` e grava `trimEnd − trimStart` segundos (hoje `konva-video-export.ts:367,737` fixa `currentTime = 0`). Duração efetiva = trim ∧ trecho da música (regra que já existe para música em `:358-364`).
2. **Duração visível + validação — P**: chip com a duração efetiva da página no canvas/painel; `validateInstagramFormat` (`instagram-presets.ts:55`, hoje órfão do fluxo principal) alimenta avisos: story >60s, reel >90s (limites Zernio), formato ≠ 9:16.
3. **Poster frame — P**: botão "usar frame atual como capa" → captura (`generateVideoThumbnail` já existe) → `videoMetadata.posterUrl` (campo já existe); usado como thumbnail da página e da Generation. Scrubber de `currentTime` para escolher o frame visível na edição.
4. **Mute do original como decisão persistida — P**: hoje `muted` do canvas e `source` do modal são dois mundos; com `design.audio` persistido (Fase 1), o painel de vídeo mostra o estado real da trilha ("áudio original mudo — tocando *Nome da Música*").

Arquivos: `video-properties.tsx`, `konva-layer-factory.tsx` (VideoNode), `konva-video-export.ts`, `types/template.ts`, `instagram-presets.ts`.

---

## 7. Fase 3 — Export robusto: mix de áudio server-side (~3–5 dias)

**Motivação**: o elo mais frágil do export é o áudio em tempo real — clone `<video>` para capturar o áudio original, ressincronização por drift, mix WebAudio ao vivo, tudo dependente da aba visível e da máquina do usuário. O ffmpeg da fila já está lá, e as 8 colunas de áudio do job **já existem no schema**, mortas.

1. Client grava **sempre vídeo mudo** (canvas stream sem faixa de áudio) — some o clone, o mix ao vivo e a silent track (`konva-video-export.ts:474-703` encolhe ~230 linhas).
2. `audioConfig` + `videoFileUrl` (o `layer.fileUrl` do vídeo base) + `trimStart` vão no payload da queue e preenchem as colunas do `VideoProcessingJob` (finalmente escritas — e `MusicLibrary.usedInVideos` passa a rastrear uso real).
3. `process/route.ts` monta o filtergraph: música com `atrim` (trecho) + `volume` + `afade` in/out; áudio original extraído **do arquivo fonte** (`-i video-original.mp4`, alinhado pelo trim) — mais fiel que qualquer captura ao vivo; `amix` no modo mix; `-shortest`. AAC 48kHz como já está.
4. Rollout com fallback: flag no payload; o caminho atual continua até o novo estabilizar. Testar duração de function (mix + transcode de 60s cabe folgado nos 300s atuais; Fluid Compute permite subir a 800s se precisar).
5. **Bônus possível**: com o áudio fora do MediaRecorder, dá para aceitar `video/mp4` nativo do MediaRecorder onde exista (Safari 14.1+, Chrome recente) e destravar **export no iPad** — hoje `checkVideoExportSupport` bloqueia Safari por exigir WebM. Avaliar no fim da fase (P de investigação).

**WebCodecs + Mediabunny (estilo Polotno) fica no backlog**: renderização frame a frame determinística e mais rápida que tempo real direto do `stage.toCanvas()`, MP4 no browser. É a evolução natural SE o tempo real incomodar (60s de story = 60s de espera), mas o AAC do AudioEncoder não existe em Firefox/Linux e a complexidade é G — com o mix já no servidor, o ganho imediato é menor.

Arquivos: `konva-video-export.ts`, `video-export-button.tsx`, `queue/route.ts`, `process/route.ts`, `ffmpeg-server-converter.ts`.

---

## 8. Fase 4 — Do editor ao Instagram (~2–3 dias)

1. **Exportar e agendar — M**: quando o job completa (o `creatives-panel` já escuta `video-export-completed`), CTA "Agendar este vídeo" abrindo o composer com MP4, postType STORY/REEL e caption vazio — fecha o ciclo editor→Instagram em um fluxo.
2. **Validações de vídeo no backend — P**: `validatePost` (`later-scheduler.ts:378-396`) hoje só conta mídias; adicionar: REEL exige vídeo (hoje o guard é só client-side — o MCP `create-post` aceita reel com imagem), duração ≤60s story / ≤90s reel, tamanho ≤100MB/300MB, extensão pelo helper único da Fase 0. Erros em português no composer.
3. **REEL no composer — P**: seleção explícita de tipo quando a mídia é vídeo (depende do item 2 da Fase 0).
4. **MCP/Claudinho — P (opcional)**: `create-post` e `gerar_arte_studio` cientes de vídeo com as mesmas validações.

---

## 9. Cortes conscientes (não fazer)

- **Timeline multi-track estilo CapCut** — o caso de uso é 1 vídeo + 1 trilha por story de restaurante. Canva e Polotno provam que faixa única por página + trim + volume + fade basta. Multi-track traria semanas de trabalho de UI para um recurso que a agência não usa.
- **Beat sync / auto-cut / keyframes de áudio / transições** — idem; nem o CapCut Web tem beat sync.
- **Render de vídeo server-side a partir do template** (cron render-stories emitindo MP4) — reimplementar decode+composição+encode no servidor é um projeto inteiro; alternativas prontas custam caro (Shotstack ~US$0,20–0,40/min; Remotion = licença ≥US$100/mês + reescrever o render em React). **O "render server-side" de vídeo do Studio É o export do editor + fila ffmpeg.** O guard da Fase 0 elimina o único perigo real (o buraco silencioso).
- **ffmpeg.wasm no browser** — teto de ~2GB de memória, crashes em iOS, core com x264 é GPL; a fila server-side já resolve. Remover o caminho morto (Fase 0).
- **Música em story de imagem via API** — o sticker de música do Instagram não existe na Graph API; não há o que fazer do nosso lado.

**Backlog sob demanda**: WebCodecs+Mediabunny (§ 7) · **imagem+música → vídeo** (transformar arte estática + trilha em MP4 de Xs via ffmpeg `-loop 1 -i arte.png -i musica.mp3` — barato no pipeline da Fase 3 e vira story "com música" de verdade; anotar como candidato forte pós-Fase 3) · trilha default por Template · MP4 nativo do MediaRecorder no Safari/iPad.

---

## 10. Riscos e armadilhas transversais

1. **Migration contra produção**: `Page.audio` via SQL manual + `migrate deploy`; jamais `migrate dev` (drift + reset — CLAUDE.md).
2. **`Page.audio` no MESMO PATCH dos layers** (PageSync), e **sem** disparar `invalidateScheduledRenders` — música não é mudança visual; invalidar re-renderizaria PNGs agendados à toa.
3. **CORS**: WebAudio e `<video crossOrigin>` exigem CORS liberado nos blobs (Vercel Blob público já atende; atenção se algum dia servir mídia de outro host).
4. **Duração tem três donos** (vídeo, trim, trecho da música) — a regra "duração efetiva = min(trim do vídeo, trecho da música)" precisa valer no chip da UI, no export client e no ffmpeg, senão o MP4 diverge do preview. Mesma classe de armadilha da entrelinha em dois campos do editor.
5. **Fila com débito de créditos**: o cron da Fase 0 não pode reprocessar job já `COMPLETED`/`FAILED` nem debitar duas vezes (`creditsDeducted` já protege — manter).
6. **`sendToLater` ignora post com `laterPostId`** (armadilha documentada no CLAUDE.md) — vale igual para posts de vídeo; nenhum caminho novo pode "reenviar" MP4 limpando esse campo.
7. **Konva.Animation redesenha o layer continuamente** enquanto há vídeo — com 1 vídeo por página está ok; se algum dia houver multi-vídeo, revisar (pausar animação de vídeos fora do viewport).
8. **Paridade editor×export continua sendo a regra** (transversal do plano do editor): campo novo de vídeo/áudio só está completo quando o VideoNode (editor), o export client e o filtergraph do ffmpeg concordam — o A/B aqui é assistir o MP4 final, não comparar PNGs.
