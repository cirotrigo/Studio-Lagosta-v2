# 📦 Backups do Banco de Dados

Este diretório contém os backups do banco de dados do Studio Lagosta v2.

## 📁 Arquivos

- `backup_2025-12-10.json` - Backup completo (7.39 MB, 3,083 registros)
- `latest.json` - Link simbólico para o backup mais recente
- `RESTORE_INSTRUCTIONS.md` - Instruções de restauração

## 🔄 Como Fazer Novo Backup

```bash
npx tsx scripts/backup-database-json.ts
```

## 📖 Como Restaurar

Leia: [RESTORE_INSTRUCTIONS.md](./RESTORE_INSTRUCTIONS.md)

## ⚠️ Importante

- **NÃO** commite backups no Git (estão no .gitignore)
- Backups são armazenados localmente
- Para produção, use backups do Neon Console

---

*Última atualização: 10 de Dezembro de 2024*
