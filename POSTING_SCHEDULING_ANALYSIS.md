# Studio Lagosta: Posting & Scheduling System Analysis

## Executive Summary
Studio Lagosta v2 has a complete social media posting and scheduling system with Zapier webhook integration for Instagram. The system supports immediate posting, scheduled posts, and recurring series. Posts are stored in the database and executed via a cron job that triggers Zapier webhooks for actual publishing.

---

## 1. DATABASE SCHEMA

### Core Social Media Models

#### **SocialPost** (Main model for posts)
- **Location**: `prisma/schema.prisma` (lines 854-908)
- **Fields**:
  - `id`: Unique identifier (cuid)
  - `projectId`: Links to project
  - `generationId`: Links to creative/generation
  - `userId`: Links to user
  - `postType`: Enum (POST, STORY, REEL, CAROUSEL)
  - `caption`: Post text content (max 2200 chars)
  - `mediaUrls`: Array of creative URLs
  - `altText`: Array of alt text for accessibility
  - `firstComment`: Auto-posted comment
  - `scheduleType`: Enum (IMMEDIATE, SCHEDULED, RECURRING)
  - `scheduledDatetime`: When post should go out
  - `recurringConfig`: JSON object with recurrence settings
  - `status`: Enum (DRAFT, SCHEDULED, PROCESSING, SENT, FAILED)
  - `sentAt`: When successfully sent
  - `failedAt`: When failed
  - `errorMessage`: Error details
  - `webhookResponse`: Response from Zapier
  - `zapierWebhookUrl`: Specific webhook URL for this post
  - `isRecurring`: Boolean flag
  - `parentPostId`: For recurring series child posts
  - `originalScheduleType`: Tracks original type

**Relations**:
- `Project` (parent)
- `Generation` (optional, the creative used)
- `parentPost` (self-reference for recurrence)
- `childPosts` (self-reference for recurrence)
- `retries` (PostRetry array)
- `logs` (PostLog array)

#### **PostRetry** (Retry tracking)
- **Location**: `prisma/schema.prisma` (lines 910-925)
- **Fields**:
  - `id`: Unique identifier
  - `postId`: Link to social post
  - `attemptNumber`: Which retry attempt
  - `scheduledFor`: When retry should run
  - `status`: RetryStatus (PENDING, PROCESSING, SUCCESS, FAILED)
  - `errorMessage`: Why it failed
  - `executedAt`: When actually executed

#### **PostLog** (Audit trail)
- **Location**: `prisma/schema.prisma` (lines 927-940)
- **Fields**:
  - `id`: Unique identifier
  - `postId`: Link to social post
  - `event`: PostLogEvent (CREATED, SCHEDULED, SENT, FAILED, RETRIED, CANCELLED, EDITED)
  - `message`: Human-readable description
  - `metadata`: JSON for additional context
  - `createdAt`: When event occurred

### Supporting Models

#### **Generation** (Creatives/Templates Output)
- **Location**: `prisma/schema.prisma` (lines 74-99)
- **Key Fields**:
  - `id`, `templateId`, `projectId`
  - `resultUrl`: The final image/video URL
  - `status`: GenerationStatus (PROCESSING, COMPLETED, FAILED)
  - `fieldValues`: JSON of template field inputs
  - `googleDriveFileId`, `googleDriveBackupUrl`: Backup locations
  - `socialPosts`: Array of posts using this creative

#### **Template** (Design templates)
- **Location**: `prisma/schema.prisma` (lines 307-332)
- **Key Fields**:
  - `id`, `projectId`
  - `name`, `type`: TemplateType (STORY, FEED, SQUARE)
  - `dimensions`: Canvas size
  - `designData`: JSON containing design configuration
  - `dynamicFields`: JSON array of editable fields
  - `tags`, `category`: For discovery
  - `isPublic`, `isPremium`: Access control
  - `Generation`: Array of outputs from this template

