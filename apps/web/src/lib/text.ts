/** A status word as a label: first letter up, underscores as spaces ("needs_human" → "Needs human"). */
export function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1).replace(/_/g, ' ') : s;
}
