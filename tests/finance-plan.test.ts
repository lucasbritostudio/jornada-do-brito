import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFinancePlan } from '../lib/finance-plan';
import type { Debt, FinancialObligation, Transaction } from '../lib/types';

const transaction = (id:string, month:string, type:'income'|'expense', cents:number, category='Trabalho'):Transaction => ({id,type,amountCents:cents,occurredOn:`${month}-10`,category,description:id,status:'cleared',createdAt:'',updatedAt:''});
const debt:Debt={id:'d1',creditorName:'Credor',originalAmountCents:50000,currentBalanceCents:40000,monthlyCommitmentCents:5000,status:'active',createdAt:'',updatedAt:''};
const obligation:FinancialObligation={id:'o1',title:'Internet',amountCents:8000,kind:'personal',status:'planned',dueDate:'2026-01-10',recurring:true,createdAt:'',updatedAt:''};

test('calcula limites com histórico e previsão de contas recorrentes',()=>{
  const plan=buildFinancePlan({now:new Date('2026-04-20T12:00:00Z'),transactions:[transaction('i1','2026-01','income',100000),transaction('i2','2026-02','income',120000),transaction('i3','2026-03','income',110000),transaction('e1','2026-01','expense',20000,'Mercado'),transaction('e2','2026-02','expense',22000,'Mercado'),transaction('e3','2026-03','expense',18000,'Mercado')],obligations:[obligation],debts:[debt],accounts:[]});
  assert.equal(plan.averageIncomeCents,110000);
  assert.equal(plan.monthlySurplusCents,90000);
  assert.equal(plan.untrackedRecurringCents,8000);
  assert.equal(plan.plannedMonthlySurplusCents,82000);
  assert.equal(plan.suggestedLimits[0].limitCents,18000);
  assert.deepEqual(plan.forecast.map((item)=>item.totalCents),[8000,8000,8000]);
  assert.equal(plan.reserveTargetCents,60000);
  assert.equal(plan.reserveMonthlyCents,8200);
  assert.equal(plan.debtPlan[0].monthlyPlanCents,40000);
});

test('não inventa orçamento sem histórico e não prevê aporte sem sobra',()=>{
  const plan=buildFinancePlan({now:new Date('2026-04-20T12:00:00Z'),transactions:[],obligations:[],debts:[],accounts:[]});
  assert.equal(plan.averageIncomeCents,null);
  assert.equal(plan.monthlySurplusCents,null);
  assert.equal(plan.suggestedLimits.length,0);
  assert.equal(plan.reserveMonthlyCents,0);
});
