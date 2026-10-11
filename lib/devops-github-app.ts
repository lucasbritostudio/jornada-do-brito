import {createAppAuth} from '@octokit/auth-app';
import {DEVOPS_REPO} from './devops-policy';

const GITHUB_API='https://api.github.com';
type GithubAppConfig={appId:string;installationId:number;privateKey:string};

export function githubAppConfigPresent(){
 return Boolean(process.env.JORNADA_GITHUB_APP_ID &&
  process.env.JORNADA_GITHUB_INSTALLATION_ID &&
  process.env.JORNADA_GITHUB_APP_PRIVATE_KEY);
}
function settings():GithubAppConfig{
 const appId=process.env.JORNADA_GITHUB_APP_ID?.trim()||'';
 const installation=process.env.JORNADA_GITHUB_INSTALLATION_ID?.trim()||'';
 const privateKey=process.env.JORNADA_GITHUB_APP_PRIVATE_KEY||'';
 if(!/^\d+$/.test(appId)||!/^\d+$/.test(installation)||!privateKey)
  throw new Error('GITHUB_APP_NOT_CONFIGURED');
 return {appId,installationId:Number(installation),privateKey};
}
export async function githubReadToken(){
 const cfg=settings();
 const auth=createAppAuth(cfg);
 const credentials=await auth({
  type:'installation',installationId:cfg.installationId,
  repositoryNames:[DEVOPS_REPO.split('/')[1]],
  permissions:{contents:'read',actions:'read',pull_requests:'read',metadata:'read'}
 });
 if(!credentials.token)throw new Error('GITHUB_APP_AUTH_FAILED');
 return credentials.token;
}
export async function githubAppRead(path:string){
 const base='/repos/'+DEVOPS_REPO;
 const allowed=[
  base,
  base+'/actions/runs?per_page=8'
 ];
 if(!allowed.includes(path))throw new Error('GITHUB_PATH_NOT_ALLOWED');
 const token=await githubReadToken();
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(GITHUB_API+path,{
   method:'GET',signal:controller.signal,cache:'no-store',
   headers:{
    Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'jornada-dev-internal'
   }
  });
  if(!response.ok)throw new Error(response.status===403?'GITHUB_APP_PERMISSION_DENIED':
   'GITHUB_READ_FAILED_'+response.status);
  return await response.json() as Record<string,any>;
 }finally{clearTimeout(timeout);}
}
