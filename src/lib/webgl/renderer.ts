// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import type { Viewport } from '$lib/viewport';
import { ThreePerf } from 'three-perf';

export class RendererManager {
  public renderer: THREE.WebGLRenderer;
  private perf: ThreePerf;
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
    this.perf = new ThreePerf({
      anchorX: 'left',
      anchorY: 'top',
      domElement: document.body, // or other canvas rendering wrapper
      renderer: this.renderer, // three js renderer instance you use for rendering
      memory: true,
      showGraph: true,
      scale: 3,
      backgroundOpacity: 1,
      visible: true,
    });
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
    this.perf.begin();
    this.renderer.render(scene, camera);
    this.perf.end();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
