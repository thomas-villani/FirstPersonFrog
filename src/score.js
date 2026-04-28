import {
  STARTING_LIVES,
  SCORE_THREADED,
  SCORE_UNDER,
  SCORE_GRAZED,
  SCORE_DAREDEVIL_BONUS,
  COMBO_BUMP_THREADED,
  COMBO_BUMP_GRAZED,
  COMBO_BUMP_BUG,
  COMBO_CAP,
  COMBO_DECAY_DELAY,
  COMBO_DECAY_TAU,
  SURVIVAL_MILESTONES,
  SURVIVAL_PAYOUTS,
  SCORE_BUG_BASE,
  CROSSING_BASE_BONUS,
  UNTOUCHABLE_BONUS_BASE,
  UNTOUCHABLE_STREAK_BONUS,
  HIGH_SCORE_KEY,
  HIGH_SCORE_LIST_KEY,
  LEADERBOARD_SIZE,
  XP_PER_LEVEL_BASE,
  FROG_LEVEL_CAP,
  FOCUS_NEAR_MISS_MULT,
  FOCUS_FILL_THREADED,
  FOCUS_FILL_GRAZED,
  FOCUS_FILL_BUG,
} from './config.js';

// Cumulative XP required to BE at frog level N. Lv 1 = 0, Lv 2 = 1000, Lv 3 = 3000.
export function xpForLevel(n) {
  return XP_PER_LEVEL_BASE * n * (n - 1) / 2;
}

// Leaderboard player-name plumbing. We keep a separate localStorage entry for
// the last-used name so the gameover input pre-fills with whatever the player
// typed last run — small dignity, big QoL.
const PLAYER_NAME_KEY = 'frogger.playerName';
const DEFAULT_NAME = 'FROG';
export const NAME_MAX_LENGTH = 12;

export function loadPlayerName() {
  try {
    const raw = localStorage.getItem(PLAYER_NAME_KEY);
    if (raw && typeof raw === 'string') {
      const clean = sanitizeName(raw);
      if (clean) return clean;
    }
  } catch {}
  return DEFAULT_NAME;
}

export function savePlayerName(name) {
  const clean = sanitizeName(name);
  try {
    localStorage.setItem(PLAYER_NAME_KEY, clean);
  } catch {}
  return clean;
}

// Strip control chars + leading/trailing whitespace, cap length, uppercase.
// Falls back to DEFAULT_NAME for empty input so the leaderboard never shows
// a blank cell.
function sanitizeName(name) {
  if (name == null) return DEFAULT_NAME;
  const stripped = String(name).replace(/[\x00-\x1f\x7f]/g, '').trim();
  const upper = stripped.slice(0, NAME_MAX_LENGTH).toUpperCase();
  return upper || DEFAULT_NAME;
}

// Run-state: lives, score, combo multiplier, in-traffic survival timer, high score.
//
// Two score buckets: `pending` (this level, forfeit on death) and `banked` (past
// crossings, only forfeit on game-over). The HUD renders the sum.
//
// Combo multiplier compounds on near-miss/bug events and decays exponentially
// after COMBO_DECAY_DELAY of idleness. The multiplier scales the NEXT event's
// payout, not the current one — so the first near-miss is worth its base value.
export class Score {
  constructor() {
    this.highScore = loadHighScore();
    this.lives = STARTING_LIVES;
    this.banked = 0;
    this.pending = 0;
    this.combo = 1;
    this._comboIdle = 0;
    this.inTrafficSeconds = 0;
    this._milestonesFired = 0;
    this.gameOver = false;
    this._toastQueue = [];
    // XP accumulates as banked points do. Level 1 = empty baseline (no skills);
    // Lv 2 (1000 XP) is the first earnable skill point. Wiped on game over.
    this.xp = 0;
    this.frogLevel = 1;
    this._levelUpQueue = [];

    // Frog Focus (Lv 3+). Game owns the on/off transitions and drain timing;
    // Score owns the meter value (single source for HUD + scoring).
    this.focusMeter = 0;
    this.focusActive = false;

    // Recombobulation (Lv 4+). Charges intercept a fatal hit. Game refills to
    // the tier cap on each game-level build.
    this.recombCharges = 0;

    // Untouchable tracking — set during the level if the player dies or burns
    // a recomb charge. Both must stay false through the crossing for the
    // Untouchable bonus to fire. Reset inside bankCrossing.
    this._diedThisLevel = false;
    this._recombUsedThisLevel = false;
    // Streak counter — # of consecutive crossings the player has been Untouchable.
    // Awards UNTOUCHABLE_STREAK_BONUS per step BEYOND the first. Reset on death
    // or recomb burn (the run-end reset path also clears it via reset()).
    this._untouchableStreak = 0;

    // Rank (1-indexed) the just-finished run earned on the leaderboard, or null
    // if it didn't make the cut. Set by onDeath when game-over fires; consumed
    // by hud.showGameOver to highlight the new entry. Cleared on reset().
    this.lastRank = null;
  }

