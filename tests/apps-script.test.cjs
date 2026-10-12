const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const code = fs.readFileSync('google-apps-script/Code.gs','utf8');
function createGoogle(initial = []) {
  let values = structuredClone(initial), seeds = 0, appends = 0, locked = false;
  const sheet = {
    getSheetId:()=>0, getLastRow:()=>values.length,
    getLastColumn:()=>Math.max(0,...values.map(row=>row.length)),
    getMaxRows:()=>1000, getMaxColumns:()=>26,
    getRange:()=>({setValues:rows=>{assert(locked); seeds++; values=structuredClone(rows);}}),
    getDataRange:()=>({getValues:()=>structuredClone(values)}),
    setFrozenRows:()=>{}, appendRow:row=>{assert(locked); appends++; values.push(structuredClone(row));}
  };
  const context = vm.createContext({
    SpreadsheetApp:{openById:()=>({getSheets:()=>[sheet]}),flush:()=>{}},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert(!locked); locked=true;},releaseLock:()=>{locked=false;}})},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  });
  vm.runInContext(code,context);
  return {context,sheet,get values(){return values;},get seeds(){return seeds;},get appends(){return appends;},
    read:()=>JSON.parse(context.doGet({parameter:{}}).text),
    post:body=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text),
    reply:()=>({...vm.runInContext('baseline[0]',context),suggestion:'=HYPERLINK("https://example.com")'})};
}
test('empty sheet seeded once and synthetic records labelled',()=>{
  const g=createGoogle(); assert.equal(g.read().rows.length,116); assert.equal(g.read().demoCount,116);
  assert.equal(g.seeds,1); assert.equal(g.values.length,117);
  assert.equal(g.values[1][1],'demo');
});
test('new reply increments to 117; retry is idempotent and comment is not public',()=>{
  const g=createGoogle(); g.read(); const body={id:randomUUID(),response:g.reply()};
  const saved=g.post(body); assert.equal(saved.rows.length,117); assert.equal(saved.saved,true);
  assert.equal(g.post(body).rows.length,117); assert.equal(g.appends,1);
  assert(!JSON.stringify(saved).includes('HYPERLINK'));
  assert.equal(g.values.at(-1)[12][0],'"'); // stored as JSON text, never a formula
  assert.equal(g.post({...body,response:{...body.response,importance:5}}).error,'ID_CONFLICT');
});
test('existing compatible sheet is not seeded; unrelated data is not overwritten',()=>{
  const source=createGoogle(); source.read(); const rows=[source.values[0],source.values[1]];
  const existing=createGoogle(rows); assert.equal(existing.read().rows.length,1); assert.equal(existing.seeds,0);
  const unrelated=createGoogle([['keep me']]); assert.equal(unrelated.read().error,'SHEET_SCHEMA_MISMATCH');
  assert.equal(unrelated.seeds,0); assert.deepEqual(unrelated.values,[['keep me']]);
});
test('invalid submissions and unsafe JSONP callbacks cannot write',()=>{
  const g=createGoogle();
  assert.equal(g.post({id:randomUUID(),response:{...g.reply(),uses:[]}}).error,'INVALID_RESPONSE');
  assert.equal(g.appends,0); assert.equal(g.seeds,0);
  const result=g.context.doGet({parameter:{callback:'alert(1)'}});
  assert.equal(JSON.parse(result.text).error,'INVALID_CALLBACK'); assert.equal(g.seeds,0);
});
function browser(g,{save=true,failAfterSave=false,configured=true}={}) {
  let storage=null, requests=[]; let context;
  context=vm.createContext({
    SARYSU_CONFIG:{appsScriptUrl:configured?'https://script.google.com/macros/s/EXAMPLE/exec':''},
    crypto:{randomUUID},URL,AbortSignal,
    sessionStorage:{getItem:()=>storage,setItem:(_,value)=>{storage=value;},removeItem:()=>{storage=null;}},
    setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms===1500?0:ms);if(ms===60000)timer.unref();return timer;},clearTimeout,
    document:{createElement:()=>({remove(){}}),head:{append:script=>{
      const url=new URL(script.src); const response=g.context.doGet({parameter:Object.fromEntries(url.searchParams)});
      vm.runInContext(response.text,context);
    }}},
    fetch:async(url,options)=>{requests.push(options);if(save)g.post(JSON.parse(options.body));if(failAfterSave)throw new Error('network');return {type:'opaque'};}
  });
  vm.runInContext(fs.readFileSync('survey-results.js','utf8'),context);
  return {api:context.SARYSU_SURVEY,requests};
}
test('static browser reads JSONP and confirms opaque POST against sheet receipt',async()=>{
  const g=createGoogle(), b=browser(g,{failAfterSave:true});
  await b.api.refresh(); assert.equal(b.api.summarize().total,116);
  const result=await b.api.submit(g.reply()); assert.equal(result.total,117);
  assert.equal(b.requests[0].mode,'no-cors'); assert.equal(b.requests[0].method,'POST');
  await b.api.refresh(); assert.equal(b.api.summarize().total,117);
});
test('opaque success without a saved row is not shown as success; retry reuses ID',async()=>{
  const g=createGoogle(), b=browser(g,{save:false});
  await b.api.refresh();
  await assert.rejects(b.api.submit(g.reply()),/SAVE_NOT_CONFIRMED/);
  await assert.rejects(b.api.submit(g.reply()),/SAVE_NOT_CONFIRMED/);
  assert.equal(JSON.parse(b.requests[0].body).id,JSON.parse(b.requests[1].body).id);
  assert.equal(b.api.summarize().total,116);
});
test('missing deployment URL gives a setup error without network traffic',async()=>{
  const b=browser(createGoogle(),{configured:false});
  await assert.rejects(b.api.refresh(),/SETUP_REQUIRED/); assert.equal(b.requests.length,0);
});
