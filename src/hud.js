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
    this.focusRowEl = document.getElementById('focus-row');
    this.focusFillEl = document.getElementById('focus-bar-fill');
    this.recombRowEl = document.getElementById('recomb-row');
    this.recombChargesEl = document.getElementById('recomb-charges');
    this.muteBadgeEl = document.getElementById('mute-badge');
    this.skillBadgesEl = document.getElementById('skill-badges');
    this.skillPickerEl = document.getElementById('skill-picker');
    this.skillPickerLevelEl = document.getElementById('sp-level');
    this.skillPickerOptionEls = this.skillPickerEl
      ? Array.from(this.skillPickerEl.querySelectorAll('.sp-option'))
      : [];

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
    this.renderFocusMeter(0, false);
    this.renderRecombCharges(0, false);
    this.renderSkillBadges({ tongueFu: 1, hipHopping: 0, frogcentration: 0, hocusCroakus: 0 });
    this.hideSkillPicker();
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

  // Bottom-center focus meter — only visible once Frog Focus is unlocked (Lv 3+).
  // `fill` is normalized [0, 1]; `unlocked` toggles the row's visibility.
  renderFocusMeter(fill, unlocked) {
    if (!this.focusRowEl || !this.focusFillEl) return;
    if (!unlocked) {
      this.focusRowEl.style.display = 'none';
      return;
    }
    this.focusRowEl.style.display = 'block';
    const pct = Math.max(0, Math.min(100, Math.round(fill * 100)));
    this.focusFillEl.style.width = `${pct}%`;
  }

  // Bottom-left mute indicator — hidden when audio is on, shown when muted.
  renderMuted(muted) {
    if (!this.muteBadgeEl) return;
    this.muteBadgeEl.style.display = muted ? 'block' : 'none';
  }

  // Row of beetle icons matching held Recombobulation charges. Hidden while
  // Hocus Croakus is unspent. The `unlocked` flag lets us still show "0"
  // (empty row) when unlocked-but-empty so the player remembers they earned it.
  renderRecombCharges(charges, unlocked) {
    if (!this.recombRowEl || !this.recombChargesEl) return;
    if (!unlocked) {
      this.recombRowEl.style.display = 'none';
      return;
    }
    this.recombRowEl.style.display = 'block';
    this.recombChargesEl.textContent = '🪲'.repeat(Math.max(0, charges));
  }

  // Branch-tier badges row under the XP bar. Always visible during a run.
  renderSkillBadges(tiers) {
    if (!this.skillBadgesEl) return;
    const t = tiers ?? {};
    this.skillBadgesEl.textContent =
      `🥋 ${t.tongueFu ?? 0}  🐰 ${t.hipHopping ?? 0}  🧘 ${t.frogcentration ?? 0}  🎩 ${t.hocusCroakus ?? 0}`;
  }

  // Show the skill picker modal for the next queued frog level. `branchOrder`
  // is the array of branch IDs in display order (1..4 keys). `branchMeta` is
  // keyed by branch ID with { icon, name, tierLabels[] }. `tiers` is the
  // current snapshot — we render T(current) → T(current+1), or "MAXED" when
  // the branch is at T7.
  showSkillPicker({ frogLevel, tiers, branchOrder, branchMeta }) {
    if (!this.skillPickerEl) return;
    if (this.skillPickerLevelEl) this.skillPickerLevelEl.textContent = String(frogLevel);
    for (let i = 0; i < this.skillPickerOptionEls.length; i++) {
      const optEl = this.skillPickerOptionEls[i];
      const branchId = branchOrder[i];
      if (!branchId) {
        optEl.style.display = 'none';
        continue;
      }
      optEl.style.display = '';
      const meta = branchMeta[branchId];
      const cur = tiers[branchId] ?? 0;
      const next = cur + 1;
      const iconEl = optEl.querySelector('.sp-icon');
      const nameEl = optEl.querySelector('.sp-name');
      const tierEl = optEl.querySelector('.sp-tier');
      const descEl = optEl.querySelector('.sp-desc');
      if (iconEl) iconEl.textContent = meta.icon;
      if (nameEl) nameEl.textContent = meta.name;
      if (cur >= 7) {
        optEl.classList.add('maxed');
        if (tierEl) tierEl.textContent = 'MAXED';
        if (descEl) descEl.textContent = meta.tierLabels[7] ?? '';
      } else {
        optEl.classList.remove('maxed');
        if (tierEl) tierEl.textContent = `T${cur} → T${next}`;
        if (descEl) descEl.textContent = meta.tierLabels[next] ?? '';
      }
    }
    this.skillPickerEl.classList.remove('hidden');
  }

  hideSkillPicker() {
    if (!this.skillPickerEl) return;
    this.skillPickerEl.classList.add('hidden');
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
    this.renderFocusMeter(0, false);
    this.renderRecombCharges(0, false);
    this.renderSkillBadges({ tongueFu: 1, hipHopping: 0, frogcentration: 0, hocusCroakus: 0 });
    this.hideSkillPicker();
    if (this.milestoneEl) this.milestoneEl.style.opacity = '0';
    if (this.toastEl) this.toastEl.style.opacity = '0';
    if (this.levelUpEl) this.levelUpEl.style.opacity = '0';
  }

  // Used by the debug-menu warp cheat — keeps the HUD level counter in sync
  // when Game._buildLevel is called outside the normal bank-crossing flow.
  setLevel(n) {
    this.level = n;
    this._renderLevel();
  }

  _renderLevel() {
    if (this.levelEl) this.levelEl.textContent = `LEVEL ${this.level}`;
  }
}