  reset() {
    this.lives = STARTING_LIVES;
    this.banked = 0;
    this.pending = 0;
    this.combo = 1;
    this._comboIdle = 0;
    this.inTrafficSeconds = 0;
    this._milestonesFired = 0;
    this.gameOver = false;
    this._toastQueue.length = 0;
    this.xp = 0;
    this.frogLevel = 1;
    this._levelUpQueue.length = 0;
    this.focusMeter = 0;
    this.focusActive = false;
    this.recombCharges = 0;
    this._diedThisLevel = false;
    this._recombUsedThisLevel = false;
    this._untouchableStreak = 0;
    this.lastRank = null;
  }

  totalScore() {
    return this.banked + this.pending;
  }

  // Drains any queued toast events (caller renders them via HUD).
  drainToasts() {
    if (this._toastQueue.length === 0) return null;
    const out = this._toastQueue.slice();
    this._toastQueue.length = 0;
    return out;
  }

  // Drains any queued frog-level-up events. Each entry is the new frog level (int).
  drainLevelUps() {
    if (this._levelUpQueue.length === 0) return null;
    const out = this._levelUpQueue.slice();
    this._levelUpQueue.length = 0;
    return out;
  }

  // Called every frame during PLAYING.
  // `inTraffic` = frog is on a wheel-row sub-row (not start, goal, or safe stripe).
  update(dt, inTraffic) {
    // Combo decay after idle period.
    this._comboIdle += dt;
    if (this._comboIdle > COMBO_DECAY_DELAY && this.combo > 1) {
      this.combo = 1 + (this.combo - 1) * Math.exp(-dt / COMBO_DECAY_TAU);
      if (this.combo < 1.02) this.combo = 1;
    }

    // In-traffic survival milestones.
    if (inTraffic) {
      this.inTrafficSeconds += dt;
      while (
        this._milestonesFired < SURVIVAL_MILESTONES.length &&
        this.inTrafficSeconds >= SURVIVAL_MILESTONES[this._milestonesFired]
      ) {
        const idx = this._milestonesFired;
        const payout = SURVIVAL_PAYOUTS[idx];
        this.pending += payout;
        this._toastQueue.push(
          `+${payout.toLocaleString()} SURVIVED ${SURVIVAL_MILESTONES[idx]}s`
        );
        this._milestonesFired++;
      }
    }
  }

  // Near-miss event. tier ∈ {'THREADED','UNDER','GRAZED'}. (Wired in S2.)
  // `vehicle` is the source vehicle — its type's `scoreThreaded` overrides the
  // SCORE_THREADED default so smaller vehicles pay more for a thread.
  // `opts.daredevil` (THREADED only) layers a flat SCORE_DAREDEVIL_BONUS onto
  // the base before combo scaling — fired when the frog threaded BOTH wheel-
  // row lines of the same vehicle in one approach.
  // While Frog Focus is active (Lv 3+), THREADED/GRAZED base is multiplied by
  // FOCUS_NEAR_MISS_MULT and the focus meter fills proportional to event tier.
  addNearMiss(tier, vehicle, opts = {}) {
    // UNDER ("DOWN UNDER") payout scales with the running combo so chaining
    // bodies overhead is rewarding, but does NOT bump the combo or reset its
    // idle timer — sitting passively in a safe Z gap shouldn't farm combo.
    // UNDER also doesn't fill the focus meter (passive, not a skill expression).
    if (tier === 'UNDER') {
      this.pending += Math.round(SCORE_UNDER * this.combo);
      return;
    }
    let base, bump, fill;
    if (tier === 'THREADED') {
      base = vehicle?.type?.scoreThreaded ?? SCORE_THREADED;
      if (opts.daredevil) base += SCORE_DAREDEVIL_BONUS;
      bump = COMBO_BUMP_THREADED;
      fill = FOCUS_FILL_THREADED;
    }
    else if (tier === 'GRAZED') {
      base = SCORE_GRAZED;
      bump = COMBO_BUMP_GRAZED;
      fill = FOCUS_FILL_GRAZED;
    }
    else return;
    if (this.focusActive) base *= FOCUS_NEAR_MISS_MULT;
    this.pending += Math.round(base * this.combo);
    this.combo = Math.min(COMBO_CAP, this.combo * bump);
    this._comboIdle = 0;
    this.focusMeter = Math.min(1, this.focusMeter + fill);
  }

