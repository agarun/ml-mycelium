// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import { Text as TroikaText } from 'troika-three-text';
import { Theme } from '$lib/ui';
import { type ITextOptions } from '$lib/ui/text';
import { WebGLManager } from './webgl';

const FONTS = {
  // https://github.com/protectwise/troika/blob/e43e18f1d4754107136b73ee05c410d160469379/packages/troika-examples/text/TextExample.jsx#L21C12-L21C80
  Roboto: {
    200: 'https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff', // link is for `Regular`
    500: 'https://fonts.gstatic.com/s/roboto/v18/KFOlCnqEu92Fr1MmEU9fBBc-.woff',
    600: 'https://fonts.gstatic.com/s/roboto/v18/KFOlCnqEu92Fr1MmWUlfBBc-.woff',
  },
  'SF Mono, ui-monospace, monospace': {
    200: 'https://cdn.jsdelivr.net/npm/sf-mono-webfont@1.0.0/sf-mono-light.woff',
    500: 'https://cdn.jsdelivr.net/npm/sf-mono-webfont@1.0.0/sf-mono-medium.woff',
    600: 'https://cdn.jsdelivr.net/npm/sf-mono-webfont@1.0.0/sf-mono-bold.woff',
  },
} as const;

export class TextManager extends WebGLManager {
  private texts: Map<string, TroikaText>;
  private instances: Set<TroikaText>;
  private frustum: THREE.Frustum;
  private projectionMatrix: THREE.Matrix4;
  // When viewport.scale() < TEXT_VISIBILITY_SCALE_THRESHOLD, text will be hidden.
  private TEXT_VISIBILITY_SCALE_THRESHOLD = 0.2;

  constructor() {
    super();
    this.texts = new Map(); // look-up for all unique text objects
    this.instances = new Set(); // all instances of text objects, including clones
    this.frustum = new THREE.Frustum();
    this.projectionMatrix = new THREE.Matrix4();
  }

  private key(text: string, options: ITextOptions, baseColor?: string): string {
    const color = options.foregroundColor || baseColor || Theme.colors.foreground.gray;
    const font = options.font || 'Roboto';
    const fontWeight = options.fontWeight;
    return `${text}|${options.fontSize}|${color}|${font}|${fontWeight}`;
  }

  render(text: string, options: ITextOptions, baseColor?: string): TroikaText {
    const cacheKey = this.key(text, options, baseColor);

    let textMesh = this.texts.get(cacheKey);
    if (!textMesh) {
      textMesh = new TroikaText();
      textMesh.text = text;
      textMesh.fontSize = options.fontSize - 1;
      textMesh.color = options.foregroundColor || baseColor || Theme.colors.foreground.gray;
      textMesh.sdfGlyphSize = 64;

      if (options.font && options.font in FONTS) {
        const font = options.font as keyof typeof FONTS;
        textMesh.font = FONTS[font][options.fontWeight];
      }

      textMesh.anchorX = 'center';
      textMesh.anchorY = 'middle';
      textMesh.rotation.z = Math.PI;
      textMesh.rotation.y = Math.PI;
      textMesh.userData.isText = true;
      textMesh.sync();

      this.texts.set(cacheKey, textMesh);
      this.registerDisposable(textMesh);
    }

    // NOTE(agarun): Any external changes to the cloned mesh will *have* to be `.sync()`ed
    const clonedMesh = textMesh.clone();
    clonedMesh.userData.isText = true;
    this.instances.add(clonedMesh);
    this.registerDisposable(clonedMesh);
    return clonedMesh;
  }

  /**
   * Update the visibility of the text instances based on the camera and the current scale of the viewport.
   * We *do not* show text when zoomed out really far or when off-screen to improve performance.
   * @param camera - The camera to update the visibility of the text instances
   * @param currentScale - The current scale of the viewport
   */
  updateVisibility(camera: THREE.Camera, currentScale: number): void {
    camera.updateMatrixWorld(false);

    this.projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionMatrix);

    const isZoomedOut = currentScale < this.TEXT_VISIBILITY_SCALE_THRESHOLD;

    for (const instance of this.instances) {
      if (isZoomedOut) {
        instance.visible = false;
        continue;
      }

      let inFrustum = true;
      const mesh = instance as unknown as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geometry && geometry.boundingSphere) {
        const sphere = geometry.boundingSphere.clone();
        sphere.applyMatrix4(mesh.matrixWorld);
        inFrustum = this.frustum.intersectsSphere(sphere);
      } else {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        inFrustum = this.frustum.containsPoint(worldPos);
      }
      instance.visible = inFrustum;
    }
  }

  clearInstances(): void {
    this.instances.clear();
  }

  dispose(): void {
    this.instances.clear();
    this.texts.clear();
    super.dispose();
  }
}
