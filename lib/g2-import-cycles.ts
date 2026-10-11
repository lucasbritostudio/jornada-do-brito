/**
 * Diagnóstico estrutural conservador de ciclos de imports.
 * Ciclo de IMPORTAÇÃO não é diagnóstico de loop em execução nem erro comprovado.
 */
import type {FunctionGraph,GraphEdge} from './g2-function-graph';

export type ImportCycle={files:string[];imports:GraphEdge[];
 observation:'possible_static_import_cycle';runtimeBugConfirmed:false};
export function findG2ImportCycles(graph:FunctionGraph):ImportCycle[]{
 const adj=new Map<string,GraphEdge[]>();
 for(const e of graph.edges.filter(x=>x.kind==='import')){
  adj.set(e.from,[...(adj.get(e.from)||[]),e]);
 }
 const cycles:ImportCycle[]=[],seen=new Set<string>();
 function walk(file:string,stack:string[],edges:GraphEdge[]){
  if(stack.length>graph.files.length+1)return;
  const index=stack.indexOf(file);
  if(index>=0){
   const cycleFiles=stack.slice(index);
   const cycleEdges=edges.slice(index);
   if(cycleFiles.length<=1&&cycleEdges.length===0)return;
   const key=[...cycleFiles].sort().join('|');
   if(!seen.has(key)){
    seen.add(key);
    cycles.push({files:cycleFiles,imports:cycleEdges,
     observation:'possible_static_import_cycle',runtimeBugConfirmed:false});
   }
   return;
  }
  for(const edge of adj.get(file)||[]){
   if(cycles.length>=16)break;
   walk(edge.to,[...stack,file],[...edges,edge]);
  }
 }
 for(const file of graph.files){
  if(cycles.length>=16)break;
  walk('file:'+file,[],[]);
 }
 return cycles;
}
