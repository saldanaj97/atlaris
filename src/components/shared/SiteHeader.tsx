import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header className="container mx-auto px-6 py-4">
      <div className="flex h-16 flex-col items-center justify-between gap-4 md:flex-row">
        <Link href="/" className="flex items-center space-x-2">
          <BookOpen className="text-primary h-8 w-8" />
          <span className="text-2xl font-bold">Learn App</span>
        </Link>
        <div className="flex items-center space-x-4">
          <SignedOut>
            <SignInButton>
              <button className="text-ceramic-white bg-ceramic-black/50 hover:bg-ceramic-black/70 h-10 cursor-pointer rounded-full px-4 text-sm font-medium sm:h-12 sm:px-5 sm:text-base">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="text-ceramic-white h-10 cursor-pointer rounded-full bg-[#6c47ff] px-4 text-sm font-medium sm:h-12 sm:px-5 sm:text-base">
                Sign Up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
