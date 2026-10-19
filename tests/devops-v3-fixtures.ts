export const NOW=Date.parse('2026-10-19T14:00:00Z');
export const SHA='b2d789b6b4830b156d5d1f7233e07b2379544937';
export function monitorFixture(){
 return {
  checkedAt:NOW,metrics:{pending:0,inFlight:0,ambiguous:0,unresolved:0,queued:2,accepted:null as number|null,failed:1,recovered:1},
  health:{redis:'ok',evolution:'connected',qstash:'configured_not_verified',
   lastSignedWorkerSuccessAt:NOW-1000,qstashScheduleVerified:false},
  diagnostics:{acceptedCounter:'not_recorded',canaryOutbox:'not_linked'},
  canary:{state:'roundtrip_ok',testedAt:NOW-86400000},
 };
}
