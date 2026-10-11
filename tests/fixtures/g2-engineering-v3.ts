/**
 * Avaliação V3: nova amostra após congelar o analisador no commit
 * da191e0ae21a07d14714f8f271f5e3952573eff6.
 * Rótulos escritos ANTES da execução. Não ajustá-lo depois e
 * reapresentar este conjunto como cego.
 */
import type {G2RouteChallenge} from '../../lib/g2-engineering-challenges';
import type {GraphSource} from '../../lib/g2-function-graph';
const sha='b'.repeat(40),ui='app/challenges/screen.tsx',route='app/api/challenge/route.ts';
const f=(path:string,content:string):GraphSource=>({path,content,sha});
const c=(id:string,expectedRouteLink:boolean,client:string,backend:string|null,
 other:GraphSource[]=[]):G2RouteChallenge=>({
 id,title:id,entryPath:ui,entryFunction:'start',expectedRoutePath:route,expectedRouteLink,
 sources:[f(ui,client),...(backend===null?[]:[f(route,backend)]),...other]
});
const post="export async function POST(){return Response.json({ok:true});}";
export const G2_ENGINEERING_V3:readonly G2RouteChallenge[]=[
 c('holdout-a01-local-const',true,[
  'export function start(){const uri="/api/challenge";',
  ' const method="POST";return fetch(uri,{method});}'
 ].join('\n'),post),
 c('holdout-a02-template-query',true,
  'export function start(){return fetch(`/api/challenge?x=1`,{method:"POST"});}',post),
 c('holdout-a03-export-alias',true,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',
  "export {handle as POST} from '@/lib/challenge/handler';",[
   f('lib/challenge/handler.ts','export async function handle(){return 1;}')
  ]),
 c('holdout-a04-relative-reexport',true,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',
  "export {POST} from '../../../lib/challenge/handler';",[
   f('lib/challenge/handler.ts',post)
  ]),
 c('holdout-a05-top-const',true,[
  'const uri="/api/challenge?client=synthetic";',
  'export function start(){return fetch(uri,{method:"POST"});}'
 ].join('\n'),post),
 c('holdout-a06-typed-const',true,[
  'const method: "POST" = "POST";',
  'export function start(){return fetch("/api/challenge",{method});}'
 ].join('\n'),post),
 c('holdout-a07-namespace-delegate',true,[
  "import * as helper from '@/lib/challenge/request';",
  "export function start(){return helper.send();}"
 ].join('\n'),post,[
  f('lib/challenge/request.ts',
   'export function send(){return fetch("/api/challenge",{method:"POST"});}')
 ]),
 c('holdout-a08-direct',true,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',post),

 c('holdout-b01-mutable-method',false,[
  'let method="POST";',
  'export function start(){return fetch("/api/challenge",{method});}'
 ].join('\n'),post),
 c('holdout-b02-param-shadow',false,[
  'const uri="/api/challenge";',
  'export function start(uri:string){return fetch(uri,{method:"POST"});}'
 ].join('\n'),post),
 c('holdout-b03-dynamic-template',false,
  'export function start(name:string){return fetch(`/api/${name}`,{method:"POST"});}',post),
 c('holdout-b04-wrong-handler',false,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',
  'export async function PUT(){return 1;}'),
 c('holdout-b05-missing-reexport-target',false,
  'export function start(){return fetch("/api/challenge",{method:"POST"});}',
  "export {POST} from '@/lib/challenge/missing';"),
 c('holdout-b06-unused-nested',false,[
  'export function start(){',
  ' const unused=()=>fetch("/api/challenge",{method:"POST"});',
  ' return 3;',
  '}'
 ].join('\n'),post),
 c('holdout-b07-invalid-method',false,
  'export function start(){return fetch("/api/challenge",{method:"POSTX"});}',post),
 c('holdout-b08-client-get-route-post',false,
  'export function start(){return fetch("/api/challenge");}',post)
];
