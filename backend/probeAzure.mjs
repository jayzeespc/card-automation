import axios from 'axios'

// Read from environment variables - never commit secrets to code!
const endpoint = process.env.AZURE_ENDPOINT || 'https://cardvisionextractor.cognitiveservices.azure.com'
const key = process.env.AZURE_API_KEY

if (!key) {
  console.error('ERROR: AZURE_API_KEY environment variable not set')
  process.exit(1)
}

const paths = [
  '/documentintelligence/documentModels?api-version=2024-12-01',
  '/formrecognizer/documentModels?api-version=2024-12-01',
  '/documentintelligence/models?api-version=2024-12-01',
  '/formrecognizer/models?api-version=2024-12-01',
  '/documentintelligence/info?api-version=2024-12-01',
  '/formrecognizer/info?api-version=2024-12-01'
]

for (const p of paths) {
  const url = endpoint + p
  console.log('---', url)
  try {
    const res = await axios.get(url, { headers: { 'Ocp-Apim-Subscription-Key': key } })
    console.log('status', res.status)
    console.log(res.data)
  } catch (err) {
    if (err.response) {
      console.log('status', err.response.status)
      console.log(err.response.data)
    } else {
      console.log('error', err.message)
    }
  }
  console.log('')
}
