const GREEN = '\u001b[0;32m';
const YELLOW = '\u001b[1;33m';
const RED = '\u001b[0;31m';
const BLUE = '\u001b[0;34m';
const NC = '\u001b[0m';

export function logInfo(message: string): void {
  console.log(`${GREEN}[✓]${NC} ${message}`);
}

export function logWarn(message: string): void {
  console.log(`${YELLOW}[!]${NC} ${message}`);
}

export function logError(message: string): void {
  console.log(`${RED}[✗]${NC} ${message}`);
}

export function logStep(message: string): void {
  console.log(`\n${BLUE}==>${NC} ${message}`);
}
