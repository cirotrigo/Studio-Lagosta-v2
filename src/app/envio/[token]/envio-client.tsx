'use client'

import { useRef, useState } from 'react'

type Estado = 'escolhendo' | 'enviando' | 'enviada' | 'erro'

export function EnvioFotoClient({
  token,
  projectName,
  jaRecebida,
}: {
  token: string
  projectName: string
  jaRecebida: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>(jaRecebida ? 'enviada' : 'escolhendo')
  const [preview, setPreview] = useState<string | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function escolher(file: File | null) {
    if (!file) return
    setArquivo(file)
    setPreview(URL.createObjectURL(file))
    setEstado('escolhendo')
    setErro(null)
  }

  async function enviar() {
    if (!arquivo) return
    setEstado('enviando')
    setErro(null)
    try {
      const res = await fetch(`/api/chat-upload/${token}`, { method: 'POST', body: arquivo })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Falha no envio. Tente de novo.')
      setEstado('enviada')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha no envio. Tente de novo.')
      setEstado('erro')
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div>
          <p className="text-sm uppercase tracking-widest text-neutral-500">Studio Lagosta</p>
          <h1 className="text-xl font-semibold mt-1">Enviar foto — {projectName}</h1>
        </div>

        {estado === 'enviada' ? (
          <div className="space-y-4">
            <p className="text-5xl">✅</p>
            <p className="text-lg">Foto recebida!</p>
            <p className="text-neutral-400">Pode voltar ao chat e continuar de lá.</p>
            <button
              className="text-sm text-neutral-400 underline"
              onClick={() => {
                setEstado('escolhendo')
                setPreview(null)
                setArquivo(null)
              }}
            >
              Enviar outra no lugar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            />

            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Prévia da foto escolhida"
                className="w-full rounded-xl border border-neutral-800 max-h-96 object-contain bg-neutral-900"
              />
            ) : (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full h-48 rounded-xl border-2 border-dashed border-neutral-700 text-neutral-400 flex flex-col items-center justify-center gap-2 active:border-neutral-500"
              >
                <span className="text-4xl">📷</span>
                <span>Toque para escolher a foto</span>
              </button>
            )}

            {erro && <p className="text-red-400 text-sm">{erro}</p>}

            {preview && (
              <div className="flex gap-3">
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex-1 py-3 rounded-xl border border-neutral-700 text-neutral-300"
                  disabled={estado === 'enviando'}
                >
                  Trocar
                </button>
                <button
                  onClick={enviar}
                  disabled={estado === 'enviando'}
                  className="flex-1 py-3 rounded-xl bg-neutral-100 text-neutral-950 font-semibold disabled:opacity-60"
                >
                  {estado === 'enviando' ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            )}

            <p className="text-xs text-neutral-600">
              A foto vai direto para o estúdio, já no tamanho certo para a arte.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
