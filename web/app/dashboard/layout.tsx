import { DashShell } from '../../components/dash/Shell';

export const metadata = { title: 'Arrears — dashboard' };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashShell>{children}</DashShell>;
}
