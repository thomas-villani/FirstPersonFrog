import { STARTING_LIVES, FROG_LEVEL_CAP } from './config.js';
import { xpForLevel, loadScores, updateScoreName, NAME_MAX_LENGTH } from './score.js';

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
    this.overlayLabel = document.getElementById('overlay-label');
    this.overlaySmall = document.getElementById('overlay-small');
    this._defaultOverlaySmall = this.overlaySmall ? this.overlaySmall.textContent : '';
    this.leaderboardEntriesEl = document.getElementById('leaderboard-entries');
    this.leaderboardTitleEl = document.getElementById('leaderboard-title');
    this.leaderboardFinalEl = document.getElementById('leaderboard-final');
    // Remembers which section was active before help / leaderboard opened, so
    // BACK returns the player to the right place (title vs pause vs gameover).
    this._prevOverlayMode = 'title';
    this._wireOverlayButtons();

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

  // --- Overlay sections (title / pause / gameover / help) ---

  setOverlay(main, sub) {
    if (this.overlayLabel) this.overlayLabel.textContent = main;
    if (this.overlaySmall) this.overlaySmall.textContent = sub;
  }

  // Switches which section inside #overlay is visible. CSS keys off data-mode.
  setOverlayMode(mode) {
    if (!this.overlay) return;
    this.overlay.dataset.mode = mode;
  }

  showTitle() {
    this.setOverlayMode('title');
  }

  showPause() {
    this.setOverlay('CLICK TO RESUME', this._defaultOverlaySmall);
    this.setOverlayMode('pause');
  }

  // `rank` is the 1-indexed leaderboard position the just-finished run earned,
  // or null if it didn't make the top 10. The matching list entry is highlighted.
  showGameOver(finalScore, highScore, rank) {
    const isNewHi = finalScore > 0 && finalScore >= highScore && rank === 1;
    const headline = isNewHi ? 'GAME OVER · NEW HIGH SCORE' : 'GAME OVER';
    if (this.leaderboardTitleEl) {
      this.leaderboardTitleEl.textContent = headline;
      this.leaderboardTitleEl.classList.add('gameover');
    }
    if (this.leaderboardFinalEl) {
      const newHiBadge = isNewHi ? `<span class="new-hi">NEW HIGH SCORE</span>` : '';
      const rankText = rank ? ` · RANK #${rank}` : '';
      this.leaderboardFinalEl.innerHTML =
        `FINAL: ${finalScore.toLocaleString()}${rankText}${newHiBadge}`;
    }
    // Editable iff the run made the cut — no point showing an input field for
    // a non-qualifying score (the entry isn't even in the list).
    this.renderLeaderboard(rank, /*editable=*/ rank != null);
    // Update the gameover hint to mention name entry only when an input is shown.
    const hintEl = document.querySelector('#overlay-leaderboard .lb-gameover-hint');
    if (hintEl) {
      hintEl.textContent = rank != null
        ? 'TYPE YOUR NAME · CLICK ANYWHERE FOR NEW RUN'
        : 'CLICK ANYWHERE FOR NEW RUN';
    }
    this.setOverlayMode('gameover');
  }

  // Title-screen leaderboard view. Same panel, different framing — BACK button
  // visible, no final-score row, click-on-overlay is inert (input.js gates it).
  showLeaderboard() {
    if (!this.overlay) return;
    const cur = this.overlay.dataset.mode;
    if (cur && cur !== 'leaderboard') this._prevOverlayMode = cur;
    if (this.leaderboardTitleEl) {
      this.leaderboardTitleEl.textContent = 'LEADERBOARD';
      this.leaderboardTitleEl.classList.remove('gameover');
    }
    this.renderLeaderboard(null);
    this.setOverlayMode('leaderboard');
  }

  hideLeaderboard() {
    this.setOverlayMode(this._prevOverlayMode || 'title');
  }

  // Populates the <ol> with the persisted top-N. `highlightRank` (1-indexed)
  // marks the just-earned entry so the player can find their score in the list.
  // When `editable` is true, the highlighted row swaps its name span for a
  // text input — used on game-over so the player can rename their entry. The
  // input commits on Enter or blur (see _wireNameInput).
  renderLeaderboard(highlightRank, editable = false) {
    if (!this.leaderboardEntriesEl) return;
    const scores = loadScores();
    this.leaderboardEntriesEl.innerHTML = '';
    if (scores.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'lb-empty';
      empty.textContent = 'NO SCORES YET — BE THE FIRST FROG';
      this.leaderboardEntriesEl.appendChild(empty);
      return;
    }
    for (let i = 0; i < scores.length; i++) {
      const e = scores[i];
      const li = document.createElement('li');
      const isHighlighted = highlightRank && i + 1 === highlightRank;
      if (isHighlighted) li.className = 'highlight';
      const rankSpan = `<span class="lb-rank">${i + 1}.</span>`;
      const scoreSpan = `<span class="lb-score">${e.score.toLocaleString()}</span>`;
      const levelSpan = `<span class="lb-level">Lv ${e.level}</span>`;
      const dateSpan = `<span class="lb-date">${escapeHtml(e.date || '')}</span>`;
      const name = e.name || 'FROG';
      if (isHighlighted && editable) {
        // Build the row via DOM nodes so we can attach an input element with
        // event listeners directly. innerHTML wouldn't let us bind handlers.
        li.innerHTML = rankSpan;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'lb-name-input';
        input.maxLength = NAME_MAX_LENGTH;
        input.value = name;
        input.spellcheck = false;
        input.autocapitalize = 'characters';
        input.setAttribute('aria-label', 'enter your name');
        li.appendChild(input);
        li.insertAdjacentHTML('beforeend', scoreSpan + levelSpan + dateSpan);
        this._wireNameInput(input, highlightRank);
      } else {
        li.innerHTML =
          rankSpan +
          `<span class="lb-name">${escapeHtml(name)}</span>` +
          scoreSpan +
          levelSpan +
          dateSpan;
      }
      this.leaderboardEntriesEl.appendChild(li);
    }
  }

  // Bind keydown/blur handlers on the inline-edit input. Enter commits and
  // blurs; blur commits + freezes the value into a span (so the row matches
  // every other entry afterward). Both stop click/key propagation so typing
  // a key bound elsewhere (mute "M", restart click) doesn't leak through.
  _wireNameInput(input, rank) {
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      const cleaned = updateScoreName(rank, input.value);
      if (cleaned == null) return;
      // Replace the input with a span so the row reads like the rest of the
      // list (and a stray click can't refocus the field after commit).
      const span = document.createElement('span');
      span.className = 'lb-name';
      span.textContent = cleaned;
      input.replaceWith(span);
    });
    // Defer focus until the panel is actually shown — calling focus()
    // synchronously inside renderLeaderboard sometimes loses the focus to the
    // overlay re-layout. requestAnimationFrame is enough to settle.
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  // Help is a take-over panel — remembers the section we came from so BACK
  // restores it (defaulting to title for the first-load case).
  showHelp() {
    if (!this.overlay) return;
    const cur = this.overlay.dataset.mode;
    if (cur && cur !== 'help') this._prevOverlayMode = cur;
    this.setOverlayMode('help');
  }

  hideHelp() {
    this.setOverlayMode(this._prevOverlayMode || 'title');
  }

  // Help open/close + the help panel itself stop click propagation so they
  // don't bubble to the overlay's "click anywhere → request pointer lock"
  // handler. The PLAY button intentionally does NOT stop propagation — the
  // overlay handler is what acquires pointer lock and resumes audio.
  _wireOverlayButtons() {
    const openTitle = document.getElementById('btn-help-open');
    const openPause = document.getElementById('btn-help-open-pause');
    const close = document.getElementById('btn-help-close');
    const help = document.getElementById('overlay-help');
    const lbOpen = document.getElementById('btn-leaderboard-open');
    const lbClose = document.getElementById('btn-leaderboard-close');
    const lbPanel = document.getElementById('overlay-leaderboard');
    const swallow = (e) => e.stopPropagation();

    if (openTitle) {
      openTitle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showHelp();
      });
    }
    if (openPause) {
      openPause.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showHelp();
      });
    }
    if (close) {
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideHelp();
      });
    }
    if (help) {
      // Reading clicks (e.g. selecting text) inside the help panel must not
      // pop pointer lock or start the game.
      help.addEventListener('click', swallow);
      help.addEventListener('mousedown', swallow);
    }
    if (lbOpen) {
      lbOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showLeaderboard();
      });
    }
    if (lbClose) {
      lbClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideLeaderboard();
      });
    }
    if (lbPanel) {
      // Title-view: panel clicks must not start the game (the dim background
      // is gated on data-mode). Game-over view: clicks SHOULD propagate so
      // anywhere-on-overlay starts a new run — handled inline below.
      lbPanel.addEventListener('click', (e) => {
        if (this.overlay && this.overlay.dataset.mode === 'leaderboard') {
          e.stopPropagation();
        }
      });
      lbPanel.addEventListener('mousedown', (e) => {
        if (this.overlay && this.overlay.dataset.mode === 'leaderboard') {
          e.stopPropagation();
        }
      });
    }
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

// Escape user-supplied strings before piping into innerHTML. Player names come
// from a free-text input, and dates come from new Date().toISOString() so are
// already safe — but escaping both keeps the rendering path uniformly safe.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
