import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import PortfolioManager from './screen';
import '../portfolio.css';

export const dynamic = 'force-dynamic';

export default async function PortfolioManagementPage() {
  if (!(await isAuthenticated())) redirect('/login');
  return <PortfolioManager />;
}
