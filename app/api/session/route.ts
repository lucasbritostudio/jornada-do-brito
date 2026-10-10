import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getAuthRecord } from '@/lib/store';
export async function GET(){ const auth=await getAuthRecord(); return NextResponse.json({authenticated:await isAuthenticated(), activated:!!auth?.activated}); }
