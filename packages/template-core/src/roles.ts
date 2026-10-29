import type { EntityDef } from '@gg/sdk';
import type { EntityRole } from '@gg/validators';
import type { GenreRuntime } from './manifest.js';

/**
 * What a game's entity types are for. Hostile and collectible come from the definitions: anything with a behaviour or
 * contact damage that is neither a pickup nor a projectile is hostile, pickups are collectible. The genre names the rest.
 */
export function rolesOf(runtime: { entityDefs: readonly EntityDef[]; entityRoles?: GenreRuntime['entityRoles'] }): Map<string, Set<EntityRole>> {
  const out = new Map<string, Set<EntityRole>>();
  const add = (type: string, role: EntityRole) => {
    let r = out.get(type);
    if (!r) out.set(type, (r = new Set()));
    r.add(role);
  };
  for (const d of runtime.entityDefs) {
    if (!d.pickup && !d.projectile && (d.fsm !== undefined || (d.contactDamage ?? 0) > 0)) add(d.type, 'hostile');
    if (d.pickup) add(d.type, 'collectible');
  }
  for (const [type, roles] of Object.entries(runtime.entityRoles ?? {})) for (const role of roles) add(type, role);
  return out;
}

/** Every role some entity type of the game fills. */
export function rolesPresent(runtime: Parameters<typeof rolesOf>[0]): Set<EntityRole> {
  return new Set([...rolesOf(runtime).values()].flatMap((r) => [...r]));
}
