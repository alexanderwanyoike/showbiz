# Storyboard packages

Use **Export ZIP** for a portable media download, or **Export for Forgecut** for an `.sbz` package accepted by Forgecut's Import Media action. Both are standard ZIP archives with the same contents. Export includes the current image, optional end frame and current video for every shot with media. Shots without generated media remain in the manifest. Generation history, API keys and application settings are not included.

`storyboard.json` contains:

```json
{
  "format": "showbiz-storyboard",
  "version": 1,
  "storyboard": { "id": "sb-1", "name": "Opening" },
  "shots": [
    {
      "id": "shot-1",
      "order": 1,
      "duration": 8,
      "media": [
        { "role": "image", "path": "shots/0001/image.png" },
        { "role": "video", "path": "shots/0001/video.mp4" }
      ]
    }
  ]
}
```

Duration is in seconds. Roles are `image`, `end_frame` and `video`. Files retain their source format and are ordered by storyboard order, with numeric directories allocated during export. No field instructs an editor to place media on a timeline.

The implementation follows [yazl](https://github.com/thejoshwolfe/yazl)'s streaming file-entry pattern (MIT). Video files are stored without redundant compression; a temporary sibling archive is renamed only after completion. Missing media or unsafe source paths fail the export without replacing an existing destination. Source paths resolve within the application's media directory, including after resolving symlinks.

Forgecut's matching importer validates version 1, extracts to durable application media storage and publishes its Assets changes as one undoable operation. It leaves sequences untouched.
