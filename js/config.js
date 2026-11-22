// Training plan configuration. Edit this file to change the plan.
window.TRAINING_CONFIG = {
  title: 'Football Training',
  startDate: '2026-11-23', // must be a Monday (YYYY-MM-DD)
  weeks: 4,                // starting length; more weeks can be added in the app
  minPerTheme: 3,          // exercises needed per theme per day

  // A theme with `weeklyTarget: N` isn't needed every day: it's still tracked daily, but it doesn't
  // block a day from completing. Instead N days per week must reach the daily exercise minimum.

  // Football legends shown in the background collage (name + shirt number; drawn as silhouettes).
  collage: [
    { name: 'Ronaldo', number: 7 },
    { name: 'Ronaldinho', number: 10 },
    { name: 'Pelé', number: 10 },
    { name: 'Haaland', number: 9 },
    { name: 'Messi', number: 10 },
    { name: 'Maradona', number: 10 },
    { name: 'Mbappé', number: 10 },
    { name: 'Cruyff', number: 14 },
    { name: 'Zidane', number: 10 },
    { name: 'Beckham', number: 7 },
    { name: 'Henry', number: 14 }
  ],

  // Where progress is saved in GitHub (see README → "Saving progress to GitHub").
  sync: {
    owner: 'Jiri-StudioProbe',
    repo: 'progress-tracker',
    branch: 'progress-data', // created automatically; kept separate so saves don't rebuild the site
    path: 'progress.json'
  },

  themes: [
    {
      id: 'acceleration',
      name: 'Acceleration',
      icon: '⚡',
      color: '#ffb020',
      exercises: [
        { id: 'falling-starts', name: 'Falling starts' },
        { id: 'reaction-sprints', name: 'Reaction sprints' },
        { id: 'change-of-speed-dribbling', name: 'Change of speed dribbling' },
        { id: 'run-on-the-spot', name: 'Run on the spot', detail: '10 min' },
        { id: 'high-knees', name: 'High knees', detail: '5 min' },
        { id: 'butt-kicks', name: 'Kick your bum (butt kicks)', detail: '5 min' },
        { id: 'cone-taps', name: 'Cone taps' }
      ]
    },
    {
      id: 'stamina',
      name: 'Stamina',
      icon: '🫁',
      color: '#38bdf8',
      exercises: [
        { id: 'laps', name: 'Laps' },
        { id: 'slow-running', name: 'Slow running', detail: '10 min' },
        { id: 'squats', name: 'Squats', detail: '3 min' },
        { id: 'lunges', name: 'Lunges', detail: '5 min' }
      ]
    },
    {
      id: 'aggressive',
      name: 'Aggressive play',
      icon: '🔥',
      color: '#ff6b6b',
      weeklyTarget: 3,
      exercises: [
        { id: 'king-of-the-hill', name: 'King of the hill' },
        { id: 'fifty-fifty-race', name: '50/50 race to the ball' },
        { id: 'shielding-practice', name: 'Shielding practice' }
      ]
    },
    {
      id: 'shooting',
      name: 'Shooting',
      icon: '🎯',
      color: '#a78bfa',
      weeklyTarget: 3,
      exercises: [
        { id: 'technique-fundamentals', name: 'Technique fundamentals' },
        { id: 'quick-footwork-approach', name: 'Quick footwork approach' },
        { id: 'touch-and-shoot', name: 'Touch and shoot' },
        { id: 'free-kicks', name: 'Shoot at goal like free kicks' }
      ]
    }
  ]
};
