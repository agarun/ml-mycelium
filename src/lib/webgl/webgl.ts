// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';
import { Text as TroikaText } from 'troika-three-text';

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture | TroikaText;

export abstract class WebGLManager {
  protected disposables: Set<Disposable> = new Set();

  protected registerDisposable(...objects: Array<Disposable>): void {
    objects.forEach((object) => this.disposables.add(object));
  }

  protected unregisterDisposable(object: Disposable): void {
    this.disposables.delete(object);
  }

  dispose(): void {
    for (const object of this.disposables) {
      try {
        object.dispose();
      } catch (error) {
        console.error('🚨 failed to dispose object', error);
      }
    }
    this.disposables.clear();
  }
}

// Text visibility threshold relative to world zoom scale.
// When viewport.scale() < TEXT_VISIBILITY_SCALE_THRESHOLD, text will be hidden.
export const TEXT_VISIBILITY_SCALE_THRESHOLD = 0.2;
