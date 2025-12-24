'use client';

import { Button } from '@/components/ui/button';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';

export default function ClerkAuthControls() {
  return (
    <div className="flex items-center gap-2 lg:gap-4">
      <SignedOut>
        <SignInButton>
          <Button variant="secondary">Sign In</Button>
        </SignInButton>
        <SignUpButton>
          <Button variant="default">Sign Up</Button>
        </SignUpButton>
      </SignedOut>

      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
