import axios from 'axios'

const endpoint = 'https://cardvisionextractor.cognitiveservices.azure.com'
const key = 'replace-with-your-azure-api-key'
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
