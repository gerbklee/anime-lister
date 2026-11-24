// The professional 1–10 scale (the same one critiques, the portfolio review
// and your skill levels use). Lv 8 is the goal.
export const RANKS = ['Unranked', 'Novice', 'Beginner', 'Hobbyist', 'Skilled hobbyist', 'Advanced', 'Semi-pro', 'Commission-ready', 'Industry pro', 'Senior pro', 'Master'];
export const GOAL = 8;
export const rankName = (level) => RANKS[level] ?? 'Unranked';
