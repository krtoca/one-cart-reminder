export function testConfiguration(env, send){
 const shop=env.HEADLESS_CART_CAPTURE_SHOP||'';
 const customerId=env.HEADLESS_REMINDER_TEST_CUSTOMER_ID||'';
 const recipient=(env.HEADLESS_REMINDER_TEST_EMAIL||'').trim().toLowerCase();
 const origin=env.HEADLESS_REMINDER_STOREFRONT_URL||'';
 if(!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)||!/^gid:\/\/shopify\/Customer\/\d{6,20}$/.test(customerId)||!/^https:\/\/[a-z0-9.-]+\/?$/i.test(origin))throw Error('Invalid pilot configuration');
 if(send&&(env.HEADLESS_REMINDER_TEST_SEND_ENABLED!=='true'||!/^\S+@[^\s@]+\.[^\s@]+$/.test(recipient)))throw Error('Test delivery disabled or recipient missing');
 return {shop,customerId,recipient,cartUrl:new URL('/catalog?owCartReminder=1',origin).href};
}
export function candidateState(cart, now, days){
 if(!cart||cart.itemCount<=0)return 'EMPTY';
 const activity=Math.max(new Date(cart.capturedAt).getTime(),cart.checkoutStartedAt?new Date(cart.checkoutStartedAt).getTime():0);
 if(!Number.isFinite(activity)||!Number.isInteger(days)||days<0)return 'INVALID';
 return now-activity>=days*86400000?'DUE':'NOT_DUE';
}
