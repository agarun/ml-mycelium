import * as THREE from 'three';
import { Text as TroikaText } from 'troika-three-text';

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture | TroikaText;

export abstract class WebGLManager {
  protected disposables: Set<Disposable> = new Set();

  protected registerDisposable(...objects: Array<Disposable>): void {
    objects.forEach((object) => this.disposables.add(object));
  }

  dispose(): void {
    for (const object of this.disposables) {
      object.dispose();
    }
    this.disposables.clear();
  }
}
