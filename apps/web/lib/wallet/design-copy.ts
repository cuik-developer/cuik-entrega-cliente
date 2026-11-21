/**
 * Copying a pass design to another merchant (worked out on the test merchant,
 * then moved to the real one). The copy carries images, colours, stamps and
 * fields; what it cannot carry is the program, which belongs to each merchant.
 */

/** The program a card is drawn for: its kind and how many stamps fill it. */
export type CardProgram = { type: string; maxVisits: number } | null

const PROGRAM_NAME: Record<string, string> = { stamps: "sellos", points: "puntos" }
const programName = (type: string) => PROGRAM_NAME[type] ?? type

/**
 * What to check in the copy before publishing it: the destination has no
 * program yet, runs another kind of program, or fills its card with a
 * different number of stamps than the design was laid out for.
 */
export function copyWarnings(source: CardProgram, target: CardProgram): string[] {
  if (!target) {
    return [
      "El comercio destino no tiene una promoción activa: créala antes de publicar este diseño.",
    ]
  }
  if (!source) return []
  if (source.type !== target.type) {
    return [
      `El diseño viene de un programa de ${programName(source.type)} y el destino usa ${programName(target.type)}: revisa la franja y los campos.`,
    ]
  }
  if (source.type === "stamps" && source.maxVisits !== target.maxVisits) {
    return [
      `El diseño está armado para ${source.maxVisits} sellos y el destino usa ${target.maxVisits}: reajusta la posición de los sellos.`,
    ]
  }
  return []
}

/** Name of the copy: the source's, marked as a copy, inside the column's 100 characters. */
export function copyName(sourceName: string): string {
  const suffix = " (copia)"
  return `${sourceName.slice(0, 100 - suffix.length)}${suffix}`
}
