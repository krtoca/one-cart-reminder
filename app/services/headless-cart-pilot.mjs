import { timingSafeEqual } from 'node:crypto';
export function authorized(header, secret) {
 if (typeof secret !== 'string' || secret.length < 32 || typeof header !== 'string') return false;
 const a=Buffer.from(header), b=Buffer.from('Bearer '+secret);
 return a.length===b.length && timingSafeEqual(a,b);
}
export function normalizeSnapshot(input, shop) {
 if (!input || input.shop!==shop || !/^[a-z0-9-]+\.myshopify\.com$/.test(shop||'')) throw Error('Invalid shop');
 const customerId=input.customerId, storeId=input.storeId, revision=input.revision;
 if (!/^gid:\/\/shopify\/Customer\/\d{6,20}$/.test(customerId||'') || !/^(default|[a-z0-9-]{8,48})$/.test(storeId||'') || !Number.isSafeInteger(revision)||revision<1||revision>2147483647) throw Error('Invalid identity or revision');
 if(typeof input.email!=='string'||input.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw Error('Invalid email');
 if(!Array.isArray(input.rows)||input.rows.length>200)throw Error('Invalid cart');
 const ids=new Set();
 const rows=input.rows.map(r=>{if(!r||!/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/.test(r.id||'')||ids.has(r.id)||!Number.isSafeInteger(r.qty)||r.qty<1||r.qty>9999)throw Error('Invalid item');ids.add(r.id);return {id:r.id,qty:r.qty};});
 return {shop,customerId,storeId,revision,email:input.email.trim().toLowerCase(),rows,itemCount:rows.reduce((s,r)=>s+r.qty,0)};
}