#### **Project** (Account container)
- **Location**: `prisma/schema.prisma` (lines 157-196)
- **Key Fields**:
  - `id`, `name`, `description`
  - `instagramAccountId`: REQUIRED for posting - identifier used in Zapier routing
  - `instagramUsername`: Display name
  - `instagramProfileUrl`: Profile link
  - `googleDriveFolderId`, `googleDriveImagesFolderId`, `googleDriveVideosFolderId`: Media storage
  - `makeWebhookAnalyzeUrl`, `makeWebhookCreativeUrl`: Webhook URLs for Make.com
  - `SocialPost`: Array of posts for this account

#### **Page** (Template pages)
- **Location**: `prisma/schema.prisma` (lines 334-350)
- **Purpose**: Multi-page template support
- **Key Fields**:
  - `templateId`, `order`: Page ordering
  - `width`, `height`: Dimensions
  - `layers`: JSON of design layers
  - `background`: Background color

### Enums

```typescript
enum PostType { POST, STORY, REEL, CAROUSEL }
enum PostStatus { DRAFT, SCHEDULED, PROCESSING, SENT, FAILED }
enum ScheduleType { IMMEDIATE, SCHEDULED, RECURRING }
enum RecurrenceFrequency { DAILY, WEEKLY, MONTHLY }
enum PostLogEvent { CREATED, SCHEDULED, SENT, FAILED, RETRIED, CANCELLED, EDITED }
enum RetryStatus { PENDING, PROCESSING, SUCCESS, FAILED }
enum GenerationStatus { PROCESSING, COMPLETED, FAILED }
enum TemplateType { STORY, FEED, SQUARE }
```

---

## 2. API ROUTES

### Post Management API

#### **POST /api/projects/[projectId]/posts** (Create post)
- **Location**: `/src/app/api/projects/[projectId]/posts/route.ts`
- **Method**: POST
- **Auth**: Required (Clerk)
- **Validation**:
  - Verifies project ownership
  - Requires Instagram account configured
  - Validates post data with Zod schema
  - Ensures media exists and belongs to project
- **Flow**:
  1. Parse generation IDs and fetch URLs
  2. Use PostScheduler to create post
  3. If IMMEDIATE: Send to Zapier immediately
  4. If SCHEDULED: Store for cron job
  5. If RECURRING: Create recurring series
- **Response**: `{ success: true, postId: string }`

#### **GET /api/projects/[projectId]/posts** (List posts)
- **Location**: `/src/app/api/projects/[projectId]/posts/route.ts`
- **Method**: GET
- **Returns**: Array of SocialPost objects with Generation details
- **Includes**: Template name and result URLs

#### **GET /api/projects/[projectId]/posts/[postId]** (Get single post)
- **Location**: `/src/app/api/projects/[projectId]/posts/[postId]/route.ts`
- **Returns**: Full SocialPost with Generation data

#### **PUT /api/projects/[projectId]/posts/[postId]** (Update post)
- **Location**: `/src/app/api/projects/[projectId]/posts/[postId]/route.ts`
- **Editable Fields**:
  - `postType`, `caption`
  - `scheduleType`, `scheduledDatetime`
  - `recurringConfig` (frequency, daysOfWeek, time, endDate)
  - `altText`, `firstComment`
- **Note**: Updates `recurringFrequency`, `recurringDaysOfWeek`, `recurringTime`, `recurringEndDate` separately in DB

#### **DELETE /api/projects/[projectId]/posts/[postId]** (Delete post)
- **Location**: `/src/app/api/projects/[projectId]/posts/[postId]/route.ts`
- **Behavior**: Deletes post and all related retries/logs (CASCADE)

#### **GET /api/projects/[projectId]/posts/calendar** (Calendar view)
- **Location**: `/src/app/api/projects/[projectId]/posts/calendar/route.ts`
- **Query Params**: `startDate`, `endDate` (ISO strings)
- **Returns**: Posts scheduled in date range OR already sent in date range
- **Filters**:
  - Scheduled posts within window
  - Already sent posts within window

### Supporting APIs

