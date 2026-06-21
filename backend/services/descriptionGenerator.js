export function generateDescription(fields) {
  const {
    Name,
    Team,
    Position,
    Set,
    Year,
    CardNumber,
    Parallel,
    Rookie,
    Autograph
  } = fields

  const parts = []

  if (Year) parts.push(Year)
  if (Set) parts.push(Set)
  if (Parallel) parts.push(Parallel)
  if (Name) parts.push(Name)
  if (Team) parts.push(`(${Team})`)
  if (Position) parts.push(Position)

  const cardInfo = parts.filter(Boolean).join(' ')
  const special = []
  if (Rookie === 'Yes') special.push('rookie')
  if (Autograph === 'Yes') special.push('autographed')

  let description = `Listing for ${cardInfo}`.trim()

  if (CardNumber) {
    description += ` — card #${CardNumber}`
  }

  if (special.length > 0) {
    description += `, ${special.join(' and ')}`
  }

  description += '.'
  description += ' Buy 5 cards, get 1 free!'
  description += ' Choose from multiple players, teams, and sets in the drop-down list.'

  return description
}
