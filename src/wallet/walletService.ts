import { ethers } from 'ethers';
import { debugLog } from '../lib/utils.js';

// Chain-specific configurations for zero-config setup
interface ChainConfig {
  chainId: number;
  rpcUrls: string[];
  usdcAddress: string;
}

const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  8453: {
    chainId: 8453,
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.publicnode.com'
    ],
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  },
  84532: {
    chainId: 84532,
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia.publicnode.com'
    ],
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }
};

/**
 * Core wallet service for AgentAuth MCP Gateway
 * Handles address derivation, balance checking, transaction signing and submission
 */
export class WalletService {
  private currentProvider: ethers.JsonRpcProvider | null;
  private wallet: ethers.Wallet;
  private currentChainId: number | null;
  private baseWallet: ethers.Wallet; // Wallet without provider for re-connection

  constructor(agentAuthToken: string, rpcUrl?: string, chainId: number = 8453) {
    // Derive private key from AgentAuth token (same as existing AgentAuth flow)
    const privateKey = this.derivePrivateKey(agentAuthToken);
    this.baseWallet = new ethers.Wallet(privateKey);
    
    // For backward compatibility, initialize with default chain if provided
    this.currentProvider = null;
    this.currentChainId = null;
    this.wallet = this.baseWallet;
    
    // If constructor parameters provided, configure immediately (legacy support)
    if (rpcUrl || chainId !== 8453) {
      const provider = new ethers.JsonRpcProvider(
        rpcUrl || process.env.BASE_RPC_URL || 'https://mainnet.base.org'
      );
      this.currentProvider = provider;
      this.wallet = this.baseWallet.connect(provider);
      this.currentChainId = chainId;
      debugLog('WalletService initialized with legacy parameters:', { chainId, rpcUrl });
    } else {
      // New zero-config mode - will be configured dynamically
      debugLog('WalletService initialized in zero-config mode');
    }
  }

  /**
   * Derive private key from AgentAuth token
   * Handles aa-, 0x, and raw hex formats
   */
  private derivePrivateKey(agentAuthToken: string): string {
    const cleanToken = agentAuthToken.startsWith('aa-') 
      ? agentAuthToken.slice(3) 
      : agentAuthToken;
    
    const privateKey = cleanToken.startsWith('0x') 
      ? cleanToken 
      : '0x' + cleanToken;
    
    // Validate private key format
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('Invalid private key format');
    }
    
