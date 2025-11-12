/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

/**
 * AgentPay v0.0.2 Protocol Handler
 * 
 * Implements the AgentPay v0.0.2 standard for payment authorization
 * with clean separation between protocol logic and UX presentation.
 */

import { ethers } from 'ethers';
import type { WalletService } from '../wallet/walletService.js';
import { debugLog } from '../lib/utils.js';

/**
 * AgentPay v0.0.2 HTTP Headers
 */
export const AGENTPAY_HEADERS = {
  AUTHORIZATION: 'x-agentpay-authorization',
  FROM: 'x-agentpay-from',
  AMOUNT: 'x-agentpay-amount',
  TOKEN: 'x-agentpay-token',
  CHAIN: 'x-agentpay-chain',
  CHAIN_ID: 'x-agentpay-chain-id',
  RECIPIENT: 'x-agentpay-recipient',
  DESCRIPTION: 'x-agentpay-description',
  RECEIPT: 'x-agentpay-receipt',
  ERROR: 'x-agentpay-error',
} as const;

/**
 * Payment Required Response (HTTP 402 equivalent)
 */
export interface PaymentRequiredResponse {
  error: 'payment_required';
  code?: 402;
  message: string;
  amount: string;
  currency: string;
  description?: string;
  headers?: Record<string, string>;
  transaction?: TransactionTemplate;
}

/**
 * Transaction Template for signing
 */
export interface TransactionTemplate {
  to: string;
  data: string;
  value: string;
  chainId: number;
  gasLimit: string;
  x402Requirement?: any;  // Optional x402 requirement passed through for stateless processing
}

/**
 * Payment Protocol Interface - defines what any payment protocol must implement
 */
export interface PaymentProtocol {
  /**
   * Check if a response requires payment
   */
  isPaymentRequired(response: any): boolean;

  /**
   * Extract payment details from response
   */
  extractPaymentDetails(response: any): PaymentRequiredResponse | null;

  /**
   * Sign a payment transaction
   */
  signPaymentTransaction(
    template: TransactionTemplate,
    walletService: WalletService
  ): Promise<{ signedTx: string; from: string }>;

  /**
   * Create payment authorization headers
   */
  createAuthorizationHeaders(signedTx: string, from: string, walletService?: WalletService, requirement?: any): Promise<Record<string, string>> | Record<string, string>;

  /**
   * Format payment details for user display (UX layer)
   * Now async to support real-time gas estimation during preview
   */
  formatForUser(paymentDetails: PaymentRequiredResponse, walletBalances?: { usdc: string; eth: string }, walletService?: any): Promise<string>;

  /**
   * Format instructions for agent (UX layer)
   */
  formatForAgent(paymentDetails: PaymentRequiredResponse, originalParams?: any): string;

  /**
   * Fix potentially truncated transaction data (protocol-specific handling)
   */
  fixTruncatedTransactionData(template: TransactionTemplate): TransactionTemplate;

  /**
   * Validate transaction template structure and content
   */
  validateTransactionTemplate(template: TransactionTemplate): { valid: boolean; errors: string[] };
}

/**
 * AgentPay v0.0.2 Protocol Implementation
 */
