export interface AccountingNotice {
  project_id: string;
  subject_id?: string;
  kind_family: "image" | "video";
  request_id: string;
  warnings: string[];
  started: boolean;
}
const notices = new Map<string, AccountingNotice>();
const identity = (projectId: string, subjectId: string | undefined, family: string) =>
  JSON.stringify([projectId, subjectId ?? null, family]);

export function retainAccountingNotice(notice: AccountingNotice) {
  const key = identity(notice.project_id, notice.subject_id, notice.kind_family);
  const previous = notices.get(key);
  if (!notice.started && previous && previous.request_id !== notice.request_id) return;
  notices.delete(key);
  notices.set(key, { ...notice, warnings: [...notice.warnings] });
  while (notices.size > 500) {
    const oldest = notices.keys().next().value;
    if (oldest !== undefined) notices.delete(oldest);
  }
}
export function getAccountingNotice(projectId: string, subjectId: string | undefined, family: string) {
  return notices.get(identity(projectId, subjectId, family));
}
