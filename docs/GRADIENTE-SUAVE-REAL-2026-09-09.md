# Gradiente suave reutilizável — integração e entrega

## Preferência aprovada

Em 09/09/2026, Ciro rejeitou as duas primeiras opções Real por difusão marcada, pediu mais difusão e uma alternativa com gradiente e aprovou o segundo ensaio: **“o gradiente ficou melhor”**. Depois autorizou integrar a opção reutilizável, testar outras fotos e preparar implantação. Esta aprovação se refere ao [preview Real aprovado](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/real-difusao/gradiente.png), não a toda foto ou marca. O registro fica neste documento de projeto, sem alteração de memória global, DNA ou assinatura em produção.

**Entregue:** preset explícito compartilhado por editor e compositor, reproduzindo o PNG aprovado byte a byte. Default permanece assinatura. Novas fotos foram testadas localmente, incluindo recusas. Entrega preparada para revisão do coordenador; merge/deploy não executados.

## Uso real no editor e MCP

Editor → painel **Gradientes** → **Gradiente suave no topo** → **Aplicar gradiente suave**. O botão substitui fundos dos textos visíveis/desbloqueados cujo centro está nos primeiros 45% da altura. Mantém textos, fontes, posições e tratamentos do rodapé. Cria uma layer normal `gradient`, seleciona-a e abre os controles existentes de gradiente. O gesto passa por `TemplateEditorContext`/`applyDesign`: dirty, histórico e salvar/exportar seguem o caminho normal. Uma operação de undo restaura o halo; redo restaura o gradiente. Reaplicar redefine esse preset, sem duplicá-lo. Outros gradientes não são removidos.

A layer é independente do texto: ao mover textos ou alterar o recorte, conferir novamente a leitura. Não é um halo que acompanha automaticamente as letras. Se não houver texto elegível no topo, o botão fica desabilitado. Uma layer do preset bloqueada é preservada. Para remover o tratamento depois de salvar, use a camada editável e os controles de halo, ou restaure uma revisão da página; apagar o gradiente sozinho não restaura os fundos removidos.

Em `compor-arte` e em cada item de `compor-leva`, usar:

```json
{
  "projectId": 1,
  "formato": "story",
  "fotoDriveId": "ID_DA_FOTO_ESCOLHIDA",
  "preferencias": {
    "variante": "cmtm64ckl000bl2044uij1amu",
    "tratamentoDeTexto": "gradiente-suave-topo"
  },
  "blocos": [
    {"papel": "headline", "linhas": ["Sua pausa com", "sabores Real"]},
    {"papel": "apoio", "linhas": ["Praia do Canto e Shopping Vitória"]}
  ]
}
```

O nome exato da ferramenta no catálogo é `compor-arte`. Na função interna `comporPeca`, usar `foto: {driveFileId: ...}`. Ausência do tratamento, ou `tratamentoDeTexto: "assinatura"`, mantém o comportamento anterior. Foto/variante/alinhamento/crop explícitos não são substituídos pelo preset. Ele não escolhe uma variante de texto claro por conta própria: escolher assinatura compatível e conferir a régua. Texto escuro sobre gradiente escuro pode ficar ilegível.

O tratamento é preservado na spec durável da fila, nos dados de persistência e no diagnóstico MCP. É independente de `selecaoExperimental`: não requer busca de combinações. Se ambos forem usados, as avaliações respeitam a preferência de tratamento e os bloqueios existentes. O fluxo semanal não ganha um default por cliente; para compor com esse tratamento, enviar a preferência na spec/MCP. Não foi adicionado campo ao banco nem configuração global de cliente.

A chamada MCP `provar: true` faz upload de prova no Blob em produção. Não foi usada nestes testes: o harness bloqueia persistência/uso de foto e gera PNG local com o renderer real.

## Parâmetros e implementação

`src/lib/creatives/gradiente-suave.ts` concentra o preset puro, sem dependências de servidor. No canvas 1080×1920: layer (0,0), 1080×1200; altura proporcional de 62,5% para outros formatos. Gradiente preto linear vertical, eixo relativo (0,0)→(0,1), stops posição/opacidade: `0/.58`, `.15/.54`, `.32/.41`, `.55/.20`, `.8/.04`, `1/0`. A reprodução visual foi validada em story; a escala proporcional em outro tamanho tem teste geométrico, não aprovação visual.

