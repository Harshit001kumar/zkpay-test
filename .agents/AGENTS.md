## ZkPay User Preferences
- The app is mainly for mobile — always prioritize mobile-first design.
- Keep design minimalist — no unnecessary UI clutter.
- The user prefers to run git commands themselves (Windows permission issues block agent git access).
- Use `npm` instead of `yarn` — yarn is not installed on this machine.
- When working with Etherscan/Basescan APIs, use the V2 API format (single API key string, not per-network objects).
- When passing Ethereum addresses in Hardhat scripts, always lowercase them and use `ethers.getAddress()` to fix checksums.
