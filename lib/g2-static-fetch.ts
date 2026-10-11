/**
 * Detecta apenas URL HTTP e método que sejam estaticamente demonstráveis.
 * Aceita strings literais, template sem substituição e const locais anteriores.
 * Nunca avalia expressões nem vaza query strings ou tokens na saída.
 */
import ts from 'typescript';

export type G2StaticFetch={line:number;url:string;method:string|null};
const allowedMethods=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
function literal(node:ts.Node|null|undefined):string|null{
 if(!node)return null;
 return ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)?node.text:null;
}
function constString(expr:ts.Expression|undefined,call:ts.Node,sf:ts.SourceFile):string|null{
 if(!expr)return null;
 const direct=literal(expr);
 if(direct!==null)return direct;
 if(!ts.isIdentifier(expr))return null;
 const name=expr.text;
 let parent:ts.Node|undefined=call.parent;
 while(parent){
  if(ts.isFunctionLike(parent)&&parent.parameters.some(p=>ts.isIdentifier(p.name)&&p.name.text===name))
   return null;
  if(ts.isBlock(parent)||ts.isSourceFile(parent)){
   const declarations=parent.statements.filter(ts.isVariableStatement)
    .flatMap(s=>s.declarationList.declarations.filter(d=>ts.isIdentifier(d.name)&&d.name.text===name)
      .map(d=>({statement:s,decl:d})));
   if(declarations.length){
    if(declarations.length!==1)return null;
    const {statement,decl}=declarations[0];
    if(decl.getStart(sf)>=call.getStart(sf)||
     !(statement.declarationList.flags&ts.NodeFlags.Const))return null;
    return literal(decl.initializer);
   }
  }
  parent=parent.parent;
 }
 return null;
}
function sanitizedApiPath(raw:string|null):string|null{
 if(raw===null||raw.length>250)return null;
 const path=raw.split(/[?#]/,1)[0];
 if(!/^\/api\/[a-zA-Z0-9_/-]+$/.test(path)||path.includes('//')||path.includes('/../'))
  return null;
 return path;
}
export function listG2StaticFetches(sf:ts.SourceFile):G2StaticFetch[]{
 const result:G2StaticFetch[]=[];
 function scan(node:ts.Node){
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='fetch'&&
   node.arguments.length>0){
   const url=sanitizedApiPath(constString(node.arguments[0],node,sf));
   if(url){
    let method:string|null='GET';
    if(node.arguments.length>1){
     const option=node.arguments[1];
     method=null;
     if(ts.isObjectLiteralExpression(option)){
      const property=option.properties.find(p=>
       (ts.isPropertyAssignment(p)||ts.isShorthandPropertyAssignment(p))&&
       ((ts.isIdentifier(p.name)&&p.name.text==='method')||
        (ts.isStringLiteral(p.name)&&p.name.text==='method')));
      const value=property?
       (ts.isPropertyAssignment(property)?constString(property.initializer,node,sf):
        ts.isShorthandPropertyAssignment(property)?
         constString(property.name,node,sf):null):
       'GET';
      const normalized=value?.toUpperCase()??null;
      method=normalized&&allowedMethods.has(normalized)?normalized:null;
     }
    }
    result.push({url,method,line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1});
   }
  }
  ts.forEachChild(node,scan);
 }
 scan(sf);
 return result;
}
