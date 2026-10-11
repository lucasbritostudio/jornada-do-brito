/**
 * Planejamento determinístico de investigação a partir do grafo de arquivos.
 * Uma aresta prova uma REFERÊNCIA ESTÁTICA, jamais que um bug foi executado.
 */
import {traceG2Function,type FunctionGraph,type GraphGap,type GraphEdge} from './g2-function-graph';
import {findG2ImportCycles} from './g2-import-cycles';

export type G2Investigation={
 state:'bounded_static_map'|'insufficient_sources'|'ambiguous_entry';
 subject:{path:string;functionName:string;sha:string};
 examinedFunctions:{path:string;name:string;line:number}[];
 callEvidence:GraphEdge[];
 importEvidence:GraphEdge[];
 missingEvidence:GraphGap[];
 cycleObservations:{files:string[];confirmedRuntimeBug:false}[];
 nextExperiment:string[];
 changesApplied:false;
 safeToDeploy:false;
};
export function planG2DependencyInvestigation(
 graph:FunctionGraph,path:string,functionName:string
):G2Investigation{
 const t=traceG2Function(graph,path,functionName,4);
 const examined=t.nodes.map(n=>({path:n.path,name:n.name,line:n.startLine}));
 const files=new Set([path,...examined.map(n=>n.path)]);
 const importEvidence=graph.edges.filter(e=>e.kind==='import'&&e.from.startsWith('file:')&&
  files.has(e.from.slice(5)));
 const missingEvidence=graph.gaps.filter(g=>files.has(g.path));
 const cycles=findG2ImportCycles(graph).filter(c=>
  c.files.some(file=>files.has(file.slice(5)))).map(c=>
   ({files:c.files.map(file=>file.slice(5)),confirmedRuntimeBug:false as const}));
 const nextExperiment:string[]=[];
 if(t.status==='unresolved')
  nextExperiment.push('Identificar uma única função de entrada não ambígua em uma fonte já permitida.');
 if(missingEvidence.some(g=>g.reason==='external_or_unprovided'))
  nextExperiment.push('Conferir arquivo ausente ou biblioteca externa por fonte autorizada e pelo mesmo SHA, sem presumir seu comportamento.');
 if(missingEvidence.some(g=>g.reason==='http_route_unexamined'))
  nextExperiment.push('Validar contrato de HTTP com testes de integração isolados; a implementação da rota não foi lida.');
 if(missingEvidence.some(g=>g.reason==='ambiguous_binding'||g.reason==='not_exported'))
  nextExperiment.push('Confirmar escopo/exportação do símbolo e registrar a relação sem inferir a implementação ausente.');
 if(cycles.length)
  nextExperiment.push('Analisar ciclo de imports e sua inicialização com testes; um ciclo estático não prova falha em runtime.');
 if(t.status==='static_trace_only'&&nextExperiment.length===0)
  nextExperiment.push('Criar teste de integração para validar se o fluxo mapeado funciona ao executar; referências estáticas não bastam.');
 return {
  state:t.status==='unresolved'?'ambiguous_entry':
   missingEvidence.length?'insufficient_sources':'bounded_static_map',
  subject:{path,functionName,sha:graph.sha},examinedFunctions:examined,
  callEvidence:t.edges.slice(0,32),importEvidence:importEvidence.slice(0,32),
  missingEvidence:missingEvidence.slice(0,32),cycleObservations:cycles.slice(0,8),
  nextExperiment,
  changesApplied:false,safeToDeploy:false
 };
}
