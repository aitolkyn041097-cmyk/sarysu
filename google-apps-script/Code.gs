// Paste this entire file into the Google Apps Script editor attached to your spreadsheet.
const SPREADSHEET_ID = "1-11ekWroxvJjHRIPpp6v_IprH0RnygjMQ_BCNMq5tNo";
const SHEET_GID = 0;
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
// Demonstration answers, inserted only into an empty sheet.
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

const KEYS = ['grp','awareness','dairy','eco','uses','products','importance','buy','barriers'];
const HEADERS = ['id','source','created_at', ...KEYS, 'suggestion_json'];
function validate_(input) {
  if (!input || typeof input !== 'object' || single.some(key => !Q[key].includes(input[key]))) throw new Error('INVALID_RESPONSE');
  if (multi.some(key => !Array.isArray(input[key]) || !input[key].length || input[key].length > Q[key].length ||
      input[key].some(value => !Q[key].includes(value)) || new Set(input[key]).size !== input[key].length)) throw new Error('INVALID_RESPONSE');
  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5 ||
      (input.suggestion !== undefined && (typeof input.suggestion !== 'string' || input.suggestion.length > 400))) throw new Error('INVALID_RESPONSE');
  return {...cleanRow(input), suggestion:(input.suggestion || '').trim()};
}
function encode_(row, id, source) {
  // JSON string protects free text from being interpreted as a spreadsheet formula.
  return [id, source, new Date().toISOString(), ...KEYS.map(key => Array.isArray(row[key]) ? JSON.stringify(row[key]) : row[key]), JSON.stringify(row.suggestion || '')];
}
function decode_(cells) {
  const row = Object.fromEntries(KEYS.map((key, i) => [key, cells[i+3]]));
  multi.forEach(key => { row[key] = JSON.parse(row[key]); });
  row.importance = Number(row.importance);
  row.suggestion = JSON.parse(cells[12]);
  return validate_(row);
}
function sheet_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().find(value => value.getSheetId() === SHEET_GID);
  if (!sheet) throw new Error('SHEET_NOT_FOUND');
  if (sheet.getLastRow() === 0) {
    const values = [HEADERS, ...baseline.map((row, i) => encode_(row, `demo-${i+1}`, 'demo'))];
    if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
    if (sheet.getMaxColumns() < HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
    sheet.getRange(1,1,values.length,HEADERS.length).setValues(values);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  }
  return sheet;
}
function rows_(sheet) {
  if (sheet.getLastColumn() !== HEADERS.length) throw new Error('SHEET_SCHEMA_MISMATCH');
  const values = sheet.getDataRange().getValues();
  if (JSON.stringify(values[0]) !== JSON.stringify(HEADERS)) throw new Error('SHEET_SCHEMA_MISMATCH');
  const ids = new Set();
  return values.slice(1).filter(cells => cells.some(value => value !== '')).map(cells => {
    if (!cells[0] || ids.has(cells[0]) || !['demo','submitted'].includes(cells[1])) throw new Error('SHEET_SCHEMA_MISMATCH');
    ids.add(cells[0]);
    return {id:cells[0], source:cells[1], response:decode_(cells)};
  });
}
function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function snapshot_(rows, receipt) {
  return {ok:true, rows:rows.map(row => cleanRow(row.response)), demoCount:rows.filter(row => row.source === 'demo').length,
    saved:!!receipt && rows.some(row => row.id === receipt && row.source === 'submitted')};
}
function error_(error) {
  const known = ['INVALID_RESPONSE','ID_CONFLICT','SHEET_SCHEMA_MISMATCH','SHEET_NOT_FOUND'];
  return {ok:false, error:known.includes(error.message) ? error.message : 'SHEETS_UNAVAILABLE'};
}
function json_(data, callback) {
  const value = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback ? `${callback}(${value});` : value)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = params.callback;
  // JSONP is read-only and publishes only anonymous choices, never comments or account details.
  if (callback && !/^sarysu_[a-zA-Z0-9_]+$/.test(callback)) return json_({ok:false,error:'INVALID_CALLBACK'});
  let result;
  try { result = locked_(() => snapshot_(rows_(sheet_()), params.receipt)); }
  catch (error) { result = error_(error); }
  return json_(result, callback);
}
function doPost(e) {
  let result;
  try {
    const text = e && e.postData && e.postData.contents;
    if (!text || text.length > 16000) throw new Error('INVALID_RESPONSE');
    const body = JSON.parse(text);
    if (!body || typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) throw new Error('INVALID_RESPONSE');
    const response = validate_(body.response);
    result = locked_(() => {
      const sheet = sheet_();
      const rows = rows_(sheet);
      const previous = rows.find(row => row.id === body.id);
      if (previous) {
        if (JSON.stringify(previous.response) !== JSON.stringify(response)) throw new Error('ID_CONFLICT');
      } else {
        sheet.appendRow(encode_(response, body.id, 'submitted'));
        SpreadsheetApp.flush();
        rows.push({id:body.id, source:'submitted', response});
      }
      return snapshot_(rows, body.id);
    });
  } catch (error) { result = error_(error); }
  return json_(result);
}
// Optional: run once in the editor to authorize and initialize the sheet before publishing.
function setup() { return locked_(() => snapshot_(rows_(sheet_()))); }
