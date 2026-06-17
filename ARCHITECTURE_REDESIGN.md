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

### 2. Updated `Post` Model
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

## Frontend Component Structure - REVISED HTML

### Key Changes to Current Structure:

**1. Remove these sections (move to collapsed config):**
   - Topics & Sources (config section)
   - Telegram Delivery settings
   - AI Test (config section)

**2. Add new top-level sections:**
   - Current Status (prominent, above fold)
   - Errors & Recovery (conditional, below status)
   - Ready Materials (unified, replaces News + Posts + Published)
   - Telegram Publications (recent successful posts)
   - Logs & Errors (scrollable)
   - Statistics (summary cards)

**3. Keep but relocate:**
   - Configuration (collapse by default)
   - Pipeline controls (in Current Status)

---

## CSS Changes Required

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

---

## JavaScript Changes Required

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
