import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import CampaignDashboard from './dashboard';
import './campaigns.css';
export const dynamic = 'force-dynamic';
export default async function CampanhasPage() {
  if (!(await isAuthenticated())) redirect('/login');
  return <CampaignDashboard />;
}
