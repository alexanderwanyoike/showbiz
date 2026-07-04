export type CommandHandler = (args?: Record<string, unknown>) => unknown;
export type CommandMap = Record<string, CommandHandler>;

/**
 * Single dispatch point for the renderer's invoke(cmd, args) calls, keeping
 * call sites identical to Tauri's command names during the migration.
 */
export function createInvokeHandler(commands: CommandMap) {
  return async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
    const handler = commands[cmd];
    if (!handler) {
      throw new Error(`Command "${cmd}" is not yet ported to the Electron shell`);
    }
    return handler(args);
  };
}
