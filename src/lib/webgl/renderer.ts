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
      powerPreference: 'high-performance',
    });
    this.updateSize();
  }

  updateSize(): void {
    const canvas = this.renderer.domElement;
    const dpr = window.devicePixelRatio;
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);

    if (canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
    }

    this.renderer.setPixelRatio(dpr);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
