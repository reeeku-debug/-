// テスト用のスプレッドシートのモック（範囲外・サイズ違い・固定行列をまたぐ結合はエラーにする）
function A1(a){const m=a.match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);const c=s=>[...s].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
 return {r:m[2]?+m[2]:1,c:c(m[1]),r2:m[4]?+m[4]:(m[2]?+m[2]:null),c2:m[3]?c(m[3]):c(m[1])};}
class Sheet{constructor(n){this.n=n;this.rows=1000;this.cols=26;this.v={};this.merges=[];this.fr=0;this.fc=0;}
 getName(){return this.n} getMaxRows(){return this.rows} getMaxColumns(){return this.cols}
 getLastRow(){let m=0;for(const k in this.v){if(this.v[k]!==''&&this.v[k]!=null)m=Math.max(m,+k.split(',')[0])}return m}
 insertRowsAfter(a,n){this.rows+=n} insertColumnsAfter(a,n){this.cols+=n}
 getRange(a,b,c,d){let r,co,nr,nc;if(typeof a==='string'){const x=A1(a);r=x.r;co=x.c;nr=(x.r2==null?this.rows:x.r2)-r+1;nc=x.c2-co+1}else{r=a;co=b;nr=c||1;nc=d||1}
  if(r<1||co<1||nr<1||nc<1||r+nr-1>this.rows||co+nc-1>this.cols)throw new Error(`${this.n}: range out of bounds ${r},${co},${nr},${nc} (max ${this.rows}x${this.cols})`);
  return new Range(this,r,co,nr,nc)}
 setFrozenRows(n){this.chk(n,this.fc);this.fr=n} setFrozenColumns(n){this.chk(this.fr,n);this.fc=n}
 chk(fr,fc){for(const m of this.merges){if(fc&&m.c<=fc&&m.c+m.nc-1>fc)throw new Error(this.n+': merge crosses frozen col');if(fr&&m.r<=fr&&m.r+m.nr-1>fr)throw new Error(this.n+': merge crosses frozen row')}}
 clear(){this.v={}} getCharts(){return[]} removeChart(){} insertChart(){} newChart(){const b=new Proxy({},{get:(t,k)=>k==='build'?()=>({}):()=>b});return b}
 appendRow(a){const r=this.getLastRow()+1;if(r>this.rows)this.rows=r;this.getRange(r,1,1,a.length).setValues([a])} deleteRows(){} getLastColumn(){return this.cols}
 getFilter(){return null} clearConditionalFormatRules(){} setConditionalFormatRules(){} setColumnWidth(){} setColumnWidths(){} setRowHeight(){}
}
class Range{constructor(s,r,c,nr,nc){Object.assign(this,{s,r,c,nr,nc})}
 setValues(v){if(v.length!==this.nr||v.some(x=>x.length!==this.nc))throw new Error(`${this.s.n}: setValues size ${v.length}x${v[0]&&v[0].length} vs ${this.nr}x${this.nc} at ${this.r},${this.c}`);
  v.forEach((row,i)=>row.forEach((x,j)=>this.s.v[(this.r+i)+','+(this.c+j)]=x));return this}
 setValue(x){this.s.v[this.r+','+this.c]=x;return this}
 getValues(){const o=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++){const x=this.s.v[(this.r+i)+','+(this.c+j)];row.push(x==null?'':x)}o.push(row)}return o}
 getDisplayValues(){return this.getValues().map(r=>r.map(String))} getValue(){return this.getValues()[0][0]}
 merge(){if(this.s.fc&&this.c<=this.s.fc&&this.c+this.nc-1>this.s.fc)throw new Error('merge crosses frozen');this.s.merges.push(this);return this}
 clearContent(){for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++)delete this.s.v[(this.r+i)+','+(this.c+j)];return this}
 breakApart(){this.s.merges=[];return this} createFilter(){return this} getA1Notation(){return ''}
}
const chain=['setNumberFormat','setBackground','setFontWeight','setFontSize','setFontColor','setWrap','setVerticalAlignment','setBorder','setDataValidation','setHorizontalAlignment','setFontFamily'];
chain.forEach(m=>Range.prototype[m]=function(){return this});
class SS{constructor(){this.sh=[]} getSheetByName(n){return this.sh.find(s=>s.n===n)||null} insertSheet(n){const s=new Sheet(n);this.sh.push(s);return s}
 getSheets(){return this.sh} deleteSheet(s){this.sh=this.sh.filter(x=>x!==s)} setActiveSheet(s){this.act=s} moveActiveSheet(i){this.sh=this.sh.filter(x=>x!==this.act);this.sh.splice(i-1,0,this.act)} toast(){} getUrl(){return ''}}

function makeContext(fs, vm, file) {
  const ss = new SS();
  const cf = new Proxy({}, { get: () => () => cf });
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {}, newDataValidation: () => cf, newConditionalFormatRule: () => cf, BorderStyle: {} },
    Charts: { ChartType: {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d) => d.toISOString() },
    Session: { getScriptTimeZone: () => 'Asia/Tokyo' },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return { ctx, ss };
}
module.exports = { makeContext };
