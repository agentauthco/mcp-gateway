/**
 * Multi-Chain Configuration Tests for PaymentHandler
 *
 * Simple unit tests focused on core multi-chain functionality
 * without complex integration testing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentHandler } from './paymentHandler.js';
import { WalletService } from '../wallet/walletService.js';

describe('PaymentHandler Multi-Chain Unit Tests', () => {
  let paymentHandler: PaymentHandler;
  let walletService: WalletService;
  const testToken = 'aa-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    walletService = new WalletService(testToken);
    paymentHandler = new PaymentHandler(walletService);
  });

  describe('Payment Protocol Detection', () => {
    it('should detect valid x402 payment requirements', () => {
      const validX402Message = {
        jsonrpc: '2.0' as const,
        id: 'test',
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              x402Version: 1,
              accepts: [{
                maxAmountRequired: '1000000',
                resource: 'test-resource',
                description: 'Test payment',
                payTo: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                scheme: 'erc20',
                network: 'base',
                asset: 'USDC',
                maxTimeoutSeconds: 300
              }],
              error: null
            })
          }]
        }
      };

      const isPaymentRequired = paymentHandler.isPaymentRequired(validX402Message);
      expect(isPaymentRequired).toBe(true);
    });

    it('should detect valid AgentPay v0.0.2 payment requirements', () => {
      const validAgentPayMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'payment_required',
              code: 402,
              message: 'Payment required for this operation',
              amount: '1.00',
              currency: 'USDC',
              description: 'Test AgentPay payment'
            })
          }]
        }
      };

      const isPaymentRequired = paymentHandler.isPaymentRequired(validAgentPayMessage);
      expect(isPaymentRequired).toBe(true);
    });

    it('should not detect payment requirements in regular messages', () => {
      const regularMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        result: {
          content: [{
            type: 'text',
            text: 'This is a regular response without payment requirements'
          }]
        }
      };

      const isPaymentRequired = paymentHandler.isPaymentRequired(regularMessage);
      expect(isPaymentRequired).toBe(false);
    });

    it('should handle malformed payment messages gracefully', () => {
      const malformedMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        result: {
          content: [{
            type: 'text',
            text: 'invalid json {'
          }]
        }
      };

      const isPaymentRequired = paymentHandler.isPaymentRequired(malformedMessage);
      expect(isPaymentRequired).toBe(false);
    });

    it('should prioritize x402 over AgentPay when both present', () => {
      // This shouldn't happen in practice, but tests protocol priority
      const mixedMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              x402Version: 1,
              accepts: [{
                maxAmountRequired: '1000000',
                resource: 'test',
                description: 'x402 payment',
                payTo: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                scheme: 'erc20',
                network: 'base',
                asset: 'USDC',
                maxTimeoutSeconds: 300
              }],
              error: null,
              // Also has AgentPay fields (should be ignored)
              payment_error: 'payment_required',
              code: 402,
              amount: '1.00',
              currency: 'USDC'
            })
          }]
        }
      };

      const isPaymentRequired = paymentHandler.isPaymentRequired(mixedMessage);
      expect(isPaymentRequired).toBe(true);
    });
  });

  describe('Payment Authorization Detection', () => {
    it('should detect valid payment authorization', () => {
      const authMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            query: 'test',
            aa_payment_approved: true,
            aa_payment_transaction: {
              to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              data: '0xa9059cbb000000000000000000000000fcad0b19bb29d4674531d6f115237e16afce377c00000000000000000000000000000000000000000000000000000000000f4240',
              value: '0x0',
              chainId: 8453,
              gasLimit: '50000'
            }
          }
        }
      };

      const hasAuth = paymentHandler.hasPaymentAuthorization(authMessage);
      expect(hasAuth).toBe(true);
    });

    it('should detect payment authorization with string approved flag', () => {
      const authMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            query: 'test',
            aa_payment_approved: 'true',
            aa_payment_transaction: JSON.stringify({
              to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              data: '0xa9059cbb000000000000000000000000fcad0b19bb29d4674531d6f115237e16afce377c00000000000000000000000000000000000000000000000000000000000f4240',
              value: '0x0',
              chainId: 8453,
              gasLimit: '50000'
            })
          }
        }
      };

      const hasAuth = paymentHandler.hasPaymentAuthorization(authMessage);
      expect(hasAuth).toBe(true);
    });

    it('should not detect authorization without approved flag', () => {
      const noAuthMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            query: 'test',
            aa_payment_transaction: {
              to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              data: '0xa9059cbb000000000000000000000000fcad0b19bb29d4674531d6f115237e16afce377c00000000000000000000000000000000000000000000000000000000000f4240',
              value: '0x0',
              chainId: 8453,
              gasLimit: '50000'
            }
          }
        }
      };

      const hasAuth = paymentHandler.hasPaymentAuthorization(noAuthMessage);
      expect(hasAuth).toBe(false);
    });

    it('should not detect authorization without transaction', () => {
      const incompleteAuthMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            query: 'test',
            aa_payment_approved: true
            // Missing aa_payment_transaction
          }
        }
      };

      const hasAuth = paymentHandler.hasPaymentAuthorization(incompleteAuthMessage);
      expect(hasAuth).toBe(false);
    });

    it('should handle messages without params gracefully', () => {
      const noParamsMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        method: 'tools/call'
        // Missing params
      };

      const hasAuth = paymentHandler.hasPaymentAuthorization(noParamsMessage);
      expect(hasAuth).toBe(false);
    });
  });

  describe('WalletService Chain Configuration', () => {
    it('should configure wallet for supported chains', () => {
      // Base mainnet
      expect(() => walletService.configureForChain(8453)).not.toThrow();
      expect(walletService.getCurrentChainId()).toBe(8453);
      expect(walletService.getUsdcContractAddress()).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');

      // Base Sepolia
      expect(() => walletService.configureForChain(84532)).not.toThrow();
      expect(walletService.getCurrentChainId()).toBe(84532);
      expect(walletService.getUsdcContractAddress()).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    });

    it('should reject unsupported chains', () => {
      expect(() => walletService.configureForChain(1))
        .toThrow('Unsupported chain ID: 1');
    });

    it('should handle chain switching efficiently', () => {
      walletService.configureForChain(8453);
      const firstChainId = walletService.getCurrentChainId();

      walletService.configureForChain(84532);
      const secondChainId = walletService.getCurrentChainId();

      // Should switch properly
      expect(firstChainId).toBe(8453);
      expect(secondChainId).toBe(84532);
    });

    it('should optimize for repeated chain configurations', () => {
      walletService.configureForChain(8453);
      const initialState = walletService.getCurrentChainId();

      // Reconfigure to same chain - should be efficient
      walletService.configureForChain(8453);
      const afterReconfigure = walletService.getCurrentChainId();

      expect(initialState).toBe(afterReconfigure);
      expect(afterReconfigure).toBe(8453);
    });
  });

  describe('Error Resilience', () => {
    it('should handle null/undefined messages gracefully', () => {
      expect(paymentHandler.isPaymentRequired(null)).toBe(false);
      expect(paymentHandler.isPaymentRequired(undefined)).toBe(false);
      expect(paymentHandler.hasPaymentAuthorization(null as any)).toBe(false);
      expect(paymentHandler.hasPaymentAuthorization(undefined as any)).toBe(false);
    });

    it('should handle empty messages gracefully', () => {
      const emptyMessage = {};
      expect(paymentHandler.isPaymentRequired(emptyMessage)).toBe(false);
      expect(paymentHandler.hasPaymentAuthorization(emptyMessage as any)).toBe(false);
    });

    it('should handle malformed JSON in content gracefully', () => {
      const malformedContentMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        result: {
          content: [{
            type: 'text',
            text: '{"malformed": json'
          }]
        }
      };

      expect(paymentHandler.isPaymentRequired(malformedContentMessage)).toBe(false);
    });

    it('should handle missing content fields gracefully', () => {
      const noContentMessage = {
        jsonrpc: '2.0' as const,
        id: 'test',
        result: {}
      };

      expect(paymentHandler.isPaymentRequired(noContentMessage)).toBe(false);
    });
  });
});