export function allowedRecipient(value, primary, extra=''){
 if(typeof value!=='string')return false;
 const email=value.trim().toLowerCase();
 return email.length<=254&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)&&[primary,...String(extra).split(',')].some(x=>typeof x==='string'&&x.trim().toLowerCase()===email);
}
export function settingsPatch(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid settings');
 const out={};const fields={fromName:120,subject:200,headline:200,bodyText:4000,buttonText:100,footerText:2000};
 for(const [key,value] of Object.entries(input)){
  if(Object.hasOwn(fields,key)){if(typeof value!=='string'||value.length>fields[key]||!value.trim()||(['fromName','subject'].includes(key)&&/[\r\n]/.test(value)))throw Error('Invalid text');out[key]=value.trim();}
  else if(key==='daysAfter'||key==='dailySendHour'){if(!Number.isInteger(value)||value<(key==='daysAfter'?1:0)||value>(key==='daysAfter'?90:23))throw Error('Invalid schedule');out[key]=value;}
  else throw Error('Unsupported setting');
 }
 if(!Object.keys(out).length)throw Error('Empty settings');return out;
}
