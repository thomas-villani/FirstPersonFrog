// Tiny DOM-based HUD. Death counter, red damage flash, CROSSED toast.
export class Hud {
  constructor() {
    this.deathEl = document.getElementById('death-count');
    this.flashEl = document.getElementById('flash');
    this.toastEl = document.getElementById('toast');
    this.deaths = 0;
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

  onWin() {
    this.toastEl.textContent = 'CROSSED!';
    this.toastEl.style.opacity = '1';
    setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 800);
  }
}
