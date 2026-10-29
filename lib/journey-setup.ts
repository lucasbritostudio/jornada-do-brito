import type { WorkspaceState, ServiceOffering } from './types';

export const VIDEO_DELIVERY_LABEL = 'Até 72h por vídeo após a gravação e o recebimento dos materiais.';
const SETUP_KEY = 'jornada:approved-catalog-and-portfolio:2026-10-28';
export function approvedVideoServices(at: string): ServiceOffering[] {
  return [
    { id: 'brito-video-avulso', name: '1 vídeo para sua ideia', videoQuantity: 1, priceCents: 39700,
      description: 'Para apresentar seu negócio, divulgar uma novidade ou registrar um momento especial. Uma produção feita para mostrar o que importa e prender a atenção de quem assiste.' },
    { id: 'brito-video-pacote-3', name: 'Pacote com 3 vídeos', videoQuantity: 3, priceCents: 98700,
      description: 'Três vídeos para mostrar diferentes lados do seu negócio ou projeto. Mais conteúdo para você publicar ao longo dos dias, com um valor menor por vídeo.' },
    { id: 'brito-video-pacote-4', name: 'Pacote com 4 vídeos', videoQuantity: 4, priceCents: 100000,
      description: 'Quatro vídeos para manter seu trabalho em evidência e ter mais conteúdo para compartilhar. É o pacote com o menor valor por vídeo entre estas opções.' },
  ].map(item => ({ ...item, deliveryMode: 'video', deliveryLabel: VIDEO_DELIVERY_LABEL, published: true, createdAt: at, updatedAt: at }));
}
const portfolioCopy: Record<string, { original: string; title: string; description: string }> = {
  'f46e9124-b62c-4d38-b5b9-67ee147c60d1': { original: 'Pizzaria', title: 'Pizzaria — sabor em destaque', description: 'Um exemplo de vídeo para apresentar os produtos de uma pizzaria e despertar a vontade de experimentar.' },
  '975ed9d7-463e-45e8-a4b2-bd91ce5b4b88': { original: 'Aniversario', title: 'Aniversário de 15 anos', description: 'Um registro em vídeo para guardar a comemoração, os detalhes e os momentos desse dia.' },
  '53cabccf-bfb4-470c-b346-f5716779a836': { original: 'Inauguração', title: 'Inauguração — apresentação do negócio', description: 'Um vídeo de inauguração para apresentar um novo negócio ao público.' },
  '4dc3cd81-02be-4acc-81c3-8be228391d00': { original: 'Inauguração', title: 'Inauguração — registro do evento', description: 'O registro de uma inauguração para mostrar esse momento e compartilhar com quem não pôde estar presente.' },
  '1cfa243a-6612-494e-9e85-aa6971e82697': { original: 'Aniversario', title: 'Aniversário infantil', description: 'Uma lembrança em vídeo da festa, com os detalhes da comemoração e os momentos em família.' },
  'c9c23b60-a4ff-4ea3-95f7-7e5857b53d51': { original: 'Max iphone', title: 'Max iPhone — apresentação da loja', description: 'Um trabalho para apresentar a loja e aproximar o público do negócio.' },
};
/** Prepared locally. It takes effect only when this source is explicitly released.
 * Read-only upgrades never write to Blob; the marker is persisted by the next safe write.
 * Existing catalog entries and any owner-written portfolio copy are preserved. */
export function applyApprovedJourneySetup(state: WorkspaceState): WorkspaceState {
  if (state.importBatches.includes(SETUP_KEY)) return state;
  if (!state.serviceCatalog.length) state.serviceCatalog = approvedVideoServices(state.updatedAt);
  state.portfolioItems = state.portfolioItems.map(item => {
    const copy = portfolioCopy[item.id];
    if (!copy || item.title !== copy.original || item.description?.trim()) return item;
    return { ...item, title: copy.title, description: copy.description };
  });
  state.importBatches = [...state.importBatches, SETUP_KEY];
  return state;
}

export function serviceQuantity(service: Pick<ServiceOffering, 'deliveryMode' | 'videoQuantity'>) {
  return service.deliveryMode === 'video' ? (service.videoQuantity ?? 1) : 1;
}
export function validService(service: ServiceOffering) {
  const quantity = serviceQuantity(service);
  return Boolean(service.published && service.name?.trim() && service.description?.trim() &&
    Number.isSafeInteger(service.priceCents) && service.priceCents >= 0 && service.priceCents <= 100_000_000 &&
    Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 12);
}
