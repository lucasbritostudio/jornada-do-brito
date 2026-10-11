import {githubReadToken} from './devops-github-app';
import {DEVOPS_REPO,safeDiagnosticLine,validateSourcePath} from './devops-policy';

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
export function safeSourceExcerpt(source:string,max=8500):string{
 if(typeof source!=='string')return '';
 const exclude=/\b(?:password|passwd|senha|secret|private_key|token|api[_-]?key)\b\s*[:=]/i;
 return source.split('\n').map(s=>exclude.test(s)?'[LINHA DE CONFIGURAÇÃO OCULTA]':s)
  .join('\n').slice(0,max);
}
export async function readPlanningSource(path:string){
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
  const [branch,source]=await Promise.all([
   fetch(root+'/branches/main',{headers,signal:controller.signal,cache:'no-store'}),
   fetch(root+'/contents/'+path+'?ref=main',{headers,signal:controller.signal,cache:'no-store'})
  ]);
  if(!branch.ok||!source.ok)throw new Error('DEVOPS_GITHUB_READ_FAILED');
  const b=await branch.json(),f=await source.json();
  if(typeof b?.commit?.sha!=='string'||!/^[0-9a-f]{40}$/.test(b.commit.sha)||
      f.type!=='file'||typeof f.content!=='string'||
      f.encoding!=='base64'||Number(f.size)>22_000)
   throw new Error('DEVOPS_INVALID_SOURCE');
  const data=Buffer.from(f.content.replace(/\s+/g,''),'base64').toString('utf-8');
  if(data.length>22_000)throw new Error('DEVOPS_SOURCE_TOO_LARGE');
  return {path,refSha:b.commit.sha,blobSha:safeDiagnosticLine(f.sha,40),
    excerpt:safeSourceExcerpt(data),truncated:data.length>8500};
 }finally{clearTimeout(timeout);}
}
