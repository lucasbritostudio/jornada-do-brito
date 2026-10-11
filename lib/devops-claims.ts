/**
 * Fatos estáticos limitados: apenas padrões visíveis no arquivo autorizado.
 * Não prova ausência, corretude total nem sucesso em produção. Sem rede, IA ou escrita.
 */
export type VerifiedFact={path:string;line:number;quote:string;meaning:string};
type Scope={start:number;end:number};
function functionScope(lines:string[],name:string):Scope|null{
 const named=new RegExp('^\\s*(?:async\\s+)?function\\s+'+name+'\\s*\\(');
 const start=lines.findIndex(line=>named.test(line));
 if(start<0)return null;
 const end=lines.findIndex((line,i)=>i>start&&i<=start+80&&/^\s*\}\s*;?\s*$/.test(line));
 return end>start?{start,end}:null;
}
function findInScope(lines:string[],scope:Scope,pattern:RegExp):number{
 for(let i=scope.start;i<=scope.end;i++)if(pattern.test(lines[i]))return i;
 return -1;
}
export function verifiedCodeFacts(maskedSource:string,path:string,objective:string):VerifiedFact[]{
 if(path!=='app/desenvolvimento/console.tsx')return [];
 const words=objective.toLowerCase(),lines=maskedSource.split('\n'),facts:VerifiedFact[]=[];
 const add=(idx:number,meaning:string)=>{
  if(idx<0)return;
  const quote=lines[idx]?.trim()??'';
  if(!quote||quote.includes('[LINHA DE CONFIGURAÇÃO OCULTA]')||quote.length>200)return;
  facts.push({path,line:idx+1,quote,meaning});
 };
 if(/\bask\b/i.test(words)||/carregament|requisi[cç]|status|erro/.test(words)){
  const s=functionScope(lines,'ask');
  if(s){
   const check=findInScope(lines,s,/if\s*\(\s*!\s*r\.ok\s*\)/);
   if(check>=0)add(check,'Na função ask existe uma verificação explícita de r.ok. Isto não prova que toda falha de rede seja tratada.');
   const done=findInScope(lines,s,/finally\s*\{\s*setAsking\(false\)/);
   if(done>=0)add(done,'A função ask contém um finally que encerra o estado de carregamento.');
  }
 }
 if(/\brefresh\b|useeffect|usecallback|atualiz/.test(words)){
  const idx=lines.findIndex(s=>/\bconst refresh\s*=\s*useCallback\s*\(/.test(s));
  if(idx>=0)add(idx,'A função refresh está declarada com useCallback; não é correto afirmar que não foi definida.');
 }
 if(/copiar|clipboard|copyAnswer/i.test(words)){
  const s=functionScope(lines,'copyAnswer');
  if(s){
   const handler=findInScope(lines,s,/\bcatch\s*\{/);
   if(handler>=0)add(handler,'copyAnswer possui tratamento de exceção; isso não comprova compatibilidade com todos os navegadores.');
  }
 }
 return facts.slice(0,5);
}
export function formatVerifiedFacts(facts:VerifiedFact[]):string{
 if(!facts.length)return 'Não há fatos estáticos adicionais comprovados pelo verificador local.';
 return facts.map(f=>f.path+':L'+f.line+' — '+f.meaning+'\nCódigo: '+f.quote).join('\n');
}
export function contradictsVerifiedFacts(interpretation:string,facts:VerifiedFact[]):boolean{
 const text=interpretation.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(facts.some(f=>f.meaning.includes('r.ok'))&&
  /(?:\bask\b|status|resposta|fetch)/.test(text)&&
  /(?:sem|nao|falta|ausencia|incomplet)/.test(text)&&
  /(?:valid|verific|chec|trata|status|erro)/.test(text))return true;
 if(facts.some(f=>f.meaning.includes('refresh'))&&
  /refresh/.test(text)&&/(?:nao|sem|falta|ausencia|inexist)/.test(text))return true;
 if(facts.some(f=>f.meaning.includes('tratamento de exceção'))&&
  /(?:copyanswer|clipboard|copiar)/.test(text)&&
  /(?:nao|sem|falta|ausencia)/.test(text)&&/tratamento de erro|tratamento de excecao|catch/.test(text))return true;
 return false;
}
