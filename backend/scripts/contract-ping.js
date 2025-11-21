require("dotenv").config({ path: "../.env" });
const { ethers } = require("ethers");

// Minimal ABI for loanCounter
const abi = [
  {
    "inputs": [],
    "name": "loanCounter",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, provider);

  const code = await provider.getCode(process.env.CONTRACT_ADDRESS);
  const bytecodeFound = code && code !== "0x";

  if (bytecodeFound) {
    const loanCount = await contract.loanCounter();
    console.log({ bytecodeFound: true, loanCount: loanCount.toString() });
  } else {
    console.log({ bytecodeFound: false });
  }
})();
