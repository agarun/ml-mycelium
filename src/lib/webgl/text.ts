import { Text as TroikaText } from 'troika-three-text';
import { Theme } from '$lib/ui';
import { type ITextOptions } from '$lib/ui/text';

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

const Text = {
  render(text: string, options: ITextOptions, baseColor?: string): TroikaText {
    const textMesh = new TroikaText();
    textMesh.text = text;
    textMesh.fontSize = options.fontSize - 1;
    textMesh.color = options.foregroundColor || baseColor || Theme.colors.foreground.gray;
    if (options.font in FONTS) {
      const font = options.font as keyof typeof FONTS;
      textMesh.font = FONTS[font][options.fontWeight];
    }
    textMesh.anchorX = 'center';
    textMesh.anchorY = 'middle';
    textMesh.rotation.z = Math.PI;
    textMesh.rotation.y = Math.PI;
    textMesh.sync();
    return textMesh;
  },
};

export default Text;
