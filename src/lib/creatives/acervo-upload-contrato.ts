/**
 * Contrato PURO do envio de fotos para o acervo — tetos, mensagens e nomes
 * compartilhados entre o serviço (`acervo-upload.ts`, que puxa Prisma, sharp e
 * o client do Drive) e o hook/página do navegador.
 *
 * Vive em arquivo próprio pela regra da casa: módulo consumido por componente
 * client não pode importar `@/lib/db` (que lança no import sem DATABASE_URL)
 * — mesmo precedente de `learning-scope.ts` e
 * `sinal-de-agendamento-contrato.ts`.
 */

/** Nome da pasta dedicada, filha direta da raiz de imagens do projeto. */
export const PASTA_FOTOS_DO_CELULAR = 'Fotos do Celular'

/** 25MB — o mesmo teto do chat-upload e da arte enviada. */
export const MAX_FOTO_BYTES = 25 * 1024 * 1024
export const MAX_FOTOS_POR_CHAMADA = 20

/**
 * O aviso que TODA superfície repete: a busca por tema só enxerga a foto
 * depois que a catalogação da madrugada rodar
 * (`/api/cron/reconciliar-catalogos`).
 */
export const AVISO_CATALOGACAO =
  'As fotos já estão na pasta "Fotos do Celular" do Drive do cliente. ' +
  'Elas entram na busca por tema depois da catalogação automática, que roda de madrugada — ' +
  'até lá, aparecem no seletor pela pasta.'

/**
 * Mensagem única de HEIC — serviço e página repetem a mesma orientação.
 * HEIC fica fora porque os binários pré-compilados do sharp 0.33 só trazem o
 * decodificador AV1 (`sharp.format.heif.input` declara apenas `.avif`);
 * HEVC, que é o HEIC do iPhone, não é lido.
 */
export const MOTIVO_HEIC =
  'está em HEIC, o formato padrão do iPhone, que o Studio ainda não lê. ' +
  'No iPhone: Ajustes › Câmera › Formatos › Mais Compatível (as próximas fotos saem em JPEG). ' +
  'Para esta, re-exporte como JPEG e envie de novo.'
