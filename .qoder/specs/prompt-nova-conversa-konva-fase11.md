# Prompt para nova conversa — Konva-Only (Fase 11)

Use este prompt na próxima conversa:

---

Quero implementar **somente a Fase 11**: Normalização JSON para compatibilidade bidirecional de templates entre editor local (desktop-app) e web.

## Pré-condição
- Fases 1 a 10 concluídas, commitadas e documentadas.
- Antes de codar, validar o estado atual do repositório e os commits anteriores.
- Verificar bugs conhecidos: templates criados localmente não funcionam no site e vice-versa.

## Documentos obrigatórios
1. `.qoder/specs/spec-editor-konva-electron-hibrido-v2.md`
2. `.qoder/specs/checklist-implementacao-konva-only.md`
3. `.qoder/specs/andamento-implementacao-konva-only.md`
4. `.qoder/specs/template-registro-fase-konva-only.md`

## Diretriz técnica
- Ao implementar libs/frameworks e APIs, use `context7` para validar APIs atuais.

## Escopo estrito desta conversa (Fase 11)

### A) Investigação e Mapeamento
- Analisar estrutura de template local (`KonvaDocument` em `desktop-app/src/types/template.ts`).
- Analisar estrutura de template no backend web (endpoint de sync).
- Mapear todas as diferenças estruturais entre os dois schemas.
- Documentar campos que:
  - Existem apenas no local
  - Existem apenas no web
  - Têm nomes diferentes
  - Têm tipos diferentes
  - Têm valores default diferentes

### B) Camada de Normalização
- Criar módulo de normalização centralizado.
- Implementar função `normalizeForWeb(localTemplate)` que transforma template local para formato web.
- Implementar função `normalizeForLocal(webTemplate)` que transforma template web para formato local.
- Garantir que a normalização é idempotente (aplicar duas vezes não muda o resultado).
- Tratar campos opcionais vs obrigatórios com defaults sensatos.

### C) Ponto de Aplicação
- Aplicar normalização no sync-service antes de enviar para web (push).
- Aplicar normalização no sync-service ao receber do web (pull).
- Garantir que templates salvos localmente mantêm formato local completo.
- Garantir que templates enviados para web estão no formato esperado pela API.

### D) Validação e Compatibilidade
- Criar schema de validação (Zod ou equivalente) para cada formato.
- Validar template após normalização antes de persistir.
- Log de warnings para campos descartados ou transformados.
- Fallback seguro quando normalização falha (não corromper template original).

### E) Migração de Templates Existentes
- Detectar templates locais em formato antigo/incompatível.
- Oferecer migração automática ou manual.
- Preservar backup do template original antes de migrar.

## Arquivos a analisar

### Local (desktop-app):
- `desktop-app/src/types/template.ts` (schema KonvaDocument)
- `desktop-app/electron/services/sync-service.ts` (sync atual)
- `desktop-app/electron/services/json-storage.ts` (persistência local)
- `desktop-app/electron/ipc/template-handlers.ts` (handlers de template)

### Web (backend):
- Endpoints de sync de templates (localizar e analisar)
- Schema de template no Prisma (se houver)
- Rotas de API que manipulam templates

## Arquivos alvo mínimos

### Novos:
- `desktop-app/src/lib/sync/template-normalizer.ts` (normalização bidirecional)
- `desktop-app/src/lib/sync/template-validator.ts` (validação de schema)
- `desktop-app/src/lib/sync/template-migration.ts` (migração de templates antigos)

### Modificar:
- `desktop-app/electron/services/sync-service.ts` (integrar normalização)
- `desktop-app/electron/ipc/template-handlers.ts` (validar após load)
- `desktop-app/src/types/template.ts` (ajustar tipos se necessário)

## Estrutura de dados sugerida

### Resultado de normalização
```ts
interface NormalizationResult<T> {
  success: boolean
  data: T
  warnings: NormalizationWarning[]
  errors: NormalizationError[]
}

interface NormalizationWarning {
  field: string
  message: string
  action: 'default_applied' | 'field_removed' | 'type_coerced'
}

interface NormalizationError {
  field: string
  message: string
  fatal: boolean
}
```

### Configuração de normalização
```ts
interface NormalizationConfig {
  strict: boolean // falha em qualquer erro vs. tenta continuar
  preserveUnknownFields: boolean // manter campos não reconhecidos
  applyDefaults: boolean // aplicar valores default para campos faltantes
}
```

## Fora de escopo
- Implementação de gradiente (Fase 12)
- Melhorias de UX no editor
- Novos tipos de layer
- Alterações no backend web (apenas leitura/análise)

## Critérios de aceite (obrigatórios)
1. Template criado no local abre corretamente no web após sync.
2. Template criado no web abre corretamente no local após sync.
3. Round-trip completo (local → web → local) não perde dados essenciais.
4. Normalização é idempotente.
5. Warnings são logados para campos problemáticos.
6. Erros fatais impedem sync corrompido.
7. Templates existentes não são corrompidos.
8. Typecheck sem regressão.

## Testes manuais obrigatórios
1. Criar template simples no local, sincronizar, abrir no web.
2. Criar template simples no web, sincronizar, abrir no local.
3. Editar template no local, sincronizar, verificar mudanças no web.
4. Editar template no web, sincronizar, verificar mudanças no local.
5. Testar template com todas as features: múltiplas páginas, texto, imagem, formas.
6. Verificar que templates antigos continuam funcionando.

## Regras de execução
1. Implementar apenas Fase 11.
2. Rodar ao final:
   - `npm --prefix desktop-app run typecheck`
   - `npm --prefix desktop-app run typecheck:electron`
3. Commit obrigatório:
   - `feat(konva-fase-11): normalizacao json para compatibilidade local/web`
4. Atualizar:
   - `.qoder/specs/andamento-implementacao-konva-only.md`
   - `.qoder/specs/checklist-implementacao-konva-only.md`

## Formato obrigatório da resposta final
1. Mapeamento de diferenças encontradas entre schemas.
2. O que foi implementado.
3. Arquivos alterados.
4. Resultado dos comandos de validação.
5. Hash e mensagem do commit.
6. Atualização aplicada no andamento/checklist.
7. Testes manuais executados (round-trip local/web).
8. Riscos remanescentes.
9. Próximo passo sugerido (Fase 12 ou ajustes adicionais).

Comece agora pela Fase 11.

---
