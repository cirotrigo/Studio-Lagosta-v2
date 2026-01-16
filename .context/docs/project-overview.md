---
status: unfilled
generated: 2026-01-15
---

# Project Overview

Summarize the problem this project solves and who benefits from it.

## Quick Facts

- Root path: `/Users/cirotrigo/Documents/Studio-Lagosta-v2`
- Primary languages detected:
- .ts (527 files)
- .tsx (391 files)
- .md (180 files)
- .sql (53 files)
- .js (28 files)

## Entry Points
- [`src/lib/organizations/index.ts`](src/lib/organizations/index.ts)
- [`src/lib/later/index.ts`](src/lib/later/index.ts)
- [`src/components/plans/index.ts`](src/components/plans/index.ts)
- [`src/lib/posts/verification/index.ts`](src/lib/posts/verification/index.ts)
- [`src/lib/konva/filters/index.ts`](src/lib/konva/filters/index.ts)
- [`src/lib/konva/effects/index.ts`](src/lib/konva/effects/index.ts)
- [`src/components/canvas/effects/index.ts`](src/components/canvas/effects/index.ts)
- [`src/components/admin/plans/index.ts`](src/components/admin/plans/index.ts)
- [`prisma/generated/client/index.js`](prisma/generated/client/index.js)

## Key Exports
**Classes:**
- [`GoogleDriveService`](src/server/google-drive-service.ts#L70)
- [`RenderEngine`](src/lib/render-engine.ts#L28)
- [`RateLimitError`](src/lib/rate-limit.ts#L24)
- [`PermissionError`](src/lib/permissions.ts#L5)
- [`FontManager`](src/lib/font-manager.ts#L25)
- [`CanvasRenderer`](src/lib/canvas-renderer.ts#L11)
- [`ApiError`](src/lib/api-client.ts#L6)
- [`PostScheduler`](src/lib/posts/scheduler.ts#L37)
- [`PostExecutor`](src/lib/posts/executor.ts#L13)
- [`OrganizationAccessError`](src/lib/organizations/permissions.ts#L12)
- [`LaterApiError`](src/lib/later/errors.ts#L10)
- [`LaterRateLimitError`](src/lib/later/errors.ts#L64)
- [`LaterAuthError`](src/lib/later/errors.ts#L103)
- [`LaterAuthorizationError`](src/lib/later/errors.ts#L113)
- [`LaterNotFoundError`](src/lib/later/errors.ts#L123)
- [`LaterValidationError`](src/lib/later/errors.ts#L150)
- [`LaterNetworkError`](src/lib/later/errors.ts#L174)
- [`LaterMediaUploadError`](src/lib/later/errors.ts#L199)
- [`LaterClient`](src/lib/later/client.ts#L44)
- [`InstagramApiException`](src/lib/instagram/graph-api-client.ts#L40)
- [`InstagramGraphApiClient`](src/lib/instagram/graph-api-client.ts#L75)
- [`InsufficientCreditsError`](src/lib/credits/errors.ts#L1)
- [`StoryVerifier`](src/lib/posts/verification/story-verifier.ts#L49)
- [`StrokeEffect`](src/lib/konva/effects/StrokeEffect.ts#L9)
- [`ShadowEffect`](src/lib/konva/effects/ShadowEffect.ts#L9)
- [`EffectsManager`](src/lib/konva/effects/EffectsManager.ts#L14)
- [`CurvedTextEffect`](src/lib/konva/effects/CurvedTextEffect.ts#L9)
- [`BlurEffect`](src/lib/konva/effects/BlurEffect.ts#L9)
- [`BackgroundEffect`](src/lib/konva/effects/BackgroundEffect.ts#L9)
- [`Decimal`](prisma/generated/client/runtime/index-browser.d.ts#L44)

**Interfaces:**
- [`DesignData`](src/types/template.ts#L1)
- [`CanvasConfig`](src/types/template.ts#L7)
- [`Layer`](src/types/template.ts#L25)
- [`LayerStyle`](src/types/template.ts#L72)
- [`GradientStop`](src/types/template.ts#L114)
- [`ShadowStyle`](src/types/template.ts#L121)
- [`BorderStyle`](src/types/template.ts#L128)
- [`RichTextStyle`](src/types/template.ts#L138)
- [`TextboxConfig`](src/types/template.ts#L163)
- [`DynamicField`](src/types/template.ts#L188)
- [`Page`](src/types/template.ts#L205)
- [`MultiPageDesignData`](src/types/template.ts#L220)
- [`TextStyleSegment`](src/types/rich-text.ts#L16)
- [`RichTextEditorConfig`](src/types/rich-text.ts#L34)
- [`ParsedRichText`](src/types/rich-text.ts#L54)
- [`RichTextRenderOptions`](src/types/rich-text.ts#L67)
- [`TextLine`](src/types/rich-text.ts#L89)
- [`LineAlignment`](src/types/rich-text.ts#L99)
- [`LayoutResult`](src/types/rich-text.ts#L108)
- [`StyleMergeOptions`](src/types/rich-text.ts#L120)
- [`SelectionChangeEvent`](src/types/rich-text.ts#L134)
- [`StylePreset`](src/types/rich-text.ts#L145)
- [`HtmlToRichTextConfig`](src/types/rich-text.ts#L157)
- [`Prompt`](src/types/prompt.ts#L1)
- [`CreatePromptData`](src/types/prompt.ts#L14)
- [`UpdatePromptData`](src/types/prompt.ts#L22)
- [`PromptFilters`](src/types/prompt.ts#L30)
- [`GoogleDriveListRequest`](src/types/google-drive.ts#L3)
- [`GoogleDriveItem`](src/types/google-drive.ts#L10)
- [`GoogleDriveListResponse`](src/types/google-drive.ts#L27)
- [`GoogleDriveUploadResult`](src/types/google-drive.ts#L32)
- [`DriveProjectInfo`](src/types/drive.ts#L5)
- [`DriveListResponse`](src/types/drive.ts#L16)
- [`DriveDownloadFileMeta`](src/types/drive.ts#L25)
- [`DriveDownloadResponse`](src/types/drive.ts#L33)
- [`DriveBreadcrumbEntry`](src/types/drive.ts#L39)
- [`FileToDownload`](src/lib/zip-generator.ts#L6)
- [`TextPresetElement`](src/lib/text-presets.ts#L8)
- [`TextPreset`](src/lib/text-presets.ts#L31)
- [`FontValidationResult`](src/lib/render-engine.ts#L13)
- [`RenderOptions`](src/lib/render-engine.ts#L20)
- [`RateLimitResult`](src/lib/rate-limit.ts#L12)
- [`SnapConfig`](src/lib/konva-smart-guides.ts#L23)
- [`RectInfo`](src/lib/konva-smart-guides.ts#L46)
- [`GuideLine`](src/lib/konva-smart-guides.ts#L55)
- [`SnapEdge`](src/lib/konva-smart-guides.ts#L62)
- [`SnapResult`](src/lib/konva-smart-guides.ts#L71)
- [`AlignmentNode`](src/lib/konva-alignment.ts#L11)
- [`ImageSize`](src/lib/image-crop-utils.ts#L22)
- [`CropData`](src/lib/image-crop-utils.ts#L27)
- [`Template`](src/lib/generation-utils.ts#L7)
- [`Generation`](src/lib/generation-utils.ts#L15)
- [`RenderGenerationResult`](src/lib/generation-utils.ts#L26)
- [`CustomFont`](src/lib/font-manager.ts#L12)
- [`StartYoutubeDownloadInput`](src/hooks/use-youtube-download.ts#L4)
- [`YoutubeJobSummary`](src/hooks/use-youtube-download.ts#L13)
- [`YoutubeJobStatusResponse`](src/hooks/use-youtube-download.ts#L30)
- [`UsageData`](src/hooks/use-usage.ts#L6)
- [`UsageParams`](src/hooks/use-usage.ts#L23)
- [`UsageRecord`](src/hooks/use-usage-history.ts#L6)
- [`UsageHistoryParams`](src/hooks/use-usage-history.ts#L18)
- [`UsageHistoryResponse`](src/hooks/use-usage-history.ts#L26)
- [`ApplyPresetOptions`](src/hooks/use-text-presets.ts#L25)
- [`TemplateListItem`](src/hooks/use-templates.ts#L7)
- [`TemplateDetail`](src/hooks/use-templates.ts#L22)
- [`CreateTemplateData`](src/hooks/use-templates.ts#L37)
- [`TemplateDto`](src/hooks/use-template.ts#L7)
- [`CreativeFieldValues`](src/hooks/use-template-creatives.ts#L4)
- [`Creative`](src/hooks/use-template-creatives.ts#L13)
- [`SubscriptionStatus`](src/hooks/use-subscription.ts#L6)
- [`DashboardStats`](src/hooks/use-studio.ts#L6)
- [`StorageItem`](src/hooks/use-storage.ts#L6)
- [`StorageParams`](src/hooks/use-storage.ts#L17)
- [`StorageResponse`](src/hooks/use-storage.ts#L25)
- [`PublicPlan`](src/hooks/use-public-plans.ts#L6)
- [`ProjectShareInfo`](src/hooks/use-project.ts#L4)
- [`ProjectResponse`](src/hooks/use-project.ts#L11)
- [`ProjectWithLogoResponse`](src/hooks/use-project.ts#L40)
- [`PostAnalyticsItem`](src/hooks/use-project-analytics.ts#L9)
- [`ProjectAnalyticsSummary`](src/hooks/use-project-analytics.ts#L25)
- [`ProjectAnalyticsResponse`](src/hooks/use-project-analytics.ts#L37)
- [`ProjectAnalyticsParams`](src/hooks/use-project-analytics.ts#L46)
- [`PostAnalytics`](src/hooks/use-post-analytics.ts#L9)
- [`CreateOrgEntryInput`](src/hooks/use-org-knowledge.ts#L17)
- [`UploadOrgFileInput`](src/hooks/use-org-knowledge.ts#L27)
- [`UpdateOrgEntryInput`](src/hooks/use-org-knowledge.ts#L38)
- [`OpenRouterModel`](src/hooks/use-openrouter-models.ts#L6)
- [`OpenRouterModelsResponse`](src/hooks/use-openrouter-models.ts#L11)
- [`FaixaMusica`](src/hooks/use-music-library.ts#L6)
- [`FiltrosMusica`](src/hooks/use-music-library.ts#L24)
- [`CriarMusicaData`](src/hooks/use-music-library.ts#L33)
- [`AtualizarMusicaData`](src/hooks/use-music-library.ts#L43)
- [`LaterAccount`](src/hooks/use-later-accounts.ts#L9)
- [`InstagramDashboardData`](src/hooks/use-instagram-analytics.ts#L4)
- [`InstagramSettings`](src/hooks/use-instagram-analytics.ts#L34)
- [`InstagramSummary`](src/hooks/use-instagram-analytics.ts#L77)
- [`InstagramSummaryResponse`](src/hooks/use-instagram-analytics.ts#L96)
- [`DeviceInfo`](src/hooks/use-device-detection.ts#L16)
- [`CreditData`](src/hooks/use-credits.ts#L29)
- [`ChatMessage`](src/hooks/use-conversations.ts#L5)
- [`ChatConversation`](src/hooks/use-conversations.ts#L17)
- [`ConversationsResponse`](src/hooks/use-conversations.ts#L34)
- [`UploadProgress`](src/hooks/use-blob-upload.ts#L6)
- [`UseBlobUploadOptions`](src/hooks/use-blob-upload.ts#L12)
- [`UseBlobUploadResult`](src/hooks/use-blob-upload.ts#L18)
- [`AIProvider`](src/hooks/use-ai-providers.ts#L6)
- [`AIProvidersResponse`](src/hooks/use-ai-providers.ts#L13)
- [`GenerateImageParams`](src/hooks/use-ai-image.ts#L7)
- [`GenerateImageResponse`](src/hooks/use-ai-image.ts#L15)
- [`AdminSettings`](src/hooks/use-admin-settings.ts#L6)
- [`Plan`](src/hooks/use-admin-plans.ts#L7)
- [`PlansResponse`](src/hooks/use-admin-plans.ts#L34)
- [`ClerkPlansResponse`](src/hooks/use-admin-plans.ts#L38)
- [`InstagramPreset`](src/lib/templates/instagram-presets.ts#L1)
- [`CreateClientInviteRecordParams`](src/lib/services/client-invite-service.ts#L148)
- [`RegisteredFont`](src/lib/rendering/canvas-renderer.ts#L5)
- [`CanvasRendererOptions`](src/lib/rendering/canvas-renderer.ts#L10)
- [`CanvasRenderResult`](src/lib/rendering/canvas-renderer.ts#L17)
- [`ClerkOrganizationPayload`](src/lib/organizations/service.ts#L10)
- [`LaterAccount`](src/lib/later/types.ts#L9)
- [`LaterMediaUpload`](src/lib/later/types.ts#L37)
- [`InstagramPlatformData`](src/lib/later/types.ts#L63)
- [`PlatformSpecificData`](src/lib/later/types.ts#L80)
- [`LaterPost`](src/lib/later/types.ts#L88)
- [`CreateLaterPostPayload`](src/lib/later/types.ts#L109)
- [`UpdateLaterPostPayload`](src/lib/later/types.ts#L132)
- [`LaterListResponse`](src/lib/later/types.ts#L153)
- [`LaterErrorResponse`](src/lib/later/types.ts#L166)
- [`LaterWebhookPayload`](src/lib/later/types.ts#L186)
- [`MediaUploadOptions`](src/lib/later/types.ts#L204)
- [`RateLimitInfo`](src/lib/later/types.ts#L212)
- [`LaterClientConfig`](src/lib/later/types.ts#L222)
- [`LaterAnalyticsData`](src/lib/later/types.ts#L236)
- [`LaterRawAnalyticsPost`](src/lib/later/types.ts#L251)
- [`LaterAnalyticsResponse`](src/lib/later/types.ts#L281)
- [`LaterPostAnalytics`](src/lib/later/types.ts#L299)
- [`AnalyticsQueryParams`](src/lib/later/types.ts#L320)
- [`VectorMetadata`](src/lib/knowledge/vector-client.ts#L23)
- [`TrainingPreview`](src/lib/knowledge/training-pipeline.ts#L9)
- [`SearchResult`](src/lib/knowledge/search.ts#L12)
- [`IndexEntryInput`](src/lib/knowledge/indexer.ts#L12)
- [`IndexFileInput`](src/lib/knowledge/indexer.ts#L24)
- [`SimilarEntryMatch`](src/lib/knowledge/find-similar-entries.ts#L5)
- [`DisambiguationState`](src/lib/knowledge/disambiguation.ts#L9)
- [`Chunk`](src/lib/knowledge/chunking.ts#L14)
- [`Alert`](src/lib/instagram/types.ts#L14)
- [`InstagramStory`](src/lib/instagram/graph-api-client.ts#L1)
- [`InstagramStoryInsights`](src/lib/instagram/graph-api-client.ts#L10)
- [`ResizeOptions`](src/lib/images/client-resize.ts#L6)
- [`SubscriptionPlan`](src/lib/clerk/subscription-utils.ts#L4)
- [`ClerkPlanMoney`](src/lib/clerk/commerce-plan-types.ts#L1)
- [`ClerkPlanFeature`](src/lib/clerk/commerce-plan-types.ts#L8)
- [`ClerkPlanNormalized`](src/lib/clerk/commerce-plan-types.ts#L16)
- [`ShapeDefinition`](src/lib/assets/shapes-library.ts#L1)
- [`IconDefinition`](src/lib/assets/icon-library.ts#L1)
- [`GradientDefinition`](src/lib/assets/gradients-library.ts#L3)
- [`BackgroundPreset`](src/lib/assets/background-presets.ts#L3)
- [`BuildLayersResult`](src/lib/ai-creative-generator/template-page-builder.ts#L37)
- [`LayoutZone`](src/lib/ai-creative-generator/layout-types.ts#L10)
- [`LayoutTemplate`](src/lib/ai-creative-generator/layout-types.ts#L31)
- [`BrandAssets`](src/lib/ai-creative-generator/layout-types.ts#L39)
- [`TextsData`](src/lib/ai-creative-generator/layout-types.ts#L45)
- [`ImageSource`](src/lib/ai-creative-generator/layout-types.ts#L54)
- [`LayerBinding`](src/lib/ai-creative-generator/layout-types.ts#L66)
- [`AIImageModelConfig`](src/lib/ai/image-models-config.ts#L19)
- [`ClientProjectInviteSummary`](src/hooks/admin/use-client-projects.ts#L11)
- [`ClientProject`](src/hooks/admin/use-client-projects.ts#L24)
- [`ClientInviteSummaryUser`](src/hooks/admin/use-client-invites.ts#L14)
- [`ClientInviteSummaryProject`](src/hooks/admin/use-client-invites.ts#L20)
- [`ClientInvite`](src/hooks/admin/use-client-invites.ts#L25)
- [`User`](src/hooks/admin/use-admin-users.ts#L7)
- [`UsersResponse`](src/hooks/admin/use-admin-users.ts#L22)
- [`UsersParams`](src/hooks/admin/use-admin-users.ts#L32)
- [`SiteSettings`](src/hooks/admin/use-admin-site-settings.ts#L4)
- [`UpdateSiteSettingsData`](src/hooks/admin/use-admin-site-settings.ts#L32)
- [`KnowledgeBaseEntry`](src/hooks/admin/use-admin-knowledge.ts#L10)
- [`KnowledgeChunk`](src/hooks/admin/use-admin-knowledge.ts#L30)
- [`KnowledgeEntryWithChunks`](src/hooks/admin/use-admin-knowledge.ts#L41)
- [`KnowledgeListResponse`](src/hooks/admin/use-admin-knowledge.ts#L45)
- [`CreateEntryInput`](src/hooks/admin/use-admin-knowledge.ts#L55)
- [`UploadFileInput`](src/hooks/admin/use-admin-knowledge.ts#L65)
- [`UpdateEntryInput`](src/hooks/admin/use-admin-knowledge.ts#L76)
- [`ListEntriesParams`](src/hooks/admin/use-admin-knowledge.ts#L85)
- [`Invitation`](src/hooks/admin/use-admin-invitations.ts#L7)
- [`InvitationsResponse`](src/hooks/admin/use-admin-invitations.ts#L16)
- [`CreditBalance`](src/hooks/admin/use-admin-credits.ts#L7)
- [`CreditsResponse`](src/hooks/admin/use-admin-credits.ts#L21)
- [`CreditsParams`](src/hooks/admin/use-admin-credits.ts#L31)
- [`VerificationSummary`](src/lib/posts/verification/types.ts#L16)
- [`SocialPostWithProject`](src/lib/posts/verification/types.ts#L24)
- [`BlurEffectConfig`](src/lib/konva/effects/types.ts#L5)
- [`StrokeEffectConfig`](src/lib/konva/effects/types.ts#L10)
- [`ShadowEffectConfig`](src/lib/konva/effects/types.ts#L16)
- [`BackgroundEffectConfig`](src/lib/konva/effects/types.ts#L25)
- [`CurvedTextEffectConfig`](src/lib/konva/effects/types.ts#L31)
- [`TextEffectsConfig`](src/lib/konva/effects/types.ts#L36)
- [`Config`](prisma/generated/client/runtime/index-browser.d.ts#L31)
- [`BreadcrumbItem`](src/contexts/page-metadata.tsx#L5)
- [`PageMetadata`](src/contexts/page-metadata.tsx#L10)
- [`ZoomControlsProps`](src/components/templates/zoom-controls.tsx#L31)
- [`FeatureUsageListProps`](src/components/organization/feature-usage-list.tsx#L24)
- [`CreditUsageCardProps`](src/components/organization/credit-usage-card.tsx#L16)
- [`CreditActivityFeedProps`](src/components/organization/credit-activity-feed.tsx#L20)
- [`AnalyticsSummaryCardsProps`](src/components/organization/analytics-summary-cards.tsx#L32)
- [`MusicStemProgressProps`](src/components/audio/music-stem-progress.tsx#L8)
- [`AudioConfig`](src/components/audio/audio-selection-modal.tsx#L35)
- [`Step`](src/components/ai-creative-generator/stepper.tsx#L6)

## File Structure & Code Organization
- `ADMIN_SETUP.md/` — TODO: Describe the purpose of this directory.
- `agents/` — AI agent playbooks and prompts.
- `AGENTS.md/` — TODO: Describe the purpose of this directory.
- `ANALISE_SISTEMA_POSTAGEM.md/` — TODO: Describe the purpose of this directory.
- `BACKUP_COMPLETE.md/` — TODO: Describe the purpose of this directory.
- `BACKUP_SECURITY.md/` — TODO: Describe the purpose of this directory.
- `backups/` — TODO: Describe the purpose of this directory.
- `BOOST_SPACE_CONFIG_GUIDE.md/` — TODO: Describe the purpose of this directory.
- `check-entry-details.js/` — TODO: Describe the purpose of this directory.
- `check-instagram-setup.ts/` — TODO: Describe the purpose of this directory.
- `check-migration-status.sql/` — TODO: Describe the purpose of this directory.
- `check-status.js/` — TODO: Describe the purpose of this directory.
- `CLAUDE.md/` — TODO: Describe the purpose of this directory.
- `CLOUDFLARE_SETUP.md/` — TODO: Describe the purpose of this directory.
- `COMO_GERAR_TOKEN_INSTAGRAM.md/` — TODO: Describe the purpose of this directory.
- `COMO-ALTERAR-LOGO.md/` — TODO: Describe the purpose of this directory.
- `components.json/` — TODO: Describe the purpose of this directory.
- `configure-reminder-webhook.js/` — TODO: Describe the purpose of this directory.
- `CONTEXT_FOR_NEXT_SESSION.md/` — TODO: Describe the purpose of this directory.
- `create-test-reminder.js/` — TODO: Describe the purpose of this directory.
- `CURVED_TEXT_GUIDE.md/` — TODO: Describe the purpose of this directory.
- `DASHBOARD_INTEGRATION_COMPLETE.md/` — TODO: Describe the purpose of this directory.
- `DEPLOY_COMMANDS.sh/` — TODO: Describe the purpose of this directory.
- `DEPLOY-CHECKLIST.md/` — TODO: Describe the purpose of this directory.
- `DEPLOY-DATABASE-MIGRATION.md/` — TODO: Describe the purpose of this directory.
- `DEPLOY-GUIDE.md/` — TODO: Describe the purpose of this directory.
- `DEPLOY-QUICKSTART.md/` — TODO: Describe the purpose of this directory.
- `docs/` — Living documentation produced by this tool.
- `DOMAIN_SETUP.md/` — TODO: Describe the purpose of this directory.
- `EFFECTS_SYSTEM.md/` — TODO: Describe the purpose of this directory.
- `EFFECTS_TROUBLESHOOTING.md/` — TODO: Describe the purpose of this directory.
- `ENV_VARIABLES.md/` — TODO: Describe the purpose of this directory.
- `eslint.config.mjs/` — TODO: Describe the purpose of this directory.
- `EXPORT_FIX_V2.md/` — TODO: Describe the purpose of this directory.
- `EXPORT_FIX.md/` — TODO: Describe the purpose of this directory.
- `FASE-6-COMPLETA.md/` — TODO: Describe the purpose of this directory.
- `FFMPEG_VERCEL_SETUP.md/` — TODO: Describe the purpose of this directory.
- `FINAL_SOLUTION.md/` — TODO: Describe the purpose of this directory.
- `FINAL_TEXT_IMPLEMENTATION.md/` — TODO: Describe the purpose of this directory.
- `FIX_AGENDAMENTO_ERROR_500.md/` — TODO: Describe the purpose of this directory.
- `FIX_PROCESSING_STARTED_AT_FIELD.md/` — TODO: Describe the purpose of this directory.
- `FIX_YOUTUBE_DOWNLOAD_404.md/` — TODO: Describe the purpose of this directory.
- `GERAR_TOKEN_AGORA.md/` — TODO: Describe the purpose of this directory.
- `GUIA_RAPIDO_DEPLOY.md/` — TODO: Describe the purpose of this directory.
- `GUIA-COMPONENTES-CMS.md/` — TODO: Describe the purpose of this directory.
- `GUIA-CONFIGURACOES-SITE.md/` — TODO: Describe the purpose of this directory.
- `GUIA-DE-TESTES.md/` — TODO: Describe the purpose of this directory.
- `HANDOFF_REPORT_MIGRATIONS.md/` — TODO: Describe the purpose of this directory.
- `implementation_plan.md/` — TODO: Describe the purpose of this directory.
- `INSTAGRAM_ANALYTICS_IMPLEMENTATION.md/` — TODO: Describe the purpose of this directory.
- `LATE_API_IMPROVEMENTS.md/` — TODO: Describe the purpose of this directory.
- `LATER_ANALYTICS_IMPLEMENTATION.md/` — TODO: Describe the purpose of this directory.
- `LAYERS_PANEL_OPTIMIZATION.md/` — TODO: Describe the purpose of this directory.
- `migrate-enum-final.sql/` — TODO: Describe the purpose of this directory.
- `migrate-enum-step1.sql/` — TODO: Describe the purpose of this directory.
- `migrate-enum-step2.sql/` — TODO: Describe the purpose of this directory.
- `migrate-post-status.sql/` — TODO: Describe the purpose of this directory.
- `MIGRATION_APPLY_INSTRUCTIONS.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_CHECKLIST.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_COMPLETION_REPORT.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_DOCS_INDEX.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_FIX_REPORT.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_FIX_SUMMARY.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_GUIDE.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_NORMALIZATION.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_PRODUCTION_GUIDE.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION_SUMMARY.md/` — TODO: Describe the purpose of this directory.
- `MIGRATION-SUMMARY.md/` — TODO: Describe the purpose of this directory.
- `MIGRATIONS_README.md/` — TODO: Describe the purpose of this directory.
- `MOBILE_EDITOR_IMPLEMENTATION.md/` — TODO: Describe the purpose of this directory.
- `MOBILE_IMPROVEMENTS_SUMMARY.md/` — TODO: Describe the purpose of this directory.
- `MOBILE_OVERFLOW_FIX.md/` — TODO: Describe the purpose of this directory.
- `MOBILE_UI_FIXES.md/` — TODO: Describe the purpose of this directory.
- `MOBILE_UX_FIX_GUIDE.md/` — TODO: Describe the purpose of this directory.
- `MOCK-DESENVOLVIMENTO.md/` — TODO: Describe the purpose of this directory.
- `monitor-reminders.js/` — TODO: Describe the purpose of this directory.
- `N8N_REMINDER_SETUP.md/` — TODO: Describe the purpose of this directory.
- `next-env.d.ts/` — TODO: Describe the purpose of this directory.
- `next.config.ts/` — TODO: Describe the purpose of this directory.
- `package-lock.json/` — TODO: Describe the purpose of this directory.
- `package.json/` — TODO: Describe the purpose of this directory.
- `PERFORMANCE_OPTIMIZATIONS.md/` — TODO: Describe the purpose of this directory.
- `PHASE_2_IMPLEMENTATION_STATUS.md/` — TODO: Describe the purpose of this directory.
- `playwright.config.ts/` — TODO: Describe the purpose of this directory.
- `postcss.config.mjs/` — TODO: Describe the purpose of this directory.
- `POSTING_SCHEDULING_ANALYSIS.md/` — TODO: Describe the purpose of this directory.
- `prevc-template.md/` — TODO: Describe the purpose of this directory.
- `prisma/` — TODO: Describe the purpose of this directory.
- `PRODUCTION_CHECKLIST.md/` — TODO: Describe the purpose of this directory.
- `PRODUCTION-ENV.md/` — TODO: Describe the purpose of this directory.
- `PROGRESSO-BIBLIOTECA-MUSICAS.md/` — TODO: Describe the purpose of this directory.
- `prompt/` — TODO: Describe the purpose of this directory.
- `PROMPT_FOR_NEXT_CONVERSATION.md/` — TODO: Describe the purpose of this directory.
- `prompts/` — TODO: Describe the purpose of this directory.
- `public/` — TODO: Describe the purpose of this directory.
- `QUICK_HANDOFF.md/` — TODO: Describe the purpose of this directory.
- `QUICK_START_LATER.md/` — TODO: Describe the purpose of this directory.
- `QUICKSTART-BLOB.md/` — TODO: Describe the purpose of this directory.
- `README_SIMPLIFICATION.md/` — TODO: Describe the purpose of this directory.
- `README-DEPLOY.md/` — TODO: Describe the purpose of this directory.
- `README.md/` — TODO: Describe the purpose of this directory.
- `SAFARI_FIX_GUIDE.md/` — TODO: Describe the purpose of this directory.
- `scripts/` — TODO: Describe the purpose of this directory.
- `SETUP_AI_IMAGES.md/` — TODO: Describe the purpose of this directory.
- `SETUP-BLOB.md/` — TODO: Describe the purpose of this directory.
- `SIMPLIFICATION_SUMMARY.md/` — TODO: Describe the purpose of this directory.
- `SMART_GUIDES.md/` — TODO: Describe the purpose of this directory.
- `src/` — TypeScript source files and CLI entrypoints.
- `STORY_INSIGHTS_SETUP.md/` — TODO: Describe the purpose of this directory.
- `tailwind.config.ts/` — TODO: Describe the purpose of this directory.
- `TEMPORARY_FIX_OPTION.md/` — TODO: Describe the purpose of this directory.
- `TEMPORARY_FIX_PROCESSING_STARTED_AT.md/` — TODO: Describe the purpose of this directory.
- `test-credit-deduction.js/` — TODO: Describe the purpose of this directory.
- `test-update-reminder.js/` — TODO: Describe the purpose of this directory.
- `test-webhook-failure.sh/` — TODO: Describe the purpose of this directory.
- `test-webhook-local.sh/` — TODO: Describe the purpose of this directory.
- `test-webhook-simplified.sh/` — TODO: Describe the purpose of this directory.
- `TESTING_LATER.md/` — TODO: Describe the purpose of this directory.
- `tests/` — Automated tests and fixtures.
- `TEXT_BEHAVIOR_CHANGES.md/` — TODO: Describe the purpose of this directory.
- `TEXT_REFACTOR.md/` — TODO: Describe the purpose of this directory.
- `TOKEN_CONFIGURADO.md/` — TODO: Describe the purpose of this directory.
- `TROUBLESHOOTING.md/` — TODO: Describe the purpose of this directory.
- `tsconfig.json/` — TODO: Describe the purpose of this directory.
- `tsconfig.tsbuildinfo/` — TODO: Describe the purpose of this directory.
- `URGENT_DATABASE_CHECK.md/` — TODO: Describe the purpose of this directory.
- `VERCEL_AI_IMAGE_DEBUG.md/` — TODO: Describe the purpose of this directory.
- `VERCEL_VIDEO_SETUP.md/` — TODO: Describe the purpose of this directory.
- `VERCEL-DEPLOY.md/` — TODO: Describe the purpose of this directory.
- `vercel.json/` — TODO: Describe the purpose of this directory.
- `VIDEO_PROCESSING_QUEUE.md/` — TODO: Describe the purpose of this directory.
- `WEBHOOK_DEBUG_GUIDE.md/` — TODO: Describe the purpose of this directory.
- `ZAPIER_BUFFER_CONFIG.md/` — TODO: Describe the purpose of this directory.
- `ZAPIER_COPILOT_PROMPT.md/` — TODO: Describe the purpose of this directory.
- `ZAPIER_FINAL_MAPPING_V2.md/` — TODO: Describe the purpose of this directory.
- `ZAPIER_FINAL_MAPPING.md/` — TODO: Describe the purpose of this directory.
- `ZAPIER_QUICK_SETUP.md/` — TODO: Describe the purpose of this directory.
- `ZAPIER_SETUP_SIMPLIFIED.md/` — TODO: Describe the purpose of this directory.

## Technology Stack Summary

Outline primary runtimes, languages, and platforms in use. Note build tooling, linting, and formatting infrastructure the team relies on.

## Core Framework Stack

Document core frameworks per layer (backend, frontend, data, messaging). Mention architectural patterns enforced by these frameworks.

## UI & Interaction Libraries

List UI kits, CLI interaction helpers, or design system dependencies. Note theming, accessibility, or localization considerations contributors must follow.

## Development Tools Overview

Highlight essential CLIs, scripts, or developer environments. Link to [Tooling & Productivity Guide](./tooling.md) for deeper setup instructions.

## Getting Started Checklist

1. Install dependencies with `npm install`.
2. Explore the CLI by running `npm run dev`.
3. Review [Development Workflow](./development-workflow.md) for day-to-day tasks.

## Next Steps

Capture product positioning, key stakeholders, and links to external documentation or product specs here.
