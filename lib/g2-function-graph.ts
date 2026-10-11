/**
 * G2: grafo multi-arquivo via AST TypeScript (parser, NUNCA execução).
 * Somente fontes fornecidas e allowlist. Import ausente != função ausente.
 * Não acessa GitHub, Vercel, disco, segredos, rede ou ferramentas de escrita.
 * TypeScript é dependência JÁ existente de desenvolvimento, não de produção.
 */
import ts from 'typescript';
import {validateSourcePath} from './devops-policy';

export type GraphSource={path:string;sha:string;content:string};
export type GraphSymbol={id:string;path:string;name:string;startLine:number;endLine:number;parent:string|null;exportName:string|null};
export type GraphEdge={from:string;to:string;kind:'call'|'import';path:string;line:number;proof:'static_reference_only'};
export type GraphGap={path:string;line:number;symbol:string;reason:'external_or_unprovided'|'not_exported'|'unresolved_call'|'ambiguous_binding'};
export type FunctionGraph={
 status:'static_only';sha:string;files:string[];symbols:GraphSymbol[];
 edges:GraphEdge[];gaps:GraphGap[];
 limitations:string[];
};
type ImportBinding={file:string;exportName:string;fromPath:string;line:number};
type RawCall={owner:string;path:string;line:number;target:string;namespace?:string;shadowed:boolean};
type FileInfo={file:ts.SourceFile;imports:Map<string,ImportBinding>;
 symbols:GraphSymbol[];exports:Map<string,string>;calls:RawCall[]};