O compositor aplica o preset depois do autofix geométrico e antes da régua. Não altera glifos ou caixas para conseguir contraste. A régua remove a layer marcada do raster sem tratamento, portanto a métrica tonal também inclui o gradiente; anteriormente o experimento local usava uma layer não marcada e o valor “sem halo” ainda continha o gradiente. Logo e rodapé continuam fora dessa remoção. A regra padrão da régua segue avisando; a seleção experimental continua recusando combinações inválidas. Não transformar preview com aviso em arte aprovada.

A biblioteca usa os tipos `gradient`, stops e eixos já suportados pelo Konva/editor e `CanvasRenderer`/`RenderEngine`. Não há dependência, migração ou novo serviço. O fluxo de persistência recebe a layer normal e a spec; teste conferiu esse contrato sem gravar em produção.

## Teste em fotos diversas

[Galeria de todos os pares, com recusas identificadas](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/diversidade/galeria.html) · [Métricas e hashes](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/docs/piloto-compositor-2026-09-09/metricas-gradiente-integrado.json).

Leitura autorizada de catálogo/knowledge via conector e Drive. As fotos novas foram baixadas por leitura, orientadas por EXIF e reduzidas para caber em 1920px, JPEG95, idênticas entre as condições de cada par. Fontes, logos, assinatura e copy vieram do fixture congelado. Não houve reanálise paga, criação de catálogo, registro de uso ou alteração de produção. Mantive os textos factuais originais; consultei a base para verificar horários/localidade, sem inventar preço ou campanha.

Nove fotos novas: três Real, quatro Quintal, duas TERO. Cada uma foi renderizada com assinatura e com gradiente. Com a reprodução do aprovado são **19 renders finais**; a primeira rodada de oito fotos também está registrada nos logs. A foto adicional de parrilla foi renderizada separadamente, sem repetir as demais. Cada render verificou copy literal por papel. Todos os outputs incluem `.png.design.json` editável com os ativos locais do fixture.

| Caso | Régua assinatura → gradiente | Inspeção e destino |
|---|---|---|
| Real café | passa → passa | Topo escuro já comporta texto. Gradiente uniforme, ganho pequeno; candidato de revisão. |
| Real gelato/panini | passa → passa | Gradiente escurece a parte superior do gelato. Não recomendá-lo automaticamente por passar na régua. |
| Real atendimento | passa → passa | Transição mais distribuída; luminária compete com título e apoio continua fino. Candidato de revisão. |
| Quintal ambiente | falha serviço → falha serviço | Foto clara e movimentada. Recusada, mesmo sem Brahma. |
| Quintal servindo | passa → passa | Recusada visualmente: display de bebida de terceiro na borda inferior. Catálogo não sinalizou; revisão visual prevalece. |
| Quintal cabotiá | falha serviço → falha serviço | Mesa clara prejudica o serviço; gradiente de topo não corrige rodapé. Recusada. |
| Quintal parrilla | passa → passa | Alternativa sem marca problemática visível, serviço legível. Assinatura já atende; carro desfocado no fundo é ressalva estética. |
| TERO brasa | passa → passa | Alternativa com fundo escuro e headline separada do produto. Preferir manter assinatura; gradiente dispensável. |
| TERO pratos | falha headline → falha headline | O fundo não sustenta o âmbar; gradiente não resolveu. Recusada. |

A foto antiga do Quintal com Brahma continua rejeitada; não foi apagada ou reclassificada. A troca de foto só ocorreu nos testes autorizados. Não houve promoção automática de todas as fotos neutras no catálogo: a inspeção encontrou um falso negativo real.

Previews principais: [Real café, comparação](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/diversidade/cafe-comparacao.png), [TERO brasa integral](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/diversidade/3-brasa-assinatura.png), [Quintal parrilla integral](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/diversidade/2-parrilla-assinatura.png). Pares inspecionados a 360px; propostas principais também em 1080×1920. Copy pequena de apoio e subtítulos de logos continuam sendo limites de leitura em celular, não resolvidos por este preset.

## Tempos e verificação

