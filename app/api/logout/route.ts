import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
export async function POST() { const r=NextResponse.json({ok:true}); r.cookies.set(SESSION_COOKIE,'',{path:'/',maxAge:0}); return r; }
