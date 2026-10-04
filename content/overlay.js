// Sip and Surf on-page reminder. Injected by the service worker into the active tab.
// Everything lives in a closed Shadow DOM so the page's CSS can't reach it and it can't
// reach the page. The script is safe to inject more than once.
(() => {
  if (window.__sipBuddy) return;

  const STEPS = 8; // the buddy takes 8 steps, then stops
  const STEP_MS = 450;
  const EXIT_STEP_MS = 300; // walking off is a little quicker than walking in
  const STOP_AT = 0.35; // where the buddy stops if the sheet doesn't say how long a step is
  const TURN_MS = 140; // per frame while turning to face you, or back to walk away
  const TARGET_HEIGHT = 180; // on-screen height in CSS px (roughly; pixel art snaps to whole-number scales)
  const ANGER_SIZE = 17; // the anger mark's size in sprite pixels (assets/anger.png)

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
    .show-ui .bubble, .bubble.say { opacity: 1; transform: none; }
    .body { position: relative; }
    .buddy {
      image-rendering: pixelated; image-rendering: crisp-edges;
      background-repeat: no-repeat;
    }
    .buddy.flip { transform: scaleX(-1); }
    .anger {
      position: absolute; display: block; pointer-events: none;
      image-rendering: pixelated; image-rendering: crisp-edges;
      opacity: 0; transform: scale(0);
    }
    .anger.on { opacity: 1; transform: scale(1); animation: throb 340ms ease-in-out infinite alternate; }
    @keyframes throb { from { transform: scale(1); } to { transform: scale(1.18); } }
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
    .answered .buttons, .answered .timer, .answered .bubble:not(.say) { opacity: 0; pointer-events: none; }
  `;

  let host = null;
  let state = null;

  function send(type) {
    if (state && state.demo && type !== 'ARRIVED') return; // the welcome page's demo logs nothing
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
    // One walk cycle = 2 steps.
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

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Shows frames one after another. Stops early if the buddy was removed meanwhile.
  async function sequence(frames, frameMs) {
    for (const frame of frames) {
      if (!state) return;
      setFrame(frame);
      await wait(frameMs);
    }
  }

  // Sheets from tools/make_character.py have side-view walking and a front view; a sheet
  // built from one image only has the side view.
  function canTurn() {
    return state.sprite.turnStart != null && state.sprite.frontIdle != null;
  }

  function turnFrames() {
    const { turnStart, turnFrames: count } = state.sprite;
    return Array.from({ length: count }, (_, i) => turnStart + i);
  }

  // Turns from walking to face you, then takes a sip while looking at you. The sip sound
  // plays as the straw reaches his mouth.
  async function greet() {
    const { sprite } = state;
    await sequence(turnFrames(), TURN_MS);
    if (!state || state.leaving) return;
    setFrame(sprite.frontIdle);
    state.facing = 'front';
    await wait(350);
    if (!state || state.leaving) return;
    const frameMs = (sprite.drinkMs || 1500) / sprite.drinkFrames;
    const soundTimer = setTimeout(() => send('ARRIVED'), frameMs * 2);
    const drink = playFrames(sprite.drinkStart, sprite.drinkFrames, sprite.drinkMs || 1500, 1);
    state.anim = drink;
    await drink.finished.catch(() => clearTimeout(soundTimer));
    if (state && !state.leaving) setFrame(sprite.drinkStart + sprite.drinkFrames - 1); // a smile, bottle lowered
  }

  async function arrive() {
    if (!state) return;
    if (canTurn()) {
      if (state.reduced) {
        setFrame(state.sprite.frontIdle);
        state.facing = 'front';
        send('ARRIVED');
      } else {
        await greet();
      }
    } else {
      setFrame(state.sprite.idle);
      send('ARRIVED'); // plays the sip sound
    }
    if (!state || state.leaving) return;
    state.stage.classList.add('show-ui');
    const bar = state.stage.querySelector('.timer > i');
    bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
      duration: state.autoSnoozeMs,
      easing: 'linear',
      fill: 'forwards',
    });
    state.autoTimer = setTimeout(() => storm('AUTO_SNOOZE'), state.autoSnoozeMs);
  }

  function stopWaiting(message) {
    state.leaving = true;
    clearTimeout(state.autoTimer);
    if (state.anim) state.anim.cancel();
    state.stage.classList.add('answered');
    if (message) send(message);
  }

  function say(text) {
    state.bubble.textContent = text;
    state.bubble.classList.add('say');
  }

  function hush() {
    if (state) state.bubble.classList.remove('say');
  }

  // Faces the buddy left (back the way he came) or right.
  function faceLeft(left) {
    state.buddy.classList.toggle('flip', left);
    state.left = left;
    if (state.angerOn) placeAnger();
  }

  // The anger mark sits over his head; where depends on which way he faces.
  function placeAnger() {
    const { sprite, scale, anger } = state;
    const spot = sprite.anger || {};
    let [x, y] = (state.facing === 'front' ? spot.front : spot.side) || [sprite.frameWidth * 0.72, sprite.frameHeight * 0.06];
    if (state.left && state.facing !== 'front') x = sprite.frameWidth - x;
    const size = ANGER_SIZE * state.angerScale;
    anger.style.width = `${size}px`;
    anger.style.height = `${size}px`;
    anger.style.left = `${Math.round(x * scale - size / 2)}px`;
    anger.style.top = `${Math.round(y * scale - size / 2)}px`;
  }

  function showAnger() {
    if (!state.anger.src) return;
    state.angerOn = true;
    placeAnger();
    state.anger
      .animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.4)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' })
      .finished.then(() => state && state.anger.classList.add('on'));
  }

  function shake() {
    state.body.animate(
      [0, -3, 3, -3, 3, -2, 2, 0].map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? 1 : 0}px)` })),
      { duration: 560, easing: 'linear' }
    );
  }

  function hop() {
    state.body.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-18px)', offset: 0.4 },
        { transform: 'translateY(0)', offset: 0.8 },
        { transform: 'translateY(0)' },
      ],
      { duration: 500, easing: 'ease-out' }
    );
  }

  // Turns from facing you to side view, then walks off the left or right edge.
  async function walkOff(left) {
    if (!state) return;
    if (state.reduced) {
      fadeOut();
      return;
    }
    faceLeft(left);
    if (state.facing === 'front') {
      await sequence(turnFrames().reverse(), TURN_MS);
      if (!state) return;
      state.facing = 'side';
      if (state.angerOn) placeAnger();
    }
    setFrame(state.sprite.idle);
    const endX = left ? -state.stageWidth - 24 : window.innerWidth + 24;
    const steps = Math.max(2, Math.ceil(Math.abs(endX - state.x) / state.stride / 2) * 2);
    walk(state.x, endX, steps, EXIT_STEP_MS).then(remove);
  }

  // Snooze, or ignored until the auto-snooze: he gets angry, turns his back on you and stomps off
  // back the way he came.
  async function storm(message) {
    if (!state || state.leaving) return;
    stopWaiting(message);
    const { sprite } = state;
    const back = `Back in ${state.snoozeMin} min.`;
    say(message === 'AUTO_SNOOZE' ? `You ignored me! ${back}` : `Hmph. ${back}`);
    showAnger();
    if (state.facing === 'front' && sprite.angryStart != null) {
      const a = sprite.angryStart;
      const b = a + Math.max(0, (sprite.angryFrames || 1) - 1);
      if (!state.reduced) shake();
      await sequence([a, b, a, b, a], 240);
    } else {
      if (!state.reduced) shake();
      await wait(1000);
    }
    if (!state) return;
    if (state.reduced) await wait(600);
    hush();
    walkOff(true);
  }

  // Sip: he raises the bottle to you, hops, and walks on.
  async function sip() {
    if (!state || state.leaving) return;
    stopWaiting('SIP');
    const { sprite } = state;
    say('Cheers!');
    if (sprite.cheers != null && state.facing === 'front') {
      setFrame(sprite.cheers);
      if (!state.reduced) hop();
      await wait(state.reduced ? 1200 : 900);
    } else {
      // single-image sheets: one more sip, then the hop
      const drink = playFrames(sprite.drinkStart, sprite.drinkFrames, sprite.drinkMs || 1500, 1);
      await drink.finished;
      if (!state) return;
      setFrame(sprite.idle);
      if (!state.reduced) hop();
      await wait(500);
    }
    hush();
    walkOff(false);
  }

  // Closed by the service worker (answered from the notification, or the backstop alarm).
  function dismiss() {
    if (!state || state.leaving) return;
    stopWaiting(null);
    walkOff(false);
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
    const { sprite, anger: angerUrl, snoozeMin, autoSnoozeMs, demo } = config;

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

    const body = document.createElement('div');
    body.className = 'body';
    const buddy = document.createElement('div');
    buddy.className = 'buddy';
    buddy.style.width = `${w}px`;
    buddy.style.height = `${h}px`;
    buddy.style.backgroundImage = `url("${sprite.dataUrl}")`;
    buddy.style.backgroundSize = `${w * sprite.total}px ${h}px`;
    const anger = document.createElement('img');
    anger.className = 'anger';
    anger.alt = '';
    if (angerUrl) anger.src = angerUrl;
    body.append(buddy, anger);

    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    const sipBtn = document.createElement('button');
    sipBtn.className = 'sip';
    sipBtn.type = 'button';
    sipBtn.textContent = 'Sip';
    const snoozeBtn = document.createElement('button');
    snoozeBtn.className = 'snooze';
    snoozeBtn.type = 'button';
    snoozeBtn.textContent = snoozeMin ? `Snooze ${snoozeMin} min` : 'Snooze';
    buttons.append(sipBtn, snoozeBtn);

    const timer = document.createElement('div');
    timer.className = 'timer';
    timer.appendChild(document.createElement('i'));

    stage.append(bubble, body, buttons, timer);
    root.appendChild(stage);
    (document.body || document.documentElement).appendChild(host);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stageWidth = Math.max(w, stage.offsetWidth);
    const startX = -stageWidth;
    // Move exactly one stride per step so the planted foot doesn't slide.
    const natural = sprite.stride ? startX + STEPS * sprite.stride * scale : null;
    const fallback = Math.round(window.innerWidth * STOP_AT - stageWidth / 2);
    const stopX = Math.round(Math.max(8, Math.min(natural ?? fallback, window.innerWidth - stageWidth - 8)));

    state = {
      host, stage, bubble, body, buddy, anger, sprite, w, h, scale, reduced, stageWidth,
      angerScale: scale >= 1 ? scale : Math.max(1, h / 60),
      angerOn: false,
      left: false,
      snoozeMin: snoozeMin || 3,
      autoSnoozeMs: autoSnoozeMs || 60000,
      demo: Boolean(demo),
      stride: (stopX - startX) / STEPS,
      x: startX,
      facing: 'side',
      leaving: false,
      autoTimer: null,
      anim: null,
    };

    sipBtn.addEventListener('click', sip);
    snoozeBtn.addEventListener('click', () => storm('SNOOZE'));
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
    dismiss,
  };
})();
