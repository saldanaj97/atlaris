import { vi } from 'vitest';
import { createGoogleApisMock } from '../shared/googleapis.shared';

vi.mock('googleapis', () => createGoogleApisMock());
