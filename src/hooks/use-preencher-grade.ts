'use client'

/**
 * G2 · busca as fotos de um preenchimento de grade e entrega ao editor numa operação só (`preencherGrade` do
 * contexto: um `applyDesign`, um desfazer). O ALVO chega pronto: é decidido pelo `planejarPreenchimento` do contexto
 * ANTES de chamar este hook, e nada aqui o escolhe de novo.
 *
 * Cada foto vai para a célula pareada pela posição na lista do PEDIDO (nunca pela da resposta): Drive num único
 * `POST /api/google-drive-download` (até 10 ids do projeto; 200 pode ser parcial, mapeado por `file.id`), arquivo do
 * computador pelo upload do Blob, URL pronta (IA) como veio. Toda URL passa pelo validador da célula e pela medida da
 * dimensão natural na URL exata ANTES de qualquer escrita; a que falha vira falha com o nome, a célula fica como estava.
 * Cancelar (ou um segundo pedido com o primeiro em voo) não aplica nada. Upload/medidor são injetáveis só para teste.
 */
import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import { toast } from '@/hooks/use-toast'
import type { Layer } from '@/types/template'
import { dimensoesDaFotoCarregada } from '@/lib/image-fit'
import { medirFotoNoNavegador, type MedidorDeFoto } from '@/lib/grades/medir-foto'
import {
  mapearRespostaDoDrive,
  mensagemDoDesfecho,
  motivoDaUrl,
  recusaDoPreenchimento,
  type AlvoDePreenchimento,
  type DesfechoDoPreenchimento,
  type FalhaDaFoto,
  type FotoParaCelula,
  type PlanoDePreenchimento,
} from '@/lib/grades/preenchimento'

export type FonteDaFoto =
  | { tipo: 'drive'; id: string; nome: string }
  | { tipo: 'arquivo'; arquivo: File; nome: string }
  | { tipo: 'url'; url: string; nome: string }

/** Fotos do Drive do projeto copiadas para o Blob (a rota confere que são das pastas do projeto) */
export function useBaixarFotosDoDrive() {
  return useMutation({
    mutationFn: ({ projectId, fileIds, signal }: { projectId: number; fileIds: string[]; signal?: AbortSignal }) =>
      api.post<unknown>('/api/google-drive-download', { projectId, fileIds }, { signal }),
  })
}

const motivo = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erro desconhecido')
/** Resolve com o valor, ou com `undefined` assim que o sinal cancela (a promessa original segue sozinha, ignorada) */
const ateCancelar = <T>(p: Promise<T>, signal: AbortSignal) =>
  new Promise<T | undefined>((resolve, reject) => {
    if (signal.aborted) return resolve(undefined)
    signal.addEventListener('abort', () => resolve(undefined), { once: true })
    p.then(resolve, reject)
  })

