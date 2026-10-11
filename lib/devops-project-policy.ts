/**
 * Contrato do futuro motor multiprojeto. Tipos + funções puras; NÃO ativa
 * edição, deploy, integração remota ou mudança de guardrails na Jornada.
 *
 * Políticas de PRODUTO são flexíveis, versionadas, por projeto.
 * Autorizações de INFRAESTRUTURA são concedidas fora das políticas por
 * instalação oficial + 2º fator, e nunca por texto de LLM.
 */
export type ProjectTechnology =
  'web'|'api'|'mobile'|'automation'|'desktop'|'data'|'other';
export type ProjectRuleType =
  'product'|'ux'|'architecture'|'quality'|'workflow'|'budget';
export type ProjectCapability =
  'diagnose'|'plan'|'generate_code'|'run_tests'|'open_pr'|'deploy'|'rollback';
export type ModelPurpose='chat'|'architecture'|'coding'|'review';
export type ModelPreference={
  purpose:ModelPurpose;
  provider:'groq'|'openrouter'|'other';
  model:string;
  dailyTokenBudget?:number;
};
export type ProjectRule={
  id:string;
  category:ProjectRuleType;
  instruction:string;
  enabled:boolean;
};
export type ProjectWorkspace={
  id:string;
  name:string;
  technology:ProjectTechnology;
  revision:number;
  repository?:string;
  deployment?:{provider:'vercel';teamId:string;projectId:string};
  rules:ProjectRule[];
  models:ModelPreference[];
  requestedCapabilities:ProjectCapability[];
  maxActionsPerDay:number;
  updatedAt:string;
};
export type ProjectGrants={
  repositories:string[]; // proved through GitHub App installation, not from the model
  vercelProjects:string[]; // exact project IDs, approved externally
  hasRecentStrongAuth:boolean;
  approvedReleaseSha?:string;
};
const ACTIONS:readonly ProjectCapability[]=[
 'diagnose','plan','generate_code','run_tests','open_pr','deploy','rollback'
];
const RULE_CATEGORIES:readonly ProjectRuleType[]=[
 'product','ux','architecture','quality','workflow','budget'
];
function validText(v:unknown,max:number){
 return typeof v==='string' && v.trim().length>0 && v.length<=max;
}
function validRepo(repo:string){
 return /^[A-Za-z0-9_.-]{1,90}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)
   && !repo.split('/').some(p=>p==='.'||p==='..');
}
/** Stops malformed configuration and accidental duplicate version/rules.
 * Do not treat these natural-language product rules as executable authority.
 */
export function validateProjectWorkspace(input:ProjectWorkspace):string[]{
 const issues:string[]=[];
 if(!validText(input.id,96)||!/^[a-zA-Z0-9_-]+$/.test(input.id))issues.push('invalid_id');
 if(!validText(input.name,120))issues.push('invalid_name');
 if(!Number.isSafeInteger(input.revision)||input.revision<1)issues.push('invalid_revision');
 if(input.repository&&!validRepo(input.repository))issues.push('invalid_repository');
 if(input.deployment&&(!validText(input.deployment.projectId,120)||!validText(input.deployment.teamId,120)))
  issues.push('invalid_deployment_scope');
 if(!Number.isSafeInteger(input.maxActionsPerDay)||input.maxActionsPerDay<0||input.maxActionsPerDay>100)
  issues.push('invalid_budget');
 if(!Array.isArray(input.requestedCapabilities)||
   input.requestedCapabilities.some(x=>!ACTIONS.includes(x)))issues.push('invalid_capability');
 if(!Array.isArray(input.rules)||input.rules.length>100)issues.push('invalid_rules');
 else{
  const ids=new Set<string>();
  for(const rule of input.rules){
   if(!validText(rule.id,80)||ids.has(rule.id)||!RULE_CATEGORIES.includes(rule.category)
     ||!validText(rule.instruction,3000)||typeof rule.enabled!=='boolean')
    issues.push('invalid_rule');
   ids.add(rule.id);
  }
 }
 if(!Array.isArray(input.models)||input.models.length>12)issues.push('invalid_models');
 else if(input.models.some(x=>!validText(x.model,120)||
   !['groq','openrouter','other'].includes(x.provider)||
   !['chat','architecture','coding','review'].includes(x.purpose)||
   (x.dailyTokenBudget!==undefined&&(!Number.isSafeInteger(x.dailyTokenBudget)||x.dailyTokenBudget<0))))
  issues.push('invalid_model');
 return [...new Set(issues)];
}
/** Choosing 'deploy' in business policy does NOT grant permission to deploy. */
export function canExecuteProjectAction(
 project:ProjectWorkspace,
 grants:ProjectGrants,
 action:ProjectCapability,
 requestedSha?:string,
){
 if(validateProjectWorkspace(project).length)return false;
 if(!project.requestedCapabilities.includes(action))return false;
 if(action==='diagnose'||action==='plan')return true;
 if(!project.repository||!grants.repositories.includes(project.repository))return false;
 if(action==='deploy'||action==='rollback'){
  if(!project.deployment||!grants.vercelProjects.includes(project.deployment.projectId))
   return false;
  if(!grants.hasRecentStrongAuth)return false;
  if(!requestedSha||requestedSha!==grants.approvedReleaseSha)return false;
 }
 // Important: for edits and releases, this is only a prerequisite. Backend
 // must still verify expiring signed approval, diff hash, CI and runner scope.
 return true;
}
export function proposeNextProjectRevision(
 previous:ProjectWorkspace,
 draft:Omit<ProjectWorkspace,'revision'|'updatedAt'>,
 at=new Date(),
):ProjectWorkspace{
 const proposed={...draft,revision:previous.revision+1,updatedAt:at.toISOString()};
 const issues=validateProjectWorkspace(proposed);
 if(issues.length)throw new Error('INVALID_WORKSPACE_POLICY:'+issues.join(','));
 if(previous.id!==proposed.id)throw new Error('PROJECT_ID_IMMUTABLE');
 return proposed;
}
