/**
 * O kit visual e a copy por tema de cada cliente (16/08/2026).
 *
 * Tudo aqui foi LIDO de alguma fonte, nunca inventado:
 *  - fonte, cor, ícone, logo → o que está cadastrado no projeto (CustomFont,
 *    BrandColor, Element, Logo) e o papel que o `BrandDNA.visualStyle` dá a
 *    cada um;
 *  - horário, preço, dias → a BASE DE CONHECIMENTO daquele cliente;
 *  - CTA → a lista de aprovados, quando a marca tem uma.
 *
 * 🔴 Regra que não se negocia: preço, horário, endereço e promoção só entram
 * na copy com lastro na base. O Wine Vix, por exemplo, declara que R$ 79,90 do
 * almoço executivo "é o único preço que pode aparecer em copy".
 */
import type { KitDeMarca, CopyDoTema } from './gerador-de-templates'

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'

export const KITS: Record<number, KitDeMarca> = {
  // ── Espeto Gaúcho ───────────────────────────────────────────────────────
  // Kit tipográfico OBRIGATÓRIO de três fontes (entrada ACTIVE "Kit
  // Tipográfico Oficial"): Bevan no título, Barlow Condensed no apoio e
  // Caveat SemiBold no fechamento manuscrito. O crivo da marca pergunta
  // "Fontes do kit tipográfico, nenhuma fora?".
  6: {
    projectId: 6,
    cliente: 'Espeto Gaúcho',
    corFundo: '#2B1A12',
    corTexto: '#FFFFFF',
    corAcento: '#F4301A',
    fonteTitulo: 'Bevan',
    pesoTitulo: 400,
    fonteApoio: 'Barlow Condensed',
    // Arquivo próprio para o peso — o DNA proíbe pedir bold a um Regular.
    fonteApoioForte: 'Barlow Condensed SemiBold',
    fonteAcento: 'Caveat SemiBold',
    pesoAcento: 600,
    caixaTitulo: 'uppercase',
    // A Caveat é "sempre em caixa baixa" (visualStyle) — o CTA é o
    // "fechamento humano em manuscrito", não um berro.
    caixaCta: 'none',
    logoUrl: `${BLOB}/projects/6/logos/1760564487128-logo-espeto-g.png`,
    logoRatio: 1.0991,
    // Leva CATEGORIZADA (a curada): elementos 389, 386 e 406. A leva antiga,
    // sem categoria, tem os mesmos arquivos duplicados.
    iconeRelogio: `${BLOB}/projects/6/elements/1785792110158-relogio-branco.png`,
    iconeLocal: `${BLOB}/projects/6/elements/1785792104921-pino-branco.png`,
    filete: `${BLOB}/projects/6/elements/1785792150386-separador-branco.png`,
    // Prato, não salão cheio: a primeira escolha era uma foto de casa lotada
    // e o texto competia com dezenas de rostos.
    fotoPlaceholder: `${BLOB}/uploads/user_3348L5utqkVPHDPW0cTFzGzsLnD/drive-1785814954260-CMT05107.jpg`,
  },

  // ── Wine Vix ────────────────────────────────────────────────────────────
  // DNA: headline Playfair Display ITALIC sempre, Title Case, creme com UMA
  // palavra em dourado. Apoio em Lato. Fundo chumbo, texto creme.
  11: {
    projectId: 11,
    cliente: 'Wine Vix',
    corFundo: '#2C3E50',
    corTexto: '#F9F7F2',
    corAcento: '#FCE77B',
    fonteTitulo: 'PlayfairDisplay MediumItalic',
    pesoTitulo: 500,
    fonteApoio: 'Lato Regular',
    caixaTitulo: 'none',
    tituloItalico: true,
    logoUrl: `${BLOB}/Logo.png`,
    logoRatio: 1,
    iconeRelogio: `${BLOB}/projects/11/elements/1785788570874-relogio-dourado.png`,
    iconeLocal: `${BLOB}/projects/11/elements/1785788564142-localizacao-dourado.png`,
    filete: `${BLOB}/projects/11/elements/1785799457011-filete-cta-dourado.png`,
    fotoPlaceholder: `${BLOB}/uploads/user_33lV8r06XupgO7K0lyLgoj1JJF3/drive-1784196200497-Burrata-cmt01552.jpg`,
  },
}

/**
 * A copy de cada tema. Escrita a partir do DNA + base do cliente.
 *
 * Wine Vix — restrições que a base impõe e que esta copy respeita:
 *  - CTA precisa ser cópia LITERAL de um dos seis aprovados;
 *  - proibido "imperdível", "corre", "últimas unidades", "aproveita agora";
 *  - proibido citar a chef Mariana Pilon (saiu da casa) — quem assina a comida
 *    é "a cozinha da casa";
 *  - domingo a casa FECHA, então nenhuma linha de serviço diz "todos os dias";
 *  - R$ 79,90 do executivo é o único preço autorizado em copy.
 */
