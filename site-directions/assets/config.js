/* Site config. PLAY_URL: where the PLAY button goes. The game's address is
   still being decided, so it is one constant here; every [data-play] link
   on every page takes it. */
window.ARC_CONFIG = {
  PLAY_URL: 'https://play.arcgame.app',
  SUPPORT_URL: 'https://support.interfulgent.com/arc/',
  PRIVACY_URL: 'https://support.interfulgent.com/arc/privacy',
  APP_STORE_ID: '6821467142' /* in TestFlight: shown as "coming soon", not linked */
};
document.querySelectorAll('[data-play]').forEach(function (a) { a.href = window.ARC_CONFIG.PLAY_URL; });
