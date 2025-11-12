/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

/**
 * x402 Protocol Handler
 * 
 * Implements the x402 standard for payment authorization with automatic
 * chain configuration and server-driven payment requirements.
 * 
 * Specification: https://x402.org/
 */

import { ethers } from 'ethers';
import type { WalletService } from '../wallet/walletService.js';
import { PaymentProtocol, PaymentRequiredResponse, TransactionTemplate } from './agentpay-v002.js';
import { debugLog } from '../lib/utils.js';

/**
 * x402 Payment Requirement as specified by server
 * Based on official x402 specification v1.0
 */
export interface X402PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;      // uint256 as string
  resource: string;
  description: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  // Optional fields as per x402 spec
  mimeType?: string;              // Optional in practice (servers don't send yet)
  outputSchema?: object | null;   // Explicitly nullable per x402 spec
  extra?: object | null;          // Explicitly nullable per x402 spec
}

/**
 * x402 Server Response Format
 * Based on official x402 specification v1.0
 */
export interface X402Response {
  x402Version: number;
  accepts: X402PaymentRequirement[];
  error: string | null;           // Spec specifies string | null
}

/**
 * x402 Payment Payload for X-PAYMENT header (Exact Scheme)
 */
export interface X402ExactEvmPayloadAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface X402ExactEvmPayload {
  signature: string;
  authorization: X402ExactEvmPayloadAuthorization;
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: X402ExactEvmPayload;
}

/**
 * Chain Configuration
 */
interface ChainConfig {
  chainId: number;
  rpcUrl: string;
}

/**
 * x402 Protocol Implementation
 * 
 * Features:
 * - Server-driven configuration (network, asset, recipient from server)
 * - Zero user configuration (automatic chain detection)
 * - Robust error handling for unsupported networks
 * - Stateless transaction flow via agent retention
 */
export class X402Protocol implements PaymentProtocol {
  private currentChainId?: number;

  /**
   * Lightweight detection of x402 protocol presence
   * Checks for minimal x402 indicators without heavy validation
   */
  isPaymentRequired(response: any): boolean {
    try {
      debugLog('x402 isPaymentRequired - lightweight detection:', {
        type: typeof response,
        isNull: response === null,
        hasX402Version: response?.x402Version != null,
        x402VersionValue: response?.x402Version,
        hasAccepts: 'accepts' in (response || {}),
        acceptsIsArray: Array.isArray(response?.accepts)
      });

      // Lightweight detection: just check for x402 protocol indicators
      const result = (
        typeof response === 'object' &&
        response !== null &&
        response.x402Version != null &&           // Any version (future-proof)
        Array.isArray(response.accepts)           // Don't validate contents yet
      );

      debugLog('x402 lightweight detection result:', result);
      return result;
    } catch (error) {
      debugLog('Error in x402 payment detection:', error);
      return false;
    }
  }

  /**
   * Extract payment details from x402 response with full validation
   * Performs heavy validation and version support check
   */
  extractPaymentDetails(response: any): PaymentRequiredResponse | null {
    try {
      const x402Response = response as X402Response;

      // Version support check (moved from detection)
      if (x402Response.x402Version !== 1) {
        throw new Error(`Unsupported x402 version: ${x402Response.x402Version}. Supported versions: 1`);
      }

      // Validate accepts array structure
      if (!Array.isArray(x402Response.accepts) || x402Response.accepts.length === 0) {
        throw new Error('Invalid x402 response: accepts array is empty or missing');
      }

      const requirement = x402Response.accepts[0];

      // Validate requirement has all needed fields
      if (!this.isValidPaymentRequirement(requirement)) {
        throw new Error('Invalid x402 payment requirement structure');
      }

      // Get chain configuration for this network
      const chainConfig = this.getChainConfig(requirement.network);
      this.currentChainId = chainConfig.chainId;

      // Convert amount from atomic units to human readable
      // x402 STRICT COMPLIANCE: Only atomic units are accepted
      const maxAmount = String(requirement.maxAmountRequired);

      debugLog('x402 amount processing:', {
        original: requirement.maxAmountRequired,
        maxAmount,
        originalType: typeof requirement.maxAmountRequired,
        stringType: typeof maxAmount,
        hasDecimal: maxAmount.includes('.'),
        length: maxAmount.length
      });

      // Validate atomic units format - reject decimals
      if (maxAmount.includes('.')) {
        throw new Error(`Invalid x402 amount format: ${maxAmount}. x402 requires atomic units, not decimals. Server must send atomic units (e.g., "10000" for 0.01 USDC, not "0.01").`);
      }

      // Validate that it's a valid number
      try {
        const atomicValue = BigInt(maxAmount);
        if (atomicValue <= 0) {
          throw new Error(`Invalid x402 amount: ${maxAmount}. Amount must be positive.`);
        }
      } catch (error) {
        throw new Error(`Invalid x402 amount format: ${maxAmount}. Must be a valid positive integer in atomic units.`);
      }

      // Convert atomic units to decimal for display
      const amount = ethers.formatUnits(maxAmount, 6);
      debugLog('x402 amount in atomic units (standard):', maxAmount, '→', amount);

      return {
        error: 'payment_required',
        code: 402,
        message: requirement.description,
        amount,
        currency: 'USDC',
        description: requirement.description,
        transaction: this.buildTransactionFromRequirement(requirement, chainConfig)
      };
    } catch (error) {
      debugLog('Error extracting x402 payment details:', error);
      return null;
    }
  }