export class AgentPayV002Protocol implements PaymentProtocol {
  /**
   * Lightweight detection of AgentPay payment requirements
   * Excludes x402 responses to maintain protocol priority
   */
  isPaymentRequired(response: any): boolean {
    if (!response) return false;

    // First, exclude x402 responses (x402 has priority over AgentPay)
    if (response.x402Version != null) {
      return false;
    }

    // Check for payment_required error
    if (response.error === 'payment_required') {
      return true;
    }

    // Check for HTTP 402 code
    if (response.code === 402) {
      return true;
    }

    // Check for nested payment required in content
    if (response.content && Array.isArray(response.content)) {
      for (const item of response.content) {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text);
            // Exclude x402 responses (lightweight check)
            if (parsed.x402Version != null) {
              return false;
            }
            if (parsed.error === 'payment_required' || parsed.code === 402) {
              return true;
            }
          } catch {
            // Not JSON, continue
          }
        }
      }
    }

    return false;
  }


  /**
   * Extract payment details from a payment required response
   */
  extractPaymentDetails(response: any): PaymentRequiredResponse | null {
    // Direct payment required response
    if (response.error === 'payment_required') {
      return response as PaymentRequiredResponse;
    }

    // Check nested content
    if (response.content && Array.isArray(response.content)) {
      for (const item of response.content) {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text);
            if (parsed.error === 'payment_required' || parsed.code === 402) {
              return parsed as PaymentRequiredResponse;
            }
          } catch {
            // Not JSON, continue
          }
        }
      }
    }

    // Check result.content format (MCP response)
    if (response.result?.content && Array.isArray(response.result.content)) {
      for (const item of response.result.content) {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text);
            if (parsed.error === 'payment_required' || parsed.code === 402) {
              return parsed as PaymentRequiredResponse;
            }
          } catch {
            // Not JSON, continue
          }
        }
      }
    }

    return null;
  }

  /**
   * Sign a payment transaction using the wallet service
   */
  async signPaymentTransaction(
    template: TransactionTemplate,
    walletService: WalletService
  ): Promise<{ signedTx: string; from: string }> {
    debugLog('Signing AgentPay v0.0.2 transaction:', template);

    // Get current nonce from blockchain
    const nonce = await walletService.getTransactionCount();

    // Get current gas price
    const gasPrice = await walletService.getGasPrice();

    // Build complete transaction
    const tx = {
      to: template.to,
      data: template.data,
      value: template.value,
      chainId: template.chainId,
      gasLimit: template.gasLimit,
      gasPrice,
      nonce,
    };

    // Sign the transaction
    const signedTx = await walletService.signTransaction(tx);
    const from = walletService.getAddress();

    debugLog('Transaction signed successfully');
    debugLog('From address:', from);
    debugLog('Signed tx (truncated):', signedTx.substring(0, 66) + '...');

    return { signedTx, from };
  }

  /**
   * Create authorization headers for the payment
   */
  createAuthorizationHeaders(signedTx: string, from: string): Record<string, string> {
    return {
      [AGENTPAY_HEADERS.AUTHORIZATION]: signedTx,
      [AGENTPAY_HEADERS.FROM]: from,
    };
  }

  /**
   * Format payment details for user display with real-time gas estimation
   * This is the UX layer - focused on clarity and transparency
   */
  async formatForUser(paymentDetails: PaymentRequiredResponse, walletBalances?: { usdc: string; eth: string }, walletService?: any): Promise<string> {
    const lines = [
      '💳 PAYMENT REQUIRED',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `📝 Description: ${paymentDetails.description || paymentDetails.message}`,
      `💰 Amount: ${paymentDetails.amount} ${paymentDetails.currency}`,
    ];

    // Add wallet balance information for transparency with real gas estimation
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

          debugLog(`Real gas estimate for AgentPay preview: ${realGasEstimate} ETH`);
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

    if (paymentDetails.headers) {
      const recipient = paymentDetails.headers[AGENTPAY_HEADERS.RECIPIENT];
      if (recipient) {
        lines.push(`📬 Recipient: ${recipient}`);
      }

      const chain = paymentDetails.headers[AGENTPAY_HEADERS.CHAIN];
      if (chain) {
        lines.push(`⛓️  Network: ${chain}`);
      }
    }

    lines.push('');
    lines.push('🔐 This payment requires your authorization.');
    
    lines.push('');
    lines.push('✅ Type "yes" or "y" to approve');
    lines.push('❌ Type "no" or "n" to decline');

    return lines.join('\n');
  }

  /**
   * Format instructions for the agent
   * This is the UX layer - focused on clear agent instructions
   */
  formatForAgent(paymentDetails: PaymentRequiredResponse, originalParams?: any): string {
    const instructions = [
      'PAYMENT AUTHORIZATION REQUIRED',
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
      '• aa_payment_protocol: "agentpay-v002"',
      '',
      '⚠️  CRITICAL: When copying the transaction data field:',
      '• NEVER truncate or modify the "data" field - copy it EXACTLY as provided',  
      '• The "data" field must be exactly 138 characters long (including the 0x prefix)',
      '• Structure: 0x (2 chars) + method (8 chars) + recipient (64 chars) + amount (64 chars) = 138 total',
      '• Do NOT remove leading zeros - every zero is required for proper blockchain formatting',
      '• Copy the entire string character by character without any modifications',
      '',
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
      instructions.push('  "aa_payment_protocol": "agentpay-v002"');
      instructions.push('})');
      instructions.push('');
    }

    instructions.push(`Amount: ${paymentDetails.amount} ${paymentDetails.currency}`);
    instructions.push(`Purpose: ${paymentDetails.description || paymentDetails.message}`);

    return instructions.join('\n');
  }

  /**
   * Attempt to fix LLM-truncated transaction data by restoring leading zeros
   * Only fixes when we can safely detect truncated amount field
   */
  fixTruncatedTransactionData(template: TransactionTemplate): TransactionTemplate {
    if (!template.data) {
      return template;
    }
    
    // Only attempt to fix ERC-20 transfer transactions that appear truncated
    if (template.data.startsWith('0xa9059cbb') && 
        template.data.length >= 74 &&  // Method selector (8) + recipient (64) = 72 + '0x' = 74
        template.data.length < 138) {   // But missing some amount bytes (should be 138 total)
      
      const methodAndRecipient = template.data.slice(0, 74); // First 74 chars (0xa9059cbb + 64-char recipient)
      const truncatedAmount = template.data.slice(74);        // Whatever amount bytes remain
      const paddedAmount = truncatedAmount.padStart(64, '0'); // Pad to 32 bytes (64 hex chars)
      
      const fixedData = methodAndRecipient + paddedAmount;
      
      debugLog(`Fixed LLM-truncated transaction data:`);
      debugLog(`Original: ${template.data} (${template.data.length} chars)`);
      debugLog(`Fixed:    ${fixedData} (${fixedData.length} chars)`);
      debugLog(`Added ${64 - truncatedAmount.length} leading zero(s) to amount field`);
      
      return {
        ...template,
        data: fixedData
      };
    }
    
    return template;
  }

  /**
   * Validate that a transaction template is safe to sign
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

    // Critical: Validate USDC transfer data length to prevent LLM truncation
    if (template.data && template.to && template.to.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
      // This is a USDC transfer - validate data length
      if (template.data.length !== 138) {
        errors.push(`USDC transfer data has incorrect length: ${template.data.length} chars (expected 138). This indicates LLM agent truncation of leading zeros.`);
      }
      
      // Validate it can be parsed as a USDC transfer
      try {
        const usdcInterface = new ethers.Interface(['function transfer(address to, uint256 amount) returns (bool)']);
        usdcInterface.parseTransaction({ data: template.data });
      } catch (parseError) {
        errors.push(`USDC transfer data is corrupted and cannot be parsed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
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

    // Additional safety checks
    if (template.chainId !== 8453) {
      errors.push(`Unexpected chain ID: ${template.chainId} (expected Base mainnet: 8453)`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}