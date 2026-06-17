# AI News Pipeline - Dashboard Redesign Architecture

## Executive Summary

This document outlines a complete dashboard redesign focused on **simplifying user experience** and **reducing cognitive load** by consolidating multiple technical sections into a linear workflow matching the actual pipeline stages.

---

## Current Problems Identified

1. **Information Fragmentation**: Dashboard has 6+ disconnected sections (Topics, Sources, Delivery, Status, Manual Editing, Publishing)
2. **Missing States**: Posts only track generation status, not editing/revision cycles
3. **No Image Management**: Images stored inline with posts, no separate tracking
4. **Publication History Missing**: Can't track "Publish Again" or edit history
5. **Unclear Error Recovery**: Errors shown but no clear recovery path
6. **Technical Overload**: Too many low-level details (Celery, Flower, stages) visible
7. **No Telegram Integration Details**: After publishing, no link to message
8. **Duplicate Content**: News list and Posts list show similar content
9. **Poor Navigation**: User must scroll through 6 detail sections to understand pipeline flow
10. **Cognitive Load**: Too many buttons, options, and statuses per material

---

## New Dashboard Workflow

```
START PIPELINE
    ↓
CURRENT STATUS (single, clear status indicator)
    ↓
ERRORS & RECOVERY (if any errors)
    ↓
READY MATERIALS (unified view of all materials)
    ├─ News title + Source + Date
    ├─ Generated text
    ├─ Preview image
    ├─ Material status badge
    ├─ Action buttons (Edit, Return to Editing, Publish Again, View Logs)
    └─ After publication: Telegram link + Channel + Time
    ↓
TELEGRAM PUBLICATIONS (recent successful publications)
    ↓
LOGS (error logs, task execution logs)
    ↓
STATISTICS (summary of pipeline state)
    ↓
CONFIGURATION (collapsed by default)
```

---

## Material States & Lifecycle

### New Material Status Enum
```
NEW              - Just created, awaiting generation
GENERATED        - AI-generated, awaiting approval
EDITING          - In manual edit mode
READY            - Approved and ready for publication
PUBLISHED        - Successfully published to Telegram
FAILED           - Generation or publication failed
```

### State Transitions
```
NEW → GENERATED (after AI generation)
  ↓
GENERATED → EDITING (user clicks "Edit")
  ↓
EDITING → READY (user approves changes)
  ↓
READY → PUBLISHED (publication task completes)
  ↓
PUBLISHED → EDITING (user clicks "Return to Editing")

Any state → FAILED (on error)
```

---

## Database Model Changes

### 1. New `MaterialImage` Model
```python
class MaterialImage(Base):
    __tablename__ = "material_images"
    
    id: str = UUID primary key
    post_id: str = ForeignKey("posts.id")
    url: str = Image URL
    source: str = Enum: "rss", "og:image", "twitter:image", "placeholder"
    priority: int = Priority level (1-4)
    created_at: datetime = Timestamp
```

### 2. Updated `Post` Model (rename to `Material`?)
**Add fields:**
```python
image_id: str = ForeignKey("material_images.id")
telegram_message_id: str = Message ID after publication
telegram_channel_name: str = Channel name (from .env or config)
telegram_message_link: str = Clickable link to published message
published_to_telegram_at: datetime = Exact publication timestamp
edit_count: int = How many times material was edited
material_status: PostStatus = Enum (NEW, GENERATED, EDITING, READY, PUBLISHED, FAILED)
```

Keep backward compatibility by adding `material_status` as new field in `Post` model.

### 3. New `PublicationHistory` Model
```python
class PublicationHistory(Base):
    __tablename__ = "publication_history"
    
    id: str = UUID primary key
    post_id: str = ForeignKey("posts.id")
    action: str = Enum: "created", "edited", "published", "failed", "republished"
    old_text: str = Previous text (nullable)
    new_text: str = Current text
    status_before: str = Previous status
    status_after: str = New status
    error_message: str = Error details (nullable)
    telegram_message_id: str = (nullable, for published records)
    created_at: datetime = Timestamp
```

