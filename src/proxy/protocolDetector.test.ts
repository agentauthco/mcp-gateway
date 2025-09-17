/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProtocolDetector } from './protocolDetector.js';
import { X402Protocol } from '../protocols/x402.js';
import { AgentPayV002Protocol } from '../protocols/agentpay-v002.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { PaymentProtocol } from '../protocols/agentpay-v002.js';

describe('ProtocolDetector', () => {
  let protocolDetector: ProtocolDetector;
  let mockX402Protocol: PaymentProtocol;
  let mockAgentPayProtocol: PaymentProtocol;

  beforeEach(() => {
    // Create mock protocols
    mockX402Protocol = new X402Protocol();
    mockAgentPayProtocol = new AgentPayV002Protocol();

    // Initialize detector with protocols
    const protocols = new Map<string, PaymentProtocol>();
    protocols.set('x402', mockX402Protocol);
    protocols.set('agentpay-v002', mockAgentPayProtocol);
    
    protocolDetector = new ProtocolDetector(protocols);
  });

  describe('MCP Content Format Detection', () => {
    it('should detect x402 payment requirement from MCP content format', () => {
      const mcpMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: 402,
                  message: 'Payment Required',
                  data: {
                    x402Version: 1,
                    accepts: [
                      {
                        scheme: 'simple',
                        network: 'base-sepolia',
                        maxAmountRequired: '1000000',
                        resource: 'article',
                        description: 'Article access fee',
                        mimeType: 'application/json',
                        outputSchema: null,
                        payTo: '0x1234567890123456789012345678901234567890',
                        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                        maxTimeoutSeconds: 300,
                        extra: null
                      }
                    ],
                    error: 'payment_required'
                  }
                }
              })
            }
          ]
        }
      };

      const detection = protocolDetector.detectProtocol(mcpMessage);
      
      expect(detection).not.toBeNull();
      expect(detection!.name).toBe('x402');
      expect(detection!.protocol).toBe(mockX402Protocol);
    });

    it('should detect AgentPay payment requirement from MCP content format', () => {
      const mcpMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: 402,
                  message: 'Payment Required',
                  data: {
                    error: 'payment_required',
                    amount: '1.0',
                    currency: 'USDC',
                    description: 'Article access fee',
                    transaction: {
                      to: '0x1234567890123456789012345678901234567890',
                      data: '0xa9059cbb000000000000000000000000742e4dea5c60d2cece1b95e96b2c8ccde97e3d94000000000000000000000000000000000000000000000000000000000000f4240',
                      value: '0x0',
                      chainId: 84532,
                      gasLimit: '50000'
                    }
                  }
                }
              })
            }
          ]
        }
      };

      const detection = protocolDetector.detectProtocol(mcpMessage);
      
      expect(detection).not.toBeNull();
      expect(detection!.name).toBe('agentpay-v002');
      expect(detection!.protocol).toBe(mockAgentPayProtocol);
    });

    it('should handle nested MCP content with dual protocol support', () => {
      const mcpMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: 402,
                  message: 'Payment Required',
                  data: {
                    // x402 protocol data (should be detected first due to priority)
                    x402Version: 1,
                    accepts: [
                      {
                        scheme: 'simple',
                        network: 'base-sepolia',
                        maxAmountRequired: '1000000',
                        resource: 'article',
                        description: 'Article access fee',
                        mimeType: 'application/json',
                        outputSchema: null,
                        payTo: '0x1234567890123456789012345678901234567890',
                        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                        maxTimeoutSeconds: 300,
                        extra: null
                      }
                    ],
                    // AgentPay fallback data
                    error: 'payment_required',
                    amount: '1.0',
                    currency: 'USDC',
                    description: 'Article access fee',
                    transaction: {
                      to: '0x1234567890123456789012345678901234567890',
                      data: '0xa9059cbb000000000000000000000000742e4dea5c60d2cece1b95e96b2c8ccde97e3d94000000000000000000000000000000000000000000000000000000000000f4240',
                      value: '0x0',
                      chainId: 84532,
                      gasLimit: '50000'
                    }
                  }
                }
              })
            }
          ]
        }
      };

      const detection = protocolDetector.detectProtocol(mcpMessage);
      
      // Should prioritize x402 over AgentPay
      expect(detection).not.toBeNull();
      expect(detection!.name).toBe('x402');
      expect(detection!.protocol).toBe(mockX402Protocol);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle direct JSON-RPC error responses (legacy format)', () => {
      const legacyMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: 402,
          message: 'Payment Required',
          data: {
            x402Version: 1,
            accepts: [
              {
                scheme: 'simple',
                network: 'base-sepolia',
                maxAmountRequired: '1000000',
                resource: 'article',
                description: 'Article access fee',
                mimeType: 'application/json',
                outputSchema: null,
                payTo: '0x1234567890123456789012345678901234567890',
                asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                maxTimeoutSeconds: 300,
                extra: null
              }
            ],
            error: 'payment_required'
          }
        }
      };

      const detection = protocolDetector.detectProtocol(legacyMessage);
      
      expect(detection).not.toBeNull();
      expect(detection!.name).toBe('x402');
      expect(detection!.protocol).toBe(mockX402Protocol);
    });

    it('should handle direct result responses (legacy format)', () => {
      const legacyMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          x402Version: 1,
          accepts: [
            {
              scheme: 'simple',
              network: 'base-sepolia',
              maxAmountRequired: '1000000',
              resource: 'article',
              description: 'Article access fee',
              mimeType: 'application/json',
              outputSchema: null,
              payTo: '0x1234567890123456789012345678901234567890',
              asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
              maxTimeoutSeconds: 300,
              extra: null
            }
          ],
          error: 'payment_required'
        }
      };

      const detection = protocolDetector.detectProtocol(legacyMessage);
      
      expect(detection).not.toBeNull();
      expect(detection!.name).toBe('x402');
      expect(detection!.protocol).toBe(mockX402Protocol);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed MCP content gracefully', () => {
      const malformedMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: 'invalid json content {'
            }
          ]
        }
      };

      const detection = protocolDetector.detectProtocol(malformedMessage);
      expect(detection).toBeNull();
    });

    it('should handle missing content array', () => {
      const invalidMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: []
        }
      };

      const detection = protocolDetector.detectProtocol(invalidMessage);
      expect(detection).toBeNull();
    });

    it('should handle non-text content type', () => {
      const invalidMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'image',
              data: 'base64encodeddata'
            }
          ]
        }
      };

      const detection = protocolDetector.detectProtocol(invalidMessage);
      expect(detection).toBeNull();
    });

    it('should handle empty or null messages', () => {
      expect(protocolDetector.detectProtocol({} as JSONRPCMessage)).toBeNull();
      expect(protocolDetector.detectProtocol({ jsonrpc: '2.0', id: 1 })).toBeNull();
    });

    it('should handle protocol detection errors gracefully', () => {
      // Create a protocol that throws during detection
      const faultyProtocol: PaymentProtocol = {
        isPaymentRequired: () => { throw new Error('Detection error'); },
        extractPaymentDetails: () => null,
        signPaymentTransaction: async () => ({ signedTx: '', from: '' }),
        createAuthorizationHeaders: () => ({}),
        formatForUser: () => '',
        formatForAgent: () => ''
      };

      const protocols = new Map<string, PaymentProtocol>();
      protocols.set('faulty', faultyProtocol);
      protocols.set('x402', mockX402Protocol);
      
      const detector = new ProtocolDetector(protocols);

      const mcpMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  data: {
                    x402Version: 1,
                    accepts: [
                      {
                        scheme: 'simple',
                        network: 'base-sepolia',
                        maxAmountRequired: '1000000',
                        resource: 'article',
                        description: 'Article access fee',
                        mimeType: 'application/json',
                        outputSchema: null,
                        payTo: '0x1234567890123456789012345678901234567890',
                        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                        maxTimeoutSeconds: 300,
                        extra: null
                      }
                    ]
                  }
                }
              })
            }
          ]
        }
      };

      // Should continue to next protocol despite the faulty one
      const detection = detector.detectProtocol(mcpMessage);
      expect(detection).not.toBeNull();
      expect(detection!.name).toBe('x402');
    });
  });

  describe('Protocol Priority', () => {
    it('should prioritize x402 over AgentPay when both are present', () => {
      const dualProtocolMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  data: {
                    // Both protocols present - x402 should win
                    x402Version: 1,
                    accepts: [
                      {
                        scheme: 'simple',
                        network: 'base-sepolia',
                        maxAmountRequired: '1000000',
                        resource: 'article',
                        description: 'Article access fee',
                        mimeType: 'application/json',
                        outputSchema: null,
                        payTo: '0x1234567890123456789012345678901234567890',
                        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                        maxTimeoutSeconds: 300,
                        extra: null
                      }
                    ],
                    error: 'payment_required',
                    amount: '1.0',
                    currency: 'USDC',
                    description: 'Article access fee'
                  }
                }
              })
            }
          ]
        }
      };

      const detection = protocolDetector.detectProtocol(dualProtocolMessage);
      
      expect(detection).not.toBeNull();
      expect(detection!.name).toBe('x402');
      expect(detection!.protocol).toBe(mockX402Protocol);
    });

    it('should return correct protocol priority order', () => {
      const priority = protocolDetector.getProtocolPriority();
      expect(priority).toEqual(['x402', 'agentpay-v002']);
    });

    it('should return registered protocols', () => {
      const registered = protocolDetector.getRegisteredProtocols();
      expect(registered).toContain('x402');
      expect(registered).toContain('agentpay-v002');
    });
  });

  describe('No Payment Required', () => {
    it('should return null for successful MCP responses without payment data', () => {
      const successMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: 'Article content goes here...'
            }
          ]
        }
      };

      const detection = protocolDetector.detectProtocol(successMessage);
      expect(detection).toBeNull();
    });

    it('should return null for non-payment JSON-RPC errors', () => {
      const errorMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: 404,
          message: 'Article not found'
        }
      };

      const detection = protocolDetector.detectProtocol(errorMessage);
      expect(detection).toBeNull();
    });
  });
});