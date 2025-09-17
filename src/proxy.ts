#!/usr/bin/env node

/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

/**
 * AgentAuth MCP Gateway - Universal Auth & Payment-Enabled MCP Proxy
 *
 * A command-line tool to manage AgentAuth credentials, create authenticated
 * connections to MCP servers, and handle blockchain payments seamlessly.
 *
 * Commands:
 *   - generate: Create a new private key token.
 *   - derive <private_key>: Derive address and ID from any private key format.
 *   - connect <server_url>: Start an auth & payment-enabled proxy using AGENTAUTH_TOKEN.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  generateIdentity,
  deriveAddress,
  generateId
} from '@agentauth/core';
import { connectToRemoteServer, log, mcpProxy, setDebug, validateServerUrlSecurity } from './lib/utils.js';
import { WalletService } from './wallet/walletService.js';

/**
 * Parse custom headers from CLI arguments with environment variable substitution
 */
function parseCustomHeaders(headerArgs: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  
  for (const header of headerArgs) {
    const colonIndex = header.indexOf(':');
    if (colonIndex === -1) {
      console.error(`Error: Invalid header format '${header}'. Use format "Key:Value".`);
      process.exit(1);
    }
    
    const key = header.slice(0, colonIndex).trim();
    const value = header.slice(colonIndex + 1).trim();
    
    if (!key) {
      console.error(`Error: Empty header key in '${header}'.`);
      process.exit(1);
    }
    
    // Environment variable substitution
    const expandedValue = value.replace(/\$\{([^}]+)\}/g, (match, envVarName) => {
      return process.env[envVarName] || '';
    });
    
    headers[key] = expandedValue;
  }
  
  return headers;
}

async function run() {
  await yargs(hideBin(process.argv))
    .command(
      'generate',
      'Generate a new AgentAuth identity',
      () => {},
      () => {
        const { agentauth_token, agentauth_id, agentauth_address } = generateIdentity();
        console.log(`AGENTAUTH_ID = ${agentauth_id}`);
        console.log(`AGENTAUTH_ADDRESS = ${agentauth_address}`);
        console.log(`AGENTAUTH_TOKEN = ${agentauth_token}`);
        console.log(`🔐 Keep your AGENTAUTH_TOKEN secure and do not share it with anyone.`);
      }
    )
    .command(
      'derive <private_key>',
      'Derive address and ID from a private key',
      (y) => {
        return y.positional('private_key', {
          describe: 'Private key in any format (aa-, 0x, or raw hex)',
          type: 'string',
        });
      },
      (argv) => {
        const { private_key } = argv;
        if (!private_key) {
          console.error('Error: Missing <private_key> argument.');
          process.exit(1);
        }

        try {
          const agentauth_address = deriveAddress(private_key);
          const agentauth_id = generateId(agentauth_address);

          console.log(`AGENTAUTH_ID = ${agentauth_id}`);
          console.log(`AGENTAUTH_ADDRESS = ${agentauth_address}`);
        } catch (error) {
          console.error('Error: Invalid private key format.');
          process.exit(1);
        }
      }
    )
    .command(
      'connect <server_url>',
      'Connect to an MCP server with auth & payment capabilities using AGENTAUTH_TOKEN',
      (y) => {
        return y.positional('server_url', {
          describe: 'The URL of the remote MCP server',
          type: 'string',
        }).option('transport', {
          alias: 't',
          describe: 'The transport strategy to use.',
          choices: ['sse-only', 'http-only', 'sse-first', 'http-first'],
          default: 'http-first',
        }).option('allow-http', {
          type: 'boolean',
          description: 'Allow HTTP connections (not recommended for production)',
          default: false,
        }).option('header', {
          alias: 'H',
          type: 'array',
          description: 'Custom headers (format: "Key:Value", supports ${ENV_VAR} substitution)',
          default: [],
        });
      },
      async (argv) => {
        const { server_url } = argv;
        if (!server_url) {
          console.error('Error: Missing <server_url> argument.');
          process.exit(1);
        }

        if (argv.debug) {
          setDebug(true);
        }

        // Validate server URL security (HTTPS enforcement)
        validateServerUrlSecurity(server_url, argv['allow-http'] as boolean);

        const transportStrategy = argv.transport as 'sse-only' | 'http-only' | 'sse-first' | 'http-first';

        // Parse custom headers with environment variable substitution
        const customHeaders = parseCustomHeaders(argv.header as string[]);

        log(`Connecting to ${server_url} with strategy ${transportStrategy}...`);

        const token = process.env.AGENTAUTH_TOKEN;

        if (token) {
          log('AGENTAUTH_TOKEN found, connecting with authentication.');
          // Validate token format early
          try {
            deriveAddress(token); // This will throw if invalid
          } catch (error) {
            console.error('Error: Invalid AGENTAUTH_TOKEN format.');
            process.exit(1);
          }
        } else {
          log('No AGENTAUTH_TOKEN found, proceeding with an unauthenticated connection.');
        }

        try {
          const remoteTransport = await connectToRemoteServer(server_url, transportStrategy, new Set(), token, customHeaders);
          const localTransport = new StdioServerTransport();

          // Initialize wallet service if we have a token
          let walletService: WalletService | undefined;
          if (token) {
            try {
              walletService = new WalletService(token);
              const address = walletService.getAddress();
              log(`Wallet initialized. Address: ${address}`);
              
              // Display balance information
              try {
                const ethBalance = await walletService.getEthBalance();
                const usdcBalance = await walletService.getUsdcBalance();
                log(`ETH Balance: ${ethBalance} ETH`);
                log(`USDC Balance: ${usdcBalance} USDC`);
              } catch (balanceError) {
                log(`Warning: Could not fetch balances: ${balanceError instanceof Error ? balanceError.message : 'Unknown error'}`);
              }
            } catch (walletError) {
              log(`Warning: Could not initialize wallet: ${walletError instanceof Error ? walletError.message : 'Unknown error'}`);
              log('Continuing without wallet functionality...');
            }
          }

          mcpProxy({
            transportToClient: localTransport,
            transportToServer: remoteTransport,
            walletService
          });

          await localTransport.start();
          if (walletService) {
            log('Wallet-enabled proxy established. Payment handling active. Waiting for local client connection...');
          } else {
            log('Proxy established. Waiting for local client connection...');
          }
        } catch (error) {
          console.error('Failed to connect to the remote server:');
          console.error(error);
          process.exit(1);
        }
      }
    )
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Run in debug mode',
      default: false,
    })
    .demandCommand(1, 'You need at least one command before moving on')
    .strict()
    .help().argv;
}

run().catch((error) => {
  console.error('An unexpected error occurred:');
  console.error(error);
  process.exit(1);
});
