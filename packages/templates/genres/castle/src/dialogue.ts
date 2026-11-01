import { DialogueFile } from '@gg/schemas';

/**
 * The talk every castle game ships (content/dialogue.json), until its own story writes it: the hermit kneeling by the
 * start points the way back for the wings, and the candle-keeper by the second altar warns of the headsman and how his
 * cleaver is turned. Each greets the player again once met; the keeper's prayer is a flag a story can read.
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
    { id: 'hermit-again', speaker: 'hermit', lines: ['Still here. The dark is patient, and so am I.'] },
    {
      id: 'keeper-hello',
      speaker: 'candle-keeper',
      lines: ['I keep the candles for those who pass.', 'Past the chasm the Headsman kneels over his cleaver. He waits for anyone who would leave.'],
      choices: [
        { label: 'How is he beaten?', to: 'keeper-how' },
        { label: 'Pray for me.', to: 'keeper-pray', set: { prayed: true } },
      ],
    },
    { id: 'keeper-how', speaker: 'candle-keeper', lines: ['Watch the cleaver rise. Turn it aside as it falls, then strike while he reels.', 'When he roars he is half beaten, and angrier for it.'], set: { 'met-keeper': true } },
    { id: 'keeper-pray', speaker: 'candle-keeper', lines: ['Then go with the light.', 'A candle burns for you now.'], set: { 'met-keeper': true } },
    { id: 'keeper-again', speaker: 'candle-keeper', lines: ['Your candle still burns.'] },
  ],
  starts: [
    { speaker: 'hermit', node: 'hermit-again', when: [{ flag: 'met-hermit', is: true }] },
    { speaker: 'hermit', node: 'hermit-hello' },
    { speaker: 'candle-keeper', node: 'keeper-again', when: [{ flag: 'met-keeper', is: true }] },
    { speaker: 'candle-keeper', node: 'keeper-hello' },
  ],
});
