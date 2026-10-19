import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {isAuthenticated} from '@/lib/auth';
import DevelopmentConsole from './console';
import './development.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={
 title:'Jornada Dev · IA Desenvolvedora',
 description:'Central privada de diagnóstico e alertas técnicos.',
 manifest:'/devops.webmanifest',
 appleWebApp:{capable:true,title:'Jornada Dev',statusBarStyle:'black-translucent'},
 icons:{icon:[{url:'/devops-icon.svg',type:'image/svg+xml'}]},
};
export default async function DevelopmentPage(){
  if(!(await isAuthenticated()))redirect('/login');
  return <DevelopmentConsole />;
}
