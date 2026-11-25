export type QuoteCategory = 'study' | 'growth' | 'workout';

export interface MotivationalQuote {
  id: string;
  text: string;
  author?: string;
  category: QuoteCategory;
}

export const MOTIVATIONAL_QUOTES: MotivationalQuote[] = [
  // --- STUDY QUOTES (Intellectual rigor, deep focus, ICSE exam mastery) ---
  {
    id: 's-01',
    category: 'study',
    text: 'Close every tab. Open the book. Win the hour.',
  },
  {
    id: 's-02',
    category: 'study',
    text: 'One solved problem with full focus beats four hours of divided attention.',
  },
  {
    id: 's-03',
    category: 'study',
    text: 'The marks you get on exam day are earned in the silence of tonight.',
  },
  {
    id: 's-04',
    category: 'study',
    text: 'Study when nobody is watching. Master the fundamentals until they are second nature.',
  },
  {
    id: 's-05',
    category: 'study',
    text: 'Discipline is opening the hardest textbook first.',
  },
  {
    id: 's-06',
    category: 'study',
    text: 'The question paper tests precision. Train your precision every single day.',
  },
  {
    id: 's-07',
    category: 'study',
    text: 'Clarity comes from finishing the chapter, not worrying about the syllabus.',
  },
  {
    id: 's-08',
    category: 'study',
    text: 'Mistakes recorded in your notebook today will save marks on exam morning.',
  },
  {
    id: 's-09',
    category: 'study',
    text: 'A focused hour cannot be bought back later. Guard it with your life.',
  },
  {
    id: 's-10',
    category: 'study',
    text: 'Do not stop when you are tired. Stop when the session is complete.',
  },
  {
    id: 's-11',
    category: 'study',
    text: 'Knowledge compounds like interest. Deposit your hours daily.',
  },
  {
    id: 's-12',
    category: 'study',
    text: 'Read the question carefully — half of ICSE marks live in precision.',
  },
  {
    id: 's-13',
    category: 'study',
    text: 'Quiet consistency beats frantic cramming every single evening.',
  },
  {
    id: 's-14',
    category: 'study',
    text: 'Your future rank is built in the silence between 9 PM and midnight.',
  },
  {
    id: 's-15',
    category: 'study',
    text: 'Conquer the first five minutes of mental friction, and deep focus will follow.',
  },
  {
    id: 's-16',
    category: 'study',
    text: 'Silence the noise. Your competition is preparing right now.',
  },
  {
    id: 's-17',
    category: 'study',
    text: 'Master one difficult topic today, and your entire week changes.',
  },
  {
    id: 's-18',
    category: 'study',
    text: 'Deep work is a rare superpower. Turn off notifications and claim it.',
  },
  {
    id: 's-19',
    category: 'study',
    text: 'An unread page teaches nothing. Open the book and take notes.',
  },
  {
    id: 's-20',
    category: 'study',
    text: 'Excellence in ICSE is not luck; it is relentless, deliberate revision.',
  },

  // --- GROWTH QUOTES (Self-mastery, stoic discipline, habits, resilience) ---
  {
    id: 'g-01',
    category: 'growth',
    text: 'Standards over moods. Always.',
  },
  {
    id: 'g-02',
    category: 'growth',
    text: 'Discipline is choosing between what you want now and what you want most.',
    author: 'Abraham Lincoln',
  },
  {
    id: 'g-03',
    category: 'growth',
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
  },
  {
    id: 'g-04',
    category: 'growth',
    text: 'Suffer the pain of discipline or suffer the pain of regret.',
  },
  {
    id: 'g-05',
    category: 'growth',
    text: 'Small daily disciplines repeated without excuse create monumental results.',
  },
  {
    id: 'g-06',
    category: 'growth',
    text: 'Action cures anxiety. Sit down and do the work.',
  },
  {
    id: 'g-07',
    category: 'growth',
    text: 'Comfort is the quiet killer of potential.',
  },
  {
    id: 'g-08',
    category: 'growth',
    text: 'First you make your habits, then your habits make you.',
  },
  {
    id: 'g-09',
    category: 'growth',
    text: 'Consistency is the only superpower that requires zero luck.',
  },
  {
    id: 'g-10',
    category: 'growth',
    text: 'Friction builds the mind. Lean directly into the resistance.',
  },
  {
    id: 'g-11',
    category: 'growth',
    text: 'Your future self will either thank you for tonight or forgive your excuses.',
  },
  {
    id: 'g-12',
    category: 'growth',
    text: 'Quiet consistency beats loud intentions every single time.',
  },
  {
    id: 'g-13',
    category: 'growth',
    text: 'We are what we repeatedly do. Excellence is not an act, but a habit.',
    author: 'Will Durant',
  },
  {
    id: 'g-14',
    category: 'growth',
    text: 'Stop negotiating with your weakness. Execute the plan.',
  },
  {
    id: 'g-15',
    category: 'growth',
    text: 'Do what is hard now so your life is calm later.',
  },
  {
    id: 'g-16',
    category: 'growth',
    text: 'Don’t wish it were easier; make yourself sharper and more focused.',
  },
  {
    id: 'g-17',
    category: 'growth',
    text: 'When you feel like stopping, remember why you started.',
  },
  {
    id: 'g-18',
    category: 'growth',
    text: 'Mastery demands repetition that ordinary minds find boring.',
  },
  {
    id: 'g-19',
    category: 'growth',
    text: 'He who conquers himself is mightier than he who conquers a city.',
  },
  {
    id: 'g-20',
    category: 'growth',
    text: 'Focus on the execution. The outcome will take care of itself.',
  },

  // --- WORKOUT QUOTES (Physical grit, heavy resistance, forging the iron mind) ---
  {
    id: 'w-01',
    category: 'workout',
    text: 'The barbell doesn’t lie. Effort in, strength out.',
  },
  {
    id: 'w-02',
    category: 'workout',
    text: 'Discipline in training builds the mental fortress for your desk.',
  },
  {
    id: 'w-03',
    category: 'workout',
    text: 'Push through the burn. Strength begins where comfort ends.',
  },
  {
    id: 'w-04',
    category: 'workout',
    text: 'Sweat today so you don’t break tomorrow.',
  },
  {
    id: 'w-05',
    category: 'workout',
    text: 'Physical grit produces mental endurance. Train both.',
  },
  {
    id: 'w-06',
    category: 'workout',
    text: 'The heavy weight doesn’t get lighter. You just get stronger.',
  },
  {
    id: 'w-07',
    category: 'workout',
    text: 'Train hard, recover clean, show up again tomorrow.',
  },
  {
    id: 'w-08',
    category: 'workout',
    text: 'Your body can stand almost anything. It’s your mind you have to convince.',
  },
  {
    id: 'w-09',
    category: 'workout',
    text: 'One more rep when you want to quit is where true resilience is forged.',
  },
  {
    id: 'w-10',
    category: 'workout',
    text: 'Iron sharpens iron. Every set is a contract with yourself.',
  },
  {
    id: 'w-11',
    category: 'workout',
    text: 'Don’t count the days. Make the days count.',
    author: 'Muhammad Ali',
  },
  {
    id: 'w-12',
    category: 'workout',
    text: 'Physical exertion clears mental fog. Move with relentless purpose.',
  },
  {
    id: 'w-13',
    category: 'workout',
    text: 'Earn your rest through raw physical effort.',
  },
  {
    id: 'w-14',
    category: 'workout',
    text: 'When the body gets tough, the mind refuses to fold.',
  },
  {
    id: 'w-15',
    category: 'workout',
    text: 'The iron never lies to you. 200 pounds is always 200 pounds.',
    author: 'Henry Rollins',
  },
  {
    id: 'w-16',
    category: 'workout',
    text: 'Discipline in the gym reflects in every exam question you tackle.',
  },
  {
    id: 'w-17',
    category: 'workout',
    text: 'Build a body that can endure the mind’s highest ambitions.',
  },
  {
    id: 'w-18',
    category: 'workout',
    text: 'Pain is temporary. The strength earned lasts forever.',
  },
];

