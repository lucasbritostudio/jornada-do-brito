import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState, saveState } from '@/lib/store';
import { isBlobConflict } from '@/lib/blob-conflict';

export const runtime = 'nodejs';

const liquid = new Set(['cash', 'bank', 'wallet']);
const cents = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const actionId = String(body?.actionId || '');
    if (!/^[\w:-]{8,120}$/.test(actionId)) {
      return NextResponse.json({ error: 'Identificador da operação inválido.' }, { status: 400 });
    }

    const state = await getState();
    if (state.transactions.some((item) => item.actionId === actionId)) {
      return NextResponse.json({ ok: true, alreadyApplied: true, state });
    }

    const amountCents = body.amountCents;
    if (!cents(amountCents)) {
      return NextResponse.json({ error: 'Informe um valor válido.' }, { status: 400 });
    }
    const from = state.financialAccounts.find((item) => item.id === body.fromAccountId && item.active);
    if (!from) return NextResponse.json({ error: 'Conta de origem não encontrada.' }, { status: 400 });
    const balance = from.currentBalanceCents ?? from.openingBalanceCents;
    if (amountCents > balance) return NextResponse.json({ error: 'Saldo insuficiente na conta escolhida.' }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    let transaction: (typeof state.transactions)[number];

    if (body.action === 'debt_payment') {
      const debt = state.debts.find((item) => item.id === body.debtId && item.status === 'active');
      if (!debt || !liquid.has(from.type)) return NextResponse.json({ error: 'Dívida ou conta de pagamento inválida.' }, { status: 400 });
      if (amountCents > debt.currentBalanceCents) return NextResponse.json({ error: 'O pagamento não pode superar o saldo da dívida.' }, { status: 400 });
      from.currentBalanceCents = balance - amountCents;
      from.balanceAsOf = today;
      debt.currentBalanceCents -= amountCents;
      debt.paidAmountCents = (debt.paidAmountCents || 0) + amountCents;
      if (debt.currentBalanceCents === 0) debt.status = 'settled';
      transaction = {
        id: crypto.randomUUID(), accountId: from.id, relatedDebtId: debt.id, actionId,
        type: 'expense', amountCents, occurredOn: today, category: 'Pagamento de dívida',
        description: `Pagamento: ${debt.creditorName}`, status: 'cleared', certainty: 'confirmed',
        createdAt: now, updatedAt: now,
      };
      audit(state, { action: 'finance.debt_payment', collection: 'debts', recordId: debt.id, summary: `Pagamento de dívida: ${debt.creditorName}` });
    } else if (body.action === 'reserve_transfer') {
      const to = state.financialAccounts.find((item) => item.id === body.toAccountId && item.active);
      if (!to || from.id === to.id || !((liquid.has(from.type) && to.type === 'reserve') || (from.type === 'reserve' && liquid.has(to.type)))) {
        return NextResponse.json({ error: 'Escolha uma conta de uso diário e uma conta de reserva.' }, { status: 400 });
      }
      const toBalance = to.currentBalanceCents ?? to.openingBalanceCents;
      from.currentBalanceCents = balance - amountCents;
      to.currentBalanceCents = toBalance + amountCents;
      from.balanceAsOf = today;
      to.balanceAsOf = today;
      transaction = {
        id: crypto.randomUUID(), accountId: from.id, targetAccountId: to.id, actionId,
        type: 'transfer', amountCents, occurredOn: today, category: 'Reserva',
        description: from.type === 'reserve' ? 'Retirada da reserva' : 'Aporte na reserva',
        status: 'cleared', certainty: 'confirmed', createdAt: now, updatedAt: now,
      };
      audit(state, { action: 'finance.reserve_transfer', collection: 'financialAccounts', recordId: to.id, summary: transaction.description });
    } else {
      return NextResponse.json({ error: 'Operação financeira inválida.' }, { status: 400 });
    }

    state.transactions.unshift(transaction);
    return NextResponse.json({ ok: true, state: await saveState(state) });
  } catch (error) {
    if (isBlobConflict(error)) return NextResponse.json({ error: 'Conflito ao salvar. Atualize os dados e tente novamente.' }, { status: 409 });
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    return NextResponse.json({ error: 'Não foi possível salvar a operação financeira.' }, { status: 500 });
  }
}
