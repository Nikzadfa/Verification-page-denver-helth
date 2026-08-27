import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { AppHeader } from '@/components/ui';
import { ToolsPanel, type ToolCategory } from '@/components/ToolsPanel';

const TITLES: Record<ToolCategory, string> = {
  electrical: '⚡ Electrical',
  refrigeration: '❄️ Refrigeration',
  heating: '🔥 Heating',
  airflow: '💨 Airflow',
};

export default async function ToolsPage({ params }: { params: Promise<{ category: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { category } = await params;
  if (!(category in TITLES)) notFound();
  const key = category as ToolCategory;

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <AppHeader title={TITLES[key]} back="/" />
      <ToolsPanel category={key} />
    </div>
  );
}

export function generateStaticParams() {
  return Object.keys(TITLES).map((category) => ({ category }));
}