#### **PATCH /api/projects/[projectId]/instagram** (Configure account)
- **Location**: `/src/app/api/projects/[projectId]/instagram/route.ts`
- **Fields**:
  - `instagramAccountId`: Required unique identifier for routing
  - `instagramUsername`: Optional display name
  - `instagramProfileUrl`: Optional profile link
- **Purpose**: Set up which Instagram account posts go to

#### **GET /api/projects/[projectId]/creatives** (List generations)
- **Location**: `/src/app/api/projects/[projectId]/creatives/route.ts`
- **Returns**: Array of generations with templateName and resultUrl
- **Used by**: Media upload system in post composer

#### **GET /api/projects/[projectId]/generations** (Paginated generations)
- **Location**: `/src/app/api/projects/[projectId]/generations/route.ts`
- **Query Params**: `page`, `pageSize`, `createdBy`
- **Returns**: Paginated generations with metadata
- **Includes**: Template details and timestamps

#### **POST /api/templates** (Create template)
- **Location**: `/src/app/api/templates/route.ts`
- **Behavior**: Creates template AND automatically creates first Page in transaction
- **Purpose**: Used by design editor to save templates

---

## 3. FRONTEND COMPONENTS

### Post Creation & Editing

#### **PostComposer** (Main post creation dialog)
- **Location**: `/src/components/posts/post-composer.tsx` (370 lines)
- **Features**:
  - Post type selector (POST, STORY, REEL, CAROUSEL)
  - Media upload system
  - Caption editor (2200 char limit with counter)
  - First comment optional field
  - Schedule type selector:
    - IMMEDIATE (post now, red button)
    - SCHEDULED (with date/time picker)
    - RECURRING (with recurrence config)
  - Form validation with Zod
  - Integration with useSocialPosts hook
- **Props**:
  - `projectId`: number
  - `open`: boolean
  - `onClose`: function
  - `initialData`: partial form data for editing
- **Validation**:
  - CAROUSEL: 2-10 images
  - STORY/REEL/POST: exactly 1 media
  - SCHEDULED: future datetime only
  - RECURRING: requires config

#### **SchedulePicker** (Date/time picker)
- **Location**: `src/components/posts/schedule-picker.tsx` (presumably)
- **Features**: Date and time selection for scheduled posts

#### **RecurringConfig** (Recurrence settings)
- **Location**: `src/components/posts/recurring-config.tsx` (presumably)
- **Features**:
  - Frequency: DAILY, WEEKLY, MONTHLY
  - Days of week: For weekly frequency
  - Time: Schedule time
  - End date: Optional recurrence end

#### **MediaUploadSystem** (Multi-source media selection)
- **Location**: `src/components/posts/media-upload-system.tsx` (presumably)
- **Sources**: Generations, Google Drive, uploads
- **Features**: Thumbnail previews, multi-select

### Agenda/Calendar Views

#### **AgendaCalendarView** (Main calendar)
- **Location**: `/src/components/agenda/calendar/agenda-calendar-view.tsx` (103 lines)
- **Features**:
  - Calendar month view
  - Shows scheduled posts on dates
  - Integrates with channels sidebar
  - Uses useAgendaPosts hook

#### **CalendarHeader** (Month navigation and actions)
- **Location**: `/src/components/agenda/calendar/calendar-header.tsx` (266 lines)
- **Features**:
  - Month/week/day view toggle
  - Previous/next navigation
  - "Today" button
  - Project selector
  - Create post button (checks Instagram config)
  - Channel status display
  - View metrics/icons

#### **CalendarGrid** (Calendar grid rendering)
- **Location**: `/src/components/agenda/calendar/calendar-grid.tsx` (147 lines)
- **Features**: Renders calendar cells with posts

#### **CalendarDayCell** (Individual day)
- **Location**: `/src/components/agenda/calendar/calendar-day-cell.tsx` (74 lines)
- **Shows**: Date and posts for that day

#### **PostMiniCard** (Compact post preview in calendar)
- **Location**: `/src/components/agenda/calendar/post-mini-card.tsx` (94 lines)
- **Shows**: Post type, status, partial caption

