declare module 'troika-three-text' {
  import { Object3D } from 'three';

  export class Text extends Object3D {
    text: string;
    fontSize: number;
    color: string;
    font: string;
    anchorX: 'left' | 'center' | 'right';
    anchorY: 'top' | 'middle' | 'bottom';
    sync(): void;
    dispose(): void;
  }
}
