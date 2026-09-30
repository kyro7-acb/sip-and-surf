// Plays the sip sound for the service worker, which can't play audio itself.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'PLAY_SIP') {
    const audio = document.getElementById('sip');
    audio.currentTime = 0;
    audio.volume = 0.8;
    audio.play().catch((err) => console.warn('Sip and Surf: sound blocked.', err));
  }
});
