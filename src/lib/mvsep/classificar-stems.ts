/**
 * Quem é o instrumental e quem é a voz numa separação do MVSEP.
 *
 * Módulo PURO de propósito — sem Prisma, sem rede. `@/lib/db` lança no import
 * quando falta DATABASE_URL, e esta é a decisão que mais precisa ser conferida
 * sozinha: trocar os dois arquivos de lugar é um defeito que sai CALADO — o
 * vídeo publica a faixa com voz achando que é o playback.
 *
 * A resposta real do MVSEP (medida em 22/08/2026, algoritmo MelBand Roformer,
 * sep_type 48) tem esta forma:
 *
 *   [{ type: "Vocals", download: "…_vocals.mp3", url: "https://…", size: "10.92 MB" },
 *    { type: "Other",  download: "…_other.mp3",  url: "https://…", size: "10.92 MB" }]
 *
 * Duas coisas que ela ensina e que não estavam no código:
 *  - NÃO existe campo `name`/`filename`. Quem carrega o nome é `download`.
 *  - O instrumental se chama "Other", não "instrumental".
 */

/**
 * O rótulo de um arquivo: `type` e `download` são os campos que o MVSEP manda
 * de verdade; os outros ficam como rede de segurança para variação de formato.
 */
export function getFileName(file: any): string {
  return (
    file.download ||
    file.name ||
    file.filename ||
    file.file_name ||
    file.fileName ||
    file.title ||
    file.type ||
    'unknown.mp3'
  )
}

/**
 * URL de download. `url` é o campo real; o resto é rede de segurança.
 */
export function getFileUrl(file: any): string | null {
  return (
    file.url ||
    file.link ||
    file.download_url ||
    file.downloadUrl ||
    (typeof file.download === 'string' && file.download.startsWith('http')
      ? file.download
      : null) ||
    null
  )
}

/**
 * Tudo que identifica o arquivo, junto e em minúsculas: o `type` da API mais o
 * nome do arquivo. Ler os dois é o que evita depender de um só campo.
 */
function rotuloDe(file: any): string {
  return [file.type, getFileName(file)].filter(Boolean).join(' ').toLowerCase()
}

export type ParDeStems = {
  instrumental: any | null
  vocals: any | null
  /** Como a decisão foi tomada. Vai para o log: é o que permite auditar uma troca de stem. */
  criterio: string
}

/**
 * Palavras que identificam o INSTRUMENTAL.
 *
 * "music" ficou de fora de propósito: o nome da faixa costuma vir embutido no
 * nome do arquivo, e uma faixa chamada "Music Box" cairia aqui. O complemento
 * (com 2 arquivos, o que não é voz é instrumental) cobre o mesmo caso sem
 * depender do título.
 *
 * "other" também não entra aqui — é tratado à parte, porque só significa
 * instrumental no modelo de DOIS stems. Num modelo de quatro (bateria, baixo,
 * outros, voz) "other" é outra coisa.
 */
const MARCAS_INSTRUMENTAL = [
  'instrumental',
  'instrum',
  'no_vocal',
  'no vocal',
  'novocal',
  'minus',
  'karaoke',
  'backing',
]

/** Palavras que identificam a VOZ. */
const MARCAS_VOCAL = ['vocal', 'voice', 'voz', 'acapella', 'a cappella', 'singer']

const casaCom = (rotulo: string, marcas: string[]) =>
  marcas.some((marca) => rotulo.includes(marca))

/**
 * Decide qual arquivo é o instrumental e qual é a voz.
 *
 * A ORDEM IMPORTA: "no_vocals" CONTÉM "vocal", então quem decide primeiro é o
 * instrumental. Classificar a voz antes trocaria os dois arquivos de lugar.
 */
export function classificarStems(files: any[]): ParDeStems {
  if (!files || files.length === 0) {
    return { instrumental: null, vocals: null, criterio: 'nenhum arquivo' }
  }

  const rotulos = files.map(rotuloDe)

  // 1. Instrumental primeiro, porque as marcas dele são as mais específicas.
  const iInstrumental = rotulos.findIndex((r) => casaCom(r, MARCAS_INSTRUMENTAL))

  // 2. A voz é procurada só no que sobrou — nunca no arquivo já dado como
  //    instrumental, senão "no_vocals" seria classificado duas vezes.
  const iVocal = rotulos.findIndex(
    (r, i) => i !== iInstrumental && casaCom(r, MARCAS_VOCAL)
  )

  // 3. "Other" é o nome que o MelBand Roformer dá ao instrumental. Só vale com
  //    DOIS arquivos: num modelo de quatro stems, "other" é uma faixa própria.
  if (iInstrumental < 0 && files.length === 2) {
    const iOutro = rotulos.findIndex((r, i) => i !== iVocal && r.includes('other'))
    if (iOutro >= 0) {
      return {
        instrumental: files[iOutro],
        vocals: iVocal >= 0 ? files[iVocal] : files[1 - iOutro],
        criterio: 'type "Other" = instrumental no modelo de 2 stems',
      }
    }
  }

  if (iInstrumental >= 0 && iVocal >= 0) {
    return {
      instrumental: files[iInstrumental],
      vocals: files[iVocal],
      criterio: 'rótulo dos dois arquivos',
    }
  }

  // 4. Complemento: com exatamente 2 arquivos, identificar um identifica o outro.
  if (files.length === 2) {
    if (iInstrumental >= 0) {
      return {
        instrumental: files[iInstrumental],
        vocals: files[1 - iInstrumental],
        criterio: 'instrumental pelo rótulo, voz por complemento',
      }
    }
    if (iVocal >= 0) {
      return {
        instrumental: files[1 - iVocal],
        vocals: files[iVocal],
        criterio: 'voz pelo rótulo, instrumental por complemento',
      }
    }
    // 5. Sem rótulo útil: o MVSEP devolve [vocals, instrumental] nessa ordem.
    return {
      instrumental: files[1],
      vocals: files[0],
      criterio: 'posição (ordem padrão do MVSEP: voz, instrumental)',
    }
  }

  // Mais de 2 arquivos e identificação parcial: fica com o que dá para afirmar.
  // O último arquivo como instrumental é o palpite que já vinha sendo usado.
  return {
    instrumental: iInstrumental >= 0 ? files[iInstrumental] : files[files.length - 1],
    vocals: iVocal >= 0 ? files[iVocal] : null,
    criterio:
      iInstrumental >= 0
        ? 'instrumental pelo rótulo; voz não identificada'
        : 'instrumental pelo último arquivo; voz não identificada',
  }
}
