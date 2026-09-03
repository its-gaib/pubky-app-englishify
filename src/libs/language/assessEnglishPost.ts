export type EnglishPostClassification = 'english' | 'non-english' | 'unknown';

export interface EnglishPostAssessment {
  /** Best-effort local classification. This is deliberately not presented as language identification. */
  classification: EnglishPostClassification;
  /** Whether the post contains enough natural-language text to make translation useful. */
  isMeaningful: boolean;
  /** UI policy: offer translation for known non-English or meaningful unknown prose. */
  shouldOfferTranslation: boolean;
}

const ASSESSMENT_SAMPLE_MAX_CHARS = 1_000;

const STRONG_NON_LATIN_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Armenian}\p{Script=Bengali}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Ethiopic}\p{Script=Georgian}\p{Script=Greek}\p{Script=Gujarati}\p{Script=Gurmukhi}\p{Script=Han}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Hiragana}\p{Script=Kannada}\p{Script=Katakana}\p{Script=Khmer}\p{Script=Lao}\p{Script=Malayalam}\p{Script=Myanmar}\p{Script=Oriya}\p{Script=Sinhala}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Thai}]/u;

// Function words, pronouns and a few common social-post words are much stronger
// evidence than arbitrary dictionary words and keep this heuristic compact.
const STRONG_ENGLISH_MARKERS = new Set([
  'and',
  'are',
  'because',
  'but',
  'can',
  'could',
  'did',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'hello',
  'how',
  'into',
  'is',
  'not',
  'our',
  'please',
  'should',
  'than',
  'that',
  'the',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'those',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

const WEAK_ENGLISH_MARKERS = new Set([
  'again',
  'good',
  'great',
  'here',
  'know',
  'like',
  'love',
  'made',
  'make',
  'more',
  'need',
  'new',
  'now',
  'people',
  'post',
  'really',
  'see',
  'thank',
  'thanks',
  'think',
  'today',
  'tomorrow',
  'very',
  'want',
  'world',
  'yesterday',
]);

// These are intentionally distinctive, high-frequency markers rather than a
// pretend-complete dictionary. Unknown but meaningful Latin prose is handled by
// the separate UI policy below, avoiding false negatives for unlisted languages.
const DISTINCTIVE_FOREIGN_MARKERS = new Set([
  // Spanish
  'buenas',
  'buenos',
  'como',
  'días',
  'dias',
  'esto',
  'gracias',
  'hola',
  'mundo',
  'para',
  'pero',
  'quiero',
  // French
  'avec',
  'bonjour',
  'ceci',
  'merci',
  'monde',
  'nous',
  'pour',
  'vous',
  // German
  'danke',
  'guten',
  'hallo',
  'morgen',
  'nicht',
  'sind',
  'und',
  'welt',
  // Italian
  'buongiorno',
  'ciao',
  'grazie',
  'questo',
  'sono',
  // Portuguese
  'muito',
  'não',
  'nao',
  'obrigada',
  'obrigado',
  'olá',
  'ola',
  // Dutch and Scandinavian languages
  'bedankt',
  'goed',
  'wereld',
  'inte',
  'ikke',
  'jeg',
  'och',
  'tack',
  'verden',
  // Polish and Turkish
  'cześć',
  'czesc',
  'dziękuję',
  'dziekuje',
  'dzień',
  'dzien',
  'değil',
  'degil',
  'dünya',
  'dunya',
  'için',
  'icin',
  'merhaba',
  'teşekkürler',
  'tesekkurler',
  // Indonesian and Vietnamese
  'dengan',
  'dunia',
  'kasih',
  'tidak',
  'untuk',
  'yang',
  'bạn',
  'chào',
  'không',
  'thế',
  'tôi',
  'xin',
]);

const CODE_KEYWORD = /\b(?:async|await|class|const|def|export|fn|function|import|interface|let|return|var)\b/i;
const CODE_PUNCTUATION = /[{};]|=>|===?|!==?|\+\+|--/;
const URI_SCHEME_TOKEN = /^[a-z][a-z\d+.-]*:(?:\/\/)?\S+$/iu;
const EMAIL_TOKEN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const BARE_DOMAIN_TOKEN = /^(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,63}(?::\d{1,5})?(?:[/?#]\S*)?$/iu;
const COMPACT_IDENTIFIER_TOKEN = /^[\p{L}\p{N}_-]+$/u;
const LONG_HEXADECIMAL_TOKEN = /^(?:0x)?[\da-f]{8,}$/iu;
const NATURAL_WORD_TOKEN = /^\p{L}+(?:['’]\p{L}+)*$/u;

function unwrapToken(token: string): string {
  return token.replace(/^[\p{Ps}\p{Pi}"']+/gu, '').replace(/[\p{Pe}\p{Pf}"',.;!?…]+$/gu, '');
}

/** True for a single whitespace-delimited value whose structure is data rather than prose. */
function isStructuredNonLanguageToken(token: string): boolean {
  const candidate = unwrapToken(token);
  if (!candidate) return false;

  if (URI_SCHEME_TOKEN.test(candidate) || EMAIL_TOKEN.test(candidate) || BARE_DOMAIN_TOKEN.test(candidate)) {
    return true;
  }

  // Paths, trading pairs, encoded payloads and similar slash-delimited values
  // are not natural-language words. Removing one from surrounding prose is safe.
  if (candidate.includes('/') || candidate.includes('\\')) return true;
  if (candidate.includes('_')) return true;
  if (LONG_HEXADECIMAL_TOKEN.test(candidate)) return true;

  // IDs such as a YouTube video ID are otherwise split at their digits into
  // several apparent words by the Unicode letter tokenizer below.
  if (
    candidate.length >= 6 &&
    COMPACT_IDENTIFIER_TOKEN.test(candidate) &&
    /\p{L}/u.test(candidate) &&
    /\p{N}/u.test(candidate)
  ) {
    return true;
  }

  return (candidate.match(/[.:=+~-]/gu) ?? []).length >= 2;
}

function looksLikeStructuredData(text: string): boolean {
  const trimmed = text.trim();
  const hasContainer =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (!hasContainer) return false;

  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === 'object' && value !== null;
  } catch {
    return false;
  }
}

function countNaturalWordTokens(text: string): number {
  return text.split(/\s+/u).reduce((total, token) => {
    const candidate = unwrapToken(token);
    if (!NATURAL_WORD_TOKEN.test(candidate)) return total;

    // Acronym runs and camelCase identifiers are weak evidence of prose. Known
    // language markers are handled before this conservative fallback.
    if (/^\p{Lu}{2,}$/u.test(candidate) || /\p{Ll}.*\p{Lu}/u.test(candidate)) return total;

    return total + 1;
  }, 0);
}

type AssessmentBasis = Pick<EnglishPostAssessment, 'classification' | 'isMeaningful'>;

/**
 * Translation-button policy kept separate from the heuristic so UI callers do
 * not need to recreate its conservative handling of unknown content.
 */
export function shouldOfferTranslation(assessment: AssessmentBasis): boolean {
  return (
    assessment.classification === 'non-english' || (assessment.classification === 'unknown' && assessment.isMeaningful)
  );
}

function assessment(classification: EnglishPostClassification, isMeaningful: boolean): EnglishPostAssessment {
  const basis = { classification, isMeaningful };
  return { ...basis, shouldOfferTranslation: shouldOfferTranslation(basis) };
}

function stripPostNoise(content: string): string {
  return content
    .slice(0, ASSESSMENT_SAMPLE_MAX_CHARS)
    .normalize('NFKC')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>()]+/giu, ' ')
    .replace(/\b(?:pk:|pubky:)[^\s]+/giu, ' ')
    .replace(/\B@[\p{L}\p{N}_-]+/gu, ' ')
    .replace(/(?<![\p{L}\p{N}_])[$#][\p{L}\p{N}_-]+/gu, ' ')
    .replace(/<[^>\n]{1,200}>/g, ' ')
    .replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/giu, ' ')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\S+/gu, (token) => (isStructuredNonLanguageToken(token) ? ' ' : token));
}

/**
 * Makes a bounded, dependency-free assessment of whether a post is English.
 *
 * It is intentionally a tri-state heuristic, not language identification. The
 * caller can safely run it during render: only the first 1,000 characters are
 * sampled, every pass is linear, and there is no IO or persistence.
 */
export function assessEnglishPost(content: string): EnglishPostAssessment {
  if (!content) return assessment('unknown', false);

  const text = stripPostNoise(content);
  if (!text.trim()) return assessment('unknown', false);

  if (looksLikeStructuredData(text)) return assessment('unknown', false);

  // Raw source-shaped snippets should not acquire a translate affordance merely
  // because their identifiers are not in the small English marker list.
  if (CODE_KEYWORD.test(text) && CODE_PUNCTUATION.test(text)) {
    return assessment('unknown', false);
  }

  const tokens = text.match(/\p{L}+(?:['’]\p{L}+)*/gu) ?? [];
  if (tokens.length === 0) return assessment('unknown', false);

  let letterCount = 0;
  let nonLatinLetterCount = 0;
  for (const character of text) {
    if (!/\p{L}/u.test(character)) continue;
    letterCount += 1;
    if (STRONG_NON_LATIN_SCRIPT.test(character)) nonLatinLetterCount += 1;
  }

  // A place name or borrowed word (for example, "The 東京 conference") must
  // not outweigh an otherwise English sentence. A non-Latin script becomes
  // decisive only when it makes up a meaningful share of the sampled letters.
  if (nonLatinLetterCount >= 2 && nonLatinLetterCount / letterCount >= 0.3) {
    return assessment('non-english', true);
  }

  const normalizedTokens = tokens.map((token) => token.toLocaleLowerCase('en-US'));
  const lexicalLetterCount = normalizedTokens.reduce((total, token) => total + token.length, 0);
  const foreignHits = normalizedTokens.reduce(
    (total, token) => total + (DISTINCTIVE_FOREIGN_MARKERS.has(token) ? 1 : 0),
    0,
  );

  let englishScore = 0;
  for (const token of normalizedTokens) {
    if (STRONG_ENGLISH_MARKERS.has(token)) englishScore += 2;
    else if (WEAK_ENGLISH_MARKERS.has(token)) englishScore += 1;
  }

  if (foreignHits > 0 && englishScore < foreignHits * 2) {
    return assessment('non-english', true);
  }

  if (englishScore >= 3 || (englishScore >= 2 && normalizedTokens.length <= 3 && foreignHits === 0)) {
    return assessment('english', true);
  }

  const visibleCharacterCount = Array.from(text).filter((character) => !/\s/u.test(character)).length;
  const letterRatio = visibleCharacterCount === 0 ? 0 : letterCount / visibleCharacterCount;
  const allTitleCaseNames = tokens.length >= 2 && tokens.every((token) => /^\p{Lu}[\p{Ll}\p{M}]+$/u.test(token));
  const naturalWordCount = countNaturalWordTokens(text);
  // With no recognized marker, favor precision: multiple whitespace-delimited
  // words are required so IDs, commands and other structured fragments do not
  // become "prose" merely because they contain enough letters.
  const looksLikeLatinProse =
    !allTitleCaseNames && letterRatio >= 0.5 && lexicalLetterCount >= 16 && naturalWordCount >= 4;

  return assessment('unknown', looksLikeLatinProse);
}
