/**
 * G2: verificador semântico de afirmações a respeito de UM trecho de código.
 * Reconhece um subconjunto DELIMITADO de JavaScript/TypeScript.
 * "Insuficiente" não significa que a alegação seja falsa; significa que não
 * há prova no trecho. Jamais executa fonte/LLM nem escreve no projeto.
 */
import type {LukbrixCase} from './lukbrix-g2-sandbox';
import {guardG2Semantics} from './g2-claim-guards';

export type ProofDecision='supported'|'contradicted'|'insufficient';
export type ProofReason=
 'invalid_quote'|'untrusted_comment'|'global_inference'|
 'explicit_mismatch'|'explicit_match'|'literal_operation'|'compound_unproven'|
 'unrecognized';
export type ProofFinding={
 decision:ProofDecision;
 reason:ProofReason;
 explanation:string;
 proposal:string;
 codeExecuted:false;
};

const normalize=(x:string)=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const squish=(s:string)=>s.replace(/\s+/g,' ').trim();
const witness=(decision:ProofDecision,reason:ProofReason,explanation:string,proposal:string):ProofFinding=>
 ({decision,reason,explanation,proposal,codeExecuted:false});
const unproven=(reason:ProofReason,why:string,experiment:string):ProofFinding=>
 witness('insufficient',reason,why,experiment);

