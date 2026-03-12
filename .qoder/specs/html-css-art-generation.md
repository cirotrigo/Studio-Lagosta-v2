# Spec Ajustada: HTML/CSS Renderer (Experimental) Sem Quebrar o Pipeline Atual

Data: 2026-03-08  
Status: Proposta ajustada ao projeto atual  
Escopo: adicionar renderer HTML/CSS como opção `opt-in`, mantendo Canvas 4-pass como padrão

## 1. Objetivo

Adicionar um renderer HTML/CSS no Electron para experimentação e iteração de layout, sem substituir o pipeline atual e sem exigir mudanças grandes de schema/API nesta fase.

## 2. Princípios da versão ajustada

1. Não quebrar o que já funciona.
2. Reusar modelo atual (`brandVisualElements`, `artTemplates`, `titleFontFamily`, `bodyFontFamily`).
3. Reusar contrato atual de `/api/tools/generate-art`.
4. HTML renderer começa como `opt-in` e com fallback automático para canvas.
5. Sem migração de banco na Fase 1.

## 3. Estado atual que será preservado

- Backend atual:
  - `POST /api/tools/generate-art` já retorna `templatePath`, `templates`, `slots`, `imageUrl`, `logo`, etc.
- Desktop atual:
  - fluxo template com Pass 1/2/3/4 (layout engine + IPC + canvas)
  - fluxo legado para casos sem template
- Fontes:
  - resolução atual por `fontSources` no template path
  - cache local no main process

## 4. Arquitetura alvo (com coexistência)

## 4.1 Seleção de engine

Novo parâmetro opcional de execução no desktop:

```ts
type RenderEngine = 'canvas' | 'html'
```

Regra inicial:
- default: `canvas`
- `html` só quando `templatePath === true`
- se `html` falhar, fallback para `canvas`

## 4.2 Fluxo macro

1. Front chama `POST /api/tools/generate-art` (sem alterar contrato existente).
2. Recebe payload atual (`imageUrl`, `templates`, `slots`, etc).
3. Para cada template:
   - se `renderEngine='canvas'`: fluxo atual 4-pass
   - se `renderEngine='html'`:
     - mapear `templateData` atual para um `DomLayoutPlan`
     - gerar HTML/CSS
     - renderizar em janela oculta no Electron main
     - capturar imagem
     - em erro: fallback para canvas

## 5. Contratos (compatíveis com o projeto)

## 5.1 Sem mudança obrigatória no `/api/tools/generate-art`

Continuar usando:
- `templatePath`
- `templates[].templateData`
- `templates[].fontSources`
- `slots`
- `imageUrl`
- `logo`

## 5.2 Metadados opcionais (futuro, não bloqueante)

Opcionalmente, depois:
- `renderHints` (ex.: estilo de overlay preferido para html)
- sem breaking change

## 6. Novo módulo: mapeamento `templateData -> DomLayoutPlan`

Criar mapper em `desktop-app/src/lib/html-layout-mapper.ts`:

Entrada:
- `templateData` atual (com `content_slots`, `slot_priority`, `zones`, `overlay`, `typography`)
- `slots` preenchidos
- `format`

Saída:

```ts
interface DomLayoutPlan {
  width: number
  height: number
  safeArea: { top: number; right: number; bottom: number; left: number }
  textZone: { xPct: number; widthPct: number; align: 'left' | 'center' | 'right' }
  overlay: {
    enabled: boolean
    type: 'gradient' | 'solid'
    direction?: 'left_to_right' | 'right_to_left' | 'top_to_bottom' | 'bottom_to_top'
    opacity: number
    startColor?: string
    endOpacity?: number
  }
  slots: Array<{
    name: string
    text: string
    order: number
    group: 'top' | 'bottom'
    fontFamily: string
    fontWeight: number
    sizePx: number
    color: string
    uppercase: boolean
    maxLines?: number
    lineBreakStrategy?: 'balanced' | 'natural' | 'fixed'
  }>
  logo?: {
    enabled: boolean
    position: string
    sizeRatio: number
  }
}
```

Observação:
- mantém as dimensões reais já usadas no projeto:
  - `FEED_PORTRAIT: 1080x1350`
  - `STORY: 1080x1920`
  - `SQUARE: 1024x1024`

## 7. HTML builder (experimental)

