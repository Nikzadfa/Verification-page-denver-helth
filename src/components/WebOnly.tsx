'use client';

import { useEffect, useState } from 'react';
import { isIosApp } from '@/lib/native';

/**
 * Renders its children everywhere except inside the iOS app.
 *
 * Used for anything that talks about paying outside the App Store. Guideline
 * 3.1.1 treats a mention of an alternative purchase method as a violation in
 * itself, not only a working link.
 */
export function WebOnly({ children }: { children: React.ReactNode }) {
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => setNative(isIosApp()), []);
  if (native !== false) return null;
  return <>{children}</>;
}
