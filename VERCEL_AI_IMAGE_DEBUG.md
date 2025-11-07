# Debug: Rota /api/ai/generate-image retornando 404 no Vercel

## Problema
A rota `/api/ai/generate-image` retorna 404 em produção, mas funciona localmente.

## Verificações Necessárias no Vercel Dashboard

### 1. Variáveis de Ambiente
Acesse: **Settings > Environment Variables**

Verifique se existe:
```
REPLICATE_API_TOKEN=<seu-token-aqui>
```

**⚠️ CRÍTICO**: Se esta variável não existir, a rota retornará 503, não 404.

### 2. Build Logs
Acesse: **Deployments > [último deploy] > Building**

Procure por:
```
Route (app)                                    Size     First Load JS
...
├ ƒ /api/ai/generate-image                    499 B    103 kB
...
```

Se NÃO aparecer, o Next.js não está incluindo a rota no build.

### 3. Function Logs
Acesse: **Deployments > [último deploy] > Functions**

Procure por: `api/ai/generate-image.func`

Se não existir, a função não foi criada.

### 4. Verificar Rotas Criadas
No terminal do Vercel CLI (se tiver instalado):

```bash
vercel ls
vercel inspect <deployment-url>
```

Ou acesse: **Deployments > [último deploy] > Functions** e verifique se `api/ai/generate-image` aparece na lista.

## Possíveis Causas

### Causa 1: vercel.json não está sendo respeitado
**Sintoma**: Rota não aparece nos logs de build
**Solução**: Verificar se `vercel.json` está no root e se está válido (sem erros de sintaxe JSON)

### Causa 2: Next.js 15 + App Router issues
**Sintoma**: Algumas rotas aparecem, outras não
**Solução**: Verificar se todas rotas têm export nomeados corretos:
```typescript
export async function POST(request: Request) { ... }
export const runtime = 'nodejs'
export const maxDuration = 120
```

### Causa 3: Timeout muito alto
**Sintoma**: Vercel rejeita função com timeout > 300s (plano gratuito) ou > que limite do plano
**Solução**: Reduzir `maxDuration` no vercel.json
```json
"app/api/ai/generate-image/route.ts": {
  "maxDuration": 60  // Testar com valor menor
}
```

### Causa 4: Path case-sensitivity
**Sintoma**: Funciona local (macOS/Windows) mas não no Vercel (Linux)
**Solução**: Verificar se não há mistura de maiúsculas/minúsculas nos paths

### Causa 5: Cache do Vercel
**Sintoma**: Mudanças não aparecem após deploy
**Solução**:
1. Ir em **Settings > General**
2. Rolar até **Delete Project**
3. OU fazer deploy em nova branch
4. OU limpar cache: **Deployments > [deploy] > ⋯ > Redeploy**

## Solução de Contorno Temporária

Se a rota continuar com 404, podemos:

### Opção 1: Usar rota /api/ai/image existente
Modificar o frontend para usar `/api/ai/image` e ajustar o backend para aceitar o formato.

### Opção 2: Criar rota em path diferente
```
/api/ai-image-gen/route.ts  (em vez de /api/ai/generate-image/route.ts)
```

### Opção 3: Usar Pages Router (fallback)
Criar arquivo em:
```
/pages/api/ai/generate-image.ts
```

O Pages Router é mais estável no Vercel que App Router para algumas rotas.

## Checklist de Debug

- [ ] Verificar REPLICATE_API_TOKEN existe no Vercel
- [ ] Verificar rota aparece nos Build Logs
- [ ] Verificar função foi criada em Functions
- [ ] Verificar vercel.json está válido
- [ ] Verificar exports estão corretos no route.ts
- [ ] Redeploy com cache limpo
- [ ] Tentar com maxDuration menor
- [ ] Verificar se há logs de erro no Runtime Logs

## Como Acessar Logs no Vercel

1. **Build Logs**: Deployments > [deploy] > Building
2. **Function Logs**: Deployments > [deploy] > Functions > [function] > Logs
3. **Runtime Logs**: Deployments > [deploy] > Runtime Logs
4. **Real-time**: https://vercel.com/[team]/[project]/logs

## Teste Rápido

Após cada deploy, teste:

```bash
# Substituir URL pela sua
curl -X POST https://studio-lagosta-v2.vercel.app/api/ai/generate-image \
  -H "Content-Type: application/json" \
  -H "Cookie: <seu-cookie-clerk>" \
  -d '{"projectId": 1, "prompt": "test", "aspectRatio": "1:1"}'
```

Respostas esperadas:
- **401**: Sem autenticação (OK - rota existe!)
- **400**: Dados inválidos (OK - rota existe!)
- **503**: REPLICATE_API_TOKEN não configurado (OK - rota existe!)
- **404**: Rota não existe (PROBLEMA)

## Referências

- [Vercel Functions Configuration](https://vercel.com/docs/functions/configuration)
- [Next.js App Router + Vercel](https://nextjs.org/docs/app/building-your-application/deploying)
- [Vercel Build Step](https://vercel.com/docs/deployments/build-step)
