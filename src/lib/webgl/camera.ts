// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import { Viewport } from '$lib/viewport';

export class CameraManager {
  public camera: THREE.OrthographicCamera;
  private viewport: Viewport;

  constructor(viewport: Viewport) {
    this.viewport = viewport;
    const aspect = viewport.screenWidth() / viewport.screenHeight();
    const scale = viewport.scale();
    const frustumSize = viewport.world().height / scale;

    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      // Flip the camera to match the SVG coordinate system
      frustumSize / -2,
      frustumSize / 2,
      1,
      1000,
    );
    this.camera.position.z = 5;
    this.update();
  }

  update(): void {
    const { x, y } = this.viewport.center();
    const scale = 1;
    const aspect = this.viewport.screenWidth() / this.viewport.screenHeight();
    const frustumSize = this.viewport.world().height / scale;

    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = -frustumSize / 2;
    this.camera.bottom = frustumSize / 2;
    this.camera.position.set(x, y, 5);
    this.camera.updateProjectionMatrix();
  }
}
