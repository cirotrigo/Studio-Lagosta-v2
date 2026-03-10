# Especificacao Final (100%): Modulo de Automacao de Artes no Electron

Data: 2026-03-09  
Status: Em implementacao (Fase 1 concluida em 2026-03-09, Fase 2 parcial)  
Escopo: fluxo completo de geracao, revisao WYSIWYG, render HTML/CSS e persistencia de historico no desktop app

## 0. Objetivo

Implementar um modulo de automacao de artes para Instagram no Electron com:

1. geracao de copy e variacoes por LLM;
2. preview HTML/DOM editavel em tempo real;
3. render final de imagens em lote via janela offscreen/headless;
4. fidelidade ao `lagostacriativa.com.br/design-system-instagram.html` (R1-R6 e templates S1-S6/F1-F3);
5. salvamento e recuperacao no Historico.

## 1. Requisitos funcionais obrigatorios

## 1.1 Inputs da UI (Aba Gerar Arte)

### Formato

Opcoes:

1. `STORY` — `1080x1920` (9:16) **(PADRAO selecionado)**
2. `FEED_PORTRAIT` — `1080x1350` (4:5)
3. `SQUARE` — `1080x1080` (1:1)

### Foto base

Origens permitidas:

1. Drive
2. Geradas com IA
3. Upload direto

Regra:

1. obrigatoria quando `Usar foto = true`.

### Prompt base

1. textarea livre para texto promocional/descritivo.

### Toggles

1. `Incluir logo`
2. `Usar foto`
3. `Composicao com IA`

### Painel avancado (quando Composicao com IA = true)

1. prompt de composicao;
2. upload de ate **5** imagens de referencia (**limite de produto**, mesmo que o modelo suporte mais);
3. variacoes simultaneas: `1`, `2` ou `4`.

### Fila de geracao (obrigatorio)

1. o formulario **nao pode travar** apos clicar em `Gerar Artes`;
2. cada envio vira um `job` em fila (`pending`);
3. processamento deve ser sequencial (1 job por vez) para estabilidade;
4. social media pode enfileirar quantos jobs quiser (sem limite funcional no fluxo);
5. jobs em `pending` exibem posicao na fila; job ativo em `generating` exibe progresso;
6. falha de um job nao interrompe os proximos da fila.

## 1.2 Motor de geracao visual (obrigatorio)

A camada de geracao visual deve usar:

1. **Primario:** `Nano Banana 2` (Google, associado a `Gemini 3.1 Flash Image`)
2. **Fallback:** versao anterior da mesma linha (default operacional: `Nano Banana Pro` / `Gemini 2.5 Flash Image`)

Configuracao obrigatoria por env/config (nao hardcoded em logica de negocio):

1. `GEMINI_IMAGE_PRIMARY_MODEL` (default: `gemini-3.1-flash-image-preview`)
2. `GEMINI_IMAGE_FALLBACK_MODEL` (default: `gemini-2.5-flash-image`)

Politica:

1. falhou no primario -> tenta fallback automaticamente;
2. ambos falharam -> erro estruturado ao usuario com status da etapa.

## 1.3 Processamento LLM de copy (obrigatorio)

Ao clicar em `Visualizar Artes`:

1. enviar prompt base + contexto de marca + regras DS para LLM;
2. exigir JSON estrito como resposta;
3. para `variations=4`, retornar 4 objetos distintos.

Schema canonico de saida:

```json
{
  "variacoes": [
    {
      "pre_title": "TODO SABADO",
      "title": "RODIZIO<br>DE MASSAS",
      "description": "Uma experiencia autentica, das 12h as 22h.",
      "cta": "RESERVE SUA MESA",
      "badge": "Apenas R$49,90",
      "footer_info_1": "Centro - Vitoria/ES",
      "footer_info_2": "(27) 9999-9999"
    }
  ]
}
```

Regras obrigatorias do system prompt:

1. aplicar R4 (hierarquia tipografica);
2. usar `<br>` literal em titulos quando necessario;
3. distribuir copy entre pre-title, title, description, cta, badge e footer.

## 1.4 Preview e aprovacao (obrigatorio)

Fluxo:

