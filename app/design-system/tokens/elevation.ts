/**
 * Named elevation recipes copied from live dark recipes:
 * - `subtle` ← `ambientShadow('dark', 'soft')`
 * - `card` ← `createShadow(dark).card` / `ambientShadow('dark', 'card')`
 * - `raised` ← `createShadow(dark).glow`
 * - `overlay` ← `ambientShadow('dark', 'fab')`
 *
 * Screens must keep importing `createShadow` / `ambientShadow` until a later phase.
 */
export type ElevationToken = {
  elevation: number;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
};

export const elevation = {
  none: {
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  subtle: {
    elevation: 0,
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  card: {
    elevation: 1,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  raised: {
    elevation: 3,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  overlay: {
    elevation: 2,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
} as const satisfies Record<string, ElevationToken>;

export type ElevationName = keyof typeof elevation;