  // Bug pickup. (Wired in S3.)
  addBugPickup() {
    this.pending += Math.round(SCORE_BUG_BASE * this.combo);
    this.combo = Math.min(COMBO_CAP, this.combo * COMBO_BUMP_BUG);
    this._comboIdle = 0;
    this.focusMeter = Math.min(1, this.focusMeter + FOCUS_FILL_BUG);
  }

  // Game owns on/off transitions; Score just stores the flag so addNearMiss can
  // see it without the game.js → score.js call needing to thread state through.
  setFocusActive(active) {
    this.focusActive = active;
  }

  // Drain the meter while focus is held. `dt` is real wall-clock time — meter
  // costs the player real seconds, not slowed-world seconds. `duration` is the
  // tier-scaled focus duration in seconds. Returns true when meter hits 0.
  drainFocusMeter(dt, duration) {
    if (duration <= 0) return true;
    this.focusMeter = Math.max(0, this.focusMeter - dt / duration);
    return this.focusMeter <= 0;
  }

  // Consume one Recombobulation charge if available. Returns true on success.
  // Doesn't touch lives — recomb is the alternative to losing a life. Burning
  // a charge also disqualifies the level from the Untouchable bonus.
  consumeRecombCharge() {
    if (this.recombCharges <= 0) return false;
    this.recombCharges--;
    this._recombUsedThisLevel = true;
    this._untouchableStreak = 0;
    return true;
  }

  // On crossing — bank pending into total, reset per-level state. Returns
  // { crossingBonus, untouchableBonus } so the HUD/Game can react (e.g., refill
  // focus meter on Untouchable). Banked points double as XP; any frog-level
  // thresholds crossed get queued onto `_levelUpQueue`.
  bankCrossing(level) {
    // Untouchable: no death, no recomb charge burned this level. Flat base
    // payout + a streak bonus per consecutive Untouchable beyond the first
    // (1st = base, 2nd = base + 250, 3rd = base + 500, ...). Award before
    // banking so the bonus rolls into pending (and thus banked + XP). Toast is
    // queued so HUD picks it up next drainToasts(); shows the streak count
    // when it's > 1 so the player can see the chain growing.
    let untouchableBonus = 0;
    if (!this._diedThisLevel && !this._recombUsedThisLevel) {
      this._untouchableStreak++;
      const streakBonus = (this._untouchableStreak - 1) * UNTOUCHABLE_STREAK_BONUS;
      untouchableBonus = UNTOUCHABLE_BONUS_BASE + streakBonus;
      this.pending += untouchableBonus;
      const label = this._untouchableStreak > 1
        ? `UNTOUCHABLE x${this._untouchableStreak} +${untouchableBonus.toLocaleString()}`
        : `UNTOUCHABLE +${untouchableBonus.toLocaleString()}`;
      this._toastQueue.push(label);
    }
    this._diedThisLevel = false;
    this._recombUsedThisLevel = false;

    const crossingBonus = CROSSING_BASE_BONUS * level;
    this.pending += crossingBonus;
    const delta = this.pending;
    this.banked += delta;
    this.pending = 0;
    this.combo = 1;
    this._comboIdle = 0;
    this.inTrafficSeconds = 0;
    this._milestonesFired = 0;
    // Focus meter persists across crossings — a meter you worked for on this
    // level carries into the next. Death still wipes it (onDeath); the run-
    // ending GAMEOVER path resets it via score.reset().

    // XP threshold check. A high-combo crossing on a high level can cross
    // multiple thresholds at once; queue them all so the HUD can show one
    // toast per level reached.
    this.xp += delta;
    while (this.frogLevel < FROG_LEVEL_CAP) {
      const next = xpForLevel(this.frogLevel + 1);
      if (this.xp < next) break;
      this.frogLevel++;
      this._levelUpQueue.push(this.frogLevel);
    }
    return { crossingBonus, untouchableBonus };
  }

