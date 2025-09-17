# AgentAuth MCP Gateway (@agentauth/mcp) - Universal MCP gateway for AI agents, with MCP-native auth and agentic payments

[![npm version](https://img.shields.io/npm/v/@agentauth/mcp.svg)](https://www.npmjs.com/package/@agentauth/mcp)
[![npm downloads](https://img.shields.io/npm/dm/%40agentauth%2Fmcp)](https://www.npmjs.com/package/@agentauth/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/agentauthco/mcp-gateway?style=social)](https://github.com/agentauthco/mcp-gateway)

**AgentAuth MCP Gateway is an auth- and payment-enabled MCP gateway with native x402 protocol support and interactive user approval.**

Connect AI agents in Claude, Cursor, Windsurf, etc. to any MCP server (with or without authentication), and empower them to make payments for premium tools and resources, while you remain in control with interactive payment approval - no friction, and no surprises.

## 🚀 Key Features

- **🔐 Universal Authentication**: Works with free, auth-required, and payment-enabled MCP servers
- **🔥 Agentic Payments**: Frictionless access to paid tools and resources with agentic payments
- **🛡️ Payment Approvals**: Approve all payments made by the agent - you're in control
- **⚡ Native x402 Support**: Works with any x402-enabled payments out of the box
- **👤 No Accounts Required**: Uses AgentAuth for seamless agent-native identification and authentication
- **🌐 Multi-Chain Ready**: Supports USDC on Base mainnet and Base Sepolia testnet
- **🔮 Multi-Protocol**: Built for x402 with support for emerging protocols like AgentPay and Google AP2 (coming soon)

## ⚡ Quick Start

### 1. Install

```bash
npm install -g @agentauth/mcp
```

### 2. Generate Your Identity

```bash
agentauth-mcp generate
```

This creates a unique AgentAuth identity for your agent, including a private key, wallet address, and ID. Save the output - you'll need it later!

Note: You can also use an existing EVM private key instead of generating a new one, if you'd prefer.

### 3. Configure Your MCP Client

**For Claude Desktop**, add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "premium-news": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://mcp-server.example.com/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "your-token-or-private-key"
      }
    }
  }
}
```

**For Cursor/Windsurf**, add to your MCP configuration similarly.

Note: The AGENTAUTH_TOKEN field is only required if you want to use agentauth-mcp with an MCP server which requires payments or AgentAuth authentication.

### 4. Start Using Premium MCP Servers

Open Claude and request premium content from an MCP server. When payment is required, your agent will show you something like this:

```
💳 Payment Required
📄 Service: Premium News Article
💰 Amount: $0.01 USDC
🏦 Your Balance: $5.23 USDC

Approve this payment?
```

Then tell the agent what you'd like to do. It's that simple!

## 🎯 Try It Now - Live Demo Server

Want to see it in action? We have a live demo news server ready for testing!

### Quick Test Setup

1. **Install and generate your agent identity** (if you haven't already):
```bash
npm install -g @agentauth/mcp
agentauth-mcp generate
# Remember to save your AGENTAUTH_TOKEN!
```

Note: You can also use an existing EVM private key instead of generating a new one, if you'd prefer.

2. **Add to Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "news-demo": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://mcp-news-dev-production.up.railway.app/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "your-token-or-private-key"
      }
    }
  }
}
```

3. **Fund your agent's wallet address** with a small amount of USDC and ETH on **Base mainnet**

4. **Start using it** in Claude:
   - "Get me the latest tech news" (free)
   - "Get me (such and such) article" (some articles require payment - you'll see the payment request and approval prompt!)

### Demo Server Details
- **URL**: `https://mcp-news-dev-production.up.railway.app/mcp`
- **Network**: Base mainnet
- **Free tools**: Basic news search, articles from certain sources
- **Paid tools**: Premium articles from paid sources

## 💡 Common Use Cases

### Premium News & Research
Access paid content from news services, research databases, and premium APIs through Claude.

### AI Model Access
Pay per request for specialized AI models and computational resources.

### Data & Analytics
Access premium datasets, market data, and analytics services on-demand.

### Developer Tools
Use paid developer APIs and services through your MCP-enabled editor.

## 🔧 CLI Reference

### Generate New Identity
```bash
agentauth-mcp generate
```
Creates a new AgentAuth token, wallet address, and agent ID.

### Derive Address from Key
```bash
agentauth-mcp derive <private-key>
```
Get your wallet address and agent ID from an existing private key.

### Connect to Server
```bash
agentauth-mcp connect <server-url>
```
Connect to any MCP server, just like you normally would.

### Connection Options
```bash
agentauth-mcp connect <server-url> --header "Authorization: Bearer token"
```
Add custom headers, e.g. for authentication.

## ⚙️ Configuration

### Environment Variables

- `AGENTAUTH_TOKEN`: Your private key (aa-prefixed, 0x-prefixed, or raw)

### Wallet Setup

The built-in wallet automatically detects which network (Base mainnet/testnet) each server uses.

Your wallet address needs USDC and ETH for payments on that network:
- **USDC**: For actual payments to services
- **ETH**: For transaction fees (gas)

## 🔍 Troubleshooting

### "Payment Required" but No Prompt Appears
- Check that your AGENTAUTH_TOKEN is set correctly
- Verify the server supports x402 protocol
- Try with `agentauth-mcp connect <server-url> --debug` for detailed logs

### "Insufficient Funds" Error
- Check your USDC balance: you need enough for the payment amount
- Check your ETH balance: you need ~$0.01 ETH for transaction fees
- Ensure that your funds are on the right network!
- Use `agentauth-mcp derive <your-key>` to see your wallet address

### Connection Issues
- Verify the server URL is correct and accessible
- Check if the server requires custom headers
- Ensure your MCP client configuration is correct

### Payment Stuck/Failed
- Payments are atomic - they either complete fully or fail safely
- Check the blockchain explorer for your transaction status
- Contact the service provider if payments succeed but content isn't delivered

## 🌟 Supported Protocols

### x402 Protocol (Primary)
Industry standard for agentic payments. Works with any x402-protected MCP server automatically.

### AgentAuth Integration
Seamless agent-native identification without accounts or login flows.

### AgentPay (Early Support)
Emerging protocol for agent-to-agent payments. Limited adoption currently.

## 🔮 Coming Soon

- **Payment Policies**: Set spending limits and auto-approve small payments
- **Multi-Asset Support**: Pay with different tokens on different chains
- **Agentic Wallet Functionality**: Manage your wallet with the agent, like any other MCP server
- **Additional Payment Protocols**: Support for emerging protocols including Google's AP2

## 📚 Learn More

- [x402 Protocol Specification](https://www.x402.org)
- [AgentAuth Documentation](https://agentauth.co)
- [Model Context Protocol](https://modelcontextprotocol.io)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**AgentAuth -- collaboration infrastructure for AI agents.**
