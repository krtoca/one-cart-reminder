import prisma from '../app/db.server';
import {shopifyGraphQL} from '../app/lib/shopify-admin.server';
import {sendReminderEmail} from '../app/lib/email.server';
import {renderReminderEmail} from '../app/services/reminder-email-template.server';
import {testConfiguration,candidateState} from '../app/services/headless-reminder-policy.mjs';

async function main(){
 const send=process.argv.includes('--send-test');
 const config=testConfiguration(process.env,send);
 const setting=await prisma.cartReminderSetting.findUnique({where:{shop:config.shop}});
 if(!setting?.isEnabled||!setting.loggedInCartEnabled){console.log({status:'DISABLED'});return;}
 const cart=await prisma.headlessCartPilot.findFirst({where:{shop:config.shop,customerId:config.customerId,storeId:'default'}});
 const state=candidateState(cart,Date.now(),setting.daysAfter);
 if(!cart||!['DUE','NOT_DUE'].includes(state)){console.log({status:state});return;}
 // Explicit test delivery bypasses age only, never identity or order checks.
 const data=await shopifyGraphQL(config.shop,`query PilotCustomer($id:ID!){customer(id:$id){id email orders(first:1,sortKey:CREATED_AT,reverse:true){nodes{createdAt}}}}`,{id:config.customerId});
 const customer=data?.customer;
 if(customer?.id!==config.customerId||String(customer.email||'').trim().toLowerCase()!==cart.customerEmail||!Array.isArray(customer.orders?.nodes))throw Error('Customer/order verification unavailable');
 const last=customer.orders.nodes[0]?.createdAt;
 if(last&&(!Number.isFinite(Date.parse(last))||Date.parse(last)>=cart.capturedAt.getTime())){console.log({status:'ORDERED'});return;}
 const sourceId=[cart.customerId,cart.storeId,cart.revision].join(':');
 const sourceType='HEADLESS_TEST';
 const prior=await prisma.reminderEmailLog.findUnique({where:{shop_sourceType_sourceId:{shop:config.shop,sourceType,sourceId}}});
 console.log({status:state,itemCount:cart.itemCount,revision:cart.revision,checkoutStarted:!!cart.checkoutStartedAt,alreadyAttempted:!!prior,mode:send?'TEST_SEND':'DRY_RUN'});
 if(!send||prior)return;
 // Recheck snapshot and claim before SMTP. Ambiguous delivery is never automatically retried.
 const current=await prisma.headlessCartPilot.findUnique({where:{shop_customerId_storeId:{shop:cart.shop,customerId:cart.customerId,storeId:cart.storeId}}});
 if(!current||current.revision!==cart.revision||current.itemCount<=0||current.customerEmail!==cart.customerEmail){console.log({status:'CART_CHANGED'});return;}
 const claim=await prisma.reminderEmailLog.createMany({data:[{shop:config.shop,sourceType,sourceId,email:config.recipient,subject:'[TEST] '+setting.subject,ok:false,errorMessage:'Test delivery claimed; do not retry automatically'}],skipDuplicates:true});
 if(!claim.count)return;
 const html=renderReminderEmail({setting,shop:config.shop,email:config.recipient,cartUrl:config.cartUrl,itemCount:cart.itemCount,sourceLabel:'Headless cart test'});
 const result=await sendReminderEmail({to:config.recipient,subject:'[TEST] '+setting.subject,html,fromName:setting.fromName});
 await prisma.reminderEmailLog.update({where:{shop_sourceType_sourceId:{shop:config.shop,sourceType,sourceId}},data:{ok:result.ok,errorMessage:result.ok?null:'Test delivery failed or uncertain; inspect SMTP before retry'}});
 console.log({status:result.ok?'TEST_SENT':'TEST_FAILED'});
}
main().catch(()=>{console.error('Headless reminder pilot failed; verify configuration, Shopify scopes and DB');process.exitCode=1;}).finally(()=>prisma.$disconnect());
