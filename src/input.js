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

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onOverlayClick = this._onOverlayClick.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('mousemove', this._onMouseMove);
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
    if (e.repeat) return;
    if (this.game.state !== 'PLAYING') return;
    const frog = this.game.frog;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        frog.tryHop(+1, 0);
        break;
      case 'KeyS':
      case 'ArrowDown':
        frog.tryHop(-1, 0);
        break;
      case 'KeyA':
      case 'ArrowLeft':
        frog.tryHop(0, -1);
        break;
      case 'KeyD':
      case 'ArrowRight':
        frog.tryHop(0, +1);
        break;
    }
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
      this.game.onLockLost();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.overlay.removeEventListener('click', this._onOverlayClick);
  }
}
