# 🔒 Segurança e Backup do Banco de Dados

## ⚠️ Incidente: Perda de Dados (10-13 Janeiro 2026)

### O que aconteceu?
- **Data**: 10/janeiro ~14h - 13/janeiro 08h
- **Causa**: DATABASE_URL alterada acidentalmente para Supabase
- **Duração**: ~66 horas sem persistência de dados
- **Perda**: ~79 posts e ~46 criativos

### Timeline do incidente
```
10/jan 14h   ✅ Último post salvo com sucesso
10/jan ~19h  🔴 DATABASE_URL alterada para Supabase
10-13/jan    ❌ Posts tentados mas não salvos (schema incompatível)
13/jan 07h   🔄 Banco Neon recriado (histórico perdido)
13/jan 08h   ✅ Sistema normalizado
13/jan 16h   ✅ Proteções implementadas
```

---

## 🛡️ Proteções Implementadas

### 1. Backup Automático Diário
- **Quando**: Todo dia às 3h da manhã
- **Formato**: JSON completo do banco
- **Retenção**: Últimos 7 dias
- **Localização**: `./backups/backup_YYYY-MM-DD.json`
- **Endpoint**: `/api/cron/backup-database`

#### Como restaurar um backup:
```bash
# Ver backups disponíveis
ls -lh backups/

# Restaurar backup (script a ser criado)
npm run restore-backup backups/backup_2026-01-13.json
```

### 2. Validação de DATABASE_URL
O sistema agora valida a DATABASE_URL no startup:

- ✅ Verifica se é PostgreSQL
- ✅ Avisa se não é do Neon
- ❌ **Bloqueia** se não for PostgreSQL
- 📝 Loga a URL mascarada no console

#### O que você verá:
```
✅ DATABASE_URL validated: postgresql://****@ep-fragrant-term-adnufsao.neon.tech...
```

#### Se houver problema:
```
❌ DATABASE_URL must be a PostgreSQL connection string!
Current URL starts with: mysql://...
Expected format: postgresql://...
```

### 3. Separação de Ambientes
- **`.env`**: Variáveis compartilhadas
- **`.env.local`**: Desenvolvimento local (não commitado)
- **`.env.production`**: Produção (Vercel)
- **`.env.example`**: Template para documentação

---

## 📋 Procedimentos de Segurança

### Antes de Alterar DATABASE_URL

1. **SEMPRE** faça backup primeiro:
   ```bash
   npx tsx scripts/backup-database-json.ts
   ```

2. **NUNCA** altere diretamente no `.env` em produção

3. **SEMPRE** teste em desenvolvimento primeiro

4. **CONFIRME** que a URL é do Neon:
   ```
   postgresql://...@ep-*.neon.tech/neondb
   ```

### Checklist Semanal

- [ ] Verificar se backups estão sendo criados (`ls -lh backups/`)
- [ ] Confirmar que cron jobs estão rodando (Vercel dashboard)
- [ ] Validar que DATABASE_URL não foi alterada
- [ ] Testar restauração de um backup antigo

---

## 🚨 Em Caso de Emergência

### Se perdeu dados RECENTEMENTE (< 24h):

1. **NÃO ENTRE EM PÂNICO**
2. **NÃO faça mais alterações** no banco
3. Execute backup imediato:
   ```bash
   npx tsx scripts/backup-database-json.ts
   ```
4. Verifique backups do Neon (Point-in-Time Restore):
   - Acesse: https://console.neon.tech
   - Vá em: Branches → Create branch → Point in time
5. Contate suporte se necessário

### Se alterou DATABASE_URL por acidente:

1. **PARE** o servidor imediatamente
2. **NÃO** execute migrações
3. **REVERTA** a URL para a correta
4. **VERIFIQUE** se dados ainda existem
5. **RODE** backup imediatamente

---

## 📊 Monitoramento

### Logs importantes:
- Startup: Validação de DATABASE_URL
- Cron: Backup diário às 3h
- Prisma: Erros de conexão

### Como verificar logs na Vercel:
1. Acesse: https://vercel.com/seu-projeto/deployments
2. Clique no deployment atual
3. Vá em: Runtime Logs
4. Procure por:
   - `✅ DATABASE_URL validated`
   - `[BACKUP_CRON] ✅ Backup concluído`
   - `❌ DATABASE_URL must be`

---

## 🔧 Comandos Úteis

```bash
# Backup manual
npx tsx scripts/backup-database-json.ts

# Verificar banco atual
echo $DATABASE_URL | grep -o "ep-[^.]*"

# Listar backups
ls -lhtr backups/*.json

# Testar conexão
npx prisma db execute --stdin <<< "SELECT 1;"

# Ver tamanho do backup mais recente
du -h backups/latest.json
```

---

## 📝 Notas Importantes

1. **Backups locais** são apenas para emergências de curto prazo
2. **Neon mantém** backups point-in-time automáticos
3. **Vercel não persiste** arquivos entre deploys (backups são temporários)
4. **Considere** backup para S3/Vercel Blob para longo prazo

---

## ✅ Status Atual do Sistema

- [x] Backup automático diário configurado
- [x] Validação de DATABASE_URL ativa
- [x] Documentação criada
- [x] Arquivos .env.example atualizados
- [x] Sistema testado e funcional

**Último backup:** 2026-01-13 (9.87 MB, 3.899 registros)

---

## 📞 Suporte

- **Neon**: https://console.neon.tech/support
- **Vercel**: https://vercel.com/support
- **Prisma**: https://www.prisma.io/docs/support

---

*Documento criado em: 13/janeiro/2026*
*Última atualização: 13/janeiro/2026*
