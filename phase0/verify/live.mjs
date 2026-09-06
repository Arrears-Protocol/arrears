const base = process.argv[2];
const r = await fetch(`${base}/api/version`).then(x => x.json());
console.log(JSON.stringify(r, null, 2));
if (process.argv[3]) {
  const match = r.commitShort === process.argv[3];
  console.log(`\nlocal HEAD  ${process.argv[3]}`);
  console.log(`live commit ${r.commitShort}`);
  console.log(match ? 'MATCH — production is not stale' : 'MISMATCH — production is stale');
  process.exit(match ? 0 : 1);
}