#### **PostPreviewModal** (Full post details)
- **Location**: `/src/components/agenda/post-actions/post-preview-modal.tsx` (248 lines)
- **Shows**: Full post details with image previews
- **Actions**: Edit, delete, reschedule, publish now

#### **RescheduleDialog** (Change scheduled time)
- **Location**: `/src/components/agenda/post-actions/reschedule-dialog.tsx` (179 lines)
- **Features**: Datetime picker for rescheduling

#### **ChannelsList** (Project selector)
- **Location**: `/src/components/agenda/channels-sidebar/channels-list.tsx` (190 lines)
- **Shows**: Available projects with Instagram status

#### **InstagramAccountConfig** (Configuration card)
- **Location**: `/src/components/projects/instagram-account-config.tsx` (207 lines)
- **Fields**:
  - Instagram Account ID (required) - This goes in the Zapier webhook
  - Username (optional) - For display
  - Profile URL (optional) - For reference
- **Includes**: Help section explaining Zapier routing

---

## 4. CUSTOM HOOKS

### Data Fetching Hooks

#### **useSocialPosts(projectId)**
- **Location**: `/src/hooks/use-social-posts.ts`
- **Exports**:
  - `postsQuery`: Get all posts for project
  - `usePost(postId)`: Get single post
  - `createPost`: Mutation to create post
  - `updatePost`: Mutation to update post
  - `deletePost`: Mutation to delete post
- **Query Keys**: `['social-posts', projectId]`, `['social-post', postId]`
- **Invalidation**: Also invalidates `['agenda-posts', projectId]` on mutations

#### **useAgendaPosts({ projectId, startDate, endDate })**
- **Location**: `/src/hooks/use-agenda-posts.ts`
- **Returns**: Posts in date range for calendar
- **Query Key**: `['agenda-posts', projectId, startDate, endDate]`
- **Stale Time**: 30 seconds

#### **usePostActions(projectId)**
- **Location**: `/src/hooks/use-post-actions.ts`
- **Mutations**:
  - `publishNow(postId)`: Change to IMMEDIATE schedule
  - `reschedulePost({ postId, scheduledDatetime })`: Reschedule to new date
  - `deletePost(postId)`: Delete post
  - `duplicatePost(postId)`: Clone post for next day

---

## 5. POSTING & SCHEDULING SYSTEM

### PostScheduler Class
- **Location**: `/src/lib/posts/scheduler.ts` (340 lines)
- **Responsibility**: Create and send posts
- **Key Methods**:

#### **createPost(data)** 
- Creates post in database
- Sets status based on scheduleType
- Logs creation
- If IMMEDIATE: Calls sendToZapier immediately
- If RECURRING: Calls createRecurringSeries
- If SCHEDULED: Waits for cron job

#### **sendToZapier(postId)**
- Fetches post with project details
- Validates Instagram account configured
- Constructs payload:
  ```javascript
  {
    post_type: 'post'|'story'|'reel'|'carousel',
    caption: string,
    media_urls: string[],
    alt_text: string[],
    first_comment: string,
    instagram_account_id: string,  // KEY - used by Zapier for routing
    instagram_username: string,
    metadata: {
      post_id: string,
      project_id: number,
      project_name: string,
      user_id: string
    }
  }
  ```
- **BEFORE** sending: Deducts credits for `social_media_post` feature
- Sends POST to Zapier webhook URL (from env: `ZAPIER_WEBHOOK_URL`)
- On success:
  - Updates status to SENT
  - Stores webhookResponse
  - Logs sent event
- On failure:
  - Updates status to FAILED
  - Stores error message
  - Schedules retry (5 minutes)

#### **createRecurringSeries(parentPost)**
- Generates occurrences based on frequency:
  - DAILY: Every day at specified time
  - WEEKLY: Specific days of week at time
  - MONTHLY: First of month at time
- Creates child posts with ScheduleType.SCHEDULED
- Sets isRecurring=true, originalScheduleType=RECURRING
- Max 365 occurrences or until endDate

