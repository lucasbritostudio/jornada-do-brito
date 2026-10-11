import {redirect} from 'next/navigation';
import {isAuthenticated} from '@/lib/auth';
import DevelopmentConsole from './console';
import './development.css';
export const dynamic='force-dynamic';
export default async function DevelopmentPage(){
  if(!(await isAuthenticated()))redirect('/login');
  return <DevelopmentConsole />;
}
