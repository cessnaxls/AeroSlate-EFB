/**
 * AeroSlate generic operating-empty/basic-operating-weight reference.
 *
 * Values are pounds and represent the generic SimBrief-style airframe for the
 * ICAO designator, not a specific tail. Individual airline interiors and user
 * airframes vary, so callers may supply a per-type or per-registration override.
 */
export const AIRCRAFT_BOW_LB: Record<string, number> = {
  // Airbus narrowbody
  A318: 86400, A319: 89500, A19N: 91000, A320: 96500, A20N: 98000,
  A321: 108500, A21N: 111000, A30B: 198400, A30F: 197000,
  A306: 199500, A310: 176000,
  // Airbus widebody
  A332: 265000, A333: 274000, A337: 278000, A338: 273000, A339: 291000,
  A342: 284000, A343: 286600, A345: 378500, A346: 389000,
  A359: 313000, A35K: 342000, A388: 610000,
  // Airbus/Canadair A220
  A220: 76000, A221: 76000, A223: 82000, BCS1: 76000, BCS3: 82000,
  // Boeing classic/narrowbody
  B701: 121000, B703: 134000, B712: 68000, B720: 103000,
  B721: 89200, B722: 102900, B731: 61500, B732: 62000, B733: 72000,
  B734: 74000, B735: 70000, B736: 80300, B737: 84000, B738: 91500,
  B739: 98500, B37M: 98500, B38M: 99500, B39M: 108000, B3XM: 115000,
  BBJ1: 95000, BBJ2: 101000, BBJ3: 108000,
  // Boeing widebody
  B741: 358000, B742: 371000, B743: 383000, B744: 394000, B74S: 337000,
  B748: 485300, B48F: 440000, B752: 127500, B753: 141000,
  B762: 176000, B763: 198000, B764: 229000,
  B772: 304000, B773: 353000, B77L: 320000, B77W: 370000, B778: 390000, B779: 410000,
  B788: 262000, B789: 284000, B78X: 299000,
  // McDonnell Douglas / Douglas
  DC3: 16500, DC6: 56000, DC8: 130000, DC85: 145000, DC86: 150000,
  DC87: 155000, DC91: 79000, DC92: 80000, DC93: 82000, DC94: 83000, DC95: 84000,
  DC10: 267000, MD11: 283000, MD1F: 250000,
  MD80: 78000, MD81: 78000, MD82: 79000, MD83: 80000, MD87: 74000, MD88: 79000,
  MD90: 87000, B717: 68000,
  // Embraer E-jets / ERJ
  E135: 25000, E13L: 25000, E140: 26000, E145: 27000, E45X: 27000,
  E170: 46500, E175: 48500, E75S: 48500, E75L: 49500,
  E190: 62000, E19L: 62000, E195: 65000, E295: 76000, E290: 72000,
  // CRJ / Canadair
  CRJ1: 30000, CRJ2: 30500, CRJ5: 34500, CRJ7: 43000, CRJ9: 47000, CRJX: 50000,
  CL60: 23500, GL5T: 50000, GL6T: 52000, GLEX: 49000,
  // Bombardier Dash 8
  DH8A: 23000, DH8B: 24000, DH8C: 26000, DH8D: 38000,
  // ATR
  AT43: 24500, AT45: 25000, AT46: 25500, AT72: 28500, AT73: 28500, AT75: 29500, AT76: 30000,
  // BAe / Avro / Fokker
  B461: 52000, B462: 56000, B463: 61000, RJ70: 52000, RJ85: 56000, RJ1H: 61000,
  F27: 25000, F28: 42000, F50: 28000, F70: 55000, F100: 56000,
  // Saab
  SF34: 18000, SB20: 30000,
  // Tupolev / Ilyushin / Antonov / Yakovlev
  AN12: 62000, AN24: 30000, AN26: 33000, AN72: 42000, AN74: 43000,
  AN124: 385000, A124: 385000, AN225: 628000,
  IL18: 78000, IL62: 158000, IL76: 202000, IL86: 258000, IL96: 270000,
  T134: 64000, T154: 121000, T204: 128000, T214: 130000,
  YK40: 37000, YK42: 63000, SU95: 61000,
  // Concorde
  CONC: 173500, CONI: 173500,
  // Turboprop commuters
  C208: 5000, C212: 8700, C27J: 38000, C130: 76000, L410: 8500,
  BE20: 8400, BE30: 9800, BE35: 2200, BE36: 2400, BE40: 10500,
  B190: 10000, D328: 20000, J328: 24000, E120: 15500, JS31: 14000, JS32: 14500, JS41: 23000,
  // Business jets
  C25A: 6800, C25B: 7000, C25C: 7300, C25M: 7200, C510: 6200, C525: 6900,
  C550: 8500, C560: 10200, C56X: 12200, C650: 12500, C680: 19500, C68A: 21000,
  C700: 30000, C750: 27000,
  FA10: 19000, FA20: 21000, FA50: 20500, FA7X: 35000, FA8X: 36000,
  F2TH: 24000, F900: 24000, F9EX: 26000,
  G150: 15000, G200: 19000, G280: 22000, GLF4: 36000, GLF5: 48000,
  GLF6: 52000, G650: 54500, G700: 57000,
  LJ24: 6800, LJ25: 7200, LJ31: 10400, LJ35: 11500, LJ40: 12500, LJ45: 12800,
  LJ55: 14000, LJ60: 14500, LJ75: 13500,
  H25B: 16000, H25C: 16500, PRM1: 8700, E50P: 6900, E55P: 10800,
  // General aviation piston / light turboprop
  C150: 1100, C152: 1100, C172: 1650, C182: 1900, C206: 2200, C210: 2300,
  PA24: 1800, PA28: 1550, PA32: 2100, PA34: 3000, PA44: 2500, PA46: 3100,
  SR20: 2100, SR22: 2350, SR2T: 2450, DA40: 1750, DA42: 3100, DA62: 3500,
  M20P: 1800, M20T: 2200, TBM7: 4200, TBM8: 4300, TBM9: 4400, PC12: 6500,
  PC24: 11000, P180: 7200, B350: 9500, B36T: 9000,
  // Helicopters (supported/fallback planning types)
  B06: 1900, B407: 2700, EC35: 3200, EC45: 4200, S76: 7000, AW139: 9000,
  // Military transports / tankers commonly offered
  C17: 282000, C5M: 380000, KC10: 240000, K35R: 98000, A400: 168000,
  P8: 138000, E3TF: 170000, E6: 170000, B52: 185000
};

