import * as THREE from 'three';
import type { Viewport } from '$lib/viewport';

export class RendererManager {
  public renderer: THREE.WebGLRenderer;
  private viewport: Viewport;

  constructor(canvas: HTMLCanvasElement, viewport: Viewport) {
    this.viewport = viewport;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.updateSize();
  }

  updateSize(): void {
    const width = this.viewport.screenWidth();
    const height = this.viewport.screenHeight();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
