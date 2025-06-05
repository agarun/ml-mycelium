// For licensing see accompanying LICENSE file.
// Copyright (C) 2025 Apple Inc. All Rights Reserved.

import { Text as TroikaText } from 'troika-three-text';
import { Theme } from '$lib/ui';
import { type ITextOptions } from '$lib/ui/text';
import { WebGLManager } from './webgl';

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

  constructor() {
    super();
    this.texts = new Map();
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

      if (options.font && options.font in FONTS) {
        const font = options.font as keyof typeof FONTS;
        textMesh.font = FONTS[font][options.fontWeight];
      }

      textMesh.anchorX = 'center';
      textMesh.anchorY = 'middle';
      textMesh.rotation.z = Math.PI;
      textMesh.rotation.y = Math.PI;
      textMesh.sync();

      this.texts.set(cacheKey, textMesh);
      this.registerDisposable(textMesh);
    }

    // Any external changes to the cloned mesh will *have* to be `.sync()`ed
    const clonedMesh = textMesh.clone();
    this.registerDisposable(clonedMesh);
    return clonedMesh;
  }

  dispose(): void {
    this.texts.clear();
    super.dispose();
  }
}
