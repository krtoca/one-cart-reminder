export function allowedRecipient(value:unknown,primary:string|undefined,extra?:string):boolean;
export function settingsPatch(input:unknown):Partial<{fromName:string;subject:string;headline:string;bodyText:string;buttonText:string;footerText:string;daysAfter:number;dailySendHour:number}>;
