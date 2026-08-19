import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

export default defineConfig({
  presets: [presetUno(), presetIcons()],
  transformers: [transformerDirectives()],
  shortcuts: {
    'ui-center': 'flex items-center justify-center',
    'ui-focus-ring': 'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-amber-300',
  },
  theme: {
    colors: {
      blood: '#b65350',
      parchment: '#eee2d6',
      relic: '#dfb875',
    },
  },
});
