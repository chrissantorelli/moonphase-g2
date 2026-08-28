/**
 * moon.ts — dependency-free lunar phase math.
 *
 * Low-precision ecliptic positions of the Sun and Moon (Meeus / Astronomical
 * Almanac series, truncated). Illuminated fraction is good to well under 1%,
 * phase timing to a few minutes — plenty for a glasses widget.
 */

const RAD = Math.PI / 180;
export const SYNODIC_MONTH = 29.530588853; // days

const J2000_UNIX_MS = 946728000000; // 2000-01-01T12:00:00Z

/** Days since J2000.0 (fractional). */
function daysSinceJ2000(date: Date): number {
  return (date.getTime() - J2000_UNIX_MS) / 86400000;
}

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Geometric ecliptic longitude of the Sun, degrees. */
function sunEclipticLongitude(d: number): number {
  const M = norm360(357.529 + 0.98560028 * d); // mean anomaly
  const L = norm360(280.459 + 0.98564736 * d); // mean longitude
  return norm360(L + 1.915 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD));
}

/** Ecliptic longitude (deg), latitude (deg) and distance (km) of the Moon. */
function moonPosition(d: number) {
  const Lp = norm360(218.316 + 13.176396 * d); // mean longitude
  const Mp = norm360(134.963 + 13.064993 * d); // mean anomaly
  const F = norm360(93.272 + 13.22935 * d); // mean distance argument

  const lon = norm360(Lp + 6.289 * Math.sin(Mp * RAD));
  const lat = 5.128 * Math.sin(F * RAD);
  const dist = 385001 - 20905 * Math.cos(Mp * RAD);
  return { lon, lat, dist };
}

export type PhaseName =
  | 'New Moon'
  | 'Waxing Crescent'
  | 'First Quarter'
  | 'Waxing Gibbous'
  | 'Full Moon'
  | 'Waning Gibbous'
  | 'Last Quarter'
  | 'Waning Crescent';

export interface MoonPhase {
  /** Illuminated fraction of the disc, 0..1. */
  fraction: number;
  /** Sun→Moon elongation in ecliptic longitude, 0..360°. 0 ≈ new, 180 ≈ full. */
  elongation: number;
  /** True while the Moon is filling out (new → full). */
  waxing: boolean;
  phaseName: PhaseName;
  /** Days since the last new moon. */
  ageDays: number;
  /** Days until the next full moon (0..synodic month). */
  daysToFull: number;
  /** Days until the next new moon. */
  daysToNew: number;
}

const PHASE_NAMES: PhaseName[] = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
];

export function getMoonPhase(date: Date = new Date()): MoonPhase {
  const d = daysSinceJ2000(date);
  const sunLon = sunEclipticLongitude(d);
  const moon = moonPosition(d);

  // Angular separation Sun–Moon on the celestial sphere.
  const psi = Math.acos(
    Math.cos(moon.lat * RAD) * Math.cos((moon.lon - sunLon) * RAD),
  );
  // Phase angle at the Moon, corrected for finite distances.
  const SUN_DIST = 149598000; // km
  const inc = Math.atan2(
    SUN_DIST * Math.sin(psi),
    moon.dist - SUN_DIST * Math.cos(psi),
  );
  const fraction = (1 + Math.cos(inc)) / 2;

  const elongation = norm360(moon.lon - sunLon);
  const waxing = elongation < 180;

  // 8 buckets of 45°, centered so that "New Moon" spans 337.5°–22.5°.
  const bucket = Math.floor(norm360(elongation + 22.5) / 45) % 8;
  const phaseName = PHASE_NAMES[bucket];

  const ageDays = (elongation / 360) * SYNODIC_MONTH;
  const daysToFull = (norm360(180 - elongation) / 360) * SYNODIC_MONTH;
  const daysToNew = (norm360(360 - elongation) / 360) * SYNODIC_MONTH;

  return { fraction, elongation, waxing, phaseName, ageDays, daysToFull, daysToNew };
}
