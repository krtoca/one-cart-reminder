import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import prisma from '../db.server';
import { authorized, normalizeSnapshot } from '../services/headless-cart-pilot.mjs';

// Capture-only pilot: deliberately isolated from legacy reminder and recovery tables.
export async function action({request}: ActionFunctionArgs) {
 const headers={'Cache-Control':'no-store'};
 if(request.method!=='POST')return json({ok:false},{status:405,headers});
 if(process.env.HEADLESS_CART_CAPTURE_ENABLED!=='true'||!authorized(request.headers.get('authorization'),process.env.HEADLESS_CART_CAPTURE_TOKEN))return json({ok:false},{status:401,headers});
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({ok:false},{status:415,headers});
 let snapshot: ReturnType<typeof normalizeSnapshot>;
 try {
  const reader=request.body?.getReader(); if(!reader)throw Error('Missing body');
  const chunks: Uint8Array[]=[]; let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();return json({ok:false},{status:413,headers});}chunks.push(value);}
  snapshot=normalizeSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')),process.env.HEADLESS_CART_CAPTURE_SHOP);
 }catch{return json({ok:false},{status:400,headers});}
 try{
  const setting=await prisma.cartReminderSetting.findUnique({where:{shop:snapshot.shop},select:{isEnabled:true,loggedInCartEnabled:true}});
  if(!setting?.isEnabled||!setting.loggedInCartEnabled)return json({ok:false},{status:409,headers});
  const count=await prisma.$executeRaw`INSERT INTO "HeadlessCartPilot" ("shop","customerId","storeId","revision","customerEmail","lineItems","itemCount","capturedAt") VALUES (${snapshot.shop},${snapshot.customerId},${snapshot.storeId},${snapshot.revision},${snapshot.email},${JSON.stringify(snapshot.rows)}::jsonb,${snapshot.itemCount},NOW()) ON CONFLICT ("shop","customerId","storeId") DO UPDATE SET "revision"=EXCLUDED."revision","customerEmail"=EXCLUDED."customerEmail","lineItems"=EXCLUDED."lineItems","itemCount"=EXCLUDED."itemCount","capturedAt"=NOW() WHERE "HeadlessCartPilot"."revision" < EXCLUDED."revision"`;
  return json({ok:true,recorded:count>0},{headers});
 }catch{console.warn('[Headless cart pilot] storage unavailable');return json({ok:false},{status:503,headers});}
}