  /**
   * Sign payment transaction - for x402 exact scheme, prepares EIP-3009 authorization
   * The actual signature will be created in createAuthorizationHeaders using EIP-712
   * This is stateless - the template contains all needed data including x402Requirement
   */
  async signPaymentTransaction(
    template: TransactionTemplate,
    walletService: WalletService
  ): Promise<{ signedTx: string; from: string }> {
    try {
      debugLog('Preparing x402 exact scheme authorization:', { 
        to: template.to, 
        chainId: template.chainId,
        hasRequirement: !!template.x402Requirement
      });

      const from = walletService.getAddress();
      
      // Temporarily store chainId for network lookup
      this.currentChainId = template.chainId;
      
      // Pass the template through as JSON - includes x402Requirement for stateless processing
      const templateData = JSON.stringify(template);

      debugLog('x402 authorization prepared, will sign in createAuthorizationHeaders');
      return { signedTx: templateData, from };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog('Failed to prepare x402 authorization:', errorMessage);
      throw new Error(`x402 authorization preparation failed: ${errorMessage}`);
    }
  }

  /**
   * Generate a random 32-byte nonce for EIP-3009 authorization
   */
  private generateNonce(): string {
    return '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  /**
   * Create x402 authorization headers for payment using exact scheme with EIP-3009
   * Stateless - extracts requirement from the template that was passed through
   */
  async createAuthorizationHeaders(
    signedTx: string, 
    from: string,
    walletService: WalletService,
    _unusedRequirement?: X402PaymentRequirement
  ): Promise<Record<string, string>> {
    try {
      const network = this.getNetworkFromChainId();
      
      // Parse the template data that was passed through (stateless)
      const template: TransactionTemplate = JSON.parse(signedTx);
      
      // Extract the requirement that was embedded in the template
      const requirement = template.x402Requirement as X402PaymentRequirement;
      if (!requirement) {
        throw new Error('x402Requirement missing from transaction template');
      }
      
      // Extract transfer parameters from the requirement
      const recipientAddress = requirement.payTo;
      const amount = requirement.maxAmountRequired;
      
      // Generate EIP-3009 authorization parameters
      const now = Math.floor(Date.now() / 1000);
      const authorization: X402ExactEvmPayloadAuthorization = {
        from,
        to: recipientAddress,
        value: amount,
        validAfter: (now - 600).toString(), // 10 minutes before
        validBefore: (now + (requirement?.maxTimeoutSeconds || 300)).toString(),
        nonce: this.generateNonce()
      };

      debugLog('Created x402 exact scheme authorization:', {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value,
        nonce: authorization.nonce.substring(0, 20) + '...'
      });

      // Sign the authorization using EIP-712
      const usdcAddress = requirement?.asset || template.to;
      const chainId = this.currentChainId || 8453; // Base mainnet
      
      // Get ERC-20 token EIP-712 domain from server's requirement.extra
      // The server must provide these for proper EIP-3009 signing
      const extra = requirement?.extra as { name?: string; version?: string } | undefined;
      if (!extra?.name || !extra?.version) {
        throw new Error('Server must provide EIP-712 domain (name, version) in requirement.extra for exact scheme');
      }
      const name = extra.name;
      const version = extra.version;

      const domain = {
        name,
        version,
        chainId,
        verifyingContract: usdcAddress
      };

      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' }
        ]
      };

      const message = {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value,
        validAfter: authorization.validAfter,
        validBefore: authorization.validBefore,
        nonce: authorization.nonce
      };

      debugLog('Signing EIP-712 typed data for x402 exact scheme');
      const signature = await walletService.signTypedData(domain, types, message);

      const exactPayload: X402ExactEvmPayload = {
        signature,
        authorization
      };

      const payload: X402PaymentPayload = {
        x402Version: 1,
        scheme: 'exact',
        network,
        payload: exactPayload
      };

      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      debugLog('Created x402 exact scheme authorization headers for network:', network);

      return {
        'X-PAYMENT': encodedPayload
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog('Failed to create x402 authorization headers:', errorMessage);
      throw new Error(`x402 header creation failed: ${errorMessage}`);
    }
  }