1. cruzar JSON da LLM com template DS;
2. renderizar **somente HTML/DOM** no preview;
3. habilitar edicao em tempo real:
   - campos no DOM com `contenteditable`;
   - popover lateral no hover com formulario textual;
   - two-way data binding sincrono (input <-> DOM);
4. somente apos revisao, usuario clica `Gerar`/`Aprovar` para render final.

Detalhamento obrigatorio de aprovacao:

1. cada variacao inicia em status `Em revisao`;
2. usuario pode editar qualquer campo textual da variacao em tempo real e ver imediatamente o resultado;
3. usuario pode aprovar individualmente (`Aprovar variacao`) ou aprovar todas (`Aprovar todas`);
4. variacoes nao aprovadas nao entram no batch de render final;
5. ao alterar texto apos aprovada, a variacao volta para `Em revisao` ate nova aprovacao.

## 1.5 Render final em lote (obrigatorio)

1. renderer envia HTML final aprovado para main process via IPC;
2. main process renderiza em janela(s) offscreen (`show:false`);
3. capturar cada variacao com `capturePage()` ou estrategia equivalente de DOM-to-image;
4. retornar buffers das imagens finais;
5. exibir no painel principal (grid 2x2 quando variacoes=4) **sem corte**.

Regra de visualizacao sem corte (obrigatoria):

1. cada card do grid deve manter o aspect ratio real do arquivo final;
2. proibido `object-fit: cover` no preview das variacoes aprovadas;
3. usar `object-fit: contain` + fundo neutro quando necessario;
4. dimensoes base por formato:
   - `STORY`: `1080x1920` (9:16)
   - `FEED_PORTRAIT`: `1080x1350` (4:5)
   - `SQUARE`: `1080x1080` (1:1)

## 1.6 Historico persistente (obrigatorio)

Apos aprovacao/render:

1. salvar metadados + caminhos/urls das imagens;
2. inserir automaticamente na aba Historico;
3. manter recuperacao posterior (abrir, baixar/exportar).

Persistencia aceita:

1. DB existente da aplicacao, ou
2. storage local controlado (`app.getPath('userData')`) com indice catalogado.

Regra de sincronizacao web:

1. toda arte aprovada deve ser enviada para Vercel Blob (URL publica);
2. apos upload, criar registro no backend (`AIGeneratedImage`) para aparecer no web e na aba `Geradas com IA`.

## 1.7 Reedicao (obrigatorio)

1. cada item no Historico deve ter acao `Reeditar`;
2. ao reeditar, o app abre a aba `Gerar Arte` com dados pre-preenchidos:
   - prompt anterior
   - formato anterior
   - imagem base anterior (quando existir);
3. o usuario pode alterar texto e gerar nova versao sem sobrescrever a anterior;
4. a nova versao volta para o Historico como novo item.

## 2. Regras de Design System (hard enforcement)

Fonte canonica:

`lagostacriativa.com.br/design-system-instagram.html`

Regras obrigatorias:

1. **R1 (70/30):** area de texto + elementos <= 30%.
2. **R2 (Overlay):** gradientes direcionais oficiais (`.ig-overlay-*`, opacidades do guide).
3. **R3 (Safe Zones):**
   - Story: `top 15%`, `bottom 18%`, `sides 8%`
   - Feed/Square: `5%` em todos os lados
4. **R4 (Tipografia):** hierarquia pre/title/desc/cta com classes `.ig-typography-*`.
5. **R5 (Logo):** limites de escala e posicao (`.ig-logo` / `.ig-logo-feed`).
6. **R6 (Consistencia):** manter ritmo visual por serie/campanha.

## 3. Arquitetura de comunicacao (IPC)

## 3.1 Etapa A - Geracao de copy + preview DOM

1. Renderer -> Main: `ipcRenderer.invoke('generate-ai-text', payload)`
2. Main -> provedores IA (copy + imagem base, quando aplicavel)
3. Main -> Renderer: JSON canonico das variacoes
4. Renderer: binding no template HTML e exibicao do preview editavel

## 3.2 Etapa B - Aprovacao + render headless

1. Renderer -> Main: `ipcRenderer.send('render-image-batch', htmlFrames, renderConfigs)`
2. Main -> Worker offscreen: `draw-frames`
3. Worker -> Main: `frames-rendered` com buffers
4. Main: salva imagens + indexa historico
5. Main -> Renderer: `generation-complete`

