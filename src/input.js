import { PITCH_CLAMP } from './config.js';

// Owns keyboard, pointer lock, mouse-look, and the click-to-start overlay.
// Hard-commit model: the frog itself rejects keypresses while mid-hop. We additionally
// gate input on game.state === 'PLAYING' so the intro flythrough and pause state don't
// react to mouse-look or hops.
//
// We intentionally read `game.frog` lazily (not a cached reference) — Game replaces the
// Frog instance on every level transition, so a stale field would silently stop working
// after the first crossing.
export class Input {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;

    // YXZ order: yaw (Y) first, then pitch (X). Prevents roll accumulation.
    this.camera.rotation.order = 'YXZ';
    this.yaw = 0;
    this.pitch = 0;

    this.overlay = document.getElementById('overlay');
    this.canvas = document.getElementById('canvas');

    // Modifier-held flag for Long Jump (Shift + WASD). Read off `e.shiftKey`
    // on every keydown/keyup so it stays in sync with the OS without us
    // tracking physical key state. Cleared on pointer-lock loss to avoid
    // stuck-modifier state if the user releases Shift while unfocused.
    // (Ctrl was tried first; rejected because Ctrl+W closes the browser tab
    // and pages can't preventDefault on OS-level shortcuts. Frog Focus used to
    // be a Shift-hold; it's now a press-F toggle owned by game.js — see
    // Game.toggleFocus.)
    this.shiftHeld = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onOverlayClick = this._onOverlayClick.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.overlay.addEventListener('click', this._onOverlayClick);
  }

  // Called by Game after the intro tween finishes — the camera was just re-parented
  // and its rotation was hard-reset, so our cached yaw/pitch must reset too.
  resetLook() {
    this.yaw = 0;
    this.pitch = 0;
    this.camera.rotation.set(0, 0, 0);
  }

  _onKeyDown(e) {
    // Track Shift BEFORE the repeat guard — held-key state must update on every
    // keydown so a re-pressed Shift after a pointer-lock loss recovers.
    this.shiftHeld = e.shiftKey;

    if (e.repeat) return;

    // If a text input has focus (e.g. the leaderboard name field on game-over),
    // typing letters/numbers must not also fire game shortcuts: "M" would mute,
    // "1"–"4" would feed into a stale skill picker, "F" would no-op but still
    // be confusing. Skip the entire handler — the input element handles its own
    // keys and stopPropagation prevents bubbling here in normal browser flow,
    // but we keep this guard as belt-and-braces in case any path leaks through.
    if (e.target && e.target.tagName === 'INPUT') return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    // Mute is a global toggle — works in any state (paused, intro, game-over)
    // so a player can silence the page before clicking to start. Handled BEFORE
    // the PLAYING gate below.
    if (e.code === 'KeyM') {
      const muted = this.game.audio.toggleMute();
      this.game.hud.renderMuted(muted);
      return;
    }

    // Skill picker captures 1–4 keys when active. Mute (KeyM) was handled
    // above this gate, so it still works while the picker is up.
    if (this.game.state === 'SKILLPICK') {
      switch (e.code) {
        case 'Digit1': this.game.onPickSkill('tongueFu'); break;
        case 'Digit2': this.game.onPickSkill('hipHopping'); break;
        case 'Digit3': this.game.onPickSkill('frogcentration'); break;
        case 'Digit4': this.game.onPickSkill('hocusCroakus'); break;
      }
      return;
    }

    if (this.game.state !== 'PLAYING') return;
    const frog = this.game.frog;
    const { forward, right } = this._facingAxes();
    // Long Jump multiplier: Shift + WASD with Hip Hopping T3+ unlocked.
    const skills = this.game.skills;
    const mult = (this.shiftHeld && skills.canLongJump()) ? skills.longJumpMult() : 1;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        frog.tryHop(forward.dRow, forward.dCell, mult);
        break;
      case 'KeyS':
      case 'ArrowDown':
        frog.tryHop(-forward.dRow, -forward.dCell, mult);
        break;
      case 'KeyA':
      case 'ArrowLeft':
        frog.tryHop(-right.dRow, -right.dCell, mult);
        break;
      case 'KeyD':
      case 'ArrowRight':
        frog.tryHop(right.dRow, right.dCell, mult);
        break;
      case 'Space':
        // preventDefault stops the page from scrolling on Space outside pointer-lock.
        e.preventDefault();
        this.game.tongue.flick();
        break;
      case 'KeyF':
        // Toggle Frog Focus. Game owns activation gating (skill unlocked +
        // meter > 0) so a press while locked or empty just no-ops.
        this.game.toggleFocus();
        break;
    }
  }

  _onKeyUp(e) {
    // Mirror the keydown sync. `e.shiftKey` reflects post-up state.
    this.shiftHeld = e.shiftKey;
  }

  // Snap the current yaw to one of four cardinal grid quadrants, and return the
  // (dRow, dCell) basis vectors for "forward" (where the camera is looking) and
  // "right" (90° CW in the XZ plane). Yaw=0 looks down -Z, which is +dRow.
  //   k=0 → face -Z: forward=(+1, 0), right=(0, +1)
  //   k=1 → face -X: forward=( 0,-1), right=(+1, 0)
  //   k=2 → face +Z: forward=(-1, 0), right=(0, -1)
  //   k=3 → face +X: forward=( 0,+1), right=(-1, 0)
  //
  // Z-axis zones are widened by FACING_Z_BIAS (~18%) so a partial head-turn
  // toward oncoming traffic doesn't flip W into a strafe — players naturally
  // crane sideways to read the lane and we want forward intent to win out.
  _facingAxes() {
    const FACING_Z_BIAS = 0.18;
    const zHalf = (Math.PI / 4) * (1 + FACING_Z_BIAS); // half-width of -Z and +Z zones

    // Normalize yaw to (-π, π].
    let y = this.yaw % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2;
    else if (y <= -Math.PI) y += Math.PI * 2;

    const absY = Math.abs(y);
    let k;
    if (absY <= zHalf) k = 0;
    else if (absY >= Math.PI - zHalf) k = 2;
    else if (y > 0) k = 1;
    else k = 3;

    const FORWARDS = [
      { dRow:  1, dCell:  0 },
      { dRow:  0, dCell: -1 },
      { dRow: -1, dCell:  0 },
      { dRow:  0, dCell:  1 },
    ];
    const forward = FORWARDS[k];
    const right = { dRow: -forward.dCell, dCell: forward.dRow };
    return { forward, right };
  }

  _onMouseDown(e) {
    // Only fire while pointer-locked AND playing — the overlay click that
    // acquires pointer lock fires its own click handler; we don't want it to
    // also pop a tongue flick on the first click of a new run.
    if (document.pointerLockElement !== this.canvas) return;
    if (this.game.state !== 'PLAYING') return;
    if (e.button !== 0) return; // left button only
    this.game.tongue.flick();
  }

  _onMouseMove(e) {
    if (document.pointerLockElement !== this.canvas) return;
    if (this.game.state !== 'PLAYING') return;
    const sensitivity = 0.0025;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    if (this.pitch > PITCH_CLAMP) this.pitch = PITCH_CLAMP;
    if (this.pitch < -PITCH_CLAMP) this.pitch = -PITCH_CLAMP;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _onOverlayClick() {
    // Don't grab pointer lock if a take-over panel is up — the player is
    // reading, not trying to start the game. They have to hit BACK to leave.
    // (Both panels and their BACK buttons stopPropagation, so this only
    // catches clicks on the dim background around the panel.)
    const mode = this.overlay.dataset.mode;
    if (mode === 'help' || mode === 'leaderboard') return;
    // User gesture: do BOTH pointer-lock request and audio context resume here.
    this.canvas.requestPointerLock();
    this.game.audio.resume();
  }

  _onPointerLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) {
      this.overlay.classList.add('hidden');
      this.game.onLockAcquired();
    } else {
      // Game owns overlay text — set via hud.showPause / hud.showGameOver.
      this.overlay.classList.remove('hidden');
      this._clearModifiers();
      this.game.onLockLost();
    }
  }

  // Clear modifier state when pointer lock is lost — the user may release the
  // key while unfocused, and we won't see the keyup. Called from
  // `_onPointerLockChange` on lock loss.
  _clearModifiers() {
    this.shiftHeld = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.overlay.removeEventListener('click', this._onOverlayClick);
  }
}
