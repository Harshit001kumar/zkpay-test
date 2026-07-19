const fetch = require('node-fetch');

async function check() {
  try {
    const rpc = 'https://base-sepolia-rpc.publicnode.com';
    const diamond = '0xd8d6acdbc5dbafa073827f3335dbb06df31580f6';
    const user = '0x0000000000000000000000000000000000000000';
    // Function selector for userSellLimit(address,bytes32) is 0xd1ebdbb3
    // Wait, let's just test eth_call to see if it reverts.
    // bytes32("INR") = 0x494e520000000000000000000000000000000000000000000000000000000000
    const data = "0xd1ebdbb30000000000000000000000000000000000000000000000000000000000000000494e520000000000000000000000000000000000000000000000000000000000";
    
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: diamond, data: data }, 'latest']
    };
    
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    console.log("RPC Response:", json);
  } catch(e) {
    console.log("Error:", e);
  }
}
check();
