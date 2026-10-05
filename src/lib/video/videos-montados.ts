/**
 * Os `<video>` montados agora, por id de camada. Só a página aberta monta
 * `<video>` (as prévias desenham poster), então o mapa descreve a página
 * aberta. É por ele que o motor da página sabe a duração dos vídeos cuja
 * `duration` ainda não foi gravada, e que a miniatura sabe se todos já têm o
 * quadro de 0 decodificado.
 */
const videosMontados = new Map<string, HTMLVideoElement>()

export function registrarVideoMontado(id: string, video: HTMLVideoElement): () => void {
  videosMontados.set(id, video)
  return () => {
    if (videosMontados.get(id) === video) videosMontados.delete(id)
  }
}

export function videoMontado(id: string): HTMLVideoElement | undefined {
  return videosMontados.get(id)
}

/** id da camada → duração do arquivo, dos vídeos que já carregaram os metadados. */
export function duracoesDosVideosMontados(): Map<string, number> {
  const duracoes = new Map<string, number>()
  for (const [id, video] of videosMontados) {
    if (Number.isFinite(video.duration) && video.duration > 0) duracoes.set(id, video.duration)
  }
  return duracoes
}

/**
 * Todos os vídeos VISÍVEIS da página estão com o quadro do instante 0
 * decodificado — a condição para uma miniatura ou uma capa valer.
 */
export function videosProntosEmZero(
  camadas: ReadonlyArray<{ id: string; type?: string; visible?: boolean; videoMetadata?: { trimStart?: number } | null }>,
): boolean {
  for (const camada of camadas) {
    if (camada.type !== 'video' || camada.visible === false) continue
    const video = videosMontados.get(camada.id)
    if (!video || video.readyState < 2 || video.seeking) return false
    if (Math.abs(video.currentTime - Math.max(0, camada.videoMetadata?.trimStart ?? 0)) > 0.1) return false
  }
  return true
}
