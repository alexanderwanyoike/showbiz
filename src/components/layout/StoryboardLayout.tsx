import {useId, useRef, useState, type ReactNode} from 'react';
import {PanelRight, X} from 'lucide-react';
interface StoryboardLayoutProps {shotListSlot:ReactNode;previewSlot:ReactNode;inspectorSlot:ReactNode;}
export function StoryboardLayout({shotListSlot,previewSlot,inspectorSlot}:StoryboardLayoutProps){
 const [controlsOpen,setControlsOpen]=useState(false);
 const controlsId=useId();
 const toggle=useRef<HTMLButtonElement>(null);
 const close=()=>{setControlsOpen(false);toggle.current?.focus();};
 return <div className={`storyboard-workspace ${controlsOpen?'has-inspector':''}`}>
  <section className="canvas-preview" aria-label="Shot preview">
   <button ref={toggle} className="shot-controls-toggle" aria-label="Shot controls" aria-expanded={controlsOpen} aria-controls={controlsId} onClick={()=>setControlsOpen(!controlsOpen)}><PanelRight size={14}/>Shot controls</button>
   {previewSlot}
  </section>
  <section className="canvas-filmstrip" aria-label="Shot sequence">{shotListSlot}</section>
  <aside id={controlsId} className="canvas-inspector" aria-label="Shot controls" hidden={!controlsOpen}>
   <div className="canvas-inspector-heading"><span>Shot controls</span><button aria-label="Close shot controls" onClick={close}><X size={14}/></button></div>
   <div className="canvas-inspector-body">{inspectorSlot}</div>
  </aside>
 </div>;
}