### 4. New `EditHistory` Model
```python
class EditHistory(Base):
    __tablename__ = "edit_history"
    
    id: str = UUID primary key
    post_id: str = ForeignKey("posts.id")
    version: int = Edit version number
    generated_text: str = Text for this version
    image_id: str = ForeignKey("material_images.id", nullable=True)
    edited_by: str = User identifier (nullable, for multi-user future)
    reverted_from: str = ForeignKey to EditHistory (if reverting to previous version)
    created_at: datetime = Timestamp
```

---

## Backend API Endpoints

### Current Endpoints (Keep)
- `GET /api/health` - Health check
- `GET /api/public-status` - Public status
- `POST /api/pipeline/run` - Start pipeline
- `GET /api/pipeline/status` - Pipeline status
- `GET /api/tasks/{id}` - Celery task status

### New Endpoints to Add

#### Material Management
```
GET /api/materials
  Query params: status, limit, offset, search
  Returns: List of unified material objects with all info
  Used by: Ready Materials block
  
GET /api/materials/{id}
  Returns: Complete material object with history and logs
  
POST /api/materials/{id}/return-to-editing
  Moves material from READY/PUBLISHED back to EDITING
  Preserves: text, image, edit history
  Creates: PublicationHistory entry
  Returns: Updated material object
  
POST /api/materials/{id}/publish-again
  Creates new publication task for already-published material
  Checks for duplicates (telegram_message_id)
  Creates: PublicationHistory entry with action="republished"
  Returns: Task info {task_id, status}
  
POST /api/materials/{id}/edit
  Moves material to EDITING state
  Accepts: new_text (optional), image_id (optional)
  Creates: EditHistory entry
  Returns: Updated material object
  
POST /api/materials/{id}/approve
  Moves material from EDITING/GENERATED to READY
  Accepts: generated_text (optional)
  Creates: PublicationHistory entry
  Returns: Updated material object
```

#### History & Logs
```
GET /api/materials/{id}/history
  Returns: PublicationHistory + EditHistory for material
  Includes: All versions, changes, timestamps
  
GET /api/materials/{id}/logs
  Returns: Error logs and task execution details
  Includes: Generation logs, publication logs, errors
  
GET /api/materials/telegram-publications
  Query params: limit, offset
  Returns: Recently published materials with Telegram details
  Includes: telegram_message_id, channel_name, link, timestamp
```

#### Status & Monitoring
```
GET /api/pipeline/current-status
  Returns: Single current status value
  Options: "waiting", "parsing_news", "filtering_news", "generating_posts", "processing_images", "publishing_to_telegram", "completed", "failed"
  
GET /api/pipeline/statistics
  Returns: Summary statistics
  Includes: sources_count, articles_found, posts_generated, posts_published, failed_tasks
  
GET /api/pipeline/errors
  Query params: limit
  Returns: Recent errors with context
  Includes: error_message, material_id, timestamp, recovery_action
```

---

## Frontend Component Structure

### New HTML Structure

