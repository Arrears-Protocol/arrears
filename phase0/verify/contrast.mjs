const hex=h=>{h=h.replace('#','');if(h.length===3)h=[...h].map(c=>c+c).join('');return[0,2,4].map(i=>parseInt(h.slice(i,i+2),16))};
const lum=c=>{const[r,g,b]=hex(c).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
const cr=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05)};
const T={
  dark:{bg:'#0a0c0f',raised:'#101317',fg:'#f7f8f8',fg2:'#b3bac2',fg3:'#838d99',pass:'#7fa88a',miss:'#d08a6b',moved:'#d9a13b',kept:'#6d9dc5',away:'#8b93a1'},
  light:{bg:'#ffffff',raised:'#f7f8f8',fg:'#101317',fg2:'#5d6773',fg3:'#838d99',pass:'#3f6b4d',miss:'#9c4f34',moved:'#966313',kept:'#35688f',away:'#5d6673'},
};
let fail=0;
for(const [name,t] of Object.entries(T)){
  console.log(`\n── ${name} ──`);
  for(const bgk of ['bg','raised']){
    for(const k of ['fg','fg2','fg3','pass','miss','moved','kept','away']){
      const r=cr(t[k],t[bgk]);
      // body text needs 4.5; large display and non-essential meta need 3.0
      const min = (k==='fg3') ? 3.0 : 4.5;
      const ok = r>=min;
      if(!ok) fail++;
      console.log(`  ${(k+' on '+bgk).padEnd(16)} ${r.toFixed(2).padStart(5)}  min ${min}  ${ok?'PASS':'FAIL'}`);
    }
  }
}
console.log(fail?`\n${fail} pair(s) below threshold`:'\nall pairs meet WCAG AA for their role');
process.exit(fail?1:0);
