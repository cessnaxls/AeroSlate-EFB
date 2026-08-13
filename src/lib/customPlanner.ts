import type { Airport } from './dispatchlink';
import type { AnyRecord } from './ofp';

export interface FuelProfile {
  id: string;
  name: string;
  aircraft: string;
  registration: string;
  units: 'LBS' | 'KGS';
  cruiseTasKt: number;
  taxiFuel: number;
  climbFuel: number;
  climbMinutes: number;
  cruiseFlow: number;
  descentFuel: number;
  descentMinutes: number;
  holdingFlow: number;
  reserveMinutes: number;
  contingencyPct: number;
  usableFuel: number;
  learned?: {
    samples: number;
    flights: number;
    hours: number;
    climbFlow?: number;
    cruiseFlow?: number;
    descentFlow?: number;
    updatedAt?: string;
  };
}

export interface PlannerWeatherStation {
  icao: string;
  metar: string;
  taf: string;
  observedAt?: string;
  source?: string;
}

export interface WindLevel { altitudeFt: number; direction: number | null; speedKt: number | null; tempC: number | null; }
export interface WindStation { station: string; valid?: string; levels: WindLevel[]; source?: string; }
export interface PlannerWeatherPayload {
  fetchedAt: string;
  source: string;
  stations: Record<string, PlannerWeatherStation>;
  winds: Record<string, WindStation>;
  warnings?: string[];
}

export interface PlanInput {
  departure: Airport;
  destination: Airport;
  alternate?: Airport | null;
  cruiseAltitudeFt: number;
  alternateAltitudeFt: number;
  route: string;
  flightNumber: string;
  schedOut: string;
  flightDate: string;
}

