// Six themed worlds. Each one is its own stage: palette, skyline, weather, patrol drones and difficulty.
const D = (n, r0, v, h = 7) => Array.from({length: n}, (_, i) => ({r: r0 + (i % 3) * 4.5 + (i > 2 ? 2 : 0), v: v * (i % 2 ? -1 : 1) * (1 + (i % 3) * 0.12), h: h + (i % 2) * 2, phase: i * 2.1}));

export const WORLDS = [
  {
    id: 0, name: 'רובע הניאון', en: 'NEON DISTRICT', blurb: 'העיר שבה הכול מתחיל. מקום טוב להתחמם, אבל רחפן אחד כבר מסיירים.',
    c1: 0x00f0ff, c2: 0xff2bd6, c3: 0x7a5cff, bg: 0x02030a, fog: 0x040616, sunTop: 0xff1f8c, sunBot: 0xffb81f,
    style: 'towers', weather: 'none', nodes: 5, lvBonus: 0, timeMul: 1, heatMul: 1, drones: D(1, 20, 0.30), boss: false,
    boards: ['NEXUS', 'ネオン', 'GHOST', 'サイバー', 'HACK//IT', 'ΩMEGA', 'סייבר', '24/7 OPEN']
  },
  {
    id: 1, name: 'מפעל הארגמן', en: 'CRIMSON FOUNDRY', blurb: 'מפעל רובוטים בוער. גחלים באוויר, 2 רחפנים, והזמן קצר יותר.',
    c1: 0xff6a2b, c2: 0xffc02b, c3: 0xff2b4a, bg: 0x0a0302, fog: 0x1a0805, sunTop: 0xff3b1f, sunBot: 0xffd23a,
    style: 'stacks', weather: 'embers', nodes: 6, lvBonus: 1, timeMul: 0.92, heatMul: 1.15, drones: D(2, 17, 0.36), boss: false,
    boards: ['FORGE', 'מתכת', 'IRON//9', 'BLAST', 'ארגמן', 'SMELT', 'HEAT', 'GEAR']
  },
  {
    id: 2, name: 'ביצת הרעל', en: 'TOXIC MARSH', blurb: 'ערפל ירוק, בצורות זוהרות ושלושה רחפנים. אל תיגע בקרניים.',
    c1: 0x39ff88, c2: 0xd6ff3a, c3: 0x00f0ff, bg: 0x010a05, fog: 0x03160a, sunTop: 0x7dff3a, sunBot: 0xf0ff5a,
    style: 'spires', weather: 'spores', nodes: 6, lvBonus: 2, timeMul: 0.88, heatMul: 1.25, drones: D(3, 15, 0.42), boss: false,
    boards: ['BIO-7', 'ספורה', 'TOXIN', 'LAB//X', 'ירוק', 'MUTATE', 'ALGAE', 'FUNGI']
  },
  {
    id: 3, name: 'מערך הקרח', en: 'FROST ARRAY', blurb: 'גבישי קרח, שלג וחידות קשות. הרחפנים כאן מהירים.',
    c1: 0x7dd3ff, c2: 0xe6f4ff, c3: 0x7a5cff, bg: 0x02060f, fog: 0x07122a, sunTop: 0x9ad8ff, sunBot: 0xffffff,
    style: 'crystals', weather: 'snow', nodes: 7, lvBonus: 3, timeMul: 0.84, heatMul: 1.35, drones: D(3, 14, 0.55), boss: false,
    boards: ['CRYO', 'קרח', 'FROST', 'ARCTIC', 'שלג', 'ZERO K', 'GLACIER', 'ICE//9']
  },
  {
    id: 4, name: 'מצודת הריק', en: 'VOID CITADEL', blurb: 'גשם סגול, אובליסקים אפלים, 4 רחפנים. כאן כבר צריך מיומנות.',
    c1: 0xb48cff, c2: 0xff2bd6, c3: 0x3a2bff, bg: 0x030008, fog: 0x0a0318, sunTop: 0x6a1fff, sunBot: 0xff2bd6,
    style: 'obelisks', weather: 'rain', nodes: 7, lvBonus: 4, timeMul: 0.8, heatMul: 1.5, drones: D(4, 13, 0.6), boss: false,
    boards: ['VOID', 'ריק', 'NULL', 'ABYSS', 'סוף', 'ΣΩ', 'DARK', 'ECHO']
  },
  {
    id: 5, name: 'ליבת השמש', en: 'SOLAR CORE', blurb: 'העולם האחרון. 5 רחפנים ובוס בן שלוש חידות ברצף.',
    c1: 0xffd23a, c2: 0xffffff, c3: 0xff7a1f, bg: 0x0a0602, fog: 0x1d1204, sunTop: 0xffffff, sunBot: 0xffb000,
    style: 'mixed', weather: 'embers', nodes: 8, lvBonus: 5, timeMul: 0.76, heatMul: 1.65, drones: D(5, 12, 0.68), boss: true,
    boards: ['SOL', 'שמש', 'CORE', 'FUSION', 'זהב', 'NOVA', 'PRISM', 'ΩΩΩ']
  }
];
