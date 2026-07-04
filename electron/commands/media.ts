/**
 * Media path command; name and return shape predate the Electron port.
 * `mediaBaseDir` is the appDataDir/media path.
 */
export function createMediaCommands(mediaBaseDir: string) {
  return {
    get_media_path(): string {
      return mediaBaseDir;
    },
  };
}
