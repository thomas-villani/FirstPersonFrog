import {
  TONGUE_RANGE_BY_TIER,
  BUG_MAGNET_RADIUS_BY_TIER,
  BUG_SCORE_MULT_BY_TIER,
  ROAR_USES_BY_TIER,
  ROAR_BRAKE_DURATION_BY_TIER,
  HOP_DURATION_MULT_BY_TIER,
  LONG_JUMP_MULT_BY_TIER,
  FOCUS_DURATION_BY_TIER,
  FOCUS_PASSIVE_RECHARGE_BY_TIER,
  ECHO_TIER_BY_TIER,
  RECOMB_CAP_BY_TIER,
  SIGHT_TIER_BY_TIER,
} from './config.js';

// RPG-style branch skill tree. Four branches × 7 tiers; each frog level above
// 1 (up to SKILL_POINT_CAP_LEVEL) earns one skill point. The player spends it
// via the picker modal between crossings; spending forces sequential 1→7
// advancement within a branch (no skipping).
//
// Tongue Fu T1 is pre-spent on every fresh run so a basic 1-cell tongue is
// active from the first hop. The first earnable point is at Frog Lv 2.
//
// Branch tier is the source of truth. Per-mechanic queries are exposed as
// helpers (tongueRange, recombCap, etc.) — feature code never compares tiers
// to magic numbers, so re-tuning a tier curve is one-array-edit in config.js.

const BRANCH_IDS = ['tongueFu', 'hipHopping', 'frogcentration', 'hocusCroakus'];

// Stable display order for the picker. Numeric keys 1..4 map by index.
export const BRANCH_ORDER = BRANCH_IDS;

// Per-tier short flavor text. Index = tier the spend reaches (so [2] is "what
// T1 → T2 grants you"). Index 0 = locked baseline placeholder.
//
// Keep these tight: the picker shows ONE line per option, plus the icon+name+
// tier-arrow header. Tier-up labels should answer "what does this point buy?"
// in five-ish words.
export const BRANCH_META = {
  tongueFu: {
    id: 'tongueFu',
    icon: '🥋',
    name: 'Tongue Fu',
    tierLabels: [
      '(locked)',
      'Tongue Flick',                  // T1 — pre-spent at run start
      'Longer tongue (2 cells)',       // T2
      'Reach 3 cells + Bug Magnet',    // T3
      'Bigger Magnet + 1.5× bug score',// T4
      'Ribbit Roar (E)',               // T5
      'Roar 2.0s brake',               // T6
      'Roar ×2 uses',                  // T7
    ],
  },
  hipHopping: {
    id: 'hipHopping',
    icon: '🐰',
    name: 'Hip Hopping',
    tierLabels: [
      '(locked)',
      'Hop speed +5%',                 // T1
      'Hop speed +10%',                // T2
      'Long Jump (Shift+WASD) 2×',     // T3
      'Hop speed +14%',                // T4
      'Hop speed +19%',                // T5
      'Hop speed +23%',                // T6
      'Double Long Jump (4×)',         // T7
    ],
  },
  frogcentration: {
    id: 'frogcentration',
    icon: '🧘',
    name: 'Frogcentration',
    tierLabels: [
      '(locked)',
      'Frog Focus (F)',                // T1
      'Focus 8s',                      // T2
      'Focus 10s + passive recharge',  // T3
      'Focus 12s + 2× recharge',       // T4
      'Echolocation L1',               // T5
      'Echolocation L2',               // T6
      'Echolocation L3',               // T7
    ],
  },
  hocusCroakus: {
    id: 'hocusCroakus',
    icon: '🎩',
    name: 'Hocus Croakus',
    tierLabels: [
      '(locked)',
      'Recombobulation (1 charge)',    // T1
      'Recomb (2 charges)',            // T2
      'Recomb (3 charges)',            // T3
      'Psychedelic Sight L1',          // T4
      'Psychedelic Sight L2',          // T5
      'Psychedelic Sight L3',          // T6
      'Plague of Frogs (Q)',           // T7
    ],
  },
};

