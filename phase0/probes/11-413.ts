import { JsonRpcProvider } from 'ethers';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const FROM='0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030', SINK='0x000000000000000000000000000000000000dEaD';
const mk=(n:number)=>'0x'+'ab'.repeat(n);
async function ok(n:number){try{await CC3.estimateGas({to:SINK,data:mk(n),from:FROM});return true;}catch(e:any){return !String(e.message).includes('413');}}
(async()=>{
  let lo=400_000, hi=800_000;
  console.log(`binary search calldata bytes accepted by public RPC: lo=${lo} hi=${hi}`);
  while(hi-lo>2_000){const mid=(lo+hi)>>1; const r=await ok(mid); console.log(`  ${mid} -> ${r?'OK':'413'}`); if(r)lo=mid;else hi=mid;}
  console.log(`\nmax calldata accepted ~= ${lo.toLocaleString()} bytes (JSON-RPC body ~= ${(lo*2/1024/1024).toFixed(2)} MiB hex)`);
  console.log(`at ~2,522 calldata bytes per proven leg -> ~${Math.floor(lo/2522)} legs of calldata could ride in one tx`);
})();
