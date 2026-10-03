# Plano — música em qualquer arte, linha do tempo e play/pause no editor (02/10/2026)

Continuação de `docs/PLANO-2026-10-02-VIDEO-NO-EDITOR.md` (PR #182), que deixou
de fora exatamente isto: "foto + música sem nenhum vídeo", "linha do tempo,
entrada/saída por camada, prévia sincronizada com a música".

Versão 3: revisada duas vezes pelo Codex (BLOQUEADO com 14 achados; na
conferência, 10 resolvidos e 4 em aberto, corrigidos aqui; terceira passada:
**APTO**). Valida o plano, não a implementação — cada fase passa pelo Codex de
novo, no diff.

## O pedido

1. Adicionar música em qualquer arte e exportar ou agendar como vídeo.
2. Linha do tempo simples e intuitiva para adicionar vídeos e fotos.
3. Ajustar, arrastando, o início e o fim das fotos e dos vídeos na linha do tempo.
4. Play/pause discreto junto de duplicar, excluir e adicionar, no topo do canvas.

## Estado das outras sessões (conferido em 02/10)

Nenhuma sessão, worktree ou branch tem linha do tempo, play/pause de página ou
export de foto com música. O que existe em volta:

| O quê | Onde | Efeito neste plano |
|---|---|---|
| #182 motion no editor, #183 motions da marca, #184 aba Vídeos, #185 capa de vídeo na agenda | todos em `origin/main` (`a63a9d45`); #184 e #185 entraram durante esta análise. O checkout local está atrás | é a base de todas as fases |
| Motions da carteira (specs de 8 clientes + `gerar-motion.mjs`) | worktree `motion-no-editor`, **sem commit**, sessão "Editor e trabalho com vídeos" rodando | só `scripts/motions/`; sem conflito |
| `claude/nifty-gagarin` (agosto) | `konva-editable-text.tsx` sujo | sem relação |

## O que o código faz hoje

- Não existe tempo de página. O "relógio" é o `<video>` principal
  (`videoPrincipal`); o motion se reconcilia com ele a cada quadro
  (`passoDoMotion`, `konva-layer-factory.tsx`).
- O vídeo abre **tocando em loop** (`videoMetadata.autoplay`, persistido na
  camada); o play/pause do painel grava esse campo e manda evento `video-control`.
- `exportVideoWithLayers` exige uma camada de vídeo: grava o stage em tempo real
  (MediaRecorder, WebM mudo) e a fila mixa o som com ffmpeg. O botão
  "Exportar Vídeo" some sem vídeo.
- Duração: `duracaoDoExport(trecho do principal, trilha)` = o menor entre o
  trecho do vídeo e a fatia da música. Sem vídeo já devolve a fatia da música.
  Mas o ffmpeg só aplica `-t` quando há mix de áudio
  (`ffmpeg-server-converter.ts:369`): MP4 mudo sai com a duração do WebM, que
  tem ~0,2 s de cauda.
- `Page.audio` já existe em qualquer página; a aba Músicas avisa "sem camada de
  vídeo" e usa 15 s como referência.
- As travas contra "vídeo publicado como foto" olham só camadas de vídeo, em 12
  pontos (`videoNaPagina`, `pageContainsVideoLayer`, `videosDaPagina(...).length`).
- Medido em produção (somente leitura): 62 páginas com vídeo, 19 com música,
  **3 com música e sem vídeo**; dos 8 jobs de export ainda na tabela, 8 usam
  música da biblioteca, nenhum tem dois vídeos; mediana 24,7 s.

## Decisões

1. **Faixa única de clipes (estilo CapCut).** No Studio o template é a pasta da
   semana (13 stories independentes), então "página = cena" (Canva) não serve.
   Uma faixa de fotos e vídeos em sequência + a faixa da música; texto, logo e
   motion ficam por cima o tempo todo. Entrada/saída de texto fica fora.
2. **Música na página = a página é um vídeo.** Vale no servidor desde a Fase 1:
   página com fatia de música não se agenda como imagem. Quem quer a imagem
   tira a música (aba Músicas). São 3 páginas legadas.
3. **Dois predicados, não um** (`camadas-de-video.ts`, puros):
   - `temVideoVisivel(layers)` — o de hoje: o render de servidor não desenha
     vídeo (sairia buraco). Continua barrando o RENDER.
   - `paginaEVideo(layers, audio)` — vídeo visível, fatia de música ou 2+
     clipes. Barra a PUBLICAÇÃO como imagem. Página de fotos em sequência
     renderiza no servidor (clipe 1), mas não se agenda como imagem.
4. **O dado é por camada, sem migration**: `layer.clipe?: { duracao?: number }`
   em `image` ou `video`. Os clipes ocupam um **bloco contíguo no fundo** de
   `layers` (abaixo de tudo que é permanente); a ordem dentro do bloco é a
   sequência. `normalizarClipes(layers)` (puro) recompõe o bloco em toda
   escrita do editor que marca, desmarca ou reordena. O início de cada clipe é
   derivado (soma das durações): não há buraco nem sobreposição gravável.
   Vídeo: duração = o trecho que já existe (`trimStart`/`trimEnd`). Foto:
   `clipe.duracao` (padrão 3 s).
5. **Página sem clipe marcado segue o caminho de hoje, literalmente**:
   `linhaDoTempo` devolve `clipes: []` e a duração vem da MESMA conta atual
   (`videoPrincipal` → `trechoDoVideo` → `duracaoDoExport`), inclusive motion
   sobre foto, camada oculta e duração ainda não gravada. Não existe "clipe
   implícito" no dado; a faixa só desenha o principal como uma barra.
6. **Um relógio só: o da página, em tempo de relógio do navegador.** Todo
   `<video>` e o `<audio>` da música se reconciliam com ele por função sem
   estado (o padrão do `passoDoMotion`). Critério de aceite, medido no
   harness: desvio imagem × relógio ≤ 0,1 s em prévia e export. Se não
   passar, a Fase 2 mantém o vídeo de base como mestre onde só há um vídeo.
7. **A regra de duração não muda**: o menor entre a soma dos clipes e a fatia
   da música. A faixa só mostra onde o corte cai.
8. **A página abre parada no primeiro quadro.** Play é gesto da pessoa (o
   navegador exige isso para tocar música). `autoplay`, `loop` e
   `playbackRate` deixam de ser lidos (o dado fica; velocidade ≠ 1 já saía
   errada no export e 0 de 61 páginas usam).
9. **Um plano de som só, para prévia e fila**: `planoDeSom(linha, audio)`
   (puro) diz o que toca e com que aviso. A prévia nunca toca o que o export
   não vai ter.
10. **Foto + música continua gravada no navegador**, pelo caminho que existe.
    Montar no servidor (PNG + ffmpeg) fica para quando a espera incomodar.

## Fase 1 — música em qualquer arte vira vídeo (pedido 1)

Sem dado novo.

| Ponto | Mudança |
|---|---|
| `camadas-de-video.ts` | `paginaEVideo(layers, audio)` e `duracaoDaPagina(layers, audio)` (a conta de hoje, com nome). |
| Travas de publicação | `agendar.ts:247`, `agendar-itens.ts:573` (simulação também), `later-scheduler.ts:261` e `:279` (o ramo sem mídia CRIA um post `PENDING` que o cron renderiza como imagem — é publicação, não render), `template-editor-shell.tsx:267` (modo clássico), `continuous-workspace.tsx:571`, `generate-creatives-modal.tsx:80` passam a `paginaEVideo`, lendo `Page.audio` junto das camadas. Mensagem própria: "esta página tem música — exporte o vídeo ou tire a música". As travas de RENDER (`story-renderer.ts:84`, `persist.ts`, `arte-rapida.ts:1156`, `mcp-server.ts`) ficam em `temVideoVisivel`: página com música renderiza como imagem (miniatura, `ajustar-arte`). Teste de FONTE: nenhum chamador fora da lista. |
| Post que JÁ existia por página antes da música | Continua imagem (a exceção vale só para ele, nunca para post novo): `renderPostArt` segue desenhando a página. Pôr música numa página que já tem post vivo mostra aviso na faixa ("já está na agenda como imagem; a música não vai junto"). |
| `konva-video-export.ts` | `videoLayer` opcional. Sem vídeo: grava o stage pela duração. Aborta com mensagem se a aba ficar oculta durante a gravação (`visibilitychange`) — hoje é só um aviso no diálogo. |
| `ffmpeg-server-converter.ts` | `-t` sempre que há `durationSeconds`, com ou sem mix: o MP4 tem a duração pedida também quando cai para mudo. |
| `audio-do-export.ts` | `fonteEfetiva(cfg, temVideoDeBase)`: sem vídeo de base, `original` → sem som com aviso `sem-audio`; `mix` → só a música com aviso `so-musica`. Usada pelo diálogo (não oferece "som do vídeo" sem vídeo) e pela fila (hoje `original` sem base sai mudo SEM aviso — `process-video-job.ts:133`). |
| `video-export-button.tsx` | Aparece com vídeo ou música. Capa = quadro do stage. Recusa fatia < 1 s. |
| Aba Músicas | Sai "sem camada de vídeo"; entra "esta arte sai como vídeo de N s — a duração é o trecho da música". |
| Fim do export | `creatives-panel.tsx` já escuta `video-export-completed` e já tem o `PostComposer`: ao concluir, abre o agendamento com o MP4 e o horário previsto da página (`agenda-das-paginas`). É o "agendar como vídeo" em um gesto. |
| Duplicar página | `duplicatePage` espera o autosave descarregar antes de chamar a rota (hoje copia o banco e pode levar a trilha anterior). |

Prova da fase: no harness, WebM de foto parada com `nb_frames ≈ fps × duração`
(o MediaRecorder precisa receber quadros de conteúdo que não muda — conferir
decodificando, não supondo); MP4 final com a duração pedida ± 1 quadro, com
música e no fallback mudo.

## Fase 2 — relógio da página e play/pause (pedido 4)

| Ponto | Mudança |
|---|---|
| `src/lib/video/relogio-da-pagina.ts` (novo) | Store fora do React: `{ t, tocando, modo: 'previa' \| 'gravacao' }`, `tocar`, `pausar`, `irPara`. Na PRÉVIA a duração não é guardada: é lida do design a cada quadro, então desfazer/refazer, trim, ocultar e remover camada valem na hora; `t` é preso à duração nova. `duracaoDaPagina(layers, audio, duracoesCarregadas)` recebe a duração dos `<video>` montados, como `trechoDoVideo(metadata, duracaoDaFonte)` já recebe hoje — cobre a camada cuja `duration` ainda não foi gravada; o fallback de 10 s do export fica onde está. Prévia: volta a 0 no fim. Troca de página: para em 0. |
| `camadas-de-video.ts` | `passoDoVideo(relogio, { inicio, fim, trimStart, seguraNoFim })` generaliza `passoDoMotion` (que vira um caso; o teste dele passa sem mudar). Devolve também `aguardando` quando há seek pendente ou o vídeo não tem o quadro (`readyState < 2`). |
| `VideoNode` | Todo vídeo se reconcilia com o relógio. Saem: autoplay ao carregar, handlers de `ended`/`timeupdate`, `playbackRate`, e o play/pause/seek por `video-control`. `play()` rejeitado deixa de ser engolido: a prévia para e mostra o motivo. |
| Painel do vídeo | Play, seek e as pontas do trim comandam o relógio (`irPara`), não o elemento. Some o controle de velocidade. |
| Música | Um `<audio>` fora do DOM, reconciliado igual; volume e fades calculados do `t`. O que toca vem de `planoDeSom`. |
| Export (modo `gravacao`) | Trabalha sobre um RETRATO tirado no início — camadas, trilha e duração — e é esse mesmo retrato que vai para a fila (`designData`, `audioConfig`, `videoDuration`): o que foi gravado e o que o servidor mixa nunca divergem. Exclusivo: play/pause/seek recusados, sem loop; edição do design, desfazer/refazer ou troca de página durante a gravação CANCELAM o export com mensagem. O laço do export é o ÚNICO condutor, nesta ordem a cada quadro: tempo (desde o início do gravador) → clipe ativo → reconciliar todos os vídeos → desenhar o stage → copiar para o canvas gravado. No fim segura o último quadro até o gravador fechar. O `finally` devolve o relógio a 0 parado e o modo `previa`, com erro ou sem. Vídeo em `aguardando` por mais de 0,5 s durante a gravação derruba o export com mensagem (hoje sairia imagem congelada). |
| Miniaturas | Uma captura (PageSync e modo contínuo) só vale se foi tirada com o relógio parado em 0 **e** todos os vídeos já com o quadro de 0 decodificado e desenhado (o `posicionar` do export, extraído). Não dá para esperar isso na troca de página (`continuous-workspace.tsx:371` captura na hora): fora dessa condição não se captura. Toda captura guarda a versão do design e é descartada quando ele muda; sem captura válida, a prévia desenha as camadas no instante 0 com o pôster do vídeo (`PagePreviewStage`, que já existe). A miniatura pendente é tirada quando o relógio volta a parar em 0. |
| Botão ▶︎/⏸ | Na faixa da página ativa (contínuo), antes de duplicar, `h-6 w-6` ghost como os vizinhos. E no cabeçalho do editor ao lado de "Exportar Vídeo", que existe nos dois modos — foto com música no modo clássico não tem painel de vídeo para hospedar o botão. Só aparece quando `paginaEVideo`. |
| Atalho | Barra de espaço, sem campo de texto em foco e sem modal (mesma guarda do `keydown` do `EditorCanvas`). |

## Fase 3 — linha do tempo (pedidos 2 e 3)

| Ponto | Mudança |
|---|---|
| `src/lib/video/linha-do-tempo.ts` (novo, puro) | `linhaDoTempo(layers, audio)` → `{ clipes: [{ id, tipo, inicio, duracao, trimStart }], total, duracao, avisos }`; `camadasNoInstante(layers, t)`; `normalizarClipes(layers)`. Tolerante na leitura (a API aceita camadas arbitrárias, inclusive do conector): duração de foto presa a [0,5; 60] s, do 11º clipe em diante ignora e avisa, clipe fora do bloco é lido na ordem em que está. |
| Canvas | Camada com `clipe` só é visível e clicável no próprio intervalo. Os componentes assinam "qual clipe está ativo", não o `t`. Vídeo de clipe fora do intervalo fica montado, parado no início do trecho. |
| Faixa (`timeline.tsx`, novo) | Tira recolhível sob o canvas, acima da barra de páginas; abre sozinha quando `paginaEVideo`. ▶︎/⏸ + `0:03 / 0:12`; régua clicável; clipes com miniatura e largura proporcional; faixa da música (pontas = `startTime`/`endTime`, uma escrita só); área hachurada onde a regra de duração corta. Desligada durante a gravação. |
| Arrastar pontas | Pointer events, sem dependência nova. Vídeo: esquerda = `trimStart`, direita = `trimEnd`, dentro de `[0, duração do arquivo]`, mínimo 0,5 s, passo 0,1 s; o canvas mostra o quadro da ponta. Foto: as duas pontas mudam `clipe.duracao`. Estado local no arraste; grava ao soltar (um passo de desfazer). |
| Reordenar | `@dnd-kit` (já usado na barra de páginas) + `normalizarClipes`. |
| Adicionar | "+" abre a aba Imagens ou Vídeos em "modo linha do tempo": o item escolhido entra como clipe (página inteira, `cover`) no fim do bloco. Na primeira vez, o fundo que já existe (vídeo de base, ou a imagem mais baixa que cobre a página) vira o clipe 1 e a tela diz isso. "Tirar da linha do tempo" devolve a camada a sempre visível. Duplicar um clipe: sem o deslocamento de 16 px, logo depois do original, respeitando o teto. |
| Recomposição | Página com qualquer `clipe` conta como ajuste manual em `medirDefasagem`: nunca é recomposta pela spec (`recompor.ts:538` reescreve `Page.layers` inteiro e apagaria a sequência). |
| Render de servidor e prévias | Desenham `camadasNoInstante(layers, 0)` **depois** das travas (a de render olha a página inteira: vídeo em qualquer clipe barra). |
| Som | `planoDeSom`: sequência (2+ clipes, ou vídeo que não começa em 0) com `original`/`mix` toca e exporta só a música, com `audioAviso` e aviso na faixa — até a Fase 4. Prévia e export iguais. |
| Limites | 10 clipes; a fila recusa `videoDuration` acima de 180 s; aviso em 60 s (story) e 90 s (reel). |
| Celular | Só play/pause e a duração; arrastar pontas é do desktop. |

## Fase 4 — som original dos vídeos numa sequência

`AudioMixOptions.originais: [{ path, trimStart, inicio, duracao }]`, montado pela
fila com a mesma `linhaDoTempo`/`planoDeSom`. Um segmento por clipe de vídeo:
`atrim` + `adelay` + `amix`, fechado na duração. `ffprobe` antes: clipe sem
faixa de áudio fica de fora em vez de derrubar o mix. Um clipe só em 0 gera
exatamente o comando de hoje. A prévia passa a tocar o som do clipe ativo.

## Fora deste plano

- Entrada/saída de texto, logo e elementos (multi-faixa); transições;
  velocidade; movimento na foto.
- Foto + música montada no servidor (sem gravar no navegador; Safari/iPad; chat).
- Motion com início deslocado (segue entrando em 0 e segurando o último quadro).
- Música em mais de um trecho, ducking, narração.

## Riscos

- **Sincronia do relógio único**: é a parte que o Codex bloqueou quatro vezes
  no #182. Por isso o critério de aceite numérico e o plano B na decisão 6.
- **Corte entre clipes no export**: o `play()` do vídeo que entra leva ~0,07 s
  (medido no #182). Medir o instante de cada corte no harness antes de decidir
  por pré-rolagem.
- **Vários `<video>` montados**: daí o teto de 10 clipes. Medir quadro perdido
  com 3 vídeos + motion.
- **Gravação em tempo real**: aba visível o tempo todo; 60 s de vídeo = 60 s
  de espera. Já é assim.
- **Mudança de comportamento**: página com vídeo abre parada; página com música
  deixa de ter "Agendar" como imagem.

## Como será testado (por fase)

1. Vitest nos puros: `linhaDoTempo` em página legada devolve a mesma duração do
   helper de hoje (base, motion sobre foto, oculta, sem `duration` gravada);
   `passoDoVideo`; `normalizarClipes`; `planoDeSom`; `fonteEfetiva`.
2. `scripts/validar-video-no-editor/rodar.mjs` (Chrome real, sem login), lendo
   os marcadores de tempo dos vídeos sintéticos no WebM e no MP4: foto parada;
   pausa, `irPara` e desfazer no meio da prévia; sequência foto → vídeo → foto
   com o instante de cada corte; motion por cima; aba oculta aborta.
3. Fase 4: fixtures de ffmpeg (clipe em 0, deslocado, dois clipes, clipe sem
   áudio), conferindo duração e posição do som.
4. `typecheck`, `lint` e teste logado pelo Ciro do que fica fora do canvas (aba
   Músicas, fila real, agendamento do MP4).
5. Uma fase = um worktree = um PR; Codex no diff de cada uma.

## Revisão do Codex sobre o plano (02/10) — o que mudou

Veredito: BLOQUEADO, 14 achados. Todos conferidos nas linhas citadas e aceitos:

1. Página com música podia ser publicada como foto (o plano só trocava o chip do
   modo contínuo) → decisão 2 e a linha "Travas de publicação" da Fase 1.
2. A trava da Fase 3 não alcançava `story-renderer.ts:84` nem o `render-story`
   do MCP local → decisão 3 (dois predicados) e "depois das travas".
3. A recomposição reescreve `Page.layers` e apagaria a sequência → linha
   "Recomposição" da Fase 3.
4. "O z entre clipes não importa" era falso com camada permanente no meio →
   bloco contíguo no fundo + `normalizarClipes` (decisão 4).
5. Relógio de parede sem tratar seek pendente, buffering, `play()` rejeitado e
   aba oculta → `aguardando`, abortos e o critério de aceite (decisão 6, Fase 2).
6. Export não pode reusar o `tocar()` da prévia (loop, cauda de 200 ms, restauro
   só da base) → modo `gravacao` exclusivo com ordem por quadro e `finally`.
7. `-t` só existia com mix de áudio → `-t` sempre, e prova por decodificação.
8. Paridade com o legado mal especificada → decisão 5: o legado não passa por
   conceito novo, chama a conta de hoje; a duração carregada do elemento
   entra como argumento e o fallback de 10 s do export fica (2ª passada).
9. Miniaturas e capturas pegariam o quadro errado → captura só em 0 parado.
10. Duplicar página sem descarregar o autosave; duplicar clipe com deslocamento
    → Fase 1 e linha "Adicionar" da Fase 3.
11. Relógio não reagia a desfazer/refazer, trim e velocidade → duração derivada
    a cada quadro; controles passam pelo relógio; velocidade sai.
12. Foto com música sem botão de play no modo clássico → botão no cabeçalho.
13. Prévia e export com som diferente entre as Fases 3 e 4 → `planoDeSom` único.
14. "Fila: nada" era falso (`original` sem base sai mudo sem aviso; `mix` conclui
    sem aviso) → `fonteEfetiva`; leitura tolerante e teto na fila.

Segunda passada (conferência da v2): 10 dos 14 resolvidos; 4 em aberto, todos
conferidos e corrigidos na v3 — `later-scheduler.ts:279` é publicação (cria
post `PENDING`), não render; a gravação precisa de retrato único de página,
duração e som; a duração do elemento carregado tem de chegar ao relógio; e
relógio em 0 não garante quadro de 0 na miniatura.

Terceira passada (só os quatro pontos): **APTO**, sem correções adicionais.
