export const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
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
