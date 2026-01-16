---
status: unfilled
generated: 2026-01-15
---

# Architecture Notes

Describe how the system is assembled and why the current design exists.

## System Architecture Overview

Summarize the top-level topology (monolith, modular service, microservices) and deployment model. Highlight how requests traverse the system and where control pivots between layers.

## Architectural Layers
### Config
Configuration and constants
- **Directories**: `.`, `scripts`, `prisma`, `tests/e2e`, `src/hooks`, `scripts/later`, `src/hooks/admin`
- **Symbols**: 19 total, 12 exported → depends on: Components
- **Key exports**:
  - [`useSiteConfig`](src/hooks/use-site-config.ts#L22) (function)
  - [`AdminSettings`](src/hooks/use-admin-settings.ts#L6) (interface)
  - [`useAdminSettings`](src/hooks/use-admin-settings.ts#L11) (function)
  - [`useUpdateAdminSettings`](src/hooks/use-admin-settings.ts#L20) (function)
  - [`useUploadFile`](src/hooks/admin/use-site-settings.ts#L14) (function)
  - [`useSiteSettings`](src/hooks/admin/use-site-settings.ts#L39) (function)
  - [`useUpdateSiteSettings`](src/hooks/admin/use-site-settings.ts#L50) (function)
  - [`SiteSettings`](src/hooks/admin/use-admin-site-settings.ts#L4) (interface)
  - [`UpdateSiteSettingsData`](src/hooks/admin/use-admin-site-settings.ts#L32) (interface)
  - [`useSiteSettings`](src/hooks/admin/use-admin-site-settings.ts#L58) (function)
  - [`useUpdateSiteSettings`](src/hooks/admin/use-admin-site-settings.ts#L70) (function)
  - [`useUploadFile`](src/hooks/admin/use-admin-site-settings.ts#L85) (function)

### Components
UI components and views
- **Directories**: `scripts`, `prisma`, `src/hooks`, `src/hooks/admin`, `src/components/plans`, `src/components/canvas/effects`, `src/components/admin/plans`, `src/contexts`, `src/app`, `src/components`, `src/app/subscribe`, `src/app/admin`, `src/components/youtube`, `src/components/verification`, `src/components/ui`, `src/components/templates`, `src/components/template`, `src/components/sales`, `src/components/providers`, `src/components/prompts`, `src/components/projects`, `src/components/posts`, `src/components/organizations`, `src/components/organization`, `src/components/navigation`, `src/components/music`, `src/components/members`, `src/components/marketing`, `src/components/instagram`, `src/components/filters`, `src/components/credits`, `src/components/cms`, `src/components/chat`, `src/components/charts`, `src/components/calendar`, `src/components/billing`, `src/components/audio`, `src/components/app`, `src/components/analytics`, `src/components/admin`, `src/app/admin/users`, `src/app/admin/usage`, `src/app/admin/storage`, `src/app/admin/site-settings`, `src/app/admin/settings`, `src/app/admin/knowledge`, `src/app/admin/credits`, `src/app/admin/clients`, `src/app/admin/client-projects`, `src/app/(public)/privacy-policy`, `src/app/(public)/google-drive-callback`, `src/app/(public)/[...slug]`, `src/app/(protected)/studio`, `src/app/(protected)/prompts`, `src/app/(protected)/projects`, `src/app/(protected)/organization`, `src/app/(protected)/knowledge`, `src/app/(protected)/drive`, `src/app/(protected)/billing`, `src/app/(protected)/biblioteca-musicas`, `src/app/(protected)/ai-chat`, `src/app/(protected)/agenda`, `src/components/templates/sidebar`, `src/components/templates/presets`, `src/components/templates/panels`, `src/components/templates/modals`, `src/components/templates/layers`, `src/components/cms/sections`, `src/components/agenda/post-actions`, `src/components/agenda/mobile`, `src/components/agenda/channels-sidebar`, `src/components/agenda/calendar`, `src/components/admin/knowledge`, `src/components/admin/feature-grid`, `src/components/admin/cms`, `src/app/admin/settings/site`, `src/app/admin/settings/plans`, `src/app/admin/settings/features`, `src/app/admin/knowledge/new`, `src/app/admin/knowledge/migrate`, `src/app/admin/knowledge/[id]`, `src/app/admin/content/pages`, `src/app/admin/content/menus`, `src/app/admin/content/media`, `src/app/admin/content/feature-grid`, `src/app/admin/content/components`, `src/app/admin/clients/_components`, `src/app/admin/client-projects/_components`, `src/app/admin/client-projects/[projectId]`, `src/app/(public)/sign-up/[[...sign-up]]`, `src/app/(public)/sign-in/[[...sign-in]]`, `src/app/(protected)/projects/[id]`, `src/app/(protected)/organization/[orgId]`, `src/app/(protected)/knowledge/[id]`, `src/app/(protected)/drive/_components`, `src/app/(protected)/biblioteca-musicas/enviar`, `src/components/admin/cms/editors`, `src/app/admin/knowledge/[id]/edit`, `src/app/admin/content/pages/[id]`, `src/app/admin/content/menus/[id]`, `src/app/admin/content/components/[id]`, `src/app/(protected)/templates/[id]/editor`, `src/app/(protected)/projects/[id]/instagram`, `src/app/(protected)/projects/[id]/creativos`, `src/app/(protected)/projects/[id]/analytics`, `src/app/(protected)/organization/[orgId]/projects`, `src/app/(protected)/organization/[orgId]/credits`, `src/app/(protected)/organization/[orgId]/analytics`, `src/app/(protected)/knowledge/[id]/edit`, `src/app/(protected)/biblioteca-musicas/[id]/editar`, `src/app/(protected)/organization/[orgId]/members/[[...rest]]`
- **Symbols**: 529 total, 128 exported → depends on: Utils
- **Key exports**:
  - [`useTemplatePages`](src/hooks/use-template-pages.ts#L24) (function)
  - [`usePages`](src/hooks/use-pages.ts#L41) (function)
  - [`usePage`](src/hooks/use-pages.ts#L54) (function)
  - [`useCreatePage`](src/hooks/use-pages.ts#L65) (function)
  - [`useUpdatePage`](src/hooks/use-pages.ts#L82) (function)
  - [`useDeletePage`](src/hooks/use-pages.ts#L115) (function)
  - [`useDuplicatePage`](src/hooks/use-pages.ts#L182) (function)
  - [`useReorderPages`](src/hooks/use-pages.ts#L197) (function)
  - [`usePageConfig`](src/hooks/use-page-config.ts#L26) (function)
  - [`useIsCreativePage`](src/hooks/use-is-creative-page.ts#L10) (function)
  - [`CMSComponent`](src/hooks/admin/use-admin-components.ts#L8) (type)
  - [`CreateComponentInput`](src/hooks/admin/use-admin-components.ts#L22) (type)
  - [`UpdateComponentInput`](src/hooks/admin/use-admin-components.ts#L32) (type)
  - [`useAdminComponents`](src/hooks/admin/use-admin-components.ts#L49) (function)
  - [`useAdminComponent`](src/hooks/admin/use-admin-components.ts#L63) (function)
  - [`useCreateComponent`](src/hooks/admin/use-admin-components.ts#L75) (function)
  - [`useUpdateComponent`](src/hooks/admin/use-admin-components.ts#L90) (function)
  - [`useDeleteComponent`](src/hooks/admin/use-admin-components.ts#L106) (function)
  - [`useGlobalComponents`](src/hooks/admin/use-admin-components.ts#L120) (function)
  - [`PlanFeatureDisplay`](src/components/plans/plan-types.ts#L1) (type)
  - [`PlanDisplay`](src/components/plans/plan-types.ts#L7) (type)
  - [`BillingPlan`](src/components/admin/plans/types.ts#L4) (type)
  - [`PlanFeatureForm`](src/components/admin/plans/types.ts#L31) (type)
  - [`SyncPreview`](src/components/admin/plans/types.ts#L38) (type)
  - [`MultiPageProvider`](src/contexts/multi-page-context.tsx#L26) (function)
  - [`HomePage`](src/app/page.tsx#L16) (function)
  - [`ThemeToggle`](src/components/theme-toggle.tsx#L14) (function)
  - [`ThemeProvider`](src/components/theme-provider.tsx#L27) (function)
  - [`SubscribePage`](src/app/subscribe/page.tsx#L12) (function)
  - [`TextareaProps`](src/components/ui/textarea.tsx#L5) (type)
  - [`DropdownTriggerButton`](src/components/ui/dropdown-trigger-button.tsx#L11) (function)
  - [`AutocompleteItem`](src/components/ui/autocomplete.tsx#L10) (type)
  - [`ZoomControlsProps`](src/components/templates/zoom-controls.tsx#L31) (interface)
  - [`TemplateEditorClient`](src/components/templates/template-editor-client.tsx#L17) (function)
  - [`PageSyncWrapper`](src/components/templates/page-sync-wrapper.tsx#L13) (function)
  - [`MobileToolsDrawer`](src/components/templates/mobile-tools-drawer.tsx#L32) (function)
  - [`MobileToolsDrawerCompact`](src/components/templates/mobile-tools-drawer.tsx#L87) (function)
  - [`ImageToolbar`](src/components/templates/image-toolbar.tsx#L22) (function)
  - [`FloatingToolbarButton`](src/components/templates/floating-toolbar-button.tsx#L27) (function)
  - [`EditorCanvas`](src/components/templates/editor-canvas.tsx#L26) (function)
  - [`CreativesLightbox`](src/components/templates/creatives-lightbox.tsx#L15) (function)
  - [`CanvasPreview`](src/components/templates/canvas-preview.tsx#L17) (function)
  - [`ToggleTemplateButton`](src/components/template/toggle-template-button.tsx#L15) (function)
  - [`ValuePropSection`](src/components/sales/ValuePropSection.tsx#L6) (function)
  - [`SalesPage`](src/components/sales/SalesPage.tsx#L16) (function)
  - [`SalesFooter`](src/components/sales/SalesFooter.tsx#L7) (function)
  - [`ObjectionsSection`](src/components/sales/ObjectionsSection.tsx#L30) (function)
  - [`QueryProvider`](src/components/providers/query-provider.tsx#L7) (function)
  - [`ProjectShare`](src/components/projects/project-share-controls.tsx#L29) (type)
  - [`RecurringConfigValue`](src/components/posts/post-composer.tsx#L18) (type)
  - [`PostFormData`](src/components/posts/post-composer.tsx#L50) (type)
  - [`PlanFeature`](src/components/plans/plan-tier-config.tsx#L5) (type)
  - [`PlanCta`](src/components/plans/plan-tier-config.tsx#L11) (type)
  - [`PlanTierView`](src/components/plans/plan-tier-config.tsx#L17) (type)
  - [`buildPlanTiers`](src/components/plans/plan-tier-config.tsx#L91) (function)
  - [`CTAAction`](src/components/plans/cta-button.tsx#L5) (type)
  - [`MemberAnalyticsRow`](src/components/organization/member-analytics-table.tsx#L10) (type)
  - [`FeatureUsageListProps`](src/components/organization/feature-usage-list.tsx#L24) (interface)
  - [`UsagePoint`](src/components/organization/credit-usage-card.tsx#L9) (type)
  - [`CreditUsageCardProps`](src/components/organization/credit-usage-card.tsx#L16) (interface)
  - [`CreditActivityEntry`](src/components/organization/credit-activity-feed.tsx#L9) (type)
  - [`CreditActivityFeedProps`](src/components/organization/credit-activity-feed.tsx#L20) (interface)
  - [`AnalyticsSummaryCardsProps`](src/components/organization/analytics-summary-cards.tsx#L32) (interface)
  - [`MemberAvatar`](src/components/members/member-avatar.tsx#L15) (function)
  - [`Features`](src/components/marketing/features.tsx#L36) (function)
  - [`AIStarter`](src/components/marketing/ai-starter.tsx#L6) (function)
  - [`WeeklySummaryCard`](src/components/instagram/weekly-summary-card.tsx#L28) (function)
  - [`CMSSectionRenderer`](src/components/cms/cms-section-renderer.tsx#L23) (function)
  - [`MultipleMatchesCard`](src/components/chat/multiple-matches-card.tsx#L35) (function)
  - [`ChatMessage`](src/components/chat/message-bubble.tsx#L13) (type)
  - [`ChatEmptyState`](src/components/chat/chat-empty-state.tsx#L45) (function)
  - [`MonthOverview`](src/components/calendar/month-overview.tsx#L17) (function)
  - [`MusicStemProgressProps`](src/components/audio/music-stem-progress.tsx#L8) (interface)
  - [`AudioWaveformTimeline`](src/components/audio/audio-waveform-timeline.tsx#L22) (function)
  - [`AudioVersion`](src/components/audio/audio-selection-modal.tsx#L33) (type)
  - [`AudioConfig`](src/components/audio/audio-selection-modal.tsx#L35) (interface)
  - [`CookieConsent`](src/components/app/cookie-consent.tsx#L21) (function)
  - [`AppShell`](src/components/app/app-shell.tsx#L10) (function)
  - [`AnalyticsOverviewCards`](src/components/analytics/analytics-overview-cards.tsx#L18) (function)
  - [`AnalyticsExport`](src/components/analytics/analytics-export.tsx#L21) (function)
  - [`AdminTopbar`](src/components/admin/admin-topbar.tsx#L8) (function)
  - [`AdminSidebar`](src/components/admin/admin-sidebar.tsx#L90) (function)
  - [`AdminSettingsPage`](src/app/admin/settings/page.tsx#L8) (function)
  - [`PrivacyPolicyPage`](src/app/(public)/privacy-policy/page.tsx#L8) (function)
  - [`DriveRoutePage`](src/app/(protected)/drive/page.tsx#L3) (function)
  - [`AgendaPage`](src/app/(protected)/agenda/page.tsx#L7) (function)
  - [`ShapesPanel`](src/components/templates/sidebar/shapes-panel.tsx#L8) (function)
  - [`IconsPanel`](src/components/templates/sidebar/icons-panel.tsx#L8) (function)
  - [`GradientsPanel`](src/components/templates/sidebar/gradients-panel.tsx#L13) (function)
  - [`EditorSidebar`](src/components/templates/sidebar/editor-sidebar.tsx#L13) (function)
  - [`BackgroundsPanel`](src/components/templates/sidebar/backgrounds-panel.tsx#L9) (function)
  - [`TextToolsPanel`](src/components/templates/panels/text-panel.tsx#L10) (function)
  - [`SimpleTextPanel`](src/components/templates/panels/simple-text-panel.tsx#L9) (function)
  - [`getLayerIcon`](src/components/templates/layers/layer-icons.tsx#L27) (function)
  - [`getLayerTypeName`](src/components/templates/layers/layer-icons.tsx#L31) (function)
  - [`CMSCustom`](src/components/cms/sections/cms-custom.tsx#L11) (function)
  - [`EffectsPanel`](src/components/canvas/effects/EffectsPanel.tsx#L41) (function)
  - [`DraggablePost`](src/components/agenda/calendar/draggable-post.tsx#L12) (function)
  - [`AgendaCalendarView`](src/components/agenda/calendar/agenda-calendar-view.tsx#L68) (function)
  - [`PlanSummaryCards`](src/components/admin/plans/plan-summary-cards.tsx#L8) (function)
  - [`PlanEmptyState`](src/components/admin/plans/plan-empty-state.tsx#L3) (function)
  - [`KnowledgeForm`](src/components/admin/knowledge/knowledge-form.tsx#L78) (function)
  - [`SectionPreview`](src/components/admin/cms/section-preview.tsx#L10) (function)
  - [`ResponsivePreview`](src/components/admin/cms/responsive-preview.tsx#L20) (function)
  - [`PageEditor`](src/components/admin/cms/page-editor.tsx#L17) (function)
  - [`SiteSettingsPage`](src/app/admin/settings/site/page.tsx#L16) (function)
  - [`FeatureCostsPage`](src/app/admin/settings/features/page.tsx#L13) (function)
  - [`AdminPagesPage`](src/app/admin/content/pages/page.tsx#L18) (function)
  - [`InviteStatusBadge`](src/app/admin/clients/_components/invite-status-badge.tsx#L17) (function)
  - [`InviteDetailsDialog`](src/app/admin/clients/_components/invite-details-dialog.tsx#L34) (function)
  - [`ClientStatsCards`](src/app/admin/clients/_components/client-stats-cards.tsx#L28) (function)
  - [`ProjectStatsCards`](src/app/admin/client-projects/_components/project-stats-cards.tsx#L14) (function)
  - [`ClientProjectDetailsPage`](src/app/admin/client-projects/[projectId]/page.tsx#L17) (function)
  - [`NextStep`](src/app/(protected)/organization/[orgId]/page.tsx#L237) (function)
  - [`getWeekStart`](src/app/(protected)/organization/[orgId]/page.tsx#L254) (function)
  - [`buildCreditsInsights`](src/app/(protected)/organization/[orgId]/page.tsx#L263) (function)
  - [`DriveFolderToggle`](src/app/(protected)/drive/_components/drive-folder-toggle.tsx#L13) (function)
  - [`DriveDropZone`](src/app/(protected)/drive/_components/drive-drop-zone.tsx#L16) (function)
  - [`PricingEditor`](src/components/admin/cms/editors/pricing-editor.tsx#L12) (function)
  - [`CTAEditor`](src/components/admin/cms/editors/cta-editor.tsx#L12) (function)
  - [`BentoGridEditor`](src/components/admin/cms/editors/bento-grid-editor.tsx#L15) (function)
  - [`AIStarterEditor`](src/components/admin/cms/editors/ai-starter-editor.tsx#L12) (function)
  - [`EditKnowledgeEntryPage`](src/app/admin/knowledge/[id]/edit/page.tsx#L25) (function)
  - [`MenuEditPage`](src/app/admin/content/menus/[id]/page.tsx#L10) (function)
  - [`TemplateEditorPage`](src/app/(protected)/templates/[id]/editor/page.tsx#L12) (function)
  - [`ProjectAnalyticsPage`](src/app/(protected)/projects/[id]/analytics/page.tsx#L16) (function)
  - [`KnowledgeEditPage`](src/app/(protected)/knowledge/[id]/edit/page.tsx#L28) (function)
  - [`OrganizationMembersPage`](src/app/(protected)/organization/[orgId]/members/[[...rest]]/page.tsx#L9) (function)

### Repositories
Data access and persistence
- **Directories**: `scripts`, `src/lib/knowledge`, `src/contexts`, `src/components/ui`
- **Symbols**: 11 total, 7 exported → depends on: Components
- **Key exports**:
  - [`ExtractedKnowledgeData`](src/lib/knowledge/extract-knowledge-data.ts#L13) (type)
  - [`extractKnowledgeData`](src/lib/knowledge/extract-knowledge-data.ts#L30) (function)
  - [`BreadcrumbItem`](src/contexts/page-metadata.tsx#L5) (interface)
  - [`PageMetadata`](src/contexts/page-metadata.tsx#L10) (interface)
  - [`PageMetadataProvider`](src/contexts/page-metadata.tsx#L25) (function)
  - [`usePageMetadata`](src/contexts/page-metadata.tsx#L45) (function)
  - [`useSetPageMetadata`](src/contexts/page-metadata.tsx#L54) (function)

### Services
Business logic and orchestration
- **Directories**: `src/server`, `src/lib/services`, `src/lib/organizations`, `src/app/(public)/terms-of-service`
- **Symbols**: 44 total, 26 exported → depends on: Components, Controllers
- **Key exports**:
  - [`GoogleDriveService`](src/server/google-drive-service.ts#L70) (class)
  - [`ClientProjectWithRelations`](src/lib/services/client-project-service.ts#L22) (type)
  - [`listClientProjects`](src/lib/services/client-project-service.ts#L26) (function)
  - [`getClientProjectById`](src/lib/services/client-project-service.ts#L52) (function)
  - [`updateClientProject`](src/lib/services/client-project-service.ts#L62) (function)
  - [`ClientInviteWithRelations`](src/lib/services/client-invite-service.ts#L99) (type)
  - [`listClientInvites`](src/lib/services/client-invite-service.ts#L107) (function)
  - [`getClientInviteById`](src/lib/services/client-invite-service.ts#L128) (function)
  - [`findPendingInviteByEmail`](src/lib/services/client-invite-service.ts#L135) (function)
  - [`CreateClientInviteRecordParams`](src/lib/services/client-invite-service.ts#L148) (interface)
  - [`createClientInviteRecord`](src/lib/services/client-invite-service.ts#L156) (function)
  - [`updateClientInviteRecord`](src/lib/services/client-invite-service.ts#L183) (function)
  - [`markInviteAccepted`](src/lib/services/client-invite-service.ts#L230) (function)
  - [`markInviteCompleted`](src/lib/services/client-invite-service.ts#L241) (function)
  - [`cancelClientInvite`](src/lib/services/client-invite-service.ts#L252) (function)
  - [`fulfillInviteForUser`](src/lib/services/client-invite-service.ts#L263) (function)
  - [`ClerkOrganizationPayload`](src/lib/organizations/service.ts#L10) (interface)
  - [`getOrganizationByClerkId`](src/lib/organizations/service.ts#L68) (function)
  - [`syncOrganizationFromClerk`](src/lib/organizations/service.ts#L97) (function)
  - [`markOrganizationDeleted`](src/lib/organizations/service.ts#L211) (function)
  - [`removeOrganization`](src/lib/organizations/service.ts#L225) (function)
  - [`ensureOrganizationExists`](src/lib/organizations/service.ts#L243) (function)
  - [`ensureOrganizationCreditBalance`](src/lib/organizations/service.ts#L292) (function)
  - [`validateMemberAddition`](src/lib/organizations/service.ts#L320) (function)
  - [`refillOrganizationCredits`](src/lib/organizations/service.ts#L359) (function)
  - [`TermsOfServicePage`](src/app/(public)/terms-of-service/page.tsx#L8) (function)

### Utils
Shared utilities and helpers
- **Directories**: `src/lib`, `src/hooks`, `src/lib/video`, `src/lib/youtube`, `src/lib/validations`, `src/lib/templates`, `src/lib/studio`, `src/lib/rendering`, `src/lib/queries`, `src/lib/projects`, `src/lib/posts`, `src/lib/organizations`, `src/lib/mvsep`, `src/lib/later`, `src/lib/konva`, `src/lib/knowledge`, `src/lib/instagram`, `src/lib/images`, `src/lib/google-drive`, `src/lib/credits`, `src/lib/cms`, `src/lib/clerk`, `src/lib/cleanup`, `src/lib/assets`, `src/lib/ai-creative-generator`, `src/lib/ai`, `src/components/plans`, `src/lib/posts/verification`, `src/lib/konva/filters`, `src/lib/konva/effects`, `src/components/agenda/calendar`, `src/components/admin/plans`, `prisma/generated/client/runtime`
- **Symbols**: 511 total, 422 exported → depends on: Components, Controllers, Models
- **Key exports**:
  - [`FileToDownload`](src/lib/zip-generator.ts#L6) (interface)
  - [`downloadFolderAsZip`](src/lib/zip-generator.ts#L18) (function)
  - [`worker`](src/lib/zip-generator.ts#L27) (function)
  - [`cn`](src/lib/utils.ts#L4) (function)
  - [`generateApiKey`](src/lib/utils.ts#L8) (function)
  - [`isExternalImage`](src/lib/utils.ts#L26) (function)
  - [`TextPresetElement`](src/lib/text-presets.ts#L8) (interface)
  - [`TextPreset`](src/lib/text-presets.ts#L31) (interface)
  - [`calculateTextHeight`](src/lib/text-presets.ts#L240) (function)
  - [`applyTextTransform`](src/lib/text-presets.ts#L248) (function)
  - [`clonePreset`](src/lib/text-presets.ts#L269) (function)
  - [`SiteSettings`](src/lib/site-settings.ts#L3) (type)
  - [`getSiteSettings`](src/lib/site-settings.ts#L73) (function)
  - [`getSiteConfig`](src/lib/site-settings.ts#L96) (function)
  - [`ImageLoader`](src/lib/render-engine.ts#L10) (type)
  - [`FontChecker`](src/lib/render-engine.ts#L11) (type)
  - [`FontValidationResult`](src/lib/render-engine.ts#L13) (interface)
  - [`RenderOptions`](src/lib/render-engine.ts#L20) (interface)
  - [`RenderEngine`](src/lib/render-engine.ts#L28) (class)
  - [`generateThumbnail`](src/lib/render-engine.ts#L647) (function)
  - [`RateLimitResult`](src/lib/rate-limit.ts#L12) (interface)
  - [`RateLimitError`](src/lib/rate-limit.ts#L24) (class)
  - [`checkRateLimit`](src/lib/rate-limit.ts#L41) (function)
  - [`assertRateLimit`](src/lib/rate-limit.ts#L74) (function)
  - [`resetRateLimitBucket`](src/lib/rate-limit.ts#L82) (function)
  - [`getRateLimitBucketSize`](src/lib/rate-limit.ts#L86) (function)
  - [`PermissionError`](src/lib/permissions.ts#L5) (class)
  - [`isAdminUser`](src/lib/permissions.ts#L12) (function)
  - [`requireAdminUser`](src/lib/permissions.ts#L17) (function)
  - [`requireProjectAccess`](src/lib/permissions.ts#L25) (function)
  - [`throttle`](src/lib/performance-utils.ts#L18) (function)
  - [`debounce`](src/lib/performance-utils.ts#L56) (function)
  - [`isMobileDevice`](src/lib/performance-utils.ts#L74) (function)
  - [`isRetinaDevice`](src/lib/performance-utils.ts#L82) (function)
  - [`isLowEndDevice`](src/lib/performance-utils.ts#L91) (function)
  - [`getPerformanceConfig`](src/lib/performance-utils.ts#L99) (function)
  - [`generatePageThumbnail`](src/lib/page-thumbnail-utils.ts#L17) (function)
  - [`createDebouncedThumbnailGenerator`](src/lib/page-thumbnail-utils.ts#L94) (function)
  - [`SnapConfig`](src/lib/konva-smart-guides.ts#L23) (interface)
  - [`RectInfo`](src/lib/konva-smart-guides.ts#L46) (interface)
  - [`GuideLine`](src/lib/konva-smart-guides.ts#L55) (interface)
  - [`SnapEdge`](src/lib/konva-smart-guides.ts#L62) (interface)
  - [`SnapResult`](src/lib/konva-smart-guides.ts#L71) (interface)
  - [`getObjectSnappingEdges`](src/lib/konva-smart-guides.ts#L108) (function)
  - [`getStageGuides`](src/lib/konva-smart-guides.ts#L131) (function)
  - [`getLineGuideStops`](src/lib/konva-smart-guides.ts#L152) (function)
  - [`detectAlignmentGuides`](src/lib/konva-smart-guides.ts#L186) (function)
  - [`detectMatchingDimensions`](src/lib/konva-smart-guides.ts#L238) (function)
  - [`computeAlignmentGuides`](src/lib/konva-smart-guides.ts#L297) (function)
  - [`throttle`](src/lib/konva-smart-guides.ts#L394) (function)
  - [`formatCoordinates`](src/lib/konva-smart-guides.ts#L411) (function)
  - [`formatDimensions`](src/lib/konva-smart-guides.ts#L418) (function)
  - [`AlignmentNode`](src/lib/konva-alignment.ts#L11) (interface)
  - [`alignLeft`](src/lib/konva-alignment.ts#L20) (function)
  - [`alignCenterH`](src/lib/konva-alignment.ts#L45) (function)
  - [`alignRight`](src/lib/konva-alignment.ts#L71) (function)
  - [`alignTop`](src/lib/konva-alignment.ts#L99) (function)
  - [`alignMiddleV`](src/lib/konva-alignment.ts#L122) (function)
  - [`alignBottom`](src/lib/konva-alignment.ts#L147) (function)
  - [`distributeHorizontal`](src/lib/konva-alignment.ts#L175) (function)
  - [`distributeVertical`](src/lib/konva-alignment.ts#L212) (function)
  - [`alignToCanvasCenterH`](src/lib/konva-alignment.ts#L273) (function)
  - [`alignToCanvasCenterV`](src/lib/konva-alignment.ts#L353) (function)
  - [`bringToFront`](src/lib/konva-alignment.ts#L420) (function)
  - [`sendToBack`](src/lib/konva-alignment.ts#L431) (function)
  - [`moveForward`](src/lib/konva-alignment.ts#L443) (function)
  - [`moveBackward`](src/lib/konva-alignment.ts#L469) (function)
  - [`CropPosition`](src/lib/image-crop-utils.ts#L11) (type)
  - [`ImageSize`](src/lib/image-crop-utils.ts#L22) (interface)
  - [`CropData`](src/lib/image-crop-utils.ts#L27) (interface)
  - [`calculateImageCrop`](src/lib/image-crop-utils.ts#L58) (function)
  - [`needsCrop`](src/lib/image-crop-utils.ts#L122) (function)
  - [`calculateContainScale`](src/lib/image-crop-utils.ts#L137) (function)
  - [`calculateCoverScale`](src/lib/image-crop-utils.ts#L154) (function)
  - [`createId`](src/lib/id.ts#L1) (function)
  - [`Template`](src/lib/generation-utils.ts#L7) (interface)
  - [`Generation`](src/lib/generation-utils.ts#L15) (interface)
  - [`RenderGenerationResult`](src/lib/generation-utils.ts#L26) (interface)
  - [`renderGeneration`](src/lib/generation-utils.ts#L31) (function)
  - [`generateThumbnail`](src/lib/generation-utils.ts#L101) (function)
  - [`generatePreview`](src/lib/generation-utils.ts#L187) (function)
  - [`CustomFont`](src/lib/font-manager.ts#L12) (interface)
  - [`FontManager`](src/lib/font-manager.ts#L25) (class)
  - [`getFontManager`](src/lib/font-manager.ts#L537) (function)
  - [`withRetry`](src/lib/db-utils.ts#L5) (function)
  - [`isDatabaseConnected`](src/lib/db-utils.ts#L54) (function)
  - [`copyToClipboard`](src/lib/copy-to-clipboard.ts#L7) (function)
  - [`CanvasRenderer`](src/lib/canvas-renderer.ts#L11) (class)
  - [`getCacheKey`](src/lib/cache.ts#L70) (function)
  - [`AnalyticsConfig`](src/lib/brand-config.ts#L14) (type)
  - [`getUserFromClerkId`](src/lib/auth-utils.ts#L6) (function)
  - [`createAuthErrorResponse`](src/lib/auth-utils.ts#L21) (function)
  - [`validateUserAuthentication`](src/lib/auth-utils.ts#L28) (function)
  - [`isAdmin`](src/lib/admin-utils.ts#L6) (function)
  - [`FaixaMusica`](src/hooks/use-music-library.ts#L6) (interface)
  - [`FiltrosMusica`](src/hooks/use-music-library.ts#L24) (interface)
  - [`CriarMusicaData`](src/hooks/use-music-library.ts#L33) (interface)
  - [`AtualizarMusicaData`](src/hooks/use-music-library.ts#L43) (interface)
  - [`useBibliotecaMusicas`](src/hooks/use-music-library.ts#L66) (function)
  - [`useMusica`](src/hooks/use-music-library.ts#L78) (function)
  - [`useBuscaMusicas`](src/hooks/use-music-library.ts#L91) (function)
  - [`useEnviarMusica`](src/hooks/use-music-library.ts#L115) (function)
  - [`useAtualizarMusica`](src/hooks/use-music-library.ts#L195) (function)
  - [`useDeletarMusica`](src/hooks/use-music-library.ts#L211) (function)
  - [`ConversionProgress`](src/lib/video/ffmpeg-server-converter.ts#L7) (type)
  - [`ConversionOptions`](src/lib/video/ffmpeg-server-converter.ts#L14) (type)
  - [`convertWebMToMP4ServerSide`](src/lib/video/ffmpeg-server-converter.ts#L228) (function)
  - [`isFFmpegAvailable`](src/lib/video/ffmpeg-server-converter.ts#L381) (function)
  - [`convertWebMToMP4`](src/lib/video/ffmpeg-converter.ts#L68) (function)
  - [`isFFmpegSupported`](src/lib/video/ffmpeg-converter.ts#L196) (function)
  - [`preloadFFmpeg`](src/lib/video/ffmpeg-converter.ts#L210) (function)
  - [`checkYoutubeDownloadStatus`](src/lib/youtube/video-download-client.ts#L40) (function)
  - [`extractYoutubeId`](src/lib/youtube/utils.ts#L3) (function)
  - [`isYoutubeUrl`](src/lib/youtube/utils.ts#L20) (function)
  - [`UpdateClientProjectInput`](src/lib/validations/client-project.ts#L62) (type)
  - [`ClientProjectFilters`](src/lib/validations/client-project.ts#L63) (type)
  - [`CreateClientInviteInput`](src/lib/validations/client-invite.ts#L87) (type)
  - [`UpdateClientInviteInput`](src/lib/validations/client-invite.ts#L88) (type)
  - [`ClientInviteFilters`](src/lib/validations/client-invite.ts#L89) (type)
  - [`ClientInviteStatus`](src/lib/validations/client-invite.ts#L90) (type)
  - [`extractDriveFolderId`](src/lib/validations/client-invite.ts#L92) (function)
  - [`InstagramPreset`](src/lib/templates/instagram-presets.ts#L1) (interface)
  - [`validateInstagramFormat`](src/lib/templates/instagram-presets.ts#L55) (function)
  - [`getRecommendedPreset`](src/lib/templates/instagram-presets.ts#L87) (function)
  - [`TemplateWithProject`](src/lib/templates/access.ts#L3) (type)
  - [`fetchTemplateWithProject`](src/lib/templates/access.ts#L5) (function)
  - [`hasTemplateReadAccess`](src/lib/templates/access.ts#L27) (function)
  - [`hasTemplateWriteAccess`](src/lib/templates/access.ts#L54) (function)
  - [`TemplateKind`](src/lib/studio/defaults.ts#L3) (type)
  - [`getDefaultCanvas`](src/lib/studio/defaults.ts#L11) (function)
  - [`getDefaultLayersForType`](src/lib/studio/defaults.ts#L20) (function)
  - [`createBlankDesign`](src/lib/studio/defaults.ts#L44) (function)
  - [`RegisteredFont`](src/lib/rendering/canvas-renderer.ts#L5) (interface)
  - [`CanvasRendererOptions`](src/lib/rendering/canvas-renderer.ts#L10) (interface)
  - [`CanvasRenderResult`](src/lib/rendering/canvas-renderer.ts#L17) (interface)
  - [`renderDesignToPNG`](src/lib/rendering/canvas-renderer.ts#L24) (function)
  - [`getActivePlansSorted`](src/lib/queries/plans.ts#L5) (function)
  - [`ProjectWithShares`](src/lib/projects/access.ts#L4) (type)
  - [`fetchProjectWithShares`](src/lib/projects/access.ts#L6) (function)
  - [`hasProjectReadAccess`](src/lib/projects/access.ts#L34) (function)
  - [`hasProjectWriteAccess`](src/lib/projects/access.ts#L54) (function)
  - [`fetchProjectWithAccess`](src/lib/projects/access.ts#L79) (function)
  - [`PostScheduler`](src/lib/posts/scheduler.ts#L37) (class)
  - [`PostExecutor`](src/lib/posts/executor.ts#L13) (class)
  - [`OrganizationAuthContext`](src/lib/organizations/permissions.ts#L3) (type)
  - [`OrganizationAccessError`](src/lib/organizations/permissions.ts#L12) (class)
  - [`getOrganizationAuthContext`](src/lib/organizations/permissions.ts#L22) (function)
  - [`requireOrganizationMembership`](src/lib/organizations/permissions.ts#L39) (function)
  - [`ensureOrganizationPermission`](src/lib/organizations/permissions.ts#L76) (function)
  - [`PlanOrganizationLimits`](src/lib/organizations/limits.ts#L6) (type)
  - [`getPlanLimitsForUser`](src/lib/organizations/limits.ts#L22) (function)
  - [`AnalyticsPeriodKey`](src/lib/organizations/analytics.ts#L4) (type)
  - [`AnalyticsPeriodRange`](src/lib/organizations/analytics.ts#L6) (type)
  - [`MemberAnalyticsStats`](src/lib/organizations/analytics.ts#L11) (type)
  - [`resolveAnalyticsPeriod`](src/lib/organizations/analytics.ts#L53) (function)
  - [`collectMemberUsageStats`](src/lib/organizations/analytics.ts#L121) (function)
  - [`upsertOrganizationMemberAnalytics`](src/lib/organizations/analytics.ts#L187) (function)
  - [`listOrganizationMemberAnalytics`](src/lib/organizations/analytics.ts#L236) (function)
  - [`startStemSeparation`](src/lib/mvsep/mvsep-client.ts#L39) (function)
  - [`checkMvsepJobStatus`](src/lib/mvsep/mvsep-client.ts#L136) (function)
  - [`LaterAccount`](src/lib/later/types.ts#L9) (interface)
  - [`LaterMediaUpload`](src/lib/later/types.ts#L37) (interface)
  - [`LaterPostStatus`](src/lib/later/types.ts#L53) (type)
  - [`InstagramContentType`](src/lib/later/types.ts#L58) (type)
  - [`InstagramPlatformData`](src/lib/later/types.ts#L63) (interface)
  - [`PlatformSpecificData`](src/lib/later/types.ts#L80) (interface)
  - [`LaterPost`](src/lib/later/types.ts#L88) (interface)
  - [`CreateLaterPostPayload`](src/lib/later/types.ts#L109) (interface)
  - [`UpdateLaterPostPayload`](src/lib/later/types.ts#L132) (interface)
  - [`LaterListResponse`](src/lib/later/types.ts#L153) (interface)
  - [`LaterErrorResponse`](src/lib/later/types.ts#L166) (interface)
  - [`LaterWebhookEventType`](src/lib/later/types.ts#L177) (type)
  - [`LaterWebhookPayload`](src/lib/later/types.ts#L186) (interface)
  - [`MediaUploadOptions`](src/lib/later/types.ts#L204) (interface)
  - [`RateLimitInfo`](src/lib/later/types.ts#L212) (interface)
  - [`LaterClientConfig`](src/lib/later/types.ts#L222) (interface)
  - [`LaterAnalyticsData`](src/lib/later/types.ts#L236) (interface)
  - [`LaterRawAnalyticsPost`](src/lib/later/types.ts#L251) (interface)
  - [`LaterAnalyticsResponse`](src/lib/later/types.ts#L281) (interface)
  - [`LaterPostAnalytics`](src/lib/later/types.ts#L299) (interface)
  - [`AnalyticsQueryParams`](src/lib/later/types.ts#L320) (interface)
  - [`detectMediaType`](src/lib/later/media-upload.ts#L12) (function)
  - [`extractFilename`](src/lib/later/media-upload.ts#L43) (function)
  - [`validateMediaUrl`](src/lib/later/media-upload.ts#L59) (function)
  - [`validateMediaSize`](src/lib/later/media-upload.ts#L72) (function)
  - [`fetchMediaAsBuffer`](src/lib/later/media-upload.ts#L91) (function)
  - [`getContentType`](src/lib/later/media-upload.ts#L127) (function)
  - [`prepareUploadOptions`](src/lib/later/media-upload.ts#L152) (function)
  - [`fetchMultipleMedia`](src/lib/later/media-upload.ts#L166) (function)
  - [`formatMediaForLog`](src/lib/later/media-upload.ts#L208) (function)
  - [`createMediaFormData`](src/lib/later/media-upload.ts#L226) (function)
  - [`validateUploadResponse`](src/lib/later/media-upload.ts#L260) (function)
  - [`LaterApiError`](src/lib/later/errors.ts#L10) (class)
  - [`LaterRateLimitError`](src/lib/later/errors.ts#L64) (class)
  - [`LaterAuthError`](src/lib/later/errors.ts#L103) (class)
  - [`LaterAuthorizationError`](src/lib/later/errors.ts#L113) (class)
  - [`LaterNotFoundError`](src/lib/later/errors.ts#L123) (class)
  - [`LaterValidationError`](src/lib/later/errors.ts#L150) (class)
  - [`LaterNetworkError`](src/lib/later/errors.ts#L174) (class)
  - [`LaterMediaUploadError`](src/lib/later/errors.ts#L199) (class)
  - [`isLaterApiError`](src/lib/later/errors.ts#L231) (function)
  - [`isRateLimitError`](src/lib/later/errors.ts#L238) (function)
  - [`getErrorMessage`](src/lib/later/errors.ts#L247) (function)
  - [`sanitizeError`](src/lib/later/errors.ts#L260) (function)
  - [`LaterClient`](src/lib/later/client.ts#L44) (class)
  - [`getLaterClient`](src/lib/later/client.ts#L961) (function)
  - [`resetLaterClient`](src/lib/later/client.ts#L973) (function)
  - [`TenantKey`](src/lib/knowledge/vector-client.ts#L13) (type)
  - [`VectorMetadata`](src/lib/knowledge/vector-client.ts#L23) (interface)
  - [`getVectorClient`](src/lib/knowledge/vector-client.ts#L32) (function)
  - [`upsertVectors`](src/lib/knowledge/vector-client.ts#L55) (function)
  - [`queryVectors`](src/lib/knowledge/vector-client.ts#L84) (function)
  - [`deleteVectorsByEntry`](src/lib/knowledge/vector-client.ts#L134) (function)
  - [`deleteVector`](src/lib/knowledge/vector-client.ts#L162) (function)
  - [`MatchType`](src/lib/knowledge/training-pipeline.ts#L7) (type)
  - [`TrainingPreview`](src/lib/knowledge/training-pipeline.ts#L9) (interface)
  - [`processTrainingInput`](src/lib/knowledge/training-pipeline.ts#L21) (function)
  - [`formatPreviewMessage`](src/lib/knowledge/training-pipeline.ts#L94) (function)
  - [`SearchResult`](src/lib/knowledge/search.ts#L12) (interface)
  - [`searchKnowledgeBase`](src/lib/knowledge/search.ts#L35) (function)
  - [`formatContextFromResults`](src/lib/knowledge/search.ts#L241) (function)
  - [`getRAGContext`](src/lib/knowledge/search.ts#L310) (function)
  - [`getRAGContextWithResults`](src/lib/knowledge/search.ts#L331) (function)
  - [`IndexEntryInput`](src/lib/knowledge/indexer.ts#L12) (interface)
  - [`IndexFileInput`](src/lib/knowledge/indexer.ts#L24) (interface)
  - [`indexEntry`](src/lib/knowledge/indexer.ts#L42) (function)
  - [`indexFile`](src/lib/knowledge/indexer.ts#L125) (function)
  - [`reindexEntry`](src/lib/knowledge/indexer.ts#L142) (function)
  - [`updateEntry`](src/lib/knowledge/indexer.ts#L219) (function)
  - [`deleteEntry`](src/lib/knowledge/indexer.ts#L265) (function)
  - [`SimilarEntryMatch`](src/lib/knowledge/find-similar-entries.ts#L5) (interface)
  - [`findSimilarEntries`](src/lib/knowledge/find-similar-entries.ts#L13) (function)
  - [`generateEmbedding`](src/lib/knowledge/embeddings.ts#L16) (function)
  - [`generateEmbeddings`](src/lib/knowledge/embeddings.ts#L35) (function)
  - [`DisambiguationState`](src/lib/knowledge/disambiguation.ts#L9) (interface)
  - [`isDisambiguationResponse`](src/lib/knowledge/disambiguation.ts#L24) (function)
  - [`handleDisambiguationChoice`](src/lib/knowledge/disambiguation.ts#L43) (function)
  - [`formatDisambiguationMessage`](src/lib/knowledge/disambiguation.ts#L88) (function)
  - [`createDisambiguationState`](src/lib/knowledge/disambiguation.ts#L120) (function)
  - [`extractDisambiguationState`](src/lib/knowledge/disambiguation.ts#L141) (function)
  - [`UserIntent`](src/lib/knowledge/classify-intent.ts#L4) (type)
  - [`classifyIntent`](src/lib/knowledge/classify-intent.ts#L82) (function)
  - [`classifyCategory`](src/lib/knowledge/classify-category.ts#L110) (function)
  - [`Chunk`](src/lib/knowledge/chunking.ts#L14) (interface)
  - [`chunkText`](src/lib/knowledge/chunking.ts#L26) (function)
  - [`parseTxtContent`](src/lib/knowledge/chunking.ts#L138) (function)
  - [`parseMarkdownContent`](src/lib/knowledge/chunking.ts#L148) (function)
  - [`parseFileContent`](src/lib/knowledge/chunking.ts#L167) (function)
  - [`getCachedResults`](src/lib/knowledge/cache.ts#L179) (function)
  - [`setCachedResults`](src/lib/knowledge/cache.ts#L233) (function)
  - [`invalidateProjectCache`](src/lib/knowledge/cache.ts#L275) (function)
  - [`invalidateCategoryCache`](src/lib/knowledge/cache.ts#L320) (function)
  - [`clearAllCache`](src/lib/knowledge/cache.ts#L362) (function)
  - [`AlertType`](src/lib/instagram/types.ts#L1) (enum)
  - [`AlertSeverity`](src/lib/instagram/types.ts#L8) (enum)
  - [`Alert`](src/lib/instagram/types.ts#L14) (interface)
  - [`generateAlerts`](src/lib/instagram/generate-alerts.ts#L28) (function)
  - [`ResizeOptions`](src/lib/images/client-resize.ts#L6) (interface)
  - [`resizeImage`](src/lib/images/client-resize.ts#L24) (function)
  - [`resizeToInstagramFeed`](src/lib/images/client-resize.ts#L169) (function)
  - [`isImageFile`](src/lib/images/client-resize.ts#L187) (function)
  - [`isVideoFile`](src/lib/images/client-resize.ts#L207) (function)
  - [`cropToInstagramFeed`](src/lib/images/auto-crop.ts#L7) (function)
  - [`needsCropping`](src/lib/images/auto-crop.ts#L71) (function)
  - [`getImageInfo`](src/lib/images/auto-crop.ts#L94) (function)
  - [`downloadFromGoogleDrive`](src/lib/google-drive/download.ts#L9) (function)
  - [`getUserCredits`](src/lib/credits/validate-credits.ts#L8) (function)
  - [`validateCredits`](src/lib/credits/validate-credits.ts#L35) (function)
  - [`deductCredits`](src/lib/credits/validate-credits.ts#L56) (function)
  - [`refreshUserCredits`](src/lib/credits/validate-credits.ts#L78) (function)
  - [`addUserCredits`](src/lib/credits/validate-credits.ts#L99) (function)
  - [`trackUsage`](src/lib/credits/track-usage.ts#L17) (function)
  - [`getUserUsageHistory`](src/lib/credits/track-usage.ts#L68) (function)
  - [`getUserUsageSummary`](src/lib/credits/track-usage.ts#L85) (function)
  - [`syncCreditBalance`](src/lib/credits/track-usage.ts#L128) (function)
  - [`AdminSettingsPayload`](src/lib/credits/settings.ts#L4) (type)
  - [`getRawAdminSettings`](src/lib/credits/settings.ts#L8) (function)
  - [`getEffectiveFeatureCosts`](src/lib/credits/settings.ts#L18) (function)
  - [`getFeatureCost`](src/lib/credits/settings.ts#L29) (function)
  - [`getEffectivePlanCredits`](src/lib/credits/settings.ts#L34) (function)
  - [`getPlanCredits`](src/lib/credits/settings.ts#L41) (function)
  - [`PlanOption`](src/lib/credits/settings.ts#L46) (type)
  - [`getPlanOptions`](src/lib/credits/settings.ts#L48) (function)
  - [`getBasePlanCredits`](src/lib/credits/settings.ts#L53) (function)
  - [`upsertAdminSettings`](src/lib/credits/settings.ts#L60) (function)
  - [`FeatureKey`](src/lib/credits/feature-config.ts#L13) (type)
  - [`toPrismaOperationType`](src/lib/credits/feature-config.ts#L24) (function)
  - [`InsufficientCreditsError`](src/lib/credits/errors.ts#L1) (class)
  - [`validateCreditsForFeature`](src/lib/credits/deduct.ts#L175) (function)
  - [`deductCreditsForFeature`](src/lib/credits/deduct.ts#L208) (function)
  - [`refundCreditsForFeature`](src/lib/credits/deduct.ts#L301) (function)
  - [`getAllPages`](src/lib/cms/queries.ts#L10) (function)
  - [`getPageById`](src/lib/cms/queries.ts#L24) (function)
  - [`getPageBySlug`](src/lib/cms/queries.ts#L39) (function)
  - [`getPageByPath`](src/lib/cms/queries.ts#L54) (function)
  - [`getHomePage`](src/lib/cms/queries.ts#L79) (function)
  - [`getPublishedPages`](src/lib/cms/queries.ts#L104) (function)
  - [`getPagesByStatus`](src/lib/cms/queries.ts#L120) (function)
  - [`getPageSections`](src/lib/cms/queries.ts#L139) (function)
  - [`getSectionById`](src/lib/cms/queries.ts#L149) (function)
  - [`getSectionsByType`](src/lib/cms/queries.ts#L159) (function)
  - [`getVisiblePageSections`](src/lib/cms/queries.ts#L170) (function)
  - [`getAllMenus`](src/lib/cms/queries.ts#L187) (function)
  - [`getMenuById`](src/lib/cms/queries.ts#L207) (function)
  - [`getMenuBySlug`](src/lib/cms/queries.ts#L227) (function)
  - [`getMenuByLocation`](src/lib/cms/queries.ts#L248) (function)
  - [`getMenuItems`](src/lib/cms/queries.ts#L275) (function)
  - [`getAllComponents`](src/lib/cms/queries.ts#L294) (function)
  - [`getComponentBySlug`](src/lib/cms/queries.ts#L303) (function)
  - [`getGlobalComponents`](src/lib/cms/queries.ts#L312) (function)
  - [`getComponentsByType`](src/lib/cms/queries.ts#L322) (function)
  - [`getAllMedia`](src/lib/cms/queries.ts#L336) (function)
  - [`getMediaById`](src/lib/cms/queries.ts#L345) (function)
  - [`getMediaByFolder`](src/lib/cms/queries.ts#L354) (function)
  - [`getMediaByMimeType`](src/lib/cms/queries.ts#L364) (function)
  - [`getMediaByUser`](src/lib/cms/queries.ts#L374) (function)
  - [`searchMedia`](src/lib/cms/queries.ts#L384) (function)
  - [`CreatePageInput`](src/lib/cms/mutations.ts#L11) (type)
  - [`UpdatePageInput`](src/lib/cms/mutations.ts#L24) (type)
  - [`createPage`](src/lib/cms/mutations.ts#L40) (function)
  - [`updatePage`](src/lib/cms/mutations.ts#L57) (function)
  - [`deletePage`](src/lib/cms/mutations.ts#L76) (function)
  - [`publishPage`](src/lib/cms/mutations.ts#L85) (function)
  - [`unpublishPage`](src/lib/cms/mutations.ts#L99) (function)
  - [`archivePage`](src/lib/cms/mutations.ts#L112) (function)
  - [`duplicatePage`](src/lib/cms/mutations.ts#L125) (function)
  - [`CreateSectionInput`](src/lib/cms/mutations.ts#L175) (type)
  - [`UpdateSectionInput`](src/lib/cms/mutations.ts#L185) (type)
  - [`createSection`](src/lib/cms/mutations.ts#L197) (function)
  - [`updateSection`](src/lib/cms/mutations.ts#L212) (function)
  - [`deleteSection`](src/lib/cms/mutations.ts#L228) (function)
  - [`reorderSections`](src/lib/cms/mutations.ts#L237) (function)
  - [`toggleSectionVisibility`](src/lib/cms/mutations.ts#L253) (function)
  - [`duplicateSection`](src/lib/cms/mutations.ts#L266) (function)
  - [`CreateMenuInput`](src/lib/cms/mutations.ts#L293) (type)
  - [`UpdateMenuInput`](src/lib/cms/mutations.ts#L300) (type)
  - [`CreateMenuItemInput`](src/lib/cms/mutations.ts#L307) (type)
  - [`UpdateMenuItemInput`](src/lib/cms/mutations.ts#L318) (type)
  - [`createMenu`](src/lib/cms/mutations.ts#L331) (function)
  - [`updateMenu`](src/lib/cms/mutations.ts#L343) (function)
  - [`deleteMenu`](src/lib/cms/mutations.ts#L356) (function)
  - [`createMenuItem`](src/lib/cms/mutations.ts#L365) (function)
  - [`updateMenuItem`](src/lib/cms/mutations.ts#L377) (function)
  - [`deleteMenuItem`](src/lib/cms/mutations.ts#L390) (function)
  - [`reorderMenuItems`](src/lib/cms/mutations.ts#L399) (function)
  - [`CreateComponentInput`](src/lib/cms/mutations.ts#L416) (type)
  - [`UpdateComponentInput`](src/lib/cms/mutations.ts#L427) (type)
  - [`createComponent`](src/lib/cms/mutations.ts#L440) (function)
  - [`updateComponent`](src/lib/cms/mutations.ts#L452) (function)
  - [`deleteComponent`](src/lib/cms/mutations.ts#L465) (function)
  - [`CreateMediaInput`](src/lib/cms/mutations.ts#L475) (type)
  - [`UpdateMediaInput`](src/lib/cms/mutations.ts#L490) (type)
  - [`createMedia`](src/lib/cms/mutations.ts#L500) (function)
  - [`updateMedia`](src/lib/cms/mutations.ts#L509) (function)
  - [`deleteMedia`](src/lib/cms/mutations.ts#L519) (function)
  - [`bulkDeleteMedia`](src/lib/cms/mutations.ts#L528) (function)
  - [`SubscriptionPlan`](src/lib/clerk/subscription-utils.ts#L4) (interface)
  - [`initializeUserSubscription`](src/lib/clerk/subscription-utils.ts#L65) (function)
  - [`handleSubscriptionChange`](src/lib/clerk/subscription-utils.ts#L86) (function)
  - [`hasFeatureAccess`](src/lib/clerk/subscription-utils.ts#L127) (function)
  - [`getUserPlanDetails`](src/lib/clerk/subscription-utils.ts#L151) (function)
  - [`getCreditsForPrice`](src/lib/clerk/credit-packs.ts#L15) (function)
  - [`fetchCommercePlans`](src/lib/clerk/commerce-plans.ts#L191) (function)
  - [`ClerkPlanMoney`](src/lib/clerk/commerce-plan-types.ts#L1) (interface)
  - [`ClerkPlanFeature`](src/lib/clerk/commerce-plan-types.ts#L8) (interface)
  - [`ClerkPlanNormalized`](src/lib/clerk/commerce-plan-types.ts#L16) (interface)
  - [`cleanupExpiredBlobs`](src/lib/cleanup/blob-cleanup.ts#L16) (function)
  - [`ShapeDefinition`](src/lib/assets/shapes-library.ts#L1) (interface)
  - [`IconDefinition`](src/lib/assets/icon-library.ts#L1) (interface)
  - [`GradientDefinition`](src/lib/assets/gradients-library.ts#L3) (interface)
  - [`BackgroundPreset`](src/lib/assets/background-presets.ts#L3) (interface)
  - [`BuildLayersResult`](src/lib/ai-creative-generator/template-page-builder.ts#L37) (interface)
  - [`buildKonvaLayers`](src/lib/ai-creative-generator/template-page-builder.ts#L42) (function)
  - [`LayoutId`](src/lib/ai-creative-generator/layout-types.ts#L6) (type)
  - [`TextFieldName`](src/lib/ai-creative-generator/layout-types.ts#L8) (type)
  - [`LayoutZone`](src/lib/ai-creative-generator/layout-types.ts#L10) (interface)
  - [`LayoutTemplate`](src/lib/ai-creative-generator/layout-types.ts#L31) (interface)
  - [`BrandAssets`](src/lib/ai-creative-generator/layout-types.ts#L39) (interface)
  - [`TextsData`](src/lib/ai-creative-generator/layout-types.ts#L45) (interface)
  - [`ImageSource`](src/lib/ai-creative-generator/layout-types.ts#L54) (interface)
  - [`LayerBinding`](src/lib/ai-creative-generator/layout-types.ts#L66) (interface)
  - [`getLayoutById`](src/lib/ai-creative-generator/layout-templates.ts#L236) (function)
  - [`getAllLayouts`](src/lib/ai-creative-generator/layout-templates.ts#L240) (function)
  - [`loadBrandAssets`](src/lib/ai-creative-generator/brand-assets-loader.ts#L9) (function)
  - [`AIProvider`](src/lib/ai/token-limits.ts#L43) (type)
  - [`getMaxOutputTokens`](src/lib/ai/token-limits.ts#L48) (function)
  - [`getMaxContextTokens`](src/lib/ai/token-limits.ts#L55) (function)
  - [`estimateTokens`](src/lib/ai/token-limits.ts#L62) (function)
  - [`truncateToTokenLimit`](src/lib/ai/token-limits.ts#L69) (function)
  - [`calculateContextTokens`](src/lib/ai/token-limits.ts#L84) (function)
  - [`BillingPeriod`](src/components/plans/pricing-utils.ts#L3) (type)
  - [`formatCurrency`](src/components/plans/pricing-utils.ts#L32) (function)
  - [`resolvePricing`](src/components/plans/pricing-utils.ts#L44) (function)
  - [`VerificationErrorCode`](src/lib/posts/verification/types.ts#L3) (type)
  - [`VerificationSummary`](src/lib/posts/verification/types.ts#L16) (interface)
  - [`SocialPostWithProject`](src/lib/posts/verification/types.ts#L24) (interface)
  - [`generateVerificationTag`](src/lib/posts/verification/tag-generator.ts#L6) (function)
  - [`validateTag`](src/lib/posts/verification/tag-generator.ts#L17) (function)
  - [`extractPostIdFromTag`](src/lib/posts/verification/tag-generator.ts#L21) (function)
  - [`appendTagToCaption`](src/lib/posts/verification/tag-generator.ts#L27) (function)
  - [`StoryVerifier`](src/lib/posts/verification/story-verifier.ts#L49) (class)
  - [`WhitesBlacksFilter`](src/lib/konva/filters/WhitesBlacksFilter.ts#L12) (function)
  - [`VignetteFilter`](src/lib/konva/filters/VignetteFilter.ts#L12) (function)
  - [`HighlightsShadowsFilter`](src/lib/konva/filters/HighlightsShadowsFilter.ts#L12) (function)
  - [`BlurEffectConfig`](src/lib/konva/effects/types.ts#L5) (interface)
  - [`StrokeEffectConfig`](src/lib/konva/effects/types.ts#L10) (interface)
  - [`ShadowEffectConfig`](src/lib/konva/effects/types.ts#L16) (interface)
  - [`BackgroundEffectConfig`](src/lib/konva/effects/types.ts#L25) (interface)
  - [`CurvedTextEffectConfig`](src/lib/konva/effects/types.ts#L31) (interface)
  - [`TextEffectsConfig`](src/lib/konva/effects/types.ts#L36) (interface)
  - [`StrokeEffect`](src/lib/konva/effects/StrokeEffect.ts#L9) (class)
  - [`ShadowEffect`](src/lib/konva/effects/ShadowEffect.ts#L9) (class)
  - [`EffectsManager`](src/lib/konva/effects/EffectsManager.ts#L14) (class)
  - [`CurvedTextEffect`](src/lib/konva/effects/CurvedTextEffect.ts#L9) (class)
  - [`BlurEffect`](src/lib/konva/effects/BlurEffect.ts#L9) (class)
  - [`BackgroundEffect`](src/lib/konva/effects/BackgroundEffect.ts#L9) (class)
  - [`createDateKey`](src/components/agenda/calendar/calendar-utils.ts#L9) (function)
  - [`getPostDate`](src/components/agenda/calendar/calendar-utils.ts#L16) (function)
  - [`getPostDateKey`](src/components/agenda/calendar/calendar-utils.ts#L36) (function)
  - [`formatPostTime`](src/components/agenda/calendar/calendar-utils.ts#L42) (function)
  - [`sortPostsByDate`](src/components/agenda/calendar/calendar-utils.ts#L55) (function)
  - [`groupPostsByDay`](src/components/agenda/calendar/calendar-utils.ts#L65) (function)

### Controllers
Request handling and routing
- **Directories**: `src/lib`, `src/hooks`, `scripts/later`, `src/lib/instagram`, `src/app/api/upload`, `src/app/api/test-ffmpeg`, `src/app/api/templates`, `src/app/api/site-config`, `src/app/api/prompts`, `src/app/api/projects`, `src/app/api/knowledge`, `src/app/api/google-drive-download`, `src/app/api/feature-grid`, `src/app/api/biblioteca-musicas`, `src/app/api/ai-images-download`, `src/app/api/webhooks/reminder-confirm`, `src/app/api/webhooks/later`, `src/app/api/webhooks/late`, `src/app/api/webhooks/clerk`, `src/app/api/video-processing/upload`, `src/app/api/video-processing/queue`, `src/app/api/video-processing/process`, `src/app/api/verification/stats`, `src/app/api/verification/failed`, `src/app/api/upload/signed-url`, `src/app/api/upload/google-drive`, `src/app/api/templates/generate-thumbnail`, `src/app/api/templates/export`, `src/app/api/templates/[id]`, `src/app/api/subscription/status`, `src/app/api/public/plans`, `src/app/api/public/pages`, `src/app/api/public/menu`, `src/app/api/prompts/[promptId]`, `src/app/api/projects/scheduled-counts`, `src/app/api/projects/[projectId]`, `src/app/api/posts/calendar`, `src/app/api/organizations/sync`, `src/app/api/organizations/limits`, `src/app/api/later/accounts`, `src/app/api/knowledge/confirm`, `src/app/api/knowledge/[id]`, `src/app/api/instagram/summaries`, `src/app/api/instagram/settings`, `src/app/api/google-drive/test`, `src/app/api/google-drive/start-oauth`, `src/app/api/google-drive/files`, `src/app/api/google-drive/callback`, `src/app/api/generations/bulk-delete`, `src/app/api/generations/[id]`, `src/app/api/drive/list`, `src/app/api/drive/breadcrumbs`, `src/app/api/debug/posts`, `src/app/api/debug/org`, `src/app/api/debug/auth`, `src/app/api/cron/verify-stories`, `src/app/api/cron/test-process-stems`, `src/app/api/cron/status-sync`, `src/app/api/cron/reminders`, `src/app/api/cron/refill-org-credits`, `src/app/api/cron/process-youtube-downloads`, `src/app/api/cron/process-music-stems`, `src/app/api/cron/posts`, `src/app/api/cron/fetch-story-insights`, `src/app/api/cron/fetch-later-analytics`, `src/app/api/cron/cleanup-db`, `src/app/api/cron/cleanup-blobs`, `src/app/api/cron/check-stuck-posts`, `src/app/api/cron/backup-database`, `src/app/api/cron/archive-expired-knowledge`, `src/app/api/cron/analytics`, `src/app/api/credits/settings`, `src/app/api/credits/me`, `src/app/api/cms/sections`, `src/app/api/cms/pages`, `src/app/api/cms/menus`, `src/app/api/cms/menu-items`, `src/app/api/cms/media`, `src/app/api/cms/components`, `src/app/api/calendar/analytics`, `src/app/api/biblioteca-musicas/youtube`, `src/app/api/biblioteca-musicas/upload-url`, `src/app/api/biblioteca-musicas/confirm`, `src/app/api/biblioteca-musicas/buscar`, `src/app/api/biblioteca-musicas/[id]`, `src/app/api/ai/providers`, `src/app/api/ai/models`, `src/app/api/ai/image`, `src/app/api/ai/generate-image`, `src/app/api/ai/generate-creative`, `src/app/api/ai/conversations`, `src/app/api/ai/chat`, `src/app/api/admin/verify`, `src/app/api/admin/users`, `src/app/api/admin/usage`, `src/app/api/admin/test-mvsep`, `src/app/api/admin/studio`, `src/app/api/admin/storage`, `src/app/api/admin/site-settings`, `src/app/api/admin/settings`, `src/app/api/admin/retry-all-failed`, `src/app/api/admin/plans`, `src/app/api/admin/knowledge`, `src/app/api/admin/inspect-files`, `src/app/api/admin/feature-grid`, `src/app/api/admin/feature-costs`, `src/app/api/admin/debug-stem-job`, `src/app/api/admin/debug-mvsep-response`, `src/app/api/admin/debug-mvsep-files`, `src/app/api/admin/credits`, `src/app/api/admin/clients`, `src/app/api/admin/client-projects`, `src/app/api/webhooks/instagram/story`, `src/app/api/webhooks/instagram/report`, `src/app/api/webhooks/instagram/feed`, `src/app/api/webhooks/buffer/test`, `src/app/api/webhooks/buffer/post-sent`, `src/app/api/video-processing/status/[jobId]`, `src/app/api/templates/[id]/thumbnail`, `src/app/api/templates/[id]/template-pages`, `src/app/api/templates/[id]/pages`, `src/app/api/templates/[id]/export`, `src/app/api/templates/[id]/duplicate`, `src/app/api/templates/[id]/creatives`, `src/app/api/templates/[id]/create-from-template`, `src/app/api/projects/[projectId]/test-webhook`, `src/app/api/projects/[projectId]/templates`, `src/app/api/projects/[projectId]/stories-report`, `src/app/api/projects/[projectId]/settings`, `src/app/api/projects/[projectId]/prompts`, `src/app/api/projects/[projectId]/posts`, `src/app/api/projects/[projectId]/logos`, `src/app/api/projects/[projectId]/instagram`, `src/app/api/projects/[projectId]/generations`, `src/app/api/projects/[projectId]/fonts`, `src/app/api/projects/[projectId]/elements`, `src/app/api/projects/[projectId]/creatives`, `src/app/api/projects/[projectId]/colors`, `src/app/api/projects/[projectId]/analytics`, `src/app/api/projects/[projectId]/ai-images`, `src/app/api/posts/[postId]/status`, `src/app/api/posts/[postId]/analytics`, `src/app/api/organizations/webhooks/clerk`, `src/app/api/organizations/[orgId]/settings`, `src/app/api/organizations/[orgId]/projects`, `src/app/api/organizations/[orgId]/credits`, `src/app/api/organizations/[orgId]/analytics`, `src/app/api/knowledge/training/preview`, `src/app/api/instagram/[projectId]/studio`, `src/app/api/google-drive/thumbnail/[fileId]`, `src/app/api/google-drive/image/[fileId]`, `src/app/api/generations/[id]/download`, `src/app/api/export/video/validate`, `src/app/api/export/video/upload-url`, `src/app/api/export/video/save`, `src/app/api/export/video/confirm`, `src/app/api/drive/thumbnail/[fileId]`, `src/app/api/drive/folders/download`, `src/app/api/drive/folders/create`, `src/app/api/drive/files/upload`, `src/app/api/drive/files/move`, `src/app/api/drive/files/delete`, `src/app/api/debug/post/[postId]`, `src/app/api/cms/sections/[id]`, `src/app/api/cms/pages/[id]`, `src/app/api/cms/menus/[id]`, `src/app/api/cms/menu-items/reorder`, `src/app/api/cms/menu-items/[id]`, `src/app/api/cms/media/upload`, `src/app/api/cms/media/bulk-delete`, `src/app/api/cms/media/[id]`, `src/app/api/cms/components/[id]`, `src/app/api/biblioteca-musicas/youtube/metadata`, `src/app/api/biblioteca-musicas/youtube/jobs`, `src/app/api/biblioteca-musicas/youtube/[jobId]`, `src/app/api/biblioteca-musicas/[id]/stem-status`, `src/app/api/biblioteca-musicas/[id]/reprocess-stem`, `src/app/api/biblioteca-musicas/[id]/download-zip`, `src/app/api/ai/openrouter/models`, `src/app/api/ai/creative-page/[pageId]`, `src/app/api/ai/conversations/cleanup`, `src/app/api/ai/conversations/[id]`, `src/app/api/admin/verify-story/[postId]`, `src/app/api/admin/users/sync`, `src/app/api/admin/users/invite`, `src/app/api/admin/users/invitations`, `src/app/api/admin/users/[id]`, `src/app/api/admin/storage/[id]`, `src/app/api/admin/plans/refresh-pricing`, `src/app/api/admin/plans/[clerkId]`, `src/app/api/admin/knowledge/migrate-workspace`, `src/app/api/admin/knowledge/[id]`, `src/app/api/admin/health/credits-enum`, `src/app/api/admin/feature-grid/[id]`, `src/app/api/admin/credits/[id]`, `src/app/api/admin/clients/[id]`, `src/app/api/admin/client-projects/[projectId]`, `src/app/api/admin/clerk/plans`, `src/app/api/templates/[id]/pages/reorder`, `src/app/api/templates/[id]/pages/[pageId]`, `src/app/api/projects/[projectId]/prompts/[promptId]`, `src/app/api/projects/[projectId]/posts/next-scheduled`, `src/app/api/projects/[projectId]/posts/calendar`, `src/app/api/projects/[projectId]/posts/[postId]`, `src/app/api/projects/[projectId]/logos/[logoId]`, `src/app/api/projects/[projectId]/google-drive/images`, `src/app/api/projects/[projectId]/google-drive/download`, `src/app/api/projects/[projectId]/generations/carousel`, `src/app/api/projects/[projectId]/fonts/[fontId]`, `src/app/api/projects/[projectId]/elements/[elementId]`, `src/app/api/projects/[projectId]/colors/[colorId]`, `src/app/api/projects/[projectId]/ai-images/[imageId]`, `src/app/api/pages/[pageId]/layers/[layerId]`, `src/app/api/organizations/[orgId]/projects/[projectId]`, `src/app/api/organizations/[orgId]/credits/usage`, `src/app/api/organizations/[orgId]/analytics/timeline`, `src/app/api/organizations/[orgId]/analytics/members`, `src/app/api/cms/sections/[id]/toggle-visibility`, `src/app/api/cms/sections/[id]/duplicate`, `src/app/api/cms/pages/[id]/publish`, `src/app/api/cms/pages/[id]/duplicate`, `src/app/api/cms/menus/[id]/items`, `src/app/api/biblioteca-musicas/youtube/[jobId]/status`, `src/app/api/admin/users/[id]/credits`, `src/app/api/admin/users/[id]/activate`, `src/app/api/admin/knowledge/[id]/reindex`, `src/app/api/admin/clients/[id]/resend`, `src/app/api/admin/clients/[id]/cancel`, `src/app/api/templates/[id]/pages/[pageId]/toggle-template`, `src/app/api/templates/[id]/pages/[pageId]/duplicate`, `src/app/api/admin/users/invitations/[id]/revoke`, `src/app/api/admin/users/invitations/[id]/resend`, `scripts`
- **Symbols**: 417 total, 321 exported → depends on: Components
- **Key exports**:
  - [`ApiError`](src/lib/api-client.ts#L6) (class)
  - [`apiClient`](src/lib/api-client.ts#L20) (function)
  - [`validateApiKey`](src/lib/api-auth.ts#L5) (function)
  - [`createUnauthorizedResponse`](src/lib/api-auth.ts#L65) (function)
  - [`createSuccessResponse`](src/lib/api-auth.ts#L72) (function)
  - [`createErrorResponse`](src/lib/api-auth.ts#L79) (function)
  - [`OpenRouterModel`](src/hooks/use-openrouter-models.ts#L6) (interface)
  - [`OpenRouterModelsResponse`](src/hooks/use-openrouter-models.ts#L11) (interface)
  - [`useOpenRouterModels`](src/hooks/use-openrouter-models.ts#L15) (function)
  - [`InstagramStory`](src/lib/instagram/graph-api-client.ts#L1) (interface)
  - [`InstagramStoryInsights`](src/lib/instagram/graph-api-client.ts#L10) (interface)
  - [`InstagramApiException`](src/lib/instagram/graph-api-client.ts#L40) (class)
  - [`InstagramGraphApiClient`](src/lib/instagram/graph-api-client.ts#L75) (class)
  - [`POST`](src/app/api/upload/route.ts#L9) (function)
  - [`GET`](src/app/api/test-ffmpeg/route.ts#L11) (function)
  - [`GET`](src/app/api/templates/route.ts#L28) (function)
  - [`POST`](src/app/api/templates/route.ts#L142) (function)
  - [`GET`](src/app/api/site-config/route.ts#L6) (function)
  - [`GET`](src/app/api/prompts/route.ts#L16) (function)
  - [`POST`](src/app/api/prompts/route.ts#L76) (function)
  - [`GET`](src/app/api/projects/route.ts#L13) (function)
  - [`POST`](src/app/api/projects/route.ts#L204) (function)
  - [`GET`](src/app/api/knowledge/route.ts#L43) (function)
  - [`POST`](src/app/api/knowledge/route.ts#L157) (function)
  - [`POST`](src/app/api/google-drive-download/route.ts#L22) (function)
  - [`GET`](src/app/api/feature-grid/route.ts#L5) (function)
  - [`GET`](src/app/api/biblioteca-musicas/route.ts#L14) (function)
  - [`POST`](src/app/api/biblioteca-musicas/route.ts#L47) (function)
  - [`POST`](src/app/api/ai-images-download/route.ts#L21) (function)
  - [`POST`](src/app/api/webhooks/reminder-confirm/route.ts#L14) (function)
  - [`OPTIONS`](src/app/api/webhooks/reminder-confirm/route.ts#L84) (function)
  - [`POST`](src/app/api/webhooks/later/route.ts#L9) (function)
  - [`POST`](src/app/api/webhooks/late/route.ts#L91) (function)
  - [`POST`](src/app/api/webhooks/clerk/route.ts#L53) (function)
  - [`POST`](src/app/api/video-processing/upload/route.ts#L27) (function)
  - [`POST`](src/app/api/video-processing/queue/route.ts#L47) (function)
  - [`POST`](src/app/api/video-processing/process/route.ts#L315) (function)
  - [`GET`](src/app/api/video-processing/process/route.ts#L319) (function)
  - [`GET`](src/app/api/verification/stats/route.ts#L16) (function)
  - [`GET`](src/app/api/verification/failed/route.ts#L16) (function)
  - [`POST`](src/app/api/upload/signed-url/route.ts#L7) (function)
  - [`POST`](src/app/api/upload/google-drive/route.ts#L31) (function)
  - [`POST`](src/app/api/templates/generate-thumbnail/route.ts#L18) (function)
  - [`POST`](src/app/api/templates/export/route.ts#L13) (function)
  - [`GET`](src/app/api/templates/[id]/route.ts#L10) (function)
  - [`PUT`](src/app/api/templates/[id]/route.ts#L59) (function)
  - [`DELETE`](src/app/api/templates/[id]/route.ts#L142) (function)
  - [`GET`](src/app/api/subscription/status/route.ts#L24) (function)
  - [`GET`](src/app/api/public/plans/route.ts#L6) (function)
  - [`GET`](src/app/api/public/pages/route.ts#L10) (function)
  - [`GET`](src/app/api/public/menu/route.ts#L8) (function)
  - [`GET`](src/app/api/prompts/[promptId]/route.ts#L16) (function)
  - [`PATCH`](src/app/api/prompts/[promptId]/route.ts#L64) (function)
  - [`DELETE`](src/app/api/prompts/[promptId]/route.ts#L128) (function)
  - [`GET`](src/app/api/projects/scheduled-counts/route.ts#L14) (function)
  - [`GET`](src/app/api/projects/[projectId]/route.ts#L8) (function)
  - [`DELETE`](src/app/api/projects/[projectId]/route.ts#L51) (function)
  - [`GET`](src/app/api/posts/calendar/route.ts#L11) (function)
  - [`POST`](src/app/api/organizations/sync/route.ts#L18) (function)
  - [`GET`](src/app/api/organizations/limits/route.ts#L7) (function)
  - [`GET`](src/app/api/later/accounts/route.ts#L10) (function)
  - [`POST`](src/app/api/knowledge/confirm/route.ts#L39) (function)
  - [`GET`](src/app/api/knowledge/[id]/route.ts#L30) (function)
  - [`PUT`](src/app/api/knowledge/[id]/route.ts#L103) (function)
  - [`DELETE`](src/app/api/knowledge/[id]/route.ts#L221) (function)
  - [`GET`](src/app/api/instagram/summaries/route.ts#L5) (function)
  - [`GET`](src/app/api/instagram/settings/route.ts#L13) (function)
  - [`PUT`](src/app/api/instagram/settings/route.ts#L62) (function)
  - [`GET`](src/app/api/google-drive/test/route.ts#L7) (function)
  - [`POST`](src/app/api/google-drive/start-oauth/route.ts#L9) (function)
  - [`GET`](src/app/api/google-drive/files/route.ts#L14) (function)
  - [`GET`](src/app/api/google-drive/callback/route.ts#L13) (function)
  - [`POST`](src/app/api/generations/bulk-delete/route.ts#L11) (function)
  - [`GET`](src/app/api/generations/[id]/route.ts#L12) (function)
  - [`DELETE`](src/app/api/generations/[id]/route.ts#L62) (function)
  - [`GET`](src/app/api/drive/list/route.ts#L24) (function)
  - [`GET`](src/app/api/drive/breadcrumbs/route.ts#L12) (function)
  - [`GET`](src/app/api/debug/posts/route.ts#L10) (function)
  - [`GET`](src/app/api/debug/org/route.ts#L9) (function)
  - [`GET`](src/app/api/debug/auth/route.ts#L4) (function)
  - [`POST`](src/app/api/cron/verify-stories/route.ts#L23) (function)
  - [`GET`](src/app/api/cron/verify-stories/route.ts#L27) (function)
  - [`GET`](src/app/api/cron/test-process-stems/route.ts#L20) (function)
  - [`GET`](src/app/api/cron/status-sync/route.ts#L10) (function)
  - [`GET`](src/app/api/cron/reminders/route.ts#L11) (function)
  - [`GET`](src/app/api/cron/refill-org-credits/route.ts#L24) (function)
  - [`POST`](src/app/api/cron/refill-org-credits/route.ts#L65) (function)
  - [`GET`](src/app/api/cron/process-youtube-downloads/route.ts#L8) (function)
  - [`GET`](src/app/api/cron/process-music-stems/route.ts#L15) (function)
  - [`GET`](src/app/api/cron/posts/route.ts#L4) (function)
  - [`GET`](src/app/api/cron/fetch-story-insights/route.ts#L23) (function)
  - [`GET`](src/app/api/cron/fetch-later-analytics/route.ts#L18) (function)
  - [`GET`](src/app/api/cron/cleanup-db/route.ts#L4) (function)
  - [`GET`](src/app/api/cron/cleanup-blobs/route.ts#L7) (function)
  - [`GET`](src/app/api/cron/check-stuck-posts/route.ts#L9) (function)
  - [`GET`](src/app/api/cron/backup-database/route.ts#L13) (function)
  - [`GET`](src/app/api/cron/archive-expired-knowledge/route.ts#L14) (function)
  - [`GET`](src/app/api/cron/analytics/route.ts#L8) (function)
  - [`GET`](src/app/api/credits/settings/route.ts#L4) (function)
  - [`GET`](src/app/api/credits/me/route.ts#L6) (function)
  - [`GET`](src/app/api/cms/sections/route.ts#L30) (function)
  - [`POST`](src/app/api/cms/sections/route.ts#L62) (function)
  - [`PATCH`](src/app/api/cms/sections/route.ts#L103) (function)
  - [`GET`](src/app/api/cms/pages/route.ts#L23) (function)
  - [`POST`](src/app/api/cms/pages/route.ts#L54) (function)
  - [`GET`](src/app/api/cms/menus/route.ts#L18) (function)
  - [`POST`](src/app/api/cms/menus/route.ts#L40) (function)
  - [`POST`](src/app/api/cms/menu-items/route.ts#L21) (function)
  - [`GET`](src/app/api/cms/media/route.ts#L14) (function)
  - [`GET`](src/app/api/cms/components/route.ts#L22) (function)
  - [`POST`](src/app/api/cms/components/route.ts#L54) (function)
  - [`GET`](src/app/api/calendar/analytics/route.ts#L12) (function)
  - [`POST`](src/app/api/biblioteca-musicas/youtube/route.ts#L25) (function)
  - [`POST`](src/app/api/biblioteca-musicas/upload-url/route.ts#L12) (function)
  - [`POST`](src/app/api/biblioteca-musicas/confirm/route.ts#L10) (function)
  - [`GET`](src/app/api/biblioteca-musicas/buscar/route.ts#L10) (function)
  - [`GET`](src/app/api/biblioteca-musicas/[id]/route.ts#L9) (function)
  - [`PATCH`](src/app/api/biblioteca-musicas/[id]/route.ts#L50) (function)
  - [`DELETE`](src/app/api/biblioteca-musicas/[id]/route.ts#L100) (function)
  - [`GET`](src/app/api/ai/providers/route.ts#L53) (function)
  - [`GET`](src/app/api/ai/models/route.ts#L8) (function)
  - [`POST`](src/app/api/ai/image/route.ts#L62) (function)
  - [`POST`](src/app/api/ai/generate-image/route.ts#L78) (function)
  - [`POST`](src/app/api/ai/generate-creative/route.ts#L52) (function)
  - [`POST`](src/app/api/ai/conversations/route.ts#L15) (function)
  - [`GET`](src/app/api/ai/conversations/route.ts#L82) (function)
  - [`POST`](src/app/api/ai/chat/route.ts#L131) (function)
  - [`GET`](src/app/api/admin/verify/route.ts#L5) (function)
  - [`GET`](src/app/api/admin/users/route.ts#L7) (function)
  - [`GET`](src/app/api/admin/usage/route.ts#L7) (function)
  - [`GET`](src/app/api/admin/test-mvsep/route.ts#L12) (function)
  - [`GET`](src/app/api/admin/studio/route.ts#L7) (function)
  - [`monthEnd`](src/app/api/admin/studio/route.ts#L49) (function)
  - [`monthStart`](src/app/api/admin/studio/route.ts#L52) (function)
  - [`GET`](src/app/api/admin/storage/route.ts#L6) (function)
  - [`GET`](src/app/api/admin/site-settings/route.ts#L6) (function)
  - [`PATCH`](src/app/api/admin/site-settings/route.ts#L44) (function)
  - [`GET`](src/app/api/admin/settings/route.ts#L10) (function)
  - [`POST`](src/app/api/admin/settings/route.ts#L38) (function)
  - [`PUT`](src/app/api/admin/settings/route.ts#L91) (function)
  - [`GET`](src/app/api/admin/retry-all-failed/route.ts#L9) (function)
  - [`GET`](src/app/api/admin/plans/route.ts#L73) (function)
  - [`POST`](src/app/api/admin/plans/route.ts#L113) (function)
  - [`PUT`](src/app/api/admin/plans/route.ts#L226) (function)
  - [`DELETE`](src/app/api/admin/plans/route.ts#L329) (function)
  - [`GET`](src/app/api/admin/knowledge/route.ts#L59) (function)
  - [`POST`](src/app/api/admin/knowledge/route.ts#L140) (function)
  - [`GET`](src/app/api/admin/inspect-files/route.ts#L13) (function)
  - [`GET`](src/app/api/admin/feature-grid/route.ts#L18) (function)
  - [`POST`](src/app/api/admin/feature-grid/route.ts#L45) (function)
  - [`GET`](src/app/api/admin/feature-costs/route.ts#L10) (function)
  - [`PUT`](src/app/api/admin/feature-costs/route.ts#L36) (function)
  - [`GET`](src/app/api/admin/debug-stem-job/route.ts#L9) (function)
  - [`GET`](src/app/api/admin/debug-mvsep-response/route.ts#L11) (function)
  - [`GET`](src/app/api/admin/debug-mvsep-files/route.ts#L14) (function)
  - [`GET`](src/app/api/admin/credits/route.ts#L7) (function)
  - [`GET`](src/app/api/admin/clients/route.ts#L25) (function)
  - [`POST`](src/app/api/admin/clients/route.ts#L83) (function)
  - [`GET`](src/app/api/admin/client-projects/route.ts#L15) (function)
  - [`POST`](src/app/api/webhooks/instagram/story/route.ts#L25) (function)
  - [`POST`](src/app/api/webhooks/instagram/report/route.ts#L46) (function)
  - [`POST`](src/app/api/webhooks/instagram/feed/route.ts#L25) (function)
  - [`GET`](src/app/api/webhooks/buffer/test/route.ts#L7) (function)
  - [`POST`](src/app/api/webhooks/buffer/post-sent/route.ts#L9) (function)
  - [`GET`](src/app/api/video-processing/status/[jobId]/route.ts#L5) (function)
  - [`POST`](src/app/api/templates/[id]/thumbnail/route.ts#L13) (function)
  - [`GET`](src/app/api/templates/[id]/template-pages/route.ts#L10) (function)
  - [`GET`](src/app/api/templates/[id]/pages/route.ts#L17) (function)
  - [`POST`](src/app/api/templates/[id]/pages/route.ts#L82) (function)
  - [`POST`](src/app/api/templates/[id]/export/route.ts#L16) (function)
  - [`POST`](src/app/api/templates/[id]/duplicate/route.ts#L11) (function)
  - [`GET`](src/app/api/templates/[id]/creatives/route.ts#L21) (function)
  - [`DELETE`](src/app/api/templates/[id]/creatives/route.ts#L146) (function)
  - [`POST`](src/app/api/templates/[id]/create-from-template/route.ts#L26) (function)
  - [`POST`](src/app/api/projects/[projectId]/test-webhook/route.ts#L10) (function)
  - [`GET`](src/app/api/projects/[projectId]/templates/route.ts#L11) (function)
  - [`POST`](src/app/api/projects/[projectId]/templates/route.ts#L44) (function)
  - [`GET`](src/app/api/projects/[projectId]/stories-report/route.ts#L12) (function)
  - [`PATCH`](src/app/api/projects/[projectId]/settings/route.ts#L9) (function)
  - [`GET`](src/app/api/projects/[projectId]/prompts/route.ts#L7) (function)
  - [`POST`](src/app/api/projects/[projectId]/prompts/route.ts#L48) (function)
  - [`POST`](src/app/api/projects/[projectId]/posts/route.ts#L40) (function)
  - [`GET`](src/app/api/projects/[projectId]/posts/route.ts#L210) (function)
  - [`GET`](src/app/api/projects/[projectId]/logos/route.ts#L10) (function)
  - [`POST`](src/app/api/projects/[projectId]/logos/route.ts#L38) (function)
  - [`PATCH`](src/app/api/projects/[projectId]/instagram/route.ts#L14) (function)
  - [`GET`](src/app/api/projects/[projectId]/generations/route.ts#L11) (function)
  - [`GET`](src/app/api/projects/[projectId]/fonts/route.ts#L10) (function)
  - [`POST`](src/app/api/projects/[projectId]/fonts/route.ts#L38) (function)
  - [`GET`](src/app/api/projects/[projectId]/elements/route.ts#L10) (function)
  - [`POST`](src/app/api/projects/[projectId]/elements/route.ts#L38) (function)
  - [`GET`](src/app/api/projects/[projectId]/creatives/route.ts#L9) (function)
  - [`GET`](src/app/api/projects/[projectId]/colors/route.ts#L8) (function)
  - [`POST`](src/app/api/projects/[projectId]/colors/route.ts#L36) (function)
  - [`GET`](src/app/api/projects/[projectId]/analytics/route.ts#L18) (function)
  - [`GET`](src/app/api/projects/[projectId]/ai-images/route.ts#L6) (function)
  - [`GET`](src/app/api/posts/[postId]/status/route.ts#L8) (function)
  - [`GET`](src/app/api/posts/[postId]/analytics/route.ts#L19) (function)
  - [`POST`](src/app/api/posts/[postId]/analytics/route.ts#L81) (function)
  - [`POST`](src/app/api/organizations/webhooks/clerk/route.ts#L18) (function)
  - [`GET`](src/app/api/organizations/[orgId]/settings/route.ts#L19) (function)
  - [`PATCH`](src/app/api/organizations/[orgId]/settings/route.ts#L63) (function)
  - [`GET`](src/app/api/organizations/[orgId]/projects/route.ts#L14) (function)
  - [`POST`](src/app/api/organizations/[orgId]/projects/route.ts#L67) (function)
  - [`GET`](src/app/api/organizations/[orgId]/credits/route.ts#L18) (function)
  - [`POST`](src/app/api/organizations/[orgId]/credits/route.ts#L68) (function)
  - [`GET`](src/app/api/organizations/[orgId]/analytics/route.ts#L37) (function)
  - [`POST`](src/app/api/knowledge/training/preview/route.ts#L16) (function)
  - [`GET`](src/app/api/instagram/[projectId]/studio/route.ts#L5) (function)
  - [`GET`](src/app/api/google-drive/thumbnail/[fileId]/route.ts#L14) (function)
  - [`GET`](src/app/api/google-drive/image/[fileId]/route.ts#L9) (function)
  - [`GET`](src/app/api/generations/[id]/download/route.ts#L13) (function)
  - [`POST`](src/app/api/export/video/validate/route.ts#L10) (function)
  - [`POST`](src/app/api/export/video/upload-url/route.ts#L35) (function)
  - [`POST`](src/app/api/export/video/save/route.ts#L17) (function)
  - [`POST`](src/app/api/export/video/confirm/route.ts#L12) (function)
  - [`GET`](src/app/api/drive/folders/download/route.ts#L13) (function)
  - [`POST`](src/app/api/drive/folders/create/route.ts#L20) (function)
  - [`POST`](src/app/api/drive/files/upload/route.ts#L10) (function)
  - [`POST`](src/app/api/drive/files/move/route.ts#L14) (function)
  - [`DELETE`](src/app/api/drive/files/delete/route.ts#L13) (function)
  - [`GET`](src/app/api/debug/post/[postId]/route.ts#L8) (function)
  - [`GET`](src/app/api/cms/sections/[id]/route.ts#L23) (function)
  - [`PATCH`](src/app/api/cms/sections/[id]/route.ts#L54) (function)
  - [`DELETE`](src/app/api/cms/sections/[id]/route.ts#L91) (function)
  - [`GET`](src/app/api/cms/pages/[id]/route.ts#L26) (function)
  - [`PATCH`](src/app/api/cms/pages/[id]/route.ts#L57) (function)
  - [`DELETE`](src/app/api/cms/pages/[id]/route.ts#L97) (function)
  - [`GET`](src/app/api/cms/menus/[id]/route.ts#L18) (function)
  - [`PATCH`](src/app/api/cms/menus/[id]/route.ts#L49) (function)
  - [`DELETE`](src/app/api/cms/menus/[id]/route.ts#L86) (function)
  - [`PATCH`](src/app/api/cms/menu-items/reorder/route.ts#L20) (function)
  - [`PATCH`](src/app/api/cms/menu-items/[id]/route.ts#L20) (function)
  - [`DELETE`](src/app/api/cms/menu-items/[id]/route.ts#L57) (function)
  - [`POST`](src/app/api/cms/media/upload/route.ts#L14) (function)
  - [`POST`](src/app/api/cms/media/bulk-delete/route.ts#L16) (function)
  - [`GET`](src/app/api/cms/media/[id]/route.ts#L23) (function)
  - [`PATCH`](src/app/api/cms/media/[id]/route.ts#L51) (function)
  - [`DELETE`](src/app/api/cms/media/[id]/route.ts#L85) (function)
  - [`GET`](src/app/api/cms/components/[id]/route.ts#L25) (function)
  - [`PATCH`](src/app/api/cms/components/[id]/route.ts#L53) (function)
  - [`DELETE`](src/app/api/cms/components/[id]/route.ts#L87) (function)
  - [`GET`](src/app/api/biblioteca-musicas/youtube/metadata/route.ts#L17) (function)
  - [`GET`](src/app/api/biblioteca-musicas/youtube/jobs/route.ts#L5) (function)
  - [`DELETE`](src/app/api/biblioteca-musicas/youtube/[jobId]/route.ts#L5) (function)
  - [`GET`](src/app/api/biblioteca-musicas/[id]/stem-status/route.ts#L9) (function)
  - [`POST`](src/app/api/biblioteca-musicas/[id]/reprocess-stem/route.ts#L10) (function)
  - [`GET`](src/app/api/biblioteca-musicas/[id]/download-zip/route.ts#L13) (function)
  - [`GET`](src/app/api/ai/openrouter/models/route.ts#L41) (function)
  - [`GET`](src/app/api/ai/creative-page/[pageId]/route.ts#L9) (function)
  - [`POST`](src/app/api/ai/conversations/cleanup/route.ts#L25) (function)
  - [`GET`](src/app/api/ai/conversations/cleanup/route.ts#L72) (function)
  - [`GET`](src/app/api/ai/conversations/[id]/route.ts#L8) (function)
  - [`DELETE`](src/app/api/ai/conversations/[id]/route.ts#L79) (function)
  - [`PATCH`](src/app/api/ai/conversations/[id]/route.ts#L130) (function)
  - [`POST`](src/app/api/admin/verify-story/[postId]/route.ts#L30) (function)
  - [`POST`](src/app/api/admin/users/sync/route.ts#L12) (function)
  - [`fetchActivePlanIdForUser`](src/app/api/admin/users/sync/route.ts#L46) (function)
  - [`POST`](src/app/api/admin/users/invite/route.ts#L17) (function)
  - [`GET`](src/app/api/admin/users/invitations/route.ts#L8) (function)
  - [`DELETE`](src/app/api/admin/users/[id]/route.ts#L7) (function)
  - [`PUT`](src/app/api/admin/users/[id]/route.ts#L54) (function)
  - [`DELETE`](src/app/api/admin/storage/[id]/route.ts#L7) (function)
  - [`POST`](src/app/api/admin/plans/refresh-pricing/route.ts#L9) (function)
  - [`PUT`](src/app/api/admin/plans/[clerkId]/route.ts#L61) (function)
  - [`DELETE`](src/app/api/admin/plans/[clerkId]/route.ts#L133) (function)
  - [`GET`](src/app/api/admin/knowledge/migrate-workspace/route.ts#L15) (function)
  - [`POST`](src/app/api/admin/knowledge/migrate-workspace/route.ts#L73) (function)
  - [`GET`](src/app/api/admin/knowledge/[id]/route.ts#L47) (function)
  - [`PUT`](src/app/api/admin/knowledge/[id]/route.ts#L89) (function)
  - [`DELETE`](src/app/api/admin/knowledge/[id]/route.ts#L156) (function)
  - [`GET`](src/app/api/admin/health/credits-enum/route.ts#L9) (function)
  - [`GET`](src/app/api/admin/feature-grid/[id]/route.ts#L22) (function)
  - [`PUT`](src/app/api/admin/feature-grid/[id]/route.ts#L58) (function)
  - [`DELETE`](src/app/api/admin/feature-grid/[id]/route.ts#L103) (function)
  - [`PUT`](src/app/api/admin/credits/[id]/route.ts#L7) (function)
  - [`GET`](src/app/api/admin/clients/[id]/route.ts#L11) (function)
  - [`PATCH`](src/app/api/admin/clients/[id]/route.ts#L34) (function)
  - [`GET`](src/app/api/admin/client-projects/[projectId]/route.ts#L18) (function)
  - [`PATCH`](src/app/api/admin/client-projects/[projectId]/route.ts#L43) (function)
  - [`GET`](src/app/api/admin/clerk/plans/route.ts#L6) (function)
  - [`POST`](src/app/api/templates/[id]/pages/reorder/route.ts#L15) (function)
  - [`GET`](src/app/api/templates/[id]/pages/[pageId]/route.ts#L22) (function)
  - [`PATCH`](src/app/api/templates/[id]/pages/[pageId]/route.ts#L71) (function)
  - [`DELETE`](src/app/api/templates/[id]/pages/[pageId]/route.ts#L142) (function)
  - [`DELETE`](src/app/api/projects/[projectId]/prompts/[promptId]/route.ts#L10) (function)
  - [`GET`](src/app/api/projects/[projectId]/posts/next-scheduled/route.ts#L10) (function)
  - [`GET`](src/app/api/projects/[projectId]/posts/calendar/route.ts#L6) (function)
  - [`GET`](src/app/api/projects/[projectId]/posts/[postId]/route.ts#L24) (function)
  - [`PUT`](src/app/api/projects/[projectId]/posts/[postId]/route.ts#L87) (function)
  - [`DELETE`](src/app/api/projects/[projectId]/posts/[postId]/route.ts#L364) (function)
  - [`PATCH`](src/app/api/projects/[projectId]/logos/[logoId]/route.ts#L12) (function)
  - [`DELETE`](src/app/api/projects/[projectId]/logos/[logoId]/route.ts#L66) (function)
  - [`GET`](src/app/api/projects/[projectId]/google-drive/images/route.ts#L14) (function)
  - [`POST`](src/app/api/projects/[projectId]/google-drive/download/route.ts#L16) (function)
  - [`POST`](src/app/api/projects/[projectId]/generations/carousel/route.ts#L12) (function)
  - [`GenerationWithTemplate`](src/app/api/projects/[projectId]/generations/carousel/route.ts#L84) (type)
  - [`DELETE`](src/app/api/projects/[projectId]/fonts/[fontId]/route.ts#L12) (function)
  - [`DELETE`](src/app/api/projects/[projectId]/elements/[elementId]/route.ts#L12) (function)
  - [`DELETE`](src/app/api/projects/[projectId]/colors/[colorId]/route.ts#L11) (function)
  - [`DELETE`](src/app/api/projects/[projectId]/ai-images/[imageId]/route.ts#L11) (function)
  - [`PATCH`](src/app/api/pages/[pageId]/layers/[layerId]/route.ts#L10) (function)
  - [`DELETE`](src/app/api/organizations/[orgId]/projects/[projectId]/route.ts#L8) (function)
  - [`GET`](src/app/api/organizations/[orgId]/credits/usage/route.ts#L9) (function)
  - [`GET`](src/app/api/organizations/[orgId]/analytics/timeline/route.ts#L48) (function)
  - [`GET`](src/app/api/organizations/[orgId]/analytics/members/route.ts#L44) (function)
  - [`POST`](src/app/api/cms/sections/[id]/toggle-visibility/route.ts#L9) (function)
  - [`POST`](src/app/api/cms/sections/[id]/duplicate/route.ts#L9) (function)
  - [`POST`](src/app/api/cms/pages/[id]/publish/route.ts#L9) (function)
  - [`POST`](src/app/api/cms/pages/[id]/duplicate/route.ts#L9) (function)
  - [`GET`](src/app/api/cms/menus/[id]/items/route.ts#L9) (function)
  - [`GET`](src/app/api/biblioteca-musicas/youtube/[jobId]/status/route.ts#L5) (function)
  - [`PUT`](src/app/api/admin/users/[id]/credits/route.ts#L7) (function)
  - [`POST`](src/app/api/admin/users/[id]/activate/route.ts#L6) (function)
  - [`POST`](src/app/api/admin/knowledge/[id]/reindex/route.ts#L37) (function)
  - [`POST`](src/app/api/admin/clients/[id]/resend/route.ts#L10) (function)
  - [`POST`](src/app/api/admin/clients/[id]/cancel/route.ts#L12) (function)
  - [`PATCH`](src/app/api/templates/[id]/pages/[pageId]/toggle-template/route.ts#L15) (function)
  - [`POST`](src/app/api/templates/[id]/pages/[pageId]/duplicate/route.ts#L10) (function)
  - [`POST`](src/app/api/admin/users/invitations/[id]/revoke/route.ts#L7) (function)
  - [`POST`](src/app/api/admin/users/invitations/[id]/resend/route.ts#L7) (function)

### Models
Data structures and domain objects
- **Directories**: `src/lib/ai`, `src/components/ai`
- **Symbols**: 9 total, 7 exported
- **Key exports**:
  - [`AIImageModel`](src/lib/ai/image-models-config.ts#L7) (type)
  - [`AIImageMode`](src/lib/ai/image-models-config.ts#L17) (type)
  - [`AIImageModelConfig`](src/lib/ai/image-models-config.ts#L19) (interface)
  - [`getRecommendedModel`](src/lib/ai/image-models-config.ts#L359) (function)
  - [`getModelById`](src/lib/ai/image-models-config.ts#L364) (function)
  - [`calculateCreditsForModel`](src/lib/ai/image-models-config.ts#L369) (function)
  - [`getAvailableModels`](src/lib/ai/image-models-config.ts#L385) (function)

### Generators
Content and object generation
- **Directories**: `src/components/ai-creative-generator`, `src/components/ai-creative-generator/tabs`
- **Symbols**: 32 total, 8 exported
- **Key exports**:
  - [`TextFieldsForm`](src/components/ai-creative-generator/text-fields-form.tsx#L28) (function)
  - [`Step`](src/components/ai-creative-generator/stepper.tsx#L6) (interface)
  - [`LayoutSelector`](src/components/ai-creative-generator/layout-selector.tsx#L11) (function)
  - [`ImageSourceTabs`](src/components/ai-creative-generator/image-source-tabs.tsx#L21) (function)
  - [`LocalUploadTab`](src/components/ai-creative-generator/tabs/local-upload-tab.tsx#L12) (function)
  - [`AIGenerationTab`](src/components/ai-creative-generator/tabs/ai-generation-tab.tsx#L22) (function)
  - [`handleGenerate`](src/components/ai-creative-generator/tabs/ai-generation-tab.tsx#L53) (function)
  - [`handleSelectGenerated`](src/components/ai-creative-generator/tabs/ai-generation-tab.tsx#L140) (function)


## Detected Design Patterns
| Pattern | Confidence | Locations | Description |
|---------|------------|-----------|-------------|
| Service Layer | 85% | `GoogleDriveService` ([google-drive-service.ts](src/server/google-drive-service.ts)) | Encapsulates business logic in service classes |

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

## Public API
| Symbol | Type | Location |
| --- | --- | --- |
| [`addUserCredits`](src/lib/credits/validate-credits.ts#L99) | function | src/lib/credits/validate-credits.ts:99 |
| [`AdminPagesPage`](src/app/admin/content/pages/page.tsx#L18) | function | src/app/admin/content/pages/page.tsx:18 |
| [`AdminSettings`](src/hooks/use-admin-settings.ts#L6) | interface | src/hooks/use-admin-settings.ts:6 |
| [`AdminSettingsPage`](src/app/admin/settings/page.tsx#L8) | function | src/app/admin/settings/page.tsx:8 |
| [`AdminSettingsPayload`](src/lib/credits/settings.ts#L4) | type | src/lib/credits/settings.ts:4 |
| [`AdminSidebar`](src/components/admin/admin-sidebar.tsx#L90) | function | src/components/admin/admin-sidebar.tsx:90 |
| [`AdminTopbar`](src/components/admin/admin-topbar.tsx#L8) | function | src/components/admin/admin-topbar.tsx:8 |
| [`AgendaCalendarView`](src/components/agenda/calendar/agenda-calendar-view.tsx#L68) | function | src/components/agenda/calendar/agenda-calendar-view.tsx:68 |
| [`AgendaPage`](src/app/(protected)/agenda/page.tsx#L7) | function | src/app/(protected)/agenda/page.tsx:7 |
| [`AIGenerationTab`](src/components/ai-creative-generator/tabs/ai-generation-tab.tsx#L22) | function | src/components/ai-creative-generator/tabs/ai-generation-tab.tsx:22 |
| [`AIImageMode`](src/lib/ai/image-models-config.ts#L17) | type | src/lib/ai/image-models-config.ts:17 |
| [`AIImageModel`](src/lib/ai/image-models-config.ts#L7) | type | src/lib/ai/image-models-config.ts:7 |
| [`AIImageModelConfig`](src/lib/ai/image-models-config.ts#L19) | interface | src/lib/ai/image-models-config.ts:19 |
| [`AIProvider`](src/hooks/use-ai-providers.ts#L6) | interface | src/hooks/use-ai-providers.ts:6 |
| [`AIProvider`](src/lib/ai/token-limits.ts#L43) | type | src/lib/ai/token-limits.ts:43 |
| [`AIProvidersResponse`](src/hooks/use-ai-providers.ts#L13) | interface | src/hooks/use-ai-providers.ts:13 |
| [`AIStarter`](src/components/marketing/ai-starter.tsx#L6) | function | src/components/marketing/ai-starter.tsx:6 |
| [`AIStarterEditor`](src/components/admin/cms/editors/ai-starter-editor.tsx#L12) | function | src/components/admin/cms/editors/ai-starter-editor.tsx:12 |
| [`Alert`](src/lib/instagram/types.ts#L14) | interface | src/lib/instagram/types.ts:14 |
| [`alignBottom`](src/lib/konva-alignment.ts#L147) | function | src/lib/konva-alignment.ts:147 |
| [`alignCenterH`](src/lib/konva-alignment.ts#L45) | function | src/lib/konva-alignment.ts:45 |
| [`alignLeft`](src/lib/konva-alignment.ts#L20) | function | src/lib/konva-alignment.ts:20 |
| [`AlignmentNode`](src/lib/konva-alignment.ts#L11) | interface | src/lib/konva-alignment.ts:11 |
| [`alignMiddleV`](src/lib/konva-alignment.ts#L122) | function | src/lib/konva-alignment.ts:122 |
| [`alignRight`](src/lib/konva-alignment.ts#L71) | function | src/lib/konva-alignment.ts:71 |
| [`alignToCanvasCenterH`](src/lib/konva-alignment.ts#L273) | function | src/lib/konva-alignment.ts:273 |
| [`alignToCanvasCenterV`](src/lib/konva-alignment.ts#L353) | function | src/lib/konva-alignment.ts:353 |
| [`alignTop`](src/lib/konva-alignment.ts#L99) | function | src/lib/konva-alignment.ts:99 |
| [`AnalyticsConfig`](src/lib/brand-config.ts#L14) | type | src/lib/brand-config.ts:14 |
| [`AnalyticsExport`](src/components/analytics/analytics-export.tsx#L21) | function | src/components/analytics/analytics-export.tsx:21 |
| [`AnalyticsOverviewCards`](src/components/analytics/analytics-overview-cards.tsx#L18) | function | src/components/analytics/analytics-overview-cards.tsx:18 |
| [`AnalyticsPeriodKey`](src/lib/organizations/analytics.ts#L4) | type | src/lib/organizations/analytics.ts:4 |
| [`AnalyticsPeriodRange`](src/lib/organizations/analytics.ts#L6) | type | src/lib/organizations/analytics.ts:6 |
| [`AnalyticsQueryParams`](src/lib/later/types.ts#L320) | interface | src/lib/later/types.ts:320 |
| [`AnalyticsSummaryCardsProps`](src/components/organization/analytics-summary-cards.tsx#L32) | interface | src/components/organization/analytics-summary-cards.tsx:32 |
| [`apiClient`](src/lib/api-client.ts#L20) | function | src/lib/api-client.ts:20 |
| [`ApiError`](src/lib/api-client.ts#L6) | class | src/lib/api-client.ts:6 |
| [`appendTagToCaption`](src/lib/posts/verification/tag-generator.ts#L27) | function | src/lib/posts/verification/tag-generator.ts:27 |
| [`ApplyPresetOptions`](src/hooks/use-text-presets.ts#L25) | interface | src/hooks/use-text-presets.ts:25 |
| [`applyTextTransform`](src/lib/text-presets.ts#L248) | function | src/lib/text-presets.ts:248 |
| [`AppShell`](src/components/app/app-shell.tsx#L10) | function | src/components/app/app-shell.tsx:10 |
| [`archivePage`](src/lib/cms/mutations.ts#L112) | function | src/lib/cms/mutations.ts:112 |
| [`assertRateLimit`](src/lib/rate-limit.ts#L74) | function | src/lib/rate-limit.ts:74 |
| [`AtualizarMusicaData`](src/hooks/use-music-library.ts#L43) | interface | src/hooks/use-music-library.ts:43 |
| [`AudioConfig`](src/components/audio/audio-selection-modal.tsx#L35) | interface | src/components/audio/audio-selection-modal.tsx:35 |
| [`AudioPlayerProvider`](src/contexts/audio-player-context.tsx#L26) | function | src/contexts/audio-player-context.tsx:26 |
| [`AudioVersion`](src/components/audio/audio-selection-modal.tsx#L33) | type | src/components/audio/audio-selection-modal.tsx:33 |
| [`AudioWaveformTimeline`](src/components/audio/audio-waveform-timeline.tsx#L22) | function | src/components/audio/audio-waveform-timeline.tsx:22 |
| [`AutocompleteItem`](src/components/ui/autocomplete.tsx#L10) | type | src/components/ui/autocomplete.tsx:10 |
| [`BackgroundEffect`](src/lib/konva/effects/BackgroundEffect.ts#L9) | class | src/lib/konva/effects/BackgroundEffect.ts:9 |
| [`BackgroundEffectConfig`](src/lib/konva/effects/types.ts#L25) | interface | src/lib/konva/effects/types.ts:25 |
| [`BackgroundPreset`](src/lib/assets/background-presets.ts#L3) | interface | src/lib/assets/background-presets.ts:3 |
| [`BackgroundsPanel`](src/components/templates/sidebar/backgrounds-panel.tsx#L9) | function | src/components/templates/sidebar/backgrounds-panel.tsx:9 |
| [`BentoGridEditor`](src/components/admin/cms/editors/bento-grid-editor.tsx#L15) | function | src/components/admin/cms/editors/bento-grid-editor.tsx:15 |
| [`BillingPeriod`](src/components/plans/pricing-utils.ts#L3) | type | src/components/plans/pricing-utils.ts:3 |
| [`BillingPlan`](src/components/admin/plans/types.ts#L4) | type | src/components/admin/plans/types.ts:4 |
| [`BlurEffect`](src/lib/konva/effects/BlurEffect.ts#L9) | class | src/lib/konva/effects/BlurEffect.ts:9 |
| [`BlurEffectConfig`](src/lib/konva/effects/types.ts#L5) | interface | src/lib/konva/effects/types.ts:5 |
| [`BorderStyle`](src/types/template.ts#L128) | interface | src/types/template.ts:128 |
| [`BrandAssets`](src/lib/ai-creative-generator/layout-types.ts#L39) | interface | src/lib/ai-creative-generator/layout-types.ts:39 |
| [`BreadcrumbItem`](src/contexts/page-metadata.tsx#L5) | interface | src/contexts/page-metadata.tsx:5 |
| [`bringToFront`](src/lib/konva-alignment.ts#L420) | function | src/lib/konva-alignment.ts:420 |
| [`buildCreditsInsights`](src/app/(protected)/organization/[orgId]/page.tsx#L263) | function | src/app/(protected)/organization/[orgId]/page.tsx:263 |
| [`buildKonvaLayers`](src/lib/ai-creative-generator/template-page-builder.ts#L42) | function | src/lib/ai-creative-generator/template-page-builder.ts:42 |
| [`BuildLayersResult`](src/lib/ai-creative-generator/template-page-builder.ts#L37) | interface | src/lib/ai-creative-generator/template-page-builder.ts:37 |
| [`buildPlanTiers`](src/components/plans/plan-tier-config.tsx#L91) | function | src/components/plans/plan-tier-config.tsx:91 |
| [`bulkDeleteMedia`](src/lib/cms/mutations.ts#L528) | function | src/lib/cms/mutations.ts:528 |
| [`calculateContainScale`](src/lib/image-crop-utils.ts#L137) | function | src/lib/image-crop-utils.ts:137 |
| [`calculateContextTokens`](src/lib/ai/token-limits.ts#L84) | function | src/lib/ai/token-limits.ts:84 |
| [`calculateCoverScale`](src/lib/image-crop-utils.ts#L154) | function | src/lib/image-crop-utils.ts:154 |
| [`calculateCreditsForModel`](src/lib/ai/image-models-config.ts#L369) | function | src/lib/ai/image-models-config.ts:369 |
| [`calculateImageCrop`](src/lib/image-crop-utils.ts#L58) | function | src/lib/image-crop-utils.ts:58 |
| [`calculateTextHeight`](src/lib/text-presets.ts#L240) | function | src/lib/text-presets.ts:240 |
| [`cancelClientInvite`](src/lib/services/client-invite-service.ts#L252) | function | src/lib/services/client-invite-service.ts:252 |
| [`CanvasConfig`](src/types/template.ts#L7) | interface | src/types/template.ts:7 |
| [`CanvasPreview`](src/components/templates/canvas-preview.tsx#L17) | function | src/components/templates/canvas-preview.tsx:17 |
| [`CanvasRenderer`](src/lib/canvas-renderer.ts#L11) | class | src/lib/canvas-renderer.ts:11 |
| [`CanvasRendererOptions`](src/lib/rendering/canvas-renderer.ts#L10) | interface | src/lib/rendering/canvas-renderer.ts:10 |
| [`CanvasRenderResult`](src/lib/rendering/canvas-renderer.ts#L17) | interface | src/lib/rendering/canvas-renderer.ts:17 |
| [`ChatConversation`](src/hooks/use-conversations.ts#L17) | interface | src/hooks/use-conversations.ts:17 |
| [`ChatEmptyState`](src/components/chat/chat-empty-state.tsx#L45) | function | src/components/chat/chat-empty-state.tsx:45 |
| [`ChatMessage`](src/hooks/use-conversations.ts#L5) | interface | src/hooks/use-conversations.ts:5 |
| [`ChatMessage`](src/components/chat/message-bubble.tsx#L13) | type | src/components/chat/message-bubble.tsx:13 |
| [`checkMvsepJobStatus`](src/lib/mvsep/mvsep-client.ts#L136) | function | src/lib/mvsep/mvsep-client.ts:136 |
| [`checkRateLimit`](src/lib/rate-limit.ts#L41) | function | src/lib/rate-limit.ts:41 |
| [`checkYoutubeDownloadStatus`](src/lib/youtube/video-download-client.ts#L40) | function | src/lib/youtube/video-download-client.ts:40 |
| [`Chunk`](src/lib/knowledge/chunking.ts#L14) | interface | src/lib/knowledge/chunking.ts:14 |
| [`chunkText`](src/lib/knowledge/chunking.ts#L26) | function | src/lib/knowledge/chunking.ts:26 |
| [`classifyCategory`](src/lib/knowledge/classify-category.ts#L110) | function | src/lib/knowledge/classify-category.ts:110 |
| [`classifyIntent`](src/lib/knowledge/classify-intent.ts#L82) | function | src/lib/knowledge/classify-intent.ts:82 |
| [`cleanupExpiredBlobs`](src/lib/cleanup/blob-cleanup.ts#L16) | function | src/lib/cleanup/blob-cleanup.ts:16 |
| [`clearAllCache`](src/lib/knowledge/cache.ts#L362) | function | src/lib/knowledge/cache.ts:362 |
| [`ClerkOrganizationPayload`](src/lib/organizations/service.ts#L10) | interface | src/lib/organizations/service.ts:10 |
| [`ClerkPlan`](src/hooks/use-admin-plans.ts#L32) | type | src/hooks/use-admin-plans.ts:32 |
| [`ClerkPlanFeature`](src/lib/clerk/commerce-plan-types.ts#L8) | interface | src/lib/clerk/commerce-plan-types.ts:8 |
| [`ClerkPlanMoney`](src/lib/clerk/commerce-plan-types.ts#L1) | interface | src/lib/clerk/commerce-plan-types.ts:1 |
| [`ClerkPlanNormalized`](src/lib/clerk/commerce-plan-types.ts#L16) | interface | src/lib/clerk/commerce-plan-types.ts:16 |
| [`ClerkPlansResponse`](src/hooks/use-admin-plans.ts#L38) | interface | src/hooks/use-admin-plans.ts:38 |
| [`ClientInvite`](src/hooks/admin/use-client-invites.ts#L25) | interface | src/hooks/admin/use-client-invites.ts:25 |
| [`ClientInviteFilters`](src/lib/validations/client-invite.ts#L89) | type | src/lib/validations/client-invite.ts:89 |
| [`ClientInviteStatus`](src/lib/validations/client-invite.ts#L90) | type | src/lib/validations/client-invite.ts:90 |
| [`ClientInviteSummaryProject`](src/hooks/admin/use-client-invites.ts#L20) | interface | src/hooks/admin/use-client-invites.ts:20 |
| [`ClientInviteSummaryUser`](src/hooks/admin/use-client-invites.ts#L14) | interface | src/hooks/admin/use-client-invites.ts:14 |
| [`ClientInviteWithRelations`](src/lib/services/client-invite-service.ts#L99) | type | src/lib/services/client-invite-service.ts:99 |
| [`ClientProject`](src/hooks/admin/use-client-projects.ts#L24) | interface | src/hooks/admin/use-client-projects.ts:24 |
| [`ClientProjectDetailsPage`](src/app/admin/client-projects/[projectId]/page.tsx#L17) | function | src/app/admin/client-projects/[projectId]/page.tsx:17 |
| [`ClientProjectFilters`](src/lib/validations/client-project.ts#L63) | type | src/lib/validations/client-project.ts:63 |
| [`ClientProjectInviteSummary`](src/hooks/admin/use-client-projects.ts#L11) | interface | src/hooks/admin/use-client-projects.ts:11 |
| [`ClientProjectWithRelations`](src/lib/services/client-project-service.ts#L22) | type | src/lib/services/client-project-service.ts:22 |
| [`ClientStatsCards`](src/app/admin/clients/_components/client-stats-cards.tsx#L28) | function | src/app/admin/clients/_components/client-stats-cards.tsx:28 |
| [`clonePreset`](src/lib/text-presets.ts#L269) | function | src/lib/text-presets.ts:269 |
| [`CMSComponent`](src/hooks/admin/use-admin-components.ts#L8) | type | src/hooks/admin/use-admin-components.ts:8 |
| [`CMSCustom`](src/components/cms/sections/cms-custom.tsx#L11) | function | src/components/cms/sections/cms-custom.tsx:11 |
| [`CMSMedia`](src/hooks/admin/use-admin-media.ts#L8) | type | src/hooks/admin/use-admin-media.ts:8 |
| [`CMSMenu`](src/hooks/admin/use-admin-menus.ts#L8) | type | src/hooks/admin/use-admin-menus.ts:8 |
| [`CMSMenuItem`](src/hooks/admin/use-admin-menus.ts#L19) | type | src/hooks/admin/use-admin-menus.ts:19 |
| [`CMSPage`](src/hooks/admin/use-admin-cms.ts#L18) | type | src/hooks/admin/use-admin-cms.ts:18 |
| [`CMSPageStatus`](src/hooks/admin/use-admin-cms.ts#L8) | type | src/hooks/admin/use-admin-cms.ts:8 |
| [`CMSSection`](src/hooks/admin/use-admin-cms.ts#L37) | type | src/hooks/admin/use-admin-cms.ts:37 |
| [`CMSSectionRenderer`](src/components/cms/cms-section-renderer.tsx#L23) | function | src/components/cms/cms-section-renderer.tsx:23 |
| [`CMSSectionType`](src/hooks/admin/use-admin-cms.ts#L9) | type | src/hooks/admin/use-admin-cms.ts:9 |
| [`cn`](src/lib/utils.ts#L4) | function | src/lib/utils.ts:4 |
| [`collectMemberUsageStats`](src/lib/organizations/analytics.ts#L121) | function | src/lib/organizations/analytics.ts:121 |
| [`computeAlignmentGuides`](src/lib/konva-smart-guides.ts#L297) | function | src/lib/konva-smart-guides.ts:297 |
| [`Config`](prisma/generated/client/runtime/index-browser.d.ts#L31) | interface | prisma/generated/client/runtime/index-browser.d.ts:31 |
| [`Constructor`](prisma/generated/client/runtime/index-browser.d.ts#L24) | type | prisma/generated/client/runtime/index-browser.d.ts:24 |
| [`ConversationsResponse`](src/hooks/use-conversations.ts#L34) | interface | src/hooks/use-conversations.ts:34 |
| [`ConversionOptions`](src/lib/video/ffmpeg-server-converter.ts#L14) | type | src/lib/video/ffmpeg-server-converter.ts:14 |
| [`ConversionProgress`](src/lib/video/ffmpeg-server-converter.ts#L7) | type | src/lib/video/ffmpeg-server-converter.ts:7 |
| [`convertWebMToMP4`](src/lib/video/ffmpeg-converter.ts#L68) | function | src/lib/video/ffmpeg-converter.ts:68 |
| [`convertWebMToMP4ServerSide`](src/lib/video/ffmpeg-server-converter.ts#L228) | function | src/lib/video/ffmpeg-server-converter.ts:228 |
| [`CookieConsent`](src/components/app/cookie-consent.tsx#L21) | function | src/components/app/cookie-consent.tsx:21 |
| [`copyToClipboard`](src/lib/copy-to-clipboard.ts#L7) | function | src/lib/copy-to-clipboard.ts:7 |
| [`createAuthErrorResponse`](src/lib/auth-utils.ts#L21) | function | src/lib/auth-utils.ts:21 |
| [`createBlankDesign`](src/lib/studio/defaults.ts#L44) | function | src/lib/studio/defaults.ts:44 |
| [`CreateClientInviteInput`](src/lib/validations/client-invite.ts#L87) | type | src/lib/validations/client-invite.ts:87 |
| [`createClientInviteRecord`](src/lib/services/client-invite-service.ts#L156) | function | src/lib/services/client-invite-service.ts:156 |
| [`CreateClientInviteRecordParams`](src/lib/services/client-invite-service.ts#L148) | interface | src/lib/services/client-invite-service.ts:148 |
| [`createComponent`](src/lib/cms/mutations.ts#L440) | function | src/lib/cms/mutations.ts:440 |
| [`CreateComponentInput`](src/lib/cms/mutations.ts#L416) | type | src/lib/cms/mutations.ts:416 |
| [`CreateComponentInput`](src/hooks/admin/use-admin-components.ts#L22) | type | src/hooks/admin/use-admin-components.ts:22 |
| [`createDateKey`](src/components/agenda/calendar/calendar-utils.ts#L9) | function | src/components/agenda/calendar/calendar-utils.ts:9 |
| [`createDebouncedThumbnailGenerator`](src/lib/page-thumbnail-utils.ts#L94) | function | src/lib/page-thumbnail-utils.ts:94 |
| [`createDisambiguationState`](src/lib/knowledge/disambiguation.ts#L120) | function | src/lib/knowledge/disambiguation.ts:120 |
| [`CreateEntryInput`](src/hooks/admin/use-admin-knowledge.ts#L55) | interface | src/hooks/admin/use-admin-knowledge.ts:55 |
| [`createErrorResponse`](src/lib/api-auth.ts#L79) | function | src/lib/api-auth.ts:79 |
| [`CreateFeatureGridItemData`](src/hooks/admin/use-admin-feature-grid.ts#L19) | type | src/hooks/admin/use-admin-feature-grid.ts:19 |
| [`createId`](src/lib/id.ts#L1) | function | src/lib/id.ts:1 |
| [`CreateLaterPostPayload`](src/lib/later/types.ts#L109) | interface | src/lib/later/types.ts:109 |
| [`createMedia`](src/lib/cms/mutations.ts#L500) | function | src/lib/cms/mutations.ts:500 |
| [`createMediaFormData`](src/lib/later/media-upload.ts#L226) | function | src/lib/later/media-upload.ts:226 |
| [`CreateMediaInput`](src/lib/cms/mutations.ts#L475) | type | src/lib/cms/mutations.ts:475 |
| [`createMenu`](src/lib/cms/mutations.ts#L331) | function | src/lib/cms/mutations.ts:331 |
| [`CreateMenuInput`](src/lib/cms/mutations.ts#L293) | type | src/lib/cms/mutations.ts:293 |
| [`CreateMenuInput`](src/hooks/admin/use-admin-menus.ts#L34) | type | src/hooks/admin/use-admin-menus.ts:34 |
| [`createMenuItem`](src/lib/cms/mutations.ts#L365) | function | src/lib/cms/mutations.ts:365 |
| [`CreateMenuItemInput`](src/lib/cms/mutations.ts#L307) | type | src/lib/cms/mutations.ts:307 |
| [`CreateMenuItemInput`](src/hooks/admin/use-admin-menus.ts#L48) | type | src/hooks/admin/use-admin-menus.ts:48 |
| [`CreateOrgEntryInput`](src/hooks/use-org-knowledge.ts#L17) | interface | src/hooks/use-org-knowledge.ts:17 |
| [`createPage`](src/lib/cms/mutations.ts#L40) | function | src/lib/cms/mutations.ts:40 |
| [`CreatePageInput`](src/lib/cms/mutations.ts#L11) | type | src/lib/cms/mutations.ts:11 |
| [`CreatePageInput`](src/hooks/admin/use-admin-cms.ts#L51) | type | src/hooks/admin/use-admin-cms.ts:51 |
| [`CreatePromptData`](src/types/prompt.ts#L14) | interface | src/types/prompt.ts:14 |
| [`createSection`](src/lib/cms/mutations.ts#L197) | function | src/lib/cms/mutations.ts:197 |
| [`CreateSectionInput`](src/lib/cms/mutations.ts#L175) | type | src/lib/cms/mutations.ts:175 |
| [`CreateSectionInput`](src/hooks/admin/use-admin-cms.ts#L75) | type | src/hooks/admin/use-admin-cms.ts:75 |
| [`createSuccessResponse`](src/lib/api-auth.ts#L72) | function | src/lib/api-auth.ts:72 |
| [`CreateTemplateData`](src/hooks/use-templates.ts#L37) | interface | src/hooks/use-templates.ts:37 |
| [`createUnauthorizedResponse`](src/lib/api-auth.ts#L65) | function | src/lib/api-auth.ts:65 |
| [`Creative`](src/hooks/use-template-creatives.ts#L13) | interface | src/hooks/use-template-creatives.ts:13 |
| [`CreativeFieldValues`](src/hooks/use-template-creatives.ts#L4) | interface | src/hooks/use-template-creatives.ts:4 |
| [`CreativesLightbox`](src/components/templates/creatives-lightbox.tsx#L15) | function | src/components/templates/creatives-lightbox.tsx:15 |
| [`CreditActivityEntry`](src/components/organization/credit-activity-feed.tsx#L9) | type | src/components/organization/credit-activity-feed.tsx:9 |
| [`CreditActivityFeedProps`](src/components/organization/credit-activity-feed.tsx#L20) | interface | src/components/organization/credit-activity-feed.tsx:20 |
| [`CreditBalance`](src/hooks/admin/use-admin-credits.ts#L7) | interface | src/hooks/admin/use-admin-credits.ts:7 |
| [`CreditData`](src/hooks/use-credits.ts#L29) | interface | src/hooks/use-credits.ts:29 |
| [`CreditsParams`](src/hooks/admin/use-admin-credits.ts#L31) | interface | src/hooks/admin/use-admin-credits.ts:31 |
| [`CreditsResponse`](src/hooks/admin/use-admin-credits.ts#L21) | interface | src/hooks/admin/use-admin-credits.ts:21 |
| [`CreditUsageCardProps`](src/components/organization/credit-usage-card.tsx#L16) | interface | src/components/organization/credit-usage-card.tsx:16 |
| [`CriarMusicaData`](src/hooks/use-music-library.ts#L33) | interface | src/hooks/use-music-library.ts:33 |
| [`CropData`](src/lib/image-crop-utils.ts#L27) | interface | src/lib/image-crop-utils.ts:27 |
| [`CropPosition`](src/lib/image-crop-utils.ts#L11) | type | src/lib/image-crop-utils.ts:11 |
| [`cropToInstagramFeed`](src/lib/images/auto-crop.ts#L7) | function | src/lib/images/auto-crop.ts:7 |
| [`CTAAction`](src/components/plans/cta-button.tsx#L5) | type | src/components/plans/cta-button.tsx:5 |
| [`CTAEditor`](src/components/admin/cms/editors/cta-editor.tsx#L12) | function | src/components/admin/cms/editors/cta-editor.tsx:12 |
| [`CurvedTextEffect`](src/lib/konva/effects/CurvedTextEffect.ts#L9) | class | src/lib/konva/effects/CurvedTextEffect.ts:9 |
| [`CurvedTextEffectConfig`](src/lib/konva/effects/types.ts#L31) | interface | src/lib/konva/effects/types.ts:31 |
| [`CustomFont`](src/lib/font-manager.ts#L12) | interface | src/lib/font-manager.ts:12 |
| [`DashboardStats`](src/hooks/use-studio.ts#L6) | interface | src/hooks/use-studio.ts:6 |
| [`debounce`](src/lib/performance-utils.ts#L56) | function | src/lib/performance-utils.ts:56 |
| [`Decimal`](prisma/generated/client/runtime/index-browser.d.ts#L44) | class | prisma/generated/client/runtime/index-browser.d.ts:44 |
| [`deductCredits`](src/lib/credits/validate-credits.ts#L56) | function | src/lib/credits/validate-credits.ts:56 |
| [`deductCreditsForFeature`](src/lib/credits/deduct.ts#L208) | function | src/lib/credits/deduct.ts:208 |
| [`DELETE`](src/app/api/templates/[id]/route.ts#L142) | function | src/app/api/templates/[id]/route.ts:142 |
| [`DELETE`](src/app/api/prompts/[promptId]/route.ts#L128) | function | src/app/api/prompts/[promptId]/route.ts:128 |
| [`DELETE`](src/app/api/projects/[projectId]/route.ts#L51) | function | src/app/api/projects/[projectId]/route.ts:51 |
| [`DELETE`](src/app/api/knowledge/[id]/route.ts#L221) | function | src/app/api/knowledge/[id]/route.ts:221 |
| [`DELETE`](src/app/api/generations/[id]/route.ts#L62) | function | src/app/api/generations/[id]/route.ts:62 |
| [`DELETE`](src/app/api/biblioteca-musicas/[id]/route.ts#L100) | function | src/app/api/biblioteca-musicas/[id]/route.ts:100 |
| [`DELETE`](src/app/api/admin/plans/route.ts#L329) | function | src/app/api/admin/plans/route.ts:329 |
| [`DELETE`](src/app/api/templates/[id]/creatives/route.ts#L146) | function | src/app/api/templates/[id]/creatives/route.ts:146 |
| [`DELETE`](src/app/api/drive/files/delete/route.ts#L13) | function | src/app/api/drive/files/delete/route.ts:13 |
| [`DELETE`](src/app/api/cms/sections/[id]/route.ts#L91) | function | src/app/api/cms/sections/[id]/route.ts:91 |
| [`DELETE`](src/app/api/cms/pages/[id]/route.ts#L97) | function | src/app/api/cms/pages/[id]/route.ts:97 |
| [`DELETE`](src/app/api/cms/menus/[id]/route.ts#L86) | function | src/app/api/cms/menus/[id]/route.ts:86 |
| [`DELETE`](src/app/api/cms/menu-items/[id]/route.ts#L57) | function | src/app/api/cms/menu-items/[id]/route.ts:57 |
| [`DELETE`](src/app/api/cms/media/[id]/route.ts#L85) | function | src/app/api/cms/media/[id]/route.ts:85 |
| [`DELETE`](src/app/api/cms/components/[id]/route.ts#L87) | function | src/app/api/cms/components/[id]/route.ts:87 |
| [`DELETE`](src/app/api/biblioteca-musicas/youtube/[jobId]/route.ts#L5) | function | src/app/api/biblioteca-musicas/youtube/[jobId]/route.ts:5 |
| [`DELETE`](src/app/api/ai/conversations/[id]/route.ts#L79) | function | src/app/api/ai/conversations/[id]/route.ts:79 |
| [`DELETE`](src/app/api/admin/users/[id]/route.ts#L7) | function | src/app/api/admin/users/[id]/route.ts:7 |
| [`DELETE`](src/app/api/admin/storage/[id]/route.ts#L7) | function | src/app/api/admin/storage/[id]/route.ts:7 |
| [`DELETE`](src/app/api/admin/plans/[clerkId]/route.ts#L133) | function | src/app/api/admin/plans/[clerkId]/route.ts:133 |
| [`DELETE`](src/app/api/admin/knowledge/[id]/route.ts#L156) | function | src/app/api/admin/knowledge/[id]/route.ts:156 |
| [`DELETE`](src/app/api/admin/feature-grid/[id]/route.ts#L103) | function | src/app/api/admin/feature-grid/[id]/route.ts:103 |
| [`DELETE`](src/app/api/templates/[id]/pages/[pageId]/route.ts#L142) | function | src/app/api/templates/[id]/pages/[pageId]/route.ts:142 |
| [`DELETE`](src/app/api/projects/[projectId]/prompts/[promptId]/route.ts#L10) | function | src/app/api/projects/[projectId]/prompts/[promptId]/route.ts:10 |
| [`DELETE`](src/app/api/projects/[projectId]/posts/[postId]/route.ts#L364) | function | src/app/api/projects/[projectId]/posts/[postId]/route.ts:364 |
| [`DELETE`](src/app/api/projects/[projectId]/logos/[logoId]/route.ts#L66) | function | src/app/api/projects/[projectId]/logos/[logoId]/route.ts:66 |
| [`DELETE`](src/app/api/projects/[projectId]/fonts/[fontId]/route.ts#L12) | function | src/app/api/projects/[projectId]/fonts/[fontId]/route.ts:12 |
| [`DELETE`](src/app/api/projects/[projectId]/elements/[elementId]/route.ts#L12) | function | src/app/api/projects/[projectId]/elements/[elementId]/route.ts:12 |
| [`DELETE`](src/app/api/projects/[projectId]/colors/[colorId]/route.ts#L11) | function | src/app/api/projects/[projectId]/colors/[colorId]/route.ts:11 |
| [`DELETE`](src/app/api/projects/[projectId]/ai-images/[imageId]/route.ts#L11) | function | src/app/api/projects/[projectId]/ai-images/[imageId]/route.ts:11 |
| [`DELETE`](src/app/api/organizations/[orgId]/projects/[projectId]/route.ts#L8) | function | src/app/api/organizations/[orgId]/projects/[projectId]/route.ts:8 |
| [`deleteComponent`](src/lib/cms/mutations.ts#L465) | function | src/lib/cms/mutations.ts:465 |
| [`deleteEntry`](src/lib/knowledge/indexer.ts#L265) | function | src/lib/knowledge/indexer.ts:265 |
| [`deleteMedia`](src/lib/cms/mutations.ts#L519) | function | src/lib/cms/mutations.ts:519 |
| [`deleteMenu`](src/lib/cms/mutations.ts#L356) | function | src/lib/cms/mutations.ts:356 |
| [`deleteMenuItem`](src/lib/cms/mutations.ts#L390) | function | src/lib/cms/mutations.ts:390 |
| [`deletePage`](src/lib/cms/mutations.ts#L76) | function | src/lib/cms/mutations.ts:76 |
| [`deleteSection`](src/lib/cms/mutations.ts#L228) | function | src/lib/cms/mutations.ts:228 |
| [`deleteVector`](src/lib/knowledge/vector-client.ts#L162) | function | src/lib/knowledge/vector-client.ts:162 |
| [`deleteVectorsByEntry`](src/lib/knowledge/vector-client.ts#L134) | function | src/lib/knowledge/vector-client.ts:134 |
| [`DesignData`](src/types/template.ts#L1) | interface | src/types/template.ts:1 |
| [`detectAlignmentGuides`](src/lib/konva-smart-guides.ts#L186) | function | src/lib/konva-smart-guides.ts:186 |
| [`detectMatchingDimensions`](src/lib/konva-smart-guides.ts#L238) | function | src/lib/konva-smart-guides.ts:238 |
| [`detectMediaType`](src/lib/later/media-upload.ts#L12) | function | src/lib/later/media-upload.ts:12 |
| [`DeviceInfo`](src/hooks/use-device-detection.ts#L16) | interface | src/hooks/use-device-detection.ts:16 |
| [`DisambiguationState`](src/lib/knowledge/disambiguation.ts#L9) | interface | src/lib/knowledge/disambiguation.ts:9 |
| [`distributeHorizontal`](src/lib/konva-alignment.ts#L175) | function | src/lib/konva-alignment.ts:175 |
| [`distributeVertical`](src/lib/konva-alignment.ts#L212) | function | src/lib/konva-alignment.ts:212 |
| [`downloadFolderAsZip`](src/lib/zip-generator.ts#L18) | function | src/lib/zip-generator.ts:18 |
| [`downloadFromGoogleDrive`](src/lib/google-drive/download.ts#L9) | function | src/lib/google-drive/download.ts:9 |
| [`DraggablePost`](src/components/agenda/calendar/draggable-post.tsx#L12) | function | src/components/agenda/calendar/draggable-post.tsx:12 |
| [`DriveBreadcrumbEntry`](src/types/drive.ts#L39) | interface | src/types/drive.ts:39 |
| [`DriveDownloadFileMeta`](src/types/drive.ts#L25) | interface | src/types/drive.ts:25 |
| [`DriveDownloadResponse`](src/types/drive.ts#L33) | interface | src/types/drive.ts:33 |
| [`DriveDropZone`](src/app/(protected)/drive/_components/drive-drop-zone.tsx#L16) | function | src/app/(protected)/drive/_components/drive-drop-zone.tsx:16 |
| [`DriveFolderToggle`](src/app/(protected)/drive/_components/drive-folder-toggle.tsx#L13) | function | src/app/(protected)/drive/_components/drive-folder-toggle.tsx:13 |
| [`DriveFolderType`](src/types/drive.ts#L3) | type | src/types/drive.ts:3 |
| [`DriveListResponse`](src/types/drive.ts#L16) | interface | src/types/drive.ts:16 |
| [`DriveProjectInfo`](src/types/drive.ts#L5) | interface | src/types/drive.ts:5 |
| [`DriveRoutePage`](src/app/(protected)/drive/page.tsx#L3) | function | src/app/(protected)/drive/page.tsx:3 |
| [`DropdownTriggerButton`](src/components/ui/dropdown-trigger-button.tsx#L11) | function | src/components/ui/dropdown-trigger-button.tsx:11 |
| [`duplicatePage`](src/lib/cms/mutations.ts#L125) | function | src/lib/cms/mutations.ts:125 |
| [`duplicateSection`](src/lib/cms/mutations.ts#L266) | function | src/lib/cms/mutations.ts:266 |
| [`DynamicField`](src/types/template.ts#L188) | interface | src/types/template.ts:188 |
| [`EditKnowledgeEntryPage`](src/app/admin/knowledge/[id]/edit/page.tsx#L25) | function | src/app/admin/knowledge/[id]/edit/page.tsx:25 |
| [`EditorCanvas`](src/components/templates/editor-canvas.tsx#L26) | function | src/components/templates/editor-canvas.tsx:26 |
| [`EditorSidebar`](src/components/templates/sidebar/editor-sidebar.tsx#L13) | function | src/components/templates/sidebar/editor-sidebar.tsx:13 |
| [`EffectsManager`](src/lib/konva/effects/EffectsManager.ts#L14) | class | src/lib/konva/effects/EffectsManager.ts:14 |
| [`EffectsPanel`](src/components/canvas/effects/EffectsPanel.tsx#L41) | function | src/components/canvas/effects/EffectsPanel.tsx:41 |
| [`ensureOrganizationCreditBalance`](src/lib/organizations/service.ts#L292) | function | src/lib/organizations/service.ts:292 |
| [`ensureOrganizationExists`](src/lib/organizations/service.ts#L243) | function | src/lib/organizations/service.ts:243 |
| [`ensureOrganizationPermission`](src/lib/organizations/permissions.ts#L76) | function | src/lib/organizations/permissions.ts:76 |
| [`estimateTokens`](src/lib/ai/token-limits.ts#L62) | function | src/lib/ai/token-limits.ts:62 |
| [`extractDisambiguationState`](src/lib/knowledge/disambiguation.ts#L141) | function | src/lib/knowledge/disambiguation.ts:141 |
| [`extractDriveFolderId`](src/lib/validations/client-invite.ts#L92) | function | src/lib/validations/client-invite.ts:92 |
| [`ExtractedKnowledgeData`](src/lib/knowledge/extract-knowledge-data.ts#L13) | type | src/lib/knowledge/extract-knowledge-data.ts:13 |
| [`extractFilename`](src/lib/later/media-upload.ts#L43) | function | src/lib/later/media-upload.ts:43 |
| [`extractKnowledgeData`](src/lib/knowledge/extract-knowledge-data.ts#L30) | function | src/lib/knowledge/extract-knowledge-data.ts:30 |
| [`extractPostIdFromTag`](src/lib/posts/verification/tag-generator.ts#L21) | function | src/lib/posts/verification/tag-generator.ts:21 |
| [`extractYoutubeId`](src/lib/youtube/utils.ts#L3) | function | src/lib/youtube/utils.ts:3 |
| [`FaixaMusica`](src/hooks/use-music-library.ts#L6) | interface | src/hooks/use-music-library.ts:6 |
| [`FeatureCostsPage`](src/app/admin/settings/features/page.tsx#L13) | function | src/app/admin/settings/features/page.tsx:13 |
| [`FeatureGridItem`](src/hooks/admin/use-admin-feature-grid.ts#L4) | type | src/hooks/admin/use-admin-feature-grid.ts:4 |
| [`FeatureKey`](src/lib/credits/feature-config.ts#L13) | type | src/lib/credits/feature-config.ts:13 |
| [`Features`](src/components/marketing/features.tsx#L36) | function | src/components/marketing/features.tsx:36 |
| [`FeatureUsageListProps`](src/components/organization/feature-usage-list.tsx#L24) | interface | src/components/organization/feature-usage-list.tsx:24 |
| [`fetchActivePlanIdForUser`](src/app/api/admin/users/sync/route.ts#L46) | function | src/app/api/admin/users/sync/route.ts:46 |
| [`fetchCommercePlans`](src/lib/clerk/commerce-plans.ts#L191) | function | src/lib/clerk/commerce-plans.ts:191 |
| [`fetchMediaAsBuffer`](src/lib/later/media-upload.ts#L91) | function | src/lib/later/media-upload.ts:91 |
| [`fetchMultipleMedia`](src/lib/later/media-upload.ts#L166) | function | src/lib/later/media-upload.ts:166 |
| [`fetchProjectWithAccess`](src/lib/projects/access.ts#L79) | function | src/lib/projects/access.ts:79 |
| [`fetchProjectWithShares`](src/lib/projects/access.ts#L6) | function | src/lib/projects/access.ts:6 |
| [`fetchTemplateWithProject`](src/lib/templates/access.ts#L5) | function | src/lib/templates/access.ts:5 |
| [`FieldValues`](src/types/template.ts#L202) | type | src/types/template.ts:202 |
| [`FileToDownload`](src/lib/zip-generator.ts#L6) | interface | src/lib/zip-generator.ts:6 |
| [`FiltrosMusica`](src/hooks/use-music-library.ts#L24) | interface | src/hooks/use-music-library.ts:24 |
| [`findPendingInviteByEmail`](src/lib/services/client-invite-service.ts#L135) | function | src/lib/services/client-invite-service.ts:135 |
| [`findSimilarEntries`](src/lib/knowledge/find-similar-entries.ts#L13) | function | src/lib/knowledge/find-similar-entries.ts:13 |
| [`FloatingToolbarButton`](src/components/templates/floating-toolbar-button.tsx#L27) | function | src/components/templates/floating-toolbar-button.tsx:27 |
| [`FontChecker`](src/lib/render-engine.ts#L11) | type | src/lib/render-engine.ts:11 |
| [`FontManager`](src/lib/font-manager.ts#L25) | class | src/lib/font-manager.ts:25 |
| [`FontValidationResult`](src/lib/render-engine.ts#L13) | interface | src/lib/render-engine.ts:13 |
| [`formatContextFromResults`](src/lib/knowledge/search.ts#L241) | function | src/lib/knowledge/search.ts:241 |
| [`formatCoordinates`](src/lib/konva-smart-guides.ts#L411) | function | src/lib/konva-smart-guides.ts:411 |
| [`formatCurrency`](src/components/plans/pricing-utils.ts#L32) | function | src/components/plans/pricing-utils.ts:32 |
| [`formatDimensions`](src/lib/konva-smart-guides.ts#L418) | function | src/lib/konva-smart-guides.ts:418 |
| [`formatDisambiguationMessage`](src/lib/knowledge/disambiguation.ts#L88) | function | src/lib/knowledge/disambiguation.ts:88 |
| [`formatMediaForLog`](src/lib/later/media-upload.ts#L208) | function | src/lib/later/media-upload.ts:208 |
| [`formatPostTime`](src/components/agenda/calendar/calendar-utils.ts#L42) | function | src/components/agenda/calendar/calendar-utils.ts:42 |
| [`formatPreviewMessage`](src/lib/knowledge/training-pipeline.ts#L94) | function | src/lib/knowledge/training-pipeline.ts:94 |
| [`fulfillInviteForUser`](src/lib/services/client-invite-service.ts#L263) | function | src/lib/services/client-invite-service.ts:263 |
| [`generateAlerts`](src/lib/instagram/generate-alerts.ts#L28) | function | src/lib/instagram/generate-alerts.ts:28 |
| [`generateApiKey`](src/lib/utils.ts#L8) | function | src/lib/utils.ts:8 |
| [`generateEmbedding`](src/lib/knowledge/embeddings.ts#L16) | function | src/lib/knowledge/embeddings.ts:16 |
| [`generateEmbeddings`](src/lib/knowledge/embeddings.ts#L35) | function | src/lib/knowledge/embeddings.ts:35 |
| [`GenerateImageParams`](src/hooks/use-ai-image.ts#L7) | interface | src/hooks/use-ai-image.ts:7 |
| [`GenerateImageResponse`](src/hooks/use-ai-image.ts#L15) | interface | src/hooks/use-ai-image.ts:15 |
| [`generateMetadata`](src/app/layout.tsx#L28) | function | src/app/layout.tsx:28 |
| [`generatePageThumbnail`](src/lib/page-thumbnail-utils.ts#L17) | function | src/lib/page-thumbnail-utils.ts:17 |
| [`generatePreview`](src/lib/generation-utils.ts#L187) | function | src/lib/generation-utils.ts:187 |
| [`generateThumbnail`](src/lib/render-engine.ts#L647) | function | src/lib/render-engine.ts:647 |
| [`generateThumbnail`](src/lib/generation-utils.ts#L101) | function | src/lib/generation-utils.ts:101 |
| [`generateVerificationTag`](src/lib/posts/verification/tag-generator.ts#L6) | function | src/lib/posts/verification/tag-generator.ts:6 |
| [`Generation`](src/lib/generation-utils.ts#L15) | interface | src/lib/generation-utils.ts:15 |
| [`GenerationWithTemplate`](src/app/api/projects/[projectId]/generations/carousel/route.ts#L84) | type | src/app/api/projects/[projectId]/generations/carousel/route.ts:84 |
| [`GET`](src/app/api/test-ffmpeg/route.ts#L11) | function | src/app/api/test-ffmpeg/route.ts:11 |
| [`GET`](src/app/api/templates/route.ts#L28) | function | src/app/api/templates/route.ts:28 |
| [`GET`](src/app/api/site-config/route.ts#L6) | function | src/app/api/site-config/route.ts:6 |
| [`GET`](src/app/api/prompts/route.ts#L16) | function | src/app/api/prompts/route.ts:16 |
| [`GET`](src/app/api/projects/route.ts#L13) | function | src/app/api/projects/route.ts:13 |
| [`GET`](src/app/api/knowledge/route.ts#L43) | function | src/app/api/knowledge/route.ts:43 |
| [`GET`](src/app/api/feature-grid/route.ts#L5) | function | src/app/api/feature-grid/route.ts:5 |
| [`GET`](src/app/api/biblioteca-musicas/route.ts#L14) | function | src/app/api/biblioteca-musicas/route.ts:14 |
| [`GET`](src/app/api/video-processing/process/route.ts#L319) | function | src/app/api/video-processing/process/route.ts:319 |
| [`GET`](src/app/api/verification/stats/route.ts#L16) | function | src/app/api/verification/stats/route.ts:16 |
| [`GET`](src/app/api/verification/failed/route.ts#L16) | function | src/app/api/verification/failed/route.ts:16 |
| [`GET`](src/app/api/templates/[id]/route.ts#L10) | function | src/app/api/templates/[id]/route.ts:10 |
| [`GET`](src/app/api/subscription/status/route.ts#L24) | function | src/app/api/subscription/status/route.ts:24 |
| [`GET`](src/app/api/public/plans/route.ts#L6) | function | src/app/api/public/plans/route.ts:6 |
| [`GET`](src/app/api/public/pages/route.ts#L10) | function | src/app/api/public/pages/route.ts:10 |
| [`GET`](src/app/api/public/menu/route.ts#L8) | function | src/app/api/public/menu/route.ts:8 |
| [`GET`](src/app/api/prompts/[promptId]/route.ts#L16) | function | src/app/api/prompts/[promptId]/route.ts:16 |
| [`GET`](src/app/api/projects/scheduled-counts/route.ts#L14) | function | src/app/api/projects/scheduled-counts/route.ts:14 |
| [`GET`](src/app/api/projects/[projectId]/route.ts#L8) | function | src/app/api/projects/[projectId]/route.ts:8 |
| [`GET`](src/app/api/posts/calendar/route.ts#L11) | function | src/app/api/posts/calendar/route.ts:11 |
| [`GET`](src/app/api/organizations/limits/route.ts#L7) | function | src/app/api/organizations/limits/route.ts:7 |
| [`GET`](src/app/api/later/accounts/route.ts#L10) | function | src/app/api/later/accounts/route.ts:10 |
| [`GET`](src/app/api/knowledge/[id]/route.ts#L30) | function | src/app/api/knowledge/[id]/route.ts:30 |
| [`GET`](src/app/api/instagram/summaries/route.ts#L5) | function | src/app/api/instagram/summaries/route.ts:5 |
| [`GET`](src/app/api/instagram/settings/route.ts#L13) | function | src/app/api/instagram/settings/route.ts:13 |
| [`GET`](src/app/api/google-drive/test/route.ts#L7) | function | src/app/api/google-drive/test/route.ts:7 |
| [`GET`](src/app/api/google-drive/files/route.ts#L14) | function | src/app/api/google-drive/files/route.ts:14 |
| [`GET`](src/app/api/google-drive/callback/route.ts#L13) | function | src/app/api/google-drive/callback/route.ts:13 |
| [`GET`](src/app/api/generations/[id]/route.ts#L12) | function | src/app/api/generations/[id]/route.ts:12 |
| [`GET`](src/app/api/drive/list/route.ts#L24) | function | src/app/api/drive/list/route.ts:24 |
| [`GET`](src/app/api/drive/breadcrumbs/route.ts#L12) | function | src/app/api/drive/breadcrumbs/route.ts:12 |
| [`GET`](src/app/api/debug/posts/route.ts#L10) | function | src/app/api/debug/posts/route.ts:10 |
| [`GET`](src/app/api/debug/org/route.ts#L9) | function | src/app/api/debug/org/route.ts:9 |
| [`GET`](src/app/api/debug/auth/route.ts#L4) | function | src/app/api/debug/auth/route.ts:4 |
| [`GET`](src/app/api/cron/verify-stories/route.ts#L27) | function | src/app/api/cron/verify-stories/route.ts:27 |
| [`GET`](src/app/api/cron/test-process-stems/route.ts#L20) | function | src/app/api/cron/test-process-stems/route.ts:20 |
| [`GET`](src/app/api/cron/status-sync/route.ts#L10) | function | src/app/api/cron/status-sync/route.ts:10 |
| [`GET`](src/app/api/cron/reminders/route.ts#L11) | function | src/app/api/cron/reminders/route.ts:11 |
| [`GET`](src/app/api/cron/refill-org-credits/route.ts#L24) | function | src/app/api/cron/refill-org-credits/route.ts:24 |
| [`GET`](src/app/api/cron/process-youtube-downloads/route.ts#L8) | function | src/app/api/cron/process-youtube-downloads/route.ts:8 |
| [`GET`](src/app/api/cron/process-music-stems/route.ts#L15) | function | src/app/api/cron/process-music-stems/route.ts:15 |
| [`GET`](src/app/api/cron/posts/route.ts#L4) | function | src/app/api/cron/posts/route.ts:4 |
| [`GET`](src/app/api/cron/fetch-story-insights/route.ts#L23) | function | src/app/api/cron/fetch-story-insights/route.ts:23 |
| [`GET`](src/app/api/cron/fetch-later-analytics/route.ts#L18) | function | src/app/api/cron/fetch-later-analytics/route.ts:18 |
| [`GET`](src/app/api/cron/cleanup-db/route.ts#L4) | function | src/app/api/cron/cleanup-db/route.ts:4 |
| [`GET`](src/app/api/cron/cleanup-blobs/route.ts#L7) | function | src/app/api/cron/cleanup-blobs/route.ts:7 |
| [`GET`](src/app/api/cron/check-stuck-posts/route.ts#L9) | function | src/app/api/cron/check-stuck-posts/route.ts:9 |
| [`GET`](src/app/api/cron/backup-database/route.ts#L13) | function | src/app/api/cron/backup-database/route.ts:13 |
| [`GET`](src/app/api/cron/archive-expired-knowledge/route.ts#L14) | function | src/app/api/cron/archive-expired-knowledge/route.ts:14 |
| [`GET`](src/app/api/cron/analytics/route.ts#L8) | function | src/app/api/cron/analytics/route.ts:8 |
| [`GET`](src/app/api/credits/settings/route.ts#L4) | function | src/app/api/credits/settings/route.ts:4 |
| [`GET`](src/app/api/credits/me/route.ts#L6) | function | src/app/api/credits/me/route.ts:6 |
| [`GET`](src/app/api/cms/sections/route.ts#L30) | function | src/app/api/cms/sections/route.ts:30 |
| [`GET`](src/app/api/cms/pages/route.ts#L23) | function | src/app/api/cms/pages/route.ts:23 |
| [`GET`](src/app/api/cms/menus/route.ts#L18) | function | src/app/api/cms/menus/route.ts:18 |
| [`GET`](src/app/api/cms/media/route.ts#L14) | function | src/app/api/cms/media/route.ts:14 |
| [`GET`](src/app/api/cms/components/route.ts#L22) | function | src/app/api/cms/components/route.ts:22 |
| [`GET`](src/app/api/calendar/analytics/route.ts#L12) | function | src/app/api/calendar/analytics/route.ts:12 |
| [`GET`](src/app/api/biblioteca-musicas/buscar/route.ts#L10) | function | src/app/api/biblioteca-musicas/buscar/route.ts:10 |
| [`GET`](src/app/api/biblioteca-musicas/[id]/route.ts#L9) | function | src/app/api/biblioteca-musicas/[id]/route.ts:9 |
| [`GET`](src/app/api/ai/providers/route.ts#L53) | function | src/app/api/ai/providers/route.ts:53 |
| [`GET`](src/app/api/ai/models/route.ts#L8) | function | src/app/api/ai/models/route.ts:8 |
| [`GET`](src/app/api/ai/conversations/route.ts#L82) | function | src/app/api/ai/conversations/route.ts:82 |
| [`GET`](src/app/api/admin/verify/route.ts#L5) | function | src/app/api/admin/verify/route.ts:5 |
| [`GET`](src/app/api/admin/users/route.ts#L7) | function | src/app/api/admin/users/route.ts:7 |
| [`GET`](src/app/api/admin/usage/route.ts#L7) | function | src/app/api/admin/usage/route.ts:7 |
| [`GET`](src/app/api/admin/test-mvsep/route.ts#L12) | function | src/app/api/admin/test-mvsep/route.ts:12 |
| [`GET`](src/app/api/admin/studio/route.ts#L7) | function | src/app/api/admin/studio/route.ts:7 |
| [`GET`](src/app/api/admin/storage/route.ts#L6) | function | src/app/api/admin/storage/route.ts:6 |
| [`GET`](src/app/api/admin/site-settings/route.ts#L6) | function | src/app/api/admin/site-settings/route.ts:6 |
| [`GET`](src/app/api/admin/settings/route.ts#L10) | function | src/app/api/admin/settings/route.ts:10 |
| [`GET`](src/app/api/admin/retry-all-failed/route.ts#L9) | function | src/app/api/admin/retry-all-failed/route.ts:9 |
| [`GET`](src/app/api/admin/plans/route.ts#L73) | function | src/app/api/admin/plans/route.ts:73 |
| [`GET`](src/app/api/admin/knowledge/route.ts#L59) | function | src/app/api/admin/knowledge/route.ts:59 |
| [`GET`](src/app/api/admin/inspect-files/route.ts#L13) | function | src/app/api/admin/inspect-files/route.ts:13 |
| [`GET`](src/app/api/admin/feature-grid/route.ts#L18) | function | src/app/api/admin/feature-grid/route.ts:18 |
| [`GET`](src/app/api/admin/feature-costs/route.ts#L10) | function | src/app/api/admin/feature-costs/route.ts:10 |
| [`GET`](src/app/api/admin/debug-stem-job/route.ts#L9) | function | src/app/api/admin/debug-stem-job/route.ts:9 |
| [`GET`](src/app/api/admin/debug-mvsep-response/route.ts#L11) | function | src/app/api/admin/debug-mvsep-response/route.ts:11 |
| [`GET`](src/app/api/admin/debug-mvsep-files/route.ts#L14) | function | src/app/api/admin/debug-mvsep-files/route.ts:14 |
| [`GET`](src/app/api/admin/credits/route.ts#L7) | function | src/app/api/admin/credits/route.ts:7 |
| [`GET`](src/app/api/admin/clients/route.ts#L25) | function | src/app/api/admin/clients/route.ts:25 |
| [`GET`](src/app/api/admin/client-projects/route.ts#L15) | function | src/app/api/admin/client-projects/route.ts:15 |
| [`GET`](src/app/api/webhooks/buffer/test/route.ts#L7) | function | src/app/api/webhooks/buffer/test/route.ts:7 |
| [`GET`](src/app/api/video-processing/status/[jobId]/route.ts#L5) | function | src/app/api/video-processing/status/[jobId]/route.ts:5 |
| [`GET`](src/app/api/templates/[id]/template-pages/route.ts#L10) | function | src/app/api/templates/[id]/template-pages/route.ts:10 |
| [`GET`](src/app/api/templates/[id]/pages/route.ts#L17) | function | src/app/api/templates/[id]/pages/route.ts:17 |
| [`GET`](src/app/api/templates/[id]/creatives/route.ts#L21) | function | src/app/api/templates/[id]/creatives/route.ts:21 |
| [`GET`](src/app/api/projects/[projectId]/templates/route.ts#L11) | function | src/app/api/projects/[projectId]/templates/route.ts:11 |
| [`GET`](src/app/api/projects/[projectId]/stories-report/route.ts#L12) | function | src/app/api/projects/[projectId]/stories-report/route.ts:12 |
| [`GET`](src/app/api/projects/[projectId]/prompts/route.ts#L7) | function | src/app/api/projects/[projectId]/prompts/route.ts:7 |
| [`GET`](src/app/api/projects/[projectId]/posts/route.ts#L210) | function | src/app/api/projects/[projectId]/posts/route.ts:210 |
| [`GET`](src/app/api/projects/[projectId]/logos/route.ts#L10) | function | src/app/api/projects/[projectId]/logos/route.ts:10 |
| [`GET`](src/app/api/projects/[projectId]/generations/route.ts#L11) | function | src/app/api/projects/[projectId]/generations/route.ts:11 |
| [`GET`](src/app/api/projects/[projectId]/fonts/route.ts#L10) | function | src/app/api/projects/[projectId]/fonts/route.ts:10 |
| [`GET`](src/app/api/projects/[projectId]/elements/route.ts#L10) | function | src/app/api/projects/[projectId]/elements/route.ts:10 |
| [`GET`](src/app/api/projects/[projectId]/creatives/route.ts#L9) | function | src/app/api/projects/[projectId]/creatives/route.ts:9 |
| [`GET`](src/app/api/projects/[projectId]/colors/route.ts#L8) | function | src/app/api/projects/[projectId]/colors/route.ts:8 |
| [`GET`](src/app/api/projects/[projectId]/analytics/route.ts#L18) | function | src/app/api/projects/[projectId]/analytics/route.ts:18 |
| [`GET`](src/app/api/projects/[projectId]/ai-images/route.ts#L6) | function | src/app/api/projects/[projectId]/ai-images/route.ts:6 |
| [`GET`](src/app/api/posts/[postId]/status/route.ts#L8) | function | src/app/api/posts/[postId]/status/route.ts:8 |
| [`GET`](src/app/api/posts/[postId]/analytics/route.ts#L19) | function | src/app/api/posts/[postId]/analytics/route.ts:19 |
| [`GET`](src/app/api/organizations/[orgId]/settings/route.ts#L19) | function | src/app/api/organizations/[orgId]/settings/route.ts:19 |
| [`GET`](src/app/api/organizations/[orgId]/projects/route.ts#L14) | function | src/app/api/organizations/[orgId]/projects/route.ts:14 |
| [`GET`](src/app/api/organizations/[orgId]/credits/route.ts#L18) | function | src/app/api/organizations/[orgId]/credits/route.ts:18 |
| [`GET`](src/app/api/organizations/[orgId]/analytics/route.ts#L37) | function | src/app/api/organizations/[orgId]/analytics/route.ts:37 |
| [`GET`](src/app/api/instagram/[projectId]/studio/route.ts#L5) | function | src/app/api/instagram/[projectId]/studio/route.ts:5 |
| [`GET`](src/app/api/google-drive/thumbnail/[fileId]/route.ts#L14) | function | src/app/api/google-drive/thumbnail/[fileId]/route.ts:14 |
| [`GET`](src/app/api/google-drive/image/[fileId]/route.ts#L9) | function | src/app/api/google-drive/image/[fileId]/route.ts:9 |
| [`GET`](src/app/api/generations/[id]/download/route.ts#L13) | function | src/app/api/generations/[id]/download/route.ts:13 |
| [`GET`](src/app/api/drive/folders/download/route.ts#L13) | function | src/app/api/drive/folders/download/route.ts:13 |
| [`GET`](src/app/api/debug/post/[postId]/route.ts#L8) | function | src/app/api/debug/post/[postId]/route.ts:8 |
| [`GET`](src/app/api/cms/sections/[id]/route.ts#L23) | function | src/app/api/cms/sections/[id]/route.ts:23 |
| [`GET`](src/app/api/cms/pages/[id]/route.ts#L26) | function | src/app/api/cms/pages/[id]/route.ts:26 |
| [`GET`](src/app/api/cms/menus/[id]/route.ts#L18) | function | src/app/api/cms/menus/[id]/route.ts:18 |
| [`GET`](src/app/api/cms/media/[id]/route.ts#L23) | function | src/app/api/cms/media/[id]/route.ts:23 |
| [`GET`](src/app/api/cms/components/[id]/route.ts#L25) | function | src/app/api/cms/components/[id]/route.ts:25 |
| [`GET`](src/app/api/biblioteca-musicas/youtube/metadata/route.ts#L17) | function | src/app/api/biblioteca-musicas/youtube/metadata/route.ts:17 |
| [`GET`](src/app/api/biblioteca-musicas/youtube/jobs/route.ts#L5) | function | src/app/api/biblioteca-musicas/youtube/jobs/route.ts:5 |
| [`GET`](src/app/api/biblioteca-musicas/[id]/stem-status/route.ts#L9) | function | src/app/api/biblioteca-musicas/[id]/stem-status/route.ts:9 |
| [`GET`](src/app/api/biblioteca-musicas/[id]/download-zip/route.ts#L13) | function | src/app/api/biblioteca-musicas/[id]/download-zip/route.ts:13 |
| [`GET`](src/app/api/ai/openrouter/models/route.ts#L41) | function | src/app/api/ai/openrouter/models/route.ts:41 |
| [`GET`](src/app/api/ai/creative-page/[pageId]/route.ts#L9) | function | src/app/api/ai/creative-page/[pageId]/route.ts:9 |
| [`GET`](src/app/api/ai/conversations/cleanup/route.ts#L72) | function | src/app/api/ai/conversations/cleanup/route.ts:72 |
| [`GET`](src/app/api/ai/conversations/[id]/route.ts#L8) | function | src/app/api/ai/conversations/[id]/route.ts:8 |
| [`GET`](src/app/api/admin/users/invitations/route.ts#L8) | function | src/app/api/admin/users/invitations/route.ts:8 |
| [`GET`](src/app/api/admin/knowledge/migrate-workspace/route.ts#L15) | function | src/app/api/admin/knowledge/migrate-workspace/route.ts:15 |
| [`GET`](src/app/api/admin/knowledge/[id]/route.ts#L47) | function | src/app/api/admin/knowledge/[id]/route.ts:47 |
| [`GET`](src/app/api/admin/health/credits-enum/route.ts#L9) | function | src/app/api/admin/health/credits-enum/route.ts:9 |
| [`GET`](src/app/api/admin/feature-grid/[id]/route.ts#L22) | function | src/app/api/admin/feature-grid/[id]/route.ts:22 |
| [`GET`](src/app/api/admin/clients/[id]/route.ts#L11) | function | src/app/api/admin/clients/[id]/route.ts:11 |
| [`GET`](src/app/api/admin/client-projects/[projectId]/route.ts#L18) | function | src/app/api/admin/client-projects/[projectId]/route.ts:18 |
| [`GET`](src/app/api/admin/clerk/plans/route.ts#L6) | function | src/app/api/admin/clerk/plans/route.ts:6 |
| [`GET`](src/app/api/templates/[id]/pages/[pageId]/route.ts#L22) | function | src/app/api/templates/[id]/pages/[pageId]/route.ts:22 |
| [`GET`](src/app/api/projects/[projectId]/posts/next-scheduled/route.ts#L10) | function | src/app/api/projects/[projectId]/posts/next-scheduled/route.ts:10 |
| [`GET`](src/app/api/projects/[projectId]/posts/calendar/route.ts#L6) | function | src/app/api/projects/[projectId]/posts/calendar/route.ts:6 |
| [`GET`](src/app/api/projects/[projectId]/posts/[postId]/route.ts#L24) | function | src/app/api/projects/[projectId]/posts/[postId]/route.ts:24 |
| [`GET`](src/app/api/projects/[projectId]/google-drive/images/route.ts#L14) | function | src/app/api/projects/[projectId]/google-drive/images/route.ts:14 |
| [`GET`](src/app/api/organizations/[orgId]/credits/usage/route.ts#L9) | function | src/app/api/organizations/[orgId]/credits/usage/route.ts:9 |
| [`GET`](src/app/api/organizations/[orgId]/analytics/timeline/route.ts#L48) | function | src/app/api/organizations/[orgId]/analytics/timeline/route.ts:48 |
| [`GET`](src/app/api/organizations/[orgId]/analytics/members/route.ts#L44) | function | src/app/api/organizations/[orgId]/analytics/members/route.ts:44 |
| [`GET`](src/app/api/cms/menus/[id]/items/route.ts#L9) | function | src/app/api/cms/menus/[id]/items/route.ts:9 |
| [`GET`](src/app/api/biblioteca-musicas/youtube/[jobId]/status/route.ts#L5) | function | src/app/api/biblioteca-musicas/youtube/[jobId]/status/route.ts:5 |
| [`getActivePlansSorted`](src/lib/queries/plans.ts#L5) | function | src/lib/queries/plans.ts:5 |
| [`getAllComponents`](src/lib/cms/queries.ts#L294) | function | src/lib/cms/queries.ts:294 |
| [`getAllLayouts`](src/lib/ai-creative-generator/layout-templates.ts#L240) | function | src/lib/ai-creative-generator/layout-templates.ts:240 |
| [`getAllMedia`](src/lib/cms/queries.ts#L336) | function | src/lib/cms/queries.ts:336 |
| [`getAllMenus`](src/lib/cms/queries.ts#L187) | function | src/lib/cms/queries.ts:187 |
| [`getAllPages`](src/lib/cms/queries.ts#L10) | function | src/lib/cms/queries.ts:10 |
| [`getAvailableModels`](src/lib/ai/image-models-config.ts#L385) | function | src/lib/ai/image-models-config.ts:385 |
| [`getBasePlanCredits`](src/lib/credits/settings.ts#L53) | function | src/lib/credits/settings.ts:53 |
| [`getCachedResults`](src/lib/knowledge/cache.ts#L179) | function | src/lib/knowledge/cache.ts:179 |
| [`getCacheKey`](src/lib/cache.ts#L70) | function | src/lib/cache.ts:70 |
| [`getClientInviteById`](src/lib/services/client-invite-service.ts#L128) | function | src/lib/services/client-invite-service.ts:128 |
| [`getClientProjectById`](src/lib/services/client-project-service.ts#L52) | function | src/lib/services/client-project-service.ts:52 |
| [`getComponentBySlug`](src/lib/cms/queries.ts#L303) | function | src/lib/cms/queries.ts:303 |
| [`getComponentsByType`](src/lib/cms/queries.ts#L322) | function | src/lib/cms/queries.ts:322 |
| [`getContentType`](src/lib/later/media-upload.ts#L127) | function | src/lib/later/media-upload.ts:127 |
| [`getCreditsForPrice`](src/lib/clerk/credit-packs.ts#L15) | function | src/lib/clerk/credit-packs.ts:15 |
| [`getDefaultCanvas`](src/lib/studio/defaults.ts#L11) | function | src/lib/studio/defaults.ts:11 |
| [`getDefaultLayersForType`](src/lib/studio/defaults.ts#L20) | function | src/lib/studio/defaults.ts:20 |
| [`getEffectiveFeatureCosts`](src/lib/credits/settings.ts#L18) | function | src/lib/credits/settings.ts:18 |
| [`getEffectivePlanCredits`](src/lib/credits/settings.ts#L34) | function | src/lib/credits/settings.ts:34 |
| [`getErrorMessage`](src/lib/later/errors.ts#L247) | function | src/lib/later/errors.ts:247 |
| [`getFeatureCost`](src/lib/credits/settings.ts#L29) | function | src/lib/credits/settings.ts:29 |
| [`getFontManager`](src/lib/font-manager.ts#L537) | function | src/lib/font-manager.ts:537 |
| [`getGlobalComponents`](src/lib/cms/queries.ts#L312) | function | src/lib/cms/queries.ts:312 |
| [`getHomePage`](src/lib/cms/queries.ts#L79) | function | src/lib/cms/queries.ts:79 |
| [`getImageInfo`](src/lib/images/auto-crop.ts#L94) | function | src/lib/images/auto-crop.ts:94 |
| [`getLaterClient`](src/lib/later/client.ts#L961) | function | src/lib/later/client.ts:961 |
| [`getLayerIcon`](src/components/templates/layers/layer-icons.tsx#L27) | function | src/components/templates/layers/layer-icons.tsx:27 |
| [`getLayerTypeName`](src/components/templates/layers/layer-icons.tsx#L31) | function | src/components/templates/layers/layer-icons.tsx:31 |
| [`getLayoutById`](src/lib/ai-creative-generator/layout-templates.ts#L236) | function | src/lib/ai-creative-generator/layout-templates.ts:236 |
| [`getLineGuideStops`](src/lib/konva-smart-guides.ts#L152) | function | src/lib/konva-smart-guides.ts:152 |
| [`getMaxContextTokens`](src/lib/ai/token-limits.ts#L55) | function | src/lib/ai/token-limits.ts:55 |
| [`getMaxOutputTokens`](src/lib/ai/token-limits.ts#L48) | function | src/lib/ai/token-limits.ts:48 |
| [`getMediaByFolder`](src/lib/cms/queries.ts#L354) | function | src/lib/cms/queries.ts:354 |
| [`getMediaById`](src/lib/cms/queries.ts#L345) | function | src/lib/cms/queries.ts:345 |
| [`getMediaByMimeType`](src/lib/cms/queries.ts#L364) | function | src/lib/cms/queries.ts:364 |
| [`getMediaByUser`](src/lib/cms/queries.ts#L374) | function | src/lib/cms/queries.ts:374 |
| [`getMenuById`](src/lib/cms/queries.ts#L207) | function | src/lib/cms/queries.ts:207 |
| [`getMenuByLocation`](src/lib/cms/queries.ts#L248) | function | src/lib/cms/queries.ts:248 |
| [`getMenuBySlug`](src/lib/cms/queries.ts#L227) | function | src/lib/cms/queries.ts:227 |
| [`getMenuItems`](src/lib/cms/queries.ts#L275) | function | src/lib/cms/queries.ts:275 |
| [`getModelById`](src/lib/ai/image-models-config.ts#L364) | function | src/lib/ai/image-models-config.ts:364 |
| [`getObjectSnappingEdges`](src/lib/konva-smart-guides.ts#L108) | function | src/lib/konva-smart-guides.ts:108 |
| [`getOrganizationAuthContext`](src/lib/organizations/permissions.ts#L22) | function | src/lib/organizations/permissions.ts:22 |
| [`getOrganizationByClerkId`](src/lib/organizations/service.ts#L68) | function | src/lib/organizations/service.ts:68 |
| [`getPageById`](src/lib/cms/queries.ts#L24) | function | src/lib/cms/queries.ts:24 |
| [`getPageByPath`](src/lib/cms/queries.ts#L54) | function | src/lib/cms/queries.ts:54 |
| [`getPageBySlug`](src/lib/cms/queries.ts#L39) | function | src/lib/cms/queries.ts:39 |
| [`getPagesByStatus`](src/lib/cms/queries.ts#L120) | function | src/lib/cms/queries.ts:120 |
| [`getPageSections`](src/lib/cms/queries.ts#L139) | function | src/lib/cms/queries.ts:139 |
| [`getPerformanceConfig`](src/lib/performance-utils.ts#L99) | function | src/lib/performance-utils.ts:99 |
| [`getPlanCredits`](src/lib/credits/settings.ts#L41) | function | src/lib/credits/settings.ts:41 |
| [`getPlanLimitsForUser`](src/lib/organizations/limits.ts#L22) | function | src/lib/organizations/limits.ts:22 |
| [`getPlanOptions`](src/lib/credits/settings.ts#L48) | function | src/lib/credits/settings.ts:48 |
| [`getPostDate`](src/components/agenda/calendar/calendar-utils.ts#L16) | function | src/components/agenda/calendar/calendar-utils.ts:16 |
| [`getPostDateKey`](src/components/agenda/calendar/calendar-utils.ts#L36) | function | src/components/agenda/calendar/calendar-utils.ts:36 |
| [`getPublishedPages`](src/lib/cms/queries.ts#L104) | function | src/lib/cms/queries.ts:104 |
| [`getRAGContext`](src/lib/knowledge/search.ts#L310) | function | src/lib/knowledge/search.ts:310 |
| [`getRAGContextWithResults`](src/lib/knowledge/search.ts#L331) | function | src/lib/knowledge/search.ts:331 |
| [`getRateLimitBucketSize`](src/lib/rate-limit.ts#L86) | function | src/lib/rate-limit.ts:86 |
| [`getRawAdminSettings`](src/lib/credits/settings.ts#L8) | function | src/lib/credits/settings.ts:8 |
| [`getRecommendedModel`](src/lib/ai/image-models-config.ts#L359) | function | src/lib/ai/image-models-config.ts:359 |
| [`getRecommendedPreset`](src/lib/templates/instagram-presets.ts#L87) | function | src/lib/templates/instagram-presets.ts:87 |
| [`getSectionById`](src/lib/cms/queries.ts#L149) | function | src/lib/cms/queries.ts:149 |
| [`getSectionsByType`](src/lib/cms/queries.ts#L159) | function | src/lib/cms/queries.ts:159 |
| [`getSiteConfig`](src/lib/site-settings.ts#L96) | function | src/lib/site-settings.ts:96 |
| [`getSiteSettings`](src/lib/site-settings.ts#L73) | function | src/lib/site-settings.ts:73 |
| [`getStageGuides`](src/lib/konva-smart-guides.ts#L131) | function | src/lib/konva-smart-guides.ts:131 |
| [`getUserCredits`](src/lib/credits/validate-credits.ts#L8) | function | src/lib/credits/validate-credits.ts:8 |
| [`getUserFromClerkId`](src/lib/auth-utils.ts#L6) | function | src/lib/auth-utils.ts:6 |
| [`getUserPlanDetails`](src/lib/clerk/subscription-utils.ts#L151) | function | src/lib/clerk/subscription-utils.ts:151 |
| [`getUserUsageHistory`](src/lib/credits/track-usage.ts#L68) | function | src/lib/credits/track-usage.ts:68 |
| [`getUserUsageSummary`](src/lib/credits/track-usage.ts#L85) | function | src/lib/credits/track-usage.ts:85 |
| [`getVectorClient`](src/lib/knowledge/vector-client.ts#L32) | function | src/lib/knowledge/vector-client.ts:32 |
| [`getVisiblePageSections`](src/lib/cms/queries.ts#L170) | function | src/lib/cms/queries.ts:170 |
| [`getWeekStart`](src/app/(protected)/organization/[orgId]/page.tsx#L254) | function | src/app/(protected)/organization/[orgId]/page.tsx:254 |
| [`GoogleDriveBrowserMode`](src/types/google-drive.ts#L1) | type | src/types/google-drive.ts:1 |
| [`GoogleDriveItem`](src/types/google-drive.ts#L10) | interface | src/types/google-drive.ts:10 |
| [`GoogleDriveListRequest`](src/types/google-drive.ts#L3) | interface | src/types/google-drive.ts:3 |
| [`GoogleDriveListResponse`](src/types/google-drive.ts#L27) | interface | src/types/google-drive.ts:27 |
| [`GoogleDriveService`](src/server/google-drive-service.ts#L70) | class | src/server/google-drive-service.ts:70 |
| [`GoogleDriveUploadResult`](src/types/google-drive.ts#L32) | interface | src/types/google-drive.ts:32 |
| [`GradientDefinition`](src/lib/assets/gradients-library.ts#L3) | interface | src/lib/assets/gradients-library.ts:3 |
| [`GradientsPanel`](src/components/templates/sidebar/gradients-panel.tsx#L13) | function | src/components/templates/sidebar/gradients-panel.tsx:13 |
| [`GradientStop`](src/types/template.ts#L114) | interface | src/types/template.ts:114 |
| [`groupPostsByDay`](src/components/agenda/calendar/calendar-utils.ts#L65) | function | src/components/agenda/calendar/calendar-utils.ts:65 |
| [`GuideLine`](src/lib/konva-smart-guides.ts#L55) | interface | src/lib/konva-smart-guides.ts:55 |
| [`handleDisambiguationChoice`](src/lib/knowledge/disambiguation.ts#L43) | function | src/lib/knowledge/disambiguation.ts:43 |
| [`handleGenerate`](src/components/ai-creative-generator/tabs/ai-generation-tab.tsx#L53) | function | src/components/ai-creative-generator/tabs/ai-generation-tab.tsx:53 |
| [`handleSelectGenerated`](src/components/ai-creative-generator/tabs/ai-generation-tab.tsx#L140) | function | src/components/ai-creative-generator/tabs/ai-generation-tab.tsx:140 |
| [`handleSubscriptionChange`](src/lib/clerk/subscription-utils.ts#L86) | function | src/lib/clerk/subscription-utils.ts:86 |
| [`hasFeatureAccess`](src/lib/clerk/subscription-utils.ts#L127) | function | src/lib/clerk/subscription-utils.ts:127 |
| [`hasProjectReadAccess`](src/lib/projects/access.ts#L34) | function | src/lib/projects/access.ts:34 |
| [`hasProjectWriteAccess`](src/lib/projects/access.ts#L54) | function | src/lib/projects/access.ts:54 |
| [`hasTemplateReadAccess`](src/lib/templates/access.ts#L27) | function | src/lib/templates/access.ts:27 |
| [`hasTemplateWriteAccess`](src/lib/templates/access.ts#L54) | function | src/lib/templates/access.ts:54 |
| [`HighlightsShadowsFilter`](src/lib/konva/filters/HighlightsShadowsFilter.ts#L12) | function | src/lib/konva/filters/HighlightsShadowsFilter.ts:12 |
| [`HomePage`](src/app/page.tsx#L16) | function | src/app/page.tsx:16 |
| [`HtmlToRichTextConfig`](src/types/rich-text.ts#L157) | interface | src/types/rich-text.ts:157 |
| [`IconDefinition`](src/lib/assets/icon-library.ts#L1) | interface | src/lib/assets/icon-library.ts:1 |
| [`IconsPanel`](src/components/templates/sidebar/icons-panel.tsx#L8) | function | src/components/templates/sidebar/icons-panel.tsx:8 |
| [`ImageLoader`](src/lib/render-engine.ts#L10) | type | src/lib/render-engine.ts:10 |
| [`ImageSize`](src/lib/image-crop-utils.ts#L22) | interface | src/lib/image-crop-utils.ts:22 |
| [`ImageSource`](src/lib/ai-creative-generator/layout-types.ts#L54) | interface | src/lib/ai-creative-generator/layout-types.ts:54 |
| [`ImageSourceTabs`](src/components/ai-creative-generator/image-source-tabs.tsx#L21) | function | src/components/ai-creative-generator/image-source-tabs.tsx:21 |
| [`ImageToolbar`](src/components/templates/image-toolbar.tsx#L22) | function | src/components/templates/image-toolbar.tsx:22 |
| [`indexEntry`](src/lib/knowledge/indexer.ts#L42) | function | src/lib/knowledge/indexer.ts:42 |
| [`IndexEntryInput`](src/lib/knowledge/indexer.ts#L12) | interface | src/lib/knowledge/indexer.ts:12 |
| [`indexFile`](src/lib/knowledge/indexer.ts#L125) | function | src/lib/knowledge/indexer.ts:125 |
| [`IndexFileInput`](src/lib/knowledge/indexer.ts#L24) | interface | src/lib/knowledge/indexer.ts:24 |
| [`initializeUserSubscription`](src/lib/clerk/subscription-utils.ts#L65) | function | src/lib/clerk/subscription-utils.ts:65 |
| [`InstagramApiException`](src/lib/instagram/graph-api-client.ts#L40) | class | src/lib/instagram/graph-api-client.ts:40 |
| [`InstagramContentType`](src/lib/later/types.ts#L58) | type | src/lib/later/types.ts:58 |
| [`InstagramDashboardData`](src/hooks/use-instagram-analytics.ts#L4) | interface | src/hooks/use-instagram-analytics.ts:4 |
| [`InstagramGraphApiClient`](src/lib/instagram/graph-api-client.ts#L75) | class | src/lib/instagram/graph-api-client.ts:75 |
| [`InstagramPlatformData`](src/lib/later/types.ts#L63) | interface | src/lib/later/types.ts:63 |
| [`InstagramPreset`](src/lib/templates/instagram-presets.ts#L1) | interface | src/lib/templates/instagram-presets.ts:1 |
| [`InstagramSettings`](src/hooks/use-instagram-analytics.ts#L34) | interface | src/hooks/use-instagram-analytics.ts:34 |
| [`InstagramStory`](src/lib/instagram/graph-api-client.ts#L1) | interface | src/lib/instagram/graph-api-client.ts:1 |
| [`InstagramStoryInsights`](src/lib/instagram/graph-api-client.ts#L10) | interface | src/lib/instagram/graph-api-client.ts:10 |
| [`InstagramSummary`](src/hooks/use-instagram-analytics.ts#L77) | interface | src/hooks/use-instagram-analytics.ts:77 |
| [`InstagramSummaryResponse`](src/hooks/use-instagram-analytics.ts#L96) | interface | src/hooks/use-instagram-analytics.ts:96 |
| [`Instance`](prisma/generated/client/runtime/index-browser.d.ts#L25) | type | prisma/generated/client/runtime/index-browser.d.ts:25 |
| [`InsufficientCreditsError`](src/lib/credits/errors.ts#L1) | class | src/lib/credits/errors.ts:1 |
| [`invalidateCategoryCache`](src/lib/knowledge/cache.ts#L320) | function | src/lib/knowledge/cache.ts:320 |
| [`invalidateProjectCache`](src/lib/knowledge/cache.ts#L275) | function | src/lib/knowledge/cache.ts:275 |
| [`Invitation`](src/hooks/admin/use-admin-invitations.ts#L7) | interface | src/hooks/admin/use-admin-invitations.ts:7 |
| [`InvitationsResponse`](src/hooks/admin/use-admin-invitations.ts#L16) | interface | src/hooks/admin/use-admin-invitations.ts:16 |
| [`InviteDetailsDialog`](src/app/admin/clients/_components/invite-details-dialog.tsx#L34) | function | src/app/admin/clients/_components/invite-details-dialog.tsx:34 |
| [`InviteStatusBadge`](src/app/admin/clients/_components/invite-status-badge.tsx#L17) | function | src/app/admin/clients/_components/invite-status-badge.tsx:17 |
| [`isAdmin`](src/lib/admin-utils.ts#L6) | function | src/lib/admin-utils.ts:6 |
| [`isAdminUser`](src/lib/permissions.ts#L12) | function | src/lib/permissions.ts:12 |
| [`isDatabaseConnected`](src/lib/db-utils.ts#L54) | function | src/lib/db-utils.ts:54 |
| [`isDisambiguationResponse`](src/lib/knowledge/disambiguation.ts#L24) | function | src/lib/knowledge/disambiguation.ts:24 |
| [`isExternalImage`](src/lib/utils.ts#L26) | function | src/lib/utils.ts:26 |
| [`isFFmpegAvailable`](src/lib/video/ffmpeg-server-converter.ts#L381) | function | src/lib/video/ffmpeg-server-converter.ts:381 |
| [`isFFmpegSupported`](src/lib/video/ffmpeg-converter.ts#L196) | function | src/lib/video/ffmpeg-converter.ts:196 |
| [`isImageFile`](src/lib/images/client-resize.ts#L187) | function | src/lib/images/client-resize.ts:187 |
| [`isLaterApiError`](src/lib/later/errors.ts#L231) | function | src/lib/later/errors.ts:231 |
| [`isLowEndDevice`](src/lib/performance-utils.ts#L91) | function | src/lib/performance-utils.ts:91 |
| [`isMobileDevice`](src/lib/performance-utils.ts#L74) | function | src/lib/performance-utils.ts:74 |
| [`isPhotoSwipeOpen`](src/hooks/use-photoswipe.ts#L12) | function | src/hooks/use-photoswipe.ts:12 |
| [`isRateLimitError`](src/lib/later/errors.ts#L238) | function | src/lib/later/errors.ts:238 |
| [`isRetinaDevice`](src/lib/performance-utils.ts#L82) | function | src/lib/performance-utils.ts:82 |
| [`isVideoFile`](src/lib/images/client-resize.ts#L207) | function | src/lib/images/client-resize.ts:207 |
| [`isYoutubeUrl`](src/lib/youtube/utils.ts#L20) | function | src/lib/youtube/utils.ts:20 |
| [`KnowledgeBaseEntry`](src/hooks/admin/use-admin-knowledge.ts#L10) | interface | src/hooks/admin/use-admin-knowledge.ts:10 |
| [`KnowledgeChunk`](src/hooks/admin/use-admin-knowledge.ts#L30) | interface | src/hooks/admin/use-admin-knowledge.ts:30 |
| [`KnowledgeEditPage`](src/app/(protected)/knowledge/[id]/edit/page.tsx#L28) | function | src/app/(protected)/knowledge/[id]/edit/page.tsx:28 |
| [`KnowledgeEntryWithChunks`](src/hooks/admin/use-admin-knowledge.ts#L41) | interface | src/hooks/admin/use-admin-knowledge.ts:41 |
| [`KnowledgeForm`](src/components/admin/knowledge/knowledge-form.tsx#L78) | function | src/components/admin/knowledge/knowledge-form.tsx:78 |
| [`KnowledgeListResponse`](src/hooks/admin/use-admin-knowledge.ts#L45) | interface | src/hooks/admin/use-admin-knowledge.ts:45 |
| [`LaterAccount`](src/hooks/use-later-accounts.ts#L9) | interface | src/hooks/use-later-accounts.ts:9 |
| [`LaterAccount`](src/lib/later/types.ts#L9) | interface | src/lib/later/types.ts:9 |
| [`LaterAnalyticsData`](src/lib/later/types.ts#L236) | interface | src/lib/later/types.ts:236 |
| [`LaterAnalyticsResponse`](src/lib/later/types.ts#L281) | interface | src/lib/later/types.ts:281 |
| [`LaterApiError`](src/lib/later/errors.ts#L10) | class | src/lib/later/errors.ts:10 |
| [`LaterAuthError`](src/lib/later/errors.ts#L103) | class | src/lib/later/errors.ts:103 |
| [`LaterAuthorizationError`](src/lib/later/errors.ts#L113) | class | src/lib/later/errors.ts:113 |
| [`LaterClient`](src/lib/later/client.ts#L44) | class | src/lib/later/client.ts:44 |
| [`LaterClientConfig`](src/lib/later/types.ts#L222) | interface | src/lib/later/types.ts:222 |
| [`LaterErrorResponse`](src/lib/later/types.ts#L166) | interface | src/lib/later/types.ts:166 |
| [`LaterListResponse`](src/lib/later/types.ts#L153) | interface | src/lib/later/types.ts:153 |
| [`LaterMediaUpload`](src/lib/later/types.ts#L37) | interface | src/lib/later/types.ts:37 |
| [`LaterMediaUploadError`](src/lib/later/errors.ts#L199) | class | src/lib/later/errors.ts:199 |
| [`LaterNetworkError`](src/lib/later/errors.ts#L174) | class | src/lib/later/errors.ts:174 |
| [`LaterNotFoundError`](src/lib/later/errors.ts#L123) | class | src/lib/later/errors.ts:123 |
| [`LaterPost`](src/lib/later/types.ts#L88) | interface | src/lib/later/types.ts:88 |
| [`LaterPostAnalytics`](src/lib/later/types.ts#L299) | interface | src/lib/later/types.ts:299 |
| [`LaterPostStatus`](src/lib/later/types.ts#L53) | type | src/lib/later/types.ts:53 |
| [`LaterRateLimitError`](src/lib/later/errors.ts#L64) | class | src/lib/later/errors.ts:64 |
| [`LaterRawAnalyticsPost`](src/lib/later/types.ts#L251) | interface | src/lib/later/types.ts:251 |
| [`LaterValidationError`](src/lib/later/errors.ts#L150) | class | src/lib/later/errors.ts:150 |
| [`LaterWebhookEventType`](src/lib/later/types.ts#L177) | type | src/lib/later/types.ts:177 |
| [`LaterWebhookPayload`](src/lib/later/types.ts#L186) | interface | src/lib/later/types.ts:186 |
| [`Layer`](src/types/template.ts#L25) | interface | src/types/template.ts:25 |
| [`LayerBinding`](src/lib/ai-creative-generator/layout-types.ts#L66) | interface | src/lib/ai-creative-generator/layout-types.ts:66 |
| [`LayerStyle`](src/types/template.ts#L72) | interface | src/types/template.ts:72 |
| [`LayerType`](src/types/template.ts#L13) | type | src/types/template.ts:13 |
| [`LayoutId`](src/lib/ai-creative-generator/layout-types.ts#L6) | type | src/lib/ai-creative-generator/layout-types.ts:6 |
| [`LayoutResult`](src/types/rich-text.ts#L108) | interface | src/types/rich-text.ts:108 |
| [`LayoutSelector`](src/components/ai-creative-generator/layout-selector.tsx#L11) | function | src/components/ai-creative-generator/layout-selector.tsx:11 |
| [`LayoutTemplate`](src/lib/ai-creative-generator/layout-types.ts#L31) | interface | src/lib/ai-creative-generator/layout-types.ts:31 |
| [`LayoutZone`](src/lib/ai-creative-generator/layout-types.ts#L10) | interface | src/lib/ai-creative-generator/layout-types.ts:10 |
| [`LineAlignment`](src/types/rich-text.ts#L99) | interface | src/types/rich-text.ts:99 |
| [`listClientInvites`](src/lib/services/client-invite-service.ts#L107) | function | src/lib/services/client-invite-service.ts:107 |
| [`listClientProjects`](src/lib/services/client-project-service.ts#L26) | function | src/lib/services/client-project-service.ts:26 |
| [`ListEntriesParams`](src/hooks/admin/use-admin-knowledge.ts#L85) | interface | src/hooks/admin/use-admin-knowledge.ts:85 |
| [`listOrganizationMemberAnalytics`](src/lib/organizations/analytics.ts#L236) | function | src/lib/organizations/analytics.ts:236 |
| [`loadBrandAssets`](src/lib/ai-creative-generator/brand-assets-loader.ts#L9) | function | src/lib/ai-creative-generator/brand-assets-loader.ts:9 |
| [`LocalUploadTab`](src/components/ai-creative-generator/tabs/local-upload-tab.tsx#L12) | function | src/components/ai-creative-generator/tabs/local-upload-tab.tsx:12 |
| [`markInviteAccepted`](src/lib/services/client-invite-service.ts#L230) | function | src/lib/services/client-invite-service.ts:230 |
| [`markInviteCompleted`](src/lib/services/client-invite-service.ts#L241) | function | src/lib/services/client-invite-service.ts:241 |
| [`markOrganizationDeleted`](src/lib/organizations/service.ts#L211) | function | src/lib/organizations/service.ts:211 |
| [`MatchType`](src/lib/knowledge/training-pipeline.ts#L7) | type | src/lib/knowledge/training-pipeline.ts:7 |
| [`MediaUploadOptions`](src/lib/later/types.ts#L204) | interface | src/lib/later/types.ts:204 |
| [`MemberAnalyticsRow`](src/components/organization/member-analytics-table.tsx#L10) | type | src/components/organization/member-analytics-table.tsx:10 |
| [`MemberAnalyticsStats`](src/lib/organizations/analytics.ts#L11) | type | src/lib/organizations/analytics.ts:11 |
| [`MemberAvatar`](src/components/members/member-avatar.tsx#L15) | function | src/components/members/member-avatar.tsx:15 |
| [`MenuEditPage`](src/app/admin/content/menus/[id]/page.tsx#L10) | function | src/app/admin/content/menus/[id]/page.tsx:10 |
| [`MobileToolsDrawer`](src/components/templates/mobile-tools-drawer.tsx#L32) | function | src/components/templates/mobile-tools-drawer.tsx:32 |
| [`MobileToolsDrawerCompact`](src/components/templates/mobile-tools-drawer.tsx#L87) | function | src/components/templates/mobile-tools-drawer.tsx:87 |
| [`Modulo`](prisma/generated/client/runtime/index-browser.d.ts#L27) | type | prisma/generated/client/runtime/index-browser.d.ts:27 |
| [`monthEnd`](src/app/api/admin/studio/route.ts#L49) | function | src/app/api/admin/studio/route.ts:49 |
| [`MonthOverview`](src/components/calendar/month-overview.tsx#L17) | function | src/components/calendar/month-overview.tsx:17 |
| [`monthStart`](src/app/api/admin/studio/route.ts#L52) | function | src/app/api/admin/studio/route.ts:52 |
| [`moveBackward`](src/lib/konva-alignment.ts#L469) | function | src/lib/konva-alignment.ts:469 |
| [`moveForward`](src/lib/konva-alignment.ts#L443) | function | src/lib/konva-alignment.ts:443 |
| [`MultiPageDesignData`](src/types/template.ts#L220) | interface | src/types/template.ts:220 |
| [`MultiPageProvider`](src/contexts/multi-page-context.tsx#L26) | function | src/contexts/multi-page-context.tsx:26 |
| [`MultipleMatchesCard`](src/components/chat/multiple-matches-card.tsx#L35) | function | src/components/chat/multiple-matches-card.tsx:35 |
| [`MusicStemProgressProps`](src/components/audio/music-stem-progress.tsx#L8) | interface | src/components/audio/music-stem-progress.tsx:8 |
| [`needsCrop`](src/lib/image-crop-utils.ts#L122) | function | src/lib/image-crop-utils.ts:122 |
| [`needsCropping`](src/lib/images/auto-crop.ts#L71) | function | src/lib/images/auto-crop.ts:71 |
| [`NextStep`](src/app/(protected)/organization/[orgId]/page.tsx#L237) | function | src/app/(protected)/organization/[orgId]/page.tsx:237 |
| [`ObjectionsSection`](src/components/sales/ObjectionsSection.tsx#L30) | function | src/components/sales/ObjectionsSection.tsx:30 |
| [`OpenRouterModel`](src/hooks/use-openrouter-models.ts#L6) | interface | src/hooks/use-openrouter-models.ts:6 |
| [`OpenRouterModelsResponse`](src/hooks/use-openrouter-models.ts#L11) | interface | src/hooks/use-openrouter-models.ts:11 |
| [`OperationType`](src/hooks/use-credits.ts#L9) | type | src/hooks/use-credits.ts:9 |
| [`OPTIONS`](src/app/api/webhooks/reminder-confirm/route.ts#L84) | function | src/app/api/webhooks/reminder-confirm/route.ts:84 |
| [`OrganizationAccessError`](src/lib/organizations/permissions.ts#L12) | class | src/lib/organizations/permissions.ts:12 |
| [`OrganizationAuthContext`](src/lib/organizations/permissions.ts#L3) | type | src/lib/organizations/permissions.ts:3 |
| [`OrganizationMembersPage`](src/app/(protected)/organization/[orgId]/members/[[...rest]]/page.tsx#L9) | function | src/app/(protected)/organization/[orgId]/members/[[...rest]]/page.tsx:9 |
| [`Page`](src/types/template.ts#L205) | interface | src/types/template.ts:205 |
| [`PageEditor`](src/components/admin/cms/page-editor.tsx#L17) | function | src/components/admin/cms/page-editor.tsx:17 |
| [`PageMetadata`](src/contexts/page-metadata.tsx#L10) | interface | src/contexts/page-metadata.tsx:10 |
| [`PageMetadataProvider`](src/contexts/page-metadata.tsx#L25) | function | src/contexts/page-metadata.tsx:25 |
| [`PageSyncWrapper`](src/components/templates/page-sync-wrapper.tsx#L13) | function | src/components/templates/page-sync-wrapper.tsx:13 |
| [`ParsedRichText`](src/types/rich-text.ts#L54) | interface | src/types/rich-text.ts:54 |
| [`parseFileContent`](src/lib/knowledge/chunking.ts#L167) | function | src/lib/knowledge/chunking.ts:167 |
| [`parseMarkdownContent`](src/lib/knowledge/chunking.ts#L148) | function | src/lib/knowledge/chunking.ts:148 |
| [`parseTxtContent`](src/lib/knowledge/chunking.ts#L138) | function | src/lib/knowledge/chunking.ts:138 |
| [`PATCH`](src/app/api/prompts/[promptId]/route.ts#L64) | function | src/app/api/prompts/[promptId]/route.ts:64 |
| [`PATCH`](src/app/api/cms/sections/route.ts#L103) | function | src/app/api/cms/sections/route.ts:103 |
| [`PATCH`](src/app/api/biblioteca-musicas/[id]/route.ts#L50) | function | src/app/api/biblioteca-musicas/[id]/route.ts:50 |
| [`PATCH`](src/app/api/admin/site-settings/route.ts#L44) | function | src/app/api/admin/site-settings/route.ts:44 |
| [`PATCH`](src/app/api/projects/[projectId]/settings/route.ts#L9) | function | src/app/api/projects/[projectId]/settings/route.ts:9 |
| [`PATCH`](src/app/api/projects/[projectId]/instagram/route.ts#L14) | function | src/app/api/projects/[projectId]/instagram/route.ts:14 |
| [`PATCH`](src/app/api/organizations/[orgId]/settings/route.ts#L63) | function | src/app/api/organizations/[orgId]/settings/route.ts:63 |
| [`PATCH`](src/app/api/cms/sections/[id]/route.ts#L54) | function | src/app/api/cms/sections/[id]/route.ts:54 |
| [`PATCH`](src/app/api/cms/pages/[id]/route.ts#L57) | function | src/app/api/cms/pages/[id]/route.ts:57 |
| [`PATCH`](src/app/api/cms/menus/[id]/route.ts#L49) | function | src/app/api/cms/menus/[id]/route.ts:49 |
| [`PATCH`](src/app/api/cms/menu-items/reorder/route.ts#L20) | function | src/app/api/cms/menu-items/reorder/route.ts:20 |
| [`PATCH`](src/app/api/cms/menu-items/[id]/route.ts#L20) | function | src/app/api/cms/menu-items/[id]/route.ts:20 |
| [`PATCH`](src/app/api/cms/media/[id]/route.ts#L51) | function | src/app/api/cms/media/[id]/route.ts:51 |
| [`PATCH`](src/app/api/cms/components/[id]/route.ts#L53) | function | src/app/api/cms/components/[id]/route.ts:53 |
| [`PATCH`](src/app/api/ai/conversations/[id]/route.ts#L130) | function | src/app/api/ai/conversations/[id]/route.ts:130 |
| [`PATCH`](src/app/api/admin/clients/[id]/route.ts#L34) | function | src/app/api/admin/clients/[id]/route.ts:34 |
| [`PATCH`](src/app/api/admin/client-projects/[projectId]/route.ts#L43) | function | src/app/api/admin/client-projects/[projectId]/route.ts:43 |
| [`PATCH`](src/app/api/templates/[id]/pages/[pageId]/route.ts#L71) | function | src/app/api/templates/[id]/pages/[pageId]/route.ts:71 |
| [`PATCH`](src/app/api/projects/[projectId]/logos/[logoId]/route.ts#L12) | function | src/app/api/projects/[projectId]/logos/[logoId]/route.ts:12 |
| [`PATCH`](src/app/api/pages/[pageId]/layers/[layerId]/route.ts#L10) | function | src/app/api/pages/[pageId]/layers/[layerId]/route.ts:10 |
| [`PATCH`](src/app/api/templates/[id]/pages/[pageId]/toggle-template/route.ts#L15) | function | src/app/api/templates/[id]/pages/[pageId]/toggle-template/route.ts:15 |
| [`PermissionError`](src/lib/permissions.ts#L5) | class | src/lib/permissions.ts:5 |
| [`Plan`](src/hooks/use-admin-plans.ts#L7) | interface | src/hooks/use-admin-plans.ts:7 |
| [`PlanCta`](src/components/plans/plan-tier-config.tsx#L11) | type | src/components/plans/plan-tier-config.tsx:11 |
| [`PlanDisplay`](src/components/plans/plan-types.ts#L7) | type | src/components/plans/plan-types.ts:7 |
| [`PlanEmptyState`](src/components/admin/plans/plan-empty-state.tsx#L3) | function | src/components/admin/plans/plan-empty-state.tsx:3 |
| [`PlanFeature`](src/components/plans/plan-tier-config.tsx#L5) | type | src/components/plans/plan-tier-config.tsx:5 |
| [`PlanFeatureDisplay`](src/components/plans/plan-types.ts#L1) | type | src/components/plans/plan-types.ts:1 |
| [`PlanFeatureForm`](src/components/admin/plans/types.ts#L31) | type | src/components/admin/plans/types.ts:31 |
| [`PlanOption`](src/lib/credits/settings.ts#L46) | type | src/lib/credits/settings.ts:46 |
| [`PlanOrganizationLimits`](src/lib/organizations/limits.ts#L6) | type | src/lib/organizations/limits.ts:6 |
| [`PlansResponse`](src/hooks/use-admin-plans.ts#L34) | interface | src/hooks/use-admin-plans.ts:34 |
| [`PlanSummaryCards`](src/components/admin/plans/plan-summary-cards.tsx#L8) | function | src/components/admin/plans/plan-summary-cards.tsx:8 |
| [`PlanTierView`](src/components/plans/plan-tier-config.tsx#L17) | type | src/components/plans/plan-tier-config.tsx:17 |
| [`PlatformSpecificData`](src/lib/later/types.ts#L80) | interface | src/lib/later/types.ts:80 |
| [`POST`](src/app/api/upload/route.ts#L9) | function | src/app/api/upload/route.ts:9 |
| [`POST`](src/app/api/templates/route.ts#L142) | function | src/app/api/templates/route.ts:142 |
| [`POST`](src/app/api/prompts/route.ts#L76) | function | src/app/api/prompts/route.ts:76 |
| [`POST`](src/app/api/projects/route.ts#L204) | function | src/app/api/projects/route.ts:204 |
| [`POST`](src/app/api/knowledge/route.ts#L157) | function | src/app/api/knowledge/route.ts:157 |
| [`POST`](src/app/api/google-drive-download/route.ts#L22) | function | src/app/api/google-drive-download/route.ts:22 |
| [`POST`](src/app/api/biblioteca-musicas/route.ts#L47) | function | src/app/api/biblioteca-musicas/route.ts:47 |
| [`POST`](src/app/api/ai-images-download/route.ts#L21) | function | src/app/api/ai-images-download/route.ts:21 |
| [`POST`](src/app/api/webhooks/reminder-confirm/route.ts#L14) | function | src/app/api/webhooks/reminder-confirm/route.ts:14 |
| [`POST`](src/app/api/webhooks/later/route.ts#L9) | function | src/app/api/webhooks/later/route.ts:9 |
| [`POST`](src/app/api/webhooks/late/route.ts#L91) | function | src/app/api/webhooks/late/route.ts:91 |
| [`POST`](src/app/api/webhooks/clerk/route.ts#L53) | function | src/app/api/webhooks/clerk/route.ts:53 |
| [`POST`](src/app/api/video-processing/upload/route.ts#L27) | function | src/app/api/video-processing/upload/route.ts:27 |
| [`POST`](src/app/api/video-processing/queue/route.ts#L47) | function | src/app/api/video-processing/queue/route.ts:47 |
| [`POST`](src/app/api/video-processing/process/route.ts#L315) | function | src/app/api/video-processing/process/route.ts:315 |
| [`POST`](src/app/api/upload/signed-url/route.ts#L7) | function | src/app/api/upload/signed-url/route.ts:7 |
| [`POST`](src/app/api/upload/google-drive/route.ts#L31) | function | src/app/api/upload/google-drive/route.ts:31 |
| [`POST`](src/app/api/templates/generate-thumbnail/route.ts#L18) | function | src/app/api/templates/generate-thumbnail/route.ts:18 |
| [`POST`](src/app/api/templates/export/route.ts#L13) | function | src/app/api/templates/export/route.ts:13 |
| [`POST`](src/app/api/organizations/sync/route.ts#L18) | function | src/app/api/organizations/sync/route.ts:18 |
| [`POST`](src/app/api/knowledge/confirm/route.ts#L39) | function | src/app/api/knowledge/confirm/route.ts:39 |
| [`POST`](src/app/api/google-drive/start-oauth/route.ts#L9) | function | src/app/api/google-drive/start-oauth/route.ts:9 |
| [`POST`](src/app/api/generations/bulk-delete/route.ts#L11) | function | src/app/api/generations/bulk-delete/route.ts:11 |
| [`POST`](src/app/api/cron/verify-stories/route.ts#L23) | function | src/app/api/cron/verify-stories/route.ts:23 |
| [`POST`](src/app/api/cron/refill-org-credits/route.ts#L65) | function | src/app/api/cron/refill-org-credits/route.ts:65 |
| [`POST`](src/app/api/cms/sections/route.ts#L62) | function | src/app/api/cms/sections/route.ts:62 |
| [`POST`](src/app/api/cms/pages/route.ts#L54) | function | src/app/api/cms/pages/route.ts:54 |
| [`POST`](src/app/api/cms/menus/route.ts#L40) | function | src/app/api/cms/menus/route.ts:40 |
| [`POST`](src/app/api/cms/menu-items/route.ts#L21) | function | src/app/api/cms/menu-items/route.ts:21 |
| [`POST`](src/app/api/cms/components/route.ts#L54) | function | src/app/api/cms/components/route.ts:54 |
| [`POST`](src/app/api/biblioteca-musicas/youtube/route.ts#L25) | function | src/app/api/biblioteca-musicas/youtube/route.ts:25 |
| [`POST`](src/app/api/biblioteca-musicas/upload-url/route.ts#L12) | function | src/app/api/biblioteca-musicas/upload-url/route.ts:12 |
| [`POST`](src/app/api/biblioteca-musicas/confirm/route.ts#L10) | function | src/app/api/biblioteca-musicas/confirm/route.ts:10 |
| [`POST`](src/app/api/ai/image/route.ts#L62) | function | src/app/api/ai/image/route.ts:62 |
| [`POST`](src/app/api/ai/generate-image/route.ts#L78) | function | src/app/api/ai/generate-image/route.ts:78 |
| [`POST`](src/app/api/ai/generate-creative/route.ts#L52) | function | src/app/api/ai/generate-creative/route.ts:52 |
| [`POST`](src/app/api/ai/conversations/route.ts#L15) | function | src/app/api/ai/conversations/route.ts:15 |
| [`POST`](src/app/api/ai/chat/route.ts#L131) | function | src/app/api/ai/chat/route.ts:131 |
| [`POST`](src/app/api/admin/settings/route.ts#L38) | function | src/app/api/admin/settings/route.ts:38 |
| [`POST`](src/app/api/admin/plans/route.ts#L113) | function | src/app/api/admin/plans/route.ts:113 |
| [`POST`](src/app/api/admin/knowledge/route.ts#L140) | function | src/app/api/admin/knowledge/route.ts:140 |
| [`POST`](src/app/api/admin/feature-grid/route.ts#L45) | function | src/app/api/admin/feature-grid/route.ts:45 |
| [`POST`](src/app/api/admin/clients/route.ts#L83) | function | src/app/api/admin/clients/route.ts:83 |
| [`POST`](src/app/api/webhooks/instagram/story/route.ts#L25) | function | src/app/api/webhooks/instagram/story/route.ts:25 |
| [`POST`](src/app/api/webhooks/instagram/report/route.ts#L46) | function | src/app/api/webhooks/instagram/report/route.ts:46 |
| [`POST`](src/app/api/webhooks/instagram/feed/route.ts#L25) | function | src/app/api/webhooks/instagram/feed/route.ts:25 |
| [`POST`](src/app/api/webhooks/buffer/post-sent/route.ts#L9) | function | src/app/api/webhooks/buffer/post-sent/route.ts:9 |
| [`POST`](src/app/api/templates/[id]/thumbnail/route.ts#L13) | function | src/app/api/templates/[id]/thumbnail/route.ts:13 |
| [`POST`](src/app/api/templates/[id]/pages/route.ts#L82) | function | src/app/api/templates/[id]/pages/route.ts:82 |
| [`POST`](src/app/api/templates/[id]/export/route.ts#L16) | function | src/app/api/templates/[id]/export/route.ts:16 |
| [`POST`](src/app/api/templates/[id]/duplicate/route.ts#L11) | function | src/app/api/templates/[id]/duplicate/route.ts:11 |
| [`POST`](src/app/api/templates/[id]/create-from-template/route.ts#L26) | function | src/app/api/templates/[id]/create-from-template/route.ts:26 |
| [`POST`](src/app/api/projects/[projectId]/test-webhook/route.ts#L10) | function | src/app/api/projects/[projectId]/test-webhook/route.ts:10 |
| [`POST`](src/app/api/projects/[projectId]/templates/route.ts#L44) | function | src/app/api/projects/[projectId]/templates/route.ts:44 |
| [`POST`](src/app/api/projects/[projectId]/prompts/route.ts#L48) | function | src/app/api/projects/[projectId]/prompts/route.ts:48 |
| [`POST`](src/app/api/projects/[projectId]/posts/route.ts#L40) | function | src/app/api/projects/[projectId]/posts/route.ts:40 |
| [`POST`](src/app/api/projects/[projectId]/logos/route.ts#L38) | function | src/app/api/projects/[projectId]/logos/route.ts:38 |
| [`POST`](src/app/api/projects/[projectId]/fonts/route.ts#L38) | function | src/app/api/projects/[projectId]/fonts/route.ts:38 |
| [`POST`](src/app/api/projects/[projectId]/elements/route.ts#L38) | function | src/app/api/projects/[projectId]/elements/route.ts:38 |
| [`POST`](src/app/api/projects/[projectId]/colors/route.ts#L36) | function | src/app/api/projects/[projectId]/colors/route.ts:36 |
| [`POST`](src/app/api/posts/[postId]/analytics/route.ts#L81) | function | src/app/api/posts/[postId]/analytics/route.ts:81 |
| [`POST`](src/app/api/organizations/webhooks/clerk/route.ts#L18) | function | src/app/api/organizations/webhooks/clerk/route.ts:18 |
| [`POST`](src/app/api/organizations/[orgId]/projects/route.ts#L67) | function | src/app/api/organizations/[orgId]/projects/route.ts:67 |
| [`POST`](src/app/api/organizations/[orgId]/credits/route.ts#L68) | function | src/app/api/organizations/[orgId]/credits/route.ts:68 |
| [`POST`](src/app/api/knowledge/training/preview/route.ts#L16) | function | src/app/api/knowledge/training/preview/route.ts:16 |
| [`POST`](src/app/api/export/video/validate/route.ts#L10) | function | src/app/api/export/video/validate/route.ts:10 |
| [`POST`](src/app/api/export/video/upload-url/route.ts#L35) | function | src/app/api/export/video/upload-url/route.ts:35 |
| [`POST`](src/app/api/export/video/save/route.ts#L17) | function | src/app/api/export/video/save/route.ts:17 |
| [`POST`](src/app/api/export/video/confirm/route.ts#L12) | function | src/app/api/export/video/confirm/route.ts:12 |
| [`POST`](src/app/api/drive/folders/create/route.ts#L20) | function | src/app/api/drive/folders/create/route.ts:20 |
| [`POST`](src/app/api/drive/files/upload/route.ts#L10) | function | src/app/api/drive/files/upload/route.ts:10 |
| [`POST`](src/app/api/drive/files/move/route.ts#L14) | function | src/app/api/drive/files/move/route.ts:14 |
| [`POST`](src/app/api/cms/media/upload/route.ts#L14) | function | src/app/api/cms/media/upload/route.ts:14 |
| [`POST`](src/app/api/cms/media/bulk-delete/route.ts#L16) | function | src/app/api/cms/media/bulk-delete/route.ts:16 |
| [`POST`](src/app/api/biblioteca-musicas/[id]/reprocess-stem/route.ts#L10) | function | src/app/api/biblioteca-musicas/[id]/reprocess-stem/route.ts:10 |
| [`POST`](src/app/api/ai/conversations/cleanup/route.ts#L25) | function | src/app/api/ai/conversations/cleanup/route.ts:25 |
| [`POST`](src/app/api/admin/verify-story/[postId]/route.ts#L30) | function | src/app/api/admin/verify-story/[postId]/route.ts:30 |
| [`POST`](src/app/api/admin/users/sync/route.ts#L12) | function | src/app/api/admin/users/sync/route.ts:12 |
| [`POST`](src/app/api/admin/users/invite/route.ts#L17) | function | src/app/api/admin/users/invite/route.ts:17 |
| [`POST`](src/app/api/admin/plans/refresh-pricing/route.ts#L9) | function | src/app/api/admin/plans/refresh-pricing/route.ts:9 |
| [`POST`](src/app/api/admin/knowledge/migrate-workspace/route.ts#L73) | function | src/app/api/admin/knowledge/migrate-workspace/route.ts:73 |
| [`POST`](src/app/api/templates/[id]/pages/reorder/route.ts#L15) | function | src/app/api/templates/[id]/pages/reorder/route.ts:15 |
| [`POST`](src/app/api/projects/[projectId]/google-drive/download/route.ts#L16) | function | src/app/api/projects/[projectId]/google-drive/download/route.ts:16 |
| [`POST`](src/app/api/projects/[projectId]/generations/carousel/route.ts#L12) | function | src/app/api/projects/[projectId]/generations/carousel/route.ts:12 |
| [`POST`](src/app/api/cms/sections/[id]/toggle-visibility/route.ts#L9) | function | src/app/api/cms/sections/[id]/toggle-visibility/route.ts:9 |
| [`POST`](src/app/api/cms/sections/[id]/duplicate/route.ts#L9) | function | src/app/api/cms/sections/[id]/duplicate/route.ts:9 |
| [`POST`](src/app/api/cms/pages/[id]/publish/route.ts#L9) | function | src/app/api/cms/pages/[id]/publish/route.ts:9 |
| [`POST`](src/app/api/cms/pages/[id]/duplicate/route.ts#L9) | function | src/app/api/cms/pages/[id]/duplicate/route.ts:9 |
| [`POST`](src/app/api/admin/users/[id]/activate/route.ts#L6) | function | src/app/api/admin/users/[id]/activate/route.ts:6 |
| [`POST`](src/app/api/admin/knowledge/[id]/reindex/route.ts#L37) | function | src/app/api/admin/knowledge/[id]/reindex/route.ts:37 |
| [`POST`](src/app/api/admin/clients/[id]/resend/route.ts#L10) | function | src/app/api/admin/clients/[id]/resend/route.ts:10 |
| [`POST`](src/app/api/admin/clients/[id]/cancel/route.ts#L12) | function | src/app/api/admin/clients/[id]/cancel/route.ts:12 |
| [`POST`](src/app/api/templates/[id]/pages/[pageId]/duplicate/route.ts#L10) | function | src/app/api/templates/[id]/pages/[pageId]/duplicate/route.ts:10 |
| [`POST`](src/app/api/admin/users/invitations/[id]/revoke/route.ts#L7) | function | src/app/api/admin/users/invitations/[id]/revoke/route.ts:7 |
| [`POST`](src/app/api/admin/users/invitations/[id]/resend/route.ts#L7) | function | src/app/api/admin/users/invitations/[id]/resend/route.ts:7 |
| [`PostAnalytics`](src/hooks/use-post-analytics.ts#L9) | interface | src/hooks/use-post-analytics.ts:9 |
| [`PostAnalyticsItem`](src/hooks/use-project-analytics.ts#L9) | interface | src/hooks/use-project-analytics.ts:9 |
| [`PostExecutor`](src/lib/posts/executor.ts#L13) | class | src/lib/posts/executor.ts:13 |
| [`PostFormData`](src/components/posts/post-composer.tsx#L50) | type | src/components/posts/post-composer.tsx:50 |
| [`PostScheduler`](src/lib/posts/scheduler.ts#L37) | class | src/lib/posts/scheduler.ts:37 |
| [`preloadFFmpeg`](src/lib/video/ffmpeg-converter.ts#L210) | function | src/lib/video/ffmpeg-converter.ts:210 |
| [`prepareUploadOptions`](src/lib/later/media-upload.ts#L152) | function | src/lib/later/media-upload.ts:152 |
| [`PricingEditor`](src/components/admin/cms/editors/pricing-editor.tsx#L12) | function | src/components/admin/cms/editors/pricing-editor.tsx:12 |
| [`PrivacyPolicyPage`](src/app/(public)/privacy-policy/page.tsx#L8) | function | src/app/(public)/privacy-policy/page.tsx:8 |
| [`processTrainingInput`](src/lib/knowledge/training-pipeline.ts#L21) | function | src/lib/knowledge/training-pipeline.ts:21 |
| [`ProjectAnalyticsPage`](src/app/(protected)/projects/[id]/analytics/page.tsx#L16) | function | src/app/(protected)/projects/[id]/analytics/page.tsx:16 |
| [`ProjectAnalyticsParams`](src/hooks/use-project-analytics.ts#L46) | interface | src/hooks/use-project-analytics.ts:46 |
| [`ProjectAnalyticsResponse`](src/hooks/use-project-analytics.ts#L37) | interface | src/hooks/use-project-analytics.ts:37 |
| [`ProjectAnalyticsSummary`](src/hooks/use-project-analytics.ts#L25) | interface | src/hooks/use-project-analytics.ts:25 |
| [`ProjectResponse`](src/hooks/use-project.ts#L11) | interface | src/hooks/use-project.ts:11 |
| [`ProjectShare`](src/components/projects/project-share-controls.tsx#L29) | type | src/components/projects/project-share-controls.tsx:29 |
| [`ProjectShareInfo`](src/hooks/use-project.ts#L4) | interface | src/hooks/use-project.ts:4 |
| [`ProjectStatsCards`](src/app/admin/client-projects/_components/project-stats-cards.tsx#L14) | function | src/app/admin/client-projects/_components/project-stats-cards.tsx:14 |
| [`ProjectWithLogoResponse`](src/hooks/use-project.ts#L40) | interface | src/hooks/use-project.ts:40 |
| [`ProjectWithShares`](src/lib/projects/access.ts#L4) | type | src/lib/projects/access.ts:4 |
| [`Prompt`](src/types/prompt.ts#L1) | interface | src/types/prompt.ts:1 |
| [`PromptCategory`](src/types/prompt.ts#L46) | type | src/types/prompt.ts:46 |
| [`PromptFilters`](src/types/prompt.ts#L30) | interface | src/types/prompt.ts:30 |
| [`ProtectedLayout`](src/app/(protected)/layout.tsx#L15) | function | src/app/(protected)/layout.tsx:15 |
| [`PublicLayout`](src/app/(public)/layout.tsx#L5) | function | src/app/(public)/layout.tsx:5 |
| [`PublicPlan`](src/hooks/use-public-plans.ts#L6) | interface | src/hooks/use-public-plans.ts:6 |
| [`publishPage`](src/lib/cms/mutations.ts#L85) | function | src/lib/cms/mutations.ts:85 |
| [`PUT`](src/app/api/templates/[id]/route.ts#L59) | function | src/app/api/templates/[id]/route.ts:59 |
| [`PUT`](src/app/api/knowledge/[id]/route.ts#L103) | function | src/app/api/knowledge/[id]/route.ts:103 |
| [`PUT`](src/app/api/instagram/settings/route.ts#L62) | function | src/app/api/instagram/settings/route.ts:62 |
| [`PUT`](src/app/api/admin/settings/route.ts#L91) | function | src/app/api/admin/settings/route.ts:91 |
| [`PUT`](src/app/api/admin/plans/route.ts#L226) | function | src/app/api/admin/plans/route.ts:226 |
| [`PUT`](src/app/api/admin/feature-costs/route.ts#L36) | function | src/app/api/admin/feature-costs/route.ts:36 |
| [`PUT`](src/app/api/admin/users/[id]/route.ts#L54) | function | src/app/api/admin/users/[id]/route.ts:54 |
| [`PUT`](src/app/api/admin/plans/[clerkId]/route.ts#L61) | function | src/app/api/admin/plans/[clerkId]/route.ts:61 |
| [`PUT`](src/app/api/admin/knowledge/[id]/route.ts#L89) | function | src/app/api/admin/knowledge/[id]/route.ts:89 |
| [`PUT`](src/app/api/admin/feature-grid/[id]/route.ts#L58) | function | src/app/api/admin/feature-grid/[id]/route.ts:58 |
| [`PUT`](src/app/api/admin/credits/[id]/route.ts#L7) | function | src/app/api/admin/credits/[id]/route.ts:7 |
| [`PUT`](src/app/api/projects/[projectId]/posts/[postId]/route.ts#L87) | function | src/app/api/projects/[projectId]/posts/[postId]/route.ts:87 |
| [`PUT`](src/app/api/admin/users/[id]/credits/route.ts#L7) | function | src/app/api/admin/users/[id]/credits/route.ts:7 |
| [`QueryProvider`](src/components/providers/query-provider.tsx#L7) | function | src/components/providers/query-provider.tsx:7 |
| [`queryVectors`](src/lib/knowledge/vector-client.ts#L84) | function | src/lib/knowledge/vector-client.ts:84 |
| [`RateLimitError`](src/lib/rate-limit.ts#L24) | class | src/lib/rate-limit.ts:24 |
| [`RateLimitInfo`](src/lib/later/types.ts#L212) | interface | src/lib/later/types.ts:212 |
| [`RateLimitResult`](src/lib/rate-limit.ts#L12) | interface | src/lib/rate-limit.ts:12 |
| [`RectInfo`](src/lib/konva-smart-guides.ts#L46) | interface | src/lib/konva-smart-guides.ts:46 |
| [`RecurringConfigValue`](src/components/posts/post-composer.tsx#L18) | type | src/components/posts/post-composer.tsx:18 |
| [`refillOrganizationCredits`](src/lib/organizations/service.ts#L359) | function | src/lib/organizations/service.ts:359 |
| [`refreshUserCredits`](src/lib/credits/validate-credits.ts#L78) | function | src/lib/credits/validate-credits.ts:78 |
| [`refundCreditsForFeature`](src/lib/credits/deduct.ts#L301) | function | src/lib/credits/deduct.ts:301 |
| [`RegisteredFont`](src/lib/rendering/canvas-renderer.ts#L5) | interface | src/lib/rendering/canvas-renderer.ts:5 |
| [`reindexEntry`](src/lib/knowledge/indexer.ts#L142) | function | src/lib/knowledge/indexer.ts:142 |
| [`removeOrganization`](src/lib/organizations/service.ts#L225) | function | src/lib/organizations/service.ts:225 |
| [`renderDesignToPNG`](src/lib/rendering/canvas-renderer.ts#L24) | function | src/lib/rendering/canvas-renderer.ts:24 |
| [`RenderEngine`](src/lib/render-engine.ts#L28) | class | src/lib/render-engine.ts:28 |
| [`renderGeneration`](src/lib/generation-utils.ts#L31) | function | src/lib/generation-utils.ts:31 |
| [`RenderGenerationResult`](src/lib/generation-utils.ts#L26) | interface | src/lib/generation-utils.ts:26 |
| [`RenderOptions`](src/lib/render-engine.ts#L20) | interface | src/lib/render-engine.ts:20 |
| [`reorderMenuItems`](src/lib/cms/mutations.ts#L399) | function | src/lib/cms/mutations.ts:399 |
| [`reorderSections`](src/lib/cms/mutations.ts#L237) | function | src/lib/cms/mutations.ts:237 |
| [`requireAdminUser`](src/lib/permissions.ts#L17) | function | src/lib/permissions.ts:17 |
| [`requireOrganizationMembership`](src/lib/organizations/permissions.ts#L39) | function | src/lib/organizations/permissions.ts:39 |
| [`requireProjectAccess`](src/lib/permissions.ts#L25) | function | src/lib/permissions.ts:25 |
| [`resetLaterClient`](src/lib/later/client.ts#L973) | function | src/lib/later/client.ts:973 |
| [`resetRateLimitBucket`](src/lib/rate-limit.ts#L82) | function | src/lib/rate-limit.ts:82 |
| [`resizeImage`](src/lib/images/client-resize.ts#L24) | function | src/lib/images/client-resize.ts:24 |
| [`ResizeOptions`](src/lib/images/client-resize.ts#L6) | interface | src/lib/images/client-resize.ts:6 |
| [`resizeToInstagramFeed`](src/lib/images/client-resize.ts#L169) | function | src/lib/images/client-resize.ts:169 |
| [`resolveAnalyticsPeriod`](src/lib/organizations/analytics.ts#L53) | function | src/lib/organizations/analytics.ts:53 |
| [`resolvePricing`](src/components/plans/pricing-utils.ts#L44) | function | src/components/plans/pricing-utils.ts:44 |
| [`ResponsivePreview`](src/components/admin/cms/responsive-preview.tsx#L20) | function | src/components/admin/cms/responsive-preview.tsx:20 |
| [`RichTextEditorConfig`](src/types/rich-text.ts#L34) | interface | src/types/rich-text.ts:34 |
| [`RichTextRenderOptions`](src/types/rich-text.ts#L67) | interface | src/types/rich-text.ts:67 |
| [`RichTextStyle`](src/types/template.ts#L138) | interface | src/types/template.ts:138 |
| [`RootLayout`](src/app/layout.tsx#L112) | function | src/app/layout.tsx:112 |
| [`Rounding`](prisma/generated/client/runtime/index-browser.d.ts#L26) | type | prisma/generated/client/runtime/index-browser.d.ts:26 |
| [`SalesFooter`](src/components/sales/SalesFooter.tsx#L7) | function | src/components/sales/SalesFooter.tsx:7 |
| [`SalesPage`](src/components/sales/SalesPage.tsx#L16) | function | src/components/sales/SalesPage.tsx:16 |
| [`sanitizeError`](src/lib/later/errors.ts#L260) | function | src/lib/later/errors.ts:260 |
| [`searchKnowledgeBase`](src/lib/knowledge/search.ts#L35) | function | src/lib/knowledge/search.ts:35 |
| [`searchMedia`](src/lib/cms/queries.ts#L384) | function | src/lib/cms/queries.ts:384 |
| [`SearchResult`](src/lib/knowledge/search.ts#L12) | interface | src/lib/knowledge/search.ts:12 |
| [`SectionPreview`](src/components/admin/cms/section-preview.tsx#L10) | function | src/components/admin/cms/section-preview.tsx:10 |
| [`SelectionChangeEvent`](src/types/rich-text.ts#L134) | interface | src/types/rich-text.ts:134 |
| [`sendToBack`](src/lib/konva-alignment.ts#L431) | function | src/lib/konva-alignment.ts:431 |
| [`setCachedResults`](src/lib/knowledge/cache.ts#L233) | function | src/lib/knowledge/cache.ts:233 |
| [`ShadowEffect`](src/lib/konva/effects/ShadowEffect.ts#L9) | class | src/lib/konva/effects/ShadowEffect.ts:9 |
| [`ShadowEffectConfig`](src/lib/konva/effects/types.ts#L16) | interface | src/lib/konva/effects/types.ts:16 |
| [`ShadowStyle`](src/types/template.ts#L121) | interface | src/types/template.ts:121 |
| [`ShapeDefinition`](src/lib/assets/shapes-library.ts#L1) | interface | src/lib/assets/shapes-library.ts:1 |
| [`ShapesPanel`](src/components/templates/sidebar/shapes-panel.tsx#L8) | function | src/components/templates/sidebar/shapes-panel.tsx:8 |
| [`SimilarEntryMatch`](src/lib/knowledge/find-similar-entries.ts#L5) | interface | src/lib/knowledge/find-similar-entries.ts:5 |
| [`SimpleTextPanel`](src/components/templates/panels/simple-text-panel.tsx#L9) | function | src/components/templates/panels/simple-text-panel.tsx:9 |
| [`SiteSettings`](src/lib/site-settings.ts#L3) | type | src/lib/site-settings.ts:3 |
| [`SiteSettings`](src/hooks/admin/use-admin-site-settings.ts#L4) | interface | src/hooks/admin/use-admin-site-settings.ts:4 |
| [`SiteSettingsPage`](src/app/admin/settings/site/page.tsx#L16) | function | src/app/admin/settings/site/page.tsx:16 |
| [`SnapConfig`](src/lib/konva-smart-guides.ts#L23) | interface | src/lib/konva-smart-guides.ts:23 |
| [`SnapEdge`](src/lib/konva-smart-guides.ts#L62) | interface | src/lib/konva-smart-guides.ts:62 |
| [`SnapResult`](src/lib/konva-smart-guides.ts#L71) | interface | src/lib/konva-smart-guides.ts:71 |
| [`SocialPostWithProject`](src/lib/posts/verification/types.ts#L24) | interface | src/lib/posts/verification/types.ts:24 |
| [`sortPostsByDate`](src/components/agenda/calendar/calendar-utils.ts#L55) | function | src/components/agenda/calendar/calendar-utils.ts:55 |
| [`startStemSeparation`](src/lib/mvsep/mvsep-client.ts#L39) | function | src/lib/mvsep/mvsep-client.ts:39 |
| [`StartYoutubeDownloadInput`](src/hooks/use-youtube-download.ts#L4) | interface | src/hooks/use-youtube-download.ts:4 |
| [`Step`](src/components/ai-creative-generator/stepper.tsx#L6) | interface | src/components/ai-creative-generator/stepper.tsx:6 |
| [`StorageItem`](src/hooks/use-storage.ts#L6) | interface | src/hooks/use-storage.ts:6 |
| [`StorageParams`](src/hooks/use-storage.ts#L17) | interface | src/hooks/use-storage.ts:17 |
| [`StorageResponse`](src/hooks/use-storage.ts#L25) | interface | src/hooks/use-storage.ts:25 |
| [`StoryVerifier`](src/lib/posts/verification/story-verifier.ts#L49) | class | src/lib/posts/verification/story-verifier.ts:49 |
| [`StrokeEffect`](src/lib/konva/effects/StrokeEffect.ts#L9) | class | src/lib/konva/effects/StrokeEffect.ts:9 |
| [`StrokeEffectConfig`](src/lib/konva/effects/types.ts#L10) | interface | src/lib/konva/effects/types.ts:10 |
| [`StyleMergeOptions`](src/types/rich-text.ts#L120) | interface | src/types/rich-text.ts:120 |
| [`StylePreset`](src/types/rich-text.ts#L145) | interface | src/types/rich-text.ts:145 |
| [`SubscribePage`](src/app/subscribe/page.tsx#L12) | function | src/app/subscribe/page.tsx:12 |
| [`SubscriptionPlan`](src/lib/clerk/subscription-utils.ts#L4) | interface | src/lib/clerk/subscription-utils.ts:4 |
| [`SubscriptionStatus`](src/hooks/use-subscription.ts#L6) | interface | src/hooks/use-subscription.ts:6 |
| [`syncCreditBalance`](src/lib/credits/track-usage.ts#L128) | function | src/lib/credits/track-usage.ts:128 |
| [`syncOrganizationFromClerk`](src/lib/organizations/service.ts#L97) | function | src/lib/organizations/service.ts:97 |
| [`SyncPreview`](src/components/admin/plans/types.ts#L38) | type | src/components/admin/plans/types.ts:38 |
| [`Template`](src/lib/generation-utils.ts#L7) | interface | src/lib/generation-utils.ts:7 |
| [`TemplateDetail`](src/hooks/use-templates.ts#L22) | interface | src/hooks/use-templates.ts:22 |
| [`TemplateDto`](src/hooks/use-template.ts#L7) | interface | src/hooks/use-template.ts:7 |
| [`TemplateEditorClient`](src/components/templates/template-editor-client.tsx#L17) | function | src/components/templates/template-editor-client.tsx:17 |
| [`TemplateEditorPage`](src/app/(protected)/templates/[id]/editor/page.tsx#L12) | function | src/app/(protected)/templates/[id]/editor/page.tsx:12 |
| [`TemplateKind`](src/lib/studio/defaults.ts#L3) | type | src/lib/studio/defaults.ts:3 |
| [`TemplateListItem`](src/hooks/use-templates.ts#L7) | interface | src/hooks/use-templates.ts:7 |
| [`TemplateWithProject`](src/lib/templates/access.ts#L3) | type | src/lib/templates/access.ts:3 |
| [`TenantKey`](src/lib/knowledge/vector-client.ts#L13) | type | src/lib/knowledge/vector-client.ts:13 |
| [`TermsOfServicePage`](src/app/(public)/terms-of-service/page.tsx#L8) | function | src/app/(public)/terms-of-service/page.tsx:8 |
| [`TextareaProps`](src/components/ui/textarea.tsx#L5) | type | src/components/ui/textarea.tsx:5 |
| [`TextboxConfig`](src/types/template.ts#L163) | interface | src/types/template.ts:163 |
| [`TextBreakMode`](src/types/template.ts#L180) | type | src/types/template.ts:180 |
| [`TextEffectsConfig`](src/lib/konva/effects/types.ts#L36) | interface | src/lib/konva/effects/types.ts:36 |
| [`TextFieldName`](src/lib/ai-creative-generator/layout-types.ts#L8) | type | src/lib/ai-creative-generator/layout-types.ts:8 |
| [`TextFieldsForm`](src/components/ai-creative-generator/text-fields-form.tsx#L28) | function | src/components/ai-creative-generator/text-fields-form.tsx:28 |
| [`TextLine`](src/types/rich-text.ts#L89) | interface | src/types/rich-text.ts:89 |
| [`TextMode`](src/types/template.ts#L182) | type | src/types/template.ts:182 |
| [`TextPreset`](src/lib/text-presets.ts#L31) | interface | src/lib/text-presets.ts:31 |
| [`TextPresetElement`](src/lib/text-presets.ts#L8) | interface | src/lib/text-presets.ts:8 |
| [`TextsData`](src/lib/ai-creative-generator/layout-types.ts#L45) | interface | src/lib/ai-creative-generator/layout-types.ts:45 |
| [`TextStyleSegment`](src/types/rich-text.ts#L16) | interface | src/types/rich-text.ts:16 |
| [`TextToolsPanel`](src/components/templates/panels/text-panel.tsx#L10) | function | src/components/templates/panels/text-panel.tsx:10 |
| [`ThemeProvider`](src/components/theme-provider.tsx#L27) | function | src/components/theme-provider.tsx:27 |
| [`ThemeToggle`](src/components/theme-toggle.tsx#L14) | function | src/components/theme-toggle.tsx:14 |
| [`throttle`](src/lib/performance-utils.ts#L18) | function | src/lib/performance-utils.ts:18 |
| [`throttle`](src/lib/konva-smart-guides.ts#L394) | function | src/lib/konva-smart-guides.ts:394 |
| [`toggleSectionVisibility`](src/lib/cms/mutations.ts#L253) | function | src/lib/cms/mutations.ts:253 |
| [`ToggleTemplateButton`](src/components/template/toggle-template-button.tsx#L15) | function | src/components/template/toggle-template-button.tsx:15 |
| [`toPrismaOperationType`](src/lib/credits/feature-config.ts#L24) | function | src/lib/credits/feature-config.ts:24 |
| [`trackUsage`](src/lib/credits/track-usage.ts#L17) | function | src/lib/credits/track-usage.ts:17 |
| [`TrainingPreview`](src/lib/knowledge/training-pipeline.ts#L9) | interface | src/lib/knowledge/training-pipeline.ts:9 |
| [`truncateToTokenLimit`](src/lib/ai/token-limits.ts#L69) | function | src/lib/ai/token-limits.ts:69 |
| [`unpublishPage`](src/lib/cms/mutations.ts#L99) | function | src/lib/cms/mutations.ts:99 |
| [`UpdateClientInviteInput`](src/lib/validations/client-invite.ts#L88) | type | src/lib/validations/client-invite.ts:88 |
| [`updateClientInviteRecord`](src/lib/services/client-invite-service.ts#L183) | function | src/lib/services/client-invite-service.ts:183 |
| [`updateClientProject`](src/lib/services/client-project-service.ts#L62) | function | src/lib/services/client-project-service.ts:62 |
| [`UpdateClientProjectInput`](src/lib/validations/client-project.ts#L62) | type | src/lib/validations/client-project.ts:62 |
| [`updateComponent`](src/lib/cms/mutations.ts#L452) | function | src/lib/cms/mutations.ts:452 |
| [`UpdateComponentInput`](src/lib/cms/mutations.ts#L427) | type | src/lib/cms/mutations.ts:427 |
| [`UpdateComponentInput`](src/hooks/admin/use-admin-components.ts#L32) | type | src/hooks/admin/use-admin-components.ts:32 |
| [`updateEntry`](src/lib/knowledge/indexer.ts#L219) | function | src/lib/knowledge/indexer.ts:219 |
| [`UpdateEntryInput`](src/hooks/admin/use-admin-knowledge.ts#L76) | interface | src/hooks/admin/use-admin-knowledge.ts:76 |
| [`UpdateFeatureGridItemData`](src/hooks/admin/use-admin-feature-grid.ts#L29) | type | src/hooks/admin/use-admin-feature-grid.ts:29 |
| [`UpdateLaterPostPayload`](src/lib/later/types.ts#L132) | interface | src/lib/later/types.ts:132 |
| [`updateMedia`](src/lib/cms/mutations.ts#L509) | function | src/lib/cms/mutations.ts:509 |
| [`UpdateMediaInput`](src/lib/cms/mutations.ts#L490) | type | src/lib/cms/mutations.ts:490 |
| [`UpdateMediaInput`](src/hooks/admin/use-admin-media.ts#L26) | type | src/hooks/admin/use-admin-media.ts:26 |
| [`updateMenu`](src/lib/cms/mutations.ts#L343) | function | src/lib/cms/mutations.ts:343 |
| [`UpdateMenuInput`](src/lib/cms/mutations.ts#L300) | type | src/lib/cms/mutations.ts:300 |
| [`UpdateMenuInput`](src/hooks/admin/use-admin-menus.ts#L41) | type | src/hooks/admin/use-admin-menus.ts:41 |
| [`updateMenuItem`](src/lib/cms/mutations.ts#L377) | function | src/lib/cms/mutations.ts:377 |
| [`UpdateMenuItemInput`](src/lib/cms/mutations.ts#L318) | type | src/lib/cms/mutations.ts:318 |
| [`UpdateMenuItemInput`](src/hooks/admin/use-admin-menus.ts#L59) | type | src/hooks/admin/use-admin-menus.ts:59 |
| [`UpdateOrgEntryInput`](src/hooks/use-org-knowledge.ts#L38) | interface | src/hooks/use-org-knowledge.ts:38 |
| [`updatePage`](src/lib/cms/mutations.ts#L57) | function | src/lib/cms/mutations.ts:57 |
| [`UpdatePageInput`](src/lib/cms/mutations.ts#L24) | type | src/lib/cms/mutations.ts:24 |
| [`UpdatePageInput`](src/hooks/admin/use-admin-cms.ts#L63) | type | src/hooks/admin/use-admin-cms.ts:63 |
| [`UpdateProjectSettingsInput`](src/hooks/use-project.ts#L55) | type | src/hooks/use-project.ts:55 |
| [`UpdatePromptData`](src/types/prompt.ts#L22) | interface | src/types/prompt.ts:22 |
| [`updateSection`](src/lib/cms/mutations.ts#L212) | function | src/lib/cms/mutations.ts:212 |
| [`UpdateSectionInput`](src/lib/cms/mutations.ts#L185) | type | src/lib/cms/mutations.ts:185 |
| [`UpdateSectionInput`](src/hooks/admin/use-admin-cms.ts#L85) | type | src/hooks/admin/use-admin-cms.ts:85 |
| [`UpdateSiteSettingsData`](src/hooks/admin/use-admin-site-settings.ts#L32) | interface | src/hooks/admin/use-admin-site-settings.ts:32 |
| [`UploadFileInput`](src/hooks/admin/use-admin-knowledge.ts#L65) | interface | src/hooks/admin/use-admin-knowledge.ts:65 |
| [`UploadMediaInput`](src/hooks/admin/use-admin-media.ts#L33) | type | src/hooks/admin/use-admin-media.ts:33 |
| [`UploadOrgFileInput`](src/hooks/use-org-knowledge.ts#L27) | interface | src/hooks/use-org-knowledge.ts:27 |
| [`UploadProgress`](src/hooks/use-blob-upload.ts#L6) | interface | src/hooks/use-blob-upload.ts:6 |
| [`upsertAdminSettings`](src/lib/credits/settings.ts#L60) | function | src/lib/credits/settings.ts:60 |
| [`upsertOrganizationMemberAnalytics`](src/lib/organizations/analytics.ts#L187) | function | src/lib/organizations/analytics.ts:187 |
| [`upsertVectors`](src/lib/knowledge/vector-client.ts#L55) | function | src/lib/knowledge/vector-client.ts:55 |
| [`UsageData`](src/hooks/use-usage.ts#L6) | interface | src/hooks/use-usage.ts:6 |
| [`UsageHistoryParams`](src/hooks/use-usage-history.ts#L18) | interface | src/hooks/use-usage-history.ts:18 |
| [`UsageHistoryResponse`](src/hooks/use-usage-history.ts#L26) | interface | src/hooks/use-usage-history.ts:26 |
| [`UsageParams`](src/hooks/use-usage.ts#L23) | interface | src/hooks/use-usage.ts:23 |
| [`UsagePoint`](src/components/organization/credit-usage-card.tsx#L9) | type | src/components/organization/credit-usage-card.tsx:9 |
| [`UsageRecord`](src/hooks/use-usage-history.ts#L6) | interface | src/hooks/use-usage-history.ts:6 |
| [`useActivateUser`](src/hooks/admin/use-admin-users.ts#L104) | function | src/hooks/admin/use-admin-users.ts:104 |
| [`useAdjustCredits`](src/hooks/admin/use-admin-credits.ts#L69) | function | src/hooks/admin/use-admin-credits.ts:69 |
| [`useAdjustOrganizationCredits`](src/hooks/use-organizations.ts#L365) | function | src/hooks/use-organizations.ts:365 |
| [`useAdminComponent`](src/hooks/admin/use-admin-components.ts#L63) | function | src/hooks/admin/use-admin-components.ts:63 |
| [`useAdminComponents`](src/hooks/admin/use-admin-components.ts#L49) | function | src/hooks/admin/use-admin-components.ts:49 |
| [`useAdminCredits`](src/hooks/admin/use-admin-credits.ts#L39) | function | src/hooks/admin/use-admin-credits.ts:39 |
| [`useAdminInvitations`](src/hooks/admin/use-admin-invitations.ts#L20) | function | src/hooks/admin/use-admin-invitations.ts:20 |
| [`useAdminMedia`](src/hooks/admin/use-admin-media.ts#L47) | function | src/hooks/admin/use-admin-media.ts:47 |
| [`useAdminMediaFile`](src/hooks/admin/use-admin-media.ts#L61) | function | src/hooks/admin/use-admin-media.ts:61 |
| [`useAdminMenu`](src/hooks/admin/use-admin-menus.ts#L87) | function | src/hooks/admin/use-admin-menus.ts:87 |
| [`useAdminMenuItems`](src/hooks/admin/use-admin-menus.ts#L150) | function | src/hooks/admin/use-admin-menus.ts:150 |
| [`useAdminMenus`](src/hooks/admin/use-admin-menus.ts#L76) | function | src/hooks/admin/use-admin-menus.ts:76 |
| [`useAdminPage`](src/hooks/admin/use-admin-cms.ts#L115) | function | src/hooks/admin/use-admin-cms.ts:115 |
| [`useAdminPages`](src/hooks/admin/use-admin-cms.ts#L101) | function | src/hooks/admin/use-admin-cms.ts:101 |
| [`useAdminPlans`](src/hooks/use-admin-plans.ts#L42) | function | src/hooks/use-admin-plans.ts:42 |
| [`useAdminSection`](src/hooks/admin/use-admin-cms.ts#L223) | function | src/hooks/admin/use-admin-cms.ts:223 |
| [`useAdminSections`](src/hooks/admin/use-admin-cms.ts#L211) | function | src/hooks/admin/use-admin-cms.ts:211 |
| [`useAdminSettings`](src/hooks/use-admin-settings.ts#L11) | function | src/hooks/use-admin-settings.ts:11 |
| [`useAdminUsers`](src/hooks/admin/use-admin-users.ts#L39) | function | src/hooks/admin/use-admin-users.ts:39 |
| [`useAgendaPosts`](src/hooks/use-agenda-posts.ts#L12) | function | src/hooks/use-agenda-posts.ts:12 |
| [`useAIProviders`](src/hooks/use-ai-providers.ts#L17) | function | src/hooks/use-ai-providers.ts:17 |
| [`useAtualizarMusica`](src/hooks/use-music-library.ts#L195) | function | src/hooks/use-music-library.ts:195 |
| [`useAudioPlayer`](src/contexts/audio-player-context.tsx#L14) | function | src/contexts/audio-player-context.tsx:14 |
| [`useAutoSaveLayer`](src/hooks/use-auto-save-layer.ts#L4) | function | src/hooks/use-auto-save-layer.ts:4 |
| [`useBaixarDoYoutube`](src/hooks/use-youtube-download.ts#L54) | function | src/hooks/use-youtube-download.ts:54 |
| [`useBibliotecaMusicas`](src/hooks/use-music-library.ts#L66) | function | src/hooks/use-music-library.ts:66 |
| [`useBlobUpload`](src/hooks/use-blob-upload.ts#L38) | function | src/hooks/use-blob-upload.ts:38 |
| [`UseBlobUploadOptions`](src/hooks/use-blob-upload.ts#L12) | interface | src/hooks/use-blob-upload.ts:12 |
| [`UseBlobUploadResult`](src/hooks/use-blob-upload.ts#L18) | interface | src/hooks/use-blob-upload.ts:18 |
| [`useBulkDeleteMedia`](src/hooks/admin/use-admin-media.ts#L137) | function | src/hooks/admin/use-admin-media.ts:137 |
| [`useBuscaMusicas`](src/hooks/use-music-library.ts#L91) | function | src/hooks/use-music-library.ts:91 |
| [`useCalendarAnalytics`](src/hooks/use-calendar-analytics.ts#L36) | function | src/hooks/use-calendar-analytics.ts:36 |
| [`useCancelarYoutubeJob`](src/hooks/use-youtube-download.ts#L90) | function | src/hooks/use-youtube-download.ts:90 |
| [`useCancelClientInvite`](src/hooks/admin/use-client-invites.ts#L177) | function | src/hooks/admin/use-client-invites.ts:177 |
| [`useClerkPlans`](src/hooks/use-admin-plans.ts#L51) | function | src/hooks/use-admin-plans.ts:51 |
| [`useClientInvite`](src/hooks/admin/use-client-invites.ts#L76) | function | src/hooks/admin/use-client-invites.ts:76 |
| [`useClientInvites`](src/hooks/admin/use-client-invites.ts#L67) | function | src/hooks/admin/use-client-invites.ts:67 |
| [`useClientInviteStats`](src/hooks/admin/use-client-invites.ts#L85) | function | src/hooks/admin/use-client-invites.ts:85 |
| [`useClientProject`](src/hooks/admin/use-client-projects.ts#L66) | function | src/hooks/admin/use-client-projects.ts:66 |
| [`useClientProjects`](src/hooks/admin/use-client-projects.ts#L55) | function | src/hooks/admin/use-client-projects.ts:55 |
| [`useConversation`](src/hooks/use-conversations.ts#L67) | function | src/hooks/use-conversations.ts:67 |
| [`useConversations`](src/hooks/use-conversations.ts#L52) | function | src/hooks/use-conversations.ts:52 |
| [`useCreateClientInvite`](src/hooks/admin/use-client-invites.ts#L103) | function | src/hooks/admin/use-client-invites.ts:103 |
| [`useCreateComponent`](src/hooks/admin/use-admin-components.ts#L75) | function | src/hooks/admin/use-admin-components.ts:75 |
| [`useCreateConversation`](src/hooks/use-conversations.ts#L82) | function | src/hooks/use-conversations.ts:82 |
| [`useCreateFeatureGridItem`](src/hooks/admin/use-admin-feature-grid.ts#L52) | function | src/hooks/admin/use-admin-feature-grid.ts:52 |
| [`useCreateFolder`](src/hooks/use-drive.ts#L87) | function | src/hooks/use-drive.ts:87 |
| [`useCreateFromTemplate`](src/hooks/use-create-from-template.ts#L19) | function | src/hooks/use-create-from-template.ts:19 |
| [`useCreateKnowledgeEntry`](src/hooks/admin/use-admin-knowledge.ts#L140) | function | src/hooks/admin/use-admin-knowledge.ts:140 |
| [`useCreateMenu`](src/hooks/admin/use-admin-menus.ts#L99) | function | src/hooks/admin/use-admin-menus.ts:99 |
| [`useCreateMenuItem`](src/hooks/admin/use-admin-menus.ts#L162) | function | src/hooks/admin/use-admin-menus.ts:162 |
| [`useCreateOrgKnowledgeEntry`](src/hooks/use-org-knowledge.ts#L80) | function | src/hooks/use-org-knowledge.ts:80 |
| [`useCreatePage`](src/hooks/use-pages.ts#L65) | function | src/hooks/use-pages.ts:65 |
| [`useCreatePage`](src/hooks/admin/use-admin-cms.ts#L127) | function | src/hooks/admin/use-admin-cms.ts:127 |
| [`useCreatePlan`](src/hooks/use-admin-plans.ts#L61) | function | src/hooks/use-admin-plans.ts:61 |
| [`useCreatePrompt`](src/hooks/use-prompts.ts#L46) | function | src/hooks/use-prompts.ts:46 |
| [`useCreateSection`](src/hooks/admin/use-admin-cms.ts#L235) | function | src/hooks/admin/use-admin-cms.ts:235 |
| [`useCreateTemplate`](src/hooks/use-templates.ts#L130) | function | src/hooks/use-templates.ts:130 |
| [`useCredits`](src/hooks/use-credits.ts#L39) | function | src/hooks/use-credits.ts:39 |
| [`useDashboard`](src/hooks/use-studio.ts#L22) | function | src/hooks/use-studio.ts:22 |
| [`useDeactivateUser`](src/hooks/admin/use-admin-users.ts#L84) | function | src/hooks/admin/use-admin-users.ts:84 |
| [`useDebouncedValue`](src/hooks/use-debounced-value.ts#L5) | function | src/hooks/use-debounced-value.ts:5 |
| [`useDeletarMusica`](src/hooks/use-music-library.ts#L211) | function | src/hooks/use-music-library.ts:211 |
| [`useDeleteComponent`](src/hooks/admin/use-admin-components.ts#L106) | function | src/hooks/admin/use-admin-components.ts:106 |
| [`useDeleteConversation`](src/hooks/use-conversations.ts#L102) | function | src/hooks/use-conversations.ts:102 |
| [`useDeleteCreative`](src/hooks/use-template-creatives.ts#L43) | function | src/hooks/use-template-creatives.ts:43 |
| [`useDeleteFeatureGridItem`](src/hooks/admin/use-admin-feature-grid.ts#L79) | function | src/hooks/admin/use-admin-feature-grid.ts:79 |
| [`useDeleteFiles`](src/hooks/use-drive.ts#L118) | function | src/hooks/use-drive.ts:118 |
| [`useDeleteKnowledgeEntry`](src/hooks/admin/use-admin-knowledge.ts#L186) | function | src/hooks/admin/use-admin-knowledge.ts:186 |
| [`useDeleteMedia`](src/hooks/admin/use-admin-media.ts#L123) | function | src/hooks/admin/use-admin-media.ts:123 |
| [`useDeleteMenu`](src/hooks/admin/use-admin-menus.ts#L132) | function | src/hooks/admin/use-admin-menus.ts:132 |
| [`useDeleteMenuItem`](src/hooks/admin/use-admin-menus.ts#L202) | function | src/hooks/admin/use-admin-menus.ts:202 |
| [`useDeleteOrgKnowledgeEntry`](src/hooks/use-org-knowledge.ts#L138) | function | src/hooks/use-org-knowledge.ts:138 |
| [`useDeletePage`](src/hooks/use-pages.ts#L115) | function | src/hooks/use-pages.ts:115 |
| [`useDeletePage`](src/hooks/admin/use-admin-cms.ts#L160) | function | src/hooks/admin/use-admin-cms.ts:160 |
| [`useDeletePlan`](src/hooks/use-admin-plans.ts#L135) | function | src/hooks/use-admin-plans.ts:135 |
| [`useDeletePrompt`](src/hooks/use-prompts.ts#L77) | function | src/hooks/use-prompts.ts:77 |
| [`useDeleteSection`](src/hooks/admin/use-admin-cms.ts#L278) | function | src/hooks/admin/use-admin-cms.ts:278 |
| [`useDeleteStorageItem`](src/hooks/use-storage.ts#L47) | function | src/hooks/use-storage.ts:47 |
| [`useDeviceDetection`](src/hooks/use-device-detection.ts#L91) | function | src/hooks/use-device-detection.ts:91 |
| [`useDownloadZip`](src/hooks/use-drive.ts#L191) | function | src/hooks/use-drive.ts:191 |
| [`useDriveFiles`](src/hooks/use-drive.ts#L13) | function | src/hooks/use-drive.ts:13 |
| [`useDriveProjects`](src/hooks/use-drive.ts#L60) | function | src/hooks/use-drive.ts:60 |
| [`useDuplicatePage`](src/hooks/use-pages.ts#L182) | function | src/hooks/use-pages.ts:182 |
| [`useDuplicatePage`](src/hooks/admin/use-admin-cms.ts#L192) | function | src/hooks/admin/use-admin-cms.ts:192 |
| [`useDuplicateSection`](src/hooks/admin/use-admin-cms.ts#L319) | function | src/hooks/admin/use-admin-cms.ts:319 |
| [`useEditUser`](src/hooks/admin/use-admin-users.ts#L124) | function | src/hooks/admin/use-admin-users.ts:124 |
| [`useEnviarMusica`](src/hooks/use-music-library.ts#L115) | function | src/hooks/use-music-library.ts:115 |
| [`useFeatureGridItem`](src/hooks/admin/use-admin-feature-grid.ts#L42) | function | src/hooks/admin/use-admin-feature-grid.ts:42 |
| [`useFeatureGridItems`](src/hooks/admin/use-admin-feature-grid.ts#L32) | function | src/hooks/admin/use-admin-feature-grid.ts:32 |
| [`useFolderBreadcrumbs`](src/hooks/use-drive.ts#L45) | function | src/hooks/use-drive.ts:45 |
| [`useGenerateCreative`](src/hooks/use-generate-creative.ts#L28) | function | src/hooks/use-generate-creative.ts:28 |
| [`useGenerateImage`](src/hooks/use-ai-image.ts#L20) | function | src/hooks/use-ai-image.ts:20 |
| [`useGenerateMultipleCreatives`](src/hooks/use-generate-multiple-creatives.ts#L22) | function | src/hooks/use-generate-multiple-creatives.ts:22 |
| [`useGenerateThumbnail`](src/hooks/use-templates.ts#L144) | function | src/hooks/use-templates.ts:144 |
| [`useGlobalComponents`](src/hooks/admin/use-admin-components.ts#L120) | function | src/hooks/admin/use-admin-components.ts:120 |
| [`useGoogleDriveItems`](src/hooks/use-google-drive.ts#L11) | function | src/hooks/use-google-drive.ts:11 |
| [`useHydrated`](src/hooks/use-hydrated.ts#L28) | function | src/hooks/use-hydrated.ts:28 |
| [`useInstagramDashboard`](src/hooks/use-instagram-analytics.ts#L42) | function | src/hooks/use-instagram-analytics.ts:42 |
| [`useInstagramSettings`](src/hooks/use-instagram-analytics.ts#L51) | function | src/hooks/use-instagram-analytics.ts:51 |
| [`useInstagramSummaries`](src/hooks/use-instagram-analytics.ts#L102) | function | src/hooks/use-instagram-analytics.ts:102 |
| [`useInviteUser`](src/hooks/admin/use-admin-invitations.ts#L29) | function | src/hooks/admin/use-admin-invitations.ts:29 |
| [`useIsCreativePage`](src/hooks/use-is-creative-page.ts#L10) | function | src/hooks/use-is-creative-page.ts:10 |
| [`useIsDesktop`](src/hooks/use-media-query.ts#L76) | function | src/hooks/use-media-query.ts:76 |
| [`useIsMobile`](src/hooks/use-media-query.ts#L56) | function | src/hooks/use-media-query.ts:56 |
| [`useIsMobile`](src/hooks/use-device-detection.ts#L167) | function | src/hooks/use-device-detection.ts:167 |
| [`useIsMobile`](src/hooks/use-mobile.tsx#L5) | function | src/hooks/use-mobile.tsx:5 |
| [`useIsTablet`](src/hooks/use-media-query.ts#L66) | function | src/hooks/use-media-query.ts:66 |
| [`useIsTablet`](src/hooks/use-device-detection.ts#L175) | function | src/hooks/use-device-detection.ts:175 |
| [`useKnowledgeEntries`](src/hooks/admin/use-admin-knowledge.ts#L97) | function | src/hooks/admin/use-admin-knowledge.ts:97 |
| [`useKnowledgeEntry`](src/hooks/admin/use-admin-knowledge.ts#L127) | function | src/hooks/admin/use-admin-knowledge.ts:127 |
| [`useLaterAccounts`](src/hooks/use-later-accounts.ts#L27) | function | src/hooks/use-later-accounts.ts:27 |
| [`useMediaByType`](src/hooks/admin/use-admin-media.ts#L164) | function | src/hooks/admin/use-admin-media.ts:164 |
| [`useMediaQuery`](src/hooks/use-media-query.ts#L18) | function | src/hooks/use-media-query.ts:18 |
| [`useMenuByLocation`](src/hooks/use-public-menu.ts#L27) | function | src/hooks/use-public-menu.ts:27 |
| [`useMoveFiles`](src/hooks/use-drive.ts#L103) | function | src/hooks/use-drive.ts:103 |
| [`useMusica`](src/hooks/use-music-library.ts#L78) | function | src/hooks/use-music-library.ts:78 |
| [`useMusicStemStatus`](src/hooks/use-music-stem.ts#L31) | function | src/hooks/use-music-stem.ts:31 |
| [`useNextScheduledPost`](src/hooks/use-next-scheduled-post.ts#L9) | function | src/hooks/use-next-scheduled-post.ts:9 |
| [`useOpenRouterModels`](src/hooks/use-openrouter-models.ts#L15) | function | src/hooks/use-openrouter-models.ts:15 |
| [`useOrganizationAnalytics`](src/hooks/use-organizations.ts#L117) | function | src/hooks/use-organizations.ts:117 |
| [`useOrganizationCreationLimits`](src/hooks/use-organizations.ts#L251) | function | src/hooks/use-organizations.ts:251 |
| [`useOrganizationCredits`](src/hooks/use-organizations.ts#L44) | function | src/hooks/use-organizations.ts:44 |
| [`useOrganizationCreditsUsage`](src/hooks/use-organizations.ts#L68) | function | src/hooks/use-organizations.ts:68 |
| [`useOrganizationMemberAnalytics`](src/hooks/use-organizations.ts#L168) | function | src/hooks/use-organizations.ts:168 |
| [`useOrganizationProjects`](src/hooks/use-organizations.ts#L273) | function | src/hooks/use-organizations.ts:273 |
| [`useOrganizationSettings`](src/hooks/use-organizations.ts#L330) | function | src/hooks/use-organizations.ts:330 |
| [`useOrganizationTimeline`](src/hooks/use-organizations.ts#L216) | function | src/hooks/use-organizations.ts:216 |
| [`useOrgKnowledgeEntries`](src/hooks/use-org-knowledge.ts#L50) | function | src/hooks/use-org-knowledge.ts:50 |
| [`useOrgKnowledgeEntry`](src/hooks/use-org-knowledge.ts#L110) | function | src/hooks/use-org-knowledge.ts:110 |
| [`usePage`](src/hooks/use-pages.ts#L54) | function | src/hooks/use-pages.ts:54 |
| [`usePageConfig`](src/hooks/use-page-config.ts#L26) | function | src/hooks/use-page-config.ts:26 |
| [`usePageMetadata`](src/contexts/page-metadata.tsx#L45) | function | src/contexts/page-metadata.tsx:45 |
| [`usePages`](src/hooks/use-pages.ts#L41) | function | src/hooks/use-pages.ts:41 |
| [`usePerformanceConfig`](src/hooks/use-device-detection.ts#L183) | function | src/hooks/use-device-detection.ts:183 |
| [`usePhotoSwipe`](src/hooks/use-photoswipe.ts#L35) | function | src/hooks/use-photoswipe.ts:35 |
| [`usePostActions`](src/hooks/use-post-actions.ts#L5) | function | src/hooks/use-post-actions.ts:5 |
| [`usePostAnalytics`](src/hooks/use-post-analytics.ts#L24) | function | src/hooks/use-post-analytics.ts:24 |
| [`usePostStatusPolling`](src/hooks/use-post-status-polling.ts#L40) | function | src/hooks/use-post-status-polling.ts:40 |
| [`useProject`](src/hooks/use-project.ts#L69) | function | src/hooks/use-project.ts:69 |
| [`useProjectAIImages`](src/hooks/use-project-ai-images.ts#L11) | function | src/hooks/use-project-ai-images.ts:11 |
| [`useProjectAnalytics`](src/hooks/use-project-analytics.ts#L57) | function | src/hooks/use-project-analytics.ts:57 |
| [`useProjectGoogleDriveImages`](src/hooks/use-project-google-drive-images.ts#L17) | function | src/hooks/use-project-google-drive-images.ts:17 |
| [`useProjects`](src/hooks/use-project.ts#L82) | function | src/hooks/use-project.ts:82 |
| [`usePrompt`](src/hooks/use-prompts.ts#L33) | function | src/hooks/use-prompts.ts:33 |
| [`usePrompts`](src/hooks/use-prompts.ts#L8) | function | src/hooks/use-prompts.ts:8 |
| [`usePublicPlans`](src/hooks/use-public-plans.ts#L24) | function | src/hooks/use-public-plans.ts:24 |
| [`User`](src/hooks/admin/use-admin-users.ts#L7) | interface | src/hooks/admin/use-admin-users.ts:7 |
| [`useRefreshPlanPricing`](src/hooks/use-admin-plans.ts#L147) | function | src/hooks/use-admin-plans.ts:147 |
| [`useRefreshPostAnalytics`](src/hooks/use-post-analytics.ts#L40) | function | src/hooks/use-post-analytics.ts:40 |
| [`useReindexKnowledgeEntry`](src/hooks/admin/use-admin-knowledge.ts#L201) | function | src/hooks/admin/use-admin-knowledge.ts:201 |
| [`useRemoveSharedProjectMutation`](src/hooks/use-organizations.ts#L301) | function | src/hooks/use-organizations.ts:301 |
| [`useReorderFeatureGridItems`](src/hooks/admin/use-admin-feature-grid.ts#L91) | function | src/hooks/admin/use-admin-feature-grid.ts:91 |
| [`useReorderMenuItems`](src/hooks/admin/use-admin-menus.ts#L221) | function | src/hooks/admin/use-admin-menus.ts:221 |
| [`useReorderPages`](src/hooks/use-pages.ts#L197) | function | src/hooks/use-pages.ts:197 |
| [`useReorderSections`](src/hooks/admin/use-admin-cms.ts#L339) | function | src/hooks/admin/use-admin-cms.ts:339 |
| [`useReprocessStem`](src/hooks/use-music-stem.ts#L57) | function | src/hooks/use-music-stem.ts:57 |
| [`useResendClientInvite`](src/hooks/admin/use-client-invites.ts#L152) | function | src/hooks/admin/use-client-invites.ts:152 |
| [`useResendInvitation`](src/hooks/admin/use-admin-invitations.ts#L60) | function | src/hooks/admin/use-admin-invitations.ts:60 |
| [`useRetryVerification`](src/hooks/use-verification.ts#L59) | function | src/hooks/use-verification.ts:59 |
| [`useRevokeInvitation`](src/hooks/admin/use-admin-invitations.ts#L89) | function | src/hooks/admin/use-admin-invitations.ts:89 |
| [`UserIntent`](src/lib/knowledge/classify-intent.ts#L4) | type | src/lib/knowledge/classify-intent.ts:4 |
| [`UsersParams`](src/hooks/admin/use-admin-users.ts#L32) | interface | src/hooks/admin/use-admin-users.ts:32 |
| [`UsersResponse`](src/hooks/admin/use-admin-users.ts#L22) | interface | src/hooks/admin/use-admin-users.ts:22 |
| [`useSaveAsTemplateLibrary`](src/hooks/use-templates.ts#L154) | function | src/hooks/use-templates.ts:154 |
| [`useScheduledPostCounts`](src/hooks/use-scheduled-counts.ts#L9) | function | src/hooks/use-scheduled-counts.ts:9 |
| [`useSearchMedia`](src/hooks/admin/use-admin-media.ts#L152) | function | src/hooks/admin/use-admin-media.ts:152 |
| [`useSelectedFiles`](src/hooks/use-drive.ts#L165) | function | src/hooks/use-drive.ts:165 |
| [`useSetPageMetadata`](src/contexts/page-metadata.tsx#L54) | function | src/contexts/page-metadata.tsx:54 |
| [`useShareProjectMutation`](src/hooks/use-organizations.ts#L287) | function | src/hooks/use-organizations.ts:287 |
| [`useSiteConfig`](src/hooks/use-site-config.ts#L22) | function | src/hooks/use-site-config.ts:22 |
| [`useSiteSettings`](src/hooks/admin/use-site-settings.ts#L39) | function | src/hooks/admin/use-site-settings.ts:39 |
| [`useSiteSettings`](src/hooks/admin/use-admin-site-settings.ts#L58) | function | src/hooks/admin/use-admin-site-settings.ts:58 |
| [`useSmartGuides`](src/hooks/use-smart-guides.ts#L16) | function | src/hooks/use-smart-guides.ts:16 |
| [`useSocialPosts`](src/hooks/use-social-posts.ts#L41) | function | src/hooks/use-social-posts.ts:41 |
| [`useStorage`](src/hooks/use-storage.ts#L30) | function | src/hooks/use-storage.ts:30 |
| [`useStoriesAnalytics`](src/hooks/use-stories-analytics.ts#L58) | function | src/hooks/use-stories-analytics.ts:58 |
| [`useSubscription`](src/hooks/use-subscription.ts#L12) | function | src/hooks/use-subscription.ts:12 |
| [`useSyncFromClerk`](src/hooks/admin/use-admin-users.ts#L155) | function | src/hooks/admin/use-admin-users.ts:155 |
| [`useTemplate`](src/hooks/use-templates.ts#L117) | function | src/hooks/use-templates.ts:117 |
| [`useTemplate`](src/hooks/use-template.ts#L21) | function | src/hooks/use-template.ts:21 |
| [`useTemplateCreatives`](src/hooks/use-template-creatives.ts#L31) | function | src/hooks/use-template-creatives.ts:31 |
| [`useTemplatePages`](src/hooks/use-template-pages.ts#L24) | function | src/hooks/use-template-pages.ts:24 |
| [`useTemplates`](src/hooks/use-templates.ts#L85) | function | src/hooks/use-templates.ts:85 |
| [`useTextPresets`](src/hooks/use-text-presets.ts#L31) | function | src/hooks/use-text-presets.ts:31 |
| [`useTogglePagePublish`](src/hooks/admin/use-admin-cms.ts#L174) | function | src/hooks/admin/use-admin-cms.ts:174 |
| [`useToggleSectionVisibility`](src/hooks/admin/use-admin-cms.ts#L297) | function | src/hooks/admin/use-admin-cms.ts:297 |
| [`useToggleTemplate`](src/hooks/use-toggle-template.ts#L28) | function | src/hooks/use-toggle-template.ts:28 |
| [`useUpdateAdminSettings`](src/hooks/use-admin-settings.ts#L20) | function | src/hooks/use-admin-settings.ts:20 |
| [`useUpdateClientInvite`](src/hooks/admin/use-client-invites.ts#L127) | function | src/hooks/admin/use-client-invites.ts:127 |
| [`useUpdateClientProject`](src/hooks/admin/use-client-projects.ts#L75) | function | src/hooks/admin/use-client-projects.ts:75 |
| [`useUpdateComponent`](src/hooks/admin/use-admin-components.ts#L90) | function | src/hooks/admin/use-admin-components.ts:90 |
| [`useUpdateConversation`](src/hooks/use-conversations.ts#L124) | function | src/hooks/use-conversations.ts:124 |
| [`useUpdateFeatureGridItem`](src/hooks/admin/use-admin-feature-grid.ts#L65) | function | src/hooks/admin/use-admin-feature-grid.ts:65 |
| [`useUpdateKnowledgeEntry`](src/hooks/admin/use-admin-knowledge.ts#L170) | function | src/hooks/admin/use-admin-knowledge.ts:170 |
| [`useUpdateMedia`](src/hooks/admin/use-admin-media.ts#L105) | function | src/hooks/admin/use-admin-media.ts:105 |
| [`useUpdateMenu`](src/hooks/admin/use-admin-menus.ts#L114) | function | src/hooks/admin/use-admin-menus.ts:114 |
| [`useUpdateMenuItem`](src/hooks/admin/use-admin-menus.ts#L182) | function | src/hooks/admin/use-admin-menus.ts:182 |
| [`useUpdateOrganizationSettings`](src/hooks/use-organizations.ts#L345) | function | src/hooks/use-organizations.ts:345 |
| [`useUpdateOrgKnowledgeEntry`](src/hooks/use-org-knowledge.ts#L122) | function | src/hooks/use-org-knowledge.ts:122 |
| [`useUpdatePage`](src/hooks/use-pages.ts#L82) | function | src/hooks/use-pages.ts:82 |
| [`useUpdatePage`](src/hooks/admin/use-admin-cms.ts#L142) | function | src/hooks/admin/use-admin-cms.ts:142 |
| [`useUpdatePlan`](src/hooks/use-admin-plans.ts#L95) | function | src/hooks/use-admin-plans.ts:95 |
| [`useUpdateProjectSettings`](src/hooks/use-project.ts#L90) | function | src/hooks/use-project.ts:90 |
| [`useUpdatePrompt`](src/hooks/use-prompts.ts#L61) | function | src/hooks/use-prompts.ts:61 |
| [`useUpdateSection`](src/hooks/admin/use-admin-cms.ts#L255) | function | src/hooks/admin/use-admin-cms.ts:255 |
| [`useUpdateSiteSettings`](src/hooks/admin/use-site-settings.ts#L50) | function | src/hooks/admin/use-site-settings.ts:50 |
| [`useUpdateSiteSettings`](src/hooks/admin/use-admin-site-settings.ts#L70) | function | src/hooks/admin/use-admin-site-settings.ts:70 |
| [`useUpdateTemplate`](src/hooks/use-template.ts#L40) | function | src/hooks/use-template.ts:40 |
| [`useUpdateTemplateWithThumbnail`](src/hooks/use-template.ts#L54) | function | src/hooks/use-template.ts:54 |
| [`useUpdateUserCredits`](src/hooks/admin/use-admin-users.ts#L60) | function | src/hooks/admin/use-admin-users.ts:60 |
| [`useUploadFile`](src/hooks/admin/use-site-settings.ts#L14) | function | src/hooks/admin/use-site-settings.ts:14 |
| [`useUploadFile`](src/hooks/admin/use-admin-site-settings.ts#L85) | function | src/hooks/admin/use-admin-site-settings.ts:85 |
| [`useUploadFiles`](src/hooks/use-drive.ts#L138) | function | src/hooks/use-drive.ts:138 |
| [`useUploadKnowledgeFile`](src/hooks/admin/use-admin-knowledge.ts#L155) | function | src/hooks/admin/use-admin-knowledge.ts:155 |
| [`useUploadMedia`](src/hooks/admin/use-admin-media.ts#L73) | function | src/hooks/admin/use-admin-media.ts:73 |
| [`useUploadOrgKnowledgeFile`](src/hooks/use-org-knowledge.ts#L95) | function | src/hooks/use-org-knowledge.ts:95 |
| [`useUsage`](src/hooks/use-usage.ts#L30) | function | src/hooks/use-usage.ts:30 |
| [`useUsageHistory`](src/hooks/use-usage-history.ts#L33) | function | src/hooks/use-usage-history.ts:33 |
| [`useVerificationFailedPosts`](src/hooks/use-verification.ts#L25) | function | src/hooks/use-verification.ts:25 |
| [`useVerificationStats`](src/hooks/use-verification.ts#L42) | function | src/hooks/use-verification.ts:42 |
| [`useYoutubeDownloadStatus`](src/hooks/use-youtube-download.ts#L66) | function | src/hooks/use-youtube-download.ts:66 |
| [`useYoutubeJobs`](src/hooks/use-youtube-download.ts#L82) | function | src/hooks/use-youtube-download.ts:82 |
| [`validateApiKey`](src/lib/api-auth.ts#L5) | function | src/lib/api-auth.ts:5 |
| [`validateCredits`](src/lib/credits/validate-credits.ts#L35) | function | src/lib/credits/validate-credits.ts:35 |
| [`validateCreditsForFeature`](src/lib/credits/deduct.ts#L175) | function | src/lib/credits/deduct.ts:175 |
| [`validateInstagramFormat`](src/lib/templates/instagram-presets.ts#L55) | function | src/lib/templates/instagram-presets.ts:55 |
| [`validateMediaSize`](src/lib/later/media-upload.ts#L72) | function | src/lib/later/media-upload.ts:72 |
| [`validateMediaUrl`](src/lib/later/media-upload.ts#L59) | function | src/lib/later/media-upload.ts:59 |
| [`validateMemberAddition`](src/lib/organizations/service.ts#L320) | function | src/lib/organizations/service.ts:320 |
| [`validateTag`](src/lib/posts/verification/tag-generator.ts#L17) | function | src/lib/posts/verification/tag-generator.ts:17 |
| [`validateUploadResponse`](src/lib/later/media-upload.ts#L260) | function | src/lib/later/media-upload.ts:260 |
| [`validateUserAuthentication`](src/lib/auth-utils.ts#L28) | function | src/lib/auth-utils.ts:28 |
| [`Value`](prisma/generated/client/runtime/index-browser.d.ts#L28) | type | prisma/generated/client/runtime/index-browser.d.ts:28 |
| [`ValuePropSection`](src/components/sales/ValuePropSection.tsx#L6) | function | src/components/sales/ValuePropSection.tsx:6 |
| [`VectorMetadata`](src/lib/knowledge/vector-client.ts#L23) | interface | src/lib/knowledge/vector-client.ts:23 |
| [`VerificationErrorCode`](src/lib/posts/verification/types.ts#L3) | type | src/lib/posts/verification/types.ts:3 |
| [`VerificationSummary`](src/lib/posts/verification/types.ts#L16) | interface | src/lib/posts/verification/types.ts:16 |
| [`VignetteFilter`](src/lib/konva/filters/VignetteFilter.ts#L12) | function | src/lib/konva/filters/VignetteFilter.ts:12 |
| [`wasPhotoSwipeJustClosed`](src/hooks/use-photoswipe.ts#L16) | function | src/hooks/use-photoswipe.ts:16 |
| [`WeeklySummaryCard`](src/components/instagram/weekly-summary-card.tsx#L28) | function | src/components/instagram/weekly-summary-card.tsx:28 |
| [`WhitesBlacksFilter`](src/lib/konva/filters/WhitesBlacksFilter.ts#L12) | function | src/lib/konva/filters/WhitesBlacksFilter.ts:12 |
| [`withRetry`](src/lib/db-utils.ts#L5) | function | src/lib/db-utils.ts:5 |
| [`worker`](src/lib/zip-generator.ts#L27) | function | src/lib/zip-generator.ts:27 |
| [`YoutubeJobStatusResponse`](src/hooks/use-youtube-download.ts#L30) | interface | src/hooks/use-youtube-download.ts:30 |
| [`YoutubeJobSummary`](src/hooks/use-youtube-download.ts#L13) | interface | src/hooks/use-youtube-download.ts:13 |
| [`ZoomControlsProps`](src/components/templates/zoom-controls.tsx#L31) | interface | src/components/templates/zoom-controls.tsx:31 |

## Internal System Boundaries

Document seams between domains, bounded contexts, or service ownership. Note data ownership, synchronization strategies, and shared contract enforcement.

## External Service Dependencies

List SaaS platforms, third-party APIs, or infrastructure services the system relies on. Describe authentication methods, rate limits, and failure considerations for each dependency.

## Key Decisions & Trade-offs

Summarize architectural decisions, experiments, or ADR outcomes that shape the current design. Reference supporting documents and explain why selected approaches won over alternatives.

## Diagrams

Link architectural diagrams or add mermaid definitions here.

## Risks & Constraints

Document performance constraints, scaling considerations, or external system assumptions.

## Top Directories Snapshot
- `ADMIN_SETUP.md/` — approximately 1 files
- `agents/` — approximately 7 files
- `AGENTS.md/` — approximately 1 files
- `ANALISE_SISTEMA_POSTAGEM.md/` — approximately 1 files
- `BACKUP_COMPLETE.md/` — approximately 1 files
- `BACKUP_SECURITY.md/` — approximately 1 files
- `backups/` — approximately 23 files
- `BOOST_SPACE_CONFIG_GUIDE.md/` — approximately 1 files
- `check-entry-details.js/` — approximately 1 files
- `check-instagram-setup.ts/` — approximately 1 files
- `check-migration-status.sql/` — approximately 1 files
- `check-status.js/` — approximately 1 files
- `CLAUDE.md/` — approximately 1 files
- `CLOUDFLARE_SETUP.md/` — approximately 1 files
- `COMO_GERAR_TOKEN_INSTAGRAM.md/` — approximately 1 files
- `COMO-ALTERAR-LOGO.md/` — approximately 1 files
- `components.json/` — approximately 1 files
- `configure-reminder-webhook.js/` — approximately 1 files
- `CONTEXT_FOR_NEXT_SESSION.md/` — approximately 1 files
- `create-test-reminder.js/` — approximately 1 files
- `CURVED_TEXT_GUIDE.md/` — approximately 1 files
- `DASHBOARD_INTEGRATION_COMPLETE.md/` — approximately 1 files
- `DEPLOY_COMMANDS.sh/` — approximately 1 files
- `DEPLOY-CHECKLIST.md/` — approximately 1 files
- `DEPLOY-DATABASE-MIGRATION.md/` — approximately 1 files
- `DEPLOY-GUIDE.md/` — approximately 1 files
- `DEPLOY-QUICKSTART.md/` — approximately 1 files
- `docs/` — approximately 52 files
- `DOMAIN_SETUP.md/` — approximately 1 files
- `EFFECTS_SYSTEM.md/` — approximately 1 files
- `EFFECTS_TROUBLESHOOTING.md/` — approximately 1 files
- `ENV_VARIABLES.md/` — approximately 1 files
- `eslint.config.mjs/` — approximately 1 files
- `EXPORT_FIX_V2.md/` — approximately 1 files
- `EXPORT_FIX.md/` — approximately 1 files
- `FASE-6-COMPLETA.md/` — approximately 1 files
- `FFMPEG_VERCEL_SETUP.md/` — approximately 1 files
- `FINAL_SOLUTION.md/` — approximately 1 files
- `FINAL_TEXT_IMPLEMENTATION.md/` — approximately 1 files
- `FIX_AGENDAMENTO_ERROR_500.md/` — approximately 1 files
- `FIX_PROCESSING_STARTED_AT_FIELD.md/` — approximately 1 files
- `FIX_YOUTUBE_DOWNLOAD_404.md/` — approximately 1 files
- `GERAR_TOKEN_AGORA.md/` — approximately 1 files
- `GUIA_RAPIDO_DEPLOY.md/` — approximately 1 files
- `GUIA-COMPONENTES-CMS.md/` — approximately 1 files
- `GUIA-CONFIGURACOES-SITE.md/` — approximately 1 files
- `GUIA-DE-TESTES.md/` — approximately 1 files
- `HANDOFF_REPORT_MIGRATIONS.md/` — approximately 1 files
- `implementation_plan.md/` — approximately 1 files
- `INSTAGRAM_ANALYTICS_IMPLEMENTATION.md/` — approximately 1 files
- `LATE_API_IMPROVEMENTS.md/` — approximately 1 files
- `LATER_ANALYTICS_IMPLEMENTATION.md/` — approximately 1 files
- `LAYERS_PANEL_OPTIMIZATION.md/` — approximately 1 files
- `migrate-enum-final.sql/` — approximately 1 files
- `migrate-enum-step1.sql/` — approximately 1 files
- `migrate-enum-step2.sql/` — approximately 1 files
- `migrate-post-status.sql/` — approximately 1 files
- `MIGRATION_APPLY_INSTRUCTIONS.md/` — approximately 1 files
- `MIGRATION_CHECKLIST.md/` — approximately 1 files
- `MIGRATION_COMPLETION_REPORT.md/` — approximately 1 files
- `MIGRATION_DOCS_INDEX.md/` — approximately 1 files
- `MIGRATION_FIX_REPORT.md/` — approximately 1 files
- `MIGRATION_FIX_SUMMARY.md/` — approximately 1 files
- `MIGRATION_GUIDE.md/` — approximately 1 files
- `MIGRATION_NORMALIZATION.md/` — approximately 1 files
- `MIGRATION_PRODUCTION_GUIDE.md/` — approximately 1 files
- `MIGRATION_SUMMARY.md/` — approximately 1 files
- `MIGRATION-SUMMARY.md/` — approximately 1 files
- `MIGRATIONS_README.md/` — approximately 1 files
- `MOBILE_EDITOR_IMPLEMENTATION.md/` — approximately 1 files
- `MOBILE_IMPROVEMENTS_SUMMARY.md/` — approximately 1 files
- `MOBILE_OVERFLOW_FIX.md/` — approximately 1 files
- `MOBILE_UI_FIXES.md/` — approximately 1 files
- `MOBILE_UX_FIX_GUIDE.md/` — approximately 1 files
- `MOCK-DESENVOLVIMENTO.md/` — approximately 1 files
- `monitor-reminders.js/` — approximately 1 files
- `N8N_REMINDER_SETUP.md/` — approximately 1 files
- `next-env.d.ts/` — approximately 1 files
- `next.config.ts/` — approximately 1 files
- `package-lock.json/` — approximately 1 files
- `package.json/` — approximately 1 files
- `PERFORMANCE_OPTIMIZATIONS.md/` — approximately 1 files
- `PHASE_2_IMPLEMENTATION_STATUS.md/` — approximately 1 files
- `playwright.config.ts/` — approximately 1 files
- `postcss.config.mjs/` — approximately 1 files
- `POSTING_SCHEDULING_ANALYSIS.md/` — approximately 1 files
- `prevc-template.md/` — approximately 1 files
- `prisma/` — approximately 64 files
- `PRODUCTION_CHECKLIST.md/` — approximately 1 files
- `PRODUCTION-ENV.md/` — approximately 1 files
- `PROGRESSO-BIBLIOTECA-MUSICAS.md/` — approximately 1 files
- `prompt/` — approximately 3 files
- `PROMPT_FOR_NEXT_CONVERSATION.md/` — approximately 1 files
- `prompts/` — approximately 15 files
- `public/` — approximately 18 files
- `QUICK_HANDOFF.md/` — approximately 1 files
- `QUICK_START_LATER.md/` — approximately 1 files
- `QUICKSTART-BLOB.md/` — approximately 1 files
- `README_SIMPLIFICATION.md/` — approximately 1 files
- `README-DEPLOY.md/` — approximately 1 files
- `README.md/` — approximately 1 files
- `SAFARI_FIX_GUIDE.md/` — approximately 1 files
- `scripts/` — approximately 82 files
- `SETUP_AI_IMAGES.md/` — approximately 1 files
- `SETUP-BLOB.md/` — approximately 1 files
- `SIMPLIFICATION_SUMMARY.md/` — approximately 1 files
- `SMART_GUIDES.md/` — approximately 1 files
- `src/` — approximately 831 files
- `STORY_INSIGHTS_SETUP.md/` — approximately 1 files
- `tailwind.config.ts/` — approximately 1 files
- `TEMPORARY_FIX_OPTION.md/` — approximately 1 files
- `TEMPORARY_FIX_PROCESSING_STARTED_AT.md/` — approximately 1 files
- `test-credit-deduction.js/` — approximately 1 files
- `test-update-reminder.js/` — approximately 1 files
- `test-webhook-failure.sh/` — approximately 1 files
- `test-webhook-local.sh/` — approximately 1 files
- `test-webhook-simplified.sh/` — approximately 1 files
- `TESTING_LATER.md/` — approximately 1 files
- `tests/` — approximately 8 files
- `TEXT_BEHAVIOR_CHANGES.md/` — approximately 1 files
- `TEXT_REFACTOR.md/` — approximately 1 files
- `TOKEN_CONFIGURADO.md/` — approximately 1 files
- `TROUBLESHOOTING.md/` — approximately 1 files
- `tsconfig.json/` — approximately 1 files
- `tsconfig.tsbuildinfo/` — approximately 1 files
- `URGENT_DATABASE_CHECK.md/` — approximately 1 files
- `VERCEL_AI_IMAGE_DEBUG.md/` — approximately 1 files
- `VERCEL_VIDEO_SETUP.md/` — approximately 1 files
- `VERCEL-DEPLOY.md/` — approximately 1 files
- `vercel.json/` — approximately 1 files
- `VIDEO_PROCESSING_QUEUE.md/` — approximately 1 files
- `WEBHOOK_DEBUG_GUIDE.md/` — approximately 1 files
- `ZAPIER_BUFFER_CONFIG.md/` — approximately 1 files
- `ZAPIER_COPILOT_PROMPT.md/` — approximately 1 files
- `ZAPIER_FINAL_MAPPING_V2.md/` — approximately 1 files
- `ZAPIER_FINAL_MAPPING.md/` — approximately 1 files
- `ZAPIER_QUICK_SETUP.md/` — approximately 1 files
- `ZAPIER_SETUP_SIMPLIFIED.md/` — approximately 1 files

## Related Resources

- [Project Overview](./project-overview.md)
- Update [agents/README.md](../agents/README.md) when architecture changes.
