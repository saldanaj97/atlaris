/** Strip a trailing slash except for `/`. Next skipTrailingSlashRedirect is global. */
export function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
}
