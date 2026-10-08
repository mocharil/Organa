const fs=require('node:fs');
function redactor(environment=process.env){
 const secrets=new Set();
 for(const name of ['GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_SERVICE_ACCOUNT_JSON','GOOGLE_SERVICE_ACCOUNT_JSON_BASE64','GOOGLE_APPLICATION_CREDENTIALS','OPENAI_API_KEY','ANTHROPIC_API_KEY'])if(environment[name])secrets.add(environment[name]);
 let account;try{account=JSON.parse(environment.GOOGLE_SERVICE_ACCOUNT_JSON||Buffer.from(environment.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64||'','base64').toString());}catch{}
 if(!account&&environment.GOOGLE_APPLICATION_CREDENTIALS)try{account=JSON.parse(fs.readFileSync(environment.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));}catch{}
 for(const name of ['private_key','private_key_id','client_email','client_id'])if(account?.[name])secrets.add(account[name]);
 const values=[...secrets].filter(value=>value.length>3).sort((a,b)=>b.length-a.length);
 return value=>{let text=String(value||'');for(const secret of values)text=text.split(secret).join('[REDACTED]');return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]').replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]').replace(/AIza[A-Za-z0-9_-]{20,}/g,'[REDACTED KEY]');};
}
function positive(value,fallback,max){const result=Number(value??fallback);if(!Number.isInteger(result)||result<1||result>max)throw new Error(`Expected a whole number between 1 and ${max}.`);return result;}
function preflight(config,{fixture=false}={}){
 if(fixture)return{provider:'dry-run',fixture:true,liveExecutionVerified:false};
 if(config.dryRun)throw new Error('Disable ORGANA_DRY_RUN for a live check.');
 const provider=config.llmProvider==='auto'?(config.googleCloudProject?'vertex':config.geminiApiKey?'gemini':''):config.llmProvider;
 if(!['vertex','gemini'].includes(provider))throw new Error('Select vertex or gemini and configure local credentials.');
 if(provider==='gemini'&&!config.geminiApiKey)throw new Error('GEMINI_API_KEY is required for the Gemini Developer API.');
 if(provider==='vertex'&&!config.googleCloudProject)throw new Error('A Google Cloud project is required for Vertex AI.');
 return{provider,fixture:false,liveExecutionVerified:false,authenticationVerified:false};
}
module.exports={redactor,positive,preflight};