  /**
   * Format payment details for user display with real-time gas estimation
   */
  async formatForUser(paymentDetails: PaymentRequiredResponse, walletBalances?: { usdc: string; eth: string }, walletService?: any): Promise<string> {
    const lines = [
      '💳 x402 PAYMENT REQUIRED',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `📝 Description: ${paymentDetails.description}`,
      `💰 Amount: ${paymentDetails.amount} ${paymentDetails.currency}`,
    ];

    if (walletBalances) {
      const requiredAmount = parseFloat(paymentDetails.amount);
      const availableUsdc = parseFloat(walletBalances.usdc);
      const availableEth = parseFloat(walletBalances.eth);
      const hasSufficientUsdc = availableUsdc >= requiredAmount;

      // Calculate REAL gas estimate for user preview
      let gasEstimate = '0.00005'; // Realistic fallback for Base network ERC-20 transfers (matches 50k gas limit)
      let gasEstimateNote = 'estimated';
      let hasSufficientGas = availableEth > parseFloat(gasEstimate);

      if (paymentDetails.transaction && walletService) {
        try {
          // Get real gas estimate using the actual transaction
          const realGasEstimate = await walletService.estimateTxCost(paymentDetails.transaction);
          gasEstimate = realGasEstimate;
          gasEstimateNote = 'real-time estimate';
          hasSufficientGas = availableEth > parseFloat(realGasEstimate);

          debugLog(`Real gas estimate for x402 preview: ${realGasEstimate} ETH`);
        } catch (error) {
          debugLog('Failed to get real gas estimate for preview, using fallback:', error);
          gasEstimateNote = 'fallback estimate (estimation failed)';
        }
      } else {
        debugLog('No transaction or wallet service available for gas estimation in preview');
        gasEstimateNote = 'fallback estimate (no transaction context)';
      }

      lines.push(`🏦 Your Balance: ${walletBalances.usdc} USDC ${hasSufficientUsdc ? '✅' : '❌'}`);
      lines.push(`⛽ Gas Cost: ~${gasEstimate} ETH (${gasEstimateNote}) ${hasSufficientGas ? '✅' : '❌'}`);

      // Add warnings for insufficient funds
      if (!hasSufficientUsdc) {
        lines.push('');
        lines.push('⚠️  WARNING: Insufficient USDC balance!');
        lines.push(`   Required: ${paymentDetails.amount} USDC, Available: ${walletBalances.usdc} USDC`);
      }

      if (!hasSufficientGas) {
        lines.push('');
        lines.push('⚠️  WARNING: Insufficient ETH for gas fees!');
        lines.push(`   Required: ~${gasEstimate} ETH, Available: ${walletBalances.eth} ETH`);
      }
    }

    lines.push('');
    lines.push('🔐 This payment will be processed via x402 protocol.');
    lines.push('✅ Type "yes" or "y" to approve');
    lines.push('❌ Type "no" or "n" to decline');

    return lines.join('\n');
  }

