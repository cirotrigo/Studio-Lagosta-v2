import 'dotenv/config'
const apiKey = process.env.RAPIDAPI_KEY
if (!apiKey) {
  console.log('NO RAPIDAPI_KEY in env')
  process.exit(1)
}
const videoId = process.argv[2] || 'SDblmGol8CY'
const url = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`
console.log('Fetching', url)
const res = await fetch(url, {
  headers: {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
  },
})
console.log('HTTP', res.status)
const text = await res.text()
console.log('Body:', text)
