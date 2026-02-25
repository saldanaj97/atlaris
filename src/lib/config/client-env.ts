/**
 * Client-safe runtime flags for 'use client' components.
 * This module intentionally avoids server-only helpers and reads only browser-safe env data.
 */
export const isDevelopment = process.env.NODE_ENV === 'development';