#### **generateOccurrences(frequency, time, daysOfWeek, endDate)**
- Returns array of Date objects for recurrence
- Max generates 365 dates

#### **scheduleRetry(postId, attemptNumber)**
- Creates PostRetry record
- Sets scheduledFor to 5 minutes from now
- Max 3 retry attempts

#### **createLog(postId, event, message, metadata)**
- Creates PostLog audit entry

### PostExecutor Class
- **Location**: `/src/lib/posts/executor.ts` (120 lines)
- **Responsibility**: Execute scheduled/retry jobs from cron
- **Key Methods**:

#### **executeScheduledPosts()**
- Finds posts in time window:
  - Status: SCHEDULED
  - scheduledDatetime: now -1 min to +1 min
- Attempts to send each via sendToZapier
- Returns: `{ processed, success, failed }`

#### **executeRetries()**
- Finds pending PostRetry records where scheduledFor <= now
- Updates status to PROCESSING, sets executedAt
- Attempts to send post via sendToZapier
- On success: Mark retry as SUCCESS
- On failure:
  - Mark retry as FAILED
  - If attemptNumber < 3: Schedule next retry
- Returns: `{ processed }`

### Cron Job
- **Location**: `/src/app/api/cron/posts/route.ts`
- **Endpoint**: `GET /api/cron/posts`
- **Auth**: Verifies `Authorization: Bearer {CRON_SECRET}`
- **Trigger**: Vercel Cron (typically every minute)
- **Execution**:
  1. Call executor.executeScheduledPosts()
  2. Call executor.executeRetries()
  3. Return results
- **Response**:
  ```json
  {
    "success": true,
    "scheduled": { "processed": N, "success": N, "failed": N },
    "retries": { "processed": N }
  }
  ```

---

## 6. ZAPIER WEBHOOK INTEGRATION

### Webhook Configuration
- **Endpoint**: Stored in environment variable `ZAPIER_WEBHOOK_URL`
- **Method**: POST
- **Content-Type**: application/json
- **Authentication**: None (Zapier generates unique URL)

### Webhook Payload Structure
```javascript
{
  // Post content
  post_type: "post" | "story" | "reel" | "carousel",
  caption: string (max 2200 chars),
  media_urls: string[], // URLs to images/videos
  alt_text: string[],
  first_comment: string, // Optional auto-comment
  
  // INSTAGRAM ACCOUNT ROUTING (KEY PART)
  instagram_account_id: string, // Project's configured ID
  instagram_username: string,   // For display
  
  // Metadata for tracking
  metadata: {
    post_id: string,        // For tracking back to DB
    project_id: number,
    project_name: string,
    user_id: string
  }
}
```

### How Zapier Routing Works
1. **Per Project**: Each project has unique Instagram Account ID set in DB
2. **In Zapier**: User creates filters on `instagram_account_id`
3. **Example**:
   - Project "By Rock" has ID "by.rock"
   - Zapier filter: `instagram_account_id = "by.rock"`
   - Routes to Buffer/native Instagram with "by.rock" credentials
4. **Multi-Account**: Multiple projects → Multiple IDs → Multiple Zapier filters

### Response Handling
- **Success**: Any 2xx response accepted
- **Response Stored**: webhookResponse field in SocialPost
- **Failure**: Any non-2xx triggers retry mechanism

---

## 7. CURRENT IMPLEMENTATION STATUS

### IMPLEMENTED & COMPLETE
✅ Database schema with all post/schedule/retry models
✅ Post CRUD API (create, read, update, delete)
✅ Three schedule types: IMMEDIATE, SCHEDULED, RECURRING
✅ Recurrence generation (DAILY, WEEKLY, MONTHLY)
✅ Zapier webhook integration
✅ Credit deduction for post feature
✅ Retry mechanism (up to 3 attempts, 5 min intervals)
✅ Calendar view for scheduled posts
✅ Post composer UI with full controls
✅ Instagram account configuration per project
✅ Media selection from generations
✅ Cron job for executing scheduled posts
✅ Error handling and logging
✅ Post status tracking
✅ Audit trail (PostLog)

