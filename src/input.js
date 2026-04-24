import { PITCH_CLAMP } from './config.js';

// Owns keyboard, pointer lock, mouse-look, and the click-to-start overlay.
// Hard-commit model: the frog itself rejects keypresses while mid-hop.
export class Input {
  constructor(frog, camera, game) {
    this.frog = frog;
    this.camera = camera;
    this.game = game;

    // YXZ order: yaw (Y) first, then pitch (X). Prevents roll accumulation.
    this.camera.rotation.order = 'YXZ';
    this.yaw = 0;
    this.pitch = 0;

    this.overlay = document.getElementById('overlay');
    this.overlayLabel = this.overlay.querySelector('div');
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

  _onKeyDown(e) {
    if (e.repeat) return;
    // Only accept hop keys while pointer-locked (i.e. actively playing).
    if (document.pointerLockElement !== this.canvas) return;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.frog.tryHop(+1, 0);
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.frog.tryHop(-1, 0);
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.frog.tryHop(0, -1);
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.frog.tryHop(0, +1);
        break;
    }
  }

  _onMouseMove(e) {
    if (document.pointerLockElement !== this.canvas) return;
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
    if (this.game.audio) this.game.audio.resume();
  }

  _onPointerLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) {
      this.overlay.classList.add('hidden');
      this.game.paused = false;
    } else {
      this.overlayLabel.textContent = 'CLICK TO RESUME';
      this.overlay.classList.remove('hidden');
      this.game.paused = true;
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.overlay.removeEventListener('click', this._onOverlayClick);
  }
}
