import {
 DEVOPS_REPO, DEVOPS_PROJECT_ID, DEVOPS_TEAM_ID,
 safeDiagnosticLine,
} from './devops-policy';

/** Read-only scoped connector; never accept arbitrary URL or project ID. */
const API_GITHUB='https://api.github.com';
const API_VERCEL='https://api.vercel.com';

async function fetchJson(url: string, token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const r = await fetch(url, {
      method:'GET', cache:'no-store', signal:controller.signal,
      headers: {
        Authorization:'Bearer '+token,
        Accept:'application/json',
        'User-Agent':'jornada-brito-dev-console',
        ...(url.startsWith(API_GITHUB) ? {'X-GitHub-Api-Version':'2022-11-28'}:{})
      }
    });
    if (!r.ok) {
      const err = new Error(r.status === 401 || r.status === 403
        ? 'Credencial sem autorização para o recurso'
        : 'Fonte indisponível: HTTP '+r.status);
      throw err;
    }
    return await r.json() as Record<string,any>;
  } finally { clearTimeout(timeout); }
}

async function githubStatus() {
  const token = process.env.JORNADA_DEV_GITHUB_READ_TOKEN;
  if (!token) return {
    connected:false,status:'not_connected',
    message:'A Jornada ainda não tem autorização própria de leitura no GitHub.',
    branch:'main', runs:[] as Array<{name:string;state:string;result:string|null;sha:string;url:string}>
  };
  try {
    const [repo, workflows] = await Promise.all([
      fetchJson(API_GITHUB+'/repos/'+DEVOPS_REPO,token),
      fetchJson(API_GITHUB+'/repos/'+DEVOPS_REPO+'/actions/runs?per_page=8',token)
    ]);
    const runs = Array.isArray(workflows.workflow_runs)?workflows.workflow_runs.slice(0,8).map((run:any)=>({
      name:safeDiagnosticLine(run.name,90),
      state:['completed','queued','in_progress','waiting'].includes(run.status)?run.status:'unknown',
      result:['success','failure','cancelled','skipped','timed_out','neutral'].includes(run.conclusion)?run.conclusion:null,
      sha:typeof run.head_sha==='string'?run.head_sha.slice(0,12):'',
      url:typeof run.html_url==='string'&&run.html_url.startsWith('https://github.com/'+DEVOPS_REPO+'/actions/runs/')?run.html_url:''
    })):[];
    return {
      connected:true,status:'ok',branch:safeDiagnosticLine(repo.default_branch,32)||'main',
      privateRepo:Boolean(repo.private),runs
    };
  }catch(e){
    return {connected:false,status:'error',
      message:safeDiagnosticLine(e instanceof Error?e.message:'GitHub indisponível'),branch:'main',runs:[]};
  }
}

async function vercelStatus() {
  const token=process.env.JORNADA_DEV_VERCEL_READ_TOKEN;
  if (!token)return {
    connected:false,status:'not_connected',
    message:'A Jornada ainda não tem autorização própria de leitura na Vercel.',
    deployments:[] as Array<{id:string;state:string;environment:string;url:string|null;createdAt:string|null}>
  };
  try {
    const q=new URLSearchParams({teamId:DEVOPS_TEAM_ID,projectId:DEVOPS_PROJECT_ID,limit:'6'});
    const result=await fetchJson(API_VERCEL+'/v6/deployments?'+q,token);
    const deployments=Array.isArray(result.deployments)?result.deployments.slice(0,6).map((v:any)=>({
      id:typeof v.uid==='string'?v.uid:typeof v.id==='string'?v.id:'',
      state:safeDiagnosticLine(v.readyState||v.state||'unknown',24),
      environment:safeDiagnosticLine(v.target||'unknown',24),
      url:typeof v.url==='string'&&/^[a-z0-9.-]+\.vercel\.app$/i.test(v.url)?'https://'+v.url:null,
      createdAt:typeof v.createdAt==='number'?new Date(v.createdAt).toISOString():null
    })):[];
    return {connected:true,status:'ok',deployments};
  }catch(e){
    return {connected:false,status:'error',
      message:safeDiagnosticLine(e instanceof Error?e.message:'Vercel indisponível'),deployments:[]};
  }
}


export async function getDevopsSnapshot() {
 const [github,vercel]=await Promise.all([githubStatus(),vercelStatus()]);
 return {
   mode:'read_only' as const, repository:DEVOPS_REPO,projectId:DEVOPS_PROJECT_ID,
   checkedAt:new Date().toISOString(),github,vercel,
   capabilities:{diagnostics:true,edit:false,deploy:false,rollback:false},
   nextStep:'Conectar GitHub App e Vercel de modo separado, com autorização do proprietário.'
 };
}
