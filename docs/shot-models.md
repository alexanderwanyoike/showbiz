# Shot models and storyboard defaults

Open Shot controls to choose the image and video models for the selected shot. The storyboard toolbar keeps navigation, the shot count and export.

Every shot initially inherits the storyboard defaults. Choose another model to override only that shot. Choose **Use storyboard default** in either picker to restore inheritance for that model. Image and video choices are independent. Expand **Storyboard defaults** to change the models used by inherited and newly created shots. An explicit shot override survives later default changes.

New storyboards start with Nano Banana 2 and Seedance 2.0, both enabled in the maintained model registry. Existing storyboard choices are retained. A model change affects the next generation; it does not replace existing frames or video takes.

Choices save with the project. Generation waits for a model save to finish, and a failed save reports an error while keeping the previous choice. The video settings reset to the effective model's defaults when that model changes, so a previous model's settings are not reused accidentally.

## Implementation pattern

Nullable shot overrides inherit the storyboard's existing model settings. This follows the established default-and-override property pattern; the interface composes the existing searchable ModelPicker built with Radix Popover and cmdk. No new UI dependency or provider implementation is added. Their existing MIT licences remain applicable.

Migration 03 adds nullable shot model columns without rewriting the shipped migrations or changing existing media. `set_shot_models` returns a typed success/failure result and validates both changes before writing either. Model IDs are resolved for the target shot before an image, edit or video generation request starts.
