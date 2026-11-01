import { expect, it, vi } from "vitest";
interface ChangeBridge {onDataChanged(callback:()=>void):()=>void}
const state=vi.hoisted(()=>({bridge:undefined as ChangeBridge|undefined,listeners:new Map<string,(event:unknown)=>void>(),remove:vi.fn()}));
vi.mock("electron",()=>({contextBridge:{exposeInMainWorld:(_name:string,bridge:ChangeBridge)=>{state.bridge=bridge;}},ipcRenderer:{on:(channel:string,listener:(event:unknown)=>void)=>state.listeners.set(channel,listener),removeListener:state.remove,invoke:vi.fn()}}));
it("does not forward private Electron events through the data-change bridge",async()=>{
  await import("./preload");
  const callback=vi.fn();
  const unsubscribe=state.bridge!.onDataChanged(callback);
  const listener=state.listeners.get("showbiz:data_changed")!;
  listener({sender:{privateElectronObject:true}});
  expect(callback).toHaveBeenCalledExactlyOnceWith();
  unsubscribe();expect(state.remove).toHaveBeenCalledWith("showbiz:data_changed",listener);
});
