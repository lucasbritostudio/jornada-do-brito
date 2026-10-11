import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 canExecuteProjectAction,validateProjectWorkspace,proposeNextProjectRevision,
 type ProjectWorkspace,type ProjectGrants
} from '../lib/devops-project-policy';

const project:ProjectWorkspace={
 id:'meu-app',name:'Projeto de testes',technology:'mobile',revision:1,
 repository:'meu-usuario/meu-aplicativo',
 deployment:{provider:'vercel',teamId:'team_teste',projectId:'prj_teste'},
 rules:[
  {id:'branding',category:'ux',enabled:true,instruction:'Interface simples e bonita'},
  {id:'custom-policy',category:'workflow',enabled:true,instruction:'A IA pode propor qualquer arquitetura para análise'}
 ],
 models:[{purpose:'coding',provider:'groq',model:'modelo-ficticio-de-teste',dailyTokenBudget:10000}],
 requestedCapabilities:['diagnose','plan','generate_code','run_tests','open_pr','deploy'],
 maxActionsPerDay:20,updatedAt:'2026-10-11T12:00:00.000Z'
};
const disconnected:ProjectGrants={repositories:[],vercelProjects:[],hasRecentStrongAuth:false};

test('pode configurar projetos independentes sem limitar tipo de aplicativo a Jornada',()=>{
 assert.deepEqual(validateProjectWorkspace(project),[]);
 const other={...project,id:'outro-app',technology:'api' as const,repository:'alguem/api'};
 assert.deepEqual(validateProjectWorkspace(other),[]);
});
test('regras de produto não substituem autorização de GitHub/Vercel',()=>{
 assert.equal(canExecuteProjectAction(project,disconnected,'plan'),true);
 assert.equal(canExecuteProjectAction(project,disconnected,'generate_code'),false);
 assert.equal(canExecuteProjectAction(project,disconnected,'deploy','releaseSHA'),false);
 const connected={...disconnected,repositories:['meu-usuario/meu-aplicativo']};
 assert.equal(canExecuteProjectAction(project,connected,'generate_code'),true);
 assert.equal(canExecuteProjectAction(project,connected,'deploy','releaseSHA'),false);
 const authorized={
  ...connected,vercelProjects:['prj_teste'],hasRecentStrongAuth:true,approvedReleaseSha:'releaseSHA'
 };
 assert.equal(canExecuteProjectAction(project,authorized,'deploy','releaseSHA'),true);
 assert.equal(canExecuteProjectAction(project,authorized,'deploy','outro-commit'),false);
 assert.equal(canExecuteProjectAction(project,authorized,'rollback','releaseSHA'),false);
});
test('política personalizável é versionada e o histórico anterior não é alterado',()=>{
 const at=new Date('2026-10-11T12:03:00Z');
 const revised=proposeNextProjectRevision(project,{
  ...project,name:'Novo nome',rules:[...project.rules,
    {id:'extra',category:'product',enabled:true,instruction:'Regra comercial definida pelo dono'}]
 },at);
 assert.equal(revised.revision,2);
 assert.equal(revised.updatedAt,at.toISOString());
 assert.equal(project.revision,1);
 assert.equal(project.rules.length,2);
 assert.equal(revised.rules.length,3);
});
test('não aceita escopo inválido, regras duplicadas e orçamento infinito',()=>{
 assert.ok(validateProjectWorkspace({...project,repository:'../.env'}).includes('invalid_repository'));
 assert.ok(validateProjectWorkspace({...project,maxActionsPerDay:Number.MAX_SAFE_INTEGER}).includes('invalid_budget'));
 assert.ok(validateProjectWorkspace({...project,rules:[project.rules[0],project.rules[0]]}).includes('invalid_rule'));
 assert.throws(()=>proposeNextProjectRevision(project,{...project,id:'outro-id'}),/PROJECT_ID_IMMUTABLE/);
});
