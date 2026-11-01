import { DialogueFile } from '@gg/schemas';

/**
 * The story every castle game ships (content/dialogue.json), until its own story writes it.
 * - The hermit kneeling by the start points the way back for the wings, and once they are found he tells of the
 *   cracked bell, said to ring for whoever leaves the way open behind them.
 * - The candle-keeper by the second altar warns of the Headsman and how his cleaver is turned, prays for the player,
 *   and asks them to open the old grate under the first altar, shut from below, so the way back is short for those who
 *   wake after them: the quest "The Shut Grate". The grate's shaft climbs from the way out, so the deed is a last climb
 *   before leaving.
 * - What the player did picks the ending: the grate left open, the Headsman slain, or neither (a region too early for
 *   him).
 * Deeds remember the wings found, the Headsman's fall and the grate opened; talks set the rest.
 */
export const DEFAULT_DIALOGUE: DialogueFile = DialogueFile.parse({
  version: 1,
  names: { hermit: 'The Hermit', 'candle-keeper': 'The Candle-Keeper' },
  nodes: [
    {
      id: 'hermit-hello',
      speaker: 'hermit',
      lines: ['Another one wakes in the dark.', 'The way on climbs a wall too tall for you. Turn back first: something waits behind you.'],
      choices: [
        { label: 'Who are you?', to: 'hermit-who' },
        { label: 'What waits?', to: 'hermit-wings' },
      ],
    },
    { id: 'hermit-who', speaker: 'hermit', lines: ['Only a hermit. I came for the bell and stayed for the dark.', 'Rest at the altars. They keep your place when you fall.'], set: { 'met-hermit': true } },
    { id: 'hermit-wings', speaker: 'hermit', lines: ['Wings, of a sort. The dead took them down and forgot them.', 'With them, that tall step is nothing.'], set: { 'met-hermit': true } },
    {
      id: 'hermit-found',
      speaker: 'hermit',
      lines: ['So the dead gave up their wings. Good.', 'The bell above us cracked the night the dark came in.', 'They say it rings again for whoever leaves the way open behind them.'],
      set: { 'met-hermit': true, 'told-hermit': true },
    },
    { id: 'hermit-again', speaker: 'hermit', lines: ['Still here. The dark is patient, and so am I.'] },
    {
      id: 'keeper-hello',
      speaker: 'candle-keeper',
      lines: ['I keep the candles for those who pass.', 'Past the chasm the Headsman kneels over his cleaver. He waits for anyone who would leave.'],
      choices: [
        { label: 'How is he beaten?', to: 'keeper-how' },
        { label: 'Pray for me.', to: 'keeper-pray', set: { prayed: true } },
        { label: 'Who else passes here?', to: 'keeper-grate' },
      ],
    },
    { id: 'keeper-how', speaker: 'candle-keeper', lines: ['Watch the cleaver rise. Turn it aside as it falls, then strike while he reels.', 'When he roars he is half beaten, and angrier for it.'], set: { 'met-keeper': true } },
    { id: 'keeper-pray', speaker: 'candle-keeper', lines: ['Then go with the light.', 'A candle burns for you now.'], set: { 'met-keeper': true } },
    {
      id: 'keeper-grate',
      speaker: 'candle-keeper',
      lines: ['Those who wake after you. The way back is long for them.', 'Under the first altar an old grate was shut from below. Open it as you leave, and their way will be short.'],
      set: { 'met-keeper': true, 'heard-grate': true },
    },
    {
      id: 'keeper-again',
      speaker: 'candle-keeper',
      lines: ['You came back to the light.'],
      choices: [
        { label: 'How is he beaten?', to: 'keeper-how' },
        { label: 'Pray for me.', to: 'keeper-pray', set: { prayed: true }, when: [{ flag: 'prayed', is: false }] },
        { label: 'Who else passes here?', to: 'keeper-grate', when: [{ flag: 'heard-grate', is: false }] },
        { label: 'Farewell.', to: 'keeper-bye' },
      ],
    },
    { id: 'keeper-bye', speaker: 'candle-keeper', lines: ['Go, then. Mind the cleaver.'] },
    { id: 'keeper-open', speaker: 'candle-keeper', lines: ['I heard the old grate fall open below.', 'Someone will find their way back because of you.'] },
    {
      id: 'end-open',
      speaker: 'narrator',
      lines: ['You step out of the castle into a grey dawn.', 'Behind you, under the first altar, the old grate hangs open.', 'The next one to wake in the dark will find the way back short. High above, the cracked bell rings once.'],
    },
    {
      id: 'end-cleaver',
      speaker: 'narrator',
      lines: ['You step out of the castle into a grey dawn.', "Behind you, the Headsman's cleaver rusts where it fell.", 'The grate under the first altar stays shut. The next one to wake will find the way as long as you did.'],
    },
    { id: 'end-dark', speaker: 'narrator', lines: ['You step out of the castle, and the dark closes behind you.', 'Somewhere below, another one wakes.'] },
  ],
  starts: [
    { speaker: 'hermit', node: 'hermit-again', when: [{ flag: 'told-hermit', is: true }] },
    { speaker: 'hermit', node: 'hermit-found', when: [{ flag: 'found-wings', is: true }] },
    { speaker: 'hermit', node: 'hermit-again', when: [{ flag: 'met-hermit', is: true }] },
    { speaker: 'hermit', node: 'hermit-hello' },
    { speaker: 'candle-keeper', node: 'keeper-open', when: [{ flag: 'grate-open', is: true }] },
    { speaker: 'candle-keeper', node: 'keeper-again', when: [{ flag: 'met-keeper', is: true }] },
    { speaker: 'candle-keeper', node: 'keeper-hello' },
  ],
  endings: [
    { id: 'way-left-open', title: 'The Way Left Open', when: [{ flag: 'grate-open', is: true }], node: 'end-open' },
    { id: 'cleaver-rusts', title: 'The Cleaver Rusts', when: [{ flag: 'headsman-slain', is: true }], node: 'end-cleaver' },
    { id: 'long-dark', title: 'The Long Dark', node: 'end-dark' },
  ],
  quests: [{ id: 'shut-grate', title: 'The Shut Grate', start: [{ flag: 'heard-grate', is: true }], done: [{ flag: 'grate-open', is: true }] }],
  deeds: [
    { on: 'pickup', type: 'wings', set: { 'found-wings': true } },
    { on: 'death', type: 'headsman', set: { 'headsman-slain': true } },
    { on: 'custom:door_open', set: { 'grate-open': true } },
  ],
});
