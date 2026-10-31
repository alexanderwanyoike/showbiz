import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectDocument } from "../contexts/ProjectDocumentContext";
export function DocumentMenu() {
  const document = useProjectDocument();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="document-file-menu workspace-file-menu"
        disabled={document.busy}
      >
        File
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onSelect={() => {
            void document.action("new");
          }}
        >
          New Project…<DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void document.action("open");
          }}
        >
          Open Project…<DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!document.current}
          onSelect={() => {
            void document.action("save");
          }}
        >
          Save<DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!document.current}
          onSelect={() => {
            void document.action("save_as");
          }}
        >
          Save As…<DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!document.current}
          onSelect={() => {
            void document.action("close");
          }}
        >
          Close Project<DropdownMenuShortcut>Ctrl+Shift+W</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
