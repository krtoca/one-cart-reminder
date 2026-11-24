export function authorized(header: string | null, secret: string | undefined): boolean;
export function normalizeSnapshot(input: unknown, shop: string | undefined): {shop:string;customerId:string;storeId:string;revision:number;email:string;rows:{id:string;qty:number}[];itemCount:number};
