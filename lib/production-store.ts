import { get, put } from '@vercel/blob';
import {emptyProduction, type ProductionData} from './production';
import {isBlobConflict} from './blob-conflict';

const PATH='jornada/production-v1.json';
const versions=new WeakMap<ProductionData,string|null>();
export class ProductionConflict extends Error {
  constructor(){super('Os dados foram atualizados em outra sessão; tente novamente.');}
}
export async function readProduction():Promise<ProductionData>{
  const result=await get(PATH,{access:'private',useCache:false});
  if(!result){const empty=emptyProduction();versions.set(empty,null);return empty;}
  if(!result.blob.etag)throw new Error('PRODUCTION_ETAG_MISSING');
  const raw=await new Response(result.stream).json() as Partial<ProductionData>;
  if(raw?.version!==1||!Array.isArray(raw.works)||!Array.isArray(raw.payments))
    throw new Error('PRODUCTION_INVALID_STATE');
  const state=raw as ProductionData;
  versions.set(state,result.blob.etag);
  return state;
}
async function persistProduction(state:ProductionData){
  if(!versions.has(state))throw new Error('PRODUCTION_VERSION_REQUIRED');
  const etag=versions.get(state);
  state.updatedAt=new Date().toISOString();
  await put(PATH,JSON.stringify(state),{
    access:'private',contentType:'application/json',addRandomSuffix:false,
    allowOverwrite:Boolean(etag),...(etag?{ifMatch:etag}:{})
  });
}
export async function changeProduction<T>(mutate:(data:ProductionData)=>T):Promise<T>{
  // Callback must make only deterministic local mutations, never external sends.
  for(let attempt=0;attempt<6;attempt++){
    const state=await readProduction();
    const before=JSON.stringify({works:state.works,payments:state.payments});
    const value=mutate(state);
    // Retries/double-clicks are idempotent; avoid costly private Blob writes.
    if(JSON.stringify({works:state.works,payments:state.payments})===before)return value;
    try {await persistProduction(state);return value;}
    catch(error){
      if(!isBlobConflict(error)||attempt===5)throw error;
    }
  }
  throw new ProductionConflict();
}
