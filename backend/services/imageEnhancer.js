import sharp from 'sharp'

async function makeVariant(buffer, profile) {
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate()

  if (profile === 'shadowLift') {
    pipeline = pipeline
      .gamma(1.35)
      .linear(1.18, 6)
      .normalize()
      .sharpen({ sigma: 1.1 })
  } else if (profile === 'reflectiveRecovery') {
    pipeline = pipeline
      .modulate({ brightness: 1.22, saturation: 0.72 })
      .gamma(1.2)
      .normalize()
      .sharpen({ sigma: 1.0 })
  } else if (profile === 'highContrastMono') {
    pipeline = pipeline
      .grayscale()
      .normalize()
      .linear(1.1, -6)
      .sharpen({ sigma: 1.2 })
  }

  return pipeline.toBuffer()
}

export async function buildEnhancementVariants(buffer, selectedProfiles = []) {
  const baseProfiles = ['shadowLift', 'reflectiveRecovery', 'highContrastMono']
  const profiles = selectedProfiles.length
    ? selectedProfiles.filter(p => baseProfiles.includes(p))
    : baseProfiles

  const variants = [{ name: 'original', buffer }]

  for (const name of profiles) {
    try {
      const transformed = await makeVariant(buffer, name)
      variants.push({ name, buffer: transformed })
    } catch (err) {
      console.warn(`[imageEnhancer] skipped profile=${name}: ${err.message}`)
    }
  }

  return variants
}
