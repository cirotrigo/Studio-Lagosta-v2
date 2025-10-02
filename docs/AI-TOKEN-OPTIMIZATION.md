# Otimização de Tokens de IA

Este documento descreve as estratégias de otimização de tokens implementadas para reduzir custos com provedores de IA.

## Problema Resolvido

O sistema estava tentando usar até **182.475 tokens** em uma única requisição, excedendo os créditos disponíveis no OpenRouter e causando erros 402 (Payment Required).

## Soluções Implementadas

### 1. Limites de Tokens por Provider

Cada provedor agora tem um limite padrão configurável:

```typescript
// src/lib/ai/token-limits.ts
const TOKEN_LIMITS = {
  maxOutputTokens: {
    openrouter: 2048,  // Mais conservador
    openai: 4096,
    anthropic: 4096,
    google: 8192,
    mistral: 4096,
  }
}
```

### 2. Configuração via Variáveis de Ambiente

Você pode ajustar os limites no `.env.local`:

```env
# Limites de tokens de saída por provedor
MAX_TOKENS_OPENROUTER=2048
MAX_TOKENS_OPENAI=4096
MAX_TOKENS_ANTHROPIC=4096
MAX_TOKENS_GOOGLE=8192
MAX_TOKENS_MISTRAL=4096

# Configuração RAG (Base de Conhecimento)
RAG_MAX_TOKENS=2000
RAG_TOP_K=5
RAG_MIN_SCORE=0.7
```

### 3. Override por Requisição

O frontend pode especificar `maxTokens` por requisição:

```typescript
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  body: JSON.stringify({
    provider: 'openrouter',
    model: 'z-ai/glm-4.6',
    messages: [...],
    maxTokens: 1024, // Override do limite padrão
  })
})
```

### 4. Funções Utilitárias

```typescript
import {
  getMaxOutputTokens,
  estimateTokens,
  truncateToTokenLimit,
  calculateContextTokens
} from '@/lib/ai/token-limits'

// Obter limite padrão
const limit = getMaxOutputTokens('openrouter') // 2048

// Estimar tokens de um texto
const tokens = estimateTokens('Olá, mundo!') // ~3

// Truncar texto para caber no limite
const truncated = truncateToTokenLimit(longText, 1000)

// Calcular total de tokens das mensagens
const total = calculateContextTokens(messages)
```

## Estratégias de Economia

### 1. Reduza `MAX_TOKENS_OPENROUTER`

Para respostas mais curtas e econômicas:

```env
MAX_TOKENS_OPENROUTER=1024  # Respostas mais curtas
MAX_TOKENS_OPENROUTER=512   # Respostas muito curtas
```

### 2. Otimize o RAG

Reduza a quantidade de contexto injetado:

```env
RAG_MAX_TOKENS=1000  # Menos contexto da base de conhecimento
RAG_TOP_K=3          # Menos chunks recuperados
RAG_MIN_SCORE=0.75   # Apenas matches muito relevantes
```

### 3. Use Modelos Mais Baratos

No OpenRouter, alguns modelos custam menos por token:
- `openai/gpt-4o-mini` - Mais barato
- `anthropic/claude-3-haiku` - Econômico
- `google/gemini-2.0-flash` - Rápido e barato

### 4. Limite o Histórico de Mensagens

No frontend, mantenha apenas as últimas N mensagens:

```typescript
const recentMessages = messages.slice(-10) // Últimas 10 mensagens
```

## Monitoramento

Os logs agora mostram o uso de tokens:

```
[RAG] Context retrieved, length: 1847
[CHAT] Calling provider: openrouter model: z-ai/glm-4.6 maxTokens: 2048
```

## Estimativa de Custos

Aproximação: **4 caracteres ≈ 1 token**

- Mensagem de 1000 caracteres ≈ 250 tokens
- Resposta de 2048 tokens ≈ 8192 caracteres
- RAG context de 2000 tokens ≈ 8000 caracteres

## Próximos Passos

1. **Implementar cache de embeddings** para reduzir chamadas à API do OpenAI
2. **Adicionar dashboard de uso** para visualizar consumo por usuário
3. **Rate limiting** para prevenir abuso
4. **Alertas automáticos** quando créditos estiverem baixos

## Referências

- [OpenRouter Pricing](https://openrouter.ai/docs/pricing)
- [OpenAI Token Limits](https://platform.openai.com/docs/models)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
