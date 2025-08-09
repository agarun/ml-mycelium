// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { Viewport } from '$lib/viewport';

export class RendererManager {
  public renderer: THREE.WebGLRenderer;
  private viewport: Viewport;

  constructor(canvas: HTMLCanvasElement, viewport: Viewport) {
    this.viewport = viewport;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true, // can be disabled if low fps
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.sortObjects = false;
    this.updateSize();
  }

  updateSize(): void {
    const canvas = this.renderer.domElement;
    const dpr = Math.min(1.5, window.devicePixelRatio);
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
