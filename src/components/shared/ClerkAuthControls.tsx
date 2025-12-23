'use client';

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';
import { Button } from '../ui/button';

export default function ClerkAuthControls() {
  return (
    <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:gap-4">
      <SignedOut>
        <SignInButton>
          <Button variant="neutral" size="responsive">
            Sign In
          </Button>
        </SignInButton>
        <SignUpButton>
          <Button size="responsive">Sign Up</Button>
        </SignUpButton>
      </SignedOut>

      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
