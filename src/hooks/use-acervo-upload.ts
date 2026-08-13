'use client'

/**
 * Envio de fotos do celular para o acervo do cliente
 * (`POST /api/projects/[id]/acervo/upload`).
 *
 * O fetch multipart mora AQUI de propósito: o `api` da casa fixa
 * `Content-Type: application/json`, e multipart precisa que o navegador monte
 * o boundary sozinho. Componente nunca chama fetch — chama este hook.
 *
 * O envio é UM ARQUIVO POR REQUISIÇÃO, em série: é o que dá estado por foto
 * de verdade (aguardando → enviando → enviada/falha), mantém cada requisição
 * abaixo do teto de 25MB e faz uma falha de rede derrubar só aquela foto,
 * nunca a leva.
 */

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  MAX_FOTO_BYTES,
  MAX_FOTOS_POR_CHAMADA,
  MOTIVO_HEIC,
} from '@/lib/creatives/acervo-upload-contrato'

export type SituacaoDoArquivo = 'aguardando' | 'enviando' | 'enviada' | 'falha'

export interface FotoEmEnvio {
  /** Chave estável na lista (não é o índice — dá para remover no meio). */
  id: string
  nome: string
  tamanhoBytes: number
  /** Object URL para a prévia — revogado ao remover/limpar. */
  previewUrl: string
  situacao: SituacaoDoArquivo
  motivo?: string
  driveFileId?: string
}

interface RespostaDoUpload {
  pasta?: { id: string; nome: string }
  enviadas?: Array<{ nome: string; driveFileId: string }>
  falhas?: Array<{ nome: string; motivo: string }>
  aviso?: string
  error?: string
  message?: string
}

function ehHeicNoCliente(file: File): boolean {
  if (/heic|heif/i.test(file.type)) return true
  return /\.(heic|heif)$/i.test(file.name)
}

let contador = 0
function novoId(): string {
  contador += 1
  return `foto-${Date.now()}-${contador}`
}

