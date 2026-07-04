import type { DatabaseSync } from "node:sqlite";
import { generateId } from "../db";

export interface TimelineTrack {
  id: string;
  storyboard_id: string;
  track_id: string;
  name: string;
  track_type: string;
  position: number;
  created_at: string;
}

export interface TimelineClipRow {
  id: string;
  storyboard_id: string;
  shot_id: string;
  track_id: string;
  start_time: number;
  /** Trim window in source-file seconds; null = untrimmed (full clip) */
  trim_in: number | null;
  trim_out: number | null;
  /** Pinned video version; null = follow the shot's current version */
  video_version_id: string | null;
  created_at: string;
}

const CLIP_COLUMNS =
  "id, storyboard_id, shot_id, track_id, start_time, trim_in, trim_out, video_version_id, created_at";

/**
 * Validate a clip trim window. Trims are in source-file seconds; the upper
 * bound is the real video duration, which only the frontend knows, so it is
 * clamped there. Mirrors validate_clip_trims in timeline.rs.
 */
export function validateClipTrims(trimIn: number, trimOut: number): void {
  if (trimIn < 0.0 || trimIn >= trimOut) {
    throw new Error("Invalid trim values");
  }
  if (trimOut - trimIn < 0.5) {
    throw new Error("Minimum clip duration is 0.5 seconds");
  }
}

