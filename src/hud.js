import { STARTING_LIVES, FROG_LEVEL_CAP } from './config.js';
import { xpForLevel } from './score.js';

// Tiny DOM-based HUD. Score, combo, lives, near-miss counter, level toast,
// milestone toast, red damage flash, overlay text. No three.js HUD layer — DOM
// is cheap and easy to rearrange.
export class Hud {
  constructor() {
    this.nearMissEl = document.getElementById('near-miss-count');
    this.flashEl = document.getElementById('flash');
    this.toastEl = document.getElementById('toast');
    this.milestoneEl = document.getElementById('milestone-toast');
    this.levelUpEl = document.getElementById('level-up-toast');
    this.levelEl = document.getElementById('level');
    this.scoreEl = document.getElementById('score');
    this.highScoreEl = document.getElementById('high-score');
    this.comboRowEl = document.getElementById('combo-row');
    this.comboEl = document.getElementById('combo');
    this.livesEl = document.getElementById('lives-icons');
    this.frogLevelEl = document.getElementById('frog-level');
    this.xpFillEl = document.getElementById('xp-bar-fill');

    this.overlay = document.getElementById('overlay');
    this.overlayLabel = this.overlay.querySelector('div');
    this.overlaySmall = this.overlay.querySelector('small');
    this._defaultOverlayMain = this.overlayLabel ? this.overlayLabel.textContent : 'CLICK TO PLAY';
    this._defaultOverlaySmall = this.overlaySmall ? this.overlaySmall.textContent : '';

    this._milestoneTimer = null;
    this._levelUpTimer = null;

    this.nearMisses = 0;
    this.level = 1;
    this._renderLevel();
    this.renderLives(STARTING_LIVES);
    this.renderScore(0);
    this.renderHighScore(0);
    this.renderCombo(1);
    this.renderFrogLevel(1, 0);
    this._renderNearMisses();
  }

  // --- Score / combo / lives / high score ---

  renderScore(total) {
    if (this.scoreEl) this.scoreEl.textContent = total.toLocaleString();
  }

  renderHighScore(hi) {
    if (this.highScoreEl) this.highScoreEl.textContent = hi.toLocaleString();
  }

  // Hidden when ~1, visible and color-shifting toward red as it nears the cap.
  renderCombo(multiplier) {
    if (!this.comboEl || !this.comboRowEl) return;
    if (multiplier > 1.05) {
      this.comboEl.textContent = 'x' + multiplier.toFixed(1);
      this.comboRowEl.style.display = 'block';
    } else {
      this.comboRowEl.style.display = 'none';
    }
  }

  renderLives(n) {
    if (!this.livesEl) return;
    this.livesEl.textContent = '🐸'.repeat(Math.max(0, n));
  }

  // Top-left frog-level row + XP progress bar. At cap the bar shows full and the
  // text just reads "FROG Lv 17 (MAX)".
  renderFrogLevel(frogLevel, xp) {
    if (!this.frogLevelEl || !this.xpFillEl) return;
    if (frogLevel >= FROG_LEVEL_CAP) {
      this.frogLevelEl.textContent = `FROG Lv ${frogLevel} (MAX)`;
      this.xpFillEl.style.width = '100%';
      return;
    }
    const prev = xpForLevel(frogLevel);
    const next = xpForLevel(frogLevel + 1);
    const within = Math.max(0, xp - prev);
    const span = Math.max(1, next - prev);
    const pct = Math.min(100, Math.round((within / span) * 100));
    this.frogLevelEl.textContent =
      `FROG Lv ${frogLevel} (${xp.toLocaleString()} / ${next.toLocaleString()})`;
    this.xpFillEl.style.width = `${pct}%`;
  }

  // Gold-tinted toast for skill unlocks. Same fade pattern as milestone toast,
  // but its own DOM node so a level-up doesn't fight a milestone payout.
  showLevelUpToast(text) {
    if (!this.levelUpEl) return;
    this.levelUpEl.textContent = text;
    this.levelUpEl.style.opacity = '1';
    if (this._levelUpTimer) clearTimeout(this._levelUpTimer);
    this._levelUpTimer = setTimeout(() => {
      this.levelUpEl.style.opacity = '0';
    }, 1400);
  }

  // Centered toast for survival milestones / threaded events. Lives below the
  // main level toast, so they don't collide visually.
  showMilestoneToast(text) {
    if (!this.milestoneEl) return;
    this.milestoneEl.textContent = text;
    this.milestoneEl.style.opacity = '1';
    if (this._milestoneTimer) clearTimeout(this._milestoneTimer);
    this._milestoneTimer = setTimeout(() => {
      this.milestoneEl.style.opacity = '0';
    }, 1100);
  }

  // --- Overlay text (pause / game over) ---

  setOverlay(main, sub) {
    if (this.overlayLabel) this.overlayLabel.textContent = main;
    if (this.overlaySmall) this.overlaySmall.textContent = sub;
  }

  showPause() {
    this.setOverlay('CLICK TO RESUME', this._defaultOverlaySmall);
  }

  showGameOver(finalScore, highScore) {
    const isNewHi = finalScore > 0 && finalScore >= highScore;
    const headline = isNewHi ? 'GAME OVER · NEW HIGH SCORE' : 'GAME OVER';
    const sub = `FINAL: ${finalScore.toLocaleString()} · HI: ${highScore.toLocaleString()} · CLICK FOR NEW RUN`;
    this.setOverlay(headline, sub);
  }

  // --- Near-miss lifetime counter ---
  // Bumped on every THREADED/UNDER/GRAZED event. Survives respawn; resets only
  // on a new run.
  onNearMiss() {
    this.nearMisses++;
    this._renderNearMisses();
  }

  _renderNearMisses() {
    if (this.nearMissEl) this.nearMissEl.textContent = String(this.nearMisses);
  }

  // --- Damage flash on collision ---

  onDeath() {
    this.flashEl.style.opacity = '0.7';
    setTimeout(() => {
      this.flashEl.style.opacity = '0';
    }, 60);
  }

  onWin() {
    this.level++;
    this._renderLevel();
    this.toastEl.textContent = `LEVEL ${this.level}`;
    this.toastEl.style.opacity = '1';
    setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 1100);
    return this.level;
  }

  // Reset to a fresh run after game-over (called from Game.onLockAcquired).
  resetForNewRun() {
    this.nearMisses = 0;
    this._renderNearMisses();
    this.level = 1;
    this._renderLevel();
    this.renderLives(STARTING_LIVES);
    this.renderScore(0);
    this.renderCombo(1);
    this.renderFrogLevel(1, 0);
    if (this.milestoneEl) this.milestoneEl.style.opacity = '0';
    if (this.toastEl) this.toastEl.style.opacity = '0';
    if (this.levelUpEl) this.levelUpEl.style.opacity = '0';
  }

  _renderLevel() {
    if (this.levelEl) this.levelEl.textContent = `LEVEL ${this.level}`;
  }
}
