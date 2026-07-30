/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    tint: '#9C7A1F',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    tint: '#D4AF37',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Déclinaisons sémantiques partagées entre écrans (chaque entrée : clair/sombre).
 * Règle de contraste : tout texte posé sur un fond `tint` utilise `OnTint` —
 * blanc en clair, noir en sombre. Le blanc sur or sombre (#D4AF37) descend
 * à ~1,9:1, illisible.
 */
export const GreenColor = { light: '#1E7C45', dark: '#63D489' } as const;
export const GreenBackground = { light: 'rgba(30,124,69,0.10)', dark: 'rgba(99,212,137,0.14)' } as const;
export const RedColor = { light: '#C13438', dark: '#FF6369' } as const;
export const RedBackground = { light: 'rgba(209,67,67,0.10)', dark: 'rgba(255,99,105,0.14)' } as const;
export const TintBackground = { light: 'rgba(156,122,31,0.10)', dark: 'rgba(212,175,55,0.14)' } as const;
export const TintBorder = { light: 'rgba(156,122,31,0.35)', dark: 'rgba(212,175,55,0.35)' } as const;
export const TintDivider = { light: 'rgba(156,122,31,0.20)', dark: 'rgba(212,175,55,0.20)' } as const;
export const OnTint = { light: '#ffffff', dark: '#000000' } as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
