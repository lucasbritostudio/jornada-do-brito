import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState, saveState } from '@/lib/store';
import { whatsappConfigured } from '@/lib/whatsapp-provider';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAuthenticated();
    const state = await getState();

    return NextResponse.json({
      configured: whatsappConfigured(),
      automationEnabled:
        state.settings.whatsappAutomation.enabled,
      humanTakeoverStopsAi:
        state.settings.whatsappAutomation.humanTakeoverStopsAi,
      safeRules: {
        greeting:
          state.settings.whatsappAutomation.allowAutoGreeting,
        briefing:
          state.settings.whatsappAutomation.allowBriefingQuestions,
        knownStatus:
          state.settings.whatsappAutomation.allowKnownStatusReplies,
        pricingNeedsHuman:
          state.settings.whatsappAutomation.requireHumanForPricing,
        complaintsNeedHuman:
          state.settings.whatsappAutomation.requireHumanForComplaints,
        contractsNeedHuman:
          state.settings.whatsappAutomation.requireHumanForContracts,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Não autorizado.' },
      { status: 401 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const enabled = body?.enabled === true;
    const state = await getState();

    if (enabled && !whatsappConfigured()) {
      return NextResponse.json(
        {
          error:
            'Conecte e valide a Meta antes de ligar respostas automáticas.',
        },
        { status: 409 },
      );
    }

    state.settings.whatsappAutomation.enabled = enabled;

    audit(state, {
      action: 'whatsapp.automation.global.changed',
      collection: 'settings',
      summary: enabled
        ? 'Respostas automáticas ligadas.'
        : 'Respostas automáticas desligadas.',
    });

    await saveState(state);

    return NextResponse.json({
      ok: true,
      configured: whatsappConfigured(),
      automationEnabled: enabled,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'UNAUTHORIZED'
    ) {
      return NextResponse.json(
        { error: 'Não autorizado.' },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: 'Não foi possível alterar a automação.' },
      { status: 500 },
    );
  }
}
