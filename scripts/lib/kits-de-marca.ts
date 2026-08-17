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