const extensions=['','.ts','.tsx','.js','.jsx','.mjs','.css','/index.ts','/index.tsx'];
function normalPath(p:string){
 const parts:string[]=[];
 for(const segment of p.split('/')){
  if(!segment||segment==='.')continue;
  if(segment==='..'){if(!parts.length)return null;parts.pop();}
  else parts.push(segment);
 }
 return parts.join('/');
}
function resolveImport(from:string,specifier:string,provided:Set<string>):string|null{
 let base:string|null=null;
 if(specifier.startsWith('./')||specifier.startsWith('../'))
  base=normalPath(from.split('/').slice(0,-1).join('/')+'/'+specifier);
 else if(specifier.startsWith('@/'))
  base=normalPath(specifier.slice(2));
 if(!base)return null;
 return extensions.map(e=>base+e).find(p=>provided.has(p))??null;
}
function lineOf(sf:ts.SourceFile,node:ts.Node){return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1;}
function hasModifier(node:ts.Node,kind:ts.SyntaxKind):boolean{
 return ts.canHaveModifiers(node)&&!!ts.getModifiers(node)?.some(m=>m.kind===kind);
}
function makeGraphSymbol(sf:ts.SourceFile,path:string,name:string,node:ts.Node,parent:string|null,exportName:string|null):GraphSymbol{
 const startLine=lineOf(sf,node),endLine=sf.getLineAndCharacterOfPosition(node.getEnd()-1).line+1;
 return {id:path+'#'+name+'@'+startLine,path,name,startLine,endLine,parent,exportName};
}
function parseOne(path:string,content:string,provided:Set<string>):FileInfo{
 const isTsx=path.endsWith('.tsx')||path.endsWith('.jsx');
 const sf=ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true,
  isTsx?ts.ScriptKind.TSX:path.endsWith('.js')?ts.ScriptKind.JS:ts.ScriptKind.TS);
 const errors=(sf as ts.SourceFile&{parseDiagnostics?:readonly ts.Diagnostic[]}).parseDiagnostics||[];
 if(errors.length)throw new Error('G2_SOURCE_SYNTAX_INVALID');
 const info:FileInfo={file:sf,imports:new Map(),symbols:[],exports:new Map(),calls:[]};
 // Importações são provas de RELAÇÃO declarada, não de execução.
 for(const statement of sf.statements){
  if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier))continue;
  const source=statement.moduleSpecifier.text;
  const dest=resolveImport(path,source,provided);
  const clause=statement.importClause;
  if(!clause||clause.isTypeOnly||!dest)continue;
  const at=lineOf(sf,statement);
  if(clause.name)info.imports.set(clause.name.text,{file:dest,exportName:'default',fromPath:source,line:at});
  const bindings=clause.namedBindings;
  if(bindings&&ts.isNamedImports(bindings))for(const binding of bindings.elements){
   if(binding.isTypeOnly)continue;
   info.imports.set(binding.name.text,{file:dest,
    exportName:binding.propertyName?.text??binding.name.text,fromPath:source,line:at});
  }
  if(bindings&&ts.isNamespaceImport(bindings))
   info.imports.set(bindings.name.text,{file:dest,exportName:'*',fromPath:source,line:at});
 }
 // Uma variável ou parâmetro local com o mesmo nome impede atribuir a
 // chamada à importação homônima. Preferimos lacuna a ligação inventada.
 function shadowsImport(node:ts.Node,name:string):boolean{
  let parent:ts.Node|undefined=node.parent;
  while(parent&&!ts.isSourceFile(parent)){
   if(ts.isFunctionLike(parent)){
    if(parent.parameters.some(param=>{
     const id=param.name;
     return ts.isIdentifier(id)&&id.text===name;
    }))return true;
   }
   if(ts.isBlock(parent)||ts.isSourceFile(parent)){
    for(const stmt of parent.statements){
     if(ts.isVariableStatement(stmt)&&stmt.declarationList.declarations.some(d=>
      ts.isIdentifier(d.name)&&d.name.text===name))return true;
     if(ts.isFunctionDeclaration(stmt)&&stmt.name?.text===name)return true;
    }
   }
   parent=parent.parent;
  }
  return false;
 }
 function traverse(node:ts.Node,current:string|null){
  let owner=current,created:GraphSymbol|null=null;
  let identifier:string|null=null,exportName:string|null=null;
  if(ts.isFunctionDeclaration(node)&&node.name){
   identifier=node.name.text;
   exportName=hasModifier(node,ts.SyntaxKind.DefaultKeyword)?'default':
    hasModifier(node,ts.SyntaxKind.ExportKeyword)?identifier:null;
  }else if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)){
   const init=node.initializer;
   const wraps=init&&ts.isCallExpression(init)&&ts.isIdentifier(init.expression)&&
    ['useCallback','useMemo'].includes(init.expression.text)&&
    init.arguments.length>0?init.arguments[0]:null;
   if(init&&(ts.isArrowFunction(init)||ts.isFunctionExpression(init)||
      !!wraps&&(ts.isArrowFunction(wraps)||ts.isFunctionExpression(wraps)))){
    identifier=node.name.text;
    exportName=node.parent?.parent&&hasModifier(node.parent.parent,ts.SyntaxKind.ExportKeyword)?identifier:null;
   }
  }else if(ts.isMethodDeclaration(node)&&node.name&&ts.isIdentifier(node.name)){
   identifier=node.name.text;
  }
  if(identifier){
   created=makeGraphSymbol(sf,path,identifier,node,current,exportName);
   info.symbols.push(created);
   if(!current&&exportName)info.exports.set(exportName,created.id);
   owner=created.id;
  }
  if(ts.isCallExpression(node)&&owner){
   const expr=node.expression,at=lineOf(sf,node);
   if(ts.isIdentifier(expr))info.calls.push({owner,path,line:at,target:expr.text,shadowed:shadowsImport(node,expr.text)});
   else if(ts.isPropertyAccessExpression(expr)&&ts.isIdentifier(expr.expression))
    info.calls.push({owner,path,line:at,target:expr.name.text,namespace:expr.expression.text,shadowed:shadowsImport(node,expr.expression.text)});
  }
  ts.forEachChild(node,child=>traverse(child,owner));
 }
 for(const statement of sf.statements)traverse(statement,null);
 // export { named as other }; não confundir reexportação com definição.
 for(const statement of sf.statements){
  if(!ts.isExportDeclaration(statement)||statement.moduleSpecifier||!statement.exportClause||
    !ts.isNamedExports(statement.exportClause))continue;
  for(const item of statement.exportClause.elements){
   const original=item.propertyName?.text??item.name.text;
   const match=info.symbols.find(s=>s.parent===null&&s.name===original);
   if(match)info.exports.set(item.name.text,match.id);
  }
 }
 return info;
}
export function buildG2FunctionGraph(sources:readonly GraphSource[]):FunctionGraph{
 if(sources.length<1||sources.length>8)throw new Error('G2_GRAPH_INVALID_FILES');
 const byPath=new Map<string,GraphSource>();
 let sha:string|null=null,total=0;
 for(const item of sources){
  if(!item||!validateSourcePath(item.path)||!/\.(?:ts|tsx|js|jsx|mjs|css)$/.test(item.path)||
   typeof item.content!=='string'||item.content.length>22_000||
   typeof item.sha!=='string'||!/^[a-f0-9]{40}$/.test(item.sha)||
   byPath.has(item.path)||sha!==null&&item.sha!==sha)
   throw new Error('G2_GRAPH_INVALID_SOURCE');
  total+=item.content.length;
  if(total>90_000)throw new Error('G2_GRAPH_TOO_LARGE');
  sha=item.sha;byPath.set(item.path,item);
 }
 const available=new Set(byPath.keys());
 const parsed=new Map<string,FileInfo>();
 for(const input of byPath.values()){
  if(input.path.endsWith('.css'))continue;
  parsed.set(input.path,parseOne(input.path,input.content,available));
 }
 const symbols=[...parsed.values()].flatMap(x=>x.symbols);
 const index=new Map(symbols.map(x=>[x.id,x]));
 const edges:GraphEdge[]=[],gaps:GraphGap[]=[];
 const addEdge=(from:string,to:string,kind:GraphEdge['kind'],path:string,line:number)=>{
  if(edges.length>=240)throw new Error('G2_GRAPH_TOO_MANY_EDGES');
  if(!edges.some(e=>e.from===from&&e.to===to&&e.kind===kind&&e.line===line))
   edges.push({from,to,kind,path,line,proof:'static_reference_only'});
 };
 // O grafo nunca adivinha definições de bibliotecas externas.
 for(const [path,info] of parsed){
  for(const statement of info.file.statements){
   if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier))continue;
   const spec=statement.moduleSpecifier.text;
   const target=resolveImport(path,spec,available);
   if(target)addEdge('file:'+path,'file:'+target,'import',path,lineOf(info.file,statement));
   else gaps.push({path,line:lineOf(info.file,statement),symbol:spec,
    reason:'external_or_unprovided'});
  }
  for(const call of info.calls){
   const current=index.get(call.owner);
   if(!current)continue;
   let target:GraphSymbol|undefined,ambiguity=false;
   if(call.shadowed){
    gaps.push({path,line:call.line,symbol:call.namespace??call.target,reason:'ambiguous_binding'});
    continue;
   }
   if(call.namespace){
    const imp=info.imports.get(call.namespace);
    if(!imp||imp.exportName!=='*')continue;
    const dest=parsed.get(imp.file);
    const symbolId=dest?.exports.get(call.target);
    if(symbolId)target=index.get(symbolId);
    else gaps.push({path,line:call.line,symbol:call.namespace+'.'+call.target,
      reason:'not_exported'});
   }else{
    // Resolver apenas definições lexicamente visíveis (mesma função, ancestrais
    // e topo). Não resolver métodos de objeto ou variáveis sombreadas como função.
    const ancestors=new Set<string|null>([null]);
    let p:GraphSymbol|undefined=current;
    while(p){ancestors.add(p.id);p=p.parent?index.get(p.parent):undefined;}
    const matches=info.symbols.filter(s=>s.name===call.target&&
     (s.parent===current.id||s.parent===current.parent||s.parent===null)&&
     ancestors.has(s.parent));
    const ordered=matches.sort((a,b)=>{
     const weight=(x:GraphSymbol)=>x.parent===current.id?3:x.parent===current.parent?2:1;
     return weight(b)-weight(a);
    });
    const best=ordered[0];
    if(ordered.length>1&&best&&ordered[1].parent===best.parent)ambiguity=true;
    if(best&&!ambiguity)target=best;
    else if(!best&&!ambiguity){
     const imp=info.imports.get(call.target);
     if(imp){
      const dest=parsed.get(imp.file),ref=dest?.exports.get(imp.exportName);
      if(ref)target=index.get(ref);
      else gaps.push({path,line:call.line,symbol:call.target,reason:'not_exported'});
     }
    }
    if(ambiguity)gaps.push({path,line:call.line,symbol:call.target,reason:'ambiguous_binding'});
   }
   if(target)addEdge(current.id,target.id,'call',path,call.line);
  }
 }
 return {status:'static_only',sha:sha!,files:[...byPath.keys()].sort(),symbols,
  edges:edges.sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line),
  gaps:gaps.slice(0,80),
  limitations:[
   'Relações estáticas de importação e chamadas diretas; não comprovam execução em produção.',
   'Imports dinâmicos, dispatch por propriedades, event handlers e dependências ausentes podem não ser resolvidos.',
   'Não se conclui que uma função ou tratamento inexiste quando a fonte está ausente.',
   'Cada arquivo deve ser fornecido explicitamente e referir o mesmo commit; nenhum download automático.'
  ]};
}
export function traceG2Function(graph:FunctionGraph,path:string,name:string,maxHops=4){
 if(!Number.isInteger(maxHops)||maxHops<1||maxHops>5)throw new Error('G2_GRAPH_INVALID_DEPTH');
 const start=graph.symbols.filter(s=>s.path===path&&s.name===name);
 if(start.length!==1)return {status:'unresolved' as const,reason:'função ausente ou ambígua nas fontes examinadas',nodes:[],edges:[]};
 const visited=new Set([start[0].id]),frontier=[{id:start[0].id,depth:0}],links:GraphEdge[]=[];
 while(frontier.length){
  const current=frontier.shift()!;
  if(current.depth>=maxHops)continue;
  for(const edge of graph.edges.filter(e=>e.kind==='call'&&e.from===current.id)){
   links.push(edge);
   if(!visited.has(edge.to)){visited.add(edge.to);frontier.push({id:edge.to,depth:current.depth+1});}
  }
 }
 return {status:'static_trace_only' as const,reason:'chamadas possíveis pelas referências estáticas, sem executar funções',
  nodes:graph.symbols.filter(s=>visited.has(s.id)),edges:links};
}
