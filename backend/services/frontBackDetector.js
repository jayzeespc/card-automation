import sharp from 'sharp'

export async function detectFrontBack(buffer) {
  const image = sharp(buffer)
  const stats = await image.stats()

  const brightness = stats.channels[0].mean
  const contrast = stats.channels[0].stdev

  if (brightness > 110 && contrast > 40) {
    return "front"
  } else {
    return "back"
  }
}
