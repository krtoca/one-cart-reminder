export function cartDetailRows(snapshot, variants) {
 const byId=new Map(variants.filter(v=>v?.id).map(v=>[v.id,v]));
 return snapshot.map(r=>{const v=byId.get(r.id);return {id:r.id,qty:r.qty,product:v?.product?.title??null,variant:v?.title??null,sku:v?.sku??null,price:v?.price??null};});
}

export function catalogSubtotal(rows){
 let cents=0;
 for(const r of rows){
  if(r.price==null||!/^\d+(?:\.\d{1,2})?$/.test(String(r.price))||!Number.isSafeInteger(r.qty)||r.qty<1)return null;
  const [whole,fraction='']=String(r.price).split('.');
  cents+=(Number(whole)*100+Number(fraction.padEnd(2,'0')))*r.qty;
  if(!Number.isSafeInteger(cents))return null;
 }
 return cents;
}
