/** 12-hour label without minutes, the way an operator reads a schedule: 9 → "9am", 13 → "1pm", 0 → "12am". */
export function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm"
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}${suffix}`
}
