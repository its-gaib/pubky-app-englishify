import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostTranslation } from '@/hooks/usePostTranslation/usePostTranslation';
import { assessEnglishPost } from '@/libs/language/assessEnglishPost';
import { toast } from '@/molecules/Toaster/toast';
import { PostTranslation } from './PostTranslation';

vi.mock('@/hooks/usePostTranslation/usePostTranslation', () => ({
  usePostTranslation: vi.fn(),
}));

vi.mock('@/libs/language/assessEnglishPost', () => ({
  assessEnglishPost: vi.fn(),
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: vi.fn(),
}));

const mockUsePostTranslation = vi.mocked(usePostTranslation);
const mockAssessEnglishPost = vi.mocked(assessEnglishPost);
const mockToast = vi.mocked(toast);
const mockTranslate = vi.fn<() => Promise<boolean>>();
const mockReset = vi.fn();

function mockTranslationState({
  translation = null,
  isTranslating = false,
}: {
  translation?: string | null;
  isTranslating?: boolean;
} = {}) {
  mockUsePostTranslation.mockReturnValue({
    translation,
    status: isTranslating ? 'translating' : translation ? 'translated' : 'idle',
    isTranslating,
    error: null,
    translate: mockTranslate,
    reset: mockReset,
  });
}

describe('PostTranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssessEnglishPost.mockReturnValue({
      classification: 'non-english',
      isMeaningful: true,
      shouldOfferTranslation: true,
    });
    mockTranslate.mockResolvedValue(true);
    mockTranslationState();
  });

  it('does not offer translation when local assessment says it is unnecessary', () => {
    mockAssessEnglishPost.mockReturnValue({
      classification: 'english',
      isMeaningful: true,
      shouldOfferTranslation: false,
    });

    const { container } = render(<PostTranslation content="This post is already English." />);

    expect(container).toBeEmptyDOMElement();
    expect(mockTranslate).not.toHaveBeenCalled();
  });

  it('offers an explicit on-demand translation and discloses the provider boundary', () => {
    render(<PostTranslation content="Hola a todo el mundo" />);

    const button = screen.getByRole('button', { name: 'Translate to English' });
    expect(button).toHaveAttribute('title', expect.stringContaining('OVHcloud'));
    expect(mockTranslate).not.toHaveBeenCalled();
  });

  it('starts translation without bubbling to the post card', () => {
    const onCardClick = vi.fn();
    const onCardAuxClick = vi.fn();
    render(
      <div onClick={onCardClick} onAuxClick={onCardAuxClick}>
        <PostTranslation content="Hola a todo el mundo" />
      </div>,
    );

    const button = screen.getByRole('button', { name: 'Translate to English' });
    fireEvent.click(button);
    fireEvent(button, new MouseEvent('auxclick', { bubbles: true, button: 1 }));

    expect(mockTranslate).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onCardAuxClick).not.toHaveBeenCalled();
  });

  it('shows an accessible pending state and prevents duplicate clicks', () => {
    mockTranslationState({ isTranslating: true });
    render(<PostTranslation content="Hola a todo el mundo" />);

    const button = screen.getByRole('button', { name: 'Translating…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(mockTranslate).not.toHaveBeenCalled();
  });

  it('renders hostile model output as inert plain text', () => {
    const hostileTranslation = '<img src=x> [Sign in](javascript:alert(1)) @person #urgent';
    mockTranslationState({ translation: hostileTranslation });

    const { container } = render(<PostTranslation content="Texto malicioso" />);

    expect(screen.getByRole('region', { name: 'English translation' })).toBeInTheDocument();
    expect(screen.getByTestId('translated-post-text')).toHaveTextContent(hostileTranslation);
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('shows a generic retryable error without exposing provider output', async () => {
    mockTranslate.mockResolvedValue(false);
    render(<PostTranslation content="Hola a todo el mundo" />);

    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'This post could not be translated right now. Please try again.',
      }),
    );
  });
});

describe('PostTranslation - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssessEnglishPost.mockReturnValue({
      classification: 'non-english',
      isMeaningful: true,
      shouldOfferTranslation: true,
    });
    mockTranslate.mockResolvedValue(true);
  });

  it('matches the ready state', () => {
    mockTranslationState();
    const { container } = render(<PostTranslation content="Bonjour tout le monde" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the visual translated state', () => {
    mockTranslationState({ translation: 'Hello everyone' });
    const { container } = render(<PostTranslation content="Bonjour tout le monde" variant="visual" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
