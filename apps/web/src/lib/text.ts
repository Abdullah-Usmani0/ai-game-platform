/** A status word as a label: first letter up, underscores as spaces ("needs_human" → "Needs human"). */
export function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1).replace(/_/g, ' ') : s;
}

/** A level as players know it: "Level 2" for l02, "The arena" for an arena game's one level. */
export function levelName(id: string): string {
  const m = /^l(\d+)$/.exec(id);
  return m ? `Level ${Number(m[1])}` : id === 'arena' ? 'The arena' : id;
}

/** "a", "a and b", "a, b and c". */
export function listOf(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
