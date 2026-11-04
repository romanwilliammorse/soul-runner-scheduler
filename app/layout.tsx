import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Soul Runner · Team availability',description:'Register your team and share your weekly availability.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
