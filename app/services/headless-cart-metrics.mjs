import {cartDetailRows,catalogSubtotal} from './headless-cart-detail.mjs';
export function summarizeCartValues(carts,variants,{truncated=false,currency=null}={}){
 const byId=new Map(variants.filter(v=>v?.id).map(v=>[v.id,v]));
 let activeCents=0,checkoutCents=0,missing=0,checkoutMissing=0,checkoutCount=0;
 for(const c of carts){
  if(c.itemCount<=0)continue;
  const checkout=!!c.checkoutStartedAt;if(checkout)checkoutCount++;
  const rows=Array.isArray(c.lineItems)?c.lineItems.filter(r=>r&&typeof r.id==='string'&&Number.isSafeInteger(r.qty)&&r.qty>0):[];
  const value=rows.reduce((n,r)=>n+r.qty,0)===c.itemCount?catalogSubtotal(cartDetailRows(rows,rows.map(r=>byId.get(r.id)))):null;
  if(value===null){missing++;if(checkout)checkoutMissing++;continue;}
  activeCents+=value;if(checkout)checkoutCents+=value;
 }
 return {currency,activeCents:!truncated&&!missing&&currency&&Number.isSafeInteger(activeCents)?activeCents:null,checkoutCents:!truncated&&!checkoutMissing&&currency&&Number.isSafeInteger(checkoutCents)?checkoutCents:null,missing,checkoutMissing,checkoutCount,truncated};
}
