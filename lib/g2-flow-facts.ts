/**
 * Evidências AST de controle de fluxo em UMA função. Reconhece sintaxe,
 * não a execução do navegador, nem promete que TODOS os erros são tratados.
 */
import ts from 'typescript';
import type {GraphSource} from './g2-function-graph';

export type G2FlowFact={
 kind:'await_fetch'|'http_status_throw'|'catch_updates_error'|'finally_resets_loading';
 path:string;line:number;signature:string;
 scope:'static_syntax_only';runtimeTested:false;
};
export type G2FlowInspection={
 state:'unique_function'|'ambiguous_or_missing_function';
 name:string;path:string;sha:string;
 facts:G2FlowFact[];
 executionVerified:false;
};
function lineOf(sf:ts.SourceFile,n:ts.Node){
 return sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
}
function create(sf:ts.SourceFile,node:ts.Node,input:GraphSource,kind:G2FlowFact['kind']):G2FlowFact{
 const line=lineOf(sf,node);
 // Contém somente a linha L, nunca conteúdos confidenciais, URLs com tokens
 // ou expressão inteira do usuário; apenas um rótulo de estrutura confiável.
 const signature=kind='await_fetch'?'await fetch(...)':
  kind==='http_status_throw'?'if (!response.ok) throw':
  kind==='catch_updates_error'?'catch -> setError(...)':'finally -> setLoading(false)';
 return {kind,path:input.path,line,signature,scope:'static_syntax_only',runtimeTested:false};
}
function functionBodies(sf:ts.SourceFile,name:string):ts.ConciseBody[]{
 const bodies:ts.ConciseBody[]=[];
 function walk(n:ts.Node){
  if(ts.isFunctionDeclaration(n)&&n.name?.text===name&&n.body)bodies.push(n.body);
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text===name){
   let initializer=n.initializer;
   if(initializer&&ts.isCallExpression(initializer)&&ts.isIdentifier(initializer.expression)&&
    initializer.expression.text==='useCallback'&&initializer.arguments.length)
    initializer=initializer.arguments[0];
   if(initializer&&(ts.isArrowFunction(initializer)||ts.isFunctionExpression(initializer)))
    bodies.push(initializer.body);
  }
  ts.forEachChild(n,walk);
 }
 walk(sf);return bodies;
}
function scan(node:ts.Node,visit:(n:ts.Node)=>void){
 visit(node);
 ts.forEachChild(node,n=>{
  if(ts.isFunctionLike(n)&&n!==node)return; // funções aninhadas não são o corpo externo
  scan(n,visit);
 });
}
function isFetchAwait(n:ts.Node){
 return ts.isVariableDeclaration(n)&&!!n.initializer&&ts.isAwaitExpression(n.initializer)&&
  ts.isCallExpression(n.initializer.expression)&&ts.isIdentifier(n.initializer.expression.expression)&&
  n.initializer.expression.expression.text==='fetch';
}
export function inspectG2ControlFlow(input:GraphSource,name:string):G2FlowInspection{
 if(!/^[a-zA-Z_$][\w$]{0,70}$/.test(name)||typeof input.content!=='string')
  throw new Error('G2_FLOW_INVALID_INPUT');
 const sf=ts.createSourceFile(input.path,input.content,ts.ScriptTarget.Latest,true,
  input.path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const bodies=functionBodies(sf,name);
 const base={name,path:input.path,sha:input.sha,executionVerified:false as const};
 if(bodies.length!==1||!ts.isBlock(bodies[0]))
  return {...base,state:'ambiguous_or_missing_function' as const,facts:[]};
 const facts:G2FlowFact[]=[],fnBody=bodies[0];
 const insert=(n:ts.Node,kind:G2FlowFact['kind'])=>{
  if(!facts.some(f=>f.kind===kind))facts.push(create(sf,n,input,kind));
 };
 scan(fnBody,n=>{
  if(isFetchAwait(n))insert(n,'await_fetch');
  if(ts.isIfStatement(n)&&ts.isPrefixUnaryExpression(n.expression)&&
   n.expression.operator===ts.SyntaxKind.ExclamationToken&&
   ts.isPropertyAccessExpression(n.expression.operand)&&
   n.expression.operand.name.text==='ok'){
   let hasFetchBinding=false;
   const operand=n.expression.operand;
   const bindingName=ts.isIdentifier(operand.expression)?operand.expression.text:null;
   // Apenas atribuição await fetch no MESMO bloco e antes do if. Buscar
   // fetch em outro bloco poderia inventar uma relação de fluxo.
   const enclosing=n.parent;
   if(bindingName&&ts.isBlock(enclosing)){
    for(const statement of enclosing.statements){
     if(statement.getStart(sf)>=n.getStart(sf))break;
     scan(statement,x=>{
      if(isFetchAwait(x)&&ts.isIdentifier(x.name)&&x.name.text===bindingName)
       hasFetchBinding=true;
     });
    }
   }
   const branchThrows=ts.isThrowStatement(n.thenStatement)||
    ts.isBlock(n.thenStatement)&&n.thenStatement.statements.some(x=>ts.isThrowStatement(x));
   if(hasFetchBinding&&branchThrows)insert(n,'http_status_throw');
  }
  if(ts.isTryStatement(n)){
   if(n.catchClause)scan(n.catchClause.block,x=>{
    if(ts.isCallExpression(x)&&ts.isIdentifier(x.expression)&&
     x.expression.text==='setError')insert(x,'catch_updates_error');
   });
   if(n.finallyBlock)scan(n.finallyBlock,x=>{
    if(ts.isCallExpression(x)&&ts.isIdentifier(x.expression)&&
     ['setAsking','setBusy','setPlanningBusy','setLoading'].includes(x.expression.text)&&
     x.arguments.length===1&&x.arguments[0].kind===ts.SyntaxKind.FalseKeyword)
     insert(x,'finally_resets_loading');
   });
  }
 });
 return {...base,state:'unique_function' as const,
  facts:facts.sort((a,b)=>a.line-b.line)};
}
