// The characters that come with Sip and Surf. Sheets are drawn by tools/make_character.py into
// assets/characters/<id>.png and .json. Custom buddies (lib/buddies.js) are added to these.
export const CHARACTERS = [
  { id: 'gojo', name: 'Gojo', line: 'Blindfolded, and he still sees you skipping water.' },
  { id: 'spiderman', name: 'Spider-Man', line: 'Mask rolled up. Your friendly neighbourhood sip reminder.' },
];

export const DEFAULT_CHARACTER = CHARACTERS[0].id;

export function builtInCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}
