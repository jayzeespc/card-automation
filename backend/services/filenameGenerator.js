export function generateFilename(fields) {
  const {
    Name,
    Team,
    Set,
    Year,
    CardNumber,
    Parallel
  } = fields

  const safe = str => str.replace(/[^a-z0-9]+/gi, '-')

  return `${safe(Year)}-${safe(Set)}-${safe(Name)}-${safe(Parallel)}-#${safe(CardNumber)}-${safe(Team)}.jpg`
}
