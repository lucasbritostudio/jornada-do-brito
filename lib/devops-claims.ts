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
 // Ignora fechamentos de blocos internos mais indentados.
 const indent=(lines[start].match(/^\s*/)?.[0].length??0);
 const end=lines.findIndex((line,i)=>i>start&&i<=start+80&&
  /^\s*\}\s*;?\s*$/.test(line)&&
  (line.match(/^\s*/)?.[0].length??0)<=indent);
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
/**
 * Rejeita SOMENTE alegações de ausência explicitamente incompatíveis com
 * fatos positivos. Palavras soltas "não", "status" ou "refresh" não são prova
 * de contradição: "não precisa criar refresh" é uma orientação CORRETA.
 * Fatos externos e inferências semânticas continuam sujeitos a revisão.
 */
export function contradictsVerifiedFacts(interpretation:string,facts:VerifiedFact[]):boolean{
 const text=interpretation.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const hasStatus=facts.some(f=>f.meaning.includes('r.ok'));
 const hasRefresh=facts.some(f=>f.meaning.includes('refresh'));
 const hasCopyCatch=facts.some(f=>f.meaning.includes('tratamento de exceção'));
 // Limitar cada avaliação à oração, sem apagar a contradição com uma frase
 // verdadeira anterior. Ex.: "r.ok já existe, mas ask não valida status".
 const clauses=text.split(/\b(?:mas|porem|contudo|entretanto)\b|[;\n]|\.(?=\s|$)/g).filter(Boolean);
 return clauses.some(raw=>{
  const c=raw.trim();
  const unnecessary=/\bnao\s+(?:e\s+)?(?:necessari[oa]|precisa|precisamos|deve|deveria)\s+(?:de\s+)?(?:adicionar|criar|implementar|definir|incluir|usar|verificar|validar|checar)\b/.test(c)||
   /\b(?:dispensa|desnecessari[oa])\s+(?:adicionar|criar|implementar|definir|incluir)\b/.test(c);
  if(hasStatus){
   const statusRef=/(?:\bask\b|status|r\.ok|fetch|resposta)/.test(c);
   const explicitNoCheck=/(?:\b(?:ask|fetch)\b.{0,90}\b(?:nao|sem)\s+(?:faz\s+|possui\s+)?(?:verific|valid|chec|trat).{0,45}(?:status|r\.ok|resposta))|(?:\bsem\s+(?:valid|verific|chec).{0,30}(?:status|r\.ok|resposta))|(?:\b(?:falta|ausencia)\b.{0,50}(?:valid|verific|chec).{0,30}(?:status|r\.ok|resposta))|(?:\bnao\s+(?:verific|valid|chec).{0,30}(?:status|r\.ok|resposta))/.test(c);
   if(statusRef&&explicitNoCheck&&!unnecessary)return true;
   const addCheck=/(?:adicionar|implementar|incluir|criar|precisa\s+de|deveria\s+(?:ter|fazer))\s+.{0,35}(?:verific|valid|chec).{0,30}(?:r\.ok|status\s*(?:http|da\s*resposta)|resposta\s*do\s*fetch)|(?:adicionar|implementar|incluir|criar)\s+.{0,20}r\.ok/.test(c);
   if(statusRef&&addCheck&&!unnecessary&&!/\bja\s+(?:existe|possui|faz|tem|verifica|valida)\b/.test(c))return true;
  }
  if(hasRefresh&&/\brefresh\b/.test(c)){
   const noRefresh=/(?:\brefresh\b.{0,45}\bnao\s+(?:existe|aparece|foi\s+definid|esta\s+definid|e\s+definid|tem\s+usecallback))|(?:\b(?:falta|ausencia)\b.{0,36}\brefresh\b)|(?:\brefresh\b.{0,26}\bfalta\s+usecallback\b)/.test(c);
   if(noRefresh&&!unnecessary)return true;
   const addRefresh=/(?:definir|criar|adicionar|implementar|precisa|deveria)\s+.{0,25}\brefresh\b.{0,25}\busecallback\b/.test(c);
   if(addRefresh&&!unnecessary&&!/\bja\s+(?:usa|existe|possui|tem)\b/.test(c))return true;
  }
  if(hasCopyCatch&&/(?:copyanswer|clipboard|copiar)/.test(c)){
   const noHandler=/(?:\b(?:copyanswer|clipboard|copiar)\b.{0,60}\b(?:nao|sem)\s+(?:tem\s+|faz\s+|possui\s+)?(?:tratamento\s+de\s+(?:erro|excecao)|catch))|(?:\b(?:falta|ausencia)\b.{0,40}(?:tratamento\s+de\s+(?:erro|excecao)|catch).{0,30}(?:copyanswer|clipboard|copiar))/.test(c);
   if(noHandler&&!unnecessary)return true;
  }
  return false;
 });
}
