import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState } from '@/lib/store';
import { buildInsights } from '@/lib/insights';
export async function GET(){try{await requireAuthenticated();const state=await getState();return NextResponse.json({mode:'local-safe',insights:buildInsights(state),advancedConfigured:false});}catch{return NextResponse.json({error:'Não autorizado'},{status:401});}}