## 4. Estrategia de templates HTML/CSS

## 4.1 Registry canonico

Criar modulo:

`desktop-app/src/lib/instagram-ds/template-registry.ts`

Conteudo:

1. templates S1-S6 e F1-F3 em DOM declarativo;
2. campos dinamicos por template (`pre_title`, `title`, `description`, `cta`, etc.);
3. regra de logo por formato/template.

## 4.2 CSS canonico embutido

Criar:

`desktop-app/src/lib/instagram-ds/design-system-css.ts`

Conteudo:

1. classes `.ig-*` necessarias para preview e export;
2. css variables para tokens de marca;
3. safe zones e overlays oficiais.

## 4.3 Slot mapping

Criar:

`desktop-app/src/lib/instagram-ds/slot-mapper.ts`

Responsabilidade:

1. mapear JSON da LLM para placeholders dos templates DS;
2. tratar variacoes com ou sem `badge/footer`;
3. anti-overflow por regra de prioridade.

## 5. Anti-quebra e responsividade de texto

Protecoes obrigatorias:

1. `line-clamp`/ellipsis quando necessario;
2. down-scaling progressivo para titulos e descricoes;
3. nunca permitir texto escapar da `.ig-safe-zone`;
4. em overflow extremo:
   - modo estrito: erro e exige ajuste;
   - modo nao estrito: truncar campos de menor prioridade.

## 6. Criterios de aceite (Done)

1. Loader visual aparece em todas as etapas async (LLM, preview inicial, render batch).
2. Variacoes `1/2/4` renderizam corretamente; para 4, exibir grid 2x2 no painel sem corte e mantendo aspect ratio do formato gerado.
3. Edicao WYSIWYG funciona em tempo real (popover/input <-> DOM) antes da aprovacao.
4. Fluxo de aprovacao por variacao e aprovacao em lote funciona como especificado.
5. Render HTML-to-image preserva gradientes, blur e efeitos do template.
6. Salvar no Historico ocorre automaticamente apos `Aprovar`.
7. Modelo de imagem usa obrigatoriamente Nano Banana 2 com fallback para versao anterior.
8. Composicao IA aceita ate 5 referencias.
9. Formato padrao inicial da tela e Story (1080x1920).
10. Formato Square exporta em 1080x1080.
11. Botao `Reeditar` do Historico abre o fluxo de geracao com dados pre-carregados.
12. Formulario permanece utilizavel durante geracao; novos jobs entram na fila sem bloquear a UI.
13. Fila processa automaticamente jobs `pending` em ordem de chegada.

## 7. Plano de implementacao

## Fase 1 - Infra e contratos

1. [x] padronizar payload de geracao (`generate-ai-text`) com schema `variacoes[]`;
2. [x] configurar modelos IA via env e fallback automatico;
3. [x] subir limite de referencias para 5 (UI + validacao backend).

## Fase 2 - Preview editavel

1. registry HTML S1-S6/F1-F3;
2. renderer de preview com bind bidirecional;
3. popover lateral de edicao por variacao.

## Fase 3 - Render final headless batch

1. `render-image-batch` no main process;
2. worker offscreen com captura em paralelo controlado;
3. retorno de buffers e exibicao imediata na aba Gerar.

## Fase 4 - Historico e export

1. persistencia dos resultados aprovados;
2. indexacao e filtros na aba Historico;
3. download/export sem perder metadados.

## 8. Observabilidade e erros

Eventos minimos por job:

1. `job_started`
2. `copy_generated`
3. `preview_ready`
4. `render_started`
5. `render_variation_done`
6. `history_saved`
7. `job_completed`
8. `job_failed`

Campos recomendados:

1. `jobId`, `projectId`, `format`, `variations`, `templateId`, `modelPrimary`, `modelFallback`, `fallbackUsed`, `durationMs`, `errorStage`.

## 9. Compatibilidade com implementacao atual

1. pipeline canvas 4-pass pode permanecer temporariamente como fallback tecnico;
2. renderer HTML/CSS e a rota principal para templates DS;
3. remover fallback canvas apenas apos estabilidade comprovada.

## 10. Referencias externas (modelo IA)

