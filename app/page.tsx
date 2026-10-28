import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Dashboard from './ui';
import ServicesPage from './servicos/services-page';
import './servicos/services.css';
export const dynamic='force-dynamic';
export default async function Home(){if(!(await isAuthenticated()))return <ServicesPage/>;return <Dashboard/>}
