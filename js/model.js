// =============================================================
//  Climate model for "Our Earth, Our Choices"
//  A deliberately simple model that stays close to published science.
//  Every number below has a source in SOURCES (bottom of file).
// =============================================================

// ---------- Today's reference values ----------
export const TODAY = {
  co2: 425.6,      // ppm, global mean 2025 (NOAA GML, AGGI 2026)                          [S1]
  methane: 1936,   // ppb, global mean 2025 (NOAA GML)                                       [S1]
  // Renewable & nuclear share of energy for electricity, heating and industry (everything
  // except transport). World total is 13.4 % non-fossil (Energy Institute 2025); transport
  // (~28 % of final energy) is ~95 % oil, so the non-transport share is ≈ 17 %.             [S2]
  clean: 17,
  // Share of transport running on electricity / low-carbon fuel: ~4 % of the world's cars
  // are electric (IEA Global EV Outlook 2025), plus some biofuel and electric rail ≈ 5 %.  [S23]
  transport: 5,
  livestock: 100,  // % of today's methane from livestock digestion & manure (~112 Mt/yr)  [S24]
  forest: 100,
};

export const PREINDUSTRIAL = { co2: 278.3, methane: 729.2 }; // year 1750 (IPCC AR6 WGI ch.2) [S3]

export const RANGES = {
  ghg:       { min: 170, max: 1300, step: 1 }, // CO2-equivalent ppm (CO2 + methane); 176 = last Ice Age
  clean:     { min: 0,   max: 100,  step: 1 },
  transport: { min: 0,   max: 100,  step: 1 },
  livestock: { min: 0,   max: 200,  step: 1 },
  co2:       { min: 180, max: 1300 },
  methane:   { min: 350, max: 4000 },
};

// ---------- Helpers ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Piece-wise linear interpolation through [x, y] points (extrapolates flat). */
export function interp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// ---------- How the "cause" sliders change the gases ----------
// Fossil energy is what builds up CO2. Across IPCC scenarios, CO2 in 2100 ranges from
// ~390 ppm (SSP1-1.9) to ~1135 ppm (SSP5-8.5). In this model, all energy fossil adds ~100 ppm
// compared with today's mix, and all energy clean stops CO2 building up and lets it fall
// toward ~290 ppm (−135 ppm).                                                                [S4]
// Transport is ~22 % of energy CO2 (IEA), so that effect is split 78 % / 22 %.             [S23]
export function co2FromEnergy(clean) {
  return interp(clean, [[0, 78], [TODAY.clean, 0], [100, -105]]);
}
export function co2FromTransport(t) {
  return interp(t, [[0, 3], [TODAY.transport, 0], [100, -30]]);
}
// Livestock digestion & manure: ~112 Mt of methane per year (Global Methane Budget 2025).
// Methane lasts ~9.1 years and 1 ppb = 2.78 Mt, so each 1 % change in livestock emissions
// shifts methane by 1.12 × 9.1 / 2.78 ≈ 3.7 ppb.                                            [S24]
export function methaneFromLivestock(l) {
  return (l - TODAY.livestock) * 3.67;
}
// The combined "greenhouse gases" value: the CO2 level that would trap the same heat as
// CO2 + methane together (CO2-equivalent).
export function co2e(co2, methane) {
  return PREINDUSTRIAL.co2 * Math.exp(forcing(co2, methane).total / 5.35);
}
/** Split a target CO2-equivalent into CO2 and methane, keeping their current shares of heat-trapping. */
export function splitGhg(target, co2, methane) {
  const F = forcing(co2, methane);
  const Ft = 5.35 * Math.log(Math.max(target, PREINDUSTRIAL.co2) / PREINDUSTRIAL.co2);
  const shareCO2 = F.total > 0.05 ? F.fCO2 / F.total : 0.79;
  let fm = Ft * (1 - shareCO2);
  // keep methane inside its range; whatever heat-trapping is left over goes to CO2
  const fmMax = 0.036 * (Math.sqrt(RANGES.methane.max) - Math.sqrt(PREINDUSTRIAL.methane));
  const fmMin = 0.036 * (Math.sqrt(RANGES.methane.min) - Math.sqrt(PREINDUSTRIAL.methane));
  fm = clamp(fm, fmMin, fmMax);
  const fc = Ft - fm;
  return {
    co2: PREINDUSTRIAL.co2 * Math.exp(fc / 5.35),
    methane: (Math.sqrt(PREINDUSTRIAL.methane) + fm / 0.036) ** 2,
  };
}

