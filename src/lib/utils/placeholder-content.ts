/**
 * Placeholder content generator for lesson content.
 * Generates formatted lorem ipsum text with headings and paragraphs
 * to simulate AI-generated learning material.
 */

// Lorem ipsum word pool for generating random text
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

// Heading templates for different sections
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

/**
 * Seeded random number generator for deterministic output.
 * Uses a simple linear congruential generator (LCG).
 */
function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Generates a random integer between min and max (inclusive).
 */
function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/**
 * Picks a random element from an array.
 */
function pickRandom<T>(random: () => number, arr: T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generates a sentence with random words.
 */
function generateSentence(
  random: () => number,
  minWords: number = 8,
  maxWords: number = 20
): string {
  const wordCount = randomInt(random, minWords, maxWords);
  const words: string[] = [];

  for (let i = 0; i < wordCount; i++) {
    words.push(pickRandom(random, LOREM_WORDS));
  }

  return capitalize(words.join(' ')) + '.';
}

/**
 * Generates a paragraph with multiple sentences.
 */
function generateParagraph(
  random: () => number,
  minSentences: number = 3,
  maxSentences: number = 6
): string {
  const sentenceCount = randomInt(random, minSentences, maxSentences);
  const sentences: string[] = [];

  for (let i = 0; i < sentenceCount; i++) {
    sentences.push(generateSentence(random));
  }

  return sentences.join(' ');
}

/**
 * Content block types for structured content.
 */
export type ContentBlockType =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'paragraph';

export interface ContentBlock {
  type: ContentBlockType;
  content: string;
}

export interface PlaceholderContentOptions {
  /** Seed for deterministic random generation (e.g., task ID hash) */
  seed?: number;
  /** Topic name to include in headings */
  topic?: string;
  /** Minimum number of sections (heading + paragraphs) */
  minSections?: number;
  /** Maximum number of sections */
  maxSections?: number;
  /** Minimum paragraphs per section */
  minParagraphsPerSection?: number;
  /** Maximum paragraphs per section */
  maxParagraphsPerSection?: number;
}

/**
 * Generates a simple numeric hash from a string.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generates structured placeholder content with headings and paragraphs.
 * Output is deterministic when given the same seed.
 */
export function generatePlaceholderContent(
  options: PlaceholderContentOptions = {}
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

  // Generate main heading (H1)
  const h1Template = pickRandom(random, HEADING_TEMPLATES.h1);
  blocks.push({
    type: 'heading1',
    content: h1Template.replace('{topic}', topic),
  });

  // Add intro paragraph
  blocks.push({
    type: 'paragraph',
    content: generateParagraph(random, 3, 5),
  });

  // Generate sections
  const sectionCount = randomInt(random, minSections, maxSections);
  const usedH2Headings = new Set<string>();

  for (let i = 0; i < sectionCount; i++) {
    // H2 heading for section
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

    // Paragraphs for this section
    const paragraphCount = randomInt(
      random,
      minParagraphsPerSection,
      maxParagraphsPerSection
    );
    for (let j = 0; j < paragraphCount; j++) {
      blocks.push({
        type: 'paragraph',
        content: generateParagraph(random),
      });
    }

    // Optionally add H3 subsection
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

/**
 * Renders placeholder content blocks as HTML string.
 * Useful for direct insertion into components.
 */
export function renderPlaceholderContentAsHTML(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading1':
          return `<h1>${block.content}</h1>`;
        case 'heading2':
          return `<h2>${block.content}</h2>`;
        case 'heading3':
          return `<h3>${block.content}</h3>`;
        case 'paragraph':
          return `<p>${block.content}</p>`;
        default:
          return '';
      }
    })
    .join('\n');
}
