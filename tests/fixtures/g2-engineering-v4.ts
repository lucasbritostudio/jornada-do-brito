import type {G2RouteChallenge} from '../../lib/g2-engineering-challenges';
import type {GraphSource} from '../../lib/g2-function-graph';
const sha='9'.repeat(40),ui='app/challenges/screen.tsx',route='app/api/challenge/route.ts';
const file=(path:string,content:string):GraphSource=>({path,content,sha});
const make=(id:string,expectedRouteLink:boolean,client:string,backend:string|null,
 extra:GraphSource[]=[]):G2RouteChallenge=>({
 id,title:id,entryPath:ui,entryFunction:'start',expectedRoutePath:route,expectedRouteLink,
 sources:[file(ui,client),...(backend===null?[]:[file(route,backend)]),...extra]
});
const post='export function POST(){return 1;}';
const request='export function start(){return fetch("/api/challenge",{method:"POST"});}';
export const G2_ENGINEERING_V4:readonly G2RouteChallenge[]=[
 make('round4-a01-relative-alias',true,request,
  "export {handle as POST} from '../../../lib/challenge/handler';",[
   file('lib/challenge/handler.ts','export function handle(){return 1;}')]),
 make('round4-a02-extension',true,request,
  "export {POST} from '../../../lib/challenge/handler.ts';",[
   file('lib/challenge/handler.ts',post)]),
 make('round4-a03-const-query',true,
  'const endpoint="/api/challenge?x=1";\nconst verb="POST";\nexport function start(){return fetch(endpoint,{method:verb});}',post),
 make('round4-a04-direct',true,request,post),
 make('round4-a05-computed-method',true,
  'export function start(){return fetch("/api/challenge",{["method"]:"POST"});}',post),
 make('round4-a06-delegate',true,
  "import {send} from '@/lib/challenge/send';\nexport function start(){return send();}",
  "export {POST} from '../../../lib/challenge/handler';",[
   file('lib/challenge/send.ts',
    'export function send(){return fetch("/api/challenge",{method:"POST"});}'),
   file('lib/challenge/handler.ts',post)]),
 make('round4-b01-type-only',false,request,
  "export type {POST} from '../../../lib/challenge/handler';",[
   file('lib/challenge/handler.ts',post)]),
 make('round4-b02-unprovided-target',false,request,
  "export {POST} from '../../../lib/challenge/absent';"),
 make('round4-b03-wrong-verb',false,
  'export function start(){return fetch("/api/challenge",{method:"PATCH"});}',post),
 make('round4-b04-missing-route',false,request,null),
 make('round4-b05-shadowed-url',false,
  'const endpoint="/api/challenge";\nexport function start(endpoint:string){return fetch(endpoint,{method:"POST"});}',post),
 make('round4-b06-unknown-method',false,
  'export function start(){return fetch("/api/challenge",{method:externalVerb});}',post)
];