Validar periodicamente as IDs de modelo com documentacao oficial do Google.

Referencias usadas nesta decisao:

1. https://blog.google/intl/pt-br/nano-banana-2/
2. https://deepmind.google/models/model-cards/gemini-3-1-flash-image/
3. https://deepmind.google/en/models/gemini/image/

## 11. Conclusao da Fase 1 (2026-03-09)

Entregas implementadas:

1. Contrato IPC `generate-ai-text` implementado e validado ponta a ponta:
   - backend web: `src/app/api/tools/generate-ai-text/route.ts`
   - electron main handler: `desktop-app/electron/main.ts` (`ipcMain.handle('generate-ai-text', ...)`)
   - preload bridge: `desktop-app/electron/preload.ts` (`generateAIText(payload)`)
2. Resposta canonica em JSON com schema `variacoes[]` aplicada com normalizacao defensiva:
   - chaves: `pre_title`, `title`, `description`, `cta`, `badge`, `footer_info_1`, `footer_info_2`
   - garantia de quantidade exata conforme `variations` (1/2/4)
3. Modelos de imagem por env + fallback automatico confirmados na rota de geracao:
   - `src/app/api/tools/generate-art/route.ts`
   - `GEMINI_IMAGE_PRIMARY_MODEL` default `gemini-3.1-flash-image-preview` (Nano Banana 2)
   - `GEMINI_IMAGE_FALLBACK_MODEL` default `gemini-2.5-flash-image` (versao anterior / fallback)
4. Limite de referencias em 5 confirmado no fluxo atual:
   - UI: `desktop-app/src/components/project/generate/CompositionEditor.tsx`
   - backend: `src/app/api/tools/generate-art/route.ts` (`compositionReferenceUrls.max(5)`)
   - IPC payload sanitiza e aplica teto de 5 referencias no main process.

Validacao tecnica executada:

1. `npm --prefix desktop-app run typecheck` -> OK
2. `npm --prefix desktop-app run typecheck:electron` -> OK

Observacao:

1. `npm run typecheck` no monorepo raiz continua falhando por erros legados fora do escopo desta fase (principalmente resolucao de paths do `desktop-app` dentro do tsconfig raiz). Nao bloqueia a entrega da Fase 1.

## 12. Prompt para proxima conversa

Arquivo pronto para continuidade da implementacao:

1. `.qoder/specs/prompt-continuacao-modulo-automacao-artes.md`

## 13. Progresso adicional (2026-03-09)

Implementado passo adicional solicitado: **templates como guia explicito para o modelo de copy**.

1. Pipeline de template path agora injeta guia de slots/prioridade/densidade no `generate_copy`:
   - `src/app/api/tools/generate-art/route.ts`
   - `src/lib/text-processing.ts`
2. Endpoint de copy estruturada (`generate-ai-text`) agora aceita `templateIds` e injeta contexto dos templates selecionados:
   - `src/app/api/tools/generate-ai-text/route.ts`
3. Contrato IPC/preload atualizado para transportar `templateIds` no payload:
   - `desktop-app/electron/main.ts`
   - `desktop-app/electron/preload.ts`
   - `desktop-app/src/features/art-automation/ipc-contracts.ts`
4. UI da selecao de template exibe aviso de comportamento para o usuario:
   - `desktop-app/src/components/project/generate/TemplateSelector.tsx`

## 14. Fase 2 parcial (2026-03-09)

Implementado primeiro bloco da Fase 2: **preview HTML/DOM com design system e edicao em tempo real**.

1. Biblioteca DS criada (baseada no `design-system-instagram.html`):
   - `desktop-app/src/lib/instagram-ds/design-system-css.ts`
   - `desktop-app/src/lib/instagram-ds/template-registry.ts`
   - `desktop-app/src/lib/instagram-ds/slot-mapper.ts`
2. Componente de preview HTML com templates S1-S6/F1-F3 e campos `contenteditable`:
   - `desktop-app/src/components/project/generate/InstagramHtmlPreview.tsx`
