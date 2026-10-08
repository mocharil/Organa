const fs=require('node:fs');
const {GeminiProvider}=require('../server/ai/gemini-provider');
const limit=Number(process.env.ORGANA_LIVE_CHECK_MAX_CALLS||30),tokenLimit=Number(process.env.ORGANA_LIVE_CHECK_MAX_TOKENS||8192),budgetPath=process.env.ORGANA_LIVE_CHECK_BUDGET_FILE;
if(!budgetPath)throw new Error('Live check budget file is required.');
const generate=GeminiProvider.prototype.generate;
GeminiProvider.prototype.generate=async function(input){
 const budget=JSON.parse(fs.readFileSync(budgetPath,'utf8'));
 if(budget.calls>=limit)throw new Error('The live check model-call budget is exhausted.');
 // Reserve before awaiting the SDK. Failed calls consume budget and restart retains it.
 budget.calls++;fs.writeFileSync(budgetPath,JSON.stringify(budget));
 return generate.call(this,{...input,maxOutputTokens:Math.min(input.maxOutputTokens||4096,tokenLimit)});
};
const client=GeminiProvider.prototype.client;
GeminiProvider.prototype.client=async function(){
 const ai=await client.call(this);
 if(!ai.models.__organaBounded){const generateContent=ai.models.generateContent.bind(ai.models);ai.models.generateContent=input=>generateContent({...input,config:{...input.config,httpOptions:{...input.config?.httpOptions,timeout:90000,retryOptions:{attempts:1}}}});ai.models.__organaBounded=true;}
 return ai;
};
