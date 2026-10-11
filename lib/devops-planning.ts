import {githubReadToken} from './devops-github-app';
import {DEVOPS_REPO,safeDiagnosticLine,validateSourcePath} from './devops-policy';
import {selectLabEvidence} from './devops-lab-v2';

/**
 * Fase inicial do executor: permite examinar somente código de INTERFACE
 * previamente autorizado e criar plano. Nunca escreve no GitHub ou Vercel.
 */
export const PLANNABLE_FILES=[
 'app/desenvolvimento/console.tsx',
 'app/desenvolvimento/development.css',
 'app/producao/dashboard.tsx',
 'app/producao/production.css',
 'app/globals.css',
] as const;
export type PlannableFile=typeof PLANNABLE_FILES[number];
export function allowedPlanningPath(path:string):path is PlannableFile{
 return validateSourcePath(path)&&PLANNABLE_FILES.some(x=>x===path);
}
export function validPlanningObjective(input:unknown):input is string{
 return typeof input==='string'&&input.trim().length>=10&&input.trim().length<=650 &&
  !/-----BEGIN [\s\S]*?PRIVATE KEY-----/i.test(input);
}
export function safeSourceExcerpt(source:string,max=2800):string{
 if(typeof source!=='string')return '';
 const exclude=/\b(?:password|passwd|senha|secret|private[_-]?key|token|access[_-]?token|client[_-]?secret|api[_-]?key|authorization|bearer)\b\s*[:=]/i;
 return source.split('\n').map(s=>exclude.test(s)?'[LINHA DE CONFIGURAÇÃO OCULTA]':s)
  .join('\n').slice(0,max);
}

/** Evidência numerada com LINHAS COMPLETAS, nunca com corte em meio à linha. */
export type PlanningEvidence={excerpt:string;truncated:boolean;visibleLines:number[];totalLines:number};
export function buildPlanningEvidence(source:string,maxChars=7800):PlanningEvidence{
 const safe=safeSourceExcerpt(source,source.length+1000).split('\n');
 const numbered=safe.map((line,i)=>'L'+(i+1)+': '+line);
 const totalLines=numbered.length,all=numbered.join('\n');
 if(all.length<=maxChars)return {
  excerpt:all,truncated:false,visibleLines:numbered.map((_,i)=>i+1),totalLines
 };
 const notice='[FONTE PARCIAL: código ausente NÃO é código quebrado; não diagnostique omissões.]\n';
 const budget=Math.max(200,maxChars-notice.length-125);
 const headBudget=Math.floor(budget*0.7);
 let headEnd=0,used=0;
 for(const line of numbered){
  if(used+line.length+1>headBudget)break;
  used+=line.length+1;headEnd++;
 }
 let tailStart=numbered.length,tailUsed=0;
 for(let i=numbered.length-1;i>=headEnd;i--){
  if(tailUsed+numbered[i].length+1>budget-used)break;
  tailUsed+=numbered[i].length+1;tailStart=i;
 }
 const middle='[LINHAS L'+(headEnd+1)+' a L'+tailStart+
  ' OMITIDAS. Não julgue funções desse trecho sem consultá-lo.]';
 return {
  excerpt:notice+[...numbered.slice(0,headEnd),middle,...numbered.slice(tailStart)].join('\n'),
  truncated:true,totalLines,
  visibleLines:[...Array.from({length:headEnd},(_,i)=>i+1),
   ...Array.from({length:numbered.length-tailStart},(_,i)=>tailStart+i+1)]
 };
}

/** Divide amostras por linhas para respeitar o limite de 5 mil caracteres por mensagem da IA. */
export function splitPlanningEvidence(excerpt:string,maxChars=3500):string[]{
 const parts:string[]=[],lines=excerpt.split('\n');
 let part='';
 for(const line of lines){
  if(line.length>maxChars)throw new Error('DEVOPS_EVIDENCE_LINE_TOO_LONG');
  if(part&&part.length+line.length+1>maxChars){
   parts.push(part);part='';
  }
  part+=(part?'\n':'')+line;
 }
 if(part)parts.push(part);
 return parts;
}

/** Uma análise só pode citar linhas realmente enviadas ao modelo. */
export function proposalReferencesEvidence(text:string,visibleLines:number[]):boolean{
 const cited=[...text.matchAll(/\bL(\d{1,5})\b/g)].map(match=>Number(match[1]));
 if(!cited.length)return false;
 const visible=new Set(visibleLines);
 return cited.every(n=>visible.has(n));
}

