export const sports = [
  { id: 'basketball', name: 'Basketball', unit: 'points', increments: [1, 2, 3] },
  { id: 'hockey', name: 'Ice hockey', unit: 'goals', increments: [1] },
  { id: 'soccer', name: 'Soccer', unit: 'goals', increments: [1] },
  { id: 'football', name: 'Football', unit: 'points', increments: [1, 2, 3, 6] },
];
export const fixtures = [
  { id: 'bud-court', sport: 'basketball', home: 'Timberwolves', away: 'Harbor Comets', reference: 'Air Bud · fictional school-team exhibition', stage: 'Quarter 2', venue: 'Cedar Court', homeScore: 24, awayScore: 22, headline: 'A little heart. A whole new ball game.' },
  { id: 'cosmic-court', sport: 'basketball', home: 'Tune Squad', away: 'Monstars', reference: 'Space Jam · textual fixture reference only', stage: 'Quarter 4', venue: 'Orbit Arena', homeScore: 68, awayScore: 70, headline: 'The cosmic rivalry returns to the scoreboard.' },
  { id: 'ducks-rink', sport: 'hockey', home: 'Mighty Ducks', away: 'Northstar Blades', reference: 'The Mighty Ducks · fictional exhibition', stage: 'Period 3', venue: 'Foundry Rink', homeScore: 2, awayScore: 2, headline: 'One team. One more chance on the ice.' },
  { id: 'bud-pitch', sport: 'soccer', home: 'World Pup XI', away: 'Meadow Rovers', reference: 'Air Bud: World Pup · original exhibition team names', stage: 'Second half', venue: 'Meadow Park', homeScore: 1, awayScore: 0, headline: 'Big dreams on a small-town pitch.' },
  { id: 'bud-gridiron', sport: 'football', home: 'Timberwolves', away: 'Valley Sparks', reference: 'Air Bud: Golden Receiver · fictional school-team exhibition', stage: 'Quarter 3', venue: 'Cedar Field', homeScore: 14, awayScore: 10, headline: 'Every drive has a story.' },
].map((fixture) => ({ ...fixture, revision: 0, media: `/media/${fixture.sport}.mp4` }));
