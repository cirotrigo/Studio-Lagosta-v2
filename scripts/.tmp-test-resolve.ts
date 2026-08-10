import { resolveImageUrl } from '@/lib/creatives/persist'
async function main() {
  const r = await resolveImageUrl(undefined, '1p01BBwHdWmZ4D8F_lCSPr-2IVKrquiKI')
  console.log('url:', r.url)
  console.log('warning:', r.warning ?? '(nenhum)')
  if (!r.url?.includes('blob.vercel-storage.com/drive-cache/')) process.exit(1)
  const res = await fetch(r.url)
  console.log(`fetch da cópia: ${res.status} ${res.headers.get('content-type')} ${res.headers.get('content-length')} bytes`)
  process.exit(res.ok ? 0 : 1)
}
main()
