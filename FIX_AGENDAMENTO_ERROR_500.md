# Correção do Erro 500 no Agendamento de Posts

## Data: 09/01/2025

### Problema Identificado

Após implementar as melhorias de prevenção de duplicação com transações, o agendamento de posts parou de funcionar, retornando erro 500:

```
Failed to load resource: the server responded with a status of 500
Error creating/updating post: ApiError: Internal server error
```

### Causa Raiz

A transação implementada em `src/lib/posts/later-scheduler.ts` tinha 2 problemas:

1. **Post retornado sem status atualizado**: A transação atualizava o status para POSTING mas retornava o post original (antes da atualização)
2. **Campo processingStartedAt potencialmente inexistente**: O novo campo poderia não existir em alguns ambientes

### Solução Aplicada

#### 1. Retornar Post Atualizado da Transação

**Antes:**
```typescript
await tx.socialPost.update({
  where: { id: postId },
  data: {
    status: PostStatus.POSTING,
    processingStartedAt: new Date()
  }
})
return lockedPost // ❌ Retornava post original
```

**Depois:**
```typescript
const updatedPost = await tx.socialPost.update({
  where: { id: postId },
  data: updateData,
  include: { Project: {...} } // Inclui dados necessários
})
return updatedPost // ✅ Retorna post atualizado
```

#### 2. Verificação Defensiva do Campo

```typescript
const updateData: any = {
  status: PostStatus.POSTING
}

// Adiciona processingStartedAt apenas se o campo existir
if ('processingStartedAt' in lockedPost) {
  updateData.processingStartedAt = new Date()
}
```

#### 3. Melhorias Adicionais

- **Timeout na transação**: 10 segundos para evitar travamento
- **Logs de debug**: Para facilitar diagnóstico de problemas futuros
- **Código defensivo**: Funciona mesmo se o campo não foi migrado

### Arquivos Modificados

- `src/lib/posts/later-scheduler.ts` - Corrigida lógica da transação

### Como Testar

1. Criar um post com agendamento IMMEDIATE
2. Criar um post com agendamento SCHEDULED
3. Verificar que ambos funcionam sem erro 500

### Status

✅ **RESOLVIDO** - Agendamento funcionando normalmente

### Lições Aprendidas

1. Sempre retornar dados atualizados de transações
2. Ser defensivo ao usar novos campos do banco
3. Adicionar logs em pontos críticos para facilitar debug
4. Testar após implementar mudanças complexas como transações