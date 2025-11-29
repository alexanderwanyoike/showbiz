# Showbiz

AI-powered video storyboard application using Google's Imagen 4 and Veo 3 APIs.

## What It Does

Showbiz lets users create video storyboards by:
1. Creating projects to organize work
2. Creating storyboards within projects
3. Adding shots to storyboards
4. Generating images for each shot using Imagen 4 (or uploading images)
5. Generating 8-second videos from those images using Veo 3
6. Assembling all shot videos into a final movie using FFmpeg.wasm

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: SQLite via better-sqlite3
- **Image Generation**: Google Imagen 4 (`imagen-4.0-generate-001`)
- **Video Generation**: Google Veo 3 (`veo-3.0-generate-001`)
- **Video Assembly**: FFmpeg.wasm (browser-based)
- **Styling**: Tailwind CSS

## Project Structure

```
app/
├── page.tsx                    # Workspace page (projects list)
├── project/[id]/page.tsx       # Project page (storyboards list)
├── storyboard/[id]/page.tsx    # Storyboard editor (shots)
├── components/
│   ├── ProjectCard.tsx         # Project card for workspace
│   ├── StoryboardCard.tsx      # Storyboard card for project page
│   └── ShotCard.tsx            # Shot card with image/video controls
├── actions/
│   ├── gemini-actions.ts       # Imagen & Veo API integration
│   ├── project-actions.ts      # Project & storyboard CRUD
│   └── shot-actions.ts         # Shot CRUD & media handling
├── lib/
│   ├── db.ts                   # SQLite database setup & schema
│   ├── media.ts                # Media file storage utilities
│   ├── video-assembler.ts      # FFmpeg.wasm video concatenation
│   └── data/
│       ├── projects.ts         # Project data access
│       ├── storyboards.ts      # Storyboard data access
│       └── shots.ts            # Shot data access
└── api/
    └── media/[...path]/route.ts  # API route to serve media files
```

## Database Schema

Three tables with cascade deletes:
- **projects**: id, name, created_at, updated_at
- **storyboards**: id, project_id (FK), name, created_at, updated_at
- **shots**: id, storyboard_id (FK), order, duration, image_prompt, image_path, video_prompt, video_path, status, created_at, updated_at

## Media Storage

- Images saved to `media/images/{shot-id}.{ext}`
- Videos saved to `media/videos/{shot-id}.{ext}`
- Database stores relative paths, API route serves files
- Cache-busting timestamps added to URLs for regeneration

## Key Implementation Details

### Veo 3 API
- Uses Long Running Operations (LRO) pattern with polling
- 5-minute timeout, 10-second poll intervals
- Fixed 8-second video duration (no duration parameter)
- Requires image as base64 for image-to-video generation

### Image Handling
- Images stored on disk, not in database
- `getShotImageBase64()` reads file and converts to base64 for Veo API
- Copy feature allows reusing images across shots

### Server Actions Body Size
- Configured in `next.config.ts` under `experimental.serverActions.bodySizeLimit: "10mb"`
- Required for base64 video data transfer

## Environment Variables

```env
GEMINI_API_KEY=your-api-key
IMAGEN_MODEL=imagen-4.0-generate-001  # optional, this is default
VEO_MODEL=veo-3.0-generate-001        # optional, this is default
```

## Local Data

Both `/data/` (SQLite) and `/media/` (images/videos) are gitignored for local-only storage.

## Commands

```bash
yarn dev      # Start development server
yarn build    # Production build
```
