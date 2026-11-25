export function cartDetailRows(snapshot, variants) {
 const byId=new Map(variants.filter(v=>v?.id).map(v=>[v.id,v]));
 return snapshot.map(r=>{const v=byId.get(r.id);return {id:r.id,qty:r.qty,product:v?.product?.title??null,variant:v?.title??null,sku:v?.sku??null,price:v?.price??null};});
}
