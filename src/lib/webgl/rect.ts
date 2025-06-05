// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import * as THREE from 'three';

const Rect = {
  render(
    width: number,
    height: number,
    radius: number,
    borderThickness: number | null = null,
  ): THREE.BufferGeometry {
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

    return new THREE.ShapeGeometry(shape);
  },
};

export default Rect;
