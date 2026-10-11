/**
 * Primeira bateria para o modelo Groq REAL, não para o verificador AST.
 * 12 casos artificiais, rótulos fixos e não enviados ao modelo.
 * Após primeira execução REAL, esta amostra torna-se conhecida.
 */
import type {LiveChallenge,LiveCause,LiveFix,LiveSource} from '../../lib/g2-live-benchmark';
const ui='app/studio/view.ts',route='app/api/orders/route.ts';
const f=(path:string,content:string):LiveSource=>({path,content});
const make=(id:string,scenario:string,client:string,server:string|null,
 expected:{linked:boolean;cause:LiveCause;fix:LiveFix;evidence:{file:string;line:number}[]},
 other:LiveSource[]=[]):LiveChallenge=>({
 id,scenario,entry:'send em '+ui,sources:[f(ui,client),
 ...(server===null?[]:[f(route,server)]),...other],expected
});
const valid={linked:true,cause:'linked' as const,fix:'none' as const,
 evidence:[{file:ui,line:1},{file:route,line:1}]};
const client="export function send(){return fetch('/api/orders',{method:'POST'});}";
const server="export async function POST(){return Response.json({ok:true});}";
export const G2_LIVE_BLIND_V1:readonly LiveChallenge[]=[
 make('live-a01-direct','A função send alcança a rota de pedidos?',client,server,valid),
 make('live-a02-default-get','A chamada fetch sem method alcança a rota?', 
  "export function send(){return fetch('/api/orders');}",
  "export function GET(){return Response.json({ok:true});}",valid),
 make('live-a03-import-alias','Identifique se a chamada importada alcança a rota.',
  "import {dispatch as call} from '@/lib/studio/sender';\nexport function send(){return call();}",
  server,{...valid,evidence:[{file:'lib/studio/sender.ts',line:1},{file:route,line:1}]},[
   f('lib/studio/sender.ts',
    "export function dispatch(){return fetch('/api/orders',{method:'POST'});}")
  ]),
 make('live-a04-constant','Método HTTP guardado em constante.',
  "const method='POST';\nexport function send(){return fetch('/api/orders',{method});}",
  server,{...valid,evidence:[{file:ui,line:2},{file:route,line:1}]}),
 make('live-a05-query','Parâmetro de consulta altera a rota?',
  "export function send(){return fetch('/api/orders?view=summary',{method:'POST'});}",
  server,valid),
 make('live-a06-reexport','Handler reexportado de módulo declarado.',
  client,"export {POST} from '../../../lib/api/orders';",
  {...valid,evidence:[{file:ui,line:1},{file:route,line:1},{file:'lib/api/orders.ts',line:1}]},[
   f('lib/api/orders.ts',server)
  ]),
 make('live-b01-http-mismatch','Verifique se métodos HTTP combinam.',
  "export function send(){return fetch('/api/orders',{method:'GET'});}",
  server,{linked:false,cause:'wrong_method',fix:'correct_http_method',
   evidence:[{file:ui,line:1},{file:route,line:1}]}),
 make('live-b02-missing-route','O arquivo da rota foi fornecido?',
  client,null,{linked:false,cause:'missing_route',fix:'add_missing_route',
   evidence:[{file:ui,line:1}]}),
 make('live-b03-private-handler','A função POST da rota está exportada?',
  client,"async function POST(){return Response.json({ok:true});}",
  {linked:false,cause:'not_exported',fix:'export_handler',
   evidence:[{file:route,line:1}]}),
 make('live-b04-unused-function','Apenas a função send é executada em hipótese.',
  "export function send(){return 1;}\nfunction forgotten(){return fetch('/api/orders',{method:'POST'});}",
  server,{linked:false,cause:'unreachable_call',fix:'invoke_helper',
   evidence:[{file:ui,line:1},{file:ui,line:2}]}),
 make('live-b05-unknown-path','O destino do fetch depende de parâmetro externo.',
  "export function send(url:string){return fetch(url,{method:'POST'});}",
  server,{linked:false,cause:'unknown_dynamic',fix:'gather_runtime_evidence',
   evidence:[{file:ui,line:1}]}),
 make('live-b06-wrong-route','Comparar caminho pedido pelo cliente e caminho da rota existente.',
  "export function send(){return fetch('/api/another',{method:'POST'});}",
  server,{linked:false,cause:'wrong_route',fix:'correct_route_path',
   evidence:[{file:ui,line:1},{file:route,line:1}]})
];
