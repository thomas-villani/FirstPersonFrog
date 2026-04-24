import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Frog } from './frog.js';
import { Input } from './input.js';
import { Spawner } from './spawner.js';
import { Hud } from './hud.js';
import { AudioManager } from './audio.js';
import { checkCollision } from './collision.js';
import { FOV, NEAR_PLANE, FAR_PLANE, LANES, GOAL_ROW } from './config.js';

export class Game {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = buildWorld();

    this.camera = new THREE.PerspectiveCamera(
      FOV,
      window.innerWidth / window.innerHeight,
      NEAR_PLANE,
      FAR_PLANE
    );

    this.frog = new Frog(this.scene, this.camera);
    this.paused = true;
    this.audio = new AudioManager();
    this.input = new Input(this.frog, this.camera, this);
    this.spawner = new Spawner(this.scene, LANES, this.audio);
    this.hud = new Hud();

    this.frog.onLand = () => this.audio.playHop();

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (this.paused) return;
    this.frog.update(dt);
    this.spawner.update(dt);
    const hit = checkCollision(this.frog, this.spawner.vehicles);
    if (hit) {
      this.frog.die();
      this.audio.playSquish();
      this.hud.onDeath();
    } else if (this.frog.row === GOAL_ROW && this.frog.state === 'IDLE') {
      this.hud.onWin();
      this.frog.resetToStart();
    }
    this.audio.updateEngines(this.frog, this.spawner.vehicles);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
