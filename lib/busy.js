// Is now a bad time for the buddy to walk on? Full-screen video, a game in full screen, or a
// call. Pure helpers here; background.js asks Chrome about the tabs and windows.

// Sites that are only for meetings: being on one counts as a call even when it's quiet.
const MEETING_HOSTS = ['meet.google.com', 'zoom.us', 'whereby.com', 'meet.jit.si', 'webex.com', 'gather.town'];
// Chat apps with calls: they count while they're playing sound, which means a call is on.
const VOICE_HOSTS = ['teams.microsoft.com', 'teams.live.com', 'discord.com', 'app.slack.com', 'web.skype.com',
  'web.whatsapp.com', 'messenger.com', 'www.messenger.com'];

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function matches(host, list) {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

// tab: { url, audible, active }
export function isCallTab(tab) {
  if (!tab || !tab.url) return false;
  const host = hostOf(tab.url);
  if (matches(host, MEETING_HOSTS)) return Boolean(tab.active || tab.audible);
  return Boolean(tab.audible) && matches(host, VOICE_HOSTS);
}

// Why the buddy should wait, or null. windowState is the active window's state.
export function busyReason({ windowState, pageFullscreen, tabs }) {
  if (windowState === 'fullscreen' || pageFullscreen) return 'fullscreen';
  if ((tabs || []).some(isCallTab)) return 'call';
  return null;
}
