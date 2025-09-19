/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

/**
 * Protocol Detection and Prioritization
 * 
 * Automatically detects payment protocol from server responses with
 * prioritization: x402 first, then AgentPay fallback.
 * 
 * Supports:
 * - x402 v1.0 standard detection
 * - AgentPay v0.0.2 detection
 * - Robust error handling for malformed responses
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { PaymentProtocol } from '../protocols/agentpay-v002.js';
import { debugLog } from '../lib/utils.js';
import { extractMCPResponseData } from '../lib/mcpUtils.js';

/**
 * Protocol detection result with extracted data
 */
export interface ProtocolDetection {
  protocol: PaymentProtocol;
  name: string;
  extractedData: any; // Pre-extracted data to avoid duplicate parsing
}

/**
 * Protocol detector with prioritized detection logic
 */
export class ProtocolDetector {
  private protocols: Map<string, PaymentProtocol>;
  private protocolPriority: string[];

  constructor(protocols: Map<string, PaymentProtocol>) {
    this.protocols = protocols;
    // Priority order: x402 first (industry standard), then AgentPay (fallback)
    this.protocolPriority = ['x402', 'agentpay-v002'];
    
    debugLog('Protocol detector initialized with protocols:', Array.from(protocols.keys()));
    debugLog('Detection priority order:', this.protocolPriority);
  }

  /**
   * Detect payment protocol from MCP message
   *
   * @param message JSON-RPC message from MCP server
   * @returns Protocol detection result with extracted data, or null if no payment required
   */
  detectProtocol(message: JSONRPCMessage): ProtocolDetection | null {
    try {
      debugLog('ProtocolDetector.detectProtocol - incoming message:', {
        hasError: 'error' in message,
        hasResult: 'result' in message,
        messageKeys: Object.keys(message)
      });

      // Extract data once using shared utility
      const extractedData = extractMCPResponseData(message);
      if (!extractedData) {
        debugLog('No response data found for protocol detection');
        return null;
      }

      debugLog('ProtocolDetector - extracted response data:', {
        extractedData,
        hasX402Version: 'x402Version' in extractedData,
        hasError: 'error' in extractedData,
        errorType: extractedData.error,
        keys: Object.keys(extractedData)
      });

      // Try each protocol in priority order
      for (const protocolName of this.protocolPriority) {
        const protocol = this.protocols.get(protocolName);
        if (!protocol) {
          debugLog(`Protocol ${protocolName} not registered, skipping`);
          continue;
        }

        debugLog(`Trying protocol ${protocolName} with response data`);
        try {
          if (protocol.isPaymentRequired(extractedData)) {
            debugLog(`Payment required detected by protocol: ${protocolName}`);
            return { protocol, name: protocolName, extractedData };
          } else {
            debugLog(`Protocol ${protocolName} does not detect payment requirement`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          debugLog(`Error in ${protocolName} detection:`, errorMessage);
          // Continue to next protocol instead of failing completely
        }
      }

      debugLog('No payment protocol detected for this response');
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog('Error in protocol detection:', errorMessage);
      return null;
    }
  }

  /**
   * Get list of registered protocols
   */
  getRegisteredProtocols(): string[] {
    return Array.from(this.protocols.keys());
  }

  /**
   * Get protocol priority order
   */
  getProtocolPriority(): string[] {
    return [...this.protocolPriority];
  }

  /**
   * Add or update protocol registration
   */
  registerProtocol(name: string, protocol: PaymentProtocol): void {
    this.protocols.set(name, protocol);
    debugLog(`Protocol registered: ${name}`);
    
    // Add to priority list if not already present
    if (!this.protocolPriority.includes(name)) {
      this.protocolPriority.push(name);
      debugLog(`Added ${name} to priority list:`, this.protocolPriority);
    }
  }

}