export const COPY_POR_TEMA: Record<number, Record<string, CopyDoTema>> = {
  /**
   * Espeto Gaúcho — o que a conferência corrigiu na copy proposta:
   *  - os CINCO `tituloAcento` repetiam palavra do título e sairiam
   *    DUPLICADOS na arte; viraram continuação da manchete;
   *  - `churrasco-em-familia` levava a linha inteira de funcionamento e
   *    `tradicao-e-historia` levava o endereço. A regra aprendida de
   *    16/08/2026 (correção do Ciro) diz que horário e endereço entram
   *    APENAS na primeira arte do dia — nas demais o rodapé fica livre, "só
   *    a informação da própria oferta";
   *  - o ícone virou escolha da copy: relógio só onde há horário.
   * 🔴 EMOJI SAIU, apesar de a base autorizar ("1 ou 2 por arte, os da casa
   * são 🔥 ❤️"): o render server-side NÃO desenha emoji. A fonte da marca não
   * tem o glifo e o canvas não faz fallback para família de emoji, então sai
   * um retângulo vazio na arte. Medido no primeiro render deste lote, e o
   * acervo confirma: 17 páginas em produção têm emoji no texto da arte.
   * Emoji vale para a LEGENDA do post, não para dentro da peça.
   * Os CTAs são cópia literal da lista aprovada.
   */
  6: {
    'churrasco-em-familia': {
      preTitulo: 'Churrasco em família',
      titulo: 'A MESA FARTA\nE A FAMÍLIA',
      tituloAcento: 'REUNIDA',
      descricao: 'Porções generosas que servem até 3 pessoas, tempero caseiro e churrasco gaúcho de raiz. Aqui cabe todo mundo, tchê.',
      icone: null,
      cta: 'Chama a piazada!',
    },
    'promocoes-e-happy-hour': {
      preTitulo: 'Promoção do dia',
      titulo: 'PICANHA 500G\nCOM PREÇO',
      tituloAcento: 'PARCEIRO',
      descricao: 'Picanha 500g com farofa e vinagrete por R$ 89,90, a partir das 17h. Baita corte, servido do jeito gaúcho.',
      // Horário da PRÓPRIA oferta, não funcionamento da casa — por isso fica.
      servico: 'R$ 89,90 · a partir das 17h',
      icone: 'relogio',
      cta: 'Vem aproveitar!',
    },
    'cortes-e-pratos-especiais': {
      preTitulo: 'Destaque da casa',
      titulo: 'COSTELA NO BAFO\nQUE DESMANCHA',
      tituloAcento: 'NA BOCA',
      descricao: 'Costela no Bafo 1kg com creme de aipim, cozida devagar até ficar macia. Cortes selecionados e tempero caseiro, como é desde 84.',
      servico: 'Todo o cardápio também para retirada no balcão',
      icone: null,
      cta: 'Sente esse sabor!',
    },
    'area-kids-e-familia': {
      preTitulo: 'Clima de família',
      titulo: 'ÁREA KIDS EM\nDOIS ANDARES',
      tituloAcento: 'PRA CRIANÇADA',
      descricao: 'Enquanto a criançada se diverte no térreo e no andar de cima, a mesa segue farta e o papo corre solto.',
      servico: 'Área Kids no térreo e no andar superior',
      icone: null,
      cta: 'Chama a gurizada!',
    },
    'tradicao-e-historia': {
      preTitulo: 'Desde 1984',
      titulo: 'MAIS DE 40 ANOS\nDE CHURRASCO',
      tituloAcento: 'GAÚCHO DE RAIZ',
      descricao: 'Cortes selecionados, tempero caseiro e a mesma essência de quando começou. Churrasco de respeito, bah.',
      // Endereço saiu: só a primeira arte do dia o carrega.
      servico: 'Desde 1984',
      icone: null,
      cta: 'Vem viver esse sabor!',
    },
  },

  11: {
    harmonizacao: {
      preTitulo: 'Harmonização',
      titulo: 'O rótulo certo\npara cada',
      tituloAcento: 'prato',
      descricao: 'A equipe encontra o vinho que conversa com o que você escolheu.',
      servico: 'Segunda a sábado, das 10h às 22h',
      cta: 'A adega tem o rótulo certo para você',
    },
    'happy-hour': {
      preTitulo: 'Happy Hour',
      titulo: 'O tempo passa mais',
      tituloAcento: 'devagar',
      descricao: 'Vinhos selecionados com condições especiais, das 16h às 19h.',
      servico: 'Segunda a sábado, das 16h às 19h',
      cta: 'Venha nos visitar',
    },
    'almoco-executivo': {
      preTitulo: 'Almoço Executivo',
      titulo: 'Uma pausa que',
      tituloAcento: 'merece',
      descricao: 'Entrada, prato principal e sobremesa por R$ 79,90.',
      servico: 'Segunda a sexta, das 11h às 15h',
      cta: 'Reserve no direct',
    },
    festivais: {
      preTitulo: 'Festival',
      titulo: 'A cozinha da casa\nsai em',
      tituloAcento: 'viagem',
      descricao: 'Menu especial por temporada, montado pela cozinha da casa.',
      servico: 'Segunda a sábado, das 10h às 22h',
      cta: 'Reserve no direct',
    },
    celebracoes: {
      preTitulo: 'Para celebrar',
      titulo: 'Toda data pede\num bom',
      tituloAcento: 'brinde',
      descricao: 'Da taça a mais ao rótulo especial, a casa prepara o encontro.',
      servico: 'Segunda a sábado, das 10h às 22h',
      cta: 'Sua mesa já sente sua falta',
    },
    'ambiente-e-experiencia': {
      preTitulo: 'Adega e bistrô',
      titulo: 'Na Praia do Canto\ndesde',
      tituloAcento: '2009',
      descricao: 'Adega e bistrô no mesmo lugar, com rótulos de mais de quinze países.',
      servico: 'Segunda a sábado, das 10h às 22h',
      cta: 'Venha nos visitar',
    },
  },
}
