require("dotenv").config({ path: "../.env" });
const { ethers } = require("ethers");

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const network = await provider.getNetwork();
  const block = await provider.getBlockNumber();
  console.log({ chainId: network.chainId, name: network.name, block });
})();
