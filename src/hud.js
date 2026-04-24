// Tiny DOM-based HUD. Death counter, level counter, red damage flash, level-up toast.
export class Hud {
  constructor() {
    this.deathEl = document.getElementById('death-count');
    this.flashEl = document.getElementById('flash');
    this.toastEl = document.getElementById('toast');
    this.levelEl = document.getElementById('level');
    this.deaths = 0;
    this.level = 1;
    this._renderLevel();
  }

  onDeath() {
    this.deaths++;
    this.deathEl.textContent = String(this.deaths);
    // Snap flash on, hold briefly, then let the CSS transition fade it out.
    this.flashEl.style.opacity = '0.7';
    setTimeout(() => {
      this.flashEl.style.opacity = '0';
    }, 60);
  }

  // Returns the new level so the Game can ramp difficulty.
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

  _renderLevel() {
    if (this.levelEl) this.levelEl.textContent = `LEVEL ${this.level}`;
  }
}
