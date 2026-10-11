/**
 * Desafios V2: 16 cenários MAIS DIFÍCEIS, criados depois de congelar a
 * implementação do detector no commit c0008007d1382c78add1debd1113bc63a053e44e.
 * Verdade esperada: vínculo resolúvel por leitura GLOBAL dos arquivos
 * estáticos, não só pelas regras atualmente implementadas.
 * Rótulos são manuais, não revisão cega externa.
 */
import type {G2RouteChallenge} from '../../lib/g2-engineering-challenges';
import type {GraphSource} from '../../lib/g2-function-graph';
const sha='c'.repeat(40),ui='app/challenges/screen.tsx',route='app/api/challenge/route.ts';
const f=(path:string,content:string):GraphSource=>({path,content,sha});
const c=(id:string,expectedRouteLink:boolean,client:string,backend:string|null,
 additional:GraphSource[]=[]):G2RouteChallenge=>({
 id,title:id,entryPath:ui,entryFunction:'start',expectedRoutePath:route,
 expectedRouteLink,sources:[f(ui,client),...(backend===null?[]:[f(route,backend)]),...additional]
});
const handler="export async function POST(){return Response.json({ok:true});}";
export const G2_ENGINEERING_V2:readonly G2RouteChallenge[]=[
 c('complex-a01-template',true,
  'export function start(){return fetch(\`/api/challenge\`,{method:"POST"});}',handler),
 c('complex-a02-url-constant',true,[
  'const endpoint="/api/challenge";',
  'export function start(){return fetch(endpoint,{method:"POST"});}'
 ].join('\n'),handler),
 c('complex-a03-method-constant',true,[
  'const method="POST";',
  'export function start(){return fetch("/api/challenge",{method});}'
 ].join('\n'),handler),
 c('complex-a04-arrow-handler',true,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',
  'export const POST=async()=>Response.json({ok:true});'),
 c('complex-a05-reexport',true,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',
  "export {POST} from '@/lib/challenge/handler';",[
   f('lib/challenge/handler.ts',handler)
  ]),
 c('complex-a06-query',true,
  'export function start(){return fetch("/api/challenge?limit=1",{method:"POST"});}',handler),
 c('complex-a07-two-hop',true,[
  "import {begin} from '@/lib/challenge/client';",
  "export function start(){return begin();}"
 ].join('\n'),handler,[
  f('lib/challenge/client.ts',[
   "import {dispatch} from '@/lib/challenge/request';",
   "export function begin(){return dispatch();}"
  ].join('\n')),
  f('lib/challenge/request.ts',
   'export function dispatch(){return fetch("/api/challenge",{method:"POST"});}')
 ]),
 c('complex-a08-direct',true,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',handler),

 c('complex-b01-wrong-method',false,
  'export function start(){return fetch("/api/challenge",{method:"PUT"});}',handler),
 c('complex-b02-other-api',false,
  'export function start(){return fetch("/api/different",{method:"POST"});}',handler),
 c('complex-b03-not-exported',false,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',
  'async function POST(){return Response.json({ok:true});}'),
 c('complex-b04-unused-helper',false,[
  "import {unused} from '@/lib/challenge/request';",
  "export function start(){return 1;}"
 ].join('\n'),handler,[
  f('lib/challenge/request.ts',
   'export function unused(){return fetch("/api/challenge",{method:"POST"});}')
 ]),
 c('complex-b05-other-function',false,[
  "export function start(){return 1;}",
  'export function debug(){return fetch("/api/challenge",{method:"POST"});}'
 ].join('\n'),handler),
 c('complex-b06-dynamic-method',false,
  'export function start(verb:string){return fetch("/api/challenge",{method:verb});}',handler),
 c('complex-b07-no-backend',false,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',null),
 c('complex-b08-dynamic-url',false,
  'export function start(url:string){return fetch(url,{method:"POST"});}',handler)
];
