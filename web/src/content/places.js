// Preset areas shown in the "Preset" list (safe to edit: add, remove or rename).
// box = [west, south, east, north] in degrees. Keep each side under 30 degrees.
// The first ten are SHIFT's tested regions (D18): their numbers are on the Validation page.
const PLACES = [
  { id: 'bangladesh', name: 'Bangladesh', box: [88.0, 20.5, 92.7, 26.7], tested: true },
  { id: 'africa_savanna', name: 'Central African savanna', box: [15, 4, 30, 12], tested: true },
  { id: 'australia_savanna', name: 'Northern Australia', box: [129, -17, 138, -11], tested: true },
  { id: 'amazon_arc', name: 'Amazon deforestation arc', box: [-64, -13, -52, -7], tested: true },
  { id: 'siberia_boreal', name: 'Siberian boreal forest', box: [100, 55, 130, 65], tested: true },
  { id: 'iberia_med', name: 'Iberian Peninsula', box: [-9.5, 36, 3.5, 44], tested: true },
  { id: 'punjab_crop', name: 'Punjab crop burning', box: [73, 27, 80, 32], tested: true },
  { id: 'kalimantan_peat', name: 'Kalimantan peatlands', box: [109, -4, 118, 2], tested: true },
  { id: 'java_volcanic', name: 'Java', box: [105, -9, 115, -6], tested: true },
  { id: 'florida', name: 'Florida', box: [-87.6, 24.5, -80, 31], tested: true },
  { id: 'se_australia', name: 'Southeast Australia (Black Summer 2019-20)', box: [145, -38.5, 154, -28] },
  { id: 'california', name: 'California', box: [-124.5, 32.5, -114, 42] },
  { id: 'chittagong_hills', name: 'Chittagong Hill Tracts', box: [91.5, 21.5, 92.7, 23.7] },
];

export default PLACES;
