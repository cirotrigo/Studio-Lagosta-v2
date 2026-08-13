/**
 * Foto do celular direto para o ACERVO do cliente no Drive.
 *
 * A diferença para `chat-upload` (que redimensiona e joga no Blob para virar
 * fundo de UMA arte) e para `arte-enviada` (peça pronta que entra na galeria)
 * é que aqui a foto é INSUMO: ela vai para o Drive com os BYTES ORIGINAIS —
 * sem rotate, sem resize, sem reencode — porque o acervo é a fonte de onde as
 * gerações recortam, e pixel jogado fora no upload é margem perdida para
 * sempre (mesma lição da trilha `imagem`, que entregava o nativo e o resize
 * descartava 87% dos pixels).
 *
 * ONDE a pasta fica é o que faz a foto ser catalogada sozinha: "Fotos do
 * Celular" é criada como filha DIRETA da raiz de imagens do projeto
 * (`googleDriveImagesFolderId ?? googleDriveFolderId` — a MESMA resolução de
 * `acervo.ts` e de `reconciliar-catalogo.ts`). A varredura da reconciliação
 * desce 4 níveis a partir dessa raiz, então uma pasta de 1º nível é alcançada
 * com folga; o diff de ids da madrugada encontra as fotos como `novas`, a
 * visão as analisa e elas entram na busca por tema no dia seguinte. Projeto
 * SEM catálogo não é reconciliado (decisão da casa: criar catálogo do zero é
 * manual), mas a listagem crua do seletor desce da mesma raiz e mostra a
 * pasta do mesmo jeito.
 *
 * Falha de UM arquivo nunca derruba a leva — mesmo contrato de
 * `upload-creative`: a resposta separa `enviadas[]` de `falhas[]`.
 */

import sharp from 'sharp'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { googleDriveService } from '@/server/google-drive-service'
import {
  AVISO_CATALOGACAO,
  MAX_FOTO_BYTES,
  MAX_FOTOS_POR_CHAMADA,
  MOTIVO_HEIC,
  PASTA_FOTOS_DO_CELULAR,
} from '@/lib/creatives/acervo-upload-contrato'

// Tetos, mensagens e o nome da pasta moram no contrato PURO (o hook do
// navegador também os lê); re-exportados daqui para o lado servidor.
export {
  AVISO_CATALOGACAO,
  MAX_FOTO_BYTES,
  MAX_FOTOS_POR_CHAMADA,
  MOTIVO_HEIC,
  PASTA_FOTOS_DO_CELULAR,
}

/**
 * O que o sharp DESTA instalação lê e o pipeline aceita. HEIC (o formato
 * padrão do iPhone) fica fora de propósito: os binários pré-compilados do
 * sharp 0.33 só trazem o decodificador AV1 — `sharp.format.heif.input`
 * declara apenas `.avif` —, então HEVC não é lido e a validação falharia de
 * qualquer jeito. A recusa explícita existe para a mensagem ser útil em vez
 * de "arquivo inválido".
 */
const FORMATOS_ACEITOS: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export interface ArquivoParaAcervo {
  bytes: Buffer
  fileName: string
  /** O mime declarado pelo navegador — informativo; quem manda são os bytes. */
  mimeType?: string | null
}

export interface EnvioParaAcervoResult {
  pasta: { id: string; nome: string; criada: boolean }
  enviadas: Array<{ nome: string; driveFileId: string }>
  falhas: Array<{ nome: string; motivo: string }>
}

/**
 * HEIC/HEIF pelo cabeçalho ISO-BMFF (`ftyp` + brand `hei*`/`hev*`/`mif1`/
 * `msf1`). O sniff vem ANTES do sharp porque o erro do sharp para HEIC é um
 * "unsupported image format" genérico — e a pessoa no celular precisa saber
 * que o problema é o FORMATO do iPhone, não a foto.
 */
export function pareceHeic(bytes: Buffer): boolean {
  if (bytes.length < 12) return false
  if (bytes.toString('ascii', 4, 8) !== 'ftyp') return false
  const brand = bytes.toString('ascii', 8, 12)
  return /^(hei|hev|mif1|msf1)/.test(brand)
}

/**
 * Garante a pasta "Fotos do Celular" como filha DIRETA da raiz de imagens.
 *
 * A busca usa `listChildrenOfFolders` (paginação completa) em vez do
 * `listFiles` de pageSize 50 fixo — raiz de acervo real passa de 50 subpastas
 * e o truncamento silencioso criaria pasta duplicada.
 */
async function garantirPastaDoCelular(
  raizDeImagens: string,
): Promise<{ id: string; nome: string; criada: boolean }> {
  const filhas = await googleDriveService.listChildrenOfFolders([raizDeImagens], 'folders')
  const alvo = PASTA_FOTOS_DO_CELULAR.toLowerCase()
  const existente = filhas.find((p) => p.name.trim().toLowerCase() === alvo)
  if (existente) return { id: existente.id, nome: existente.name, criada: false }

  const id = await googleDriveService.createFolder(PASTA_FOTOS_DO_CELULAR, raizDeImagens)
  return { id, nome: PASTA_FOTOS_DO_CELULAR, criada: true }
}

