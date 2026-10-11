/**
 * Laboratório V2: seleção barata de fontes e auditoria determinística de citações.
 * Este arquivo só trata TEXTO; jamais escreve em repositórios, dados ou Vercel.
 */
export type LabEvidence={
 excerpt:string;
 truncated:boolean;
 totalLines:number;
 visibleLines:number[];
 lines:Record<number,string>;
 relevant:boolean;
};
export type LabReview={
 text:string;
 evidenceSupported:boolean;
 evidenceLevel:'checked_quotes'|'source_only';
 observations:number;
};

const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const ignored=new Set([
 'para','como','quero','pode','esse','essa','onde','mais','menos','com','sem',
 'codigo','analise','analisar','verifique','verificar','central','desenvolvimento',
 'arquivo','tela','real','linhas','linha','cite','comprovam','respostas','solicitacao',
 'precisa','tenha','existe','corrija','melhore','mostrar','mudar','deixar','primeiro',
 'versao','confirmar','confirmado','indicador','exibir','problema','problemas','alteracao'
]);
function terms(objective:string):string[]{
 const question=normalize(objective);
 const found=(question.match(/[a-z][a-z0-9_]{2,}/g)||[]).filter(w=>!ignored.has(w));
 if(/carregament|espera|processand|loading|feedback|progresso/.test(question))
  found.push('busy','asking','consultando','analisando','disabled','loading');
 if(/\bask\b/.test(question))found.push('setasking','question','chat','answer');
 if(/erro|falha/.test(question))found.push('error','failure','failed');
 if(/priorid|gravidade/.test(question))found.push('failure','timed_out','deployments','sort');
 return [...new Set(found)];
}
const numbered=(n:number,s:string)=>'L'+n+': '+s;
const maxLine=420;
function formatSelection(lines:string[],selected:Set<number>,maxChars:number){
 const indexes=[...selected].sort((a,b)=>a-b);
 const chunks:string[]=[];
 let last=0;
 for(const i of indexes){
  if(i>last+1)chunks.push('[LINHAS '+(last+1)+'–'+(i-1)+' NÃO ENVIADAS]');
  chunks.push(numbered(i,lines[i-1]));
  last=i;
 }
 if(last<lines.length)chunks.push('[LINHAS '+(last+1)+'–'+lines.length+' NÃO ENVIADAS]');
 const prefix=indexes.length===lines.length?'':'[FONTE PARCIAL: ausência de linha não prova defeito.]\n';
 const excerpt=prefix+chunks.join('\n');
 return {excerpt,valid:excerpt.length<=maxChars};
}