```html
<header class="topbar">
  - Logo/Title
  - [Start Pipeline] button
  - [Refresh] button
  - Status indicator
</header>

<main class="dashboard dashboard--new-layout">
  
  <!-- 1. Current Status Block -->
  <section class="status-block">
    <div class="status-display">
      <div class="status-badge" data-status="...">
        Current Status Icon + Text
      </div>
      <button class="show-details">Show Details</button>
    </div>
    
    <!-- Modal/Expandable -->
    <div class="status-details" hidden>
      - Detailed logs
      - Task info
      - Progress
    </div>
  </section>
  
  <!-- 2. Errors & Recovery Block (conditional) -->
  <section class="error-recovery-block" id="errorBlock" hidden>
    <div class="error-summary">
      <h3>⚠️ Error occurred</h3>
      <p>Error details</p>
    </div>
    <div class="recovery-actions">
      <button class="retry">Retry</button>
      <button class="skip">Skip</button>
      <button class="view-logs">View Logs</button>
    </div>
  </section>
  
  <!-- 3. Ready Materials Block -->
  <section class="materials-block">
    <div class="materials-header">
      <h2>Ready Materials</h2>
      <div class="materials-toolbar">
        <input placeholder="Search..." class="search-input">
        <select class="status-filter">
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="generated">Generated</option>
          <option value="editing">Editing</option>
          <option value="ready">Ready</option>
          <option value="published">Published</option>
          <option value="failed">Failed</option>
        </select>
        <button class="refresh-materials">Refresh</button>
      </div>
    </div>
    
    <div class="materials-list">
      <!-- Material Card Template -->
      <article class="material-card" data-material-id="...">
        <div class="material-card-header">
          <div class="material-info">
            <h3 class="material-title">News Title</h3>
            <p class="material-meta">
              <span class="source">Source Name</span>
              <span class="date">2 hours ago</span>
            </p>
          </div>
          <div class="material-status-badge" data-status="...">
            NEW / GENERATED / EDITING / READY / PUBLISHED / FAILED
          </div>
        </div>
        
        <div class="material-card-body">
          <div class="material-image">
            <img src="..." alt="Material image" />
            <small class="image-source">Source: RSS</small>
          </div>
          
          <div class="material-text">
            <p>Generated text (truncated to 300 chars)...</p>
          </div>
        </div>
        
        <div class="material-card-footer">
          <!-- Publication Info (if published) -->
          <div class="publication-info" hidden>
            <a href="..." target="_blank" class="telegram-link">
              📱 Open in Telegram
            </a>
            <span class="channel-name">@channel_name</span>
            <span class="publication-time">Published 2 hours ago</span>
          </div>
          
          <!-- Action Buttons -->
          <div class="material-actions">
            <button class="action edit-btn">Edit</button>
            <button class="action return-to-editing-btn" hidden>Return to Editing</button>
            <button class="action publish-again-btn" hidden>Publish Again</button>
            <button class="action publish-btn" hidden>Publish</button>
            <button class="action view-logs-btn">View Logs</button>
          </div>
        </div>
      </article>
      
      <!-- Empty State -->
      <div class="empty-state" hidden>
        <p>No materials found. Start the pipeline or add news manually.</p>
      </div>
    </div>
  </section>
  
  <!-- 4. Telegram Publications Block -->
  <section class="publications-block">
    <h2>Recent Telegram Publications</h2>
    <div class="publications-list">
      <!-- Publication Record Template -->
      <div class="publication-record">
        <div class="publication-info">
          <p class="publication-title">Material Title</p>
          <p class="publication-meta">
            <span class="channel">@channel_name</span>
            <span class="time">2 hours ago</span>
          </p>
        </div>
        <a href="..." target="_blank" class="telegram-link">
          📱 Open Message
        </a>
      </div>
    </div>
  </section>
  
  <!-- 5. Logs Block -->
  <section class="logs-block">
    <h2>Logs & Errors</h2>
    <div class="logs-toolbar">
      <select class="log-level-filter">
        <option value="">All</option>
        <option value="error">Errors</option>
        <option value="warning">Warnings</option>
        <option value="info">Info</option>
      </select>
      <input type="number" class="log-limit" value="30" min="10" max="200">
      <button class="refresh-logs">Refresh</button>
    </div>
    <div class="logs-list">
      <pre id="logsContent"></pre>
    </div>
  </section>
  
  <!-- 6. Statistics Block -->
  <section class="statistics-block">
    <h2>Pipeline Statistics</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Sources</div>
        <div class="stat-value" id="sourcesCount">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Articles Found</div>
        <div class="stat-value" id="articlesCount">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Posts Generated</div>
        <div class="stat-value" id="generatedCount">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Posts Published</div>
        <div class="stat-value" id="publishedCount">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Failed Tasks</div>
        <div class="stat-value" id="failedCount">0</div>
      </div>
    </div>
  </section>
  
  <!-- 7. Configuration Block (collapsed) -->
  <details class="configuration-block">
    <summary>⚙️ Configuration & Developer Tools</summary>
    <div class="configuration-content">
      <!-- Existing config sections moved here -->
      - Admin API Key
      - OpenAI Configuration
      - Telegram Configuration
      - Topics & Sources Management
      - Task Monitoring (Celery/Redis status)
    </div>
  </details>
</main>
```