    return privateKey;
  }

  /**
   * Get the wallet's Ethereum address
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Configure wallet for specific chain
   * Enables zero-configuration setup based on payment requirements
   */
  configureForChain(chainId: number): void {
    if (this.currentChainId === chainId) {
      debugLog(`Already configured for chain ${chainId}`);
      return; // Already configured
    }
    
    const chainConfig = CHAIN_CONFIGS[chainId];
    if (!chainConfig) {
      const supportedChains = Object.keys(CHAIN_CONFIGS).join(', ');
      throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${supportedChains}`);
    }
    
    try {
      // Try primary RPC first, with fallback support
      const rpcUrl = process.env.BASE_RPC_URL || 
                     process.env.BASE_SEPOLIA_RPC_URL || 
                     chainConfig.rpcUrls[0];
      
      this.currentProvider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = this.baseWallet.connect(this.currentProvider);
      this.currentChainId = chainId;
      
      debugLog(`Configured wallet for chain ${chainId}:`, {
        chainId,
        rpcUrl,
        usdcAddress: chainConfig.usdcAddress
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to configure chain ${chainId}: ${errorMessage}`);
    }
  }

  /**
   * Get ETH balance in ETH units
   */
  async getEthBalance(): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      const balance = await this.currentProvider.getBalance(this.wallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      throw new Error(`Failed to get ETH balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ERC-20 token balance
   * @param tokenAddress Contract address of the token
   * @param decimals Token decimals (default 18)
   */
  async getTokenBalance(tokenAddress: string, decimals: number = 18): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.currentProvider
      );
      
      const balance = await tokenContract.balanceOf(this.wallet.address);
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      throw new Error(`Failed to get token balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get USDC balance (6 decimals)
   * Uses current chain's USDC contract address
   */
  async getUsdcBalance(): Promise<string> {
    if (!this.currentProvider || !this.currentChainId) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    const usdcAddress = this.getUsdcContractAddress();
    return this.getTokenBalance(usdcAddress, 6);
  }

  /**
   * Get USDC contract address for current chain
   */
  getUsdcContractAddress(): string {
    if (!this.currentChainId) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    const chainConfig = CHAIN_CONFIGS[this.currentChainId];
    if (!chainConfig) {
      throw new Error(`No USDC contract configured for chain ${this.currentChainId}`);
    }
    
    return chainConfig.usdcAddress;
  }

  /**
   * Get current chain ID
   */
  getCurrentChainId(): number | null {
    return this.currentChainId;
  }

  /**
   * Check if wallet is configured for any chain
   */
  isConfigured(): boolean {
    return this.currentProvider !== null && this.currentChainId !== null;
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(txRequest: ethers.TransactionRequest): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      const gasLimit = await this.currentProvider.estimateGas({
        ...txRequest,
        from: this.wallet.address
      });
      return gasLimit.toString();
    } catch (error) {
      throw new Error(`Failed to estimate gas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current gas price (returns in wei as bigint)
   */
  async getGasPrice(): Promise<bigint> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      const feeData = await this.currentProvider.getFeeData();
      return feeData.gasPrice || ethers.parseUnits('20', 'gwei');
    } catch (error) {
      throw new Error(`Failed to get gas price: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current transaction count (nonce)
   */
  async getTransactionCount(): Promise<number> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      return await this.currentProvider.getTransactionCount(this.wallet.address, 'pending');
    } catch (error) {
      throw new Error(`Failed to get transaction count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get wallet balances (ETH and USDC)
   */
  async getWalletBalances(): Promise<{ address: string; eth: string; usdc: string }> {
    try {
      const [ethBalance, usdcBalance] = await Promise.all([
        this.getEthBalance(),
        this.getUsdcBalance()
      ]);

      return {
        address: this.wallet.address,
        eth: ethBalance,
        usdc: usdcBalance
      };
    } catch (error) {
      throw new Error(`Failed to get wallet balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate estimated transaction cost in ETH
   */
  async estimateTxCost(txRequest: ethers.TransactionRequest): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      const gasLimit = await this.estimateGas(txRequest);
      const feeData = await this.currentProvider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');
      
      const cost = BigInt(gasLimit) * gasPrice;
      return ethers.formatEther(cost);
    } catch (error) {
      throw new Error(`Failed to estimate transaction cost: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sign a transaction
   */
  async signTransaction(txRequest: ethers.TransactionRequest): Promise<string> {
    try {
      if (!this.currentProvider || !this.currentChainId) {
        throw new Error('Chain not configured. Call configureForChain() first.');
      }
      
      // Get current nonce if not provided
      const nonce = txRequest.nonce ?? await this.currentProvider.getTransactionCount(this.wallet.address, 'pending');
      
      // Get current gas prices from network
      const feeData = await this.currentProvider.getFeeData();
      debugLog('Current network fee data:', feeData);
      
      // Ensure chainId, nonce, and gas pricing are set
      const fullTxRequest = {
        ...txRequest,
        chainId: this.currentChainId,
        nonce: nonce,
        // Use EIP-1559 pricing if available, otherwise legacy gas price
        maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei'), // 2 gwei priority
        gasPrice: feeData.gasPrice // Fallback for legacy transactions
      };
      
      debugLog('Final transaction request:', fullTxRequest);
      const signedTx = await this.wallet.signTransaction(fullTxRequest);
      return signedTx;
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Submit a signed transaction to the blockchain
   */
  async submitTransaction(signedTx: string): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      const txResponse = await this.currentProvider.broadcastTransaction(signedTx);
      return txResponse.hash;
    } catch (error) {
      throw new Error(`Failed to submit transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sign and submit a transaction in one step
   */
  async signAndSubmitTransaction(txRequest: ethers.TransactionRequest): Promise<string> {
    const signedTx = await this.signTransaction(txRequest);
    return this.submitTransaction(signedTx);
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txHash: string, confirmations: number = 1): Promise<ethers.TransactionReceipt | null> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      return await this.currentProvider.waitForTransaction(txHash, confirmations);
    } catch (error) {
      throw new Error(`Failed to wait for transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    if (!this.currentProvider) {
      throw new Error('Chain not configured. Call configureForChain() first.');
    }
    
    try {
      return await this.currentProvider.getTransactionReceipt(txHash);
    } catch (error) {
      throw new Error(`Failed to get transaction receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Validate that the wallet has sufficient balance for a transaction
   */
  async validateSufficientBalance(txRequest: ethers.TransactionRequest): Promise<{ sufficient: boolean; currentBalance: string; required: string; error?: string; details?: any }> {
    try {
      const ethBalance = await this.getEthBalance();
      const usdcBalance = await this.getUsdcBalance();
      
      // Check if this is a USDC transfer by looking at the contract address and data
      const isUsdcTransfer = txRequest.to?.toString().toLowerCase() === this.getUsdcContractAddress().toLowerCase() && 
                           txRequest.data?.startsWith('0xa9059cbb'); // transfer(address,uint256)
      
      if (isUsdcTransfer && txRequest.data) {
        // Decode the USDC transfer amount from the transaction data
        try {
          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
          const decoded = abiCoder.decode(['address', 'uint256'], '0x' + txRequest.data.slice(10));
          const usdcAmount = ethers.formatUnits(decoded[1], 6); // USDC has 6 decimals
          const usdcBalance_num = parseFloat(usdcBalance);
          const requiredUsdc_num = parseFloat(usdcAmount);
          
          if (usdcBalance_num < requiredUsdc_num) {
            return {
              sufficient: false,
              currentBalance: usdcBalance,
              required: usdcAmount,
              error: 'insufficient_usdc',
              details: {
                type: 'USDC',
                currentBalance: `${usdcBalance} USDC`,
                required: `${usdcAmount} USDC`,
                shortfall: `${(requiredUsdc_num - usdcBalance_num).toFixed(6)} USDC`
              }
            };
          }
        } catch (decodeError) {
          debugLog('Could not decode USDC transfer data:', decodeError);
          // Fall through to ETH balance check
        }
      }
      
      // Check ETH balance for gas fees
      const txCost = await this.estimateTxCost(txRequest);
      const currentBalanceWei = ethers.parseEther(ethBalance);
      const requiredWei = ethers.parseEther(txCost);
      
      // Add the transaction value if it's an ETH transfer
      const totalRequired = txRequest.value ? requiredWei + BigInt(txRequest.value.toString()) : requiredWei;
      
      if (currentBalanceWei < totalRequired) {
        return {
          sufficient: false,
          currentBalance: ethBalance,
          required: ethers.formatEther(totalRequired),
          error: 'insufficient_eth',
          details: {
            type: 'ETH',
            currentBalance: `${ethBalance} ETH`,
            required: `${ethers.formatEther(totalRequired)} ETH`,
            purpose: 'gas fees'
          }
        };
      }
      
      return {
        sufficient: true,
        currentBalance: ethBalance,
        required: ethers.formatEther(totalRequired)
      };
    } catch (error) {
      throw new Error(`Failed to validate balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