/** Fallback barato e verificável: mostra só linhas reais, sem inventar erros. */
export function groundedPlanningFallback(excerpt:string,objective:string,maxLines=5):string{
 const normalize=(value:string)=>value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const question=normalize(objective);
 const ignored=new Set([
  'para','como','quero','pode','essa','esse','onde','mais','menos',
  'codigo','analise','analisar','verifique','verificar','central','desenvolvimento',
  'arquivo','tela','real','linhas','linha','cite','comprovam','respostas',
  'precisa','tenha','existe','corrija','melhore','completa','evidencias'
 ]);
 const words=[...new Set(question.match(/[a-z][a-z0-9_]{2,}/g)||[])]
  .filter(w=>!ignored.has(w));
 if(/carregament|espera|processand|loading|feedback/.test(question))
  words.push('busy','asking','consultando','analisando','disabled','loading');
 if(/\bask\b/.test(question))words.push('asking');
 const lines=excerpt.split('\n')
  .map(raw=>{const match=/^L(\d+): (.*)$/.exec(raw);return match?{
    number:Number(match[1]),code:match[2]
  }:null;}).filter((line):line is {number:number;code:string}=>line!==null);
 const rank=lines.map(line=>{
  const code=normalize(line.code);
  let score=words.reduce((value,word)=>value+(code.includes(word)?2:0),0);
  if(/\bask\b/.test(question)&&/\b(?:async\s+)?function\s+ask\b/.test(code))score+=7;
  if(/carregament|loading|feedback/.test(question)&&
    /(consultando|analisando|disabled=|setbusy\(|setasking\()/.test(code))score+=4;
  return {...line,score};
 }).filter(line=>line.score>0)
  .sort((a,b)=>b.score-a.score||a.number-b.number);
 const picked=rank.slice(0,maxLines).sort((a,b)=>a.number-b.number);
 const heading='A IA não sustentou o diagnóstico com linhas válidas. '+
  'Para não inventar, mostro trechos encontrados no código:';
 if(!picked.length)return heading+'\n\nNenhuma linha relacionada à pergunta foi encontrada na amostra. '+
  'Não é possível confirmar nem negar o problema com esta consulta.';
 return heading+'\n\n'+picked.map(line=>
  'L'+line.number+': '+(line.code.length>170?line.code.slice(0,170)+'…':line.code)
 ).join('\n')+'\n\nEsses trechos mostram o que existe, não comprovam falhas. '+
  'Nenhuma mudança foi executada.';
}

/** Uma resposta longa não pode terminar abruptamente no meio da linha. */
export function completePlanningText(text:string,maxChars=3600):string{
 if(text.length<=maxChars)return text.trim();
 const part=text.slice(0,maxChars);
 const at=Math.max(part.lastIndexOf('\n'),part.lastIndexOf('. '));
 return (at>maxChars/2?part.slice(0,at+1):part).trim()+
  '\n\n[Resposta abreviada. Peça uma análise mais específica para obter os detalhes.]';
}

export async function readPlanningSource(path:string,objective=''){
 if(!allowedPlanningPath(path))throw new Error('DEVOPS_PATH_NOT_ALLOWED');
 const token=await githubReadToken();
 const root='https://api.github.com/repos/'+DEVOPS_REPO;
 const headers={
  Authorization:'Bearer '+token,
  Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28',
  'User-Agent':'jornada-dev-planner'
 };
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8500);
 try{
  const branch=await fetch(root+'/branches/main',{headers,signal:controller.signal,cache:'no-store'});
  if(!branch.ok)throw new Error('DEVOPS_GITHUB_READ_FAILED');
  const b=await branch.json();
  if(typeof b?.commit?.sha!=='string'||!/^[0-9a-f]{40}$/.test(b.commit.sha))
   throw new Error('DEVOPS_INVALID_SOURCE');
  // Ler pelo SHA imutável impede que a fonte e o commit informado sejam diferentes.
  const source=await fetch(root+'/contents/'+path+'?ref='+b.commit.sha,{
   headers,signal:controller.signal,cache:'no-store'
  });
  if(!source.ok)throw new Error('DEVOPS_GITHUB_READ_FAILED');
  const f=await source.json();
  if(typeof b?.commit?.sha!=='string'||!/^[0-9a-f]{40}$/.test(b.commit.sha)||
      f.type!=='file'||typeof f.content!=='string'||
      f.encoding!=='base64'||Number(f.size)>22_000)
   throw new Error('DEVOPS_INVALID_SOURCE');
  const data=Buffer.from(f.content.replace(/\s+/g,''),'base64').toString('utf-8');
  if(data.length>22_000)throw new Error('DEVOPS_SOURCE_TOO_LARGE');
  // V2: seleção pelo objetivo, sem enviar arquivos completos ou chamar a IA mais vezes.
  const evidence=selectLabEvidence(safeSourceExcerpt(data,data.length+1000),objective);
  return {path,refSha:b.commit.sha,blobSha:safeDiagnosticLine(f.sha,40),...evidence};
 }finally{clearTimeout(timeout);}
}
