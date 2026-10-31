import type { MoveSet } from '@gg/schemas';
import { MIN_WINDUP_MS } from './behaviour.js';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

/** The shortest wind-up a foe's blow may have, in ticks of a 60 Hz step: MIN_WINDUP_MS (150 ms), as for behaviours. */
export const MIN_TELEGRAPH_TICKS = Math.ceil((MIN_WINDUP_MS * 60) / 1000);

export interface MoveOwners {
  /** The game's entity types: a move belongs to the player or to one of them, and its shots are of one of them. */
  types?: readonly string[];
  /** Each owner's clips (its rig's or its recipe's animations): a move is drawn with one of its owner's own. */
  clips?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The rules a game's moves are held to, beyond the schema:
 * - every blow a foe deals telegraphs: its startup is MIN_TELEGRAPH_TICKS or more;
 * - a chain opens only once a move hits (a cancel from before its first active tick would let the hero strike faster
 *   than the moves are drawn);
 * - a move that deals damage has a box or a shot to deal it with;
 * - each owner exists, draws its moves with clips of its own, one clip per move, and fires shots the game has;
 * - the hero, given moves, has one on the attack key.
 */
export function validateMoves(set: MoveSet, owners: MoveOwners = {}): ValidationReport {
  const issues: Issue[] = [];
  const harmful = (m: MoveSet['moves'][number]) => m.damage > 0 && (m.hitboxes.length > 0 || m.projectile !== undefined);
  const clipOf = new Map<string, string>();
  for (const m of set.moves) {
    const at = { path: `moves.${m.id}` };
    if (m.owner !== 'player' && harmful(m) && m.startup < MIN_TELEGRAPH_TICKS) {
      issues.push(err('telegraph_short', `${m.owner}'s '${m.id}' lands ${m.startup} ticks after it starts: a foe's blow winds up for ${MIN_TELEGRAPH_TICKS} ticks (${MIN_WINDUP_MS} ms) or more`, at));
    }
    if (m.damage > 0 && m.hitboxes.length === 0 && !m.projectile) issues.push(warn('move_harmless', `'${m.id}' deals ${m.damage} but has no box and no shot to deal it with`, at));
    for (const c of m.cancels) if (c.from < m.startup) issues.push(err('cancel_early', `'${m.id}' can be cancelled at tick ${c.from}, before it first hits at ${m.startup}`, at));
    if (owners.types && m.owner !== 'player' && !owners.types.includes(m.owner)) issues.push(err('move_owner_unknown', `'${m.id}' belongs to '${m.owner}', which the game has no entity type for`, at));
    if (owners.types && m.projectile && !owners.types.includes(m.projectile.type)) issues.push(err('unknown_projectile', `'${m.id}' looses '${m.projectile.type}', which the game has no entity type for`, at));
    const clips = owners.clips?.[m.owner];
    if (clips && !clips.includes(m.anim)) issues.push(err('move_clip_missing', `'${m.id}' is drawn with '${m.anim}', a clip ${m.owner} does not have (${clips.join(', ')})`, at));
    const key = `${m.owner}/${m.anim}`;
    const other = clipOf.get(key);
    if (other) issues.push(err('move_clip_shared', `'${m.id}' and '${other}' are both drawn with ${m.owner}'s '${m.anim}': a foe starts a move by playing its clip, so each move has its own`, at));
    else clipOf.set(key, m.id);
  }
  const hero = set.moves.filter((m) => m.owner === 'player');
  if (hero.length > 0 && !hero.some((m) => m.input === 'attack')) issues.push(warn('no_attack', 'the hero has moves but none on the attack key'));
  const telegraphs = set.moves.filter((m) => m.owner !== 'player' && harmful(m)).map((m) => m.startup);
  return report(issues, { moves: set.moves.length, heroMoves: hero.length, shortestTelegraph: telegraphs.length > 0 ? Math.min(...telegraphs) : 0 });
}