const R = 3440.065;
const rad = (value: number) => value * Math.PI / 180;
const deg = (value: number) => value * 180 / Math.PI;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function gcDistanceNm(a: Airport, b: Airport) {
  const dLat = rad(b.latitude - a.latitude); const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude); const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function initialCourse(a: Airport, b: Airport) {
  const lat1 = rad(a.latitude); const lat2 = rad(b.latitude); const dLon = rad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
function nearestWind(station: WindStation | undefined, altitudeFt: number): WindLevel | null {
  if (!station?.levels?.length) return null;
  return [...station.levels].sort((a, b) => Math.abs(a.altitudeFt - altitudeFt) - Math.abs(b.altitudeFt - altitudeFt))[0] || null;
}
function averageWind(a: WindLevel | null, b: WindLevel | null) {
  const rows = [a, b].filter((item): item is WindLevel => Boolean(item && item.speedKt !== null && item.direction !== null));
  if (!rows.length) return { direction: null as number | null, speedKt: 0, tempC: null as number | null };
  let x = 0, y = 0, speed = 0, temp = 0, temps = 0;
  rows.forEach(row => { x += Math.cos(rad(row.direction!)); y += Math.sin(rad(row.direction!)); speed += row.speedKt || 0; if (row.tempC !== null) { temp += row.tempC; temps += 1; } });
  return { direction: (deg(Math.atan2(y, x)) + 360) % 360, speedKt: speed / rows.length, tempC: temps ? temp / temps : null };
}
function groundSpeed(tas: number, course: number, wind: { direction: number | null; speedKt: number }) {
  if (wind.direction === null || !wind.speedKt) return tas;
  const headwind = wind.speedKt * Math.cos(rad(wind.direction - course));
  return clamp(tas - headwind, Math.max(60, tas * .45), tas * 1.55);
}
function hhmmFromMinutes(minutes: number) { const m = ((Math.round(minutes) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`; }
function parseClock(value: string) { const m = String(value).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : new Date().getUTCHours() * 60 + new Date().getUTCMinutes(); }
function durationString(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(Math.round(minutes % 60)).padStart(2,'0')}`; }
function point(a: Airport, b: Airport, fraction: number) { return { latitude: a.latitude + (b.latitude - a.latitude) * fraction, longitude: a.longitude + (b.longitude - a.longitude) * fraction }; }
function windText(wind: { direction: number | null; speedKt: number }) { return wind.direction === null ? '—' : `${String(Math.round(wind.direction)).padStart(3,'0')}/${String(Math.round(wind.speedKt)).padStart(2,'0')}`; }

export function buildCustomOFP(input: PlanInput, profile: FuelProfile, weather: PlannerWeatherPayload): AnyRecord {
  const distance = gcDistanceNm(input.departure, input.destination);
  const course = initialCourse(input.departure, input.destination);
  const depWind = nearestWind(weather.winds[input.departure.iata || input.departure.icao.slice(-3)], input.cruiseAltitudeFt);
  const destWind = nearestWind(weather.winds[input.destination.iata || input.destination.icao.slice(-3)], input.cruiseAltitudeFt);
  const wind = averageWind(depWind, destWind);
  const gs = groundSpeed(profile.cruiseTasKt, course, wind);
  const climbDistance = Math.min(distance * .32, profile.cruiseTasKt * profile.climbMinutes / 60 * .72);
  const descentDistance = Math.min(distance * .28, profile.cruiseTasKt * profile.descentMinutes / 60 * .82);
  const cruiseDistance = Math.max(0, distance - climbDistance - descentDistance);
  const cruiseMinutes = cruiseDistance / Math.max(1, gs) * 60;
  const airborneMinutes = Math.max(1, profile.climbMinutes + cruiseMinutes + profile.descentMinutes);
  const cruiseFuel = profile.cruiseFlow * cruiseMinutes / 60;
  const tripFuel = profile.climbFuel + cruiseFuel + profile.descentFuel;

  let alternateFuel = 0; let alternateDistance = 0; let alternateMinutes = 0;
  if (input.alternate) {
    alternateDistance = gcDistanceNm(input.destination, input.alternate);
    const altCourse = initialCourse(input.destination, input.alternate);
    const altDestWind = nearestWind(weather.winds[input.alternate.iata || input.alternate.icao.slice(-3)], input.alternateAltitudeFt);
    const altWind = averageWind(destWind, altDestWind);
    const altGs = groundSpeed(profile.cruiseTasKt, altCourse, altWind);
    alternateMinutes = alternateDistance / Math.max(1, altGs) * 60;
    alternateFuel = Math.max(profile.descentFuel * .5, profile.cruiseFlow * alternateMinutes / 60);
  }
  const contingency = tripFuel * profile.contingencyPct / 100;
  const reserve = profile.holdingFlow * profile.reserveMinutes / 60;
  const ramp = profile.taxiFuel + tripFuel + alternateFuel + contingency + reserve;
  const takeoff = Math.max(0, ramp - profile.taxiFuel);
  const landing = Math.max(0, takeoff - tripFuel);
  const start = parseClock(input.schedOut);
  const schedIn = hhmmFromMinutes(start + airborneMinutes + 8);
  const release = `AS-${input.flightDate.replace(/-/g,'')}-${input.departure.icao}${input.destination.icao}-${Date.now().toString().slice(-5)}`;

  const tocFrac = distance > 0 ? clamp(climbDistance / distance, .08, .42) : .25;
  const todFrac = distance > 0 ? clamp(1 - descentDistance / distance, .58, .92) : .75;
  const toc = point(input.departure, input.destination, tocFrac); const tod = point(input.departure, input.destination, todFrac);
  const elapsedToc = profile.climbMinutes; const elapsedTod = profile.climbMinutes + cruiseMinutes;
  const remAtToc = Math.max(0, takeoff - profile.climbFuel);
  const remAtTod = Math.max(0, remAtToc - cruiseFuel);
  const navlog = [
    { ident: input.departure.icao, name: input.departure.name, via_airway:'DCT', course:Math.round(course), distance:0, distance_total:Math.round(distance), altitude_feet:input.departure.elevationFt, tas:0, groundspeed:0, wind_dir:'', wind_spd:'', oat:'', isa_dev:'', time_leg:0, fuel_leg:0, fuel_total:takeoff, pos_lat:input.departure.latitude, pos_long:input.departure.longitude },
    { ident:'TOC', name:'Top of climb', via_airway: input.route || 'DCT', course:Math.round(course), distance:Math.round(climbDistance), distance_total:Math.round(distance-climbDistance), altitude_feet:input.cruiseAltitudeFt, tas:profile.cruiseTasKt, groundspeed:Math.round(gs), wind_dir:wind.direction === null?'':Math.round(wind.direction), wind_spd:Math.round(wind.speedKt), oat:wind.tempC === null?'':Math.round(wind.tempC), isa_dev:'', time_leg:profile.climbMinutes/60, fuel_leg:profile.climbFuel, fuel_total:remAtToc, pos_lat:toc.latitude, pos_long:toc.longitude },
    { ident:'TOD', name:'Top of descent', via_airway: input.route || 'DCT', course:Math.round(course), distance:Math.round(cruiseDistance), distance_total:Math.round(descentDistance), altitude_feet:input.cruiseAltitudeFt, tas:profile.cruiseTasKt, groundspeed:Math.round(gs), wind_dir:wind.direction === null?'':Math.round(wind.direction), wind_spd:Math.round(wind.speedKt), oat:wind.tempC === null?'':Math.round(wind.tempC), isa_dev:'', time_leg:cruiseMinutes/60, fuel_leg:cruiseFuel, fuel_total:remAtTod, pos_lat:tod.latitude, pos_long:tod.longitude },
    { ident:input.destination.icao, name:input.destination.name, via_airway:'DCT', course:Math.round(course), distance:Math.round(descentDistance), distance_total:0, altitude_feet:input.destination.elevationFt, tas:0, groundspeed:0, wind_dir:'', wind_spd:'', oat:'', isa_dev:'', time_leg:profile.descentMinutes/60, fuel_leg:profile.descentFuel, fuel_total:landing, pos_lat:input.destination.latitude, pos_long:input.destination.longitude }
  ];

  const metar = (icao: string) => weather.stations[icao]?.metar || 'No current METAR returned by AviationWeather.gov.';
  const taf = (icao: string) => weather.stations[icao]?.taf || 'No current TAF returned by AviationWeather.gov.';
  const alternate = input.alternate?.icao || '';
  const route = input.route.trim() || 'DCT';
  const flightNo = input.flightNumber.trim() || 'AS001';
  const aircraft = profile.aircraft.trim() || 'ZZZZ';
  const fpl = `(FPL-${flightNo.replace(/[^A-Z0-9]/gi,'').toUpperCase()}-IG\n-${aircraft}/L-SDFGIRWY/S\n-${input.departure.icao}${input.schedOut.replace(':','')}\n-N${String(Math.round(profile.cruiseTasKt)).padStart(4,'0')}F${String(Math.round(input.cruiseAltitudeFt/100)).padStart(3,'0')} ${route}\n-${input.destination.icao}${durationString(airborneMinutes).replace(':','')}${alternate ? ` ${alternate}` : ''}\n-RMK/AEROSLATE CUSTOM PLAN WEATHER ${weather.source})`;

  return {
    fetch: { status:'Success', time:new Date().toISOString(), source:'AeroSlate Planner' },
    params: { units:profile.units, orig:input.departure.icao, dest:input.destination.icao, altn:alternate, type:aircraft, reg:profile.registration, route, date:input.flightDate },
    general: { release, icao_airline:'', flight_number:flightNo, callsign:flightNo, route, initial_altitude:String(input.cruiseAltitudeFt), route_distance:Math.round(distance), gc_distance:Math.round(distance), cruise_tas:Math.round(profile.cruiseTasKt), date:input.flightDate, costindex:'CUSTOM', planner_source:'AeroSlate custom fuel profile', weather_source:weather.source, weather_fetched_at:weather.fetchedAt, wind_summary:windText(wind) },
    aircraft: { icao_code:aircraft, type:aircraft, reg:profile.registration, profile_name:profile.name, profile_learning:profile.learned || null },
    origin: { icao_code:input.departure.icao, iata_code:input.departure.iata, name:input.departure.name, pos_lat:input.departure.latitude, pos_long:input.departure.longitude, elevation:input.departure.elevationFt, metar:metar(input.departure.icao), taf:taf(input.departure.icao) },
    destination: { icao_code:input.destination.icao, iata_code:input.destination.iata, name:input.destination.name, pos_lat:input.destination.latitude, pos_long:input.destination.longitude, elevation:input.destination.elevationFt, metar:metar(input.destination.icao), taf:taf(input.destination.icao) },
    alternate: input.alternate ? { icao_code:input.alternate.icao, iata_code:input.alternate.iata, name:input.alternate.name, metar:metar(input.alternate.icao), taf:taf(input.alternate.icao), cruise_altitude:input.alternateAltitudeFt } : {},
    weather: { orig_metar:metar(input.departure.icao), orig_taf:taf(input.departure.icao), dest_metar:metar(input.destination.icao), dest_taf:taf(input.destination.icao), altn_metar:alternate?metar(alternate):'', altn_taf:alternate?taf(alternate):'', source:weather.source, fetched_at:weather.fetchedAt, winds_aloft:{ course:Math.round(course), cruise_altitude:input.cruiseAltitudeFt, direction:wind.direction, speed:wind.speedKt, temperature:wind.tempC } },
    times: { sched_out_time:input.schedOut, sched_in_time:schedIn, est_time_enroute:Math.round(airborneMinutes*60), block_time:Math.round((airborneMinutes+8)*60) },
    fuel: { taxi:profile.taxiFuel, enroute_burn:tripFuel, contingency, alternate_burn:alternateFuel, reserve, etops:0, extra:0, plan_ramp:ramp, plan_takeoff:takeoff, plan_landing:landing, min_takeoff:tripFuel+alternateFuel+reserve, max_tanks:profile.usableFuel, avg_fuel_flow:tripFuel/(airborneMinutes/60) },
    navlog:{ fix:navlog },
    text:{ atc:fpl, planner:`AEROSLATE CUSTOM FLIGHT PLAN\n${input.departure.icao}-${input.destination.icao} ${route}\nCRZ ${input.cruiseAltitudeFt} FT  TAS ${profile.cruiseTasKt} KT\nFORECAST WIND ${windText(wind)}${wind.tempC===null?'':` / ${Math.round(wind.tempC)}C`}\nDIST ${Math.round(distance)} NM  ETE ${durationString(airborneMinutes)}\nTRIP ${Math.round(tripFuel)} ${profile.units}  RAMP ${Math.round(ramp)} ${profile.units}\nWEATHER ${weather.source} ${weather.fetchedAt}` },
    custom_planner:{ profile_id:profile.id, profile_name:profile.name, alternate_distance_nm:Math.round(alternateDistance), alternate_time_minutes:Math.round(alternateMinutes), generated_at:new Date().toISOString(), warnings:[...(weather.warnings || []), ...(profile.usableFuel > 0 && ramp > profile.usableFuel ? [`Planned ramp fuel ${Math.round(ramp)} ${profile.units} exceeds profile usable fuel ${Math.round(profile.usableFuel)} ${profile.units}.`] : [])] }
  };
}
