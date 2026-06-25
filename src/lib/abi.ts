export const ERC20_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  }
] as const;

export const INTEGRATOR_ABI = [
  {
    inputs: [
      { name: "client", type: "address" },
      { name: "productId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "currency", type: "bytes32" },
      { name: "circleId", type: "bytes32" },
      { name: "relayPubKey", type: "bytes32" },
      { name: "totalFeeAmount", type: "uint256" },
      { name: "merchantAmount", type: "uint256" }
    ],
    name: "userPlaceOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "client", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "currency", type: "bytes32" },
      { name: "circleId", type: "bytes32" },
      { name: "relayPubKey", type: "bytes32" }
    ],
    name: "userInitiateSellBack",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;
