import path from "node:path";
import type {DocumentResult} from "../shared/project-document";
type OpenProject=(file:string)=>Promise<DocumentResult<unknown>>;
export function projectFileArguments(args:readonly string[]):string[]{
 return args.filter(value=>!value.startsWith("-")&&path.extname(value).toLowerCase()===".showbiz").map(value=>path.resolve(value));
}
export function createProjectFileOpening(reportError:(file:string,message:string)=>void){
 const queued:string[]=[];
 let open:OpenProject|undefined;
 let pending:Promise<void>|undefined;
 function drain(){
  if(!open||pending)return;
  pending=(async()=>{
    while(queued.length){
      const file=queued.shift()!;
      try{
        const result=await open!(file);
        if(!result.ok)reportError(file,result.error.message);
      }catch(cause){reportError(file,cause instanceof Error ? cause.message : String(cause));}
    }
  })().finally(()=>{pending=undefined;if(queued.length)drain();});
 }
 return {
  add(file:string){queued.push(path.resolve(file));drain();},
  ready(handler:OpenProject){open=handler;drain();},
  async flush(){while(pending)await pending;},
 };
}