  /**
   * Format instructions for agent
   */
  formatForAgent(paymentDetails: PaymentRequiredResponse, originalParams?: any): string {
    const instructions = [
      'x402 PAYMENT AUTHORIZATION REQUIRED',
      '',
      '⚠️  DO NOT AUTO-APPROVE THIS PAYMENT',
      '',
      'REQUIRED STEPS:',
      '1. FIRST: Present the payment details to the user (amount, description, balance)',
      '2. THEN: Explicitly ask the user "Do you want to approve this payment?"',
      '3. WAIT: Get the user\'s explicit approval (yes/y) or rejection (no/n)',
      '4. ONLY AFTER user approves: Proceed with the approval method below',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'HOW TO APPROVE (after user confirms):',
      'Retry the same tool call with these additional parameters:',
      '• aa_payment_approved: true',
      '• aa_payment_transaction: (the transaction object below)',
      '• aa_payment_protocol: "x402"',
      '',
      '⚠️  CRITICAL: Copy transaction data exactly as provided',
      '• Never modify the "data" field - copy it character by character',
      '• Preserve all leading zeros and hex formatting',
      '• Any truncation or modification will cause payment failure',
      ''
    ];

    if (originalParams && originalParams.name) {
      instructions.push(`Example: ${originalParams.name}({`);
      if (originalParams.arguments) {
        for (const [key, value] of Object.entries(originalParams.arguments)) {
          if (typeof value === 'string') {
            instructions.push(`  "${key}": "${value}",`);
          } else {
            instructions.push(`  "${key}": ${JSON.stringify(value)},`);
          }
        }
      }
      instructions.push('  "aa_payment_approved": true,');
      instructions.push('  "aa_payment_transaction": {...},');
      instructions.push('  "aa_payment_protocol": "x402"');
      instructions.push('})');
      instructions.push('');
    }

    instructions.push(`Amount: ${paymentDetails.amount} ${paymentDetails.currency}`);
    instructions.push(`Purpose: ${paymentDetails.description}`);

    return instructions.join('\n');
  }

  /**
   * Validate payment requirement structure
   */
  private isValidPaymentRequirement(requirement: any): boolean {
    debugLog('x402 validating payment requirement:', {
      requirement,
      typeOf: typeof requirement,
      isNull: requirement === null,
      hasScheme: 'scheme' in (requirement || {}),
      schemeType: typeof requirement?.scheme,
      hasNetwork: 'network' in (requirement || {}),
      networkType: typeof requirement?.network,
      hasMaxAmount: 'maxAmountRequired' in (requirement || {}),
      maxAmountType: typeof requirement?.maxAmountRequired,
      hasDescription: 'description' in (requirement || {}),
      descriptionType: typeof requirement?.description,
      hasMimeType: 'mimeType' in (requirement || {}),
      mimeTypeType: typeof requirement?.mimeType,
      hasOutputSchema: 'outputSchema' in (requirement || {}),
      outputSchemaType: typeof requirement?.outputSchema,
      hasExtra: 'extra' in (requirement || {}),
      extraType: typeof requirement?.extra,
      hasPayTo: 'payTo' in (requirement || {}),
      payToType: typeof requirement?.payTo,
      hasAsset: 'asset' in (requirement || {}),
      assetType: typeof requirement?.asset,
      hasMaxTimeout: 'maxTimeoutSeconds' in (requirement || {}),
      payToIsAddress: requirement?.payTo ? ethers.isAddress(requirement.payTo) : false,
      assetIsAddress: requirement?.asset ? ethers.isAddress(requirement.asset) : false
    });

    // x402 v1.0 specification compliance check with proper optional field handling
    const result = (
      typeof requirement === 'object' &&
      requirement !== null &&
      // Required payment fields
      typeof requirement.scheme === 'string' &&
      typeof requirement.network === 'string' &&
      typeof requirement.maxAmountRequired === 'string' &&
      typeof requirement.resource === 'string' &&
      typeof requirement.description === 'string' &&
      typeof requirement.payTo === 'string' &&
      typeof requirement.maxTimeoutSeconds === 'number' &&
      typeof requirement.asset === 'string' &&
      ethers.isAddress(requirement.payTo) &&
      ethers.isAddress(requirement.asset) &&
      // Optional fields (as per x402 spec)
      (requirement.mimeType === undefined || typeof requirement.mimeType === 'string') &&
      (requirement.outputSchema === undefined || requirement.outputSchema === null || typeof requirement.outputSchema === 'object') &&
      (requirement.extra === undefined || requirement.extra === null || typeof requirement.extra === 'object')
    );

    debugLog('x402 payment requirement validation result:', result);
    return result;
  }

