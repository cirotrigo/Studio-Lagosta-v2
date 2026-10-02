# Plano — vídeo no editor para a equipe, com motion por cima (02/10/2026)

## Por quê

A Roberta e a Bianca não usam o Resolve. O vídeo delas sai do editor do Studio:
"Exportar Vídeo" grava o canvas e a fila converte em MP4. Medido em produção
(02/10, 90 dias): 41 stories em vídeo saíram do editor, nenhum reel; duração
mediana de 12,6 s; 34 de 46 exports viraram post em 1,5 min (mediana).

O Ciro já produz **motions com fundo transparente** (texto animado, logo
animada) em ProRes 4444, por pipeline, para montar no Final Cut. O pedido: a
equipe poder pôr esses motions **por cima de um vídeo ou de uma foto**, no
editor, e postar — sem Resolve.

## O que já foi provado antes de planejar

- O Chrome desenha WebM VP9 com alfa de forma transparente, no `<video>` e no
  `drawImage` do canvas (que é o que o Konva usa). Teste com um motion real do
  TERO: 122.439 de 129.600 pixels transparentes, texto opaco.
- ProRes 4444 1080x1920 de 10 s (46 MB) vira WebM com alfa de 0,3 MB em 3 s
  (`libvpx-vp9`, `yuva420p`). O arquivo declara `alpha_mode=1`.
- A aba Vídeos já aceita `.webm` no upload e já navega as subpastas da pasta de
  vídeos do cliente no Drive, copiando o arquivo para o Blob ao clicar.
- O export copia o stage inteiro a cada quadro: o que estiver por cima do vídeo
  entra na gravação. O que falta é sincronia e regra de quem é "o vídeo".

## Decisões

1. **Formato**: WebM VP9 com alfa. `scripts/converter-motion.sh` converte os
   `.mov` e confere `alpha_mode=1`.
2. **Biblioteca de motions = subpasta "Motions" na pasta de Vídeos do cliente
   no Drive.** Sem tabela, sem rota nova, sem tela nova: é o caminho que a
   equipe já usa para vídeo (110 imports pelo Drive). Se o Drive incomodar,
   uma biblioteca dentro do Studio é a evolução.
3. **Dado**: `videoMetadata.overlay: true` na camada `type: 'video'`.
   `Page.layers` é JSON — sem migration.
4. **`.webm` inserido pela aba Vídeos entra como motion** (extensão é o único
   sinal de transparência sem decodificar). O painel do vídeo tem o interruptor
   "Motion (fundo transparente)" para ligar ou desligar à mão.
5. **Regras num módulo puro** (`src/lib/video/camadas-de-video.ts`), usado por
   navegador e servidor: `ehMotion`, `videoDeBase` (primeiro vídeo que não é
   motion), `videoPrincipal` (base, ou o motion quando só há foto).

## Fase 1 — motion por cima de foto e de vídeo

| Ponto | Mudança |
|---|---|
| Canvas (`VideoNode`) | Motion com vídeo de base: começa junto, toca uma vez, segura o último quadro, recomeça quando a base dá a volta (evento `video-base-restart`). Sem base (foto): obedece ao próprio loop (padrão: não repete). Placeholder de carregamento sem fundo, para não tapar a página. |
| Export (`konva-video-export.ts`) | Todos os vídeos da página são parados no início do próprio trecho e largam juntos com o principal. O principal é pausado durante o preparo. |
| Botão de export, aba Músicas | "O vídeo da página" = `videoPrincipal`: a base dita duração; só com motion, o motion dita. |
| Fila (`process-video-job.ts`) | Som original vem só do vídeo de BASE. Página só com motion: sem som original (hoje falharia no ffmpeg e reconverteria). |
| Prévia das outras páginas | Motion não desenha o retângulo escuro de espera (taparia a foto). |
| Painel do vídeo | Interruptor de Motion; esconde loop, velocidade, capa e "duração do export" quando não se aplicam. |

Comportamento resultante:
- **Vídeo + motion**: MP4 com a duração do vídeo (ou do trecho da música, se
  menor), motion tocando uma vez desde o início.
- **Foto + motion**: MP4 com a duração do motion; som = a música da página, ou mudo.

## Fase 2 — o caminho da equipe sem armadilhas

Achados confirmados no código na análise de 02/10, todos no fluxo que a equipe usa:

1. **"Agendar" some em página com vídeo**; "Gerar Criativo" avisa que sai
   imagem parada. Hoje publicam um JPEG do quadro, sem aviso (5 stories já
   foram ao ar assim). "Exportar Vídeo" passa a aparecer na tela cheia.
2. **Aba Músicas grava o início do trecho**: a onda avisa início e fim em duas
   chamadas seguidas e o painel regravava a trilha a partir do mesmo estado —
   a segunda desfazia a primeira; a música entrava sempre do 0:00.
3. **Duplicar página leva a trilha** (`Page.audio`).
4. **"Trocar" trilha no diálogo de export abre com a trilha salva** (o modal
   nascia do padrão e gravava "áudio do vídeo" por cima).
