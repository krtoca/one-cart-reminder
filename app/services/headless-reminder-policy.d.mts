export function testConfiguration(env: NodeJS.ProcessEnv, send: boolean): {shop:string;customerId:string;recipient:string;cartUrl:string};
export function candidateState(cart: {itemCount:number;capturedAt:Date;checkoutStartedAt:Date|null}|null, now:number, days:number): string;