Uma amostra por foto/tratamento, sem benchmark de produção. Intervalos locais de montagem, régua e PNG: Real assinatura 1,074–1,206s, gradiente 1,018–1,133s; Quintal assinatura 0,955–1,244s, gradiente 0,936–1,169s; TERO assinatura 1,182–1,188s, gradiente 1,194–1,223s. Downloads e consultas não entram. As diferenças pequenas e amostra reduzida não demonstram aceleração. Este preset evita a busca de quatro variantes, mas não se compara diretamente com o tempo de fila/produção.

428 testes de regressão passaram (427 na rodada abrangente, mais um teste focal de persistência posteriormente). Typecheck e lint passaram, com avisos preexistentes. O teste de render prova igualdade exata do PNG aprovado e copy dos novos pares. O teste Chromium monta **painel e Context reais**, substitui somente a leitura de cores por fixture, não usa autenticação nem API: aplicar, dirty, undo, redo, edição de opacidade, reaplicação sem duplicar e zero erros de página passaram. Ele não é uma validação autenticada do aplicativo publicado, nem teste de gravação real de página.

Reprodução: `scripts/piloto-compositor/diversidade.test.ts` com a configuração Vitest do piloto; `node scripts/piloto-compositor/editor-gradiente-smoke.mjs`; `node scripts/piloto-compositor/galeria-diversidade.mjs`. `PILOTO_FOTO=parrilla` limita o render a esse caso e conserva os outros resultados. A coleta depende de credenciais de leitura autorizadas, não versionadas. PNGs, fontes, catálogos, bundles e fixtures ficam ignorados em `.tmp-medicao-compositor`.

PostgreSQL não foi repetido: não houve alteração de schema, enfileiramento transacional ou callback. Os cinco cenários reais anteriores e suas limitações permanecem no relatório do piloto. Não houve build com geração Prisma, install, alteração do checkout compartilhado, publicação/agendamento ou imagem IA.

## Integração, implantação e rollback preparados

`git fetch origin main` confirmou `origin/main = 7dfbde33d74be7424202e3170fc61997d3c8a02d`, ancestral deste branch. Não há commits divergentes remotos neste snapshot; o `main` local está mais antigo e não deve ser usado como base de comparação. Nenhum merge foi executado. Antes de integrar, atualizar a referência novamente e conferir eventuais mudanças concorrentes em compositor, régua, Context, painel Gradientes e catálogo MCP.

O branch já contém os commits anteriores `e9cdfe6a` (seleção), `6892e362` (fila transacional), `0b94bd34` (ponte semanal/CAS), `073a612a` (piloto/PG) e `7b667715` (opt-in conservador). O diff integrado inclui essas mudanças além do novo preset. Revisar a faixa completa `origin/main..HEAD`; para levar só o preset, extrair um patch específico após revisar as dependências de diagnóstico/regressão, sem cherry-pick cego sobre base antiga.

Plano concreto, ainda não executado:

1. Coordenador revisa diff completo e resultados, atualiza origin/main e resolve eventuais conflitos em checkout isolado. Nenhuma migração ou nova variável de ambiente é necessária.
2. Criar PR/build de preview no ambiente de implantação existente. Executar typecheck/lint da revisão integrada; validar editor autenticado em uma cópia descartável de página Real: aplicar, editar stops, desfazer/refazer, salvar, recarregar e exportar. Conferir layer editável e PNG em 360px. A escrita dessa etapa deve ser em cópia de teste autorizada, não na assinatura.
3. Exercitar MCP com foto/variante explícitas e preferência de tratamento, em preview controlado. Conferir diagnóstico e camada persistida; sem agendamento. Confirmar que chamadas sem a preferência continuam baseline e candidatas não acionam seleção.
4. Após revisão do coordenador, implantar a revisão aprovada pelo fluxo normal. Observar erros do compositor/export e checar uma página Real autenticada no ambiente alvo. Manter o preset opt-in, sem ativação ampla por cliente. Não promover TERO/Quintal por aprovação da Real.

Rollback: reverter o commit do preset e redeploy da revisão anterior aprovada, mantendo o opt-in conservador e a fila já revisados; ou selecionar `tratamentoDeTexto: "assinatura"` nas novas chamadas. Layers `gradient` já salvas continuam compatíveis com o renderer anterior, pois o tipo já existia. Rollback de código não restaura automaticamente o halo de páginas editadas: usar undo antes de salvar ou revisão/cópia da página, sem restauração em massa. Não reverter migração de banco, pois não há uma nesta entrega.
