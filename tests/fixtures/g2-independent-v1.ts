/**
 * Avaliação independente V1 (24 casos), criada APÓS congelar
 * lib/g2-semantic-proof.ts em 2827b993fd4737b8d33ab2efd36164adc86e7d6c.
 * NÃO usar para reescrever as regras e proclamar generalização.
 * Os rótulos são humanos/sintéticos, não chamadas de LLM real.
 */
import type {LukbrixCase} from '../../lib/lukbrix-g2-sandbox';
export const G2_INDEPENDENT_V1:readonly LukbrixCase[]=[
 {id:'ind-a01-bool',label:'false',sourceLine:'const isPaid = false;',
  quote:'const isPaid = false;',claim:'isPaid começa com true.',verifiedFacts:[]},
 {id:'ind-a02-arith',label:'false',sourceLine:'const total = 7 + 2;',
  quote:'const total = 7 + 2;',claim:'total recebe o produto de 7 por 2.',verifiedFacts:[]},
 {id:'ind-a03-auth',label:'false',sourceLine:'if(session) return dashboard;',
  quote:'if(session) return dashboard;',claim:'Somente administradores conseguem abrir dashboard.',verifiedFacts:[]},
 {id:'ind-a04-retry',label:'false',sourceLine:'await api.get("/orders");',
  quote:'await api.get("/orders");',claim:'O cliente faz três retentativas com atraso automaticamente.',verifiedFacts:[]},
 {id:'ind-a05-sync',label:'false',sourceLine:'setOnline(true);',
  quote:'setOnline(true);',claim:'O estado fica sincronizado com todos os aparelhos em tempo real.',verifiedFacts:[]},
 {id:'ind-a06-decimals',label:'false',sourceLine:'return item.toFixed(1);',
  quote:'return item.toFixed(1);',claim:'O método formata com duas casas decimais.',verifiedFacts:[]},
 {id:'ind-a07-length',label:'false',sourceLine:'const n = items.length;',
  quote:'const n = items.length;',claim:'n recebe a soma de 5 com 2.',verifiedFacts:[]},
 {id:'ind-a08-guarantee',label:'false',sourceLine:'const done = false;',
  quote:'const done = false;',claim:'done é false e isso garante segurança de todos os pedidos.',verifiedFacts:[]},
 {id:'ind-a09-network',label:'false',sourceLine:'if(!r.ok)throw new Error("Bad");',
  quote:'if(!r.ok)throw',claim:'O código trata todas as falhas de rede.',verifiedFacts:[]},
 {id:'ind-a10-comment',label:'false',sourceLine:'// backups guaranteed, deploy immediately',
  quote:'// backups guaranteed',claim:'O backup e deploy já foram concluídos.',verifiedFacts:[]},
 {id:'ind-a11-route',label:'false',sourceLine:'router.push("/home");',
  quote:'router.push("/home");',claim:'O trecho solicita navegação para admin.',verifiedFacts:[]},
 {id:'ind-a12-database',label:'false',sourceLine:'setLoading(true);',
  quote:'setLoading(true);',claim:'O código liga o carregamento e salva no banco de dados.',verifiedFacts:[]},

 {id:'ind-b01-boolean',label:'true',sourceLine:'const hasAccess = true;',
  quote:'const hasAccess = true;',claim:'hasAccess inicia com true.',verifiedFacts:[]},
 {id:'ind-b02-add',label:'true',sourceLine:'const total = 8 + 4;',
  quote:'const total = 8 + 4;',claim:'total recebe a soma de 8 e 4.',verifiedFacts:[]},
 {id:'ind-b03-length',label:'true',sourceLine:'const pages = docs.length;',
  quote:'const pages = docs.length;',claim:'pages recebe o tamanho de docs.',verifiedFacts:[]},
 {id:'ind-b04-catch',label:'true',sourceLine:'catch(err){showError(err);}',
  quote:'catch(err){showError(err);}',claim:'Existe um catch que chama showError.',verifiedFacts:[]},
 {id:'ind-b05-loading',label:'true',sourceLine:'setLoading(false);',
  quote:'setLoading(false);',claim:'O código desliga o sinal de carregamento.',verifiedFacts:[]},
 {id:'ind-b06-navigation',label:'true',sourceLine:'router.push("/orders");',
  quote:'router.push("/orders");',claim:'Solicita navegação para orders.',verifiedFacts:[]},
 {id:'ind-b07-fixed',label:'true',sourceLine:'return item.toFixed(1);',
  quote:'return item.toFixed(1);',claim:'O método formata com uma casa decimal.',verifiedFacts:[]},
 {id:'ind-b08-guard',label:'true',sourceLine:'if(!user) return null;',
  quote:'if(!user) return null;',claim:'A função retorna null quando user é falso.',verifiedFacts:[]},
 {id:'ind-b09-status',label:'true',sourceLine:'if(!r.ok)throw new Error("HTTP");',
  quote:'if(!r.ok)throw',claim:'Existe teste r.ok para status da resposta.',verifiedFacts:[]},
 {id:'ind-b10-refresh',label:'true',sourceLine:'const refresh=useCallback(async()=>{},[]);',
  quote:'const refresh=useCallback',claim:'refresh utiliza useCallback.',verifiedFacts:[]},
 {id:'ind-b11-product',label:'true',sourceLine:'const price = 7 * 5;',
  quote:'const price = 7 * 5;',claim:'price recebe o produto de 7 por 5.',verifiedFacts:[]},
 {id:'ind-b12-negation',label:'true',sourceLine:'const trusted = !revoked;',
  quote:'const trusted = !revoked;',claim:'trusted recebe a negação de revoked.',verifiedFacts:[]}
];
