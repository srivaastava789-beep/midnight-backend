export interface FocusBackgroundTheme {
  id: string;
  name: string;
  tag: string;
  photoUrl?: string;
  cssStyle: React.CSSProperties;
  overlayClass: string;
}

export const FOCUS_THEMES: FocusBackgroundTheme[] = [
  {
    id: 'mountains_night',
    name: 'Dark Mountains',
    tag: 'Mountain Night',
    photoUrl: '/src/assets/images/focus_mist_peaks_1795500660550.jpg',
    cssStyle: {
      background: 'radial-gradient(circle at 50% 20%, #262626 0%, #1A1A1A 45%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/55',
  },
  {
    id: 'starry_galaxy',
    name: 'Starry Galaxy',
    tag: 'Cosmic Sky',
    cssStyle: {
      background:
        'radial-gradient(ellipse at 70% 30%, rgba(64, 64, 64, 0.35) 0%, transparent 60%), radial-gradient(circle at 30% 70%, rgba(48, 48, 48, 0.4) 0%, transparent 50%), linear-gradient(180deg, #111111 0%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/40',
  },
  {
    id: 'cinematic_sunset',
    name: 'Cinematic Dusk',
    tag: 'Sunset Horizon',
    cssStyle: {
      background:
        'radial-gradient(ellipse at 50% 90%, rgba(48, 48, 48, 0.45) 0%, rgba(32, 32, 32, 0.25) 50%, transparent 75%), linear-gradient(180deg, #141414 0%, #1A1A1A 60%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/50',
  },
  {
    id: 'rain_window',
    name: 'Rainy Window',
    tag: 'Rain & Glass',
    photoUrl: '/src/assets/images/focus_rain_window_1795500661008.jpg',
    cssStyle: {
      background: 'radial-gradient(circle at 50% 40%, #262626 0%, #1A1A1A 60%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/60',
  },
  {
    id: 'minimal_landscape',
    name: 'Dark Landscapes',
    tag: 'Monochrome Ridges',
    cssStyle: {
      background:
        'linear-gradient(180deg, #1A1A1A 0%, #141414 50%, #0A0A0A 100%), radial-gradient(circle at 50% 100%, rgba(255, 255, 255, 0.05) 0%, transparent 70%)',
    },
    overlayClass: 'bg-black/40',
  },
  {
    id: 'forest_sunlight',
    name: 'Sunlit Forest',
    tag: 'Morning Canopy',
    cssStyle: {
      background:
        'radial-gradient(circle at 40% 15%, rgba(64, 64, 64, 0.3) 0%, transparent 60%), linear-gradient(180deg, #141414 0%, #111111 60%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/50',
  },
  {
    id: 'ocean_waves',
    name: 'Midnight Ocean',
    tag: 'Ocean Tide',
    photoUrl: '/src/assets/images/focus_moon_ocean_1795500660565.jpg',
    cssStyle: {
      background: 'radial-gradient(circle at 50% 30%, #262626 0%, #1A1A1A 60%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/55',
  },
  {
    id: 'city_lights',
    name: 'Night City',
    tag: 'Urban Nocturne',
    cssStyle: {
      background:
        'radial-gradient(ellipse at 50% 100%, rgba(64, 64, 64, 0.3) 0%, rgba(40, 40, 40, 0.2) 50%, transparent 80%), linear-gradient(180deg, #111111 0%, #1A1A1A 70%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/50',
  },
  {
    id: 'calm_clouds',
    name: 'Moonlit Clouds',
    tag: 'Calm Sky',
    cssStyle: {
      background:
        'radial-gradient(circle at 65% 25%, rgba(64, 64, 64, 0.25) 0%, transparent 55%), linear-gradient(180deg, #1A1A1A 0%, #111111 100%)',
    },
    overlayClass: 'bg-black/45',
  },
  {
    id: 'japanese_zen',
    name: 'Japanese Aesthetic',
    tag: 'Zen Garden',
    cssStyle: {
      background:
        'radial-gradient(circle at 50% 20%, rgba(64, 64, 64, 0.15) 0%, transparent 40%), linear-gradient(180deg, #1A1A1A 0%, #141414 50%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/45',
  },
  {
    id: 'deep_space',
    name: 'Deep Space',
    tag: 'Infinite Void',
    cssStyle: {
      background:
        'radial-gradient(circle at 20% 80%, rgba(64, 64, 64, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(48, 48, 48, 0.3) 0%, transparent 50%), #0A0A0A',
    },
    overlayClass: 'bg-black/35',
  },
  {
    id: 'moody_cinematic',
    name: 'Moody Noir',
    tag: 'Cinematic Shadows',
    cssStyle: {
      background:
        'linear-gradient(135deg, #1A1A1A 0%, #141414 40%, #0A0A0A 100%), radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 60%)',
    },
    overlayClass: 'bg-black/40',
  },
  {
    id: 'minimal_arch',
    name: 'Minimal Architecture',
    tag: 'Quiet Concrete',
    photoUrl: '/src/assets/images/focus_minimal_arch_1795500662211.jpg',
    cssStyle: {
      background: 'linear-gradient(180deg, #1A1A1A 0%, #141414 60%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/55',
  },
  {
    id: 'warm_desk',
    name: 'Warm Study Ambience',
    tag: 'Midnight Desk',
    cssStyle: {
      background:
        'radial-gradient(circle at 50% 85%, rgba(64, 64, 64, 0.3) 0%, rgba(48, 48, 48, 0.15) 45%, transparent 75%), linear-gradient(180deg, #141414 0%, #1A1A1A 60%, #0A0A0A 100%)',
    },
    overlayClass: 'bg-black/45',
  },
];

export function getFocusThemeById(themeId: string): FocusBackgroundTheme {
  const found = FOCUS_THEMES.find((t) => t.id === themeId);
  return found ?? FOCUS_THEMES[0];
}

export function getRandomFocusTheme(excludeId?: string): FocusBackgroundTheme {
  const candidates = excludeId
    ? FOCUS_THEMES.filter((t) => t.id !== excludeId)
    : FOCUS_THEMES;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return picked ?? FOCUS_THEMES[0];
}
