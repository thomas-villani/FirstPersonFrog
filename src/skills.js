// Per-run skill registry. The frog earns skills (and tier-ups on existing skills)
// by leveling up — see PLAN_SCORING.md §6.2 for the full unlock table. This file
// only declares the entries needed in the current build phase; later phases append
// new skills as they're implemented.
//
// The unlock table is a list of `{ level, skill, tier }` rows. `Skills.update(N)`
// scans rows with `level <= N` and keeps the highest tier seen for each skill,
// rebuilding `this._tiers` from scratch each call. That makes level-up idempotent
// (call it twice with the same N and nothing changes) and lets a multi-level-up
// crossing skip intermediate calls if needed — final state only depends on N.
//
// Game-over wipes the run; Game re-instantiates Skills and calls update(1) on the
// fresh Score's frog level, so this object is intentionally cheap.
const UNLOCK_TABLE = [
  // Lv 1 is the empty baseline — no skills. Backward hop is unconditional in
  // input.js (not gated). Tongue T1 is the first earned skill.
  { level: 2, skill: 'tongueFlick', tier: 1 },
  { level: 3, skill: 'frogFocus', tier: 1 },
  { level: 4, skill: 'recombobulation', tier: 1 },
  { level: 5, skill: 'longJump', tier: 1 },
  { level: 6, skill: 'tongueFlick', tier: 2 },
  { level: 12, skill: 'tongueFlick', tier: 3 },
];

// Human-readable label shown in the level-up toast, keyed by `skill:tier`.
const TOAST_LABELS = {
  'tongueFlick:1': 'Tongue Flick',
  'tongueFlick:2': 'Tongue Flick II',
  'tongueFlick:3': 'Tongue Flick III + Bug Magnet',
  'frogFocus:1': 'Frog Focus (Shift)',
  'recombobulation:1': 'Recombobulation',
  'longJump:1': 'Long Jump (Ctrl)',
};

export class Skills {
  constructor() {
    this._tiers = new Map();
  }

  // Recompute the active skill+tier map for the given frog level.
  update(frogLevel) {
    this._tiers.clear();
    for (const row of UNLOCK_TABLE) {
      if (row.level > frogLevel) continue;
      const cur = this._tiers.get(row.skill) ?? 0;
      if (row.tier > cur) this._tiers.set(row.skill, row.tier);
    }
  }

  has(name) {
    return (this._tiers.get(name) ?? 0) > 0;
  }

  tier(name) {
    return this._tiers.get(name) ?? 0;
  }
}

// Returns the toast text for a freshly-reached frog level, or null if that level
// doesn't unlock anything in this build phase.
export function levelUpLabel(frogLevel) {
  const rows = UNLOCK_TABLE.filter((r) => r.level === frogLevel);
  if (rows.length === 0) return null;
  const parts = rows.map((r) => TOAST_LABELS[`${r.skill}:${r.tier}`] ?? r.skill);
  return `FROG LEVEL ${frogLevel} — ${parts.join(' + ')} unlocked!`;
}
