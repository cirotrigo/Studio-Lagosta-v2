-- Lembretes de publicação manual deixaram de sair por webhook e passaram a ser
-- enviados direto pelo WhatsApp (Evolution API) — ver src/lib/notifications/
-- reminder-notifier.ts. A coluna não é mais lida por nenhum código.
--
-- Valor descartado: os 11 projetos tinham exatamente a mesma URL,
-- https://n8n.lagostacriativa.com.br/webhook/notifica-lagosta
--
-- IF EXISTS porque este banco já teve a coluna removida por db push em alguns
-- ambientes; a migration precisa ser no-op nesses casos.
ALTER TABLE "Project" DROP COLUMN IF EXISTS "webhookReminderUrl";
