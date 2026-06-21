export function generateTitle(fields) {
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

  let title = `${Year} ${Set} ${Name}`

  if (Parallel) title += ` ${Parallel}`
  if (Rookie === "Yes") title += " RC"
  if (Autograph === "Yes") title += " Auto"

  title += ` #${CardNumber} ${Team}`

  return title.trim()
}
