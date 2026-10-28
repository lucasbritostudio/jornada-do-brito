import {redirect} from 'next/navigation';
import {isAuthenticated} from '@/lib/auth';
import CatalogAdmin from './screen';
import '../../servicos/services.css';
export const dynamic='force-dynamic';
export default async function Page(){if(!(await isAuthenticated()))redirect('/login');return <CatalogAdmin/>;}
