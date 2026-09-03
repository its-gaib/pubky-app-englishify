import { describe, expect, it } from 'vitest';
import { VRT_FEED_POSTS } from '@/test/fixtures/feed/posts';
import { assessEnglishPost, shouldOfferTranslation } from './assessEnglishPost';

describe('assessEnglishPost', () => {
  it.each([
    'Hello world!',
    'This is a post about a great new protocol.',
    'Thanks for the update — we would love to see more.',
  ])('recognizes ordinary English prose: %s', (content) => {
    expect(assessEnglishPost(content)).toEqual({
      classification: 'english',
      isMeaningful: true,
      shouldOfferTranslation: false,
    });
  });

  it('strips markdown links, handles and code before assessing the prose', () => {
    const content = 'Hello @alice — this is **great**. [Read more](https://example.com) `const hola = 1`';

    expect(assessEnglishPost(content).classification).toBe('english');
    expect(assessEnglishPost(content).shouldOfferTranslation).toBe(false);
  });

  it('does not let a small non-Latin place name outweigh English prose', () => {
    expect(assessEnglishPost('The 東京 conference starts today')).toEqual({
      classification: 'english',
      isMeaningful: true,
      shouldOfferTranslation: false,
    });
  });

  it.each(['こんにちは世界', 'Привет, как дела?', 'مرحبا بالعالم', '你好，世界'])(
    'recognizes meaningful non-Latin text: %s',
    (content) => {
      expect(assessEnglishPost(content)).toEqual({
        classification: 'non-english',
        isMeaningful: true,
        shouldOfferTranslation: true,
      });
    },
  );

  it.each(['Hola mundo', 'Bonjour le monde', 'Guten Morgen', 'Merhaba dünya', 'Xin chào bạn'])(
    'recognizes distinctive common Latin-script foreign markers: %s',
    (content) => {
      expect(assessEnglishPost(content).classification).toBe('non-english');
      expect(assessEnglishPost(content).shouldOfferTranslation).toBe(true);
    },
  );

  it('offers translation for meaningful Latin prose when the language is uncertain', () => {
    const result = assessEnglishPost('Gaur eguraldi ederra izango dugu');

    expect(result.classification).toBe('unknown');
    expect(result.isMeaningful).toBe(true);
    expect(result.shouldOfferTranslation).toBe(true);
    expect(shouldOfferTranslation(result)).toBe(true);
  });

  it.each(['', '👍🚀', 'https://example.com @alice #BTC', 'gm', 'Satoshi Nakamoto'])(
    'does not offer translation for noise or ambiguous short text: %s',
    (content) => {
      expect(assessEnglishPost(content).shouldOfferTranslation).toBe(false);
    },
  );

  it.each([
    'https://youtu.be/NZpobX6MQVA',
    'https://youtu.be/NZpobX6MQVA?t=90',
    'youtu.be/NZpobX6MQVA',
    '[NZpobX6MQVA](https://youtu.be/NZpobX6MQVA)',
    'NZpobX6MQVA',
    'alice@example.com',
    'example.com/some/path',
    '/usr/local/bin/node',
    '#bitcoin #nostr #pubky #web5',
    '550e8400-e29b-41d4-a716-446655440000',
    'BTC/USD 63420.50',
    'npm install typescript',
    '{"endpoint":"development"}',
  ])('does not offer translation for structured non-language content: %s', (content) => {
    expect(assessEnglishPost(content)).toEqual({
      classification: 'unknown',
      isMeaningful: false,
      shouldOfferTranslation: false,
    });
  });

  it.each(['Gaur eguraldi ederra izango dugu', 'Astăzi mergem împreună la munte', 'Habari za asubuhi rafiki yangu'])(
    'still offers translation for unrecognized natural-language prose: %s',
    (content) => {
      expect(assessEnglishPost(content)).toEqual({
        classification: 'unknown',
        isMeaningful: true,
        shouldOfferTranslation: true,
      });
    },
  );

  it('ignores a link while assessing real prose around it', () => {
    expect(assessEnglishPost('Gaur eguraldi ederra izango dugu https://youtu.be/NZpobX6MQVA')).toEqual({
      classification: 'unknown',
      isMeaningful: true,
      shouldOfferTranslation: true,
    });
  });

  it('does not treat a source-code snippet as prose', () => {
    expect(assessEnglishPost('const frobnicator = quux;')).toEqual({
      classification: 'unknown',
      isMeaningful: false,
      shouldOfferTranslation: false,
    });
  });

  it('only samples the first 1,000 characters', () => {
    const englishPrefix = 'This is an English sentence. '.repeat(40);
    const result = assessEnglishPost(`${englishPrefix}こんにちは世界`);

    expect(result.classification).toBe('english');
    expect(result.shouldOfferTranslation).toBe(false);
  });

  it.each(VRT_FEED_POSTS.map((post) => [post.postId, post.details.content] as const))(
    'does not add a translation action to known-English feed fixture %s',
    (_postId, content) => {
      expect(assessEnglishPost(content).shouldOfferTranslation).toBe(false);
    },
  );
});
