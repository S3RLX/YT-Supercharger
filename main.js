// Berjalan di "MAIN world" supaya bisa memanggil API internal pemutar YouTube.
// Content script (isolated world) mengirim perintah lewat CustomEvent.
document.addEventListener('ytsc:quality', (e) => {
  const q = e.detail;
  const p = document.getElementById('movie_player');
  if (!p || !q) return;
  try { if (p.setPlaybackQualityRange) p.setPlaybackQualityRange(q, q); } catch (_) {}
  try { if (p.setPlaybackQuality) p.setPlaybackQuality(q); } catch (_) {}
});
