import {DEVOPS_REPO} from './devops-policy';
import {canExecuteProjectAction,type ProjectWorkspace} from './devops-project-policy';

// Registro do servidor, não configurável por prompt, snapshot ou parâmetro URL.
// Registrar um alvo NÃO concede acesso à sua instalação ou infraestrutura.
export const OBSERVATION_PROJECTS = {
 jornada: {name:'Jornada do Brito',repository:DEVOPS_REPO},
 chefebot: {name:'ChefeBot',repository:'luk8nhassil-maker/-chefebot'},
} as const;
export type ObservationProjectId=keyof typeof OBSERVATION_PROJECTS;

export function observationProject(id:unknown){
 if(typeof id!=='string'||!Object.hasOwn(OBSERVATION_PROJECTS,id))
  throw new Error('DEVOPS_PROJECT_DENIED');
 const projectId=id as ObservationProjectId;
 const registered=OBSERVATION_PROJECTS[projectId];
 const workspace:ProjectWorkspace={
  id:projectId,name:registered.name,repository:registered.repository,
  technology:'web',revision:1,rules:[],models:[],requestedCapabilities:['diagnose'],
  maxActionsPerDay:0,updatedAt:'2026-10-19T00:00:00.000Z',
 };
 if(!canExecuteProjectAction(workspace,{
  repositories:[],vercelProjects:[],hasRecentStrongAuth:false,
 },'diagnose'))throw new Error('DEVOPS_PROJECT_DENIED');
 return {id:projectId,...registered,mode:'read_only' as const};
}

export function pilotConnection(){
 const configured=Boolean(process.env.JORNADA_CHEFEBOT_MONITOR_TOKEN?.length && process.env.JORNADA_CHEFEBOT_MONITOR_TOKEN.length>=32);
 return {
  project:observationProject('chefebot'),outcome:'INCONCLUSIVO' as const,
  connected:false,configured,
  reason:configured?'Credenciais de leitura configuradas. O sucesso depende de uma coleta remota autenticada.':'A identidade exclusiva de leitura do ChefeBot ainda não está configurada.',
  requiredSource:'https://chefedapizza.com.br/api/dev/observability/jornada',
  productionWrites:false,
 };
}
