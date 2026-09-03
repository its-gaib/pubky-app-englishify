'use client';

import { useEffect, useRef, useState } from 'react';
import { type PostTranslationError, translatePostToEnglish } from '@/libs/language/translatePostToEnglish';

// Full-length articles can require substantial inference time on the anonymous
// 70B endpoint, while the request remains explicitly cancellable by the caller.
export const POST_TRANSLATION_TIMEOUT_MS = 120_000;
const POST_TRANSLATION_CACHE_MAX_ENTRIES = 25;

export type PostTranslationStatus = 'idle' | 'translating' | 'translated' | 'error';

interface PostTranslationState {
  source: string;
  status: PostTranslationStatus;
  translation: string | null;
  error: PostTranslationError | null;
}

export interface UsePostTranslationResult {
  translation: string | null;
  status: PostTranslationStatus;
  isTranslating: boolean;
  error: PostTranslationError | null;
  /** Runs only in response to an explicit caller action. */
  translate: () => Promise<boolean>;
  /** Hides the translation and returns this hook instance to idle. */
  reset: () => void;
}

interface ActiveRequest {
  controller: AbortController;
  source: string;
  timedOut: boolean;
}

// Exact-content, bounded, memory-only cache. It reduces anonymous rate-limit
// pressure without persisting post text or sharing it with any other storage.
const translationCache = new Map<string, string>();

function readCachedTranslation(source: string): string | null {
  const cached = translationCache.get(source);
  if (cached === undefined) return null;

  // Refresh insertion order to make the fixed-size map a small LRU cache.
  translationCache.delete(source);
  translationCache.set(source, cached);
  return cached;
}

function cacheTranslation(source: string, translation: string): void {
  translationCache.delete(source);
  translationCache.set(source, translation);

  if (translationCache.size <= POST_TRANSLATION_CACHE_MAX_ENTRIES) return;
  const oldestKey = translationCache.keys().next().value;
  if (typeof oldestKey === 'string') translationCache.delete(oldestKey);
}

/** Test seam for deterministic cache isolation. */
export function clearPostTranslationCache(): void {
  translationCache.clear();
}

function idleState(source: string): PostTranslationState {
  return { source, status: 'idle', translation: null, error: null };
}

function timeoutError(): PostTranslationError {
  return { code: 'timed-out', message: 'Translation took too long. Please try again.' };
}

/**
 * Provides an explicit, cancellable translate action for one piece of post text.
 * No network request is made on mount or when the source changes.
 */
export function usePostTranslation(source: string): UsePostTranslationResult {
  const [state, setState] = useState<PostTranslationState>(() => idleState(source));
  const activeRequestRef = useRef<ActiveRequest | null>(null);

  useEffect(() => {
    const activeRequest = activeRequestRef.current;
    if (activeRequest && activeRequest.source !== source) {
      activeRequest.controller.abort();
      activeRequestRef.current = null;
    }
    setState(idleState(source));
  }, [source]);

  useEffect(
    () => () => {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    },
    [],
  );

  const currentState = state.source === source ? state : idleState(source);

  async function translate(): Promise<boolean> {
    if (activeRequestRef.current?.source === source) return false;

    const cached = readCachedTranslation(source);
    if (cached !== null) {
      setState({ source, status: 'translated', translation: cached, error: null });
      return true;
    }

    activeRequestRef.current?.controller.abort();

    const request: ActiveRequest = {
      controller: new AbortController(),
      source,
      timedOut: false,
    };
    activeRequestRef.current = request;
    setState({ source, status: 'translating', translation: null, error: null });

    const timeoutId = setTimeout(() => {
      request.timedOut = true;
      request.controller.abort();
    }, POST_TRANSLATION_TIMEOUT_MS);

    const result = await translatePostToEnglish(source, request.controller.signal);
    clearTimeout(timeoutId);

    const isCurrentRequest = activeRequestRef.current === request;
    if (!isCurrentRequest) return false;
    activeRequestRef.current = null;

    if (!result.ok) {
      if (result.error.code === 'aborted' && !request.timedOut) return false;

      setState({
        source,
        status: 'error',
        translation: null,
        error: request.timedOut ? timeoutError() : result.error,
      });
      return false;
    }

    cacheTranslation(source, result.translation);
    setState({ source, status: 'translated', translation: result.translation, error: null });
    return true;
  }

  function reset(): void {
    const activeRequest = activeRequestRef.current;
    if (activeRequest?.source === source) {
      activeRequest.controller.abort();
      activeRequestRef.current = null;
    }
    setState(idleState(source));
  }

  return {
    translation: currentState.translation,
    status: currentState.status,
    isTranslating: currentState.status === 'translating',
    error: currentState.error,
    translate,
    reset,
  };
}
