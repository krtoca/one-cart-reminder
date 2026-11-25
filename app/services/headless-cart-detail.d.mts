export function cartDetailRows(snapshot: {id:string;qty:number}[], variants:any[]): {id:string;qty:number;product:string|null;variant:string|null;sku:string|null;price:string|null}[];

export function catalogSubtotal(rows:{price:string|null;qty:number}[]):number|null;
