import { EmptyState } from '@/components/ui';

/** Placeholder for inner hub pages still on the migration backlog. */
export function HubStub({ title }: { title: string }) {
  return (
    <div>
      <div className="eyebrow">Together City</div>
      <h1 style={{ marginBottom: 8 }}>{title}</h1>
      <EmptyState icon="🚧" title="On the migration backlog" hint="This page follows the Nutrition reference vertical pattern — see WeeklyPlanner." />
    </div>
  );
}