export class Skills {
  constructor() {
    this.reset();
  }

  // Wipes all branches back to fresh-run state (pre-spends Tongue Fu T1).
  // Called from Game.onLockAcquired on the GAMEOVER → new-run transition.
  reset() {
    this._tiers = {
      tongueFu: 1,
      hipHopping: 0,
      frogcentration: 0,
      hocusCroakus: 0,
    };
  }

  tier(branchId) {
    return this._tiers[branchId] ?? 0;
  }

  isMaxed(branchId) {
    return this.tier(branchId) >= 7;
  }

  // True if EVERY branch is at T7 — used to short-circuit the picker when
  // there's nothing left to spend on (shouldn't happen until 27 picks, but
  // the cheat-all-skills toggle can force it).
  allMaxed() {
    return BRANCH_IDS.every((id) => this.isMaxed(id));
  }

  spend(branchId) {
    if (this.isMaxed(branchId)) {
      throw new Error(`branch ${branchId} already maxed`);
    }
    this._tiers[branchId]++;
  }

  // Sum of branch tiers minus the free Tongue Fu T1. Useful as a debug
  // invariant: should always equal `score.frogLevel - 1` (clamped to the
  // skill-point cap).
  totalEarnedPoints() {
    let sum = 0;
    for (const id of BRANCH_IDS) sum += this.tier(id);
    return sum - 1;
  }

  // Snapshot of branch tiers for HUD rendering. Returns a plain object the
  // caller can read without poking at internals.
  tiersSnapshot() {
    return {
      tongueFu: this.tier('tongueFu'),
      hipHopping: this.tier('hipHopping'),
      frogcentration: this.tier('frogcentration'),
      hocusCroakus: this.tier('hocusCroakus'),
    };
  }

  // --- Cheat helpers (debug menu) ---
  cheatMaxAll() {
    for (const id of BRANCH_IDS) this._tiers[id] = 7;
  }
  cheatReset() {
    this.reset();
  }

  // --- 🥋 Tongue Fu helpers ---
  tongueRange()        { return TONGUE_RANGE_BY_TIER[this.tier('tongueFu')]; }       // cells
  bugMagnetRadius()    { return BUG_MAGNET_RADIUS_BY_TIER[this.tier('tongueFu')]; }   // m
  bugScoreMult()       { return BUG_SCORE_MULT_BY_TIER[this.tier('tongueFu')]; }
  canRibbitRoar()      { return this.tier('tongueFu') >= 5; }
  roarUses()           { return ROAR_USES_BY_TIER[this.tier('tongueFu')]; }
  roarBrakeDuration()  { return ROAR_BRAKE_DURATION_BY_TIER[this.tier('tongueFu')]; }

  // --- 🐰 Hip Hopping helpers ---
  hopDurationMult()    { return HOP_DURATION_MULT_BY_TIER[this.tier('hipHopping')]; }
  canLongJump()        { return this.tier('hipHopping') >= 3; }
  longJumpMult()       { return LONG_JUMP_MULT_BY_TIER[this.tier('hipHopping')]; }

  // --- 🧘 Frogcentration helpers ---
  canFrogFocus()         { return this.tier('frogcentration') >= 1; }
  focusDuration()        { return FOCUS_DURATION_BY_TIER[this.tier('frogcentration')]; }
  focusPassiveRecharge() { return FOCUS_PASSIVE_RECHARGE_BY_TIER[this.tier('frogcentration')]; }
  echoTier()             { return ECHO_TIER_BY_TIER[this.tier('frogcentration')]; }

  // --- 🎩 Hocus Croakus helpers ---
  recombCap()          { return RECOMB_CAP_BY_TIER[this.tier('hocusCroakus')]; }
  sightTier()          { return SIGHT_TIER_BY_TIER[this.tier('hocusCroakus')]; }
  canPlague()          { return this.tier('hocusCroakus') >= 7; }
}
