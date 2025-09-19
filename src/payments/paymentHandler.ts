/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

/**
 * Universal Payment Handler
 * 
 * Manages payment flows across different protocols (x402 v1.0, AgentPay v0.0.2) with
 * automatic protocol detection, zero-configuration chain setup, and stateless design.
 * 
 * Features:
 * - x402 protocol prioritization (industry standard)
 * - AgentPay v0.0.2 fallback support
 * - Dynamic chain configuration based on server requirements
 * - Agent-centric transaction state retention
 */

import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { WalletService } from '../wallet/walletService.js';
import type { PaymentProtocol } from '../protocols/agentpay-v002.js';
import { AgentPayV002Protocol } from '../protocols/agentpay-v002.js';
import { X402Protocol } from '../protocols/x402.js';
import { ProtocolDetector } from './protocolDetector.js';
import { debugLog } from '../lib/utils.js';
import { ethers } from 'ethers';

/**
 * Universal payment handler that works with multiple protocols
 */
export class PaymentHandler {
  private walletService: WalletService;
  private protocols: Map<string, PaymentProtocol>;
  private protocolDetector: ProtocolDetector;

  constructor(walletService: WalletService) {
    this.walletService = walletService;
    this.protocols = new Map();

    // Initialize protocol detector first
    this.protocolDetector = new ProtocolDetector(this.protocols);

    // Register protocols in priority order (x402 first, AgentPay fallback)
    this.registerProtocol('x402', new X402Protocol());
    this.registerProtocol('agentpay-v002', new AgentPayV002Protocol());

    debugLog('PaymentHandler initialized with protocols:', this.protocolDetector.getRegisteredProtocols());
  }

  /**
   * Register a payment protocol
   * Handles both protocols map and detector registration in single operation
   */
  registerProtocol(name: string, protocol: PaymentProtocol): void {
    this.protocols.set(name, protocol);
    this.protocolDetector.registerProtocol(name, protocol);
    debugLog(`Registered payment protocol: ${name}`);
  }

  /**
   * Check if a message contains a payment request
   */
  isPaymentRequired(message: JSONRPCMessage): boolean {
    const detection = this.protocolDetector.detectProtocol(message);
    return detection !== null;
  }