/** Recebe código JÁ MASCARADO pelo backend, nunca fonte bruta. */
export function selectLabEvidence(maskedSource:string,objective:string,maxChars=6300):LabEvidence{
 const lines=maskedSource.split('\n');
 const totalLines=lines.length;
 const safeLine=(s:string)=>s.length<=maxLine?s:'[LINHA EXTENSA OMITIDA POR SEGURANÇA]';
 const display=lines.map(safeLine);
 const make=(ids:Set<number>):LabEvidence=>{
  const out=formatSelection(display,ids,maxChars);
  const visible=[...ids].sort((a,b)=>a-b);
  return {excerpt:out.excerpt,truncated:visible.length!==totalLines,totalLines,
   visibleLines:visible,lines:Object.fromEntries(visible.map(n=>[n,display[n-1]])),
   relevant:false};
 };
 const all=display.map((_,i)=>numbered(i+1,display[i])).join('\n');
 if(all.length<=maxChars){
  const result=make(new Set(display.map((_,i)=>i+1)));
  result.relevant=true;
  return result;
 }
 const query=terms(objective);
 const ranked=display.map((line,i)=>{
  const code=normalize(line);
  const score=query.reduce((n,word)=>n+(code.includes(word)?word.length>5?3:2:0),0)
   +(/\bask\b/.test(normalize(objective))&&/\bfunction ask\b/.test(code)?12:0);
  return {index:i+1,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected=new Set<number>();
 // Preserva a função COMPLETA solicitada, para a IA não concluir
 // "falta tratamento" por ter recebido só a linha do fetch.
 const requestedNames=['ask','refresh','copyAnswer','copyPlan','planChange']
  .filter(name=>new RegExp('\\\\b'+name+'\\\\b','i').test(objective));
 for(const name of requestedNames){
  const start=display.findIndex(line=>
   (name==='refresh'
    ? /\\bconst refresh\\s*=\\s*useCallback\\s*\\(/.test(line)
    : new RegExp('\\\\b(?:async\\\\s+)?function\\\\s+'+name+'\\\\s*\\\\(').test(line)));
  if(start<0)continue;
  const endPredicate=name==='refresh'
   ? (line:string)=>/\\},\\s*\\[\\s*\\]\\s*\\);/.test(line)
   : (line:string)=>/^\\s*\\}\\s*;?\\s*$/.test(line);
  const end=display.findIndex((line,i)=>i>start&&endPredicate(line));
  if(end<0||end-start>50)continue;
  const group=Array.from({length:end-start+1},(_,i)=>start+i+1);
  if(group.some(n=>display[n-1]==='[LINHA EXTENSA OMITIDA POR SEGURANÇA]'))continue;
  const trial=new Set([...selected,...group]);
  if(formatSelection(display,trial,maxChars).valid)
   for(const n of group)selected.add(n);
 }
 // Completa primeiro a área solicitada; depois acrescenta outras linhas relacionadas.
 for(const candidate of ranked.slice(0,24)){
  const add=[candidate.index-2,candidate.index-1,candidate.index,candidate.index+1,candidate.index+2]
   .filter(n=>n>=1&&n<=totalLines&&display[n-1]!=='[LINHA EXTENSA OMITIDA POR SEGURANÇA]');
  const trial=new Set([...selected,...add]);
  if(formatSelection(display,trial,maxChars).valid)for(const n of add)selected.add(n);
 }
 if(!selected.size){
  for(let i=1;i<=totalLines;i++){
   const trial=new Set([...selected,i]);
   if(!formatSelection(display,trial,maxChars).valid)break;
   selected.add(i);
  }
 }
 const result=make(selected);
 result.relevant=ranked.length>0;
 return result;
}

export function evidencePartsV2(evidence:LabEvidence,maxChars=3400):string[]{
 const chunks:string[]=[];
 let part='';
 for(const line of evidence.excerpt.split('\n')){
  if(line.length>maxChars)throw new Error('DEVOPS_LINE_TOO_LONG');
  if(part.length&&part.length+line.length+1>maxChars){
   chunks.push(part);part='';
  }
  part+=(part?'\n':'')+line;
 }
 if(part)chunks.push(part);
 return chunks;
}

/** Resposta JSON da IA. Valida TRECHOS LITERAIS, não supõe verdade semântica. */
export function reviewLabResponse(raw:string,evidence:LabEvidence):LabReview|null{
 let json:unknown;
 try{
  const cleaned=raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,'');
  json=JSON.parse(cleaned);
 }catch{return null;}
 if(!json||typeof json!=='object'||Array.isArray(json))return null;
 const record=json as Record<string,unknown>;
 const findings=record.findings;
 if(!Array.isArray(findings)||!findings.length||findings.length>3)return null;
 const notes:string[]=[];
 for(const finding of findings){
  if(!finding||typeof finding!=='object'||Array.isArray(finding))return null;
  const {line,quote,interpretation}=(finding as Record<string,unknown>);
  if(!Number.isSafeInteger(line)||typeof line!=='number'||typeof quote!=='string'||
     typeof interpretation!=='string'||quote.trim().length<9||quote.length>180||
     interpretation.length>220||!interpretation.trim())return null;
  const code=evidence.lines[line];
  if(!code||code.startsWith('[LINHA')||code.includes('[LINHA DE CONFIGURAÇÃO OCULTA]')||
     /^\s*(?:\/\/|\/\*|\*|<!--|#)/.test(code))return null;
  // Texto hostil dentro de arquivos é dado, nunca prova de sucesso ou execução.
  if(/\b(?:ignore all|ignore previous|ignore instructions|ignore as regras)\b/i.test(quote)||
     /\b(?:deploy|publica(?:ção|cao)|teste|arquivo)\b[\s\S]{0,30}\b(?:executad[oa]|conclu[ií]d[oa]|publicad[oa]|alterad[oa])\b/i.test(interpretation))
   return null;
  // Normalização só de espaços: texto citado tem de estar LITERALMENTE na linha.
  const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
  if(!clean(code).includes(clean(quote))||clean(quote)==='')return null;
  // Uma linha presente NÃO demonstra que algo esteja ausente nas outras.
  // Afirmações de falta/ausência exigem inspeção de todo o bloco; por isso
  // nunca as classificamos como observação confirmada a partir de 1 citação.
  const unsupportedAbsence=/\\b(?:sem\\s+(?:valid|verific|chec|trat|defin|us|indic)|n[aã]o\\s+(?:existe|ha|há|aparece|possui|tem|encontr|mostra|esta|está|verific|valid)|falta|faltando|aus[eê]ncia|incomplet[oa]|n[aã]o\\s+foi\\s+(?:definid|implementad))\\b/i;
  if(unsupportedAbsence.test(normalize(interpretation)))return null;
  notes.push('L'+line+': '+clean(quote)+'\n  Interpretação da IA (a revisar): '+interpretation.trim());
 }
 if(!Array.isArray(record.uncertain)||record.uncertain.length>3||
    !record.uncertain.every(x=>typeof x==='string'&&x.length<=190))return null;
 if(typeof record.suggestion!=='string'||record.suggestion.length>450||
    typeof record.test!=='string'||record.test.length>300)return null;
 // Os riscos são cenários futuros, NÃO erros já comprovados. Sem percentuais inventados.
 const risks=record.risks===undefined?[]:record.risks;
 if(!Array.isArray(risks)||risks.length>3||
    !risks.every(r=>typeof r==='string'&&r.length>=10&&r.length<=220))return null;
 const text='LABORATÓRIO 2.0 — CITAÇÕES CONFERIDAS\n\n'+
  notes.join('\n\n')+
  '\n\nAinda não comprovado: '+(record.uncertain.length?record.uncertain.join(' / '):'Nenhum erro foi comprovado só pelas linhas citadas.')+
  '\n\nO que pode dar errado (hipóteses, não fatos): '+(risks.length?risks.join(' / '):'Exige investigação antes de afirmar riscos.')+
  '\n\nSugestão para revisão: '+record.suggestion+
  '\nTeste recomendado: '+record.test+
  '\n\nCitações verificadas no código. A interpretação não foi validada como defeito. Nenhum arquivo foi alterado.';
 return {text,evidenceSupported:true,evidenceLevel:'checked_quotes',observations:notes.length};
}

/** Plano de emergência quando a IA não segue o formato, falha ou cita fonte falsa. */
export function localLabReview(evidence:LabEvidence,objective:string):LabReview{
 const query=terms(objective);
 const scored=evidence.visibleLines.map(number=>{
  const code=evidence.lines[number];
  return {number,code,score:query.reduce((v,t)=>v+(normalize(code).includes(t)?1:0),0)};
 }).filter(item=>!item.code.startsWith('[')&&!item.code.includes('[LINHA DE CONFIGURAÇÃO OCULTA]')&&item.score>0)
  .sort((a,b)=>b.score-a.score||a.number-b.number).slice(0,5)
  .sort((a,b)=>a.number-b.number);
 const lines=scored.map(x=>'L'+x.number+': '+x.code.slice(0,170));
 return {
  text:'LABORATÓRIO 2.0 — EVIDÊNCIAS DIRETAS\n\n'+
   (lines.length?lines.join('\n'):'Não encontrei trechos relacionados à pergunta no código recebido.')+
   '\n\nA IA não apresentou uma análise suficientemente comprovada. '+
   'Essas linhas são reais, mas não confirmam erros. '+
   (evidence.truncated?'A amostra é parcial. ':'')+
   'Nenhum arquivo foi alterado.',
  evidenceSupported:false,evidenceLevel:'source_only',observations:lines.length
 };
}
