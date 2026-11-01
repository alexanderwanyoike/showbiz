# Shot models and storyboard defaults

Open Shot controls to choose the image and video models for the selected shot. The storyboard toolbar keeps navigation, the shot count and export.

Every shot initially inherits the storyboard defaults. Choose another model to override only that shot. Choose **Use storyboard default** in either picker to restore inheritance for that model. Image and video choices are independent. Open **Storyboard settings** to change the models used by inherited and newly created shots. An explicit shot override survives later default changes.

New storyboards start with Nano Banana 2 and Seedance 2.0, both enabled in the maintained model registry. Existing storyboard choices are retained. A model change affects the next generation; it does not replace existing frames or video takes.

Choices save with the project. Generation waits for a model save to finish, and a failed save reports an error while keeping the previous choice. Each shot stores one video-settings slot tagged with its model identity. Another model uses its own defaults, so incompatible settings are not reused. Saving settings for that model replaces the prior tagged slot; switching back does not restore a separate saved profile. Independent shots can save their settings concurrently. Agent updates remove drafts for deleted shots or changed models.

Image generation and frame edits wait for pending model changes to save. Their labels and requests use the target shot's persisted model. Background refreshes preserve open editors and drafts; a failed refresh offers Retry and blocks generation until current data is available.

Stop Waiting ends local observation without changing provider work or the saved status of the existing take. Another request remains blocked until that request finishes. Late completion reloads the actual shot and its takes. Take-history visibility is remembered separately for each shot, and a newly received take reveals its history.

## Implementation pattern

Nullable shot overrides inherit the storyboard's existing model settings. This follows the established default-and-override property pattern; the interface composes the existing searchable ModelPicker built with Radix Popover and cmdk. No new UI dependency or provider implementation is added. Their existing MIT licences remain applicable.

Migration 03 adds nullable shot model columns without rewriting the shipped migrations or changing existing media. `set_shot_models` returns a typed success/failure result and validates both changes before writing either. Model IDs are resolved for the target shot before an image, edit or video generation request starts.
