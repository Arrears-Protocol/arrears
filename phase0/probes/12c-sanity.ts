/** sanity: does the chunked getLogs path work at all? Query a HIGH-frequency Aave event. */
import { JsonRpcProvider } from 'ethers';
const R = new JsonRpcProvider('https://1rpc.io/eth');
const AAVE='0x87870bCa3F3fD6335C3F4ce8392D69350B4fA4E2';
const SUPPLY='0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61'; // Supply(...)
const LIQ='0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286';
const TIP=25916380;
(async()=>{
  for (const [name,topic] of [['Supply',SUPPLY],['LiquidationCall',LIQ]] as const) {
    let total=0, windows=0, errs=0;
    for (let f=TIP-500; f<TIP; f+=50) {
      try { const l=await R.send('eth_getLogs',[{address:AAVE,topics:[topic],
        fromBlock:'0x'+f.toString(16),toBlock:'0x'+Math.min(f+49,TIP).toString(16)}]);
        total+=l.length; windows++; } catch(e:any){ errs++; }
    }
    console.log(`${name.padEnd(16)} windows_ok=${windows} errs=${errs} events=${total}`);
  }
  // how far back to find ONE liquidation? step back in 5k jumps, sampling 50-block windows
  console.log('\nsampling backwards for any LiquidationCall:');
  for (const back of [0, 10_000, 50_000, 200_000, 1_000_000, 3_000_000]) {
    const f = TIP - back - 50;
    try { const l = await R.send('eth_getLogs',[{address:AAVE,topics:[LIQ],
      fromBlock:'0x'+f.toString(16),toBlock:'0x'+(f+49).toString(16)}]);
      console.log(`  ${back?'-'+back.toLocaleString():'tip'} blocks (h~${f}) -> ${l.length} liquidations`);
    } catch(e:any){ console.log(`  -${back} -> ERR ${String(e.shortMessage??e.message).slice(0,60)}`); }
  }
})();
