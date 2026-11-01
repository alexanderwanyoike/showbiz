import type { Result } from "../shared/result";

export interface LinuxDesktopIntegrationOptions {
  platform: NodeJS.Platform;
  packaged: boolean;
  appImage?: string | undefined;
  dataHome?: string | undefined;
  home: string;
  icon: string;
}

export async function integrateLinuxDesktop(
  _options: LinuxDesktopIntegrationOptions,
): Promise<Result<null>> {
  return { ok: true, value: null };
}
