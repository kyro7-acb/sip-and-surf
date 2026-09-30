// Loads the character's sprite sheet.
//
// If assets/character-sheet.json exists (written by tools/make_character.py), its hand-made
// sheet is used: a side-view walk cycle, a turn to face you, and a sip through the straw.
// Otherwise the whole sheet is built at runtime from ONE image, assets/character-sprite.png.
//
// Runtime-built sheets:
// The character art stays exactly as drawn; each frame only moves, tilts or squashes it,
// which reads as walking and drinking at pixel-art sizes.
//
// Sheet layout, one row, left to right:
//   frame 0        idle (standing still)
//   frames 1-4     walk cycle (2 steps per cycle)
//   frames 5-10    drink (tilts back to sip from the bottle, then comes back up)

export const SHEET = {
  idle: 0,
  walkStart: 1,
  walkFrames: 4,
  drinkStart: 5,
  drinkFrames: 6,
  total: 11,
};

// Pose per frame: dy = lift as a share of height, rot = degrees around the feet,
// sx / sy = squash and stretch, skew = lean of the legs as a share of width.
const POSES = [
  { dy: 0, rot: 0, sx: 1, sy: 1, skew: 0 }, // idle
  // walk: contact, passing, contact (other foot), passing
  { dy: 0, rot: -4, sx: 1.03, sy: 0.97, skew: 0.06 },
  { dy: 0.05, rot: 0, sx: 0.98, sy: 1.02, skew: 0 },
  { dy: 0, rot: 4, sx: 1.03, sy: 0.97, skew: -0.06 },
  { dy: 0.05, rot: 0, sx: 0.98, sy: 1.02, skew: 0 },
  // drink: lean back, bottle up, hold, come back
  { dy: 0, rot: -6, sx: 1, sy: 1, skew: 0 },
  { dy: 0.02, rot: -12, sx: 1, sy: 1.01, skew: 0 },
  { dy: 0.03, rot: -18, sx: 1, sy: 1.02, skew: 0 },
  { dy: 0.03, rot: -18, sx: 1.02, sy: 1, skew: 0 },
  { dy: 0.02, rot: -10, sx: 1, sy: 1, skew: 0 },
  { dy: 0, rot: -3, sx: 1, sy: 1, skew: 0 },
];

// Droplet positions per drink frame, as shares of the image size (from the feet line, above the head).
const DROPS = [null, [[0.1, 0.02]], [[0.05, 0.06], [0.2, 0.02]], [[0.12, 0.08], [0.25, 0.03]], [[0.18, 0.05]], null];

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Returns { dataUrl, frameWidth, frameHeight, ...SHEET }. Works in the service worker
// (OffscreenCanvas) and in extension pages.
export async function buildSpriteSheet(imageUrl) {
  const res = await fetch(imageUrl);
  const bitmap = await createImageBitmap(await res.blob());
  const w = bitmap.width;
  const h = bitmap.height;
  // Room for tilting and bobbing without clipping.
  const frameWidth = Math.ceil(w * 1.4);
  const frameHeight = Math.ceil(h * 1.15);
  const canvas = new OffscreenCanvas(frameWidth * SHEET.total, frameHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  POSES.forEach((p, i) => {
    const footX = i * frameWidth + frameWidth / 2;
    const footY = frameHeight - 1;
    ctx.save();
    ctx.translate(footX, footY - p.dy * h);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.transform(1, 0, p.skew, 1, 0, 0);
    ctx.scale(p.sx, p.sy);
    ctx.drawImage(bitmap, -w / 2, -h);
    ctx.restore();
    // A few pixel droplets while the bottle is tipped up, so the sip reads clearly.
    const drops = DROPS[i - SHEET.drinkStart];
    if (drops) {
      const px = Math.max(1, Math.round(h / 32));
      ctx.fillStyle = '#36b3f0';
      for (const [dx, dy] of drops) {
        ctx.fillRect(Math.round(footX + dx * w), Math.round(footY - h - dy * h), px, px * 2);
      }
    }
  });

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = `data:image/png;base64,${toBase64(await blob.arrayBuffer())}`;
  return { dataUrl, frameWidth, frameHeight, drinkMs: 1500, ...SHEET };
}

async function loadPrebuiltSheet(getUrl) {
  let meta;
  try {
    const res = await fetch(getUrl('assets/character-sheet.json'));
    if (!res.ok) return null;
    meta = await res.json();
  } catch (_) {
    return null; // no prebuilt sheet shipped
  }
  const img = await fetch(getUrl(meta.image));
  const dataUrl = `data:image/png;base64,${toBase64(await img.arrayBuffer())}`;
  return { drinkMs: 1500, ...meta, dataUrl };
}

// getUrl maps a path inside the extension to a URL, e.g. chrome.runtime.getURL.
export async function loadSprite(getUrl) {
  return (await loadPrebuiltSheet(getUrl)) || buildSpriteSheet(getUrl('assets/character-sprite.png'));
}