  // On collision death. Returns true iff this was the final life (game over).
  // Pending score is forfeit; banked survives until game over.
  // `level` is the game-level the run ended on; persisted with the leaderboard
  // entry so the gameover panel can show "Lv 12" alongside the score.
  onDeath(level) {
    this.lives--;
    this.pending = 0;
    this.combo = 1;
    this._comboIdle = 0;
    this.inTrafficSeconds = 0;
    this._milestonesFired = 0;
    this.focusMeter = 0;
    this.focusActive = false;
    this._diedThisLevel = true;
    this._untouchableStreak = 0;
    if (this.lives <= 0) {
      this.gameOver = true;
      // Submit with the player's last-used name as the default. The HUD pops
      // an inline-edit field on the highlighted row so they can change it
      // before clicking through to the next run; updateScoreName persists the
      // edit (and savePlayerName remembers it for next time).
      this.lastRank = submitScore(this.banked, level ?? 1, loadPlayerName());
      const top = loadScores()[0];
      if (top && top.score > this.highScore) this.highScore = top.score;
      return true;
    }
    return false;
  }
}

// Loads the persisted top-N leaderboard. On first run after upgrading from the
// single-value `frogger.highscore` storage, the legacy value is migrated into
// a one-entry list so the player's prior best isn't lost.
export function loadScores() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(isValidEntry)
          .sort((a, b) => b.score - a.score)
          .slice(0, LEADERBOARD_SIZE);
      }
    }
  } catch {
    // fall through to legacy migration / empty
  }
  try {
    const legacy = Number(localStorage.getItem(HIGH_SCORE_KEY));
    if (Number.isFinite(legacy) && legacy > 0) {
      const seed = [{ score: legacy, level: 1, date: '' }];
      saveScores(seed);
      return seed;
    }
  } catch {
    // localStorage unavailable
  }
  return [];
}

// Submits a finished run. Returns the 1-indexed rank if it made the top N,
// or null otherwise. A score of 0 never qualifies (the table reads cleaner
// without "0 · Lv 1" entries cluttering the bottom).
export function submitScore(score, level, name) {
  if (!Number.isFinite(score) || score <= 0) return null;
  const scores = loadScores();
  const entry = {
    name: sanitizeName(name),
    score: Math.floor(score),
    level: Math.max(1, Math.floor(level)),
    date: new Date().toISOString().slice(0, 10),
  };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, LEADERBOARD_SIZE);
  const idx = trimmed.indexOf(entry);
  if (idx === -1) return null;
  saveScores(trimmed);
  return idx + 1;
}

// Replace the name on the entry at the given 1-indexed rank. Used by the HUD
// inline-edit on game-over so the player can rename the entry submitScore
// already wrote (with their previous default name). Also persists the new
// name as the default for next run via savePlayerName. No-op if `rank` is out
// of range (e.g. localStorage was cleared between submit and edit).
export function updateScoreName(rank, name) {
  if (!Number.isFinite(rank) || rank < 1) return null;
  const scores = loadScores();
  const idx = rank - 1;
  if (idx >= scores.length) return null;
  const clean = sanitizeName(name);
  scores[idx] = { ...scores[idx], name: clean };
  saveScores(scores);
  savePlayerName(clean);
  return clean;
}

function isValidEntry(e) {
  return (
    e &&
    typeof e === 'object' &&
    Number.isFinite(e.score) &&
    e.score > 0 &&
    Number.isFinite(e.level) &&
    e.level >= 1
  );
}

function saveScores(list) {
  try {
    localStorage.setItem(HIGH_SCORE_LIST_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable — silently skip
  }
}

function loadHighScore() {
  const top = loadScores()[0];
  return top ? top.score : 0;
}
