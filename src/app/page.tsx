'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';

export default function Home() {
  // The `useUser()` hook is used to ensure that Clerk has loaded data about the signed in user
  const { user } = useUser();

  // This `useEffect` will wait for the User object to be loaded before requesting data
  useEffect(() => {
    if (!user) return;
  }, [user]);

  return <div>{<h1>{JSON.stringify(user)}</h1>}</div>;
}
