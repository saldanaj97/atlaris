import RootLayout from '@/app/layout';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock('next/font/google', () => ({
  IBM_Plex_Mono: () => ({ className: '', variable: '' }),
  Instrument_Serif: () => ({ className: '', variable: '' }),
  Sora: () => ({ className: '', variable: '' }),
  Work_Sans: () => ({ className: '', variable: '' }),
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

// Skip ClerkProvider and the client-only Vercel telemetry; neither is under test.
vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: () => false,
}));

vi.mock('@/app/VercelTelemetry', () => ({
  VercelTelemetry: () => null,
}));

/**
 * Renders the real RootLayout on the server and returns the attribute string of
 * the next-themes anti-flash inline script (the one CSP blocked in production).
 */
async function renderThemeScriptAttributes(
  requestHeaders: HeadersInit,
): Promise<string> {
  mocks.headers.mockResolvedValue(new Headers(requestHeaders));

  const markup = renderToStaticMarkup(
    await RootLayout({ children: createElement('main', null, 'content') }),
  );

  const themeScripts = [
    ...markup.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g),
  ].filter((match) => match[2]?.includes('prefers-color-scheme'));

  expect(themeScripts).toHaveLength(1);
  return themeScripts[0]?.[1] ?? '';
}

describe('RootLayout theme script CSP nonce', () => {
  beforeEach(() => {
    mocks.headers.mockReset();
  });

  it('applies the proxy x-nonce header to the next-themes inline script', async () => {
    const attributes = await renderThemeScriptAttributes({
      'x-nonce': 'proxy-request-nonce',
    });

    expect(attributes).toContain('nonce="proxy-request-nonce"');
  });

  it('renders the theme script without a nonce when the proxy sets none', async () => {
    const attributes = await renderThemeScriptAttributes({});

    expect(attributes).not.toContain('nonce');
  });
});