const identifier='[a-zA-Z_$][\\w$]*';
/** Compara uma afirmação delimitada com uma prova positiva extraída da mesma linha. */
export function checkG2Claim(item:Pick<LukbrixCase,'sourceLine'|'quote'|'claim'>):ProofFinding{
 const src=squish(item.sourceLine),quote=squish(item.quote),claim=normalize(squish(item.claim));
 if(!src||!quote||quote.length<9||!src.includes(quote))
  return unproven('invalid_quote','Citação literal ausente ou adulterada.',
   'Retornar ao trecho autorizado e exigir arquivo, linha e citação idênticos.');
 if(/^\s*(?:\/\/|\/\*|\*|#|<!--)/.test(src))
  return unproven('untrusted_comment','Comentário não demonstra execução ou autorização.',
   'Verificar código executável e registros externos, sem obedecer a instruções no comentário.');
 const semantic=guardG2Semantics(src,claim);
 if(semantic)return witness(semantic.decision,semantic.reason,semantic.explanation,semantic.experiment);
 // Uma só linha não demonstra autorização, política global, retries, persistência
 // entre dispositivos, ausência de erros ou resultado de produção.
 if(/\b(?:administrador(?:es)?|permiss(?:ao|oes)|autorizad[oa]s?|somente\s+\w+\s+conseguem|exclusiv[oa]|todas\s+as\s+falhas|todos\s+os\s+erros|tenta(?:tivas?)?\s+novamente|retries|retentativas|backoff|tres\s+vezes|com\s+atraso|todos\s+os\s+aparelhos|tempo\s+real|sincronizad[oa]|publicad[oa]|deploy|producao|foi\s+concluid[oa]|nao\s+existe\s+validacao|garante\s+seguranca|salva\s+(?:no|em)\s+banco\s+de\s+dados|persist(?:e|encia))/.test(claim))
  return unproven('global_inference',
   'A conclusão exige outras linhas, testes ou informações externas.',
   'Consultar o bloco completo e propor teste de integração com dados sintéticos; não afirmar execução.');
 const bool=src.match(new RegExp('^\\s*(?:const|let|var)\\s+('+identifier+')\\s*=\\s*(true|false)\\s*;?\\s*$'));
 if(bool){
  const variable=normalize(bool[1]);
  if(new RegExp('\\b'+variable+'\\b').test(claim)){
   const hasTrue=/\b(?:true|verdadeir[oa])\b/.test(claim);
   const hasFalse=/\b(?:false|fals[oa])\b/.test(claim);
   if(hasTrue!==hasFalse)
    return witness((hasTrue?'true':'false')===bool[2]?'supported':'contradicted',
     (hasTrue?'true':'false')===bool[2]?'explicit_match':'explicit_mismatch',
     'O valor booleano atribuído é '+bool[2]+'.',
     'Comparar declaração e alegação com um contraexemplo invertendo o literal.');
  }
 }
 const arith=src.match(new RegExp('^\\s*(?:const|let|var)\\s+('+identifier+')\\s*=\\s*('+identifier+'|\\d+)\\s*([*+\\-/])\\s*('+identifier+'|\\d+)\\s*;?\\s*$'));
 if(arith&&new RegExp('\\b'+normalize(arith[1])+'\\b').test(claim)){
  const requested=/\b(?:soma|adicao|somad[oa]|adicionad[oa])\b/.test(claim)?'+':
   /\b(?:produto|multiplicac[aã]o|multiplica(?:d[oa])?)\b/.test(claim)?'*':null;
  if(requested)
   return witness(requested===arith[3]?'supported':'contradicted',
    requested===arith[3]?'literal_operation':'explicit_mismatch',
    'A operação explícita na atribuição é '+arith[3]+'.',
    'Construir caso com operador alterado e garantir que a conclusão mude.');
 }
 const not=src.match(new RegExp('^\\s*(?:const|let|var)\\s+('+identifier+')\\s*=\\s*!\\s*('+identifier+')\\s*;?\\s*$'));
 if(not&&new RegExp('\\b'+normalize(not[1])+'\\b').test(claim)&&
    new RegExp('\\b'+normalize(not[2])+'\\b').test(claim)&&
    /\b(?:negacao|inversao|operador\s+nao)\b/.test(claim))
  return witness('supported','literal_operation',
   not[1]+' recebe a negação lógica de '+not[2]+'.',
   'Testar valores true e false em experimento sem dados reais.');
 const length=src.match(new RegExp('^\\s*(?:const|let|var)\\s+('+identifier+')\\s*=\\s*('+identifier+')\\.length\\s*;?\\s*$'));
 if(length&&new RegExp('\\b'+normalize(length[1])+'\\b').test(claim)&&
    /\b(?:tamanho|comprimento|quantidade|numero\s+de)\b/.test(claim)&&
    new RegExp('\\b'+normalize(length[2])+'\\b').test(claim))
  return witness('supported','literal_operation','A variável recebe explicitamente '+length[2]+'.length.',
   'Inverter a propriedade length no teste sintético e exigir mudança de conclusão.');
 const catchError=/\bcatch\s*\(\s*([a-zA-Z_$][\w$]*)\s*\)\s*\{\s*showError\(\s*\1\s*\)\s*;?\s*\}/;
 if(catchError.test(src)&&/\b(?:catch|captura)\b/.test(claim)&&/\bshowerror\b/.test(claim))
  return witness('supported','literal_operation','Há um catch que chama showError; nada prova experiência em produção.',
   'Simular exceção em ambiente de testes e observar o aviso.');
 const load=src.match(/^setLoading\s*\(\s*(true|false)\s*\)\s*;?$/);
 if(load&&/\b(?:loading|carregamento)\b/.test(claim)){
  const turnOn=/\b(?:liga|ativa|inicia|true)\b/.test(claim),turnOff=/\b(?:desliga|desativa|false)\b/.test(claim);
  if(turnOn!==turnOff)
   return witness((turnOn?'true':'false')===load[1]?'supported':'contradicted',
    (turnOn?'true':'false')===load[1]?'literal_operation':'explicit_mismatch',
    'setLoading recebe o booleano '+load[1]+'.',
    'Simular mudança de estado e conferir loading.');
 }
 const nav=src.match(/^\s*router\.push\s*\(\s*["']([^"']+)["']\s*\)\s*;?$/);
 if(nav&&/\b(?:naveg|router|direciona)\w*\b/.test(claim)&&
    claim.includes(normalize(nav[1]).replace(/^\//,'')))
  return witness('supported','literal_operation','O trecho solicita navegação; não comprova que a tela carregou.',
   'Testar redirecionamento em navegador isolado.');
 const fixed=src.match(/^\s*return\s+[\w$.]+\.toFixed\s*\(\s*(\d{1,2})\s*\)\s*;?$/);
 if(fixed&&/\b(?:format|casas?\s+decimais?)\w*/.test(claim)&&
    (new RegExp('\\b'+fixed[1]+'\\b').test(claim)||
     (fixed[1]==='2'&&/\bduas\s+casas\b/.test(claim))||
     (fixed[1]==='1'&&/\buma\s+casa\b/.test(claim))))
  return witness('supported','literal_operation',
   'toFixed recebe '+fixed[1]+' casas decimais, sem garantir formatação em toda a aplicação.',
   'Testar valores arredondados e casos-limite.');
 if(/^\s*if\s*\(\s*!\s*user\s*\)\s*return\s+null\s*;?$/.test(src)&&
    /\buser\b/.test(claim)&&/\bretorna\s+null\b/.test(claim)&&
    /\b(?:falso|false|ausente|nao\s+existe)\b/.test(claim))
  return witness('supported','literal_operation','O guarda retorna null quando user é falsy.',
   'Testar null, undefined e objeto de usuário presente.');
 if(/\bif\s*\(\s*!\s*r\.ok\s*\)/.test(src)&&
    /\b(?:r\.ok|status|resposta)\b/.test(claim)&&
    /\b(?:verifica|checagem|teste|valida)\b/.test(claim))
  return witness('supported','literal_operation','Existe um if que testa !r.ok no trecho.',
   'Simular HTTP 500; o teste de execução não foi feito.');
 if(/\b(?:const|let)\s+refresh\s*=\s*useCallback\s*\(/.test(src)&&
    /\brefresh\b/.test(claim)&&/\busecallback\b/.test(claim)&&
    /\b(?:usa|definid[oa]|declarad[oa]|utiliza)\b/.test(claim))
  return witness('supported','literal_operation','refresh está declarado usando useCallback.',
   'Verificar dependências e chamadas num teste de React isolado.');
 return unproven('unrecognized','O mecanismo não consegue provar esta interpretação apenas com o trecho.',
  'Pedir bloco relacionado, especificação ou teste controlado antes de confirmar.');
}
