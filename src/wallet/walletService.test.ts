/**
 * Comprehensive Unit Tests for WalletService
 *
 * Tests all core wallet functionality including private key derivation,
 * address generation, chain configuration, gas estimation, and transaction handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WalletService } from './walletService.js';

describe('WalletService Comprehensive Unit Tests', () => {
  let walletService: WalletService;
  const testToken = 'aa-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    walletService = new WalletService(testToken);
  });

  describe('Private Key Derivation and Address Generation', () => {
    it('should handle aa- prefixed tokens correctly', () => {
      const aaToken = 'aa-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const wallet = new WalletService(aaToken);
      const address = wallet.getAddress();

      expect(address).toBeDefined();
      expect(address.startsWith('0x')).toBe(true);
      expect(address.length).toBe(42); // Standard Ethereum address length
    });

    it('should handle 0x prefixed private keys correctly', () => {
      const hexToken = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const wallet = new WalletService(hexToken);
      const address = wallet.getAddress();

      expect(address).toBeDefined();
      expect(address.startsWith('0x')).toBe(true);
      expect(address.length).toBe(42);
    });

    it('should handle raw hex private keys correctly', () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const wallet = new WalletService(rawToken);
      const address = wallet.getAddress();

      expect(address).toBeDefined();
      expect(address.startsWith('0x')).toBe(true);
      expect(address.length).toBe(42);
    });

    it('should throw error for invalid private key format', () => {
      const invalidKeys = [
        'invalid-key',
        'aa-invalid',
        '0x123', // Too short
        '', // Empty
        'not-hex-characters-gggg'
      ];

      invalidKeys.forEach(key => {
        expect(() => new WalletService(key)).toThrow('Invalid private key format');
      });
    });

    it('should generate consistent addresses for same private key', () => {
      const wallet1 = new WalletService(testToken);
      const wallet2 = new WalletService(testToken);

      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
    });
  });

  describe('Zero Configuration Mode', () => {
    it('should start unconfigured by default', () => {
      expect(walletService.isConfigured()).toBe(false);
      expect(walletService.getCurrentChainId()).toBeNull();
    });

    it('should throw error when trying to use unconfigured methods', () => {
      expect(() => walletService.getUsdcContractAddress()).toThrow('Chain not configured');
    });
  });

  describe('Chain Configuration', () => {
    it('should configure for Base mainnet', () => {
      expect(() => walletService.configureForChain(8453)).not.toThrow();
      expect(walletService.getCurrentChainId()).toBe(8453);
      expect(walletService.isConfigured()).toBe(true);
    });

    it('should configure for Base Sepolia', () => {
      expect(() => walletService.configureForChain(84532)).not.toThrow();
      expect(walletService.getCurrentChainId()).toBe(84532);
      expect(walletService.isConfigured()).toBe(true);
    });

    it('should throw error for unsupported chain', () => {
      expect(() => walletService.configureForChain(1))
        .toThrow('Unsupported chain ID: 1');
    });

    it('should get correct USDC address for Base mainnet', () => {
      walletService.configureForChain(8453);
      expect(walletService.getUsdcContractAddress())
        .toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });

    it('should get correct USDC address for Base Sepolia', () => {
      walletService.configureForChain(84532);
      expect(walletService.getUsdcContractAddress())
        .toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when getting USDC address without configuration', () => {
      expect(() => walletService.getUsdcContractAddress())
        .toThrow('Chain not configured. Call configureForChain() first.');
    });

    it('should throw error when checking gas price without configuration', async () => {
      await expect(walletService.getGasPrice())
        .rejects.toThrow('Chain not configured. Call configureForChain() first.');
    });

    it('should throw error when estimating gas without configuration', async () => {
      const txRequest = {
        to: '0x742d35Cc6434C0532925A3b8c17BF049880B8fB3',
        value: '0x16345785d8a0000', // 0.1 ETH
      };

      await expect(walletService.estimateGas(txRequest))
        .rejects.toThrow('Chain not configured. Call configureForChain() first.');
    });

    it('should throw error when estimating tx cost without configuration', async () => {
      const txRequest = {
        to: '0x742d35Cc6434C0532925A3b8c17BF049880B8fB3',
        value: '0x16345785d8a0000', // 0.1 ETH
      };

      await expect(walletService.estimateTxCost(txRequest))
        .rejects.toThrow('Chain not configured. Call configureForChain() first.');
    });
  });

  describe('Address Generation', () => {
    it('should generate consistent address from same token', () => {
      const address1 = walletService.getAddress();
      const walletService2 = new WalletService(testToken);
      const address2 = walletService2.getAddress();

      expect(address1).toBe(address2);
      expect(address1).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should generate different addresses from different tokens', () => {
      const testToken2 = 'aa-fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const walletService2 = new WalletService(testToken2);

      expect(walletService.getAddress()).not.toBe(walletService2.getAddress());
    });
  });

  describe('Configuration State', () => {
    it('should start unconfigured', () => {
      expect(walletService.isConfigured()).toBe(false);
      expect(walletService.getCurrentChainId()).toBe(null);
    });

    it('should handle multiple chain reconfigurations', () => {
      // First configuration
      walletService.configureForChain(8453);
      expect(walletService.getCurrentChainId()).toBe(8453);

      // Second configuration
      walletService.configureForChain(84532);
      expect(walletService.getCurrentChainId()).toBe(84532);
      expect(walletService.isConfigured()).toBe(true);
    });

    it('should skip reconfiguration for same chain', () => {
      walletService.configureForChain(8453);
      const firstConfig = walletService.getCurrentChainId();

      // Should not throw or change anything
      walletService.configureForChain(8453);
      expect(walletService.getCurrentChainId()).toBe(firstConfig);
    });
  });

  describe('Private Key Handling', () => {
    it('should handle aa- prefixed token', () => {
      const tokenWithPrefix = 'aa-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const walletWithPrefix = new WalletService(tokenWithPrefix);

      expect(walletWithPrefix.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should handle 0x prefixed token', () => {
      const tokenWith0x = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const walletWith0x = new WalletService(tokenWith0x);

      expect(walletWith0x.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should handle raw hex token', () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const walletRaw = new WalletService(rawToken);

      expect(walletRaw.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should reject invalid token format', () => {
      expect(() => new WalletService('invalid-token'))
        .toThrow('Invalid private key format');

      expect(() => new WalletService('aa-invalid'))
        .toThrow('Invalid private key format');

      expect(() => new WalletService('0xinvalid'))
        .toThrow('Invalid private key format');
    });
  });
});