import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import prisma from '../db.server';
import {shopifyGraphQL} from '../lib/shopify-admin.server';
import {cartDetailRows} from '../services/headless-cart-detail.mjs';
import { authorized } from '../services/headless-cart-pilot.mjs';
import { renderReminderEmail } from '../services/reminder-email-template.server';
import { sendReminderEmail } from '../lib/email.server';
import { candidateState } from '../services/headless-reminder-policy.mjs';
import { settingsPatch, allowedRecipient } from '../services/headless-admin-policy.mjs';

const headers={'Cache-Control':'private, no-store'};
const reply=(body:unknown,status=200)=>json(body,{status,headers});
export async function action({request}:ActionFunctionArgs){
 const shop=process.env.HEADLESS_CART_CAPTURE_SHOP||'';
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(process.env.HEADLESS_REMINDER_ADMIN_ENABLED!=='true'||!authorized(request.headers.get('authorization'),process.env.HEADLESS_REMINDER_ADMIN_TOKEN)||!/^[a-z0-9-]+\.myshopify\.com$/.test(shop))return reply({error:'Unauthorized'},401);
 let input:any;
 try{if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error();const reader=request.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return reply({error:'Body too large'},413);}chunks.push(value);}input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!input||typeof input!=='object'||Array.isArray(input))throw Error();}catch{return reply({error:'Invalid JSON'},400);}
 try{
 const setting=await prisma.cartReminderSetting.findUnique({where:{shop}});
 if(!setting)return reply({error:'Cart Reminder settings missing'},409);
 const {isEnabled,loggedInCartEnabled,abandonedCheckoutEnabled,daysAfter,dailySendHour,timezone,fromName,subject,headline,bodyText,buttonText,footerText,updatedAt}=setting;
 const publicSetting={isEnabled,loggedInCartEnabled,abandonedCheckoutEnabled,daysAfter,dailySendHour,timezone,fromName,subject,headline,bodyText,buttonText,footerText,updatedAt};
 const types=['HEADLESS_TEST','HEADLESS_ADMIN_TEST'];
 if(input.op==='overview'){
 const page=Number.isInteger(input.page)&&input.page>=1&&input.page<=10000?input.page:1;
 const filter=input.filter==='checkout'?{itemCount:{gt:0},checkoutStartedAt:{not:null}}:input.filter==='empty'?{itemCount:0}:{};
 const search=typeof input.search==='string'?input.search.trim().slice(0,254):'';
 const where={shop,...filter,...(search?{customerEmail:{contains:search,mode:'insensitive' as const}}:{})};
 const [active,checkout,empty,total,carts,logs,tests]=await Promise.all([
 prisma.headlessCartPilot.count({where:{shop,itemCount:{gt:0}}}),prisma.headlessCartPilot.count({where:{shop,itemCount:{gt:0},checkoutStartedAt:{not:null}}}),prisma.headlessCartPilot.count({where:{shop,itemCount:0}}),prisma.headlessCartPilot.count({where}),prisma.headlessCartPilot.findMany({where,orderBy:[{capturedAt:'desc'},{customerId:'asc'},{storeId:'asc'}],skip:(page-1)*25,take:25,select:{customerId:true,customerEmail:true,storeId:true,revision:true,itemCount:true,capturedAt:true,checkoutStartedAt:true}}),prisma.reminderEmailLog.findMany({where:{shop,sourceType:{in:types}},orderBy:{sentAt:'desc'},take:50,select:{email:true,subject:true,ok:true,errorMessage:true,sentAt:true,sourceType:true}}),prisma.reminderEmailLog.count({where:{shop,sourceType:{in:types},ok:true}})]);
 return reply({setting:publicSetting,active,checkout,empty,total,page,tests,carts:carts.map(c=>({...c,state:candidateState(c,Date.now(),daysAfter)})),logs,testEnabled:process.env.HEADLESS_REMINDER_TEST_SEND_ENABLED==='true',captureEnabled:process.env.HEADLESS_CART_CAPTURE_ENABLED==='true',testRecipient:process.env.HEADLESS_REMINDER_TEST_EMAIL||''});
 }
 if(input.op==='cart-detail'){
 if(!/^gid:\/\/shopify\/Customer\/\d{6,20}$/.test(input.customerId||'')||!/^(default|[a-z0-9-]{8,48})$/.test(input.storeId||'')||!Number.isSafeInteger(input.revision))return reply({error:'Invalid cart reference'},400);
 const cart=await prisma.headlessCartPilot.findUnique({where:{shop_customerId_storeId:{shop,customerId:input.customerId,storeId:input.storeId}}});
 if(!cart||cart.revision!==input.revision)return reply({error:'Cart changed. Refresh the list.'},409);
 const snapshot=(Array.isArray(cart.lineItems)?cart.lineItems:[]).filter((r:any)=>r&&/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/.test(r.id)&&Number.isSafeInteger(r.qty)&&r.qty>0).slice(0,200) as {id:string;qty:number}[];
 let customer=null,currency=null,variants:any[]=[],lookupIncomplete=false;
 try{const result=await shopifyGraphQL(shop,`query ReminderCustomer($id:ID!){shop{currencyCode} customer(id:$id){id displayName numberOfOrders orders(first:1,sortKey:CREATED_AT,reverse:true){nodes{name createdAt}}}}`,{id:cart.customerId});customer=result?.customer?.id===cart.customerId?result.customer:null;currency=result?.shop?.currencyCode??null;}catch{lookupIncomplete=true;}
 for(let i=0;i<snapshot.length;i+=50){try{const result=await shopifyGraphQL(shop,`query ReminderVariants($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id title sku price product{title}}}}`,{ids:snapshot.slice(i,i+50).map(r=>r.id)});if(Array.isArray(result?.nodes))variants.push(...result.nodes);else lookupIncomplete=true;}catch{lookupIncomplete=true;}}
 const lines=cartDetailRows(snapshot,variants);
 return reply({customerName:customer?.displayName??null,orderCount:customer?.numberOfOrders??null,lastOrder:customer?.orders?.nodes?.[0]??null,currency,lines,lookupIncomplete:lookupIncomplete||lines.some(r=>r.product===null)});
 }
 if(input.op==='settings'){
 let patch;try{patch=settingsPatch(input.settings);}catch{return reply({error:'Invalid settings'},400);}
 const revision=new Date(input.expectedUpdatedAt);if(!Number.isFinite(revision.getTime()))return reply({error:'Invalid revision'},400);
 const result=await prisma.cartReminderSetting.updateMany({where:{shop,updatedAt:revision},data:patch});
 return result.count===1?reply({ok:true}):reply({error:'Settings changed. Refresh and try again.'},409);
 }
 if(input.op==='preview'||input.op==='send-test'){
 const origin=process.env.HEADLESS_REMINDER_STOREFRONT_URL||'';
 if(!/^https:\/\/[a-z0-9.-]+\/?$/i.test(origin))return reply({error:'Storefront URL invalid'},409);
 const cartUrl=new URL('/catalog?owCartReminder=1',origin).href;
 const subject='[TEST] '+setting.subject;
 const html=renderReminderEmail({setting,shop,email:'',cartUrl,itemCount:2,sourceLabel:'Sample cart'});
 if(input.op==='preview')return reply({subject,html});
 if(process.env.HEADLESS_REMINDER_TEST_SEND_ENABLED!=='true'||!allowedRecipient(input.email,process.env.HEADLESS_REMINDER_TEST_EMAIL,process.env.HEADLESS_REMINDER_TEST_EMAIL_ALLOWLIST))return reply({error:'Test delivery disabled or recipient not allowlisted'},403);
 const email=String(input.email).trim().toLowerCase();
 // Durable, shop-wide minute claim; no customer cart changes and no automatic retries.
 const sourceType='HEADLESS_ADMIN_TEST',sourceId=String(Math.floor(Date.now()/60000));
 const claim=await prisma.reminderEmailLog.createMany({data:[{shop,sourceType,sourceId,email,subject,ok:false,errorMessage:'Test claimed; delivery not yet confirmed'}],skipDuplicates:true});
 if(!claim.count)return reply({error:'One test per minute; try again shortly'},429);
 const result=await sendReminderEmail({to:email,subject,html,fromName:setting.fromName});
 const ok=result.ok===true&&result.acceptedCount===1&&result.rejectedCount===0;
 await prisma.reminderEmailLog.update({where:{shop_sourceType_sourceId:{shop,sourceType,sourceId}},data:{ok,errorMessage:ok?null:'SMTP failed or uncertain; check provider history'}});
 return reply({status:ok?'TEST_SENT':'TEST_FAILED',...(ok?{messageId:result.messageId,smtpResponse:result.smtpResponse,acceptedCount:result.acceptedCount,rejectedCount:result.rejectedCount}:{error:'SMTP failed or uncertain'})},ok?200:502);
 }
 return reply({error:'Unknown operation'},400);
 }catch{console.warn('[Headless reminder admin] operation failed');return reply({error:'Cart Reminder service unavailable'},503);}
}
