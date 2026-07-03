import { describe, it, expect } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openTestDb } from "../db.test";
import { generateId } from "../db";
import { createTimelineCommands, validateClipTrims } from "./timeline";

// --- Test fixtures (mirror the Rust setup_storyboard / insert_shot helpers) ---

function setupStoryboard(db: DatabaseSync): { projId: string; sbId: string } {
  const projId = generateId("proj");
  db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(projId, "Test");
  const sbId = generateId("sb");
  db.prepare(
    "INSERT INTO storyboards (id, project_id, name) VALUES (?, ?, ?)"
  ).run(sbId, projId, "SB");
  return { projId, sbId };
}

function insertShot(db: DatabaseSync, sbId: string): string {
  const shotId = generateId("shot");
  db.prepare(
    `INSERT INTO shots (id, storyboard_id, "order", status) VALUES (?, ?, 1, 'complete')`
  ).run(shotId, sbId);
  return shotId;
}

function insertVideoVersion(db: DatabaseSync, shotId: string, n: number): string {
  const versionId = generateId("vver");
  db.prepare(
    `INSERT INTO video_versions (id, shot_id, version_number, edit_type, video_path, is_current)
     VALUES (?, ?, ?, 'generation', ?, 0)`
  ).run(versionId, shotId, n, `videos/${shotId}-v${n}.mp4`);
  return versionId;
}

// --- validate_clip_trims tests ---

describe("validateClipTrims", () => {
  it("valid_trim_range", () => {
    expect(() => validateClipTrims(1.0, 5.0)).not.toThrow();
  });

  it("valid_trims_have_no_upper_cap", () => {
    expect(() => validateClipTrims(0.0, 12.0)).not.toThrow();
  });

  it("valid_minimum_duration", () => {
    expect(() => validateClipTrims(0.0, 0.5)).not.toThrow();
  });

  it("invalid_negative_trim_in", () => {
    expect(() => validateClipTrims(-1.0, 5.0)).toThrow();
  });

  it("invalid_reversed_or_equal_trims", () => {
    expect(() => validateClipTrims(5.0, 5.0)).toThrow();
    expect(() => validateClipTrims(6.0, 3.0)).toThrow();
  });

  it("invalid_below_min_duration", () => {
    expect(() => validateClipTrims(3.0, 3.4)).toThrow(/Minimum clip duration/);
  });
});

// --- Timeline Tracks & Clips tests ---