Criar `desktop-app/src/lib/html-builder.ts`:
- recebe `DomLayoutPlan`, `backgroundImage`, `logo`, `fontSources`
- gera HTML estático completo
- injeta CSS variables para cores/escala
- aplica classes por slot
- preserva `text-align`, safe area e overlay

Importante:
- não depender de `clamp()` para “caber texto” na Fase 1
- usar tamanho calculado pelo mapper (mais previsível)
- `clamp()` fica para experimentos na Fase 3+

## 8. HTML renderer no Electron main

Criar `desktop-app/electron/ipc/html-renderer.ts` com:
- janela oculta (`offscreen: true`)
- load de HTML em `data:` URL
- espera de render:
  - `document.fonts.ready`
  - 2 `requestAnimationFrame`
  - pequeno timeout de segurança
- `capturePage()`
- retorno `PNG` ou `JPEG` buffer

Integrações:
- `main.ts`: novo IPC `art:render-html`
- `preload.ts`: bridge `renderArtHtml()`

## 9. Fontes no renderer HTML

Para não repetir erro de consistência:
- usar o mesmo processo de `ensureFont` do main
- injetar `@font-face` apontando para caminho local garantido
- em `strictTemplateMode`, se fonte exigida falhar: erro explícito
- fora de strict mode: fallback controlado + telemetria

## 10. Orquestração no frontend

Atualizar apenas `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`:

1. adicionar preferência local de engine (`canvas` default)
2. no `templatePath`, escolher rota:
   - `canvas`: fluxo atual sem mudanças
   - `html`: novo fluxo
3. erro no fluxo `html`:
   - logar motivo
   - executar fallback `canvas`
4. manter UX atual de progresso e resultados

## 11. Fluxo final (como fica)

## 11.1 Canvas (padrão)

1. Usuário gera arte.
2. Backend processa texto/template e retorna payload atual.
3. Desktop roda pipeline 4-pass.
4. Resultado exibido.

## 11.2 HTML (opt-in experimental)

1. Usuário gera arte com `renderEngine=html` no desktop.
2. Backend retorna o mesmo payload atual.
3. Desktop converte `templateData` atual para `DomLayoutPlan`.
4. Desktop monta HTML/CSS.
5. Electron main garante fontes locais.
6. Electron renderiza página oculta e captura imagem.
7. Se sucesso: exibe resultado HTML.
8. Se falha: fallback automático para canvas 4-pass.

## 12. Fases de implementação

## Fase 1 (mínima e segura)

- [ ] `RenderEngine` no desktop (`canvas` default)
- [ ] `html-layout-mapper.ts` (suporte subset de templates)
- [ ] `html-builder.ts`
- [ ] `html-renderer.ts` + IPC + preload
- [ ] fallback automático para canvas
- [ ] telemetria comparativa (`engine`, `latency`, `fallback_reason`)

## Fase 2 (qualidade de layout)

- [ ] melhorar quebra de linha (`balanced` quando fizer sentido)
- [ ] paridade visual de overlay/logo
- [ ] testes de regressão visual (golden) html vs canvas

## Fase 3 (decisão de produto)

- [ ] habilitar html para % pequena de templates
- [ ] medir taxa de fallback/erro
- [ ] decidir expandir, manter híbrido, ou descontinuar html

## 13. Não fazer agora

- Não migrar schema para `brandIdentity` novo.
- Não trocar contrato principal da API.
- Não remover canvas renderer.
- Não declarar HTML como default antes de métricas reais.

## 14. Critérios de aceite da Fase 1

1. Nenhum fluxo atual quebra com `renderEngine` ausente.
2. HTML renderer funciona em subset de templates sem erro crítico.
3. Fallback para canvas cobre falhas de HTML sem bloquear geração.
4. Dimensões e fontes respeitam o padrão atual do projeto.
5. Métricas de comparação ficam disponíveis para decisão da Fase 3.

## 15. Riscos e mitigação

- Risco: divergência visual HTML vs canvas  
Mitigação: rollout por subset + snapshot tests.

- Risco: timing de fonte no Chromium  
Mitigação: `ensureFont` + `document.fonts.ready` + frames extras + strict mode.

- Risco: custo de manutenção de dois renderers  
Mitigação: html restrito a templates elegíveis até provar ganho real.
