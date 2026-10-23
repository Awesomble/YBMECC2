import {readFileSync} from 'fs';
const f=process.argv[2];
const buf=readFileSync(f);
const n=buf.length/2|0;
const SR=16000, W=160; // 10ms
const out=[];
for(let i=0;i+W<=n;i+=W){let s=0;for(let k=0;k<W;k++){const v=buf.readInt16LE((i+k)*2)/32768;s+=v*v;}
 out.push(Math.sqrt(s/W));}
const mx=Math.max(...out);
let line='';
for(let i=0;i<out.length;i++){const r=out[i]/mx;const c=r<0.02?'.':r<0.08?'_':r<0.2?'-':r<0.4?'=':r<0.7?'#':'@';line+=c;}
// print in rows of 50 (=0.5s)
for(let i=0;i<line.length;i+=50){
  console.log((i*0.01).toFixed(2).padStart(5)+' '+line.slice(i,i+50));
}
// numeric peaks: local maxima of smoothed energy
const sm=out.map((_,i)=>{let s=0,c=0;for(let k=-2;k<=2;k++){if(out[i+k]!==undefined){s+=out[i+k];c++;}}return s/c;});
const on=[];
for(let i=3;i<sm.length-3;i++){
  if(sm[i]>sm[i-1]&&sm[i]>=sm[i+1]&&sm[i]/mx>0.15){
    // walk back to rise start
    let j=i; while(j>0 && sm[j-1]<sm[j]*0.92) j--;
    on.push([(j*0.01).toFixed(3),(i*0.01).toFixed(3),(sm[i]/mx).toFixed(2)]);
  }
}
console.log('peaks (riseStart, peak, rel):', JSON.stringify(on));
