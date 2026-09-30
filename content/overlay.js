// Sip and Surf on-page reminder. Injected by the service worker into the active tab.
// Everything lives in a closed Shadow DOM so the page's CSS can't reach it and it can't
// reach the page. The script is safe to inject more than once.
(() => {
  if (window.__sipBuddy) return;

  const STEPS = 8; // the buddy takes 8 steps, then stops
  const STEP_MS = 450;
  const EXIT_STEP_MS = 300; // walks off a little quicker than he walks in
  const STOP_AT = 0.35; // share of the viewport width where he stops
  const TARGET_HEIGHT = 128; // on-screen height in CSS px

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .stage {
      position: fixed; left: 0; bottom: 16px;
      display: flex; flex-direction: column; align-items: center;
      pointer-events: none; will-change: transform;
      font-family: ui-rounded, "Segoe UI", system-ui, -apple-system, sans-serif;
    }
    .bubble {
      position: relative; margin-bottom: 6px; padding: 6px 10px;
      background: #ffffff; color: #0b3a53; border: 2px solid #0b3a53; border-radius: 10px;
      font-size: 13px; font-weight: 700; line-height: 1.2; white-space: nowrap;
      box-shadow: 3px 3px 0 #0b3a53;
      opacity: 0; transform: translateY(4px);
      transition: opacity 250ms ease, transform 250ms ease;
    }
    .bubble::after {
      content: ""; position: absolute; left: 50%; bottom: -8px; margin-left: -6px;
      border: 6px solid transparent; border-top-color: #0b3a53; border-bottom: 0;
    }
    .show-ui .bubble { opacity: 1; transform: none; }
    .buddy {
      image-rendering: pixelated; image-rendering: crisp-edges;
      background-repeat: no-repeat;
    }
    .buttons {
      display: flex; gap: 8px; margin-top: 8px;
      opacity: 0; transform: translateY(-4px);
      transition: opacity 300ms ease, transform 300ms ease;
    }
    .show-ui .buttons { opacity: 1; transform: none; pointer-events: auto; }
    button {
      all: unset; cursor: pointer; pointer-events: auto;
      padding: 8px 16px; border-radius: 8px; border: 2px solid #0b3a53;
      font: 700 14px/1 ui-rounded, "Segoe UI", system-ui, -apple-system, sans-serif;
      box-shadow: 3px 3px 0 #0b3a53; user-select: none;
      transition: transform 80ms ease, box-shadow 80ms ease;
    }
    button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #0b3a53; }
    button:focus-visible { outline: 3px solid #5ec8ff; outline-offset: 2px; }
    .sip { background: #36b3f0; color: #06293b; }
    .snooze { background: #ffffff; color: #0b3a53; }
    .timer {
      width: 100%; height: 3px; margin-top: 8px; border-radius: 2px;
      background: rgba(11, 58, 83, 0.15); overflow: hidden; opacity: 0; transition: opacity 300ms;
    }
    .timer > i { display: block; height: 100%; width: 100%; background: #36b3f0; transform-origin: left; }
    .show-ui .timer { opacity: 1; }
    .answered .buttons, .answered .timer, .answered .bubble { opacity: 0; pointer-events: none; }
  `;

  let host = null;
  let state = null;

  function send(type) {
    try {
      chrome.runtime.sendMessage({ type }).catch(() => {});
    } catch (_) {
      // The extension was reloaded; this page's copy of the script is stale.
    }
  }

  function remove() {
    if (state && state.autoTimer) clearTimeout(state.autoTimer);
    if (host) host.remove();
    host = null;
    state = null;
  }

  function frameAt(index) {
    return `${-index * state.w}px 0px`;
  }

  function setFrame(index) {
    state.buddy.style.backgroundPosition = frameAt(index);
  }

  function playFrames(start, count, duration, iterations) {
    const anim = state.buddy.animate(
      [{ backgroundPosition: frameAt(start) }, { backgroundPosition: frameAt(start + count) }],
      { duration, iterations, easing: `steps(${count})` }
    );
    return anim;
  }

  function walk(fromX, toX, steps, stepMs = STEP_MS) {
    const duration = steps * stepMs;
    const { sprite } = state;
    // One walk cycle = 4 frames = 2 steps.
    const cycle = playFrames(sprite.walkStart, sprite.walkFrames, stepMs * 2, steps / 2);
    const move = state.stage.animate(
      [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }],
      { duration, easing: 'linear', fill: 'forwards' }
    );
    state.x = toX;
    return move.finished.then(() => {
      cycle.cancel();
      if (state) setFrame(sprite.idle);
    });
  }

  function arrive() {
    if (!state) return;
    setFrame(state.sprite.idle);
    state.stage.classList.add('show-ui');
    send('ARRIVED'); // plays the sip sound
    const bar = state.stage.querySelector('.timer > i');
    bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
      duration: state.autoSnoozeMs,
      easing: 'linear',
      fill: 'forwards',
    });
    state.autoTimer = setTimeout(() => leave('AUTO_SNOOZE'), state.autoSnoozeMs);
  }

  // Walks off the right edge (Snooze, auto-snooze, or dismissed by the service worker).
  function leave(message) {
    if (!state || state.leaving) return;
    state.leaving = true;
    clearTimeout(state.autoTimer);
    state.stage.classList.add('answered');
    if (message) send(message);
    if (state.reduced) {
      fadeOut();
      return;
    }
    const endX = window.innerWidth + state.w;
    const steps = Math.max(2, Math.ceil((endX - state.x) / state.stride / 2) * 2);
    walk(state.x, endX, steps, EXIT_STEP_MS).then(remove);
  }

  function sip() {
    if (!state || state.leaving) return;
    state.leaving = true;
    clearTimeout(state.autoTimer);
    state.stage.classList.add('answered');
    send('SIP');
    const { sprite } = state;
    const drink = playFrames(sprite.drinkStart, sprite.drinkFrames, 1500, 1);
    drink.finished.then(() => {
      if (!state) return;
      setFrame(sprite.idle);
      // A happy little hop, then gone.
      state.buddy.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-18px)', offset: 0.4 },
          { transform: 'translateY(0)', offset: 0.8 },
          { transform: 'translateY(0)' },
        ],
        { duration: 500, easing: 'ease-out' }
      );
      fadeOut(250);
    });
  }

  function fadeOut(delay = 0) {
    if (!state) return;
    const anim = state.stage.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 400, delay, fill: 'forwards', easing: 'ease-in' }
    );
    anim.finished.then(remove);
  }

  function show(config) {
    if (host) return true;
    const { sprite, autoSnoozeMs } = config;

    // Crisp whole-number scaling for small pixel art, smooth fit for big images.
    const raw = TARGET_HEIGHT / sprite.frameHeight;
    const scale = raw >= 1 ? Math.max(1, Math.round(raw)) : raw;
    const w = Math.round(sprite.frameWidth * scale);
    const h = Math.round(sprite.frameHeight * scale);

    host = document.createElement('sip-buddy-overlay');
    host.style.cssText = 'all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const stage = document.createElement('div');
    stage.className = 'stage';
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-label', 'Sip and Surf: time for a sip of water');

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = 'Time for a sip!';

    const buddy = document.createElement('div');
    buddy.className = 'buddy';
    buddy.style.width = `${w}px`;
    buddy.style.height = `${h}px`;
    buddy.style.backgroundImage = `url("${sprite.dataUrl}")`;
    buddy.style.backgroundSize = `${w * sprite.total}px ${h}px`;

    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    const sipBtn = document.createElement('button');
    sipBtn.className = 'sip';
    sipBtn.type = 'button';
    sipBtn.textContent = 'Sip';
    const snoozeBtn = document.createElement('button');
    snoozeBtn.className = 'snooze';
    snoozeBtn.type = 'button';
    snoozeBtn.textContent = 'Snooze';
    buttons.append(sipBtn, snoozeBtn);

    const timer = document.createElement('div');
    timer.className = 'timer';
    timer.appendChild(document.createElement('i'));

    stage.append(bubble, buddy, buttons, timer);
    root.appendChild(stage);
    (document.body || document.documentElement).appendChild(host);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stageWidth = Math.max(w, stage.offsetWidth);
    const stopX = Math.max(8, Math.round(window.innerWidth * STOP_AT - stageWidth / 2));
    const startX = -stageWidth;

    state = {
      host, stage, buddy, sprite, w, h, reduced,
      autoSnoozeMs: autoSnoozeMs || 60000,
      stride: (stopX - startX) / STEPS,
      x: startX,
      leaving: false,
      autoTimer: null,
    };

    sipBtn.addEventListener('click', sip);
    snoozeBtn.addEventListener('click', () => leave('SNOOZE'));
    setFrame(sprite.idle);

    if (reduced) {
      stage.style.transform = `translateX(${stopX}px)`;
      state.x = stopX;
      stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 }).finished.then(arrive);
    } else {
      stage.style.transform = `translateX(${startX}px)`;
      walk(startX, stopX, STEPS).then(arrive);
    }
    return true;
  }

  window.__sipBuddy = {
    show,
    dismiss: () => leave(null),
  };
})();
