import test from 'node:test';
import assert from 'node:assert/strict';
import {testConfiguration,candidateState} from '../app/services/headless-reminder-policy.mjs';
const env={HEADLESS_CART_CAPTURE_SHOP:'test.myshopify.com',HEADLESS_REMINDER_TEST_CUSTOMER_ID:'gid://shopify/Customer/123456',HEADLESS_REMINDER_STOREFRONT_URL:'https://example.com',HEADLESS_REMINDER_TEST_EMAIL:'test@example.com'};
test('dry run available but test delivery explicitly gated',()=>{assert.equal(testConfiguration(env,false).cartUrl,'https://example.com/catalog?owCartReminder=1');assert.throws(()=>testConfiguration(env,true));assert.equal(testConfiguration({...env,HEADLESS_REMINDER_TEST_SEND_ENABLED:'true'},true).recipient,'test@example.com');});
test('reject invalid identity and non HTTPS origin',()=>{assert.throws(()=>testConfiguration({...env,HEADLESS_REMINDER_TEST_CUSTOMER_ID:'123'},false));assert.throws(()=>testConfiguration({...env,HEADLESS_REMINDER_STOREFRONT_URL:'http://example.com'},false));});
test('empty cart and recent activity cannot be due',()=>{const now=Date.now();const cart={itemCount:2,capturedAt:new Date(now-8*86400000),checkoutStartedAt:null};assert.equal(candidateState(cart,now,7),'DUE');assert.equal(candidateState({...cart,itemCount:0},now,7),'EMPTY');assert.equal(candidateState({...cart,checkoutStartedAt:new Date(now)},now,7),'NOT_DUE');});
