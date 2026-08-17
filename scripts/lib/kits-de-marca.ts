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
/** Namespace de upload das fotos do Empório — não é asset de projeto, então
 *  não se auto-verifica; a prova de pertencimento é a referência nas páginas. */
const U = `${BLOB}/uploads/user_3GVFL7SwqXDxP2CpwdgxlNqvGtI`

export const KITS: Record<number, KitDeMarca> = {
  // ── TERO ────────────────────────────────────────────────────────────────
  // O TERO é a marca de onde o padrão de 3 layouts saiu — os "Story base"
  // dele e do Wine Vix foram a referência do gerador inteiro.
  3: {
    projectId: 3,
    cliente: 'TERO',
    corFundo: '#130D0A',
    corTexto: '#F8F2F0',
    corAcento: '#EF7B4F',
    fonteTitulo: 'Didot HTF B06 Bold',
    // 700 é o que os modelos aprovados do próprio cliente usam.
    pesoTitulo: 700,
    fonteApoio: 'Montserrat',
    fonteApoioForte: 'Montserrat SemiBold',
    caixaTitulo: 'uppercase',
    caixaServico: 'uppercase',
    caixaCta: 'uppercase',
    logoUrl: `${BLOB}/projects/3/logos/1759897315226-TERO_brasaevinho-branco.png`,
    logoRatio: 0.4295,
    iconeRelogio: `${BLOB}/projects/3/elements/1785788523760-relogio-ambar.png`,
    iconeLocal: `${BLOB}/projects/3/elements/1785788516731-localizacao-ambar.png`,
    filete: `${BLOB}/projects/3/elements/1785788543066-filete-losango-ambar.png`,
    fotoPlaceholder: `${BLOB}/uploads/user_3348L5utqkVPHDPW0cTFzGzsLnD/drive-1786670984150-ancho-cmt03464.jpg`,
  },

  // ── O Quintal Parrilla ──────────────────────────────────────────────────
  // A manchete alterna DUAS vozes: primeira linha em DomaniCP, segunda inteira
  // em Amithen, maior, "encostando quase na linha de cima" (composition).
  2: {
    projectId: 2,
    cliente: 'O Quintal Parrilla',
    corFundo: '#1F1B16',
    corTexto: '#F5F0E8',
    // ⚠️ #7A9A5C aparece UMA vez no DNA, e no approvalChecklist — a seção que
    // por regra da casa NÃO é instrução. Não está em BrandColor (que tem o
    // verde-sage #547737) nem na tabela de paleta. É a única com contraste
    // sobre fundo escuro: o DNA proíbe o verde-sage como texto pequeno ali.
    // Cadastrar #7A9A5C como "verde-folha-clara" resolve a pendência.
    corAcento: '#7A9A5C',
    fonteTitulo: 'DomaniCP',
    pesoTitulo: 400,
    fonteTituloAcento: 'Amithen',
    escalaTituloAcento: 1.25,
    fonteApoio: 'Acumin Pro Book',
    fonteApoioForte: 'Acumin Pro Semibold',
    caixaTitulo: 'none',
    caixaServico: 'none',
    caixaCta: 'none',
    logoUrl: `${BLOB}/projects/2/logos/1759895328790-Ativo_1logo.png`,
    logoRatio: 0.2654,
    // Ambiente, não prato: a foto anterior era de SOBREMESA (da única
    // página-modelo do cliente, do almoço executivo) e ficava embaixo de
    // "Cortes na Brasa" e de "Chope e Drinks". Esta é a fachada do quintal —
    // neutra, e a cara da marca. A foto de cada peça se escolhe no uso.
    fotoPlaceholder: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/uploads/user_33lV8r06XupgO7K0lyLgoj1JJF3/drive-1776642812221-8F3A8553.jpg',
  },

  // ── Empório Fonseca ─────────────────────────────────────────────────────
  // 🔴 ZERO elementos gráficos utilizáveis: o único Element cadastrado é o
  // selo do Espírito Santo Restaurant Week (26/03 a 26/04), de campanha
  // ARQUIVADA — marca de evento de terceiro, com data vencida. As peças saem
  // só com tipografia e véu, sem filete e sem ícone.
  12: {
    projectId: 12,
    cliente: 'Empório Fonseca',
    // Base dos DOIS gradientes de leitura. O DNA é explícito: este hex "nunca
    // deve ser usado como retângulo sólido atrás de texto sobre foto".
    corFundo: '#2C3445',
    corTexto: '#FFFFFF',
    corAcento: '#CAB371',
    // 🔴 O negrito do Friz é uma FAMÍLIA separada (FRZQUADB), não o peso 700
    // de FRZQUADN. Subir pesoTitulo produziria faux-bold só no navegador — o
    // render server-side usa o peso real do arquivo. Neste projeto se troca de
    // peso trocando de família, nunca mexendo no número.
    fonteTitulo: 'FRZQUADB',
    pesoTitulo: 400,
    fonteApoio: 'TrajanPro Regular',
    caixaTitulo: 'uppercase',
    caixaServico: 'none',
    caixaCta: 'none',
    logoUrl: `${BLOB}/projects/12/logos/1771683215986-Ativo_2icones.png`,
    logoRatio: 0.325,
    // Sem ícone e sem filete — ver o comentário acima.
    fotoPlaceholder: `${U}/drive-1786711121286-Restaurante-dsc05125.jpg`,
  },

  // ── Seu Quinto ──────────────────────────────────────────────────────────
  // Paleta ESTRITA de cinco cores com papel definido, e o kit precisa das
  // três que aparecem: vermelho na palavra-chave da manchete, amarelo no
  // pré-título e no CTA (87 das 224 páginas), branco no texto.
  4: {
    projectId: 4,
    cliente: 'Seu Quinto',
    corFundo: '#0E0B08',
    corTexto: '#FFFFFF',
    corAcento: '#ED1C24',
    corAcento2: '#FAA61A',
    fonteTitulo: 'Bonoco2023',
    pesoTitulo: 400,
    fonteApoio: 'Bonoco2023',
    caixaTitulo: 'uppercase',
    caixaServico: 'none',
    caixaCta: 'none',
    // Métricas por papel, do visualStyle — sem elas a peça usa a fonte certa
    // e mesmo assim não fica com a cara da marca.
    tituloLetterSpacing: -1,
    tituloLineHeight: 0.95,
    preTituloLetterSpacing: 6,
    apoioLetterSpacing: 1,
    // Assinatura visual da marca: extrude de 5px para baixo-direita, SEM blur.
    // Branco sobre foto com sombra amarela é uma das combinações oficiais.
    sombraTitulo: { offsetX: 5, offsetY: 5, cor: '#FAA61A' },
    logoUrl: `${BLOB}/projects/4/logos/1759948024025-Ativo_1branco.png`,
    logoRatio: 0.698,
    // O filete existe (2511x87) mas NUNCA foi usado em 224 páginas, e o DNA
    // evita ornamento "exceto em peça de festa ou evento". Fica no kit e é
    // ligado por copy, só onde cabe.
    filete: `${BLOB}/projects/4/elements/1759948106328-Ativo_5icones.png`,
    fotoPlaceholder: `${BLOB}/uploads/user_3GVFL7SwqXDxP2CpwdgxlNqvGtI/drive-1784504310101-AMBIENTE-_f3a7082.jpg`,
  },

  // ── By Rock ─────────────────────────────────────────────────────────────
  // Só a MANCHETE vai em caixa alta: o crivo da marca pergunta "A caixa alta
  // está em todos os campos, em vez de só na manchete?" e o tom de voz lista
  // "caixa alta em todos os campos" entre as construções proibidas.
  7: {
    projectId: 7,
    cliente: 'By Rock',
    corFundo: '#111111',
    corTexto: '#FFFFFF',
    corAcento: '#dc0909',
    fonteTitulo: 'MortellaDisplay ExtraBold',
    pesoTitulo: 800,
    fonteApoio: 'Metrisch Book',
    fonteApoioForte: 'Metrisch Bold',
    caixaTitulo: 'uppercase',
    caixaServico: 'none',
    caixaCta: 'none',
    logoUrl: `${BLOB}/projects/7/logos/1760576188203-By_Rock_-_logo.png`,
    logoRatio: 0.8787,
    iconeRelogio: `${BLOB}/projects/7/elements/1785779593017-relogio-vermelho.png`,
    filete: `${BLOB}/projects/7/elements/1785779608222-filete-onda-borda-vermelho.png`,
    fotoPlaceholder: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1u8e-UfIL98qgOaQsn_1k3JJjC2hwgXqk-s1920.jpg',
  },

  // ── Real Gelateria ──────────────────────────────────────────────────────
  // 🔴 Manchete em Title Case, NUNCA caixa alta: o DNA registra que essa é a
  // queixa mais repetida do cliente — quatro vezes entre 11 e 13/08/2026,
  // sempre relatada como "essa não é a fonte da marca". Caixa alta
  // descaracteriza o traço da Branley, e vale só para o pré-título.
  1: {
    projectId: 1,
    cliente: 'Real Gelateria',
    corFundo: '#283D36',
    corTexto: '#F6F0E4',
    // O "Dourado Real" do DNA é um GRADIENTE (#8C6A3F → #D9B98A); usada a
    // ponta clara, a única com contraste sobre o Verde Real. O Spritz
    // (#EA5328) fica de fora: o DNA o restringe a pontuação gráfica.
    corAcento: '#D9B98A',
    fonteTitulo: 'Branley GC',
    // Peso REAL do arquivo (usWeightClass 400) e o único que ele tem — pedir
    // 700 cai em fallback, porque não há faux-bold no render server-side.
    pesoTitulo: 400,
    fonteApoio: 'StageGrotesk Medium',
    caixaTitulo: 'none',
    logoUrl: `${BLOB}/projects/1/logos/1759887429010-Ativo_3real.png`,
    logoRatio: 0.995,
    // "A LOGO fica alinhada no canto superior DIREITO. NÃO VARIA DE CANTO."
    // (regra aprendida, definida pelo Ciro em 11/08/2026)
    logoSempreNoTopo: true,
    // O DNA pede 350px livres na base, acima do padrão da casa.
    safezoneBase: 350,
    iconeRelogio: `${BLOB}/projects/1/elements/1760912667040-horario-1.png`,
    filete: `${BLOB}/projects/1/elements/1759887476842-linhas.png`,
    // Gelato, não crepe salgado: a primeira escolha mostrava um crepe numa
    // peça cuja copy fala de gelato artesanal — a foto contradizia o texto.
    fotoPlaceholder: `${BLOB}/uploads/user_33lV8r06XupgO7K0lyLgoj1JJF3/drive-1786668608555-Gelato_em_dobro-dobro.jpg`,
  },

  // ── Bacana ──────────────────────────────────────────────────────────────
  // Sem filete e sem ícone de relógio cadastrados: o DNA pede "um fio fino"
  // que não existe como asset, e os 7 Elements do projeto são 4 ícones de
  // LOCALIZAÇÃO e 3 sombras. Como todas as seis linhas de serviço carregam
  // unidade ou endereço, o ícone certo aqui é o pino — não o relógio.
  5: {
    projectId: 5,
    cliente: 'Bacana',
    corFundo: '#1A1410',
    corTexto: '#FFFFFF',
    corAcento: '#EF6A00',
    fonteTitulo: 'Cannon extrabold',
    pesoTitulo: 400,
    fonteApoio: 'Cannon light',
    fonteApoioForte: 'Cannon medium',
    // O DNA se contradiz sobre o laranja na manchete (`contentRules` manda
    // headline sempre branca; `visualStyle` autoriza uma palavra em laranja).
    // Vale a mais restritiva: manchete branca, laranja reservado ao CTA.
    caixaTitulo: 'none',
    logoUrl: `${BLOB}/projects/5/logos/1765457389127-bacana.png`,
    logoRatio: 0.3883,
    iconeLocal: `${BLOB}/projects/5/elements/1762353516445-icone-local-branci.png`,
    fotoPlaceholder: `${BLOB}/uploads/user_33lV8r06XupgO7K0lyLgoj1JJF3/drive-1786904065748-Ambiente_Vila_Velha-00_019.jpg`,
  },

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
   * TERO — os CINCO tituloAcento repetiam a primeira palavra do título e
   * sairiam duplicados. Viraram a continuação da manchete.
   * Corrigida também a regência de `happy-hour`: "encontrar quem você gosta"
   * → "de quem você gosta" (gostar é transitivo indireto), o que a própria
   * marca reprova no crivo de gramática.
   */
  3: {
    'almoco-executivo': {
      preTitulo: 'Almoço executivo',
      titulo: 'SABOR',
      tituloAcento: 'NO MEIO DA SEMANA',
      descricao: 'Prato principal, dois acompanhamentos à escolha e a opção de somar entrada e sobremesa do dia.',
      servico: 'Terça a sexta, a partir das 11h30',
      icone: 'relogio',
      cta: 'Reserve sua mesa',
    },
    'happy-hour': {
      preTitulo: 'Happy hour',
      titulo: 'DESACELERAR',
      tituloAcento: 'NO FIM DA TARDE',
      descricao: '50% em chopps e drinks selecionados, para encontrar de quem você gosta antes do jantar.',
      servico: 'Terça a sexta das 16h às 20h · Sábado das 12h às 16h',
      icone: 'relogio',
      cta: 'Venha para o Tero',
    },
    sobremesas: {
      preTitulo: 'Doce encerramento',
      titulo: 'SOBREMESAS',
      tituloAcento: 'DA CASA',
      descricao: 'Torta gelada de pistache, desejo de cacau e siciliano brûlée para ficar mais um tempo à mesa.',
      servico: 'Ter a sáb das 11h30 às 23h30 · Dom das 11h30 às 16h',
      icone: 'relogio',
      cta: 'Vem provar',
    },
    'eventos-especiais': {
      preTitulo: 'O lugar do encontro',
      titulo: 'CELEBRAR',
      tituloAcento: 'NO TERO',
      descricao: 'Comemorações à mesa, com cozinha autoral, cortes grelhados e uma carta de vinhos com curadoria.',
      servico: 'Ter a sáb das 11h30 às 23h30 · Dom das 11h30 às 16h',
      icone: 'relogio',
      cta: 'Fale com a gente',
    },
    'rolha-free': {
      preTitulo: 'Carta de vinhos',
      titulo: 'VINHO',
      tituloAcento: 'COM CURADORIA DA CASA',
      descricao: 'Uma carta com curadoria e harmonização orientada, para escolher com calma o que vai à mesa.',
      icone: null,
      cta: 'Escolha seu vinho',
    },
  },

  /**
   * O Quintal — os CINCO tituloAcento repetiam palavra do título. Aqui a
   * correção tem regra própria: a composition manda a SEGUNDA LINHA INTEIRA
   * em Amithen, então o acento é a linha, não uma palavra dela. Era o caso do
   * happy-hour, em que "em Dobro" viraria "em" órfão na fonte errada.
   * Sem ícone: o projeto não tem relógio nem pino cadastrados.
   */
  2: {
    parrilla: {
      preTitulo: 'Na parrilla',
      titulo: 'Cortes na',
      tituloAcento: 'Brasa',
      descricao: 'Ancho, fraldinha Red, picanha e flat iron. Acompanham farofa, vinagrete e um item à escolha.',
      servico: 'Praia do Canto, Vitória-ES',
      icone: null,
      cta: 'A brasa tá acesa',
    },
    'happy-hour': {
      preTitulo: 'Happy hour',
      titulo: 'Chope e Drinks',
      tituloAcento: 'em Dobro',
      descricao: 'Chope e drinks selecionados em dobro, de terça a sexta. Não vale em feriado.',
      servico: 'Ter a Sex, das 17h às 19h',
      icone: null,
      cta: 'Junta a galera',
    },
    petiscos: {
      preTitulo: 'Pra petiscar',
      titulo: 'Pra Começar',
      tituloAcento: 'a Resenha',
      descricao: 'Pão na brasa, coxinha de costela, queijo coalho com melaço e tulipa de frango.',
      servico: 'Praia do Canto, Vitória-ES',
      icone: null,
      cta: 'Chega mais',
    },
    resenha: {
      preTitulo: 'Bora pro Quintal',
      titulo: 'Mesa Cheia',
      tituloAcento: 'no Quintal',
      descricao: 'Ambiente de quintal ao ar livre, feito pra grupo e pra demora.',
      servico: 'Seg das 11h às 16h · Ter a Sáb das 11h à meia-noite · Dom das 11h às 17h',
      icone: null,
      cta: 'Bora pro quintal?',
    },
    celebracoes: {
      preTitulo: 'Tábua pra galera',
      titulo: 'Data Boa',
      tituloAcento: 'Pede Tábua',
      descricao: 'Aniversário ou confraternização: a Tábua Puxadinho serve 4 pessoas e a Tábua O Quintal serve 6.',
      servico: 'Praia do Canto, Vitória-ES',
      icone: null,
      cta: 'Te esperamos aqui',
    },
  },

  /**
   * Empório Fonseca — correções da conferência:
   *  - a foto era UMA só, de brunch, para os seis pilares: ficava atrás de
   *    "massa fresca e molho roti" e de "parede de vinhos ao fundo",
   *    contradizendo 4 das 6 copies. E reprovava na lista FECHADA de
   *    anti-fotografia do DNA (item 6: "prato, taça ou tábua cortados pela
   *    borda") — na imagem o prato é cortado embaixo e a tábua à direita.
   *    Cada tema recebeu a foto do template temático correspondente;
   *  - `promocoes-da-semana` listava QUATRO programações, e a entrada
   *    CAMPANHAS declara um conjunto FECHADO DE TRÊS. E o serviço dava o
   *    horário de UMA delas, o que na arte lê como se valesse para todas —
   *    alvo direto da regra "não confundir os dois menus";
   *  - `gastronomia` era o único serviço sem dias, numa marca cuja REGRA
   *    CRÍTICA é que a casa fecha na segunda.
   * Sem `preTitulo`: a lista fechada do tom de voz é toda de contexto de DIA
   * ("A semana começa com", "Domingo merece"), que não cabe em modelo
   * atemporal — e "A semana começa com" apontaria para a segunda, o dia em
   * que a casa fecha. Os seis CTAs são da lista fechada.
   */
  12: {
    gastronomia: {
      titulo: 'COZINHA DE\nTÉCNICA FRANCESA',
      descricao: 'Massa fresca, molho roti e o ponto certo de cada prato.',
      servico: 'Bistrô · terça a domingo, almoço das 11h às 15h · Jardim Camburi, Vitória/ES',
      icone: null,
      foto: `${U}/drive-1786543841312-CMT00743.jpg`,
      cta: 'Reserve sua mesa.',
    },
    'cafes-e-brunch': {
      titulo: 'PÃO FRESCO E\nCAFÉ DE MÉTODO',
      descricao: 'Brioche de fermentação natural e o café coado no Hario V60.',
      servico: 'Café da manhã · terça a domingo, das 9h às 11h · Jardim Camburi, Vitória/ES',
      icone: null,
      foto: `${U}/drive-1785845138266-CMT05187.jpg`,
      cta: 'Aguardamos você.',
    },
    'vinhos-e-drinks': {
      titulo: 'HAPPY WINE',
      descricao: 'Vinhos selecionados à vontade, com a entrada exclusiva da semana.',
      servico: 'Terça a sexta, das 16h às 19h · R$ 89 por pessoa · Jardim Camburi, Vitória/ES',
      icone: null,
      foto: `${U}/drive-1785237160241-Vinhos-dsc03182.jpg`,
      cta: 'Faça sua reserva.',
    },
    'eventos-especiais': {
      titulo: 'PARA AS DATAS\nQUE MERECEM',
      descricao: 'A cozinha de técnica francesa e a curadoria de vinhos à mesa.',
      servico: 'Terça a domingo, a partir das 9h · Jardim Camburi, Vitória/ES',
      icone: null,
      foto: `${U}/drive-1786563759896-Organizar-cmt08179.jpg`,
      cta: 'Venha viver a experiência.',
    },
    'ambiente-e-experiencia': {
      titulo: 'UMA CASA PARA\nDESACELERAR',
      descricao: 'Mármore, nogueira e a parede de vinhos ao fundo.',
      servico: 'Terça a domingo, a partir das 9h · Jardim Camburi, Vitória/ES',
      icone: null,
      foto: `${U}/drive-1786711121286-Restaurante-dsc05125.jpg`,
      cta: 'Venha conhecer.',
    },
    'promocoes-da-semana': {
      titulo: 'PROGRAMAÇÃO\nDA SEMANA',
      // O conjunto FECHADO de três que a entrada CAMPANHAS declara.
      descricao: 'Happy Wine, Quarta da Pizza e Sábado para Harmonizar.',
      // Sem horário: a descrição é plural e um horário singular leria como se
      // valesse para as três.
      servico: 'Terça a domingo · Jardim Camburi, Vitória/ES',
      icone: null,
      foto: `${U}/drive-1786562519028-CMT06215.jpg`,
      cta: 'Venha conhecer.',
    },
  },

  /**
   * Seu Quinto — correções da conferência:
   *  - os SEIS `tituloAcento` repetiam palavra do título;
   *  - duas descrições empilhavam benefícios, contra a construção proibida
   *    nº 10 do tom de voz ("uma ideia concreta por peça");
   *  - "mesa cheia até a noite" trocado por "até 23h30": "até tarde" está na
   *    lista EVITAR do vocabulário e o horário concreto está na lista USAR;
   *  - ornamento só na peça de evento.
   * Os seis pré-títulos são cópia literal da lista aprovada da base.
   */
  4: {
    'happy-hour': {
      preTitulo: 'Happy hour',
      titulo: 'O CHOPP VEM',
      tituloAcento: 'EM DOBRO',
      descricao: 'Peça um, leve dois: chopp e drinks selecionados enquanto o happy tá rolando.',
      servico: 'Seg a sex · Happy hour das 16h às 19h',
      icone: null,
      usarFilete: false,
      cta: 'Venha pro boteco',
    },
    'feijoada-e-samba': {
      preTitulo: 'Samba do Canto',
      titulo: 'O SAMBA COMEÇA',
      tituloAcento: 'AO MEIO-DIA',
      // Uma ideia concreta, e o horário concreto que a base entrega.
      descricao: 'Sábado tem samba ao vivo a partir do meio-dia, com mesa cheia até 23h30.',
      servico: 'Sábado · 11h às 23h30',
      icone: null,
      usarFilete: false,
      cta: 'Seu boteco favorito',
    },
    'almoco-de-domingo': {
      preTitulo: 'Almoço no Seu Quinto',
      titulo: 'DOMINGO DE',
      tituloAcento: 'MESA CHEIA',
      descricao: 'Música ao vivo e a família toda na mesa, até 16h.',
      servico: 'Domingo · 11h às 16h',
      icone: null,
      usarFilete: false,
      cta: 'Domingou no boteco favorito',
    },
    'tira-gostos': {
      preTitulo: 'Pra beliscar',
      titulo: 'SAI TORRESMO',
      tituloAcento: 'CROCANTE',
      descricao: 'Torresmo Barra, Kieber e croquete de costela: tira-gosto pra dividir na mesa.',
      servico: 'Rua Celson Calmon, 80 · Praia do Canto, Vitória/ES',
      icone: 'local',
      usarFilete: false,
      cta: 'Vem pro Seu Quinto',
    },
    'eventos-especiais': {
      preTitulo: 'A programação do dia',
      titulo: 'A TURMA SE',
      tituloAcento: 'ENCONTRA AQUI',
      descricao: 'Mesa na calçada, papo furado e todo mundo junto. É pra isso que o boteco existe.',
      servico: 'Rua Celson Calmon, 80 · Praia do Canto, Vitória/ES',
      icone: 'local',
      // A ÚNICA peça com ornamento: o DNA o permite em festa ou evento.
      usarFilete: true,
      cta: 'A mesa tá reservada pra você',
    },
    'ambiente-e-clima': {
      preTitulo: 'O boteco da hora',
      titulo: 'AQUI O PAPO',
      tituloAcento: 'CORRE SOLTO',
      descricao: 'Azulejo branco, luz quente da estufa acesa e chopp trincando na caneca.',
      servico: 'Rua Celson Calmon, 80 · Praia do Canto, Vitória/ES',
      icone: 'local',
      usarFilete: false,
      cta: 'Chega no Seu Quinto',
    },
  },

  /**
   * By Rock — `tituloAcento` era "JOGO", palavra que já estava no título, e a
   * peça saía com ela DUAS vezes (terceira linha órfã em vermelho). Virou a
   * segunda linha inteira, que é o que o DNA prescreve: "manchete em duas
   * linhas, uma em branco e outra em vermelho".
   * O `servico` tinha 83 caracteres, quebrava em duas linhas e invadia o CTA
   * em 22px. Ficou só o horário — o `contentRules` reserva o rodapé com
   * endereço à primeira peça do dia.
   */
  7: {
    'promocoes-especiais': {
      titulo: 'O JOGO PASSA AQUI',
      tituloAcento: 'COM CHOPP NA MÃO',
      descricao: 'TVs em todo o salão para acompanhar os principais jogos, com petiscos para dividir e o chopp sempre gelado.',
      servico: 'Todos os dias, das 11h à meia-noite',
      icone: 'relogio',
      cta: 'Chama a galera',
    },
  },

  /**
   * Real Gelateria — três correções da conferência:
   *  - os dois `tituloAcento` ("Sabor" e "Elevar") repetiam palavra do título
   *    e sairiam duplicados; viraram a continuação da manchete;
   *  - o `servico` levava rodapé de funcionamento em peça que não é a das
   *    10h. O `contentRules` é literal: "rodapé de horário de funcionamento
   *    SÓ EXISTE NA PEÇA DE FUNCIONAMENTO DAS 10H". Saiu das duas — e com ele
   *    sai o risco de nomear uma unidade só, num modelo que vale para as três;
   *  - `experiencias-gastronomicas` estava escrita com o vocabulário de
   *    `pausas-e-aconchego`, que é outro pilar e JÁ tem modelo. Reescrita em
   *    cima do que é próprio dela: o Passaporte Real, a jornada que vai além
   *    do gelato.
   * Os CTAs são cópia literal da lista aprovada no tom de voz.
   */
  1: {
    'sabores-real': {
      preTitulo: 'Il vero gelato',
      titulo: 'O Sabor do Dia\nEstá na',
      tituloAcento: 'Vitrine',
      descricao: 'Gelato artesanal de método italiano, com fior di latte, pistacchio siciliano e chocolate belga.',
      icone: null,
      cta: 'Experimente o sabor do dia',
    },
    'experiencias-gastronomicas': {
      preTitulo: 'Passaporte Real',
      titulo: 'Uma Jornada\nItaliana Que Vai',
      tituloAcento: 'Além do Gelato',
      descricao: 'Crepes doces e salgados, croissants, waffles e cafés — do espresso ao cappuccino especial.',
      icone: null,
      cta: 'Sua próxima parada do Passaporte Real',
    },
  },

  /**
   * Bacana — o que a conferência corrigiu:
   *  - `espaco-kids` convidava para ALMOÇO citando as duas unidades, e a base
   *    marca isso como o erro MAIS COMUM: em dia útil o Bairro de Fátima abre
   *    só às 17h. Virou domingo, quando as duas abrem às 11h;
   *  - `drinks-e-cerveja` prometia "só existem aqui" sem lastro — a base diz
   *    "autoral, INCOMUM EM CHURRASCARIA", e a própria carta tem Negroni e
   *    Mojito, que existem em qualquer bar;
   *  - a frase da casa estava mutilada: o "mas" tinha sumido de "aqui o
   *    tempero é do Chef, MAS quem monta o menu é você", deixando duas orações
   *    ligadas só por vírgula;
   *  - "nas duas unidades" na encomenda não tem lastro em entrada nenhuma;
   *  - o almoço perdia a ressalva "exceto feriados", que as DUAS entradas que
   *    o sustentam repetem — peça no ar num feriado manda o cliente para um
   *    almoço que não existe;
   *  - a contagem de drinks: "mais de vinte criações DA CASA" fica falso
   *    (os exclusivos são exatamente 20); a carta inteira tem mais de trinta;
   *  - churrasco misturava escalas (título de 800g, descrição de 1kg).
   */
  5: {
    'almoco-e-jantar': {
      preTitulo: 'Almoço do jeito Bacana',
      // Verbatim da base — o "mas" faz parte da frase da casa.
      titulo: 'Aqui o tempero\né do Chef, mas quem\nmonta o menu é você',
      descricao: 'Uma proteína de 200g, uma guarnição e um molho, escolhidos por você.',
      servico: 'Praia da Costa · Segunda a sexta, das 11h30 às 16h (exceto feriados)',
      icone: 'local',
      cta: 'Monte seu prato',
    },
    churrasco: {
      preTitulo: 'Churrasco sempre Bacana',
      titulo: 'Carne no kilo,\ndo casal à mesa\nde família',
      // Mesma escala do título: a base liga "do casal à mesa de família" a
      // 300g–800g, não a 1kg.
      descricao: 'Cortes na brasa de 300g a 800g, com farofa e vinagrete.',
      servico: 'Praia da Costa · Vila Velha  |  Bairro de Fátima · Serra',
      icone: 'local',
      cta: 'Peça mal passado ou ao ponto',
    },
    'espaco-kids': {
      // Domingo: as DUAS unidades abrem às 11h. Em dia útil a Serra não serve
      // almoço, e convidar para isso é o erro que a base mais reclama.
      preTitulo: 'Domingo em família tem que ser Bacana',
      titulo: 'Tem menu próprio\npara os bacaninhas',
      descricao: 'O Bacaninha vem com a proteína à escolha: carne, frango, linguiça ou ovo.',
      servico: 'Praia da Costa · Vila Velha  |  Bairro de Fátima · Serra',
      icone: 'local',
      cta: 'Reserve sua mesa',
    },
    'eventos-especiais': {
      preTitulo: 'Comemoração tem que ser Bacana',
      titulo: 'Mesa grande pede\nporção grande',
      descricao: 'Chapas e pratos família de 800g, com arroz, feijão tropeiro e batatas fritas.',
      // Unidade é obrigatória junto do canal (contentRules).
      servico: 'Nas duas unidades · Reservas pelo WhatsApp (27) 3535-4575',
      icone: 'local',
      cta: 'Faça sua reserva pelo WhatsApp',
    },
    'drinks-e-cerveja': {
      preTitulo: 'Jantar com sabores Bacana',
      // Formulação da própria base: "autoral, incomum em churrascaria".
      titulo: 'Carta de drinks\nautoral, incomum\nem churrascaria',
      descricao: 'Penicillin, Caipixaba, Red Carpet, Jack Sparrow e mais de trinta drinks na carta.',
      servico: 'Praia da Costa · Vila Velha  |  Bairro de Fátima · Serra',
      icone: 'local',
      cta: 'Esperamos você',
    },
    'promocoes-e-programacoes': {
      preTitulo: 'Churrasco do jeito Bacana',
      titulo: 'Encomende e sirva\num churrasco\nsuper profissa',
      descricao: 'De feijão tropeiro, farofa e vinagrete a pratos completos, prontos para servir em casa.',
      // Texto da base, sem a inferência de cobertura.
      servico: 'O pedido é feito com o garçom ou o gerente da casa.',
      icone: null,
      cta: 'Fale com o gerente para encomendar',
    },
  },

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