export function useAcervoUpload(projectId: number) {
  const queryClient = useQueryClient()
  const [fotos, setFotos] = React.useState<FotoEmEnvio[]>([])
  const [enviando, setEnviando] = React.useState(false)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [avisoLocal, setAvisoLocal] = React.useState<string | null>(null)
  /** Os File de verdade, fora do estado — o React não precisa deles no render. */
  const arquivosRef = React.useRef<Map<string, File>>(new Map())
  /**
   * id → object URL, num ref: a revogação no unmount não pode depender de um
   * setState (o updater não roda em componente que está morrendo).
   */
  const previewsRef = React.useRef<Map<string, string>>(new Map())

  // Revoga as prévias quando a tela morre — object URL vaza memória no iPhone.
  React.useEffect(() => {
    const arquivos = arquivosRef.current
    const previews = previewsRef.current
    return () => {
      arquivos.clear()
      for (const url of previews.values()) URL.revokeObjectURL(url)
      previews.clear()
    }
  }, [])

  const adicionar = React.useCallback((novas: FileList | File[]) => {
    const lista = Array.from(novas)
    setAvisoLocal(null)
    setFotos((atual) => {
      const proximas = [...atual]
      for (const file of lista) {
        if (proximas.length >= MAX_FOTOS_POR_CHAMADA) {
          setAvisoLocal(
            `O limite é ${MAX_FOTOS_POR_CHAMADA} fotos por leva — as que passaram ficaram de fora. Envie estas e depois adicione o resto.`,
          )
          break
        }
        const id = novoId()
        const previewUrl = URL.createObjectURL(file)
        previewsRef.current.set(id, previewUrl)
        const base: FotoEmEnvio = {
          id,
          nome: file.name || 'foto',
          tamanhoBytes: file.size,
          previewUrl,
          situacao: 'aguardando',
        }
        // Recusa LOCAL do que a rota recusaria — poupa subir 25MB para ouvir não.
        if (ehHeicNoCliente(file)) {
          proximas.push({ ...base, situacao: 'falha', motivo: `"${base.nome}" ${MOTIVO_HEIC}` })
          continue
        }
        if (file.size > MAX_FOTO_BYTES) {
          proximas.push({
            ...base,
            situacao: 'falha',
            motivo: `"${base.nome}" tem ${Math.round(file.size / 1024 / 1024)}MB e o limite é 25MB.`,
          })
          continue
        }
        arquivosRef.current.set(id, file)
        proximas.push(base)
      }
      return proximas
    })
  }, [])

  const remover = React.useCallback((id: string) => {
    arquivosRef.current.delete(id)
    const url = previewsRef.current.get(id)
    if (url) URL.revokeObjectURL(url)
    previewsRef.current.delete(id)
    setFotos((atual) => atual.filter((f) => f.id !== id))
  }, [])

  const limpar = React.useCallback(() => {
    arquivosRef.current.clear()
    for (const url of previewsRef.current.values()) URL.revokeObjectURL(url)
    previewsRef.current.clear()
    setFotos([])
    setAviso(null)
    setAvisoLocal(null)
  }, [])

  const marcar = (id: string, mudanca: Partial<FotoEmEnvio>) => {
    setFotos((atual) => atual.map((f) => (f.id === id ? { ...f, ...mudanca } : f)))
  }

  const enviar = React.useCallback(async () => {
    if (enviando) return
    const pendentes = fotos.filter((f) => f.situacao === 'aguardando' && arquivosRef.current.has(f.id))
    if (pendentes.length === 0) return
    setEnviando(true)

    try {
      for (const foto of pendentes) {
        const file = arquivosRef.current.get(foto.id)
        if (!file) continue
        marcar(foto.id, { situacao: 'enviando' })
        try {
          const fd = new FormData()
          fd.append('arquivos', file, foto.nome)
          const res = await fetch(`/api/projects/${projectId}/acervo/upload`, {
            method: 'POST',
            body: fd,
          })
          const json = (await res.json().catch(() => null)) as RespostaDoUpload | null

          if (!res.ok) {
            marcar(foto.id, {
              situacao: 'falha',
              motivo: json?.message ?? json?.error ?? `Falha no envio (HTTP ${res.status}).`,
            })
            continue
          }

          if (json?.aviso) setAviso(json.aviso)
          const enviada = json?.enviadas?.[0]
          if (enviada) {
            marcar(foto.id, { situacao: 'enviada', driveFileId: enviada.driveFileId, motivo: undefined })
            arquivosRef.current.delete(foto.id)
          } else {
            // A rota respondeu 200 mas o arquivo caiu em falhas[] — o motivo é dele.
            marcar(foto.id, {
              situacao: 'falha',
              motivo: json?.falhas?.[0]?.motivo ?? 'A foto não foi aceita.',
            })
          }
        } catch {
          marcar(foto.id, {
            situacao: 'falha',
            motivo: 'Falha de conexão no meio do envio. Confira a internet e tente de novo.',
          })
        }
      }
    } finally {
      setEnviando(false)
      // O seletor do acervo (fallback por pasta) já enxerga a foto nova;
      // invalidar aqui evita a grade velha ficar em cache por 2 minutos.
      void queryClient.invalidateQueries({ queryKey: ['projeto', projectId, 'acervo'] })
    }
  }, [enviando, fotos, projectId, queryClient])

  /** Volta uma foto que falhou para a fila (só faz sentido para falha de rede). */
  const tentarDeNovo = React.useCallback((id: string) => {
    if (!arquivosRef.current.has(id)) return
    setFotos((atual) =>
      atual.map((f) => (f.id === id ? { ...f, situacao: 'aguardando', motivo: undefined } : f)),
    )
  }, [])

  return {
    fotos,
    adicionar,
    remover,
    limpar,
    enviar,
    tentarDeNovo,
    enviando,
    /** Aviso do servidor (a catalogação da madrugada). */
    aviso,
    /** Aviso local (teto de fotos por leva). */
    avisoLocal,
  }
}
