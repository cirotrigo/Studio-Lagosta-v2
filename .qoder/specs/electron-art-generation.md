# Spec Atualizada: Geração de Arte (Server + Electron) e V2 de Consistência de Fontes

Data de atualização: 2026-03-07

## 1. Objetivo

Definir o estado real do pipeline de geração de arte e propor a evolução V2 para garantir consistência tipográfica entre projetos, templates e render final no Electron.

## 2. Estado Atual (Real)

## 2.1 O que já está implementado

- Backend template path com:
  - processamento de texto
  - classificação de slots
  - controle de densidade
  - resolução de fontes por prioridade (`template -> projeto -> fallback`)
  - retorno de `imageUrl`, `templates[].templateData`, `templates[].fontSources`, `slots`
- Pipeline 4-pass no desktop app:
  - Pass 1: `buildDraftLayout()`
  - Pass 2: `measureTextLayout()` via IPC
  - Pass 3: `resolveLayoutWithMeasurements()`
  - Pass 4: `renderFinalLayout()` via IPC
- Cache e registro de fontes no main process (`ensureFont` + `registerFontFromPath`)
- Fluxo legado mantido para caminho sem template (`renderText`)

## 2.2 Evidências no código

- Backend template path: `src/app/api/tools/generate-art/route.ts`
- Layout engine (Pass 1 e 3): `desktop-app/src/lib/layout-engine.ts`
- Orquestração 4-pass no frontend:
  - `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`
- Pass 2 e Pass 4 no main:
  - `desktop-app/electron/main.ts`
  - `desktop-app/electron/ipc/text-renderer.ts`
- Cache de fontes:
  - `desktop-app/electron/ipc/font-cache.ts`

## 2.3 Correções em relação à spec anterior

- `buildDraftLayout`, `resolveLayoutWithMeasurements` e a orquestração 4-pass **não faltam**; já existem.
- Não é correto chamar o sistema de geração como “100% local”: a imagem base e etapas de IA continuam no servidor.
- IPC `font:ensure` dedicado não é obrigatório para funcionamento atual; o `ensureFont` já é usado nos handlers de Pass 2/4 no main process.

## 3. Arquitetura Atual (Híbrida)

1. **Servidor (Next.js)**:
   - recebe request de geração
   - processa texto e slots
   - gera imagem base
   - resolve `fontSources`
   - responde payload de template path
2. **Electron Renderer**:
   - Pass 1 (`buildDraftLayout`)
   - chama Pass 2 por IPC
   - Pass 3 (`resolveLayoutWithMeasurements`)
   - chama Pass 4 por IPC
3. **Electron Main**:
   - garante fontes (cache + registro)
   - mede texto real
   - renderiza composição final

## 4. Problemas Reais (Prioridade Alta)

## 4.1 Identidade de fonte fraca no cache

Hoje o cache local usa nome da família como chave de arquivo. Isso permite colisões quando projetos diferentes usam `fontFamily` igual com arquivos diferentes.

Risco:
- projeto A e B com mesma `fontFamily`, arquivos distintos
- render pode reutilizar arquivo errado por cache compartilhado

## 4.2 Pass 4 pode re-resolver fonte só por nome

No Pass 4, o código revalida fontes por `fontName` sem sempre carregar pela mesma URL usada no Pass 2.

Risco:
- fallback inesperado
- inconsistência entre medição (Pass 2) e render (Pass 4)

## 4.3 Strict mode ainda permite fallback indireto de fonte

Para fluxo estrito, falha de fonte customizada deveria quebrar com erro explícito (determinismo), não degradar silenciosamente.

## 5. Proposta V2: Font Identity First

## 5.1 Princípios

- Fonte deve ter identidade estável além de `family`:
  - `fontId` (DB, quando existir) e/ou
  - `fontUrl` e/ou
  - `fontHash` (hash do arquivo)
- O Pass 4 deve usar exatamente a mesma resolução do Pass 2.
- Em `strictTemplateMode`, qualquer fonte obrigatória indisponível gera erro.

## 5.2 Contrato de dados (backend -> desktop)

Evoluir `fontSources` para incluir metadados de identidade:

```ts
type FontSource = {
  family: string
  url: string | null
  fontId?: number | null
  hash?: string | null
  source: 'project-custom' | 'template' | 'project-default' | 'fallback'
}
```

## 5.3 Cache no main process

- Chave de cache baseada em identidade forte:
  - prioridade: `hash` -> `fontId` -> `projectId+url` -> `family` (último recurso)
- Evitar sobreposição de arquivos quando `family` coincide entre projetos.

## 5.4 Acoplamento Pass 2 -> Pass 4

- Pass 2 retorna também referências de runtime:
  - `runtimeFontKey` por slot/fonte utilizada
- Pass 4 recebe essas referências e renderiza sem nova resolução por nome.

## 5.5 Política de erro em strict mode

- Se slot exigir fonte customizada e ela falhar:
  - lançar erro com contexto (`slot`, `family`, `source`)
  - não substituir por fallback silencioso

## 6. Plano de Implementação (V2)

## Fase 1 — Contrato e compatibilidade

Arquivos:
- `src/app/api/tools/generate-art/route.ts`
- `desktop-app/src/hooks/use-art-generation.ts`
- `desktop-app/src/lib/layout-engine.ts` (tipos)

Entregas:
- novo shape de `fontSources` com metadata extra
- compatibilidade retroativa (campos opcionais)

## Fase 2 — Cache e registro determinísticos

Arquivos:
- `desktop-app/electron/ipc/font-cache.ts`
- `desktop-app/electron/main.ts`

Entregas:
- cache key forte
- `ensureFont` aceitando objeto de fonte (não só `family/url`)
- logs com `runtimeFontKey`

## Fase 3 — Travar consistência Pass 2/Pass 4

Arquivos:
- `desktop-app/electron/ipc/text-renderer.ts`
- `desktop-app/electron/main.ts`
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`

Entregas:
- resultado do Pass 2 inclui runtime refs
- Pass 4 usa refs do Pass 2
- remover re-resolução ambígua por nome

## Fase 4 — Strict mode e observabilidade

Arquivos:
- `desktop-app/src/lib/layout-engine.ts`
- `desktop-app/electron/main.ts`
- `desktop-app/src/components/project/tabs/GenerateArtTab.tsx`

Entregas:
- erro explícito para fonte faltante em modo estrito
- telemetria: fallback, mismatch, fonte ausente

## 7. Checklist

### Já pronto

- [x] Backend template path funcional
- [x] Pipeline 4-pass integrado no desktop
- [x] Testes de layout engine (golden) existentes

### V2 pendente

- [ ] Contrato de `fontSources` com identidade forte
- [ ] Cache key robusta por fonte real
- [ ] Reuso obrigatório da mesma fonte entre Pass 2 e Pass 4
- [ ] Strict mode sem fallback silencioso de fonte
- [ ] Testes de regressão para colisão de `fontFamily` entre projetos

## 8. Critérios de Aceite da V2

- Mesmo input (template + slots + fontes) gera mesmo layout/render de forma estável.
- Fonte de projeto A não contamina render de projeto B com mesmo `fontFamily`.
- Em `strictTemplateMode`, erro de fonte aparece de forma explícita e reproduzível.
- Pass 2 e Pass 4 usam a mesma identidade de fonte comprovável por logs/telemetria.
