export type ProfessionalChecklistSection = {
  key: string;
  title: string;
  questions: string[];
};

export const VIDEO_PROFESSIONAL_METHOD: ProfessionalChecklistSection[] = [
  {
    key: 'context',
    title: 'Cliente e objetivo',
    questions: [
      'Quem é o cliente e o que ele quer resolver com este vídeo?',
      'O vídeo é para vender, informar, posicionar, agradecer, mostrar produto ou registrar algo?',
      'Quem é o público?',
      'Onde o vídeo será publicado?',
      'Qual ação o público deve ter depois de assistir?',
      'Quem aprova o material?',
      'Qual é o prazo e o que está incluído no valor?',
    ],
  },
  {
    key: 'message',
    title: 'Ideia e mensagem',
    questions: [
      'Qual é a única ideia principal que o público precisa entender?',
      'Qual sentimento o vídeo precisa passar?',
      'Qual é o gancho inicial?',
      'Qual é a prova ou argumento principal?',
      'Como termina?',
      'Existe chamada para ação?',
    ],
  },
  {
    key: 'location',
    title: 'Locação',
    questions: [
      'O que no ambiente ajuda a história?',
      'O que pode distrair?',
      'Qual posição de câmera cria melhor profundidade?',
      'Existe primeiro plano, assunto e fundo?',
      'A luz favorece o rosto ou produto?',
      'O áudio está utilizável?',
      'Existe espaço para movimentação?',
    ],
  },
  {
    key: 'composition',
    title: 'Composição',
    questions: [
      'O assunto principal está claro?',
      'Headroom está controlado?',
      'Existe lead room quando a pessoa olha ou se move?',
      'O fundo compete com o assunto?',
      'As linhas do ambiente atrapalham o rosto?',
      'O primeiro plano ajuda sem roubar atenção?',
      'O tamanho do plano tem função narrativa?',
    ],
  },
  {
    key: 'lens',
    title: 'Lente e distância',
    questions: [
      'A 1x resolve melhor?',
      'A 0.5x tem motivo de espaço, proximidade ou profundidade?',
      'O 2x está sendo usado com boa luz e intenção?',
      'A distância da câmera foi escolhida antes de usar zoom?',
      'A perspectiva favorece a história?',
    ],
  },
  {
    key: 'movement',
    title: 'Movimento',
    questions: [
      'Mover a câmera revela, acompanha ou intensifica algo?',
      'Se não existe motivo, a câmera deveria ficar parada?',
      'O modo do gimbal combina com o que a cena precisa contar?',
      'O movimento começa e termina limpo?',
    ],
  },
  {
    key: 'coverage',
    title: 'Cobertura',
    questions: [
      'Tenho plano de contexto?',
      'Tenho plano principal?',
      'Tenho o detalhe importante?',
      'Preciso de reação?',
      'Tenho imagem de apoio necessária para editar?',
      'Gravei som ambiente quando necessário?',
      'Deixei margem antes e depois da ação?',
    ],
  },
  {
    key: 'audio',
    title: 'Áudio',
    questions: [
      'A voz está clara?',
      'O microfone está perto o suficiente?',
      'Existe ruído que precisa ser resolvido antes de gravar?',
      'A música poderá ficar abaixo da fala sem esconder problema de captação?',
    ],
  },
  {
    key: 'light',
    title: 'Luz',
    questions: [
      'Rosto ou produto está legível?',
      'Existe luz lateral ou frontal melhor disponível?',
      'O fundo está muito mais claro que o assunto?',
      'Foco e exposição precisam ser travados?',
    ],
  },
  {
    key: 'delivery',
    title: 'Entrega',
    questions: [
      'O objetivo original foi atendido?',
      'O começo prende atenção sem demorar?',
      'Os cortes têm motivo?',
      'A música não cobre a voz?',
      'A cor está consistente?',
      'Textos e legendas estão corretos?',
      'Formato e resolução estão corretos?',
      'A revisão está dentro do combinado?',
      'A liberação final respeita a regra de pagamento?',
    ],
  },
];

export const CINEMA_DECISION_RULE =
  'intenção → posição da câmera → lente → composição → movimento';
