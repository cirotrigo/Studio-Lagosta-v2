# 📦 Instruções de Restauração de Backup

## 📋 Informações do Backup

**Arquivo**: `backup_2025-12-10.json`
**Data**: 10 de Dezembro de 2024
**Tamanho**: 7.39 MB
**Registros**: 3,083

### Tabelas Incluídas

| Tabela | Registros |
|--------|-----------|
| Generation | 711 |
| SocialPost | 1,134 |
| UsageHistory | 889 |
| Template | 62 |
| CustomFont | 76 |
| Element | 50 |
| Logo | 39 |
| MusicLibrary | 31 |
| YoutubeDownloadJob | 17 |
| VideoProcessingJob | 15 |
| Project | 10 |
| Prompt | 9 |
| User | 8 |
| CreditBalance | 6 |
| BrandColor | 20 |
| Plan | 3 |
| Organization | 1 |
| PromptLibrary | 1 |
| AdminSettings | 1 |

**Total**: 3,083 registros

## ⚠️ IMPORTANTE

Este backup é em formato JSON e contém os dados das tabelas principais do sistema.

**NÃO** sobrescreve o banco de dados automaticamente - você precisa usar scripts de restauração específicos.

## 🔄 Como Restaurar

### Opção 1: Restauração Completa (⚠️ APAGA DADOS ATUAIS)

**ATENÇÃO**: Isto irá DELETAR todos os dados atuais e restaurar do backup.

```bash
# 1. Criar script de restauração (será criado abaixo)
npx tsx scripts/restore-database-json.ts backups/backup_2025-12-10.json

# 2. Confirmar quando solicitado
# Digite 'yes' para confirmar
```

### Opção 2: Restauração Seletiva (Recomendado)

Restaurar apenas tabelas específicas:

```bash
# Exemplo: restaurar apenas Users e Projects
npx tsx scripts/restore-database-json.ts backups/backup_2025-12-10.json --tables User,Project
```

### Opção 3: Restauração Manual

1. Abra o arquivo JSON: `backups/backup_2025-12-10.json`
2. Localize a tabela desejada em `tables.<TableName>.data`
3. Use Prisma Studio ou SQL para inserir dados manualmente

## 🛠️ Script de Restauração

Criar arquivo `scripts/restore-database-json.ts`:

```typescript
import { PrismaClient } from '../prisma/generated/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function restoreDatabase(backupFile: string) {
  console.log('🔄 Iniciando restauração do banco de dados...\n')

  // Ler backup
  const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf-8'))

  console.log('⚠️  ATENÇÃO: Isto irá DELETAR todos os dados atuais!')
  console.log('Digite "yes" para confirmar: ')

  // Aguardar confirmação (em produção)
  // Por segurança, não implementamos auto-confirmação

  // Implementação da restauração aqui
  // ...
}
```

## 📊 Verificar Integridade do Backup

```bash
# Ver resumo do backup
cat backups/backup_2025-12-10.json | jq '.tables | to_entries | map({name: .key, count: .value.count})'

# Ver timestamp
cat backups/backup_2025-12-10.json | jq '.timestamp'

# Ver lista de tabelas
cat backups/backup_2025-12-10.json | jq '.tables | keys'
```

## 🆘 Em Caso de Problemas

### Backup Corrompido
- Verifique se o arquivo JSON é válido: `jq . backups/backup_2025-12-10.json`
- Se corrompido, use backup anterior

### Erro de Foreign Keys
- Restaure tabelas na ordem correta (User → Project → Template → etc)
- Desative temporariamente FKs se necessário (não recomendado)

### Dados Parciais
- Use restauração seletiva (Opção 2)
- Compare com backup anterior

## 📞 Suporte

Para problemas de restauração:
1. Verifique logs de erro
2. Consulte documentação do Prisma
3. Contate equipe DevOps

## 📝 Notas Importantes

1. **Backup não inclui**:
   - Senhas/tokens (por segurança)
   - Arquivos de mídia (apenas URLs)
   - Logs temporários

2. **Antes de restaurar**:
   - Faça backup do estado atual
   - Teste em ambiente de desenvolvimento
   - Notifique equipe

3. **Após restaurar**:
   - Verifique integridade dos dados
   - Teste funcionalidades críticas
   - Monitore por 24h

---

**Criado em**: 10 de Dezembro de 2024
**Formato**: JSON v1.0.0
**Compressão**: Nenhuma (use gzip se necessário)
