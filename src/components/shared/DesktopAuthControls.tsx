'use client';

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';

export default function AuthControls() {
  return (
    <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:gap-4">
      <SignedOut>
        <SignInButton>
          <button className="text-ceramic-white bg-ceramic-black/50 hover:bg-ceramic-black/70 h-9 cursor-pointer rounded-full px-3 text-sm font-medium lg:h-10 lg:px-4 lg:text-base">
            Sign In
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="text-ceramic-white h-9 cursor-pointer rounded-full bg-[#6c47ff] px-3 text-sm font-medium lg:h-10 lg:px-4 lg:text-base">
            Sign Up
          </button>
        </SignUpButton>
      </SignedOut>

      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
