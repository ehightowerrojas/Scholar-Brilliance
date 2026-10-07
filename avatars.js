// ------------------------------------------------------------------
// Avatar rendering engine.
//
// Species = which character (a collectible, unlocked by submitting
// more scholarship applications).
// Evolution tier = how developed that character looks (1-4), driven
// by the student's existing achievement level — no separate XP
// system, it reuses what's already in the levels table.
// ------------------------------------------------------------------

const AVATAR_SPECIES_ART = {
  raptor: {
    body: [
      '-35,-4 -90,-18 -98,-8 -38,10',
      '-35,-8 -10,-40 20,-36 28,-16 15,10 -15,14',
      '18,-30 30,-48 56,-32 46,-12 20,-14',
      '10,6 26,4 24,28 16,46 6,44 10,26 2,10',
      '-22,8 -6,8 -10,30 -16,48 -26,46 -20,28 -28,10',
      '16,-14 26,-10 22,0 12,-4',
    ],
    eye: { points: '37,-30 40,-34 43,-30 40,-26', color: '#FFC107' },
  },
  longneck: {
    body: [
      '-30,10 -70,20 -78,10 -32,0',
      '-32,4 -24,-18 0,-24 18,-10 14,10 -10,16',
      '10,-16 18,-40 30,-58 40,-56 32,-36 20,-12',
      '34,-58 46,-64 54,-56 44,-48',
      '2,10 16,10 14,32 8,44 -2,42 0,26',
      '-18,8 -4,8 -6,30 -12,44 -22,42 -18,26',
    ],
    eye: { points: '45,-59 48,-63 51,-59 48,-55', color: '#16141F' },
  },
  armored: {
    body: [
      '-28,-2 -58,-10 -68,2 -58,12 -26,8',
      '-68,2 -76,-4 -72,8',
      '-30,-6 -14,-34 18,-32 30,-14 20,12 -14,16',
      '16,-28 26,-40 42,-30 36,-14 18,-14',
      '8,10 24,8 22,30 14,46 4,44 8,26 0,12',
      '-20,12 -4,12 -8,32 -14,48 -24,46 -18,28 -26,14',
    ],
    eye: { points: '29,-25 32,-29 35,-25 32,-21', color: '#FFC107' },
  },
  horned: {
    body: [
      '-30,4 -46,8 -40,-2',
      '-30,0 -20,-20 10,-24 28,-10 24,8 -10,14',
      '18,-22 30,-34 48,-30 52,-18 40,-8 20,-10',
      '34,-32 36,-42 40,-32',
      '46,-20 52,-26 50,-16',
      '10,8 26,6 24,26 16,40 6,38 10,22',
      '-22,10 -6,10 -8,28 -14,42 -24,40 -20,24',
    ],
    eye: { points: '36,-24 39,-28 42,-24 39,-20', color: '#FFC107' },
  },
  plated: {
    body: [
      '-28,6 -60,16 -66,8 -30,-2',
      '-64,10 -72,2 -68,16',
      '-62,16 -70,20 -64,22',
      '-28,4 -16,-22 10,-26 26,-10 18,10 -12,14',
      '18,-8 32,-14 38,-4 24,4',
      '-14,-24 -8,-40 -2,-24',
      '-2,-26 4,-42 8,-24',
      '8,-26 14,-40 18,-22',
      '14,6 28,4 26,24 18,38 8,36 12,20',
      '-18,8 -4,8 -6,26 -12,38 -22,36 -18,22',
    ],
    eye: { points: '27,-8 30,-12 33,-8 30,-4', color: '#FFC107' },
  },
  heavyjaw: {
    body: [
      '-26,-2 -64,-14 -70,-4 -30,10',
      '-26,-6 -6,-36 22,-32 30,-8 16,16 -16,18',
      '18,-34 36,-44 54,-30 48,-10 24,-14',
      '14,-10 20,-8 18,-2 12,-4',
      '6,14 24,12 22,36 14,52 4,50 8,32',
      '-20,16 -4,16 -8,38 -14,52 -24,50 -20,34',
    ],
    eye: { points: '38,-32 41,-36 44,-32 41,-28', color: '#FFC107' },
  },
  flyer: {
    body: [
      '-4,-8 -38,-32 -56,-24 -34,-12 -14,-6',
      '-4,2 -30,20 -44,34 -24,20 -10,8',
      '-10,-6 6,-10 14,2 4,14 -10,10',
      '10,-8 28,-16 34,-8 16,0',
      '-10,4 -26,10 -22,0',
      '2,12 10,12 6,22 0,20',
    ],
    eye: { points: '26,-11 29,-15 32,-11 29,-7', color: '#FFC107' },
  },
  sailback: {
    body: [
      '-26,4 -62,-6 -70,4 -30,14',
      '-26,0 -14,-20 14,-22 26,-6 18,12 -14,16',
      '-10,-20 -4,-56 4,-58 12,-54 14,-22',
      '14,-16 36,-22 50,-14 44,-4 16,-6',
      '8,10 24,8 22,30 14,44 4,42 8,26',
      '-16,12 -2,12 -4,30 -10,44 -20,42 -16,28',
    ],
    eye: { points: '28,-13 31,-17 34,-13 31,-9', color: '#FFC107' },
  },
};