3. Integracao no fluxo de revisao:
   - cards de variacao template exibem preview HTML (nao apenas imagem)
   - editor WYSIWYG de variacao template passa a editar o proprio DOM do template
   - arquivo: `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
4. Fluxo legado (imagem/canvas) preservado como fallback para variacoes nao-template.

## 15. Importacao de Design System (2026-03-09)

Implementado canal dedicado para envio do DS diretamente na aba Identidade.

1. Nova secao UI: `Importar Design System` (separada de `Estilo Visual`):
   - `desktop-app/src/components/project/identity/DesignSystemImportSection.tsx`
   - integrada em `desktop-app/src/components/project/tabs/IdentityTab.tsx`
2. Suporte de upload para DS no backend:
   - `src/app/api/upload/route.ts`
   - aceita `HTML` (`.html/.htm`) e `ZIP` (`.zip`)
   - armazenamento em pasta `design-systems` no Blob
3. API de persistencia por projeto para registrar DS importado:
   - `src/app/api/projects/[projectId]/design-system/route.ts`
   - operacoes `GET`, `PATCH`, `DELETE`
4. Hook de frontend para consulta e salvamento:
   - `desktop-app/src/hooks/use-design-system.ts`

Recomendacao operacional:

1. Preferir `ZIP` com `HTML + assets` para fidelidade visual total.
2. `HTML` isolado permanece valido para testes rapidos.

## 16. Fase 2 - Integracao de copy estruturada no preview (2026-03-09)

Implementado o passo seguinte para reduzir divergencia entre copy e template no gate de aprovacao.

1. Fluxo de review agora chama `generate-ai-text` quando ha templates selecionados:
   - `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
   - payload inclui `projectId`, `format`, `variations`, `templateIds`, contexto de foto/logo/composicao.
2. O retorno `variacoes[]` e aplicado aos `fields` de cada variacao em revisao antes da aprovacao:
   - mapeamento semantico por chave de slot (`title`, `cta`, `badge`, `footer`, etc.)
   - fallback automatico para slots originais se algum campo critico vier vazio.
3. Se `generate-ai-text` falhar, o job continua com fallback do pipeline atual (sem bloquear fila):
   - usuario recebe aviso contextual
   - status do job segue `generating -> review`.

## 17. Fase 2 - Tokens visuais automaticos no preview (2026-03-09)

Implementado o acoplamento da Identidade + DS importado ao renderer HTML de revisao.

1. Preview HTML agora recebe tokens dinamicos de cor/fonte:
   - `desktop-app/src/components/project/generate/InstagramHtmlPreview.tsx`
   - variaveis CSS aplicadas via props (`primaryColor`, `textColor`, `bgColor`, `fontHeading`, `fontBody`).
2. Fonte dos tokens no `GenerateArtTab`:
   - base: `brand-assets` (cores/fonte configuradas na aba Identidade)
   - override opcional: DS importado em HTML (`designSystemImport.sourceType = html`) com parser de `BRAND_*`.
3. Parser de tokens do DS criado:
   - `desktop-app/src/lib/instagram-ds/token-parser.ts`
   - extrai `BRAND_PRIMARY`, `BRAND_SECONDARY`, `BRAND_TEXT_COLOR`, `BRAND_BG_COLOR`, `BRAND_FONT_HEADING`, `BRAND_FONT_BODY`.
4. Comportamento de fallback:
   - se nao houver DS importado, ou se o arquivo nao for acessivel, preview continua com tokens da Identidade.
   - para DS em `ZIP`, o app tenta localizar `index.html`/arquivos `.html` internos e extrair os mesmos `BRAND_*`.
   - se o ZIP nao tiver tokens parseaveis, mantem fallback para tokens da Identidade.
5. Visibilidade operacional no fluxo de geracao:
   - `TemplateSelector` exibe lista de `templates detectados no DS importado` por formato (referencia visual do pacote importado).
   - `GenerateArtTab` exibe o indicador `Tokens ativos no preview` para deixar claro se veio de Identidade ou DS importado.
6. UX adicional para uso diario:
   - `TemplateSelector` passou a renderizar miniaturas visuais dos templates detectados no DS importado (cards 9:16 / 4:5 / 1:1).
   - `GenerateArtTab` injeta carregamento dinamico de fontes para preview:
     - usa `@font-face` para fontes customizadas da Identidade (`brandAssets.fonts`);
     - aplica fallback via Google Fonts para familias nao locais.
