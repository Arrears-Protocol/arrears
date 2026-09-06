import { WalletProvider } from '../../components/dash/Wallet';
import { DashShell } from '../../components/dash/Shell';

export const metadata = { title: 'Arrears — dashboard' };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <DashShell>{children}</DashShell>
    </WalletProvider>
  );
}
