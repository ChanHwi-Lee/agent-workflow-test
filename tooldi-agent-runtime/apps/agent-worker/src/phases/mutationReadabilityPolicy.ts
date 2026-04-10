export interface ReadabilityPalette {
  primaryTextColor: string;
  secondaryTextColor: string;
  accentTextColor: string;
  inverseTextColor: string;
  ctaSurfaceColor: string;
  ctaTextColor: string;
}

export function resolveReadabilityPalette(
  backgroundColorHex: string,
): ReadabilityPalette {
  const normalized = normalizeHexColor(backgroundColorHex);
  const luminance = calculateRelativeLuminance(normalized);
  const lightBackground = luminance >= 0.58;

  if (lightBackground) {
    return {
      primaryTextColor: "#1a1a1a",
      secondaryTextColor: "#3f3f46",
      accentTextColor: "#ff6a00",
      inverseTextColor: "#ffffff",
      ctaSurfaceColor: "#111111",
      ctaTextColor: "#ffffff",
    };
  }

  return {
    primaryTextColor: "#f8fafc",
    secondaryTextColor: "#e5e7eb",
    accentTextColor: "#ffd166",
    inverseTextColor: "#111111",
    ctaSurfaceColor: "#ffffff",
    ctaTextColor: "#111111",
  };
}

export function normalizeHexColor(value: string): string {
  return value.startsWith("#") ? value : `#${value}`;
}

export function calculateRelativeLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex).replace("#", "");
  const channels = normalized.length === 3
    ? normalized.split("").map((channel) => channel + channel)
    : [normalized.slice(0, 2), normalized.slice(2, 4), normalized.slice(4, 6)];

  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return (
    0.2126 * (red ?? 0) +
    0.7152 * (green ?? 0) +
    0.0722 * (blue ?? 0)
  );
}