const AVATAR_SPECIES_META = {
  raptor:   { name: 'Raptor',    color: '#C62828', rarity: 'common' },
  longneck: { name: 'Long-neck', color: '#F9A825', rarity: 'common' },
  armored:  { name: 'Armored',   color: '#5E35B1', rarity: 'uncommon' },
  horned:   { name: 'Horned',    color: '#43A047', rarity: 'uncommon' },
  plated:   { name: 'Plated',    color: '#D81B60', rarity: 'rare' },
  heavyjaw: { name: 'Heavy-jaw', color: '#BF5B04', rarity: 'rare' },
  flyer:    { name: 'Flyer',     color: '#F4511E', rarity: 'legendary' },
  sailback: { name: 'Sail-back', color: '#1E88E5', rarity: 'legendary' },
};

// No more frame/circle - the only thing that should visibly change
// across tiers is the creature itself. Each species in
// AVATAR_EVOLUTION_FEATURES defines what new geometry gets added at
// tiers 2, 3 and 4 (tier 1 is just the bare base body) - actual
// horns, spikes, plates, wings or a sail growing in, themed to what
// that species already looks like, not a generic size/color effect.

function evolutionTierFromLevel(levelNumber) {
  if (levelNumber >= 7) return 4;
  if (levelNumber >= 5) return 3;
  if (levelNumber >= 3) return 2;
  return 1;
}

