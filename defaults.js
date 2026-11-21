// Pengaturan bawaan, dipakai bersama oleh content script dan popup.
globalThis.YTSC_DEFAULTS = {
  // Kecepatan & audio
  rememberSpeed: true,
  speed: 1,
  speedStep: 0.25,
  boost: 1,
  // Filter video
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  sepia: 0,
  mirror: false,
  flip: false,
  // Mode bioskop
  cinema: false,
  cinemaOpacity: 80,
  // Otomatisasi
  autoSkipAds: true,
  autoTheater: false,
  autoPauseHidden: false,
  quality: 'auto',
  // Mode bersih
  hideShorts: false,
  hideComments: false,
  hideRecs: false,
  hideEndCards: false,
  // UI
  showButton: true
};
