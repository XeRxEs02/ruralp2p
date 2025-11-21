const { Web3 } = require('web3');
const { v4: uuidv4 } = require('uuid');

/**
 * BlockchainService - Handles all blockchain interactions for RuralConnect P2P platform
 * Supports Polygon Mumbai testnet and local blockchain for development
 * Manages smart contract interactions for loan lifecycle and payments
 */
class BlockchainService {
  constructor() {
    this.networkConfig = {
      polygon_mumbai: {
        rpcUrl: process.env.POLYGON_MUMBAI_RPC_URL || 'https://rpc-mumbai.maticvigil.com/',
        chainId: 80001,
        name: 'Polygon Mumbai Testnet',
        currency: 'MATIC',
        blockExplorer: 'https://mumbai.polygonscan.com'
      },
      polygon_amoy: {
        rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'https://rpc-amoy.polygon.technology/',
        chainId: 80002,
        name: 'Polygon Amoy Testnet',
        currency: 'MATIC',
        blockExplorer: 'https://amoy.polygonscan.com'
      },
      polygon_mainnet: {
        rpcUrl: process.env.POLYGON_MAINNET_RPC_URL || 'https://polygon-rpc.com/',
        chainId: 137,
        name: 'Polygon Mainnet',
        currency: 'MATIC',
        blockExplorer: 'https://polygonscan.com'
      },
      local: {
        rpcUrl: 'http://127.0.0.1:8545',
        chainId: 1337,
        name: 'Local Blockchain',
        currency: 'ETH',
        blockExplorer: null
      }
    };

    this.currentNetwork = process.env.BLOCKCHAIN_NETWORK || 'polygon_amoy';

    // Determine mock mode based on environment variable
    const mockModeValue = process.env.BLOCKCHAIN_MOCK_MODE;
    this.mockMode = mockModeValue === 'true' || mockModeValue === true;

    console.log(`Blockchain mock mode: ${this.mockMode}`);
    console.log(`Environment variable BLOCKCHAIN_MOCK_MODE: "${mockModeValue}"`);

    // Override based on specific conditions
    if (mockModeValue === 'false' || mockModeValue === false) {
      this.mockMode = false;
      console.log('Forcing real blockchain mode');
    } else if (this.mockMode) {
      console.log('Using mock blockchain mode');
    } else {
      console.log('Using real blockchain mode');
    }

    // Set default account from environment
    this.defaultAccount = process.env.WALLET_ADDRESS || '0xaAaFefF1051735671562A735013560E62ede782f';
    console.log(`Using default account: ${this.defaultAccount}`);

    if (!this.mockMode) {
      this.initializeWeb3();
    } else {
      this.mockTransactions = new Map();
      console.log('BlockchainService initialized in MOCK mode');
    }

    // Always initialize mockTransactions
    if (!this.mockTransactions) {
      this.mockTransactions = new Map();
    }

    // Smart contract ABI for RuralConnectLoan (matches deployed contract)
    this.contractABIs = {
      loanContract: [
        {
          "inputs": [],
          "stateMutability": "nonpayable",
          "type": "constructor"
        },
        {
          "inputs": [
            {
              "internalType": "string",
              "name": "_documentHash",
              "type": "string"
            }
          ],
          "name": "checkDocument",
          "outputs": [
            {
              "internalType": "bool",
              "name": "",
              "type": "bool"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_borrower",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_lender",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_amount",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "_dueDate",
              "type": "uint256"
            },
            {
              "internalType": "string",
              "name": "_docHash",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "_purpose",
              "type": "string"
            },
            {
              "internalType": "uint256",
              "name": "_interestRate",
              "type": "uint256"
            }
          ],
          "name": "createLoan",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "uint256",
              "name": "_loanId",
              "type": "uint256"
            }
          ],
          "name": "getLoan",
          "outputs": [
            {
              "components": [
                {
                  "internalType": "uint256",
                  "name": "loanId",
                  "type": "uint256"
                },
                {
                  "internalType": "address",
                  "name": "borrower",
                  "type": "address"
                },
                {
                  "internalType": "address",
                  "name": "lender",
                  "type": "address"
                },
                {
                  "internalType": "uint256",
                  "name": "amount",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "dueDate",
                  "type": "uint256"
                },
                {
                  "internalType": "bool",
                  "name": "repaid",
                  "type": "bool"
                },
                {
                  "internalType": "string",
                  "name": "documentHash",
                  "type": "string"
                },
                {
                  "internalType": "uint256",
                  "name": "createdAt",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "repaidAt",
                  "type": "uint256"
                },
                {
                  "internalType": "string",
                  "name": "purpose",
                  "type": "string"
                },
                {
                  "internalType": "uint256",
                  "name": "interestRate",
                  "type": "uint256"
                }
              ],
              "internalType": "struct RuralConnectLoan.Loan",
              "name": "",
              "type": "tuple"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "loanCounter",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "uint256",
              "name": "_loanId",
              "type": "uint256"
            }
          ],
          "name": "approveLoan",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "uint256",
              "name": "_loanId",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "_repaymentAmount",
              "type": "uint256"
            }
          ],
          "name": "markRepaid",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "string",
              "name": "_documentHash",
              "type": "string"
            }
          ],
          "name": "verifyDocument",
          "outputs": [
            {
              "internalType": "bool",
              "name": "",
              "type": "bool"
            }
          ],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ]
    };

    // Contract addresses
    this.contractAddresses = {
      loanContract: process.env.CONTRACT_ADDRESS || '0xc8394dbfe7F050b3c5aBED9d23FeE76e2055227C'
    };
  }

  /**
   * Initialize Web3 connection
   * @private
   */
  initializeWeb3() {
    try {
      const networkInfo = this.networkConfig[this.currentNetwork];
      this.web3 = new Web3(networkInfo.rpcUrl);

      // Set up account from private key if provided
      if (process.env.PRIVATE_KEY) {
        console.log(`Private key provided: ${process.env.PRIVATE_KEY.substring(0, 10)}...`);
        try {
          const account = this.web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
          this.web3.eth.accounts.wallet.add(account);
          this.defaultAccount = account.address;
          console.log(`Using account: ${this.defaultAccount}`);
        } catch (error) {
          console.error('Error creating account from private key:', error);
          this.defaultAccount = process.env.WALLET_ADDRESS;
          console.log(`Using wallet address: ${this.defaultAccount}`);
        }
      } else {
        // Use the wallet address from env if no private key
        this.defaultAccount = process.env.WALLET_ADDRESS;
        console.log(`Using wallet address: ${this.defaultAccount}`);
      }

      console.log(`BlockchainService connected to ${networkInfo.name}`);
    } catch (error) {
      console.error('Failed to initialize Web3:', error);
      this.mockMode = true;
      console.log('Falling back to MOCK mode');
    }
  }

  /**
   * Create a new loan on blockchain
   * @param {Object} loanData - Loan details
   * @returns {Promise<Object>} Transaction result
   */
  async createLoan(loanData) {
    try {
      const { borrowerAddress, lenderAddress, amount, dueDate, docHash } = loanData;

      if (this.mockMode) {
        return this._createMockTransaction('createLoan', loanData);
      }

      if (!this.contractAddresses.loanContract) {
        throw new Error('Loan contract address not configured');
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract, 
        this.contractAddresses.loanContract
      );

      const gasEstimate = await contract.methods
        .createLoan(borrowerAddress, lenderAddress, amount, dueDate, docHash, 'Agricultural Loan', 1200)
        .estimateGas({ from: this.defaultAccount });

      const tx = await contract.methods
        .createLoan(borrowerAddress, lenderAddress, amount, dueDate, docHash, 'Agricultural Loan', 1200)
        .send({
          from: this.defaultAccount,
          gas: Math.floor(Number(gasEstimate) * 1.2), // 20% buffer
          gasPrice: await this.web3.eth.getGasPrice()
        });

      return {
        success: true,
        txHash: tx.transactionHash,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        contractAddress: this.contractAddresses.loanContract,
        network: this.currentNetwork,
        operation: 'createLoan'
      };

    } catch (error) {
      console.error('Error creating loan on blockchain:', error);
      throw new Error(`Blockchain loan creation failed: ${error.message}`);
    }
  }

  /**
   * Get loan counter from blockchain
   * @returns {Promise<number>} Loan counter
   */
  async getLoanCounter() {
    try {
      if (this.mockMode) {
        return Math.floor(Math.random() * 1000);
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract, 
        this.contractAddresses.loanContract
      );

      const counter = await contract.methods.loanCounter().call();
      return parseInt(counter);

    } catch (error) {
      console.error('Error fetching loan counter from blockchain:', error);
      return 0;
    }
  }

  /**
   * Approve a loan on blockchain
   * @param {string|number} loanId - Loan ID
   * @param {string} lenderAddress - Lender's address
   * @returns {Promise<Object>} Transaction result
   */
  async approveLoan(loanId, lenderAddress) {
    try {
      if (this.mockMode) {
        return this._createMockTransaction('approveLoan', { loanId, lenderAddress });
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract, 
        this.contractAddresses.loanContract
      );

      const tx = await contract.methods
        .approveLoan(loanId)
        .send({
          from: lenderAddress || this.defaultAccount,
          gas: 100000
        });

      return {
        success: true,
        txHash: tx.transactionHash,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        operation: 'approveLoan',
        loanId
      };

    } catch (error) {
      console.error('Error approving loan on blockchain:', error);
      throw new Error(`Blockchain loan approval failed: ${error.message}`);
    }
  }

  /**
   * Process loan repayment on blockchain
   * @param {Object} repaymentData - Repayment details
   * @returns {Promise<Object>} Transaction result
   */
  async processRepayment(repaymentData) {
    try {
      const { loanId, amount, borrowerAddress, paymentId } = repaymentData;

      if (this.mockMode) {
        return this._createMockTransaction('makeRepayment', repaymentData);
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract, 
        this.contractAddresses.loanContract
      );

      // Convert amount to Wei (assuming amount is in ETH/MATIC)
      const amountInWei = this.web3.utils.toWei(amount.toString(), 'ether');

      const tx = await contract.methods
        .makeRepayment(loanId, amountInWei)
        .send({
          from: borrowerAddress || this.defaultAccount,
          value: amountInWei,
          gas: 150000
        });

      return {
        success: true,
        txHash: tx.transactionHash,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        operation: 'makeRepayment',
        loanId,
        amount: amount,
        paymentId
      };

    } catch (error) {
      console.error('Error processing repayment on blockchain:', error);
      throw new Error(`Blockchain repayment failed: ${error.message}`);
    }
  }



  /**
   * Get loan details from blockchain
   * @param {string|number} loanId - Loan ID
   * @returns {Promise<Object>} Loan details
   */
  async getLoanDetails(loanId) {
    try {
      if (this.mockMode) {
        return this._getMockLoanDetails(loanId);
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract, 
        this.contractAddresses.loanContract
      );

      const result = await contract.methods.getLoan(loanId).call();

      return {
        loanId: result[0],
        borrower: result[1],
        lender: result[2],
        amount: this.web3.utils.fromWei(result[3], 'ether'),
        dueDate: result[4],
        repaid: result[5],
        documentHash: result[6],
        createdAt: result[7],
        repaidAt: result[8],
        purpose: result[9],
        interestRate: result[10]
      };

    } catch (error) {
      console.error('Error fetching loan details from blockchain:', error);
      throw new Error(`Failed to fetch loan details: ${error.message}`);
    }
  }

  /**
   * Mark loan as repaid on blockchain
   * @param {string|number} loanId - Loan ID
   * @param {number} amount - Repayment amount
   * @returns {Promise<Object>} Transaction result
   */
  async markRepaid(loanId, amount = 0) {
    try {
      if (this.mockMode) {
        return this._createMockTransaction('markRepaid', { loanId, amount });
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract,
        this.contractAddresses.loanContract
      );

      const gasEstimate = await contract.methods
        .markRepaid(loanId, amount)
        .estimateGas({ from: this.defaultAccount });

      const tx = await contract.methods
        .markRepaid(loanId, amount)
        .send({
          from: this.defaultAccount,
          gas: Math.floor(Number(gasEstimate) * 1.2), // 20% buffer
          gasPrice: await this.web3.eth.getGasPrice()
        });

      return {
        success: true,
        txHash: tx.transactionHash,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        contractAddress: this.contractAddresses.loanContract,
        network: this.currentNetwork,
        operation: 'markRepaid',
        loanId,
        amount
      };

    } catch (error) {
      console.error('Error marking loan as repaid on blockchain:', error);
      throw new Error(`Blockchain mark repaid failed: ${error.message}`);
    }
  }

  /**
   * Verify document hash on blockchain (check if verified)
   * @param {string} documentHash - Document hash to verify
   * @returns {Promise<boolean>} Verification result
   */
  async checkDocumentHash(documentHash) {
    try {
      if (this.mockMode) {
        return Math.random() > 0.1; // 90% success rate in mock mode
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract, 
        this.contractAddresses.loanContract
      );

      const isVerified = await contract.methods.checkDocument(documentHash).call();
      return isVerified;

    } catch (error) {
      console.error('Error checking document on blockchain:', error);
      return false;
    }
  }

  /**
   * Verify and store document hash on blockchain
   * @param {string} documentHash - Document hash to verify
   * @returns {Promise<Object>} Transaction result
   */
  async verifyDocumentHash(documentHash) {
    try {
      if (this.mockMode) {
        return this._createMockTransaction('verifyDocument', { documentHash });
      }

      const contract = new this.web3.eth.Contract(
        this.contractABIs.loanContract, 
        this.contractAddresses.loanContract
      );

      const gasEstimate = await contract.methods
        .verifyDocument(documentHash)
        .estimateGas({ from: this.defaultAccount });

      const tx = await contract.methods
        .verifyDocument(documentHash)
        .send({
          from: this.defaultAccount,
          gas: Math.floor(Number(gasEstimate) * 1.2), // 20% buffer
          gasPrice: await this.web3.eth.getGasPrice()
        });

      return {
        success: true,
        txHash: tx.transactionHash,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        contractAddress: this.contractAddresses.loanContract,
        network: this.currentNetwork,
        operation: 'verifyDocument',
        documentHash
      };

    } catch (error) {
      console.error('Error verifying document on blockchain:', error);
      throw new Error(`Blockchain document verification failed: ${error.message}`);
    }
  }

  /**
   * Get transaction receipt
   * @param {string} txHash - Transaction hash
   * @returns {Promise<Object>} Transaction receipt
   */
  async getTransactionReceipt(txHash) {
    try {
      if (this.mockMode) {
        const mockTx = this.mockTransactions.get(txHash);
        return mockTx || null;
      }

      const receipt = await this.web3.eth.getTransactionReceipt(txHash);
      return receipt;

    } catch (error) {
      console.error('Error fetching transaction receipt:', error);
      return null;
    }
  }

  /**
   * Get current gas price
   * @returns {Promise<string>} Gas price in Wei
   */
  async getGasPrice() {
    try {
      if (this.mockMode) {
        return '20000000000'; // 20 Gwei
      }

      return await this.web3.eth.getGasPrice();
    } catch (error) {
      console.error('Error fetching gas price:', error);
      return '20000000000'; // Fallback to 20 Gwei
    }
  }

  /**
   * Get network info
   * @returns {Object} Network information
   */
  getNetworkInfo() {
    return {
      ...this.networkConfig[this.currentNetwork],
      mockMode: this.mockMode,
      currentNetwork: this.currentNetwork,
      defaultAccount: this.defaultAccount
    };
  }

  // Private mock methods

  /**
   * Create mock blockchain transaction
   * @private
   */
  _createMockTransaction(operation, data) {
    const txHash = `0x${uuidv4().replace(/-/g, '')}`;
    const mockTx = {
      success: true,
      txHash,
      blockNumber: Math.floor(Math.random() * 1000000) + 1000000,
      gasUsed: Math.floor(Math.random() * 50000) + 21000,
      operation,
      data,
      timestamp: Date.now(),
      network: 'mock',
      status: 'success'
    };

    this.mockTransactions.set(txHash, mockTx);
    
    // Simulate blockchain delay
    setTimeout(() => {
      console.log(`Mock blockchain transaction confirmed: ${txHash}`);
    }, 2000);

    return mockTx;
  }

  /**
   * Get mock loan details
   * @private
   */
  _getMockLoanDetails(loanId) {
    return {
      borrower: `0x${uuidv4().replace(/-/g, '').substring(0, 40)}`,
      lender: `0x${uuidv4().replace(/-/g, '').substring(0, 40)}`,
      amount: Math.floor(Math.random() * 100000) + 10000,
      repaidAmount: Math.floor(Math.random() * 50000),
      interestRate: Math.floor(Math.random() * 20) + 5,
      isActive: true,
      isApproved: Math.random() > 0.3,
      loanId
    };
  }

  /**
   * Generate test wallet address
   * @returns {string} Test wallet address
   */
  generateTestAddress() {
    if (!this.mockMode && this.web3) {
      return this.web3.eth.accounts.create().address;
    }
    return `0x${uuidv4().replace(/-/g, '').substring(0, 40)}`;
  }
}

module.exports = new BlockchainService();
