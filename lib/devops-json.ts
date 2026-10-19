/** Limita também requisições chunked, sem confiar em Content-Length. */
export async function readLimitedJson(stream:ReadableStream<Uint8Array>|null,maxBytes:number):Promise<unknown>{
 if(!stream)throw new Error('DEVOPS_JSON_INVALID');
 const reader=stream.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,text='';
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes){await reader.cancel();throw new Error('DEVOPS_PAYLOAD_TOO_LARGE');}
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  return JSON.parse(text) as unknown;
 }finally{reader.releaseLock();}
}