/** Ported timeline commands; names and JSON shapes match the retired Rust backend's commands/timeline.rs. */
export function createTimelineCommands(db: DatabaseSync) {
  function getTimelineTracks(storyboardId: string): TimelineTrack[] {
    return db
      .prepare(
        `SELECT id, storyboard_id, track_id, name, track_type, position, created_at
         FROM timeline_tracks WHERE storyboard_id = ? ORDER BY position`
      )
      .all(storyboardId) as unknown as TimelineTrack[];
  }

  function getTimelineClips(storyboardId: string): TimelineClipRow[] {
    return db
      .prepare(
        `SELECT ${CLIP_COLUMNS} FROM timeline_clips
         WHERE storyboard_id = ? ORDER BY track_id, start_time`
      )
      .all(storyboardId) as unknown as TimelineClipRow[];
  }

  function getClipById(id: string): TimelineClipRow {
    const row = db
      .prepare(`SELECT ${CLIP_COLUMNS} FROM timeline_clips WHERE id = ?`)
      .get(id) as TimelineClipRow | undefined;
    if (!row) {
      throw new Error("Clip not found");
    }
    return row;
  }

  function createTimelineTrack(storyboardId: string, trackType: string): TimelineTrack {
    if (trackType !== "video" && trackType !== "audio") {
      throw new Error("track_type must be 'video' or 'audio'");
    }

    const prefix = trackType === "video" ? "V" : "A";

    const existing = (
      db
        .prepare(
          "SELECT track_id FROM timeline_tracks WHERE storyboard_id = ? AND track_type = ?"
        )
        .all(storyboardId, trackType) as { track_id: string }[]
    ).map((r) => r.track_id);

    let maxNum = 0;
    for (const tid of existing) {
      if (tid.startsWith(prefix)) {
        const n = Number.parseInt(tid.slice(prefix.length), 10);
        if (Number.isInteger(n) && n > maxNum) {
          maxNum = n;
        }
      }
    }

    const trackId = `${prefix}${maxNum + 1}`;
    const name = trackId;

    const { max_position: maxPosition } = db
      .prepare(
        "SELECT COALESCE(MAX(position), -1) AS max_position FROM timeline_tracks WHERE storyboard_id = ?"
      )
      .get(storyboardId) as { max_position: number };

    const position = maxPosition + 1;
    const id = generateId("track");

    db.prepare(
      `INSERT INTO timeline_tracks (id, storyboard_id, track_id, name, track_type, position)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, storyboardId, trackId, name, trackType, position);

    return db
      .prepare(
        `SELECT id, storyboard_id, track_id, name, track_type, position, created_at
         FROM timeline_tracks WHERE id = ?`
      )
      .get(id) as unknown as TimelineTrack;
  }

  function deleteTimelineTrack(id: string): boolean {
    const track = db
      .prepare("SELECT storyboard_id, track_type, track_id FROM timeline_tracks WHERE id = ?")
      .get(id) as
      | { storyboard_id: string; track_type: string; track_id: string }
      | undefined;

    if (!track) {
      // Deliberate deviation: Rust surfaces rusqlite's incidental
      // "Query returned no rows" here; no caller matches on the text.
      throw new Error("Track not found");
    }

    if (track.track_type === "video") {
      const { n: videoCount } = db
        .prepare(
          "SELECT COUNT(*) AS n FROM timeline_tracks WHERE storyboard_id = ? AND track_type = 'video'"
        )
        .get(track.storyboard_id) as { n: number };

      if (videoCount <= 1) {
        throw new Error("Cannot delete the last video track");
      }
    }

    db.prepare(
      "DELETE FROM timeline_clips WHERE storyboard_id = ? AND track_id = ?"
    ).run(track.storyboard_id, track.track_id);

    const { changes } = db
      .prepare("DELETE FROM timeline_tracks WHERE id = ?")
      .run(id);

    return Number(changes) > 0;
  }

  function ensureDefaultTracks(storyboardId: string): TimelineTrack[] {
    const existing = getTimelineTracks(storyboardId);
    if (existing.length > 0) {
      return existing;
    }

    createTimelineTrack(storyboardId, "video");
    createTimelineTrack(storyboardId, "audio");

    return getTimelineTracks(storyboardId);
  }

  function addTimelineClip(
    storyboardId: string,
    shotId: string,
    trackId: string,
    startTime: number,
    videoVersionId: string | null
  ): TimelineClipRow {
    const id = generateId("clip");

    db.prepare(
      `INSERT INTO timeline_clips (id, storyboard_id, shot_id, track_id, start_time, video_version_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, storyboardId, shotId, trackId, startTime, videoVersionId ?? null);

    return getClipById(id);
  }

  function updateTimelineClipTrims(
    clipId: string,
    trimIn: number,
    trimOut: number
  ): TimelineClipRow {
    validateClipTrims(trimIn, trimOut);

    const { changes } = db
      .prepare("UPDATE timeline_clips SET trim_in = ?, trim_out = ? WHERE id = ?")
      .run(trimIn, trimOut, clipId);

    if (Number(changes) === 0) {
      throw new Error("Clip not found");
    }
    return getClipById(clipId);
  }

  function splitTimelineClip(
    clipId: string,
    splitLocalTime: number,
    secondStartTime: number
  ): [TimelineClipRow, TimelineClipRow] {
    const original = getClipById(clipId);

    const firstIn = original.trim_in ?? 0.0;
    validateClipTrims(firstIn, splitLocalTime);
    if (original.trim_out !== null) {
      validateClipTrims(splitLocalTime, original.trim_out);
    }

    const secondId = generateId("clip");

    db.exec("BEGIN");
    try {
      db.prepare(
        "UPDATE timeline_clips SET trim_in = ?, trim_out = ? WHERE id = ?"
      ).run(firstIn, splitLocalTime, clipId);

      db.prepare(
        `INSERT INTO timeline_clips (id, storyboard_id, shot_id, track_id, start_time, trim_in, trim_out, video_version_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        secondId,
        original.storyboard_id,
        original.shot_id,
        original.track_id,
        secondStartTime,
        splitLocalTime,
        original.trim_out,
        original.video_version_id
      );

      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    return [getClipById(clipId), getClipById(secondId)];
  }

  function removeTimelineClip(id: string): boolean {
    const { changes } = db
      .prepare("DELETE FROM timeline_clips WHERE id = ?")
      .run(id);
    return Number(changes) > 0;
  }

  function moveTimelineClip(
    clipId: string,
    targetTrackId: string,
    startTime: number
  ): void {
    const { changes } = db
      .prepare("UPDATE timeline_clips SET track_id = ?, start_time = ? WHERE id = ?")
      .run(targetTrackId, startTime, clipId);

    if (Number(changes) === 0) {
      throw new Error("Clip not found");
    }
  }

  function removeAllTimelineClips(storyboardId: string): boolean {
    const { changes } = db
      .prepare("DELETE FROM timeline_clips WHERE storyboard_id = ?")
      .run(storyboardId);
    return Number(changes) > 0;
  }

  return {
    get_timeline_tracks(args?: Record<string, unknown>): TimelineTrack[] {
      return getTimelineTracks(args!.storyboardId as string);
    },
    create_timeline_track(args?: Record<string, unknown>): TimelineTrack {
      return createTimelineTrack(
        args!.storyboardId as string,
        args!.trackType as string
      );
    },
    delete_timeline_track(args?: Record<string, unknown>): boolean {
      return deleteTimelineTrack(args!.id as string);
    },
    ensure_default_tracks(args?: Record<string, unknown>): TimelineTrack[] {
      return ensureDefaultTracks(args!.storyboardId as string);
    },
    get_timeline_clips(args?: Record<string, unknown>): TimelineClipRow[] {
      return getTimelineClips(args!.storyboardId as string);
    },
    add_timeline_clip(args?: Record<string, unknown>): TimelineClipRow {
      return addTimelineClip(
        args!.storyboardId as string,
        args!.shotId as string,
        args!.trackId as string,
        args!.startTime as number,
        (args!.videoVersionId as string | null | undefined) ?? null
      );
    },
    remove_timeline_clip(args?: Record<string, unknown>): boolean {
      return removeTimelineClip(args!.id as string);
    },
    remove_all_timeline_clips(args?: Record<string, unknown>): boolean {
      return removeAllTimelineClips(args!.storyboardId as string);
    },
    move_timeline_clip(args?: Record<string, unknown>): void {
      return moveTimelineClip(
        args!.clipId as string,
        args!.targetTrackId as string,
        args!.startTime as number
      );
    },
    update_timeline_clip_trims(args?: Record<string, unknown>): TimelineClipRow {
      return updateTimelineClipTrims(
        args!.clipId as string,
        args!.trimIn as number,
        args!.trimOut as number
      );
    },
    split_timeline_clip(
      args?: Record<string, unknown>
    ): [TimelineClipRow, TimelineClipRow] {
      return splitTimelineClip(
        args!.clipId as string,
        args!.splitLocalTime as number,
        args!.secondStartTime as number
      );
    },
  };
}