// ---------- Warming ----------
// Radiative forcing (simplified IPCC formulas, Myhre et al. 1998):
//   CO2:  5.35 · ln(C / C0)       W/m²
//   CH4:  0.036 · (√M − √M0)      W/m²
// Other human effects (N2O, ozone, CFCs …) roughly cancel the cooling from
// air-pollution particles (IPCC AR6 total ERF 2.72 W/m² vs CO2+CH4 2.70). [S3]
// Warming = λ · forcing, with λ calibrated so today's levels give the
// 1.36 °C of human-caused warming measured for 2024 (Forster et al. 2025).
// λ = 0.471 °C per W/m²  ⇔  1.75 °C per CO2 doubling, matching the IPCC
// best estimate of the Transient Climate Response (1.8 °C).                [S6]
const LAMBDA = 0.4714;
export function forcing(co2, methane) {
  const fCO2 = 5.35 * Math.log(co2 / PREINDUSTRIAL.co2);
  const fCH4 = 0.036 * (Math.sqrt(methane) - Math.sqrt(PREINDUSTRIAL.methane));
  return { fCO2, fCH4, total: fCO2 + fCH4 };
}

// ---------- Main model ----------
export function computeClimate({ co2, methane, forest = 100 }) {
  const F = forcing(co2, methane);
  // Warming uses the transient response above. Cooling below pre-industrial is what happens
  // over thousands of years, when growing ice sheets, dust and vegetation amplify it
  // ("Earth-system sensitivity"). The last Ice Age (21,000 years ago) had CO2 ≈ 185 ppm and
  // methane ≈ 375 ppb (forcing ≈ −2.5 W/m²) and was about 6 °C colder (IPCC AR6: −6 [−7 to −5] °C),
  // so the cold side uses ≈ 2.4 °C per W/m².                                                  [S25]
  const T = F.total >= 0 ? LAMBDA * F.total : 2.4 * F.total; // °C relative to 1850-1900

  // Sea level rise by 2100 (m, vs 1995-2014). IPCC AR6 medians per scenario,
  // placed at each scenario's 2081-2100 warming.                             [S7]
  const seaLevel2100 = Math.max(0, interp(T, [
    [0, 0.0], [1.0, 0.30], [1.4, 0.38], [1.8, 0.44], [2.7, 0.56], [3.6, 0.68], [4.4, 0.77], [5.5, 0.90],
  ]));
  // Committed sea level rise over 2000 years (m). AR6 SPM B.5.4:
  // 1.5 °C: 2–3 m, 2 °C: 2–6 m, 3 °C: 4–10 m, 4 °C: 12–16 m, 5 °C: 19–22 m.  [S7]
  const seaLevel2000y = Math.max(0, interp(T, [
    [0, 0], [1.0, 1.5], [1.5, 2.5], [2, 4], [3, 7], [4, 14], [5, 20.5], [6, 25],
  ]));

  // Arctic September sea ice (million km²). Linear fit to observations:
  // ~7 M km² around 1979 (+0.3 °C), ~4.3 M km² in 2024 (+1.36 °C).
  // "Ice-free" means < 1 M km². IPCC SR1.5: ice-free summers once a century at
  // 1.5 °C, at least once a decade at 2 °C.                                  [S8]
  // Colder than 1750: sea ice keeps growing (Ice-Age summer sea ice covered most of the Arctic). [S25]
  const arcticIce = clamp(7.8 - 2.7 * T, 0, 24);

  // Mountain glaciers (Rounce et al. 2023, Science): mass lost by 2100 vs 2015,
  // and share of the world's 215,000 glaciers that disappear.                [S9]
  const glacierMassLoss = clamp(interp(T, [[0, 0], [1.0, 20], [1.5, 26], [2.7, 32], [4, 41], [5, 47]]), 0, 100);
  const glaciersGone = clamp(interp(T, [[0, 0], [1.0, 40], [1.5, 49], [2.7, 68], [4, 83], [5, 90]]), 0, 100);

  // Extreme events (IPCC AR6 WGI SPM Fig. SPM.6): how many times more often a
  // "once-in-10-years" event happens compared with 1850-1900.                [S10]
  const heatX = interp(T, [[0, 1], [1, 2.8], [1.5, 4.1], [2, 5.6], [4, 9.4], [5, 9.9]]);
  const droughtX = interp(T, [[0, 1], [1, 1.7], [1.5, 2.0], [2, 2.4], [4, 4.1], [5, 4.6]]);
  const rainX = interp(T, [[0, 1], [1, 1.3], [1.5, 1.5], [2, 1.7], [4, 2.7], [5, 3.0]]);

  // Wildfire danger index (0-1): grows with drought frequency and forest loss
  // (fire weather increases with warming — AR6; deforestation edges burn more). [S11]
  const deforest = clamp((TODAY.forest - forest) / 100, -0.3, 1);
  const fire = clamp((droughtX - 1) / 3.6 + Math.max(0, deforest) * 0.35, 0, 1);

  // Coral reefs remaining long-term (% of today's). IPCC SR1.5: further decline of
  // 70–90 % at 1.5 °C, > 99 % at 2 °C.                                       [S12]
  const coral = clamp(interp(T, [[0, 100], [1.0, 100], [1.5, 20], [2.0, 1], [3, 0]]), 0, 100);

  // Ocean surface pH: 8.17 in 1750, ~8.05 today, ~7.67 by 2100 under very
  // high CO2 (~940 ppm). Fitted curve in ln(CO2).                             [S13]
  const x = Math.log(co2 / PREINDUSTRIAL.co2);
  const pH = 8.17 - 0.2355 * x - 0.1385 * x * x;
  const acidityUp = (Math.pow(10, 8.17 - pH) - 1) * 100; // % more H+ ions than 1750

  // Land species at very high risk of extinction, upper end of IPCC AR6 WGII
  // ranges: 1.5 °C: 14 %, 2 °C: 18 %, 3 °C: 29 %, 4 °C: 39 %, 5 °C: 48 %.      [S14]
  const species = clamp(interp(T, [[0, 0], [1.0, 9], [1.5, 14], [2, 18], [3, 29], [4, 39], [5, 48]]), 0, 60);

  // Tipping points (Armstrong McKay et al. 2022, Science): [low, central, high] °C. [S15]
  const tipping = [
    { id: 'greenland', range: [0.8, 1.5, 3.0] },
    { id: 'wais',      range: [1.0, 1.5, 3.0] },
    { id: 'reefs',     range: [1.0, 1.5, 2.0] },
    { id: 'permafrost',range: [1.0, 1.5, 2.3] },
    { id: 'amazon',    range: [2.0, 3.5, 6.0], forestTrigger: true },
    { id: 'boreal',    range: [1.4, 4.0, 5.0] },
  ].map(tp => {
    let level = 0; // 0 safe, 1 possible, 2 likely, 3 very likely
    const [lo, mid, hi] = tp.range;
    if (T >= hi) level = 3; else if (T >= mid) level = 2; else if (T >= lo) level = 1;
    // Amazon: scientists warn of dieback if ~20–25 % of the forest is lost (today ~17 %).
    // Losing ~10 % more of today's forest pushes it past that line.         [S16]
    if (tp.forestTrigger) {
      if (forest <= 80) level = Math.max(level, 3);
      else if (forest <= 90) level = Math.max(level, 2);
    }
    return { ...tp, level };
  });

  // Ice-sheet melt shown on the globe (0-1), illustrative.
  // By 2100: small, slow losses. Over centuries: large if thresholds are passed.
  const ice2100 = {
    greenland: clamp((T - 0.8) / 4.2, 0, 1) * 0.12,
    wais: clamp((T - 1.0) / 4.0, 0, 1) * 0.08,
    eais: 0,
  };
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const iceFar = {
    greenland: smooth(1.0, 4.5, T),
    wais: smooth(1.2, 4.0, T),
    eais: smooth(3.0, 6.0, T) * 0.6,
  };

  // ---------- Extra numbers used on the 3D globe ----------
  // Arctic sea ice in March (winter maximum, million km²): ~16.4 in 1979, ~14.9 in 2024
  // (NSIDC). Winter ice persists even with strong warming (IPCC AR6 ch. 9).     [S17]
  const arcticIceMarch = clamp(16.8 - 1.4 * T, 6, 26);
  // Antarctic sea ice: ~18.5 M km² in September, ~3 M km² in February (NSIDC 1981-2010).
  // Models project a decline but with LOW confidence (IPCC AR6), so changes are kept small. [S17]
  // In the Ice Age, Antarctic winter sea ice was roughly twice as big as today.             [S25]
  const antarcticIceSept = clamp(18.5 - 0.6 * Math.max(0, T - 1.0) - 2.0 * Math.min(0, T), 12, 31);
  const antarcticIceFeb = clamp(3.0 - 0.4 * Math.max(0, T - 1.0) - 0.8 * Math.min(0, T), 0.8, 8);
  // Northern Hemisphere spring snow cover shrinks ~8 % per °C of global warming
  // (Mudryk et al. 2020, used in IPCC AR6 Fig. 9.24), relative to 1995-2014 (+0.85 °C).
  // ~1.6° of latitude of northern land ≈ 8 % of spring snow area.              [S18]
  const snowShift = (T - 0.85) * 1.6; // degrees the snow line moves north

  // Strongest tropical cyclones (Cat 4-5): their share grows ~13 % at 2 °C and rain
  // rates ~14 % (Knutson et al. 2020, BAMS; assessed in IPCC AR6 ch. 11).     [S19]
  const stormShare = Math.max(0, 13 * (T - 0.6) / 1.4);
  const stormRain = Math.max(0, 14 * (T - 0.6) / 1.4);

  // Wildlife status on the globe: 0 = OK, 1 = at risk, 2 = in serious danger.  [S20]
  const lvl = (v, a, b) => (v < a ? 0 : v < b ? 1 : 2);
  const animals = {
    polarBear: arcticIce > 4.5 ? 0 : arcticIce > 1 ? 1 : 2,            // needs sea ice to hunt (Molnár 2020)
    penguin: lvl(T, 1.2, 2.5),                                         // emperor penguin (Jenouvrier 2021)
    turtle: lvl(T, 1.0, 2.0),                                          // warm sand -> almost only females (Jensen 2018)
    tiger: lvl(seaLevel2100, 0.3, 0.6),                                // Sundarbans mangroves (Mukul 2019)
    koala: lvl(droughtX, 1.8, 3.0),                                    // drought, heat and fire (Australia)
  };

  // ---------- Ice Age (only when colder than 1750) ----------
  // 0 = 1750, 1 = full Ice Age (−6 °C). Sea level fell ~120-130 m because water was locked in
  // ice sheets over North America and northern Europe (Clark et al. 2009; IPCC AR6).       [S25]
  const iceAge = clamp(-T / 6, 0, 1);
  const seaLevelIceAge = -20 * Math.max(0, -T); // m (−120 m at −6 °C)

  return {
    iceAge, seaLevelIceAge,
    T, forcing: F, seaLevel2100, seaLevel2000y, arcticIce, glacierMassLoss, glaciersGone,
    heatX, droughtX, rainX, fire, coral, pH, acidityUp, species, tipping,
    deforest, ice2100, iceFar,
    arcticIceMarch, antarcticIceSept, antarcticIceFeb, snowShift, stormShare, stormRain, animals,
  };
}

