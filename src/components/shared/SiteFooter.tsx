import Link from 'next/link';

// TODO: Make sure the styling matches the design system
export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <AtlarisLogoSmall />
          <span className="text-sm font-semibold text-slate-700">Atlaris</span>
        </div>

        {/* Links */}
        <nav aria-label="Footer navigation">
          <ul className="flex items-center gap-6">
            <li>
              <Link
                href="/about"
                className="text-sm text-slate-500 transition-colors hover:text-slate-700 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                About
              </Link>
            </li>
            <li>
              <Link
                href="/pricing"
                className="text-sm text-slate-500 transition-colors hover:text-slate-700 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Pricing
              </Link>
            </li>
          </ul>
        </nav>

        {/* Copyright */}
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} Atlaris. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function AtlarisLogoSmall() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="4.5"
        className="fill-slate-700 stroke-slate-800"
        strokeWidth="1"
      />
      <path
        d="M7.5 16.5L12 7.5L16.5 16.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 13.5H15"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