export function getFilteredQuotes(category?: QuoteCategory | 'all'): MotivationalQuote[] {
  if (!category || category === 'all') return MOTIVATIONAL_QUOTES;
  return MOTIVATIONAL_QUOTES.filter((q) => q.category === category);
}

export function getDailyMotivationalQuote(
  dateStr: string,
  category: QuoteCategory | 'all' = 'all'
): MotivationalQuote {
  const pool = getFilteredQuotes(category);
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}

export function getNextMotivationalQuote(
  currentId?: string,
  category: QuoteCategory | 'all' = 'all'
): MotivationalQuote {
  const pool = getFilteredQuotes(category);
  if (pool.length === 0) return MOTIVATIONAL_QUOTES[0];
  if (!currentId) return pool[0];
  const idx = pool.findIndex((q) => q.id === currentId);
  if (idx === -1) return pool[0];
  return pool[(idx + 1) % pool.length];
}

export function getRandomMotivationalQuote(
  excludeId?: string,
  category: QuoteCategory | 'all' = 'all'
): MotivationalQuote {
  const pool = getFilteredQuotes(category);
  if (pool.length <= 1) return pool[0] ?? MOTIVATIONAL_QUOTES[0];
  const candidates = excludeId ? pool.filter((q) => q.id !== excludeId) : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return picked ?? pool[0];
}
