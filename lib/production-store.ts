import { get, put, head, BlobNotFoundError } from '@vercel/blob';
import {emptyProduction, type ProductionData} from './production';
import {isBlobConflict} from './blob-conflict';

const PATH='jornada/production-v1.json';
const versions=new WeakMap<ProductionData,string|null>();
export class ProductionConflict extends Error {
  constructor(){super('Os dados foram atualizados em outra sessão; tente novamente.');this.name='ProductionConflict';}
}
export async function readProduction():Promise<ProductionData>{
  for(let attempt=0;attempt<6;attempt++){
    let before;
    try{before=await head(PATH);}catch(error){
      if(!(error instanceof BlobNotFoundError))throw error;
      const empty=emptyProduction();versions.set(empty,null);return empty;
    }
    const result=await get(PATH,{access:'private',useCache:false});
    if(!result)continue;
    const raw=await new Response(result.stream).json() as Partial<ProductionData>;
    let after;
    try{after=await head(PATH);}catch(error){if(error instanceof BlobNotFoundError)continue;throw error;}
    if(!before.etag||!after.etag)throw new Error('PRODUCTION_ETAG_MISSING');
    if(before.etag!==after.etag)continue;
    if(raw?.version!==1||!Array.isArray(raw.works)||!Array.isArray(raw.payments))throw new Error('PRODUCTION_INVALID_STATE');
    const state=raw as ProductionData;versions.set(state,after.etag);return state;
  }
  throw new ProductionConflict();
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
