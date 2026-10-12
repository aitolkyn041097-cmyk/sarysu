(function(){
"use strict";
const Q = {
  grp: ["Оқушы","Ата-ана","Мұғалім","Басқа"],
  awareness: ["Иә, жақсы білемін","Естігенім бар","Білмеймін"],
  dairy: ["Иә, жиі","Кейде","Жоқ"],
  eco: ["Иә, зиян","Зияны аз","Зиянсыз","Білмеймін"],
  uses: ["Сусын ретінде ішеміз","Қамыр илеуге (нан, бауырсақ)","Құрт, ірімшік жасауға","Малға, үй құстарына береміз","Өсімдіктерді суарамыз","Шаш пен тері күтіміне","Төгіп тастаймыз","Үйде сарысу болмайды"],
  products: ["Жеміс қосылған сусын","Протеинді коктейль","Нан мен тоқаш","Кәмпит, десерт","Сабын, шампунь, косметика","Табиғи тыңайтқыш","Мал азығына қоспа","Биоқаптама, биопластик"],
  buy: ["Иә","Мүмкін","Жоқ"],
  barriers: ["Дәмі ұнамайды","Тез бұзылады","Қалай пайдаланатынын білмеймін","Уақыт жетпейді","Дайын өнім сатылмайды","Кедергі жоқ"]
};

const single = ["grp", "awareness", "dairy", "eco", "buy"];
const multi = ["uses", "products", "barriers"];
function cleanRow(d){
  if (!d || typeof d !== "object" || single.some(k => !Q[k].includes(d[k]))) return null;
  const r = Object.fromEntries(single.map(k => [k, d[k]]));
  multi.forEach(k => { r[k] = [...new Set(Array.isArray(d[k]) ? d[k].filter(v => Q[k].includes(v)) : [])]; });
  r.importance = Number.isInteger(Number(d.importance)) && d.importance >= 1 && d.importance <= 5 ? Number(d.importance) : 3;
  return r;
}
// Demonstration baseline, seeded by Google Apps Script only into an empty sheet.
const distributions = {grp:[45,18,20,33], awareness:[28,39,49], dairy:[24,43,49], eco:[62,20,8,26], buy:[48,51,17], importance:[5,9,24,35,43]};
function choose(counts, position){
  let cumulative = 0;
  return counts.findIndex(count => (cumulative += count) > position);
}
const baseline = Array.from({length:116}, (_, i) => {
  const row = {};
  single.forEach((key, j) => { row[key] = Q[key][choose(distributions[key], (i * 37 + j * 19) % 116)]; });
  row.importance = choose(distributions.importance, (i * 43) % 116) + 1;
  row.uses = [Q.uses[i < 62 ? 6 : i < 80 ? 7 : i % 6]];
  row.products = [Q.products[(i * 7) % 8]];
  if (i % 3 === 0 && !row.products.includes(Q.products[4])) row.products.push(Q.products[4]);
  row.barriers = [Q.barriers[i < 57 ? 2 : i % 6]];
  return Object.freeze(row);
});
let remote = null;
function summarize(){
  const rows = remote ? remote.rows : [];
  const groups = [
    {key:"teachers",label:"Мұғалімдер",answer:"Мұғалім",color:"#2F6B45",icon:"👩‍🏫"},
    {key:"students",label:"Оқушылар",answer:"Оқушы",color:"#8DB64A",icon:"🎓"},
    {key:"parents",label:"Ата-аналар",answer:"Ата-ана",color:"#E3B23C",icon:"🏡"},
    {key:"others",label:"Басқалар",answer:"Басқа",color:"#3E8DB8",icon:"🌿"}
  ].map(g => ({...g,value:rows.filter(r => r.grp === g.answer).length}));
  return {total:rows.length, rows, groups, demoCount:remote ? remote.demoCount : 0};
}
let loading = null;
let pendingSubmission = null;
function endpoint(){
  const url = globalThis.SARYSU_CONFIG?.appsScriptUrl || "";
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) throw new Error("SETUP_REQUIRED");
  return url;
}
function readRemote(receipt){
  const url = new URL(endpoint());
  return new Promise((resolve, reject) => {
    const callback = `sarysu_${crypto.randomUUID().replaceAll("-", "")}`;
    const script = document.createElement("script");
    let timer;
    const cleanup = () => {
      clearTimeout(timer); script.remove();
      // A late response after timeout must not trigger an unhandled callback error.
      globalThis[callback] = () => {};
      setTimeout(() => { delete globalThis[callback]; }, 60000);
    };
    globalThis[callback] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("SHEETS_UNAVAILABLE")); };
    url.searchParams.set("callback", callback);
    url.searchParams.set("t", String(Date.now()));
    if (receipt) url.searchParams.set("receipt", receipt);
    script.src = url.href;
    timer = setTimeout(() => { cleanup(); reject(new Error("SHEETS_UNAVAILABLE")); }, 25000);
    document.head.append(script);
  });
}
function accept(data){
  if (!data.ok) throw new Error(data.error || "SHEETS_UNAVAILABLE");
  if (!Array.isArray(data.rows) || !Number.isInteger(data.demoCount) || data.demoCount < 0 || data.demoCount > data.rows.length) throw new Error("INVALID_RESULTS");
  const rows = data.rows.map(cleanRow);
  if (rows.some(row => !row)) throw new Error("INVALID_RESULTS");
  remote = {rows, demoCount:data.demoCount};
  return summarize();
}
async function request(method, body){
  if (method === "GET") return accept(await readRemote());
  // Simple POST works from GitHub Pages without a CORS preflight. An opaque response is NOT a save confirmation.
  try {
    await fetch(endpoint(), {method:"POST", mode:"no-cors", credentials:"omit", redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body), signal:AbortSignal.timeout(25000)});
  } catch (error) {
    if (error.message === "SETUP_REQUIRED") throw error;
    // Google may have saved the answer before the connection was interrupted; check the receipt below.
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 1500));
    const data = await readRemote(body.id);
    if (!data.ok) throw new Error(data.error || "SHEETS_UNAVAILABLE");
    if (data.saved === true) return accept(data);
  }
  throw new Error("SAVE_NOT_CONFIRMED");
}
function refresh(){
  if (!loading) loading = request("GET").finally(() => { loading = null; });
  return loading;
}
async function submit(response){
  // Reuse the request ID after network failures or a page reload, so retries do not add another row.
  const serialized = JSON.stringify(response);
  let pending = pendingSubmission;
  try { pending = JSON.parse(sessionStorage.getItem("sarysu-pending-v1")) || pending; } catch (_) {}
  if (!pending || pending.serialized !== serialized) pending = {id:crypto.randomUUID(), serialized};
  pendingSubmission = pending;
  try { sessionStorage.setItem("sarysu-pending-v1", JSON.stringify(pending)); } catch (_) {}
  if (loading) { try { await loading; } catch (_) {} }
  const data = await request("POST", {id:pending.id, response});
  pendingSubmission = null;
  try { sessionStorage.removeItem("sarysu-pending-v1"); } catch (_) {}
  return data;
}
globalThis.SARYSU_SURVEY = {Q, baseline, cleanRow, summarize, refresh, submit};
})();
