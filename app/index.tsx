/** Entry route: redirect to auth or tabs based on session state. */
import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/lib/auth';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/(tabs)' : '/(auth)/welcome'} />;
}