  /**
   * Process a payment required response (STATELESS)
   */
  async processPaymentRequired(
    message: JSONRPCMessage,
    originalRequest?: JSONRPCMessage
  ): Promise<JSONRPCMessage> {
    const detection = this.protocolDetector.detectProtocol(message);
    if (!detection) {
      debugLog('No payment protocol detected for message');
      return message;
    }

    const { protocol: activeProtocol, name: protocolName, extractedData } = detection;
    debugLog(`Processing payment with ${protocolName} protocol`);

    // Use pre-extracted data instead of extracting again
    const paymentDetails = activeProtocol.extractPaymentDetails(extractedData);
    
    if (!paymentDetails) {
      debugLog(`Failed to extract payment details from ${protocolName} response`);
      return message;
    }

    // Configure wallet for the required chain (x402 auto-configuration)
    if (paymentDetails.transaction?.chainId) {
      try {
        this.walletService.configureForChain(paymentDetails.transaction.chainId);
        debugLog(`Configured wallet for chain ${paymentDetails.transaction.chainId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debugLog(`Failed to configure wallet for chain: ${errorMessage}`);
        return this.createErrorResponse(message, `Chain configuration failed: ${errorMessage}`);
      }
    }

    // Get current wallet balances for user transparency
    let walletBalances;
    try {
      walletBalances = await this.walletService.getWalletBalances();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog(`Failed to get wallet balances: ${errorMessage}`);
      return this.createErrorResponse(message, `Unable to check wallet balances: ${errorMessage}`);
    }
    
    const requiredAmount = parseFloat(paymentDetails.amount);
    const availableUsdc = parseFloat(walletBalances.usdc);
    const availableEth = parseFloat(walletBalances.eth);

    // Calculate actual gas requirements using centralized estimation
    const gasEstimate = await this.estimateTransactionGas(paymentDetails.transaction, availableEth);
    const hasSufficientFunds = availableUsdc >= requiredAmount && gasEstimate.sufficient;

    // Format for user and agent with wallet balances (now with real gas estimation)
    const userDisplay = await activeProtocol.formatForUser(paymentDetails, walletBalances, this.walletService);
    const agentInstructions = activeProtocol.formatForAgent(
      paymentDetails,
      originalRequest ? this.extractRequestParams(originalRequest) : undefined
    );

    // Create enhanced STATELESS response for the agent
    const enhancedResponse = {
      payment_authorization_required: {
        user_display: userDisplay,
        agent_instructions: agentInstructions,
        wallet_balances: {
          usdc: walletBalances.usdc,
          eth: walletBalances.eth,
          sufficient_funds: hasSufficientFunds
        },
        payment_transaction: paymentDetails.transaction,
        cost_breakdown: {
          payment_amount: `${paymentDetails.amount} ${paymentDetails.currency}`,
          estimated_gas: `~${gasEstimate.costEth} ETH`,
          total_cost: `${paymentDetails.amount} ${paymentDetails.currency} + ~${gasEstimate.costEth} ETH gas`,
          gas_estimation_note: gasEstimate.errorMessage || 'Real-time gas estimate'
        },
        payment_details: {
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
          description: paymentDetails.description || paymentDetails.message,
          recipient: paymentDetails.headers?.['x-agentpay-recipient'] || 
                     paymentDetails.transaction?.to || 
                     'Unknown',
        },
      },
    };

    // Return enhanced message
    return this.createEnhancedMessage(message, enhancedResponse);
  }

  /**
   * Check if a request contains payment authorization (STATELESS)
   */
  hasPaymentAuthorization(message: JSONRPCMessage): boolean {
    // Check for AgentAuth wallet payment authorization parameters
    if (message && typeof message === 'object' && 'params' in message && message.params) {
      const params = message.params as any;
      // Check for aa_ prefixed parameters and transaction
      if (params.arguments && 
          (params.arguments.aa_payment_approved === true || params.arguments.aa_payment_approved === 'true') && 
          params.arguments.aa_payment_transaction) {
        return true;
      }
    }
    return false;
  }

  /**
   * Process a payment authorization request (STATELESS)
   */
  async processPaymentAuthorization(
    message: JSONRPCMessage
  ): Promise<{ headers?: Record<string, string>; error?: string }> {
    if (!('params' in message) || !message.params) {
      return { error: 'No parameters in message' };
    }

    const params = message.params as any;
    const args = params.arguments;
    
    if (!args || !args.aa_payment_approved || !args.aa_payment_transaction) {
      return { error: 'Missing payment authorization parameters' };
    }

    // Parse transaction if it's a string (JSON)
    let transaction = args.aa_payment_transaction;
    if (typeof transaction === 'string') {
      try {
        transaction = JSON.parse(transaction);
      } catch (error) {
        return { error: 'Invalid transaction format: unable to parse JSON' };
      }
    }

    try {
      // Find the appropriate protocol 
      const protocol = this.protocols.get('agentpay-v002');
      if (!protocol) {
        return { error: 'AgentPay v0.0.2 protocol not available' };
      }

      // Attempt to fix LLM-truncated transaction data
      const fixedTransaction = protocol.fixTruncatedTransactionData(transaction);

      // Validate transaction template (using fixed version)
      const validation = protocol.validateTransactionTemplate(fixedTransaction);
      if (!validation.valid) {
        return { error: `Invalid transaction: ${validation.errors.join(', ')}` };
      }

      // Use the fixed transaction for signing
      transaction = fixedTransaction;

      // Check wallet balance
      const balances = await this.walletService.getWalletBalances();

      // Extract actual required amount from transaction data
      const requiredAmount = this.extractAmountFromTransaction(transaction);
      const availableUsdc = parseFloat(balances.usdc);
      const availableEth = parseFloat(balances.eth);

      if (availableUsdc < requiredAmount) {
        return {
          error: `Insufficient USDC balance. Required: ${requiredAmount}, Available: ${availableUsdc}`
        };
      }

      // Calculate actual gas cost for this transaction using centralized estimation
      const gasEstimate = await this.estimateTransactionGas(transaction, availableEth);

      if (!gasEstimate.sufficient) {
        return {
          error: `Insufficient ETH for gas. Required: ~${gasEstimate.costEth} ETH, Available: ${availableEth}${gasEstimate.errorMessage ? ` (${gasEstimate.errorMessage})` : ''}`
        };
      }

      // Sign the transaction
      const { signedTx, from } = await protocol.signPaymentTransaction(
        transaction,
        this.walletService
      );

      // Create authorization headers
      const headers = protocol.createAuthorizationHeaders(signedTx, from);

      debugLog('Payment authorization successful, headers created');
      return { headers };

    } catch (error) {
      debugLog('Payment authorization error:', error);
      return {
        error: error instanceof Error ? error.message : 'Payment processing failed',
      };
    }
  }


  /**
   * Extract request parameters
   */
  private extractRequestParams(message: JSONRPCMessage): any {
    if ('params' in message && message.params) {
      return message.params;
    }
    return null;
  }

  /**
   * Create an enhanced message with payment info
   */
  private createEnhancedMessage(
    original: JSONRPCMessage,
    enhancement: any
  ): JSONRPCMessage {
    // For error responses
    if ('error' in original) {
      return {
        ...original,
        error: {
          code: -32001,
          message: 'Payment authorization required',
          data: enhancement,
        },
      };
    }

    // For result responses
    return {
      ...original,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(enhancement, null, 2),
          },
        ],
      },
    };
  }

  /**
   * Create an error response for payment failures
   */
  private createErrorResponse(
    original: JSONRPCMessage,
    errorMessage: string
  ): JSONRPCMessage {
    return {
      jsonrpc: '2.0',
      id: 'id' in original ? original.id : 'error',
      error: {
        code: -32001,
        message: 'Payment processing failed',
        data: {
          error_type: 'payment_configuration_failed',
          message: errorMessage,
          instructions: 'Please check your configuration and try again.'
        }
      }
    };
  }

  /**
   * Estimate gas cost for transaction with robust error handling
   * Returns { costEth: string, sufficient: boolean, errorMessage?: string }
   */
  private async estimateTransactionGas(
    transaction: any,
    availableEth: number
  ): Promise<{ costEth: string; sufficient: boolean; errorMessage?: string }> {
    const fallbackGasCost = '0.00005'; // Realistic fallback for ERC-20 transfers on Base network (aligns with 50k gas limit)

    if (!transaction) {
      return {
        costEth: fallbackGasCost,
        sufficient: availableEth > parseFloat(fallbackGasCost),
        errorMessage: 'No transaction provided for gas estimation'
      };
    }

    try {
      // Configure wallet for transaction's chain if needed
      if (transaction.chainId && this.walletService.getCurrentChainId() !== transaction.chainId) {
        this.walletService.configureForChain(transaction.chainId);
      }

      const gasCostEth = await this.walletService.estimateTxCost(transaction);
      const gasCostNumber = parseFloat(gasCostEth);

      debugLog(`Gas estimation successful: ${gasCostEth} ETH for transaction`);

      return {
        costEth: gasCostEth,
        sufficient: availableEth > gasCostNumber
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog(`Gas estimation failed, using fallback: ${errorMessage}`);

      return {
        costEth: fallbackGasCost,
        sufficient: availableEth > parseFloat(fallbackGasCost),
        errorMessage: `Gas estimation failed: ${errorMessage}`
      };
    }
  }

  /**
   * Extract USDC amount from transaction data
   */
  private extractAmountFromTransaction(transaction: any): number {
    try {
      // For ERC-20 transfer transactions, extract amount from transaction data
      if (transaction.data && transaction.data.startsWith('0xa9059cbb')) {
        // Decode ERC-20 transfer data: transfer(address to, uint256 amount)
        const amountHex = transaction.data.slice(-64); // Last 64 hex chars = amount
        const amountWei = BigInt('0x' + amountHex);
        const amountUsdc = parseFloat(ethers.formatUnits(amountWei, 6)); // USDC has 6 decimals

        debugLog(`Extracted amount from transaction: ${amountWei} atomic units = ${amountUsdc} USDC`);
        return amountUsdc;
      } else {
        debugLog('Transaction data format not recognized for amount extraction');
        return 0;
      }
    } catch (error) {
      debugLog('Error extracting amount from transaction:', error);
      return 0;
    }
  }

}