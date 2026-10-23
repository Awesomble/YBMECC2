import {readFileSync} from 'fs';
const [raw,a,b]=process.argv.slice(2);
const buf=readFileSync(raw); const n=buf.length/2|0;
const SR=16000, HOP=80, WIN=320;           // 5ms hop · 20ms window
const db=[];
for(let i=0;i+WIN<=n;i+=HOP){let s=0;for(let k=0;k<WIN;k++){const v=buf.readInt16LE((i+k)*2)/32768;s+=v*v;}
  db.push(20*Math.log10(Math.sqrt(s/WIN)+1e-12));}
const t0=parseFloat(a), t1=parseFloat(b);
let prev=null;
for(let i=Math.round(t0/0.005);i<Math.min(db.length,Math.round(t1/0.005));i++){
  const t=i*0.005, v=db[i];
  const bar='#'.repeat(Math.max(0,Math.round((v+70)/2)));
  console.log(t.toFixed(3)+'  '+v.toFixed(1).padStart(6)+' dBFS  '+bar);
}
