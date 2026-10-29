import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getState, audit } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import { isBlobConflict } from '@/lib/blob-conflict';
import { serviceQuantity, validService, VIDEO_DELIVERY_LABEL } from '@/lib/journey-setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const state = await getState();
    const services = state.serviceCatalog.filter(validService).map(({ id, name, description, priceCents, deliveryMode, deliveryLabel, videoQuantity }) => ({ id, name, description, priceCents, deliveryMode, videoQuantity: deliveryMode === 'video' ? (videoQuantity ?? 1) : undefined, deliveryLabel: deliveryMode === 'video' ? VIDEO_DELIVERY_LABEL : deliveryLabel }));
    return NextResponse.json({ brand: state.profile.displayName, services }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Catálogo indisponível.' }, { status: 503 }); }
}
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 12_000) return NextResponse.json({ error: 'Pedido muito grande.' }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
    if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true });
    const text = (key: string, max: number) => typeof body[key] === 'string' ? body[key].trim().slice(0, max) : '';
    const id = text('requestId', 80), portalToken = text('portalToken', 100), name = text('name', 120), email = text('email', 254).toLowerCase(), phone = text('phone', 40), serviceId = text('serviceId', 100), note = text('note', 1200), objective = text('objective', 800), desiredDate = text('desiredDate', 10), location = text('location', 200);
    const phoneDigits = phone.replace(/\D/g, '');
    if (!/^[\w-]{20,80}$/.test(id) || !/^[\w-]{30,100}$/.test(portalToken) || name.length < 2 || (!email && !phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (phone && (!/^[+\d\s().-]+$/.test(phone) || phoneDigits.length < 8 || phoneDigits.length > 15)) || body.consent !== true) return NextResponse.json({ error: 'Confira seu nome, e-mail ou telefone e a autorização para receber retorno.' }, { status: 400 });
    const tokenHash = createHash('sha256').update(portalToken).digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify([serviceId, name, email, phoneDigits, note, objective, desiredDate, location])).digest('hex');
    let duplicate = false;
    await mutateStateSafely(state => {
      const previous = state.clientRequests.find(item => item.id === id);
      if (previous) {
        if (previous.portalTokenHash !== tokenHash || previous.serviceId !== serviceId || (previous.requestFingerprint && previous.requestFingerprint !== fingerprint)) throw new Error('REQUEST_CONFLICT');
        duplicate = true; return;
      }
      const service = state.serviceCatalog.find(item => item.id === serviceId && validService(item));
      if (!service) throw new Error('SERVICE_UNAVAILABLE');
      if (service.deliveryMode === 'video' && objective.length < 10) throw new Error('OBJECTIVE_REQUIRED');
      if (desiredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate) || !isRealDate(desiredDate) || desiredDate < saoPauloDate())) throw new Error('INVALID_DESIRED_DATE');
      if (state.clientRequests.length >= 5000 || state.opportunities.length >= 10000) throw new Error('REQUEST_LIMIT');
      const at = new Date().toISOString();
      // A public form never changes the owner's existing contact details.
      let contact = state.contacts.find(item => {
        const sameEmail = Boolean(email && item.email?.toLowerCase() === email), samePhone = Boolean(phoneDigits && item.phone?.replace(/\D/g, '') === phoneDigits);
        const conflict = (email && item.email && !sameEmail) || (phoneDigits && item.phone && !samePhone);
        return !conflict && (sameEmail || samePhone);
      });
      if (!contact) { contact = { id: crypto.randomUUID(), name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), lifecycle: 'prospect', source: 'site_jornada', createdAt: at, updatedAt: at }; state.contacts.unshift(contact); }
      const opportunityId = `public-opportunity-${id}`;
      state.opportunities.unshift({ id: opportunityId, contactId: contact.id, title: service.name, stage: 'new', estimatedValueCents: service.priceCents, certainty: 'pending', notes: note || undefined, importKey: `public-request:${id}`, provenance: { kind: 'system', label: 'Pedido pelo site' }, createdAt: at, updatedAt: at });
      state.clientRequests.unshift({ id, contactId: contact.id, opportunityId, serviceId, serviceName: service.name, deliveryMode: service.deliveryMode, agreedPriceCents: service.priceCents, videoQuantity: service.deliveryMode === 'video' ? serviceQuantity(service) : undefined, deliveryLabel: service.deliveryMode === 'video' ? VIDEO_DELIVERY_LABEL : service.deliveryLabel, deliveryClockMode: service.deliveryMode === 'video' ? 'after_capture_and_materials' : undefined, objective: objective || undefined, desiredDate: desiredDate || undefined, location: location || undefined, note: note || undefined, portalTokenHash: tokenHash, requestFingerprint: fingerprint, status: 'pending', createdAt: at, updatedAt: at });
      audit(state, { action: 'client_request.created', collection: 'clientRequests', recordId: id, summary: service.name });
    });
    return NextResponse.json({ ok: true, id }, { status: duplicate ? 200 : 201 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'REQUEST_CONFLICT') return NextResponse.json({ error: 'Este envio já foi usado com outros dados. Confira seu pedido pelo link de acompanhamento.' }, { status: 409 });
    if (reason === 'OBJECTIVE_REQUIRED') return NextResponse.json({ error: 'Conte em poucas palavras o que você quer mostrar e alcançar com o vídeo.' }, { status: 400 });
    if (reason === 'INVALID_DESIRED_DATE') return NextResponse.json({ error: 'Escolha uma data de hoje em diante ou deixe a data em branco.' }, { status: 400 });
    if (reason === 'SERVICE_UNAVAILABLE') return NextResponse.json({ error: 'Esse serviço não está disponível. Atualize o catálogo.' }, { status: 400 });
    if (reason === 'REQUEST_LIMIT') return NextResponse.json({ error: 'Não foi possível receber novos pedidos agora.' }, { status: 503 });
    if (isBlobConflict(error) || reason === 'STATE_WRITE_CONFLICT') return NextResponse.json({ error: 'Outra atualização ocorreu. Tente enviar novamente; seu pedido não será duplicado.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível enviar o pedido. Tente novamente.' }, { status: 500 });
  }
}

function saoPauloDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function isRealDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
