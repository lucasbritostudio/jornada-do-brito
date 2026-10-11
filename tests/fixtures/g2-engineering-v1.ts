/**
 * Desafios de engenharia V1, rótulos definidos após congelar o analisador
 * G2 em ecb4391e620a2c2e173a2ad510ccb5abe57a6617.
 * 20 programas sintéticos, com fontes independentes em cada caso.
 * O conjunto passa a ser CONHECIDO após a primeira avaliação e vira regressão.
 */
import type {G2RouteChallenge} from '../../lib/g2-engineering-challenges';
import type {GraphSource} from '../../lib/g2-function-graph';
const sha='d'.repeat(40),ui='app/challenges/screen.tsx',route='app/api/challenge/route.ts';
const source=(path:string,content:string):GraphSource=>({path,content,sha});
const define=(id:string,expectedRouteLink:boolean,client:string,server:string|null,
 additions:GraphSource[]=[]):G2RouteChallenge=>({
 id,title:id,entryPath:ui,entryFunction:'start',expectedRoutePath:route,expectedRouteLink,
 sources:[source(ui,client),...(server===null?[]:[source(route,server)]),...additions]
});
const call=(method:string,endpoint='/api/challenge')=>
 "export async function start(){return fetch('"+endpoint+"',{method:'"+method+"'});}";
const server=(method:string)=>
 "export async function "+method+"(){return Response.json({ok:true});}";
export const G2_ENGINEERING_V1:readonly G2RouteChallenge[]=[
 define('engineering-a01-post',true,call('POST'),server('POST')),
 define('engineering-a02-default-get',true,
  "export async function start(){return fetch('/api/challenge');}",server('GET')),
 define('engineering-a03-put',true,call('PUT'),server('PUT')),
 define('engineering-a04-patch',true,call('PATCH'),server('PATCH')),
 define('engineering-a05-delete',true,call('DELETE'),server('DELETE')),
 define('engineering-a06-head',true,call('HEAD'),server('HEAD')),
 define('engineering-a07-options',true,call('OPTIONS'),server('OPTIONS')),
 define('engineering-a08-import-alias',true,[
  "import {send as sendRequest} from '@/lib/challenges/api';",
  "export function start(){return sendRequest();}"
 ].join('\n'),server('POST'),[
  source('lib/challenges/api.ts',"export async function send(){return fetch('/api/challenge',{method:'POST'});}")
 ]),
 define('engineering-a09-local-chain',true,[
  "export function start(){return send();}",
  "async function send(){return fetch('/api/challenge',{method:'POST'});}"
 ].join('\n'),server('POST')),
 define('engineering-a10-method-case',true,
  "export function start(){return fetch('/api/challenge',{method:'post'});}",
  server('POST')),
 define('engineering-b01-post-vs-get',false,call('POST'),server('GET')),
 define('engineering-b02-get-vs-post',false,
  "export function start(){return fetch('/api/challenge');}",server('POST')),
 define('engineering-b03-private-post',false,call('POST'),
  "async function POST(){return Response.json({ok:true});}"),
 define('engineering-b04-variable-method',false,
  "export function start(){return fetch('/api/challenge',{method:selectedMethod});}",
  server('POST')),
 define('engineering-b05-variable-url',false,
  "export function start(){return fetch(apiEndpoint,{method:'POST'});}",
  server('POST')),
 define('engineering-b06-unrelated-function',false,[
  "export function start(){return 100;}",
  "export function hidden(){return fetch('/api/challenge',{method:'POST'});}"
 ].join('\n'),server('POST')),
 define('engineering-b07-unused-import',false,[
  "import {send} from '@/lib/challenges/api';",
  "export function start(){return 100;}"
 ].join('\n'),server('POST'),[
  source('lib/challenges/api.ts',"export function send(){return fetch('/api/challenge',{method:'POST'});}")
 ]),
 define('engineering-b08-missing-route',false,call('POST'),null),
 define('engineering-b09-query-string',false,
  "export function start(){return fetch('/api/challenge?token=synthetic-secret',{method:'POST'});}",
  server('POST')),
 define('engineering-b10-wrong-route',false,call('POST','/api/other'),
  server('POST'),[
   source('app/api/other/route.ts',"export async function GET(){return 1;}")
 ])
];