export const PRESETS = {
  iceAge: { co2: 185,  methane: 375,  clean: 100, transport: 100, livestock: 0 },
  y1750:  { co2: 280,  methane: 730,  clean: 100, transport: 100, livestock: 15 },
  today:  { co2: TODAY.co2, methane: TODAY.methane, clean: TODAY.clean, transport: TODAY.transport, livestock: 100 },
  paris:  { co2: 455,  methane: 1500, clean: 75,  transport: 60,  livestock: 70 },
  high:   { co2: 1000, methane: 2900, clean: 5,   transport: 2,   livestock: 160 },
};

export const SOURCES = [
  { id: 'S1', text: 'NOAA Global Monitoring Laboratory – Annual Greenhouse Gas Index (2025 values: CO₂ 425.6 ppm, CH₄ 1936 ppb)', url: 'https://gml.noaa.gov/aggi/aggi.html' },
  { id: 'S2', text: 'Energy Institute – Statistical Review of World Energy 2025 (fossil fuels 86.6 % of primary energy in 2024)', url: 'https://www.energyinst.org/statistical-review' },
  { id: 'S3', text: 'IPCC AR6 WGI (2021), Ch. 2 & 7 – pre-industrial concentrations and effective radiative forcing', url: 'https://www.ipcc.ch/report/ar6/wg1/' },
  { id: 'S4', text: 'IPCC AR6 WGI – Shared Socioeconomic Pathways (SSP1-1.9 … SSP5-8.5) concentrations', url: 'https://www.ipcc.ch/report/ar6/wg1/' },
  { id: 'S5', text: 'Pan et al. (2011) Science – A large and persistent carbon sink in the world’s forests; Global Carbon Budget 2024', url: 'https://essd.copernicus.org/articles/17/965/2025/' },
  { id: 'S6', text: 'Forster et al. (2025) – Indicators of Global Climate Change 2024 (1.36 °C human-induced warming)', url: 'https://essd.copernicus.org/articles/17/2641/2025/' },
  { id: 'S7', text: 'IPCC AR6 WGI SPM B.5 – sea level by 2100 (0.38 m SSP1-1.9 … 0.77 m SSP5-8.5) and over 2000 years', url: 'https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/' },
  { id: 'S8', text: 'IPCC SR1.5 SPM – Arctic ice-free summers; NSIDC sea ice observations', url: 'https://www.ipcc.ch/sr15/chapter/spm/' },
  { id: 'S9', text: 'Rounce et al. (2023) Science – Global glacier change in the 21st century: every increase in temperature matters', url: 'https://www.cmu.edu/news/stories/archives/2023/january/team-projects-two-out-of-three-glaciers-could-be-lost-by-2100' },
  { id: 'S10', text: 'IPCC AR6 WGI Figure SPM.6 – heat extremes, heavy rain and drought at 1, 1.5, 2 and 4 °C', url: 'https://www.ipcc.ch/report/ar6/wg1/figures/summary-for-policymakers/figure-spm-6' },
  { id: 'S11', text: 'IPCC AR6 WGI Ch. 12 – fire weather; UNEP (2022) Spreading like Wildfire', url: 'https://www.unep.org/resources/report/spreading-wildfire-rising-threat-extraordinary-landscape-fires' },
  { id: 'S12', text: 'IPCC SR1.5 SPM B.4.2 – coral reefs decline 70–90 % at 1.5 °C, > 99 % at 2 °C', url: 'https://www.ipcc.ch/sr15/chapter/spm/' },
  { id: 'S13', text: 'NOAA Climate.gov – Ocean acidification, today and in the future', url: 'https://www.climate.gov/news-features/featured-images/ocean-acidification-today-and-future' },
  { id: 'S14', text: 'IPCC AR6 WGII SPM B.4.1 – share of land species at very high risk of extinction', url: 'https://www.ipcc.ch/report/ar6/wg2/downloads/outreach/IPCC_AR6_WGII_FactSheet_Biodiversity.pdf' },
  { id: 'S15', text: 'Armstrong McKay et al. (2022) Science – Exceeding 1.5 °C could trigger multiple climate tipping points', url: 'https://www.science.org/doi/10.1126/science.abn7950' },
  { id: 'S16', text: 'Lovejoy & Nobre (2018) Science Advances – Amazon tipping point (20–25 % deforestation)', url: 'https://www.science.org/doi/10.1126/sciadv.aat2340' },
  { id: 'S17', text: 'NSIDC Sea Ice Index – Arctic and Antarctic sea ice extent', url: 'https://nsidc.org/data/seaice_index' },
  { id: 'S18', text: 'Mudryk et al. (2020) The Cryosphere – spring snow cover falls ~8 % per °C (IPCC AR6 Fig. 9.24)', url: 'https://tc.copernicus.org/articles/14/2495/2020/' },
  { id: 'S19', text: 'Knutson et al. (2020) BAMS – Tropical cyclones and climate change assessment, part II', url: 'https://journals.ametsoc.org/view/journals/bams/101/3/bams-d-18-0194.1.xml' },
  { id: 'S20', text: 'Wildlife: Molnár et al. 2020 (polar bears), Jenouvrier et al. 2021 (emperor penguins), Jensen et al. 2018 (green turtles), Mukul et al. 2019 (Sundarbans tigers)', url: 'https://www.nature.com/articles/s41558-020-0818-9' },
  { id: 'S21', text: 'Rantanen et al. (2022) – Arctic warmed nearly 4× faster than the globe; IPCC AR6: land warms ~1.5× more than ocean', url: 'https://www.nature.com/articles/s43247-022-00498-3' },
  { id: 'S23', text: 'IEA – Global EV Outlook 2025 (electric cars ≈ 4 % of the world’s cars) and Tracking Transport (transport ≈ one fifth of energy CO₂)', url: 'https://www.iea.org/reports/global-ev-outlook-2025' },
  { id: 'S24', text: 'Saunois et al. (2025) ESSD – Global Methane Budget 2000–2020 (livestock ≈ 112 Mt CH₄ per year); IPCC AR6 – methane lifetime ≈ 9.1 years', url: 'https://essd.copernicus.org/articles/17/1873/2025/' },
  { id: 'S25', text: 'IPCC AR6 WGI ch. 7 & Clark et al. (2009) Science – Last Glacial Maximum: ~6 °C colder, CO₂ ≈ 185 ppm, sea level ≈ 120–130 m lower, ice sheets over North America and northern Europe', url: 'https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-7/' },
  { id: 'S26', text: 'Knutson et al. (2020) & IPCC AR6 ch. 11 – fewer or similar numbers of tropical cyclones overall, but a larger share of very strong ones', url: 'https://journals.ametsoc.org/view/journals/bams/101/3/bams-d-18-0194.1.xml' },
  { id: 'S22', text: 'Elevation: Mapzen / AWS Terrain Tiles (SRTM, GMTED, ETOPO1). Imagery: NASA Blue Marble Next Generation (GIBS)', url: 'https://registry.opendata.aws/terrain-tiles/' },
];
