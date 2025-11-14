const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{11})/i

export function extractYoutubeId(url: string): string | null {
  if (!url) return null
  for (const pattern of [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]) {
    const match = url.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }
  const fallback = url.match(YOUTUBE_REGEX)
  return fallback?.[1] ?? null
}

export function isYoutubeUrl(url: string): boolean {
  return Boolean(extractYoutubeId(url))
}
