/**
 * G2 — investigação de cadeias de causa/efeito com separação explícita:
 * 1) referência estrutural demonstrada; 2) conexão de rota apenas provável;
 * 3) hipótese de comportamento que ainda requer experimento.
 *
 * Nunca confundir caminho de chamadas com execução, erro real ou causalidade.
 * Somente analisa fontes fornecidas, com SHA idêntico e escopo do grafo G2.
 */
import ts from 'typescript';
import {inspectG2ControlFlow,type G2FlowFact} from './g2-flow-facts';
import {
 buildG2FunctionGraph,traceG2Function,type GraphSource,type GraphSymbol,
 type GraphEdge,type GraphGap
} from './g2-function-graph';

export type G2CausalScenario='http_500'|'network_failure'|'unexpected_json'|'slow_response';
export type G2CausalStep={
 from:string;to:string;path:string;line:number;
 relation:'direct_call'|'http_route_candidate';
 evidence:'verified_static_reference'|'framework_convention_only';
};
export type G2CausalHypothesis={
 id:string;
 status:'hypothesis_not_verified';
 statement:string;
 whyNotProven:string;
 experiment:string;
 rejectWhen:string;
};
export type G2CausalReport={
 status:'structural_only'|'partial_sources'|'ambiguous_entry';
 subject:{path:string;name:string;sha:string;scenario:G2CausalScenario};
 examinedFunctions:{id:string;path:string;name:string;line:number}[];
 flowSyntaxFacts:G2FlowFact[];
 structuralSteps:G2CausalStep[];
 unresolved:GraphGap[];
 hypotheses:G2CausalHypothesis[];
 testsNotRun:string[];
 runtimeOutcomeVerified:false;
 causeConfirmed:false;
 filesModified:false;
 deployAllowed:false;
};

