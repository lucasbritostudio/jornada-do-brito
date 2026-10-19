import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jornada do Brito',
  description: 'Sistema pessoal de vida, trabalho, clientes e finanças.',
  manifest: '/manifest.webmanifest',
  appleWebApp:{capable:true,title:'Jornada Dev',statusBarStyle:'black-translucent'},
  icons:{icon:[{url:'/devops-icon.svg',type:'image/svg+xml'}]}
};

export const viewport: Viewport = { themeColor: '#0b0d10', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
