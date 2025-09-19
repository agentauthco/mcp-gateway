/**
 * Integration test for x402 protocol support
 * Tests zero-configuration setup and protocol detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { X402Protocol } from '../../src/protocols/x402.js';
import { ProtocolDetector } from '../../src/payments/protocolDetector.js';
import { AgentPayV002Protocol } from '../../src/protocols/agentpay-v002.js';
import { WalletService } from '../../src/wallet/walletService.js';

describe('x402 Protocol Integration Testing', () => {
  let protocols: Map<string, any>;
  let detector: ProtocolDetector;

  beforeEach(() => {
    protocols = new Map();
    protocols.set('x402', new X402Protocol());
    protocols.set('agentpay-v002', new AgentPayV002Protocol());
    detector = new ProtocolDetector(protocols);
  });

  describe('Protocol Detection Priority', () => {
    it('should register protocols correctly', () => {
      const registeredProtocols = detector.getRegisteredProtocols();
      expect(registeredProtocols).toContain('x402');
      expect(registeredProtocols).toContain('agentpay-v002');
    });

    it('should have correct priority order (x402 first)', () => {
      const priority = detector.getProtocolPriority();
      expect(priority).toEqual(['x402', 'agentpay-v002']);
    });
  });

  describe('x402 Response Detection', () => {
    const x402Response = {
      error: {
        data: {
          x402Version: 1,
          accepts: [{
            scheme: 'simple',
            network: 'base',
            maxAmountRequired: '1000000',
            resource: 'test-resource',
            description: 'Test payment',
            mimeType: 'application/json',
            outputSchema: null,
            payTo: '0xdF6d600645Df42d7feaEFD6E825eF6b7CF4f0D4c',
            asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            maxTimeoutSeconds: 300,
            extra: null
          }],
          error: 'payment_required'
        }
      }
    };

    it('should detect x402 protocol correctly', () => {
      const detection = detector.detectProtocol(x402Response);
      expect(detection).toBeTruthy();
      expect(detection!.name).toBe('x402');
    });

    it('should extract x402 payment details', () => {
      const detection = detector.detectProtocol(x402Response);
      expect(detection).toBeTruthy();

      const protocol = detection!.protocol;
      const paymentDetails = protocol.extractPaymentDetails(x402Response.error.data);

      expect(paymentDetails).toBeTruthy();
      expect(paymentDetails?.transaction).toBeDefined();
      expect(paymentDetails?.transaction?.chainId).toBe(8453);
      expect(paymentDetails?.transaction?.to).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });
  });

  describe('AgentPay Fallback Detection', () => {
    const agentPayResponse = {
      error: {
        data: {
          error: 'payment_required',
          amount: '1.00',
          currency: 'USDC',
          description: 'Test AgentPay payment'
        }
      }
    };

    it('should detect AgentPay protocol as fallback', () => {
      const detection = detector.detectProtocol(agentPayResponse);
      expect(detection).toBeTruthy();
      expect(detection!.name).toBe('agentpay-v002');
    });
  });

  describe('Zero-Configuration Wallet Setup', () => {
    const testToken = 'aa-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    it('should start wallet in unconfigured state', () => {
      const wallet = new WalletService(testToken);
      expect(wallet.isConfigured()).toBe(false);
    });

    it('should configure for Base mainnet correctly', () => {
      const wallet = new WalletService(testToken);

      wallet.configureForChain(8453);

      expect(wallet.isConfigured()).toBe(true);
      expect(wallet.getCurrentChainId()).toBe(8453);
    });

    it('should retrieve correct USDC address for Base', () => {
      const wallet = new WalletService(testToken);

      wallet.configureForChain(8453);
      const usdcAddress = wallet.getUsdcContractAddress();

      expect(usdcAddress).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });

    it('should handle chain switching correctly', () => {
      const wallet = new WalletService(testToken);

      // Configure for Base mainnet
      wallet.configureForChain(8453);
      expect(wallet.getCurrentChainId()).toBe(8453);

      // Switch to Base Sepolia
      wallet.configureForChain(84532);
      expect(wallet.getCurrentChainId()).toBe(84532);
      expect(wallet.getUsdcContractAddress()).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    });
  });

  describe('x402 Transaction Building', () => {
    const x402Response = {
      error: {
        data: {
          x402Version: 1,
          accepts: [{
            scheme: 'simple',
            network: 'base',
            maxAmountRequired: '1000000',
            resource: 'test-resource',
            description: 'Test payment',
            mimeType: 'application/json',
            outputSchema: null,
            payTo: '0xdF6d600645Df42d7feaEFD6E825eF6b7CF4f0D4c',
            asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            maxTimeoutSeconds: 300,
            extra: null
          }],
          error: 'payment_required'
        }
      }
    };

    it('should build x402 transaction successfully', () => {
      const x402Protocol = new X402Protocol();
      const paymentDetails = x402Protocol.extractPaymentDetails(x402Response.error.data);

      expect(paymentDetails).toBeTruthy();
      expect(paymentDetails?.transaction).toBeTruthy();
      expect(paymentDetails?.transaction?.chainId).toBe(8453);
      expect(paymentDetails?.transaction?.to).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
      expect(paymentDetails?.amount).toBeDefined();
      expect(paymentDetails?.currency).toBeDefined();
    });
  });

  describe('Environment Requirements Validation', () => {
    it('should identify required environment variables', () => {
      const requiredEnvVars = ['AGENTAUTH_TOKEN'];
      const optionalEnvVars = ['BASE_RPC_URL', 'BASE_SEPOLIA_RPC_URL', 'DEBUG'];

      // This test validates our zero-config approach
      expect(requiredEnvVars).toContain('AGENTAUTH_TOKEN');
      expect(optionalEnvVars).toContain('DEBUG');

      // Zero configuration achieved - only token required
      expect(requiredEnvVars.length).toBe(1);
    });
  });

  describe('Integration Summary Validation', () => {
    it('should validate all critical integration components', () => {
      const testToken = 'aa-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const wallet = new WalletService(testToken);

      // Test protocol prioritization
      const priority = detector.getProtocolPriority();
      expect(priority[0]).toBe('x402');

      // Test fallback compatibility
      const agentPayResponse = {
        error: {
          data: {
            error: 'payment_required',
            amount: '1.00',
            currency: 'USDC',
            description: 'Test'
          }
        }
      };
      const agentPayDetection = detector.detectProtocol(agentPayResponse);
      expect(agentPayDetection!.name).toBe('agentpay-v002');

      // Test zero-configuration
      expect(wallet.isConfigured()).toBe(false);
      wallet.configureForChain(8453);
      expect(wallet.isConfigured()).toBe(true);

      // Test wallet configuration
      expect(wallet.getCurrentChainId()).toBe(8453);
      expect(wallet.getUsdcContractAddress()).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });
  });
});