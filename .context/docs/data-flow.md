---
status: unfilled
generated: 2026-01-15
---

# Data Flow & Integrations

Explain how data enters, moves through, and exits the system, including interactions with external services.

## Module Dependencies
- **check-instagram-setup.ts/** → `src`
- **scripts/** → `prisma`, `src`
- **src/** → `prisma`

## Service Layer
- [`GoogleDriveService`](src/server/google-drive-service.ts#L70)

## High-level Flow

Summarize the primary pipeline from input to output. Reference diagrams or embed Mermaid definitions when available.

## Internal Movement

Describe how modules within `ADMIN_SETUP.md`, `agents`, `AGENTS.md`, `ANALISE_SISTEMA_POSTAGEM.md`, `BACKUP_COMPLETE.md`, `BACKUP_SECURITY.md`, `backups`, `BOOST_SPACE_CONFIG_GUIDE.md`, `check-entry-details.js`, `check-instagram-setup.ts`, `check-migration-status.sql`, `check-status.js`, `CLAUDE.md`, `CLOUDFLARE_SETUP.md`, `COMO_GERAR_TOKEN_INSTAGRAM.md`, `COMO-ALTERAR-LOGO.md`, `components.json`, `configure-reminder-webhook.js`, `CONTEXT_FOR_NEXT_SESSION.md`, `create-test-reminder.js`, `CURVED_TEXT_GUIDE.md`, `DASHBOARD_INTEGRATION_COMPLETE.md`, `DEPLOY_COMMANDS.sh`, `DEPLOY-CHECKLIST.md`, `DEPLOY-DATABASE-MIGRATION.md`, `DEPLOY-GUIDE.md`, `DEPLOY-QUICKSTART.md`, `docs`, `DOMAIN_SETUP.md`, `EFFECTS_SYSTEM.md`, `EFFECTS_TROUBLESHOOTING.md`, `ENV_VARIABLES.md`, `eslint.config.mjs`, `EXPORT_FIX_V2.md`, `EXPORT_FIX.md`, `FASE-6-COMPLETA.md`, `FFMPEG_VERCEL_SETUP.md`, `FINAL_SOLUTION.md`, `FINAL_TEXT_IMPLEMENTATION.md`, `FIX_AGENDAMENTO_ERROR_500.md`, `FIX_PROCESSING_STARTED_AT_FIELD.md`, `FIX_YOUTUBE_DOWNLOAD_404.md`, `GERAR_TOKEN_AGORA.md`, `GUIA_RAPIDO_DEPLOY.md`, `GUIA-COMPONENTES-CMS.md`, `GUIA-CONFIGURACOES-SITE.md`, `GUIA-DE-TESTES.md`, `HANDOFF_REPORT_MIGRATIONS.md`, `implementation_plan.md`, `INSTAGRAM_ANALYTICS_IMPLEMENTATION.md`, `LATE_API_IMPROVEMENTS.md`, `LATER_ANALYTICS_IMPLEMENTATION.md`, `LAYERS_PANEL_OPTIMIZATION.md`, `migrate-enum-final.sql`, `migrate-enum-step1.sql`, `migrate-enum-step2.sql`, `migrate-post-status.sql`, `MIGRATION_APPLY_INSTRUCTIONS.md`, `MIGRATION_CHECKLIST.md`, `MIGRATION_COMPLETION_REPORT.md`, `MIGRATION_DOCS_INDEX.md`, `MIGRATION_FIX_REPORT.md`, `MIGRATION_FIX_SUMMARY.md`, `MIGRATION_GUIDE.md`, `MIGRATION_NORMALIZATION.md`, `MIGRATION_PRODUCTION_GUIDE.md`, `MIGRATION_SUMMARY.md`, `MIGRATION-SUMMARY.md`, `MIGRATIONS_README.md`, `MOBILE_EDITOR_IMPLEMENTATION.md`, `MOBILE_IMPROVEMENTS_SUMMARY.md`, `MOBILE_OVERFLOW_FIX.md`, `MOBILE_UI_FIXES.md`, `MOBILE_UX_FIX_GUIDE.md`, `MOCK-DESENVOLVIMENTO.md`, `monitor-reminders.js`, `N8N_REMINDER_SETUP.md`, `next-env.d.ts`, `next.config.ts`, `package-lock.json`, `package.json`, `PERFORMANCE_OPTIMIZATIONS.md`, `PHASE_2_IMPLEMENTATION_STATUS.md`, `playwright.config.ts`, `postcss.config.mjs`, `POSTING_SCHEDULING_ANALYSIS.md`, `prevc-template.md`, `prisma`, `PRODUCTION_CHECKLIST.md`, `PRODUCTION-ENV.md`, `PROGRESSO-BIBLIOTECA-MUSICAS.md`, `prompt`, `PROMPT_FOR_NEXT_CONVERSATION.md`, `prompts`, `public`, `QUICK_HANDOFF.md`, `QUICK_START_LATER.md`, `QUICKSTART-BLOB.md`, `README_SIMPLIFICATION.md`, `README-DEPLOY.md`, `README.md`, `SAFARI_FIX_GUIDE.md`, `scripts`, `SETUP_AI_IMAGES.md`, `SETUP-BLOB.md`, `SIMPLIFICATION_SUMMARY.md`, `SMART_GUIDES.md`, `src`, `STORY_INSIGHTS_SETUP.md`, `tailwind.config.ts`, `TEMPORARY_FIX_OPTION.md`, `TEMPORARY_FIX_PROCESSING_STARTED_AT.md`, `test-credit-deduction.js`, `test-update-reminder.js`, `test-webhook-failure.sh`, `test-webhook-local.sh`, `test-webhook-simplified.sh`, `TESTING_LATER.md`, `tests`, `TEXT_BEHAVIOR_CHANGES.md`, `TEXT_REFACTOR.md`, `TOKEN_CONFIGURADO.md`, `TROUBLESHOOTING.md`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `URGENT_DATABASE_CHECK.md`, `VERCEL_AI_IMAGE_DEBUG.md`, `VERCEL_VIDEO_SETUP.md`, `VERCEL-DEPLOY.md`, `vercel.json`, `VIDEO_PROCESSING_QUEUE.md`, `WEBHOOK_DEBUG_GUIDE.md`, `ZAPIER_BUFFER_CONFIG.md`, `ZAPIER_COPILOT_PROMPT.md`, `ZAPIER_FINAL_MAPPING_V2.md`, `ZAPIER_FINAL_MAPPING.md`, `ZAPIER_QUICK_SETUP.md`, `ZAPIER_SETUP_SIMPLIFIED.md` collaborate (queues, events, RPC calls, shared databases).

## External Integrations

Document each integration with purpose, authentication, payload shapes, and retry strategy.

## Observability & Failure Modes

Describe metrics, traces, or logs that monitor the flow. Note backoff, dead-letter, or compensating actions when downstream systems fail.