const AVATAR_EVOLUTION_FEATURES = {
  // Spine spikes growing in, back to front.
  raptor: {
    2: [{ points: '-33,-10 -30,-28 -23,-10', fill: 'body' }],
    3: [{ points: '-33,-10 -30,-28 -23,-10', fill: 'body' }, { points: '-19,-34 -16,-52 -9,-34', fill: 'body' }],
    4: [{ points: '-33,-10 -30,-28 -23,-10', fill: 'body' }, { points: '-19,-34 -16,-52 -9,-34', fill: 'body' }, { points: '-1,-36 2,-54 9,-36', fill: 'body' }],
  },
  // A head crest growing taller, plus a neck frill bump at full tier.
  longneck: {
    2: [{ points: '36,-56 40,-68 44,-56', fill: 'body' }],
    3: [{ points: '34,-56 39,-74 44,-56', fill: 'body' }],
    4: [{ points: '34,-56 39,-78 44,-56', fill: 'body' }, { points: '6,-18 14,-30 20,-18', fill: 'body' }],
  },
  // Blocky armor plates stacking up along the back.
  armored: {
    2: [{ points: '-10,-30 -6,-44 2,-38 -2,-26', fill: 'body' }],
    3: [{ points: '-10,-30 -6,-44 2,-38 -2,-26', fill: 'body' }, { points: '4,-30 10,-42 17,-36 12,-24', fill: 'body' }],
    4: [{ points: '-10,-30 -6,-44 2,-38 -2,-26', fill: 'body' }, { points: '4,-30 10,-42 17,-36 12,-24', fill: 'body' }, { points: '-22,-12 -20,-26 -13,-22 -15,-10', fill: 'body' }],
  },
  // The two small built-in horn nubs extend taller, then a third grows in.
  horned: {
    2: [{ points: '33,-32 35,-42 38,-52 40,-42 37,-32', fill: 'body' }],
    3: [{ points: '33,-32 35,-42 38,-52 40,-42 37,-32', fill: 'body' }, { points: '46,-20 50,-28 55,-34 56,-24 50,-16', fill: 'body' }],
    4: [{ points: '33,-32 35,-42 38,-52 40,-42 37,-32', fill: 'body' }, { points: '46,-20 50,-28 55,-34 56,-24 50,-16', fill: 'body' }, { points: '10,-22 12,-32 16,-24', fill: 'body' }],
  },
  // Already-spiky base gets taller spike tips, then an extra spike joins the row.
  plated: {
    2: [{ points: '-13,-23 -9,-38 -5,-23', fill: 'body' }],
    3: [{ points: '-13,-23 -9,-38 -5,-23', fill: 'body' }, { points: '9,-25 14,-40 19,-25', fill: 'body' }],
    4: [{ points: '-13,-23 -9,-38 -5,-23', fill: 'body' }, { points: '9,-25 14,-40 19,-25', fill: 'body' }, { points: '20,-20 26,-30 30,-18', fill: 'body' }],
  },
  // A tusk growing from the heavy jaw, then a second, then they lengthen.
  heavyjaw: {
    2: [{ points: '46,-14 52,-10 44,-6', fill: '#F5F7FA' }],
    3: [{ points: '46,-16 56,-10 44,-4', fill: '#F5F7FA' }, { points: '30,-10 36,-4 28,-2', fill: '#F5F7FA' }],
    4: [{ points: '46,-18 60,-10 44,-2', fill: '#F5F7FA' }, { points: '28,-12 38,-2 26,2', fill: '#F5F7FA' }],
  },
  // The wing gains longer, sharper flight feathers trailing off the tip.
  flyer: {
    2: [{ points: '-50,-26 -68,-30 -52,-18', fill: 'body' }],
    3: [{ points: '-50,-26 -68,-30 -52,-18', fill: 'body' }, { points: '-40,-14 -56,-10 -42,-4', fill: 'body' }],
    4: [{ points: '-50,-26 -72,-32 -52,-18', fill: 'body' }, { points: '-40,-14 -60,-10 -42,-4', fill: 'body' }, { points: '-20,-2 -32,4 -22,8', fill: 'body' }],
  },
  // An actual sail growing up from the back, taller each tier - matches the name directly.
  sailback: {
    2: [{ points: '-14,-20 -6,-38 4,-20', fill: 'body' }],
    3: [{ points: '-18,-18 -8,-48 6,-20', fill: 'body' }],
    4: [{ points: '-22,-16 -9,-58 10,-20', fill: 'body' }],
  },
};

function renderAvatarSVG(speciesId, tier, size) {
  size = size || 64;
  const art = AVATAR_SPECIES_ART[speciesId] || AVATAR_SPECIES_ART.raptor;
  const meta = AVATAR_SPECIES_META[speciesId] || AVATAR_SPECIES_META.raptor;
  const outline = '#16141F';
  const bodyPolys = art.body.map(pts => `<polygon points="${pts}"/>`).join('');

  const featureSet = (AVATAR_EVOLUTION_FEATURES[speciesId] && AVATAR_EVOLUTION_FEATURES[speciesId][tier]) || [];
  const featurePolys = featureSet.map(f =>
    `<polygon points="${f.points}" fill="${f.fill === 'body' ? meta.color : f.fill}" stroke="${outline}" stroke-width="2.5" stroke-linejoin="round"/>`
  ).join('');

  return `<svg viewBox="0 0 180 180" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(90,95) scale(0.85)">
      <g fill="${outline}">${bodyPolys}</g>
      <g fill="${meta.color}" transform="scale(0.94)">${bodyPolys}</g>
      ${featurePolys}
      <polygon points="${art.eye.points}" fill="${art.eye.color}"/>
    </g>
  </svg>`;
}

// Given how many goals a student has fully completed, which species
// are unlocked, and which is the next one to work toward.
function getUnlockedSpecies(completedGoalsCount, allSpecies) {
  return allSpecies.filter(s => completedGoalsCount >= s.unlock_goals_completed);
}
function getNextLockedSpecies(completedGoalsCount, allSpecies) {
  return allSpecies
    .filter(s => completedGoalsCount < s.unlock_goals_completed)
    .sort((a, b) => a.unlock_goals_completed - b.unlock_goals_completed)[0] || null;
}
