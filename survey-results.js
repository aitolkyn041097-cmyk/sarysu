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

const storageKey = "sarysu-survey-local-v1";
const single = ["grp", "awareness", "dairy", "eco", "buy"];
const multi = ["uses", "products", "barriers"];
function cleanRow(d){
  if (!d || typeof d !== "object" || single.some(k => !Q[k].includes(d[k]))) return null;
  const r = Object.fromEntries(single.map(k => [k, d[k]]));
  multi.forEach(k => { r[k] = [...new Set(Array.isArray(d[k]) ? d[k].filter(v => Q[k].includes(v)) : [])]; });
  r.importance = Number.isInteger(Number(d.importance)) && d.importance >= 1 && d.importance <= 5 ? Number(d.importance) : 3;
  return r;
}
// Synthetic baseline, kept separate from submitted responses and never saved to storage.
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
function loadLocal(){
  try { const value = JSON.parse(localStorage.getItem(storageKey)); return Array.isArray(value) ? value.map(cleanRow).filter(Boolean) : []; }
  catch (_) { return []; }
}
function summarize(realRows = loadLocal()){
  const rows = [...baseline, ...realRows.map(cleanRow).filter(Boolean)];
  const groups = [
    {key:"teachers",label:"Мұғалімдер",answer:"Мұғалім",color:"#2F6B45",icon:"👩‍🏫"},
    {key:"students",label:"Оқушылар",answer:"Оқушы",color:"#8DB64A",icon:"🎓"},
    {key:"parents",label:"Ата-аналар",answer:"Ата-ана",color:"#E3B23C",icon:"🏡"},
    {key:"others",label:"Басқалар",answer:"Басқа",color:"#3E8DB8",icon:"🌿"}
  ].map(g => ({...g,value:rows.filter(r => r.grp === g.answer).length}));
  return {total:rows.length, rows, groups};
}
window.SARYSU_SURVEY = {Q, storageKey, baseline, cleanRow, loadLocal, summarize};
})();