5. **Aviso da onda**: "vídeo terá silêncio no final" → "o vídeo será cortado"
   (é o que o export faz).
6. **Mix com clipe sem som**: hoje o MP4 sai mudo e cobrado. Passa a tentar só
   a música antes de desistir do áudio.
7. **Tirar o que engana**: controle de velocidade (0 de 61 páginas usam; o
   export sai errado), botão "Contain" (estica igual a "Fill"); "Capa do
   vídeo" vira "Prévia no editor" (não vai ao Instagram).
8. **Diálogo de export** avisa: manter a aba aberta e visível enquanto grava.

## Fase 3 — proteger o vídeo exportado (prazo: sábado 17/10, 23h)

A limpeza semanal trata vídeo com mais de 90 dias como arte sem backup: reenvia
o MP4 ao Drive como PNG e troca o endereço da arte e dos posts por um link que
responde 404 (12 vídeos já estão assim; um story falhou por isso em 12/09; 26
exports e 19 posts entram a partir de 17/10).

- A limpeza de 90 dias **pula Generation de vídeo** (`fieldValues.isVideo`).
- `scripts/reparar-videos-limpos.ts` (dry-run por padrão): devolve
  `resultUrl` para `fieldValues.videoUrl` quando o MP4 ainda responde, e
  reaponta os posts. **Rodar em produção só com o OK do Ciro.**

## Revisão do Codex sobre o plano (02/10) — o que mudou

Veredito: BLOQUEADO, 16 achados. O que foi aceito e virou desenho:

- **Sincronia**: saiu o evento "a base recomeçou". O motion não tem relógio
  próprio — a cada quadro ele se reconcilia com o vídeo PRINCIPAL
  (`passoDoMotion`, função pura): entra no tempo dele, para quando ele para,
  volta quando ele dá a volta, segura o último quadro no fim. Cobre ordem de
  carregamento, play/pause, autoplay desligado, corte e desfazer/refazer.
- **Vídeo oculto não participa**: não dita duração nem som (`videosDaPagina`).
- **Export**: recusa gravar se algum vídeo visível ainda não carregou ou não
  responde (antes seguiria sem o motion); todos os vídeos largam no mesmo
  ponto; o gravador começa junto com a reprodução (saíram os 200 ms de espera
  e o seek com o vídeo tocando); a duração gravada é a mesma enviada à fila; o
  diálogo não fecha durante a gravação.
- **Loop**: um mecanismo só (manual, volta ao início do trecho); o comando do
  painel não liga mais o loop nativo do elemento.
- **Prévia das outras páginas**: página com vídeo usa a captura feita quando
  estava aberta; o motion pode ter um quadro de prévia em PNG transparente.
- **`.webm` ⇒ motion é sugestão**, dita na tela ao inserir, com o interruptor
  no painel.
- **Limpeza**: as três passagens de Generation pulam vídeo, com o filtro em
  código (filtro Json do Prisma descarta a linha sem o campo).
- **Som**: falha no som original tenta só a música; áudio diferente do pedido
  fica registrado na arte e aparece no card.
- **Trecho da música**: início e fim numa chamada só, com o callback atual, e
  comparado com a duração do vídeo já cortado.
- **Agendar imagem parada**: a trava de página com vídeo vai para o servidor
  (cobre o controle por página do modo contínuo e o conector); a geração em
  lote avisa por página.

Não aceito, com o motivo: classificar motion só pela pasta do Drive em vez da
extensão — nesta casa `.webm` nunca é vídeo de câmera, e errar para o outro
lado (motion tratado como vídeo comum) quebra a sincronia sem aviso.

## Fora desta entrega

- Tool "entregar vídeo" para o MP4 pronto do Resolve (fluxo do Ciro).
- Capa de reel, collab e primeiro comentário (depende do que o Zernio aceita).
- Duração livre para foto + motion; foto + música sem nenhum vídeo.
- Nome do export ("Sem título") e miniatura de vídeo na grade da agenda.
- Linha do tempo, entrada/saída por camada, prévia sincronizada com a música.

## Riscos

- **Desempenho**: dois vídeos decodificando (VP9 alfa é por software) mais a
  cópia do stage por quadro, em gravação de tempo real. Quadro perdido vira
  engasgo no MP4. Medir no teste local.
- **Safari** não toca VP9 com alfa (fundo preto). O export já exige Chrome.
- **`.webm` opaco** entra como motion: o interruptor resolve.
- **Motion 9:16 em página de feed** é cortado pelo "cover": motion de feed
  precisa ser renderizado no tamanho do feed.

## Como será testado

1. Vitest no módulo puro.
2. Chrome real, sem login: página com Konva + foto + motion e vídeo + motion,
   conferindo transparência e que o motion larga junto no export.
3. Servidor local: inserir motion (upload e Drive), exportar, abrir o MP4 em
   Criativos, agendar como rascunho.
4. `typecheck` e `lint`.
5. Revisão do Codex no plano (antes) e no diff (depois).
