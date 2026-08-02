export const demoOFP = {
  fetch: { userid: 'DEMO', time: Math.floor(Date.now() / 1000) },
  params: { units: 'LBS', orig: 'KIND', dest: 'KHPN', altn: 'KBDR', type: 'H25B', reg: 'N850DL', civalue: '45', tlr: '1' },
  general: {
    release: '01', icao_airline: 'DLX', flight_number: '850', callsign: 'DELUXE850',
    route: 'KIND VHP VLA J24 DJB J60 PSB J64 HNK KHPN', initial_altitude: 'FL390', costindex: '45',
    route_distance: 615, gc_distance: 592, avg_wind_comp: -18, cruise_tas: 440, cruise_mach: '.76'
  },
  origin: { icao_code: 'KIND', iata_code: 'IND', name: 'INDIANAPOLIS INTL', plan_rwy: '23L', metar: 'KIND 020054Z 23008KT 10SM FEW050 25/17 A3005', taf: 'KIND 012320Z 0200/0306 23008KT P6SM FEW050' },
  destination: { icao_code: 'KHPN', iata_code: 'HPN', name: 'WESTCHESTER COUNTY', plan_rwy: '16', metar: 'KHPN 020056Z 18005KT 10SM SCT040 23/18 A2998', taf: 'KHPN 012320Z 0200/0224 19006KT P6SM SCT040' },
  alternate: { icao_code: 'KBDR', name: 'IGOR I SIKORSKY MEMORIAL', plan_rwy: '11', metar: 'KBDR 020052Z 17006KT 10SM FEW035 23/19 A2998', taf: 'KBDR 012320Z 0200/0224 18007KT P6SM FEW035' },
  aircraft: { icao_code: 'H25B', name: 'HAWKER 850XP', reg: 'N850DL', fin: '850', selcal: 'AB-CD' },
  times: {
    sched_out: Math.floor(Date.now() / 1000) + 3600,
    sched_in: Math.floor(Date.now() / 1000) + 3 * 3600,
    block_time: 7200,
    est_time_enroute: 6120,
    taxi_out: 900,
    taxi_in: 420
  },
  fuel: { taxi: 450, enroute_burn: 5700, contingency: 285, alternate_burn: 900, reserve: 1500, extra: 300, plan_takeoff: 8685, plan_ramp: 9135, plan_landing: 2985, avg_fuel_flow: 3350 },
  weights: { oew: 18000, pax_count: 7, pax_weight: 1400, cargo: 350, payload: 1750, est_zfw: 19750, max_zfw: 24400, est_tow: 28435, max_tow: 28000, est_ldw: 22735, max_ldw: 23350 },
  navlog: { fix: [
    { ident: 'KIND', name: 'INDIANAPOLIS', via_airway: 'DCT', altitude_feet: 797, wind_dir: 230, wind_spd: 8, oat: 25, time_leg: 0, fuel_total: 9135 },
    { ident: 'VHP', name: 'BRICKYARD', via_airway: 'DCT', altitude_feet: 16000, wind_dir: 250, wind_spd: 24, oat: -8, time_leg: 420, fuel_leg: 650, fuel_total: 8485 },
    { ident: 'VLA', name: 'VANDALIA', via_airway: 'J24', altitude_feet: 39000, wind_dir: 270, wind_spd: 48, oat: -55, time_leg: 1050, fuel_leg: 1220, fuel_total: 7265 },
    { ident: 'DJB', name: 'DRYER', via_airway: 'J24', altitude_feet: 39000, wind_dir: 275, wind_spd: 52, oat: -56, time_leg: 960, fuel_leg: 900, fuel_total: 6365 },
    { ident: 'PSB', name: 'PHILIPSBURG', via_airway: 'J60', altitude_feet: 39000, wind_dir: 282, wind_spd: 55, oat: -57, time_leg: 1440, fuel_leg: 1240, fuel_total: 5125 },
    { ident: 'HNK', name: 'HANCOCK', via_airway: 'J64', altitude_feet: 25000, wind_dir: 290, wind_spd: 36, oat: -32, time_leg: 720, fuel_leg: 720, fuel_total: 4405 },
    { ident: 'KHPN', name: 'WESTCHESTER', via_airway: 'DCT', altitude_feet: 439, wind_dir: 180, wind_spd: 5, oat: 23, time_leg: 630, fuel_leg: 820, fuel_total: 3585 }
  ] },
  notams: {
    origin: [{ notam: 'RWY 05R/23L CLSD 0400-0900Z EXC 20 MIN PPR.' }],
    destination: [{ notam: 'TWY K BTN K1 AND K3 CLSD.' }],
    alternate: []
  },
  text: { atc: '(FPL-DLX850-IS-H25B/M-SDE2E3FGHIRWXY/LB1-KIND0130-N0440F390 DCT VHP VLA J24 DJB J60 PSB J64 HNK DCT-KHPN0142 KBDR-PBN/A1B1C1D1O1S2)', tlr: 'SIMBRIEF RUNWAY ANALYSIS (DEMO)\nTAKEOFF KIND RWY 23L  TOW 28435 LB  WIND 230/08  OAT 25C\nLANDING KHPN RWY 16  LDW 22735 LB  WIND 180/05  OAT 23C\nREFER TO THE GENERATED SIMBRIEF OFP FOR COMPLETE LIMITING-WEIGHT AND RUNWAY DATA.' }
};