### PARTIALLY COMPLETE / NEEDS VERIFICATION
⚠️ RecurringConfig storage in DB - appears to store in `recurringConfig` JSON field but PUT endpoint references separate fields
⚠️ Update endpoint - may have inconsistency with how recurring config is stored vs updated

### MISSING / INCOMPLETE
❌ Instagram native API integration (currently webhook-based only)
❌ Direct posting to Instagram (relies on Zapier/Buffer)
❌ Batch posting UI
❌ Post analytics/metrics
❌ Auto-retry after webhook timeout
❌ Post templating/drafts library
❌ Social media account linking UI (manual config only)
❌ Multiple platform support (Instagram only)
❌ Draft post autosave
❌ Post preview on different devices

---

## 8. COMPLETE USER WORKFLOW

### Project Setup Phase
1. User creates project in dashboard (`/projects`)
2. Navigates to project settings
3. Configures Instagram Account ID (e.g., "by.rock")
4. Enters username and profile URL (optional)
5. Saves configuration
6. System stores in `Project.instagramAccountId`

### Template & Creative Generation Phase
1. User creates template in design editor
   - POST creates template + first Page in transaction
   - Stores designData JSON
2. User generates creatives from template
   - System creates Generation records
   - Stores resultUrl pointing to image/video
   - Can upload to Google Drive for backup

### Post Creation Phase
1. User opens Agenda page (`/agenda`)
2. Selects project from sidebar (checks Instagram config)
3. Clicks "Create Post" button
4. **PostComposer dialog opens**:
   - Selects post type (POST/STORY/REEL/CAROUSEL)
   - Selects media (1 for single, 2-10 for carousel)
   - Writes caption (up to 2200 chars)
   - Optionally adds first comment
   - Chooses schedule type:
     - **IMMEDIATE**: Sends now
     - **SCHEDULED**: Picks date/time in future
     - **RECURRING**: Picks frequency, days, time, end date

### Post Submission
1. Form validates all fields
2. `createPost.mutateAsync()` calls API
3. API validates project ownership and Instagram config
4. API fetches generation data (resultUrl, metadata)
5. PostScheduler.createPost() runs:
   - Creates SocialPost record
   - Logs "CREATED" event
   - **If IMMEDIATE**:
     - Calls sendToZapier immediately
     - Deducts credits
     - Updates status to SENT or FAILED
   - **If SCHEDULED**:
     - Sets status to SCHEDULED
     - Cron will process at scheduled time
   - **If RECURRING**:
     - Calls createRecurringSeries
     - Generates occurrences
     - Creates child posts all in SCHEDULED status

### Scheduled Post Execution (Cron)
1. **Every minute**: Vercel cron hits `/api/cron/posts`
2. **executeScheduledPosts()** runs:
   - Finds posts with SCHEDULED status in ±1 min window
   - For each post: Calls sendToZapier()
3. **sendToZapier()** executes:
   - Fetches latest post data + project
   - Constructs webhook payload
   - Deducts credits BEFORE sending
   - POSTs to Zapier webhook
   - On 2xx: Updates status to SENT, stores response
   - On error: Status to FAILED, schedules retry

### Retry Execution
1. **executeRetries()** runs:
   - Finds PostRetry records with PENDING status
   - For each: Attempts sendToZapier again
   - Tracks up to 3 attempts
   - If failed after 3: Stops trying

### User Views & Manages Posts
1. User views **Calendar view** in Agenda:
   - Shows all scheduled/sent posts on dates
2. Clicks post card to see **PostPreviewModal**:
   - Shows full details, images, status
3. Can:
   - **Publish Now**: Changes to IMMEDIATE (if still DRAFT/SCHEDULED)
   - **Reschedule**: Opens RescheduleDialog, picks new date
   - **Delete**: Removes post (and retries/logs cascade delete)
   - **Duplicate**: Clones post for next day

---

## 9. KEY FILES REFERENCE

