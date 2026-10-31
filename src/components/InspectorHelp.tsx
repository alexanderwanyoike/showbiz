import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkspaceCommand } from "./WorkspaceCommand";

export function InspectorHelp({label,children}:{label:string;children:ReactNode}) {
  return <Popover><PopoverTrigger asChild><WorkspaceCommand label={label} className="inspector-help-command"><CircleHelp size={14}/></WorkspaceCommand></PopoverTrigger><PopoverContent align="end" className="inspector-help-content"><p>{children}</p></PopoverContent></Popover>;
}
