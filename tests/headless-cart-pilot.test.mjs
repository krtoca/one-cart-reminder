import test from 'node:test';import assert from 'node:assert/strict';import {authorized,normalizeSnapshot} from '../app/services/headless-cart-pilot.mjs';
const shop='test.myshopify.com', input={shop,customerId:'gid://shopify/Customer/123456',storeId:'default',email:'a@example.com',revision:2,rows:[{id:'gid://shopify/ProductVariant/123',qty:4}]};
test('auth fails closed',()=>{assert.equal(authorized('Bearer '+ 'a'.repeat(32),'a'.repeat(32)),true);assert.equal(authorized('Bearer a','a'),false);assert.equal(authorized(null,undefined),false)});
test('snapshot and empty cart',()=>{assert.equal(normalizeSnapshot(input,shop).itemCount,4);assert.equal(normalizeSnapshot({...input,rows:[]},shop).itemCount,0)});
test('invalid shop, duplicates, quantity, revision rejected',()=>{for(const patch of [{shop:'other.myshopify.com'},{rows:[...input.rows,...input.rows]},{rows:[{...input.rows[0],qty:0}]},{revision:0}])assert.throws(()=>normalizeSnapshot({...input,...patch},shop))});
