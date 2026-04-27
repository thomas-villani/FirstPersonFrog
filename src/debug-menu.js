// Pause-screen debug panel. Three testing toggles wired into Game cheat methods.
//
// The overlay's click handler grabs pointer-lock to start play. Clicks on the
// menu must stopPropagation so toggling a checkbox doesn't also enter play.
export class DebugMenu {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('debug-menu');
    if (!this.root) return;

    this.invulnEl = document.getElementById('dm-invuln');
    this.allSkillsEl = document.getElementById('dm-allskills');
    this.levelEl = document.getElementById('dm-level');
    this.warpEl = document.getElementById('dm-warp');
    this.statusEl = document.getElementById('dm-status');

    this.root.addEventListener('click', (e) => e.stopPropagation());
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());

    if (this.invulnEl) {
      this.invulnEl.addEventListener('change', () => {
        this.game.cheatSetInvuln(this.invulnEl.checked);
        this._setStatus(`Invulnerable: ${this.invulnEl.checked ? 'ON' : 'OFF'}`);
      });
    }
    if (this.allSkillsEl) {
      this.allSkillsEl.addEventListener('change', () => {
        this.game.cheatSetAllSkills(this.allSkillsEl.checked);
        this._setStatus(`All skills: ${this.allSkillsEl.checked ? 'ON' : 'OFF'}`);
      });
    }
    if (this.warpEl && this.levelEl) {
      this.warpEl.addEventListener('click', () => {
        const n = parseInt(this.levelEl.value, 10);
        if (!Number.isFinite(n) || n < 1) {
          this._setStatus('Invalid level');
          return;
        }
        this.game.cheatWarpToLevel(n);
        this._setStatus(`Warped to level ${n}`);
      });
    }
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }
}
