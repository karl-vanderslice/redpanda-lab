export const sports = [
  { id: 'basketball', name: 'Basketball', unit: 'points', increments: [1, 2, 3] },
  { id: 'hockey', name: 'Ice hockey', unit: 'goals', increments: [1] },
  { id: 'soccer', name: 'Soccer', unit: 'goals', increments: [1] },
  { id: 'football', name: 'Football', unit: 'points', increments: [1, 2, 3, 6] },
];
export const fixtures = [
  { id: 'elmreach-court', sport: 'basketball', home: 'Elmreach Surveyors', away: 'Morrowbank Pylons', reference: 'Fictional Crosswater Assembly · Court series', stage: 'Quarter 2', venue: 'Alderstep Hall', homeScore: 24, awayScore: 22, headline: 'Second-quarter court desk at Alderstep.' },
  { id: 'rillgate-court', sport: 'basketball', home: 'Rillgate Arcs', away: 'Oxbend Kilns', reference: 'Fictional Crosswater Assembly · Court series', stage: 'Quarter 4', venue: 'Rillgate Exchange', homeScore: 68, awayScore: 70, headline: 'Fourth-quarter score desk from Rillgate.' },
  { id: 'bracken-rink', sport: 'hockey', home: 'Bracken Quays', away: 'Harthwick Bearings', reference: 'Fictional Crosswater Assembly · Ice series', stage: 'Period 3', venue: 'Bracken Icehouse', homeScore: 2, awayScore: 2, headline: 'Third-period ice desk from Bracken.' },
  { id: 'ternwick-pitch', sport: 'soccer', home: 'Ternwick Weavers', away: 'Larchmere Posts', reference: 'Fictional Crosswater Assembly · Pitch series', stage: 'Second half', venue: 'Ternwick Common', homeScore: 1, awayScore: 0, headline: 'Second-half pitch desk at Ternwick.' },
  { id: 'elmreach-gridiron', sport: 'football', home: 'Elmreach Surveyors', away: 'Flintwash Switches', reference: 'Fictional Crosswater Assembly · Field series', stage: 'Quarter 3', venue: 'Elmreach Yard', homeScore: 14, awayScore: 10, headline: 'Third-quarter field desk at Elmreach Yard.' },
].map((fixture) => ({ ...fixture, revision: 0, media: `/media/${fixture.sport}.mp4` }));
