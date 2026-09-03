'use client';

import { Languages, Loader2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { usePostTranslation } from '@/hooks/usePostTranslation/usePostTranslation';
import { assessEnglishPost } from '@/libs/language/assessEnglishPost';
import { cn } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';

interface PostTranslationProps {
  content: string;
  variant?: 'default' | 'compact' | 'visual';
  className?: string;
}

const stopPropagation = (event: MouseEvent<HTMLButtonElement | HTMLDivElement>) => event.stopPropagation();

/**
 * Offers an on-demand English translation for post prose that does not look English.
 *
 * The translated value is deliberately rendered as plain React text. Model output
 * must never enter the post Markdown/link renderer because the source post is
 * untrusted and may try to make the model emit deceptive interactive content.
 */
export function PostTranslation({ content, variant = 'default', className }: PostTranslationProps) {
  const assessment = assessEnglishPost(content);
  const { translation, isTranslating, translate } = usePostTranslation(content);

  if (!assessment.shouldOfferTranslation) return null;

  const isVisual = variant === 'visual';
  const isCompact = variant !== 'default';

  const handleTranslate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (isTranslating || translation) return;

    const translated = await translate();
    if (!translated) {
      toast({
        variant: 'error',
        description: 'This post could not be translated right now. Please try again.',
      });
    }
  };

  return (
    <Container
      overrideDefaults
      data-testid="post-translation"
      onClick={stopPropagation}
      onAuxClick={stopPropagation}
      className={cn('flex min-w-0 flex-col items-start gap-2', className)}
    >
      {!translation ? (
        <Button
          overrideDefaults
          type="button"
          disabled={isTranslating}
          aria-busy={isTranslating}
          data-cy="translate-post-button"
          title="Translate with OVHcloud AI. The post text is sent to OVHcloud only when you click."
          onClick={handleTranslate}
          onAuxClick={stopPropagation}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70',
            isVisual ? 'text-white hover:text-white/80' : 'text-brand hover:text-brand/80',
            isCompact && 'text-xs',
          )}
        >
          {isTranslating ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <Languages aria-hidden="true" className="size-3.5" />
          )}
          {isTranslating ? 'Translating…' : 'Translate to English'}
        </Button>
      ) : (
        <Container
          overrideDefaults
          role="region"
          aria-label="English translation"
          aria-live="polite"
          className={cn(
            'flex min-w-0 flex-col gap-1.5 rounded-r-md border-l-2 px-3 py-2',
            isVisual ? 'border-white/50 bg-black/40 text-white' : 'border-brand/50 bg-brand/5',
            isCompact && 'max-h-28 overflow-y-auto px-2 py-1.5',
            isVisual && 'max-h-20',
          )}
        >
          <Typography
            as="span"
            overrideDefaults
            className={cn(
              'text-xs font-semibold tracking-wide uppercase',
              isVisual ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            English translation · AI
          </Typography>
          <Typography
            overrideDefaults
            data-testid="translated-post-text"
            className={cn(
              'wrap-anywhere whitespace-pre-wrap',
              isVisual ? 'text-xs leading-4 text-white' : 'text-base leading-6 font-medium text-secondary-foreground',
              variant === 'compact' && 'text-sm leading-5',
            )}
          >
            {translation}
          </Typography>
        </Container>
      )}
    </Container>
  );
}