type FetchSite={line:number;url:string;method:string|null};
const methods=new Set(['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD']);
function findFetchSites(file:GraphSource):FetchSite[]{
 const sf=ts.createSourceFile(file.path,file.content,ts.ScriptTarget.Latest,true,
  file.path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const out:FetchSite[]=[];
 function visit(n:ts.Node){
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='fetch'&&
    n.arguments.length>0&&ts.isStringLiteral(n.arguments[0])){
   const url=n.arguments[0].text;
   if(/^\/api\/[a-zA-Z0-9/_-]+$/.test(url)){
    let method:string|null='GET';
    if(n.arguments[1]){
     method=null;
     const options=n.arguments[1];
     if(ts.isObjectLiteralExpression(options)){
      const p=options.properties.find(p=>ts.isPropertyAssignment(p)&&
       (ts.isIdentifier(p.name)&&p.name.text==='method'||
        ts.isStringLiteral(p.name)&&p.name.text==='method'));
      if(!p)method='GET';
      else if(ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer)&&
       methods.has(p.initializer.text.toUpperCase()))
       method=p.initializer.text.toUpperCase();
     }
    }
    out.push({line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,url,method});
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
 return out;
}
function findOwner(symbols:readonly GraphSymbol[],path:string,line:number):GraphSymbol|null{
 const candidates=symbols.filter(s=>s.path===path&&s.startLine<=line&&s.endLine>=line)
  .sort((a,b)=>(a.endLine-a.startLine)-(b.endLine-b.startLine));
 return candidates[0]??null;
}
const hypothesisCatalog:Record<G2CausalScenario,Omit<G2CausalHypothesis,'id'|'status'>>={
 http_500:{
  statement:'Se a rota responder com HTTP 500, o cliente poderá apresentar erro e encerrar o carregamento; o resultado ainda não foi observado.',
  whyNotProven:'Um fetch, um if(!r.ok), um catch ou um finally isolados não comprovam o comportamento do navegador nem da rota.',
  experiment:'Simular HTTP 500 em teste autenticado com resposta controlada; verificar mensagem de erro, ausência de sucesso e fim do loading.',
  rejectWhen:'O erro não aparecer, houver sucesso falso ou o indicador permanecer travado.'
 },
 network_failure:{
  statement:'Se o fetch falhar por rede, o caminho poderá atingir tratamento de exceção da interface; isso ainda precisa de execução.',
  whyNotProven:'O grafo não executou fetch, não simulou rejeição de Promise nem comprovou estado final da interface.',
  experiment:'Simular rejeição do fetch em ambiente isolado e observar tratamento de erro, estado final e número de tentativas.',
  rejectWhen:'A exceção escapar, houver sucesso falso ou o estado permanecer travado.'
 },
 unexpected_json:{
  statement:'Se a resposta HTTP trouxer JSON inesperado, o parsing ou uso dos campos poderá falhar.',
  whyNotProven:'A relação estática entre cliente, rota e funções não valida contratos de resposta em runtime.',
  experiment:'Testar respostas JSON inválidas e incompletas, avaliando status e recuperação sem dados reais.',
  rejectWhen:'O tratamento não distinguir conteúdo inválido de êxito ou perder erro de parsing.'
 },
 slow_response:{
  statement:'Se o provedor demorar, a experiência pode permanecer em espera até timeout ou retorno.',
  whyNotProven:'A existência de callbacks, timeout ou finally não determina tempos observados sob latência real.',
  experiment:'Simular atraso e timeout em teste isolado, medindo espera, limite de tempo e limpeza de estados.',
  rejectWhen:'Houver espera além do limite declarado ou indicadores permanecerem ativos após falha.'
 }
};
export function analyzeG2CausalChain(
 sources:readonly GraphSource[],path:string,name:string,scenario:G2CausalScenario
):G2CausalReport{
 if(!Object.prototype.hasOwnProperty.call(hypothesisCatalog,scenario))
  throw new Error('G2_CAUSAL_SCENARIO_INVALID');
 const graph=buildG2FunctionGraph(sources);
 const root=traceG2Function(graph,path,name,4);
 const subject={path,name,sha:graph.sha,scenario};
 const base:Omit<G2CausalReport,'status'>={
  subject,examinedFunctions:[],flowSyntaxFacts:[],structuralSteps:[],unresolved:[],hypotheses:[],
  testsNotRun:[],runtimeOutcomeVerified:false,causeConfirmed:false,
  filesModified:false,deployAllowed:false
 };
 if(root.status==='unresolved')
  return {...base,status:'ambiguous_entry',testsNotRun:[
   'Selecionar uma única função existente nas fontes explícitas; não concluir que ela não existe no projeto.']};
 const sourceMap=new Map(sources.map(s=>[s.path,s]));
 const visited=new Set(root.nodes.map(s=>s.id));
 const steps:G2CausalStep[]=root.edges.map(e=>({
  from:e.from,to:e.to,path:e.path,line:e.line,
  relation:'direct_call',evidence:'verified_static_reference'
 }));
 const unresolved:GraphGap[]=[];
 // A referência HTTP só estabelece um candidato de roteamento (convenção
 // Next.js) se o arquivo autorizado da rota foi de fato fornecido.
 const candidates=graph.gaps.filter(g=>g.reason==='http_route_unexamined');
 for(const gap of candidates){
  const owner=findOwner(graph.symbols,gap.path,gap.line);
  if(!owner||!visited.has(owner.id))continue;
  const client=sourceMap.get(gap.path);
  if(!client){unresolved.push(gap);continue;}
  const matching=findFetchSites(client).filter(f=>f.line===gap.line&&f.url===gap.symbol);
  if(matching.length!==1||!matching[0].method){unresolved.push(gap);continue;}
  const method=matching[0].method!;
  const expected='app'+gap.symbol+'/route.ts';
  const route=sourceMap.get(expected);
  const handlers=graph.symbols.filter(s=>s.path===expected&&s.name===method&&
   s.exportName===method&&s.parent===null);
  if(!route||handlers.length!==1){unresolved.push(gap);continue;}
  const handler=handlers[0];
  steps.push({
   from:owner.id,to:handler.id,path:gap.path,line:gap.line,
   relation:'http_route_candidate',evidence:'framework_convention_only'
  });
  const server=traceG2Function(graph,expected,method,4);
  for(const symbol of server.nodes)visited.add(symbol.id);
  for(const e of server.edges)steps.push({
   from:e.from,to:e.to,path:e.path,line:e.line,
   relation:'direct_call',evidence:'verified_static_reference'
  });
 }
 // Preserve lacunas dos arquivos atingidos: backend de outro projeto ou
 // biblioteca externa nunca é inventado por semelhança de nomes.
 const reachedFiles=new Set(graph.symbols.filter(s=>visited.has(s.id)).map(s=>s.path));
 for(const gap of graph.gaps){
  if(gap.reason==='http_route_unexamined')continue;
  if(reachedFiles.has(gap.path))unresolved.push(gap);
 }
 const unique=new Map<string,G2CausalStep>();
 for(const step of steps)
  unique.set(step.from+'|'+step.to+'|'+step.path+'|'+step.line+'|'+step.relation,step);
 const limited=[...unique.values()].slice(0,48);
 const example=hypothesisCatalog[scenario];
 const hypotheses:G2CausalHypothesis[]=[{
  id:'behavior-'+scenario,status:'hypothesis_not_verified',...example
 }];
 const testsNotRun=[
  example.experiment,
  'Comparar observação em teste controlado com as relações de código citadas; não transformar referência em causa confirmada.'
 ];
 if(limited.some(s=>s.relation==='http_route_candidate'))
  testsNotRun.push('Confirmar roteamento HTTP, autenticação, conteúdo e status reais em testes de integração; convenção de pasta não prova execução.');
 if(unresolved.length)
  testsNotRun.push('Examinar apenas as dependências autorizadas que faltam, fixando o mesmo SHA; nunca afirmar ausência funcional.');
 const entrySource=sourceMap.get(path);
 const flowSyntaxFacts=entrySource?inspectG2ControlFlow(entrySource,name).facts:[];
 return {...base,status:unresolved.length?'partial_sources':'structural_only',
  flowSyntaxFacts,
  examinedFunctions:graph.symbols.filter(s=>visited.has(s.id)).map(s=>
   ({id:s.id,path:s.path,name:s.name,line:s.startLine})).slice(0,48),
  structuralSteps:limited,unresolved:unresolved.slice(0,48),
  hypotheses,testsNotRun};
}
