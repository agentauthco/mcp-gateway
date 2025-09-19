/**
 * Direct test of x402 protocol detection with real server response
 * This tests our protocol implementation without running the full proxy
 */

import { describe, it, expect } from 'vitest';
import { X402Protocol } from '../../src/protocols/x402.js';
import { ProtocolDetector } from '../../src/payments/protocolDetector.js';
import { AgentPayV002Protocol } from '../../src/protocols/agentpay-v002.js';

describe('x402 Protocol Integration - Direct Testing', () => {
  // Real x402 server response from http://localhost:4021/weather
  const realX402Response = {
    error: {
      code: 402,
      message: "Payment Required",
      data: {
        x402Version: 1,
        error: "X-PAYMENT header is required",
        accepts: [
          {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "1000",
            resource: "http://localhost:4021/weather",
            description: "",
            mimeType: "",
            payTo: "0x616F5Ab2095EA299a3C819Bf5b381eA342BAfbc9",
            maxTimeoutSeconds: 60,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            outputSchema: {
              input: {
                type: "http",
                method: "GET",
                discoverable: true
              }
            },
            extra: {
              name: "USD Coin",
              version: "2"
            }
          }
        ]
      }
    }
  };

  it('should detect x402 protocol from real server response', () => {
    const protocols = new Map();
    protocols.set('x402', new X402Protocol());
    protocols.set('agentpay-v002', new AgentPayV002Protocol());

    const detector = new ProtocolDetector(protocols);
    const detection = detector.detectProtocol(realX402Response);

    expect(detection).toBeTruthy();
    expect(detection!.name).toBe('x402');
  });

  it('should extract payment details from real server response', () => {
    const protocols = new Map();
    protocols.set('x402', new X402Protocol());
    protocols.set('agentpay-v002', new AgentPayV002Protocol());

    const detector = new ProtocolDetector(protocols);
    const detection = detector.detectProtocol(realX402Response);

    expect(detection).toBeTruthy();

    const protocol = detection!.protocol;
    const paymentDetails = protocol.extractPaymentDetails(realX402Response.error.data);

    expect(paymentDetails).toBeTruthy();
    expect(paymentDetails!.amount).toBeDefined();
    expect(paymentDetails!.currency).toBeDefined();
    expect(paymentDetails!.transaction).toBeDefined();
  });

  it('should build correct transaction data for Base mainnet', () => {
    const protocols = new Map();
    protocols.set('x402', new X402Protocol());

    const detector = new ProtocolDetector(protocols);
    const detection = detector.detectProtocol(realX402Response);

    const protocol = detection!.protocol;
    const paymentDetails = protocol.extractPaymentDetails(realX402Response.error.data);

    // Expected values for Base mainnet
    const expectedUsdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const expectedChainId = 8453; // Base mainnet

    expect(paymentDetails!.transaction.to).toBe(expectedUsdcAddress);
    expect(paymentDetails!.transaction.chainId).toBe(expectedChainId);
  });

  it('should create valid ERC-20 transfer transaction data', () => {
    const protocols = new Map();
    protocols.set('x402', new X402Protocol());

    const detector = new ProtocolDetector(protocols);
    const detection = detector.detectProtocol(realX402Response);

    const protocol = detection!.protocol;
    const paymentDetails = protocol.extractPaymentDetails(realX402Response.error.data);

    const transferMethodId = '0xa9059cbb'; // transfer(address,uint256)
    expect(paymentDetails!.transaction.data.startsWith(transferMethodId)).toBe(true);

    // Decode recipient and amount from transaction data
    const recipient = '0x' + paymentDetails!.transaction.data.substring(34, 74);
    const amountHex = '0x' + paymentDetails!.transaction.data.substring(74, 138);
    const amountDecimal = parseInt(amountHex, 16);

    expect(recipient.length).toBe(42); // Valid Ethereum address
    expect(amountDecimal).toBeGreaterThan(0);

    // Should be 1000 atomic units (0.001 USDC with 6 decimals)
    const usdcAmount = amountDecimal / 1000000;
    expect(usdcAmount).toBe(0.001);
  });

  it('should validate all critical x402 implementation components', () => {
    const protocols = new Map();
    protocols.set('x402', new X402Protocol());
    protocols.set('agentpay-v002', new AgentPayV002Protocol());

    const detector = new ProtocolDetector(protocols);
    const detection = detector.detectProtocol(realX402Response);

    expect(detection).toBeTruthy();

    const protocol = detection!.protocol;
    const paymentDetails = protocol.extractPaymentDetails(realX402Response.error.data);

    // Comprehensive validation of all components
    expect(detection.name).toBe('x402');
    expect(paymentDetails).toBeTruthy();
    expect(paymentDetails!.transaction.chainId).toBe(8453);
    expect(paymentDetails!.transaction.to).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(paymentDetails!.transaction.data.startsWith('0xa9059cbb')).toBe(true);
    expect(paymentDetails!.transaction.gasLimit).toBeDefined();
  });
});