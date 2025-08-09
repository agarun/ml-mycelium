// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

declare module 'troika-three-text' {
  import type { Color, Material, MeshBasicMaterial, MeshStandardMaterial } from 'three';
  import { Object3D } from 'three';

  export function preloadFont(
    font: { font: string; characters: string },
    callback: () => void,
  ): void;

  export class Text extends Object3D {
    constructor();
    text: string;
    fontSize: number;
    font: string;
    color: string | number | Material;
    material: MeshBasicMaterial | MeshStandardMaterial;
    maxWidth: number;
    lineHeight: number;
    letterSpacing: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    anchorX: 'left' | 'center' | 'right' | number;
    anchorY: 'top' | 'middle' | 'bottom' | 'baseline' | number;
    clipRect: [number, number, number, number];
    depthOffset: number;
    direction: 'auto' | 'ltr' | 'rtl';
    overflowWrap: 'normal' | 'break-word';
    whiteSpace: 'normal' | 'nowrap';
    outlineWidth: number;
    outlineColor: string | number | Color;
    sdfGlyphSize: number;
    sync: () => void;
    dispose(): void;
  }
}
