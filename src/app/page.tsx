'use client';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';

export default function Home() {
  // The `useUser()` hook is used to ensure that Clerk has loaded data about the signed in user
  const { user } = useUser();

  // Create a `client` object for accessing Supabase data using the Clerk token
  const client = createSupabaseClient();

  // This `useEffect` will wait for the User object to be loaded before requesting data
  useEffect(() => {
    if (!user) return;
  }, [user]);

  return (
    <div>
      <h1>Hello {user?.emailAddresses[0].emailAddress}</h1>
    </div>
  );
}
