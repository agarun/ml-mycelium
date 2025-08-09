// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';

export class RectManager {
  private rects: Map<string, THREE.BufferGeometry> = new Map();
  private static readonly MAX_CACHE_SIZE = 2000;

  private key(
    width: number,
    height: number,
    radius: number,
    borderThickness: number | null = null,
  ): string {
    // Coalesce sizes to increase geometry reuse
    const w = Math.round(width);
    const h = Math.round(height);
    return `${w}_${h}_${radius}_${borderThickness ?? 'null'}`;
  }

  private rect(
    width: number,
    height: number,
    radius: number,
    borderThickness: number | null = null,
  ): THREE.Shape {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;

    shape.moveTo(x, y + radius);
    shape.lineTo(x, y + height - radius);
    shape.quadraticCurveTo(x, y + height, x + radius, y + height);
    shape.lineTo(x + width - radius, y + height);
    shape.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
    shape.lineTo(x + width, y + radius);
    shape.quadraticCurveTo(x + width, y, x + width - radius, y);
    shape.lineTo(x + radius, y);
    shape.quadraticCurveTo(x, y, x, y + radius);

    if (borderThickness !== null) {
      const hole = new THREE.Path();
      const innerWidth = width - 2 * borderThickness;
      const innerHeight = height - 2 * borderThickness;
      const innerRadius = Math.max(0, radius - borderThickness);
      const hx = -innerWidth / 2;
      const hy = -innerHeight / 2;

      hole.moveTo(hx, hy + innerRadius);
      hole.lineTo(hx, hy + innerHeight - innerRadius);
      hole.quadraticCurveTo(hx, hy + innerHeight, hx + innerRadius, hy + innerHeight);
      hole.lineTo(hx + innerWidth - innerRadius, hy + innerHeight);
      hole.quadraticCurveTo(
        hx + innerWidth,
        hy + innerHeight,
        hx + innerWidth,
        hy + innerHeight - innerRadius,
      );
      hole.lineTo(hx + innerWidth, hy + innerRadius);
      hole.quadraticCurveTo(hx + innerWidth, hy, hx + innerWidth - innerRadius, hy);
      hole.lineTo(hx + innerRadius, hy);
      hole.quadraticCurveTo(hx, hy, hx, hy + innerRadius);

      shape.holes.push(hole);
    }

    return shape;
  }

  render(
    width: number,
    height: number,
    radius: number,
    borderThickness: number | null = null,
  ): THREE.BufferGeometry {
    const key = this.key(width, height, radius, borderThickness);
    if (!this.rects.has(key)) {
      const shape = this.rect(width, height, radius, borderThickness);
      const curveSegments = 4; // reduce complexity of rounded corners
      const geometry = new THREE.ShapeGeometry(shape, curveSegments);
      this.rects.set(key, geometry);
      // simple FIFO eviction to prevent unbounded growth
      if (this.rects.size > RectManager.MAX_CACHE_SIZE) {
        const firstKey = this.rects.keys().next().value as string | undefined;
        if (firstKey) {
          const geom = this.rects.get(firstKey);
          if (geom) geom.dispose();
          this.rects.delete(firstKey);
        }
      }
    }

    const rect = this.rects.get(key);
    if (!rect) throw new Error(`could not retrieve geometry for key: ${key}`);
    return rect;
  }

  dispose(): void {
    for (const geometry of this.rects.values()) {
      geometry.dispose();
    }
    this.rects.clear();
  }
}
