export function connectAgentChanges() {
  return window.showbiz?.onDataChanged?.(() => window.dispatchEvent(new Event("showbiz:project-changed"))) ?? (() => {});
}
