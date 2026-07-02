-- Clips become first-class: trims move from the per-shot timeline_edits
-- table onto each timeline_clips row (NULL = untrimmed, full clip), and a
-- clip may pin a specific video version (NULL = follow the shot's current).

ALTER TABLE timeline_clips ADD COLUMN trim_in REAL;
ALTER TABLE timeline_clips ADD COLUMN trim_out REAL;
ALTER TABLE timeline_clips ADD COLUMN video_version_id TEXT
    REFERENCES video_versions(id) ON DELETE SET NULL;

-- Preserve existing trims by copying them onto the clips they applied to
UPDATE timeline_clips SET
    trim_in = (
        SELECT e.trim_in FROM timeline_edits e
        WHERE e.storyboard_id = timeline_clips.storyboard_id
          AND e.shot_id = timeline_clips.shot_id
    ),
    trim_out = (
        SELECT e.trim_out FROM timeline_edits e
        WHERE e.storyboard_id = timeline_clips.storyboard_id
          AND e.shot_id = timeline_clips.shot_id
    );

DROP INDEX IF EXISTS idx_timeline_edits_storyboard;
DROP TABLE timeline_edits;
