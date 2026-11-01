import type {
  ProjectDocumentInfo,
  RecentProjectDocument,
  DocumentResult,
} from "../shared/project-document";

type DocumentOperation = Promise<DocumentResult<ProjectDocumentInfo | null>>;
interface Documents {
  warning?(): string | null;
  current(): ProjectDocumentInfo | null;
  save(): DocumentOperation;
  recent(): RecentProjectDocument[];
  legacy(): { id: string; name: string }[];
  create(path: string): DocumentOperation;
  open(path: string): DocumentOperation;
  close(): DocumentResult<null> | Promise<DocumentResult<null>>;
  saveAs(path: string): DocumentOperation;
  importLegacy(id: string, path: string): DocumentOperation;
}
export function createProjectDocumentCommands(options: {
  documents: Documents;
  chooseOpen: () => Promise<string | null>;
  chooseSave: (name: string) => Promise<string | null>;
  canSwitch: () => boolean;
  changed: (info: ProjectDocumentInfo | null) => void;
  beginSave: () => () => void;
}) {
  let pending = false;
  const busy: DocumentResult<never> = {
    ok: false,
    error: {
      code: "BUSY",
      message:
        "Finish generation, saving and unsaved edits before changing project files.",
    },
  };
  async function run(operation: () => DocumentOperation): DocumentOperation {
    if (pending || !options.canSwitch()) return busy;
    pending = true;
    try {
      return await operation();
    } catch (cause) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_ERROR",
          message: cause instanceof Error ? cause.message : String(cause),
        },
      };
    } finally {
      pending = false;
    }
  }
  async function change(operation: () => DocumentOperation | DocumentResult<null>): DocumentOperation {
    if (!options.canSwitch()) return busy;
    const end = options.beginSave();
    try {
      const result = await operation();
      if (result.ok) options.changed(result.value);
      return result;
    } finally {
      end();
    }
  }
  const savePath = async (name: string) => {
    const chosen = await options.chooseSave(name);
    return chosen && !chosen.toLowerCase().endsWith(".showbiz")
      ? `${chosen}.showbiz`
      : chosen;
  };
  return {
    get_project_document_state: () => ({
      ok: true as const,
      value: {
        current: options.documents.current(),
        recent: options.documents.recent(),
        legacy: options.documents.legacy(),
        warning: options.documents.warning?.() ?? null,
      },
    }),
    create_project_document: () =>
      run(async () => {
        const file = await savePath("Untitled.showbiz");
        return file
          ? change(() => options.documents.create(file))
          : { ok: true, value: null };
      }),
    open_project_document: (args?: Record<string, unknown>) =>
      run(async () => {
        const file =
          typeof args?.file_path === "string"
            ? args.file_path
            : await options.chooseOpen();
        return file
          ? change(() => options.documents.open(file))
          : { ok: true, value: null };
      }),
    close_project_document: () =>
      run(() => change(() => options.documents.close())),
    save_project_document: () =>
      run(async () => {
        const current = options.documents.current();
        return current
          ? change(() => options.documents.save())
          : {
              ok: false,
              error: {
                code: "NO_PROJECT",
                message: "Open or create a project first.",
              },
            };
      }),
    save_project_document_as: () =>
      run(async () => {
        const current = options.documents.current();
        if (!current)
          return {
            ok: false,
            error: {
              code: "NO_PROJECT",
              message: "Open or create a project first.",
            },
          };
        const file = await savePath(`${current.name} copy.showbiz`);
        return file
          ? change(() => options.documents.saveAs(file))
          : { ok: true, value: null };
      }),
    import_legacy_project: (args?: Record<string, unknown>) =>
      run(async () => {
        const project = options.documents
          .legacy()
          .find((item) => item.id === args?.project_id);
        if (!project)
          return {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "The existing project was not found.",
            },
          };
        const file = await savePath(
          `${project.name.replace(/[/\\]/g, "-")}.showbiz`,
        );
        return file
          ? change(() => options.documents.importLegacy(project.id, file))
          : { ok: true, value: null };
      }),
  };
}
