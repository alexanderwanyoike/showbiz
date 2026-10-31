import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { invoke } from "../lib/bridge";
import { applicationWork } from "../lib/application-work";
import { electronMediaUrlResolver } from "../lib/electron-media-url";
import type {
  DocumentResult,
  ProjectDocumentState,
} from "../../shared/project-document";

const empty: ProjectDocumentState = { current: null, recent: [], legacy: [] };
export type DocumentAction = "new" | "open" | "save" | "save_as" | "close";
const commands: Record<DocumentAction, string> = {
  new: "create_project_document",
  open: "open_project_document",
  save: "save_project_document",
  save_as: "save_project_document_as",
  close: "close_project_document",
};
function useDocumentController() {
  const [state, setState] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const file = useRef<string | null>(null);
  const pending = useRef(false);
  const accept = useCallback(
    (next: ProjectDocumentState) => {
      const changed = file.current !== (next.current?.file_path ?? null);
      file.current = next.current?.file_path ?? null;
      setState(next);
      if (changed) {
        electronMediaUrlResolver.invalidateAll();
        navigate(next.current ? `/project/${next.current.project_id}` : "/", {
          replace: true,
        });
      }
    },
    [navigate],
  );
  const refresh = useCallback(async () => {
    try {
      const result = await invoke<DocumentResult<ProjectDocumentState>>(
        "get_project_document_state",
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      accept(result.value);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [accept]);
  const execute = useCallback(
    async (command: string, args?: Record<string, unknown>) => {
      const work = applicationWork.getStatus();
      if (pending.current) return;
      if (work.active.length || work.unsaved.length || work.closing) {
        setError(
          "Finish generation, saving and unsaved edits before changing project files.",
        );
        return;
      }
      pending.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await invoke<DocumentResult<unknown>>(command, args);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        await refresh();
      } catch (cause) {
        setError(String(cause));
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  const action = useCallback(
    (kind: DocumentAction) => execute(commands[kind]),
    [execute],
  );
  useEffect(() => {
    void refresh();
    const stopDocument = window.showbiz?.onProjectDocument?.(() => {
      void refresh();
    });
    const stopAction = window.showbiz?.onDocumentAction?.((kind) => {
      void action(kind);
    });
    const changed = () => {
      void refresh();
    };
    window.addEventListener("showbiz:project-changed", changed);
    return () => {
      stopDocument?.();
      stopAction?.();
      window.removeEventListener("showbiz:project-changed", changed);
    };
  }, [refresh, action]);
  return {
    ...state,
    loading,
    busy,
    error,
    dismissError: () => setError(null),
    action,
    openRecent: (file_path: string) =>
      execute("open_project_document", { file_path }),
    importLegacy: (project_id: string) =>
      execute("import_legacy_project", { project_id }),
  };
}
type DocumentController = ReturnType<typeof useDocumentController>;
const Context = createContext<DocumentController | null>(null);
export function ProjectDocumentProvider({ children }: { children: ReactNode }) {
  return (
    <Context.Provider value={useDocumentController()}>
      {children}
    </Context.Provider>
  );
}
export function useProjectDocument() {
  const value = useContext(Context);
  if (!value) throw new Error("Project document context is unavailable.");
  return value;
}