### CSS Changes Required

1. **New Layout**
   - Remove tab-based layout
   - Use vertical flexbox/grid
   - Material card grid (1-3 columns responsive)
   - Status badge color coding

2. **Material Card Styling**
   - Image thumbnail (200x150px, 16:9 aspect ratio)
   - Text truncation (3 lines max)
   - Status badge prominent
   - Hover effects for action buttons
   - Publication info overlay

3. **Status Badges**
   - NEW: Gray (#808080)
   - GENERATED: Blue (#2196F3)
   - EDITING: Orange (#FF9800)
   - READY: Green (#4CAF50)
   - PUBLISHED: Checkmark Green (#8BC34A)
   - FAILED: Red (#F44336)

4. **Typography**
   - Material title: 18px, bold
   - Meta info: 12px, gray
   - Button text: 14px
   - Status text: 12px, bold

### JavaScript Changes Required

1. **Refactor State Management**
   - Move from section-based to material-based state
   - Cache materials in memory
   - Auto-refresh every 5 seconds

2. **New Component Functions**
   - `renderMaterialCard(material)` - Render single material
   - `renderMaterialsList(materials)` - Render grid
   - `updateCurrentStatus(status)` - Update status block
   - `updateErrorBlock(error)` - Show/hide error recovery
   - `updateStatistics(stats)` - Update stats display
   - `handleEditMaterial(materialId)` - Enter editing mode
   - `handleReturnToEditing(materialId)` - Revert to editing
   - `handlePublishAgain(materialId)` - Re-publish
   - `handleViewLogs(materialId)` - Show logs modal

3. **API Integration Updates**
   - Add calls to new `/api/materials/` endpoints
   - Add calls to new `/api/materials/{id}/...` endpoints
   - Update polling to use `/api/pipeline/current-status`
   - Add error recovery display

4. **Event Handlers**
   - Material card action buttons
   - Material search/filter
   - Status block click to expand
   - Telegram link clicks

---

## Migration Strategy

### Phase 1: Models & Database (Alembic)
1. Add `material_images` table
2. Add `publication_history` table
3. Add `edit_history` table
4. Add columns to `posts` table:
   - `image_id`
   - `telegram_message_id`
   - `telegram_channel_name`
   - `telegram_message_link`
   - `published_to_telegram_at`
   - `edit_count`
   - `material_status` (defaults to current status)

### Phase 2: Backend API
1. Implement new models in `app/models.py`
2. Add new endpoints in `app/api/endpoints.py`
3. Update Celery tasks to populate new fields
4. Add publication history tracking

### Phase 3: Frontend
1. Update `app/frontend/index.html`
2. Update `app/frontend/static/dashboard.css`
3. Refactor `app/frontend/static/dashboard.js`

### Phase 4: Data Migration
1. Migrate existing posts to new structure
2. Populate `material_status` based on `status`
3. Create `PublicationHistory` entries for existing published posts

---

## UX Improvements Summary

| Before | After |
|--------|-------|
| 6+ scrollable sections | Linear workflow with 7 sections |
| Multiple status types scattered | Single clear status indicator |
| News + Posts + Published lists | Unified Ready Materials cards |
| No edit history | Full edit & publication history |
| No Telegram links shown | Clickable links to Telegram messages |
| Unclear error recovery | Clear error block with recovery actions |
| Technical Celery/Flower details | Simple Task Monitoring summary |
| No image management | Separate image model with priority |

---

## Success Criteria

✅ User can understand current pipeline state at a glance
✅ User can find any material in < 3 seconds
✅ User can edit and revert changes easily
✅ User can republish without duplication
✅ User can see full publication history
✅ User receives clear error messages with recovery steps
✅ Dashboard loads in < 2 seconds
✅ All actions complete within 30 seconds
✅ Mobile responsive design
✅ No breaking changes to existing API (backward compatible)
