export type ContentBlockType =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'paragraph';

export type ContentBlock = {
  type: ContentBlockType;
  content: string;
};

type PlaceholderContentOptions = {
  seed?: number;
  topic?: string;
  minSections?: number;
  maxSections?: number;
  minParagraphsPerSection?: number;
  maxParagraphsPerSection?: number;
};

const LOREM_WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'in',
  'reprehenderit',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'fugiat',
  'nulla',
  'pariatur',
  'excepteur',
  'sint',
  'occaecat',
  'cupidatat',
  'non',
  'proident',
  'sunt',
  'culpa',
  'qui',
  'officia',
  'deserunt',
  'mollit',
  'anim',
  'id',
  'est',
  'laborum',
  'perspiciatis',
  'unde',
  'omnis',
  'iste',
  'natus',
  'error',
  'voluptatem',
  'accusantium',
  'doloremque',
  'laudantium',
  'totam',
  'rem',
  'aperiam',
  'eaque',
  'ipsa',
  'quae',
  'ab',
  'illo',
  'inventore',
  'veritatis',
  'quasi',
  'architecto',
  'beatae',
  'vitae',
  'dicta',
  'explicabo',
  'nemo',
  'ipsam',
  'quia',
  'voluptas',
  'aspernatur',
  'aut',
  'odit',
  'fugit',
  'consequuntur',
  'magni',
  'dolores',
  'eos',
  'ratione',
  'sequi',
  'nesciunt',
  'neque',
  'porro',
  'quisquam',
  'nihil',
  'numquam',
  'corporis',
  'suscipit',
  'laboriosam',
  'minima',
  'eligendi',
  'optio',
  'cumque',
  'impedit',
  'quo',
  'minus',
  'quod',
  'maxime',
  'placeat',
  'facere',
  'possimus',
  'assumenda',
];

const HEADING_TEMPLATES = {
  h1: [
    'Introduction to {topic}',
    'Understanding {topic}',
    'Getting Started with {topic}',
    'Mastering {topic}',
    'The Fundamentals of {topic}',
  ],
  h2: [
    'Key Concepts',
    'Core Principles',
    'Practical Applications',
    'Best Practices',
    'Common Patterns',
    'Implementation Details',
    'Advanced Techniques',
    'Troubleshooting',
  ],
  h3: [
    'Overview',
    'Step-by-Step Guide',
    'Example Usage',
    'Important Notes',
    'Quick Reference',
    'Summary',
  ],
};

function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickRandom<T>(random: () => number, arr: T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateSentence(
  random: () => number,
  minWords: number = 8,
  maxWords: number = 20,
): string {
  const wordCount = randomInt(random, minWords, maxWords);
  const words: string[] = [];

  for (let i = 0; i < wordCount; i++) {
    words.push(pickRandom(random, LOREM_WORDS));
  }

  return `${capitalize(words.join(' '))}.`;
}

function generateParagraph(
  random: () => number,
  minSentences: number = 3,
  maxSentences: number = 6,
): string {
  const sentenceCount = randomInt(random, minSentences, maxSentences);
  const sentences: string[] = [];

  for (let i = 0; i < sentenceCount; i++) {
    sentences.push(generateSentence(random));
  }

  return sentences.join(' ');
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function generatePlaceholderContent(
  options: PlaceholderContentOptions = {},
): ContentBlock[] {
  const {
    seed = Date.now(),
    topic = 'this topic',
    minSections = 2,
    maxSections = 4,
    minParagraphsPerSection = 1,
    maxParagraphsPerSection = 3,
  } = options;

  const random = createSeededRandom(seed);
  const blocks: ContentBlock[] = [];

  const h1Template = pickRandom(random, HEADING_TEMPLATES.h1);
  blocks.push({
    type: 'heading1',
    content: h1Template.replace('{topic}', topic),
  });

  blocks.push({
    type: 'paragraph',
    content: generateParagraph(random, 3, 5),
  });

  const sectionCount = randomInt(random, minSections, maxSections);
  const usedH2Headings = new Set<string>();

  for (let i = 0; i < sectionCount; i++) {
    let h2Heading: string;
    do {
      h2Heading = pickRandom(random, HEADING_TEMPLATES.h2);
    } while (
      usedH2Headings.has(h2Heading) &&
      usedH2Headings.size < HEADING_TEMPLATES.h2.length
    );
    usedH2Headings.add(h2Heading);

    blocks.push({
      type: 'heading2',
      content: h2Heading,
    });

    const paragraphCount = randomInt(
      random,
      minParagraphsPerSection,
      maxParagraphsPerSection,
    );
    for (let j = 0; j < paragraphCount; j++) {
      blocks.push({
        type: 'paragraph',
        content: generateParagraph(random),
      });
    }

    if (random() > 0.5) {
      blocks.push({
        type: 'heading3',
        content: pickRandom(random, HEADING_TEMPLATES.h3),
      });
      blocks.push({
        type: 'paragraph',
        content: generateParagraph(random, 2, 4),
      });
    }
  }

  return blocks;
}