### Backend Core
```
src/lib/posts/scheduler.ts          - Post creation and Zapier sending
src/lib/posts/executor.ts           - Scheduled execution and retries
src/app/api/cron/posts/route.ts    - Cron job endpoint
src/lib/auth-utils.ts              - getUserFromClerkId helper
src/lib/credits/deduct.ts          - Credit deduction
src/lib/projects/access.ts         - Permission checking
```

### API Routes
```
src/app/api/projects/[projectId]/posts/route.ts           - POST/GET
src/app/api/projects/[projectId]/posts/[postId]/route.ts  - GET/PUT/DELETE
src/app/api/projects/[projectId]/posts/calendar/route.ts  - Calendar view
src/app/api/projects/[projectId]/instagram/route.ts       - Config account
src/app/api/projects/[projectId]/creatives/route.ts       - List generations
src/app/api/templates/route.ts                             - Create templates
```

### Frontend Components
```
src/components/posts/post-composer.tsx                     - Post creation dialog
src/components/agenda/calendar/agenda-calendar-view.tsx   - Main calendar
src/components/agenda/calendar/calendar-header.tsx        - Navigation
src/components/agenda/post-actions/post-preview-modal.tsx - Details modal
src/components/projects/instagram-account-config.tsx      - Config form
```

### Hooks
```
src/hooks/use-social-posts.ts       - Post CRUD operations
src/hooks/use-agenda-posts.ts       - Calendar data
src/hooks/use-post-actions.ts       - Post actions (publish, reschedule)
```

### Pages
```
src/app/(protected)/agenda/page.tsx    - Agenda main page
src/app/(protected)/dashboard/page.tsx - Project list
```

### Database
```
prisma/schema.prisma - All models (SocialPost, PostRetry, PostLog, Generation, Template, etc.)
```

---

## 10. ENVIRONMENT VARIABLES NEEDED

```env
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/xxxxx/yyyy/
CRON_SECRET=your-vercel-cron-secret
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

---

## 11. POTENTIAL ISSUES & GAPS

### Design Inconsistencies
1. **RecurringConfig Storage**: Schema shows `recurringConfig` as single JSON field, but PUT endpoint tries to update individual fields (`recurringFrequency`, `recurringDaysOfWeek`, etc.) that don't exist in schema
2. **userId field**: Posts store `userId` (database user ID) but verify with `clerkUserId` - potential mismatch

### Feature Gaps
1. **No native Instagram API**: All posting goes through Zapier/Buffer, not direct
2. **No draft autosave**: Posts go from creation to scheduled/processing
3. **No batch operations**: Can't create multiple posts at once
4. **No post templates/quick actions**: Every post starts fresh
5. **Limited retry logic**: Fixed 5-min intervals, max 3 attempts
6. **No detailed error messages to user**: Errors logged but not always shown

### Optimization Opportunities
1. **Cron window**: ±1 minute might miss posts if clock skew
2. **Credit deduction timing**: Happens BEFORE Zapier success - could strand credits if webhook fails permanently
3. **No request logging**: Zapier payloads not logged for debugging
4. **Calendar query**: Gets all posts in range every time, no incremental loading

### Testing Notes
1. Zapier webhook URL must be set in environment
2. CRON_SECRET must match verification header
3. PROJECT must have `instagramAccountId` configured
4. DATABASE must have cleaned up old retry records (no TTL)

---

## Summary

The system is **functionally complete for core features** (create, schedule, send, retry). The architecture is sound:
- Separation of concerns (Scheduler, Executor, API routes)
- Proper async handling
- Database transaction support for template creation
- Comprehensive error logging
- Multi-schedule type support
- Zapier webhook for flexible routing to multiple Instagram accounts

**Next steps for production**:
1. Fix RecurringConfig DB schema mismatch
2. Add comprehensive error UI feedback
3. Implement draft autosave
4. Add batch operations
5. Consider caching strategy for calendar
6. Monitor Zapier webhook success rates
7. Implement webhook signature verification for security
