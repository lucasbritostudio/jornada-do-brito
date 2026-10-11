import {redirect} from 'next/navigation';
import {isAuthenticated} from '@/lib/auth';
import ProductionDashboard from './dashboard';
import './production.css';

export const dynamic='force-dynamic';
export default async function ProductionPage(){
  if(!(await isAuthenticated()))redirect('/login');
  return <ProductionDashboard />;
}
