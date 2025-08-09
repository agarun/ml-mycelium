// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import { Text as TroikaText } from 'troika-three-text';
import { Theme } from '$lib/ui';
import { type ITextOptions } from '$lib/ui/text';
import { WebGLManager } from './webgl';
import { TEXT_VISIBILITY_SCALE_THRESHOLD } from './webgl';

const FONTS = {
  // https://github.com/protectwise/troika/blob/e43e18f1d4754107136b73ee05c410d160469379/packages/troika-examples/text/TextExample.jsx#L21C12-L21C80
  Roboto: {
    200: 'https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff',
    500: 'https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff',
    600: 'https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff',
  },
  'SF Mono, ui-monospace, monospace': {
    200: 'https://cdn.jsdelivr.net/npm/sf-mono-webfont@1.0.0/sf-mono-light.woff',
    500: 'https://cdn.jsdelivr.net/npm/sf-mono-webfont@1.0.0/sf-mono-medium.woff',
    600: 'https://cdn.jsdelivr.net/npm/sf-mono-webfont@1.0.0/sf-mono-bold.woff',
  },
} as const;

export class TextManager extends WebGLManager {
  private texts: Map<string, TroikaText>;
  private activeInstances: Set<TroikaText>;
  private frustum: THREE.Frustum;
  private projScreenMatrix: THREE.Matrix4;

  constructor() {
    super();
    this.texts = new Map();
    this.activeInstances = new Set();
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
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
      // mark for visibility gating
      textMesh.userData.isText = true;
      textMesh.sync();

      this.texts.set(cacheKey, textMesh);
      this.registerDisposable(textMesh);
    }

    // Any external changes to the cloned mesh will *have* to be `.sync()`ed
    const clonedMesh = textMesh.clone();
    clonedMesh.userData.isText = true;
    // track instance for visibility management
    this.activeInstances.add(clonedMesh);
    this.registerDisposable(clonedMesh);
    return clonedMesh;
  }

  updateVisibility(camera: THREE.Camera, currentScale: number): void {
    // Ensure camera matrices are up to date
    camera.updateMatrixWorld(false);

    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const isZoomedOut = currentScale < TEXT_VISIBILITY_SCALE_THRESHOLD;

    for (const obj of this.activeInstances) {
      if (isZoomedOut) {
        obj.visible = false;
        continue;
      }

      let inFrustum = true;
      const mesh = obj as unknown as THREE.Mesh;
      const geom = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geom && geom.boundingSphere) {
        const sphere = geom.boundingSphere.clone();
        sphere.applyMatrix4(mesh.matrixWorld);
        inFrustum = this.frustum.intersectsSphere(sphere);
      } else {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        inFrustum = this.frustum.containsPoint(worldPos);
      }
      obj.visible = inFrustum;
    }
  }

  clearInstances(): void {
    this.activeInstances.clear();
  }

  dispose(): void {
    this.activeInstances.clear();
    this.texts.clear();
    super.dispose();
  }
}
