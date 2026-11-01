import { expect, it, vi } from "vitest";
import { createProjectDocumentCommands } from "./project-document-commands";

it("treats cancelled file dialogs as no change and refuses switching after work starts during a dialog", async () => {
  let idle = true;
  const documents = {
    current: () => null,
    recent: () => [],
    legacy: () => [],
    save: vi.fn(),
    create: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    saveAs: vi.fn(),
    importLegacy: vi.fn(),
  };
  const commands = createProjectDocumentCommands({
    documents,
    chooseOpen: async () => null,
    chooseSave: async () => {
      idle = false;
      return "/tmp/Film.showbiz";
    },
    canSwitch: () => idle,
    changed: vi.fn(),
    beginSave: () => () => {},
  });
  expect(await commands.open_project_document()).toEqual({
    ok: true,
    value: null,
  });
  expect(await commands.create_project_document()).toMatchObject({
    ok: false,
    error: { code: "BUSY" },
  });
  expect(documents.create).not.toHaveBeenCalled();
  expect(await commands.close_project_document()).toMatchObject({
    ok: false,
    error: { code: "BUSY" },
  });
  expect(documents.close).not.toHaveBeenCalled();
});

it("reports a failed package save instead of acknowledging only the project name", async()=>{
 const current={read_only:false,file_path:"/Films/Film.showbiz",project_id:"film",name:"Film"};
 const save=vi.fn(async()=>({ok:false as const,error:{code:"DOCUMENT_ERROR",message:"Disk full"}}));
 const commands=createProjectDocumentCommands({documents:{current:()=>current,recent:()=>[],legacy:()=>[],create:vi.fn(),open:vi.fn(),close:vi.fn(),saveAs:vi.fn(),importLegacy:vi.fn(),save},chooseOpen:async()=>null,chooseSave:async()=>null,canSwitch:()=>true,changed:vi.fn(),beginSave:()=>()=>{}});
 expect(await commands.save_project_document()).toEqual({ok:false,error:{code:"DOCUMENT_ERROR",message:"Disk full"}});
});