describe("timeline tracks and clips", () => {
  it("ensure_default_tracks_creates_v1_a1", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const cmds = createTimelineCommands(db);

    const tracks = cmds.ensure_default_tracks({ storyboardId: sbId });
    expect(tracks.length).toBe(2);
    expect(tracks[0].track_id).toBe("V1");
    expect(tracks[0].track_type).toBe("video");
    expect(tracks[1].track_id).toBe("A1");
    expect(tracks[1].track_type).toBe("audio");
  });

  it("ensure_default_tracks_idempotent", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const cmds = createTimelineCommands(db);

    const tracks1 = cmds.ensure_default_tracks({ storyboardId: sbId });
    const tracks2 = cmds.ensure_default_tracks({ storyboardId: sbId });
    expect(tracks1.length).toBe(tracks2.length);
    expect(tracks1[0].id).toBe(tracks2[0].id);
    expect(tracks1[1].id).toBe(tracks2[1].id);
  });

  it("create_track_auto_increments", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const cmds = createTimelineCommands(db);

    const v1 = cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    const v2 = cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    const a1 = cmds.create_timeline_track({ storyboardId: sbId, trackType: "audio" });
    const a2 = cmds.create_timeline_track({ storyboardId: sbId, trackType: "audio" });

    expect(v1.track_id).toBe("V1");
    expect(v2.track_id).toBe("V2");
    expect(a1.track_id).toBe("A1");
    expect(a2.track_id).toBe("A2");
  });

  it("delete_track_refuses_last_video", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const cmds = createTimelineCommands(db);

    const v1 = cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    expect(() => cmds.delete_timeline_track({ id: v1.id })).toThrow(
      /Cannot delete the last video track/
    );
  });

  it("delete_track_allows_when_multiple_video", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const cmds = createTimelineCommands(db);

    cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    const v2 = cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    expect(cmds.delete_timeline_track({ id: v2.id })).toBe(true);
  });

  it("delete_track_cascades_clips", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    const v2 = cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: v2.track_id,
      startTime: 0.0,
      videoVersionId: null,
    });

    expect(cmds.get_timeline_clips({ storyboardId: sbId }).length).toBe(1);

    cmds.delete_timeline_track({ id: v2.id });

    expect(cmds.get_timeline_clips({ storyboardId: sbId }).length).toBe(0);
  });

  it("add_and_remove_clip", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    expect(clip.shot_id).toBe(shotId);
    expect(clip.track_id).toBe("V1");
    expect(clip.start_time).toBe(0.0);

    const shotId2 = insertShot(db, sbId);
    const clip2 = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId: shotId2,
      trackId: "V1",
      startTime: 8.0,
      videoVersionId: null,
    });
    expect(clip2.start_time).toBe(8.0);

    expect(cmds.remove_timeline_clip({ id: clip.id })).toBe(true);

    const remaining = cmds.get_timeline_clips({ storyboardId: sbId });
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(clip2.id);
  });

  it("cascade_delete_storyboard_removes_tracks_and_clips", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    cmds.create_timeline_track({ storyboardId: sbId, trackType: "video" });
    cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });

    db.prepare("DELETE FROM storyboards WHERE id = ?").run(sbId);

    expect(cmds.get_timeline_tracks({ storyboardId: sbId }).length).toBe(0);
    expect(cmds.get_timeline_clips({ storyboardId: sbId }).length).toBe(0);
  });

  it("move_clip_changes_start_time", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const s1 = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const c1 = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId: s1,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    expect(c1.start_time).toBe(0.0);

    cmds.move_timeline_clip({ clipId: c1.id, targetTrackId: "V1", startTime: 5.5 });

    const clips = cmds.get_timeline_clips({ storyboardId: sbId });
    expect(clips[0].start_time).toBe(5.5);
  });

  it("move_clip_cross_track", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const s1 = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const c1 = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId: s1,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });

    cmds.move_timeline_clip({ clipId: c1.id, targetTrackId: "V2", startTime: 3.0 });

    const clips = cmds.get_timeline_clips({ storyboardId: sbId });
    expect(clips[0].track_id).toBe("V2");
    expect(clips[0].start_time).toBe(3.0);
  });

  it("move_clip_not_found", () => {
    const db = openTestDb();
    const cmds = createTimelineCommands(db);
    expect(() =>
      cmds.move_timeline_clip({ clipId: "nonexistent", targetTrackId: "V1", startTime: 0.0 })
    ).toThrow(/Clip not found/);
  });

  it("add_clip_with_start_time", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const s1 = insertShot(db, sbId);
    const s2 = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const c1 = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId: s1,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    const c2 = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId: s2,
      trackId: "V1",
      startTime: 10.0,
      videoVersionId: null,
    });

    expect(c1.start_time).toBe(0.0);
    expect(c2.start_time).toBe(10.0);

    const clips = cmds.get_timeline_clips({ storyboardId: sbId });
    expect(clips[0].start_time).toBe(0.0);
    expect(clips[1].start_time).toBe(10.0);
  });

  it("cascade_delete_on_shot", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });

    db.prepare("DELETE FROM shots WHERE id = ?").run(shotId);

    const row = db
      .prepare("SELECT COUNT(*) AS n FROM timeline_clips WHERE shot_id = ?")
      .get(shotId) as { n: number };
    expect(row.n).toBe(0);
  });

  // --- Per-clip trims, version pins, split ---

  it("new_clips_default_to_untrimmed_and_unpinned", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    expect(clip.trim_in).toBe(null);
    expect(clip.trim_out).toBe(null);
    expect(clip.video_version_id).toBe(null);
  });

  it("add_clip_with_pinned_version", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const versionId = insertVideoVersion(db, shotId, 2);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: versionId,
    });
    expect(clip.video_version_id).toBe(versionId);
  });

  it("update_clip_trims_persists", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    const updated = cmds.update_timeline_clip_trims({
      clipId: clip.id,
      trimIn: 1.5,
      trimOut: 6.0,
    });
    expect(updated.trim_in).toBe(1.5);
    expect(updated.trim_out).toBe(6.0);

    const fetched = cmds.get_timeline_clips({ storyboardId: sbId });
    expect(fetched[0].trim_in).toBe(1.5);
    expect(fetched[0].trim_out).toBe(6.0);
  });

  it("update_clip_trims_rejects_invalid", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    expect(() =>
      cmds.update_timeline_clip_trims({ clipId: clip.id, trimIn: 5.0, trimOut: 3.0 })
    ).toThrow();
    expect(() =>
      cmds.update_timeline_clip_trims({ clipId: "missing", trimIn: 0.0, trimOut: 5.0 })
    ).toThrow();
  });

  it("same_shot_twice_with_independent_trims", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const c1 = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    const c2 = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 10.0,
      videoVersionId: null,
    });

    cmds.update_timeline_clip_trims({ clipId: c1.id, trimIn: 0.0, trimOut: 3.0 });
    cmds.update_timeline_clip_trims({ clipId: c2.id, trimIn: 4.0, trimOut: 8.0 });

    const clips = cmds.get_timeline_clips({ storyboardId: sbId });
    expect(clips[0].trim_out).toBe(3.0);
    expect(clips[1].trim_in).toBe(4.0);
  });

  it("split_clip_produces_two_adjacent_pieces", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const versionId = insertVideoVersion(db, shotId, 1);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 2.0,
      videoVersionId: versionId,
    });
    cmds.update_timeline_clip_trims({ clipId: clip.id, trimIn: 1.0, trimOut: 7.0 });

    const [first, second] = cmds.split_timeline_clip({
      clipId: clip.id,
      splitLocalTime: 4.0,
      secondStartTime: 5.0,
    });

    expect(first.id).toBe(clip.id);
    expect(first.trim_in).toBe(1.0);
    expect(first.trim_out).toBe(4.0);
    expect(first.start_time).toBe(2.0);

    expect(second.trim_in).toBe(4.0);
    expect(second.trim_out).toBe(7.0);
    expect(second.start_time).toBe(5.0);
    expect(second.track_id).toBe("V1");
    expect(second.shot_id).toBe(shotId);
    expect(second.video_version_id).toBe(versionId);
  });

  it("split_untrimmed_clip_leaves_open_ended_second_piece", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    const [first, second] = cmds.split_timeline_clip({
      clipId: clip.id,
      splitLocalTime: 3.0,
      secondStartTime: 3.0,
    });

    expect(first.trim_in).toBe(0.0);
    expect(first.trim_out).toBe(3.0);
    expect(second.trim_in).toBe(3.0);
    expect(second.trim_out).toBe(null);
  });

  it("split_rejects_points_too_close_to_edges", () => {
    const db = openTestDb();
    const { sbId } = setupStoryboard(db);
    const shotId = insertShot(db, sbId);
    const cmds = createTimelineCommands(db);

    const clip = cmds.add_timeline_clip({
      storyboardId: sbId,
      shotId,
      trackId: "V1",
      startTime: 0.0,
      videoVersionId: null,
    });
    cmds.update_timeline_clip_trims({ clipId: clip.id, trimIn: 1.0, trimOut: 7.0 });

    // First piece would be 0.2s
    expect(() =>
      cmds.split_timeline_clip({ clipId: clip.id, splitLocalTime: 1.2, secondStartTime: 0.2 })
    ).toThrow();
    // Second piece would be 0.3s
    expect(() =>
      cmds.split_timeline_clip({ clipId: clip.id, splitLocalTime: 6.7, secondStartTime: 5.7 })
    ).toThrow();
    // Original untouched
    const clips = cmds.get_timeline_clips({ storyboardId: sbId });
    expect(clips.length).toBe(1);
    expect(clips[0].trim_out).toBe(7.0);
  });

  it("split_missing_clip_errors", () => {
    const db = openTestDb();
    const cmds = createTimelineCommands(db);
    expect(() =>
      cmds.split_timeline_clip({ clipId: "missing", splitLocalTime: 3.0, secondStartTime: 3.0 })
    ).toThrow(/Clip not found/);
  });
});
