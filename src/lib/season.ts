// Seasonal billing constants for Discovery Outpost.
// Tuition is charged ONLY during Aug, Sep, Oct, Nov of each season.
// Isomorphic — safe to import from client + server.

export const SEASON_START_MONTH = 8; // August (1-indexed)
export const SEASON_END_MONTH = 11; // November (1-indexed)
export const SEASON_TOTAL_MONTHS = SEASON_END_MONTH - SEASON_START_MONTH + 1; // 4

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type SeasonInfo = {
  seasonYear: number;
  monthsRemaining: number; // 0..4
  chargeMonths: number[]; // 1-indexed months that will still be charged this season
  nextChargeDate: Date; // when the first/next charge would post
  seasonEndDate: Date; // last day of November of the season year
};

// Compute season info relative to a given date (defaults to now).
// - If we're before Aug, the upcoming season this year applies (all 4 months).
// - If we're inside Aug–Nov, only the remaining months in this season apply.
// - If we're after Nov, the next season (next year, all 4 months) applies.
export function getSeasonInfo(now: Date = new Date()): SeasonInfo {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  let seasonYear = year;
  let firstChargeMonth = SEASON_START_MONTH;
  if (month > SEASON_END_MONTH) {
    seasonYear = year + 1;
    firstChargeMonth = SEASON_START_MONTH;
  } else if (month >= SEASON_START_MONTH) {
    firstChargeMonth = month;
  }
  const chargeMonths: number[] = [];
  for (let m = firstChargeMonth; m <= SEASON_END_MONTH; m++) chargeMonths.push(m);
  const monthsRemaining = chargeMonths.length;
  const nextChargeDate =
    seasonYear === year && month >= SEASON_START_MONTH
      ? new Date() // charged today
      : new Date(seasonYear, firstChargeMonth - 1, 1);
  const seasonEndDate = new Date(seasonYear, SEASON_END_MONTH, 0); // last day of Nov
  return { seasonYear, monthsRemaining, chargeMonths, nextChargeDate, seasonEndDate };
}

// Cents for a semester item after proration (full price * remaining / total).
export function proratedSemesterCents(fullSemesterCents: number, monthsRemaining: number): number {
  if (monthsRemaining <= 0) return 0;
  if (monthsRemaining >= SEASON_TOTAL_MONTHS) return fullSemesterCents;
  // Round to the nearest cent.
  return Math.round(fullSemesterCents * (monthsRemaining / SEASON_TOTAL_MONTHS));
}

export function formatMonth(month1: number, year: number): string {
  return `${MONTH_NAMES[month1 - 1]} ${year}`;
}

// Build a human-readable schedule preview for the auto-pay plan.
// Example: ["Aug 1, 2026", "Sep 1, 2026", "Oct 1, 2026", "Nov 1, 2026"]
export function autoPayScheduleLabels(now: Date = new Date()): string[] {
  const info = getSeasonInfo(now);
  return info.chargeMonths.map((m, idx) => {
    // First charge happens immediately at checkout (today); subsequent
    // charges post on the 1st of each remaining month.
    const d =
      idx === 0 && now.getMonth() + 1 === m
        ? now
        : new Date(info.seasonYear, m - 1, 1);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  });
}