export function usePreencherGrade(deps: { enviarArquivo?: (arquivo: File) => Promise<string>; medirFoto?: MedidorDeFoto } = {}) {
  const { projectId, preencherGrade } = useTemplateEditor()
  const { upload } = useBlobUpload()
  const { mutateAsync: baixarDoDrive } = useBaixarFotosDoDrive()
  const enviar = deps.enviarArquivo ?? upload
  const medir = deps.medirFoto ?? medirFotoNoNavegador
  const [emVoo, setEmVoo] = React.useState(false)
  const controleRef = React.useRef<AbortController | null>(null)

  const cancelar = React.useCallback(() => controleRef.current?.abort(), [])

  const preencher = React.useCallback(
    async (alvo: AlvoDePreenchimento, fontes: FonteDaFoto[]): Promise<DesfechoDoPreenchimento> => {
      if (controleRef.current) return recusaDoPreenchimento('EM_ANDAMENTO', 'Já há fotos sendo aplicadas na grade: espere ou cancele.')
      if (fontes.length !== alvo.celulas.length) return recusaDoPreenchimento('LOTE_INVALIDO', 'Número de fotos diferente do de células do alvo.')
      const controle = new AbortController()
      controleRef.current = controle
      setEmVoo(true)
      const cancelado = () => recusaDoPreenchimento('CANCELADO', 'Preenchimento cancelado: nada foi aplicado.')

      // O controlador vale até a DECISÃO do editor (o updater do `preencherGrade`): até lá, Cancelar ainda corta e
      // um segundo pedido segue recusado. A limpeza é só do próprio controlador.
      try {
        const pares = alvo.celulas.map((celulaId, i) => ({ celulaId, fonte: fontes[i] }))
        const urls = new Map<string, { url: string } | { motivo: string }>()
        for (const { celulaId, fonte } of pares) if (fonte.tipo === 'url') urls.set(celulaId, { url: fonte.url })

        const doDrive = pares.flatMap(({ celulaId, fonte }) => (fonte.tipo === 'drive' ? [{ celulaId, driveId: fonte.id }] : []))
        const drive = doDrive.length
          ? baixarDoDrive({ projectId, fileIds: doDrive.map((p) => p.driveId), signal: controle.signal }).then(
              (resposta) => mapearRespostaDoDrive(doDrive, resposta).forEach((v, k) => urls.set(k, v)),
              (e) => doDrive.forEach((p) => urls.set(p.celulaId, { motivo: `não veio do Drive (${motivo(e)})` })),
            )
          : Promise.resolve()
        const arquivos = (async () => {
          for (const { celulaId, fonte } of pares) {
            if (fonte.tipo !== 'arquivo' || controle.signal.aborted) continue
            await enviar(fonte.arquivo).then(
              (url) => urls.set(celulaId, { url }),
              (e) => urls.set(celulaId, { motivo: `não subiu (${motivo(e)})` }),
            )
          }
        })()
        await ateCancelar(Promise.all([drive, arquivos]), controle.signal)
        if (controle.signal.aborted) return cancelado()

        // Validador da célula e medida na URL exata: data:/blob:/lh3 nunca chegam a carregar
        const base = typeof window === 'undefined' ? undefined : window.location.href
        const medidas = await ateCancelar(
          Promise.all(
            pares.map(async ({ celulaId, fonte }): Promise<FotoParaCelula | FalhaDaFoto> => {
              const r = urls.get(celulaId)
              if (!r) return { celulaId, nome: fonte.nome, motivo: 'sem resposta' }
              if ('motivo' in r) return { celulaId, nome: fonte.nome, motivo: r.motivo }
              const ruim = motivoDaUrl(r.url)
              if (ruim) return { celulaId, nome: fonte.nome, motivo: ruim }
              const img = await medir(r.url, { signal: controle.signal }).catch(() => undefined)
              const natural = dimensoesDaFotoCarregada(img, r.url, base)
              return natural ? { celulaId, nome: fonte.nome, url: r.url, natural } : { celulaId, nome: fonte.nome, motivo: 'a foto não carregou a tempo para ser medida' }
            }),
          ),
          controle.signal,
        )
        if (!medidas || controle.signal.aborted) return cancelado()
        const fotos = medidas.filter((m): m is FotoParaCelula => 'url' in m)
        const falhas = medidas.filter((m): m is FalhaDaFoto => 'motivo' in m)
        if (fotos.length === 0) return recusaDoPreenchimento('NADA_APLICADO', 'Nenhuma foto entrou na grade.', falhas)
        // o sinal vai junto: cancelado antes de o updater rodar ⇒ `prev`, sem histórico
        return await preencherGrade(alvo, fotos, falhas, controle.signal)
      } finally {
        if (controleRef.current === controle) {
          controleRef.current = null
          setEmVoo(false)
        }
      }
    },
    [baixarDoDrive, enviar, medir, preencherGrade, projectId],
  )

  return { preencher, cancelar, emVoo }
}

/**
 * G2 · foto ÚNICA, o mesmo contrato em toda entrada (Imagens: upload, arrastar, Drive, acervo; IA: biblioteca e
 * geração). O plano chega decidido ANTES da API (`planejar`, guardado pela entrada se a API demora, como a geração):
 * - grade/célula ⇒ `preencher` (nunca `addLayer`);
 * - grade CHEIA ⇒ a avulsa da entrada, inserida por `adicionarFotoAvulsa` (sem clipe; o "+" armado fica);
 * - sem grade ⇒ a avulsa da entrada pelo `addLayer` de sempre (legado, inclusive o "+");
 * - recusa ⇒ aviso, e a avulsa nem começa.
 * A entrada monta a avulsa como sempre e a entrega a `inserir`. `emVoo`/`cancelar` são o controle que ela mostra.
 */
export function useFotoNaGrade(deps?: Parameters<typeof usePreencherGrade>[0]) {
  const { addLayer, adicionarFotoAvulsa, planejarPreenchimento } = useTemplateEditor()
  const { preencher, cancelar, emVoo } = usePreencherGrade(deps)

  const planejar = React.useCallback(() => planejarPreenchimento('uma'), [planejarPreenchimento])
  const colocar = React.useCallback(
    async (
      plano: PlanoDePreenchimento,
      fonte: FonteDaFoto,
      avulsa: (inserir: (camada: Layer) => void) => unknown,
    ): Promise<Exclude<PlanoDePreenchimento, { tipo: 'grade' }> | DesfechoDoPreenchimento> => {
      if (plano.tipo === 'recusa') {
        toast({ variant: 'destructive', description: plano.mensagem })
        return plano
      }
      if (plano.tipo === 'avulsa') {
        if (plano.aviso) toast({ description: plano.aviso })
        await avulsa(plano.gradeCheia ? adicionarFotoAvulsa : addLayer)
        return plano
      }
      const d = await preencher(plano.alvo, [fonte])
      const m = mensagemDoDesfecho(d)
      toast({ description: m.texto, ...(m.erro ? { variant: 'destructive' as const } : {}) })
      return d
    },
    [addLayer, adicionarFotoAvulsa, preencher],
  )

  return { planejar, colocar, preencher, cancelar, emVoo }
}
