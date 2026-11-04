import { aboutPage } from '@/flags';

/**
 * Whether /about is served. Fails closed: `evaluateBoolean` already logs the
 * evaluation error, and the page stays retired until the flag reads true.
 */
export async function resolveAboutPageEnabled(): Promise<boolean> {
  try {
    return await aboutPage();
  } catch {
    return false;
  }
}
