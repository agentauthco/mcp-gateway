/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

/**
 * MCP (Model Context Protocol) Utilities
 *
 * Shared utilities for parsing and extracting data from MCP messages.
 * Consolidates duplicate logic previously scattered across multiple files.
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { debugLog } from './utils.js';

/**
 * Extract response data from a JSON-RPC message
 * Enhanced to handle MCP content format with embedded JSON
 */
export function extractMCPResponseData(message: JSONRPCMessage): any {
  try {
    debugLog('extractMCPResponseData - processing message:', {
      hasError: 'error' in message,
      hasResult: 'result' in message,
      messageKeys: Object.keys(message)
    });

    // Check error field first (most common for payment required)
    if ('error' in message && message.error) {
      // Payment requirements can be in error.data or error itself
      if (message.error.data) {
        debugLog('Extracting response data from error.data');
        return message.error.data;
      }
      debugLog('Extracting response data from error');
      return message.error;
    }

    // Check result field - now with MCP content parsing
    if ('result' in message && message.result) {
      debugLog('Found result field, checking for MCP content format');

      // Check if this is MCP content format
      if (isMCPContentFormat(message.result)) {
        debugLog('Detected MCP content format, parsing embedded JSON');
        return extractFromMCPContent(message.result);
      }

      // Fallback to direct result (backward compatibility)
      debugLog('Using direct result format (backward compatibility)');
      return message.result;
    }

    debugLog('No extractable response data found in message');
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debugLog('Error extracting response data:', errorMessage);
    return null;
  }
}

/**
 * Check if response follows MCP content format
 */
export function isMCPContentFormat(result: any): boolean {
  try {
    const isValid = (
      result &&
      typeof result === 'object' &&
      Array.isArray(result.content) &&
      result.content.length > 0 &&
      result.content[0] &&
      typeof result.content[0] === 'object' &&
      result.content[0].type === 'text' &&
      typeof result.content[0].text === 'string'
    );

    debugLog('MCP content format validation:', {
      hasContent: Array.isArray(result?.content),
      contentLength: result?.content?.length,
      firstItemType: result?.content?.[0]?.type,
      hasText: typeof result?.content?.[0]?.text === 'string',
      isValid
    });

    return isValid;
  } catch (error) {
    debugLog('Error validating MCP content format:', error);
    return false;
  }
}

/**
 * Extract and parse JSON from MCP content format
 */
export function extractFromMCPContent(result: any): any {
  try {
    const textContent = result.content[0].text;
    debugLog('Parsing MCP text content:', {
      textLength: textContent.length,
      textPreview: textContent.substring(0, 100)
    });

    let parsedContent;
    try {
      // Try standard JSON parse first
      parsedContent = JSON.parse(textContent);
    } catch (firstParseError) {
      // Fallback: Handle Python-style dict strings (single quotes)
      // This is a workaround for Gradio MCP which uses str() instead of json.dumps()
      debugLog('Initial JSON parse failed, trying Python dict string conversion');
      try {
        // Convert Python dict format to JSON by replacing single quotes with double quotes
        // This is a simple heuristic that works for most cases
        const jsonified = textContent
          .replace(/'/g, '"')           // Replace single quotes with double quotes
          .replace(/True/g, 'true')     // Python True → JSON true
          .replace(/False/g, 'false')   // Python False → JSON false
          .replace(/None/g, 'null');    // Python None → JSON null
        
        parsedContent = JSON.parse(jsonified);
        debugLog('Successfully parsed Python dict string after conversion');
      } catch (secondParseError) {
        // If both attempts fail, re-throw the original error
        throw firstParseError;
      }
    }

    debugLog('Successfully parsed MCP content:', {
      parsedKeys: Object.keys(parsedContent),
      hasError: 'error' in parsedContent,
      errorType: parsedContent.error,
      hasErrorData: parsedContent.error?.data
    });

    // Smart extraction: return error.data if it contains payment protocol data,
    // otherwise return the full parsed content
    if (parsedContent.error?.data) {
      debugLog('Returning error.data from parsed MCP content (x402 format)');
      return parsedContent.error.data;
    }

    // For direct payment protocol data (AgentPay format), return full content
    debugLog('Returning full parsed MCP content for direct protocol detection');
    return parsedContent;

  } catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
    debugLog('Failed to parse MCP content as JSON:', errorMessage);

    // Return the raw text as fallback
    return result.content[0].text;
  }
}