const FAMILY_FALLBACKS: Array<[RegExp, number]> = [
  [/^A32/, 96500], [/^A31/, 89500], [/^A21/, 110000], [/^A33/, 280000], [/^A34/, 320000], [/^A35/, 325000],
  [/^B73/, 90000], [/^B75/, 132000], [/^B76/, 200000], [/^B77/, 350000], [/^B78/, 285000], [/^B74/, 400000],
  [/^E17/, 48000], [/^E19|^E29/, 65000], [/^CRJ/, 42000], [/^AT7/, 29500], [/^DH8/, 32000],
  [/^C17/, 1650], [/^C18|^C20|^C21/, 2200], [/^PA/, 2400], [/^LJ/, 13000], [/^GLF|^G[567]/, 48000]
];

export function getAircraftBowLb(type: string, overrideLb?: number): number | undefined {
  if (Number.isFinite(overrideLb) && Number(overrideLb) > 0) return Math.round(Number(overrideLb));
  const key = String(type || '').trim().toUpperCase();
  if (!key) return undefined;
  if (AIRCRAFT_BOW_LB[key]) return AIRCRAFT_BOW_LB[key];
  const fallback = FAMILY_FALLBACKS.find(([pattern]) => pattern.test(key));
  return fallback?.[1];
}

export function calculateManualZfwLb(args: {
  type: string;
  bowOverrideLb?: number;
  pax?: number;
  paxWeightLb?: number;
  bags?: number;
  bagWeightLb?: number;
  freightLb?: number;
}): { bowLb: number; payloadLb: number; zfwLb: number } | undefined {
  const bowLb = getAircraftBowLb(args.type, args.bowOverrideLb);
  if (!bowLb) return undefined;
  const paxWeightLb = args.paxWeightLb ?? Math.max(0, Math.round(Number(args.pax || 0))) * 190;
  const bagWeightLb = args.bagWeightLb ?? Math.max(0, Math.round(Number(args.bags || 0))) * 40;
  const freightLb = Math.max(0, Math.round(Number(args.freightLb || 0)));
  const payloadLb = Math.max(0, Math.round(paxWeightLb + bagWeightLb + freightLb));
  return { bowLb, payloadLb, zfwLb: bowLb + payloadLb };
}