  /**
   * Build transaction from x402 requirement
   */
  private buildTransactionFromRequirement(
    requirement: X402PaymentRequirement, 
    chainConfig: ChainConfig
  ): TransactionTemplate {
    try {
      // Validate addresses
      if (!ethers.isAddress(requirement.payTo)) {
        throw new Error(`Invalid payTo address: ${requirement.payTo}`);
      }
      if (!ethers.isAddress(requirement.asset)) {
        throw new Error(`Invalid asset address: ${requirement.asset}`);
      }

      // Use atomic units for transaction - x402 strict compliance
      const maxAmount = String(requirement.maxAmountRequired);

      // Validate atomic units format - reject decimals
      if (maxAmount.includes('.')) {
        throw new Error(`Invalid x402 amount format: ${maxAmount}. x402 requires atomic units, not decimals. Server must send atomic units (e.g., "10000" for 0.01 USDC, not "0.01").`);
      }

      // Validate that it's a valid positive integer
      try {
        const atomicValue = BigInt(maxAmount);
        if (atomicValue <= 0) {
          throw new Error(`Invalid x402 amount: ${maxAmount}. Amount must be positive.`);
        }
      } catch (error) {
        throw new Error(`Invalid x402 amount format: ${maxAmount}. Must be a valid positive integer in atomic units.`);
      }

      // Use atomic units directly (no conversion needed)
      const atomicAmount = maxAmount;
      debugLog('x402 using atomic units directly:', atomicAmount);

      // Build ERC-20 transfer transaction
      const transferInterface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
      const data = transferInterface.encodeFunctionData('transfer', [
        requirement.payTo,
        atomicAmount
      ]);

      debugLog('Built x402 transaction:', {
        to: requirement.asset,
        payTo: requirement.payTo,
        amount: requirement.maxAmountRequired,
        network: requirement.network,
        chainId: chainConfig.chainId
      });

      return {
        to: requirement.asset,           // Use server-specified asset contract
        data,
        value: '0x0',
        chainId: chainConfig.chainId,    // Auto-derived from network
        gasLimit: '50000',               // Realistic gas limit for ERC-20 transfers on Base network (~21k-35k typical)
        x402Requirement: requirement     // Pass requirement through for stateless processing
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog('Failed to build x402 transaction:', errorMessage);
      throw new Error(`x402 transaction building failed: ${errorMessage}`);
    }
  }

  /**
   * Get chain configuration for network name
   */
  private getChainConfig(networkName: string): ChainConfig {
    const configs: Record<string, ChainConfig> = {
      'base': {
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org'
      },
      'base-sepolia': {
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org'
      }
    };
    
    const config = configs[networkName];
    if (!config) {
      const supportedNetworks = Object.keys(configs).join(', ');
      throw new Error(
        `Unsupported network: ${networkName}. AgentAuth MCP Gateway supports: ${supportedNetworks}`
      );
    }
    
    debugLog(`Using chain config for ${networkName}:`, config);
    return config;
  }

  /**
   * Get network name from current chain ID
   */
  private getNetworkFromChainId(): string {
    if (!this.currentChainId) {
      throw new Error('Chain ID not set - call extractPaymentDetails first');
    }

    switch (this.currentChainId) {
      case 8453:
        return 'base';
      case 84532:
        return 'base-sepolia';
      default:
        throw new Error(`Unknown chain ID: ${this.currentChainId}`);
    }
  }

  /**
   * Fix potentially truncated transaction data
   * x402 protocol uses server-provided data, so no fixing needed
   */
  fixTruncatedTransactionData(template: TransactionTemplate): TransactionTemplate {
    // x402 transactions are generated by the protocol itself and don't suffer from
    // LLM truncation issues that AgentPay has, so return as-is
    return template;
  }

  /**
   * Validate transaction template structure and content
   * x402-specific validation
   */
  validateTransactionTemplate(template: TransactionTemplate): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!template.to || !ethers.isAddress(template.to)) {
      errors.push('Invalid recipient address');
    }

    if (!template.data || !/^0x[0-9a-fA-F]*$/.test(template.data)) {
      errors.push('Invalid transaction data');
    }

    if (!template.value || !/^0x[0-9a-fA-F]*$/.test(template.value)) {
      errors.push('Invalid transaction value');
    }

    if (!template.chainId || typeof template.chainId !== 'number') {
      errors.push('Invalid chain ID');
    }

    if (!template.gasLimit) {
      errors.push('Missing gas limit');
    }

    // x402-specific validations
    if (template.chainId && template.chainId !== 8453 && template.chainId !== 84532) {
      errors.push(`Unsupported chain ID for x402: ${template.chainId} (supported: 8453, 84532)`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}