/**
 * Valida UM arquivo e devolve o mime real (lido dos bytes pelo sharp, nunca
 * da extensão). Lança CreativeError com motivo legível quando não serve.
 *
 * De propósito NÃO aplica `rotate()` nem qualquer transformação: o arquivo
 * sobe intocado, com o EXIF dentro — quem consome o acervo lê a orientação
 * (as miniaturas do Drive já vêm giradas certas).
 */
async function validarFoto(arquivo: ArquivoParaAcervo): Promise<{ mimeReal: string }> {
  const { bytes, fileName } = arquivo

  if (!bytes || bytes.length === 0) {
    throw new CreativeError('ARQUIVO_VAZIO', `"${fileName}" chegou vazio.`, 400)
  }
  if (bytes.length > MAX_FOTO_BYTES) {
    throw new CreativeError(
      'ARQUIVO_GRANDE',
      `"${fileName}" tem ${Math.round(bytes.length / 1024 / 1024)}MB e o limite é 25MB.`,
      413,
    )
  }
  if (pareceHeic(bytes)) {
    throw new CreativeError('FORMATO_HEIC', `"${fileName}" ${MOTIVO_HEIC}`, 415)
  }

  let meta: sharp.Metadata
  try {
    meta = await sharp(bytes).metadata()
  } catch {
    throw new CreativeError('ARQUIVO_INVALIDO', `"${fileName}" não parece ser uma imagem.`, 415)
  }

  // O loader heif do sharp abre AVIF; HEVC cai aqui quando o sniff não pegou.
  if (meta.format === 'heif') {
    if ((meta.compression as string | undefined) === 'av1') {
      throw new CreativeError(
        'FORMATO_NAO_SUPORTADO',
        `"${fileName}" é AVIF. Envie JPEG, PNG ou WebP.`,
        415,
      )
    }
    throw new CreativeError('FORMATO_HEIC', `"${fileName}" ${MOTIVO_HEIC}`, 415)
  }

  const mimeReal = FORMATOS_ACEITOS[meta.format ?? '']
  if (!mimeReal) {
    throw new CreativeError(
      'FORMATO_NAO_SUPORTADO',
      `"${fileName}" é ${meta.format ?? 'de formato desconhecido'}. Envie JPEG, PNG ou WebP.`,
      415,
    )
  }
  if ((meta.width ?? 0) < 1 || (meta.height ?? 0) < 1) {
    throw new CreativeError(
      'ARQUIVO_INVALIDO',
      `Não deu para ler as dimensões de "${fileName}".`,
      415,
    )
  }

  return { mimeReal }
}

/**
 * Sobe os arquivos para a pasta "Fotos do Celular" do projeto.
 *
 * Erros de PROJETO (não encontrado, sem pasta no Drive, Drive desligado)
 * lançam; erro de ARQUIVO individual vira uma linha em `falhas[]` e a leva
 * continua.
 */
export async function enviarFotosParaAcervo({
  projectId,
  arquivos,
}: {
  projectId: number
  arquivos: ArquivoParaAcervo[]
}): Promise<EnvioParaAcervoResult> {
  if (arquivos.length === 0) {
    throw new CreativeError('SEM_ARQUIVOS', 'Nenhuma foto recebida.', 400)
  }
  if (arquivos.length > MAX_FOTOS_POR_CHAMADA) {
    throw new CreativeError(
      'MUITOS_ARQUIVOS',
      `São ${arquivos.length} fotos — o limite é ${MAX_FOTOS_POR_CHAMADA} por vez. Envie em levas menores.`,
      413,
    )
  }
  if (!googleDriveService.isEnabled()) {
    throw new CreativeError(
      'DRIVE_DESLIGADO',
      'A integração com o Google Drive não está configurada neste ambiente.',
      503,
    )
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, googleDriveImagesFolderId: true, googleDriveFolderId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }

  // A MESMA resolução de raiz de `acervo.ts` e `reconciliar-catalogo.ts` — é o
  // que garante que a varredura da madrugada e o seletor enxergam esta pasta.
  const raizDeImagens = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
  if (!raizDeImagens) {
    throw new CreativeError(
      'SEM_PASTA_DRIVE',
      'Este projeto não tem pasta de imagens no Drive — configure-a antes de enviar fotos.',
      400,
    )
  }

  const pasta = await garantirPastaDoCelular(raizDeImagens)

  const enviadas: EnvioParaAcervoResult['enviadas'] = []
  const falhas: EnvioParaAcervoResult['falhas'] = []

  // Em SÉRIE, não Promise.all: a leva é pequena (≤20) e o upload sequencial
  // não disputa o rate limit do Drive nem embaralha os retries do serviço.
  for (const arquivo of arquivos) {
    try {
      const { mimeReal } = await validarFoto(arquivo)
      const resultado = await googleDriveService.uploadFileToFolder({
        buffer: arquivo.bytes, // bytes ORIGINAIS — nada de rotate/resize/reencode
        folderId: pasta.id,
        fileName: arquivo.fileName,
        mimeType: mimeReal,
      })
      enviadas.push({ nome: arquivo.fileName, driveFileId: resultado.fileId })
    } catch (error) {
      const motivo =
        error instanceof CreativeError
          ? error.message
          : 'Falha ao subir para o Drive. Tente de novo.'
      if (!(error instanceof CreativeError)) {
        console.error(`[acervo-upload] falha inesperada em "${arquivo.fileName}":`, error)
      }
      falhas.push({ nome: arquivo.fileName, motivo })
    }
  }

  return { pasta, enviadas, falhas }
}
