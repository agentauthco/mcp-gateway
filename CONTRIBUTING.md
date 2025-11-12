# Contributing to AgentAuth MCP Gateway

Thank you for your interest in contributing to AgentAuth MCP Gateway! This project enables seamless, MCP-native authentication and payments for AI agents, and we welcome contributions that help make agentic auth and payments more accessible and secure.

## 🚀 Quick Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Get Started
```bash
# Clone the repository
git clone https://github.com/substrates-ai/mcp-gateway.git
cd mcp-gateway

# Install dependencies
npm install

# Build the project
npm run build

# Run all tests
npm run test:all
```

**You should see 110 tests passing!** If not, check our [troubleshooting section](#troubleshooting).

## 🏛️ Architecture Overview

AgentAuth MCP Gateway follows a clean, modular architecture designed for security and extensibility:

```
src/
├── lib/           # Shared utilities
│   ├── mcpUtils.ts    # MCP message parsing & extraction
│   └── utils.ts       # Common utilities & logging
├── protocols/     # Payment protocol implementations
│   ├── x402.ts        # x402 protocol (primary)
│   └── agentpay-v002.ts # AgentPay protocol support
├── proxy/         # Core MCP proxy logic
│   ├── paymentHandler.ts     # Payment flow coordination
│   └── protocolDetector.ts   # Multi-protocol detection
├── wallet/        # Blockchain wallet functionality
│   └── walletService.ts      # Wallet operations & chain config
└── proxy.ts       # CLI entry point & argument parsing
```

### Key Design Principles

- **Protocol Abstraction**: Clean separation between protocol detection and payment execution
- **Security First**: Private keys never leave the secure wallet service layer
- **Test-Driven**: Every component has comprehensive test coverage
- **User Control**: Interactive approval for all financial transactions
- **Multi-Chain**: Designed for Base mainnet/Sepolia with extensible chain support

## 🧪 Testing Strategy

We maintain high quality through comprehensive testing at multiple levels:

### Unit Tests (84 tests)
Co-located with source files for easy maintenance:
- `src/**/*.test.ts` - Test core business logic
- Focus on security-critical functions (key derivation, transaction validation)
- Mock external dependencies for fast, reliable tests

### Integration Tests (26 tests)
Located in `tests/integration/` directory:
- Test real protocol workflows end-to-end
- Validate protocol detection with real server response formats
- Ensure payment flow coordination works correctly

### Running Tests
```bash
# Run all tests
npm run test:all

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run with detailed output
DEBUG=agentauth:* npm test
```

## 🔒 Security Considerations

This codebase handles private keys and financial transactions. Please pay special attention to:

### Critical Security Areas

1. **Private Key Handling** (`src/wallet/walletService.ts`)
   - Never log private keys or mnemonic phrases
   - Validate all key formats before processing
   - Use secure random generation for new keys

2. **Transaction Validation**
   - Verify all transaction parameters before signing
   - Validate recipient addresses and amounts
   - Check sufficient balance before transaction submission

3. **Protocol Parsing** (`src/lib/mcpUtils.ts`)
   - Safely parse untrusted JSON from MCP servers
   - Validate protocol data structure before processing
   - Handle malformed inputs gracefully without crashes

4. **Error Handling**
   - Never expose sensitive information in error messages
   - Log security events appropriately
   - Fail securely when validation fails

### Security Review Process

- All PRs touching security-critical code require additional review
- New cryptographic functions must include comprehensive tests
- Payment flow changes require manual testing with real transactions

## 📏 Development Standards

### Code Quality
- **TypeScript**: Strict mode enabled - no `any` types
- **Error Handling**: Comprehensive try/catch blocks with typed errors
- **Testing**: New features require corresponding tests
- **Documentation**: Public functions need JSDoc comments

### Code Style
```typescript
// Good: Explicit error handling
try {
  const paymentDetails = protocol.extractPaymentDetails(data);
  if (!paymentDetails) {
    throw new Error('Failed to extract payment details');
  }
  return paymentDetails;
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  debugLog('Payment extraction failed:', errorMessage);
  throw new Error(`Payment extraction failed: ${errorMessage}`);
}

// Good: Security-first validation
private validatePrivateKey(key: string): string {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid private key: must be non-empty string');
  }

  // Remove aa- prefix if present
  const cleanKey = key.startsWith('aa-') ? key.slice(3) : key;
  const hexKey = cleanKey.startsWith('0x') ? cleanKey : `0x${cleanKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error('Invalid private key format');
  }

  return hexKey;
}
```

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for new payment protocol
fix: resolve null handling in payment authorization
docs: update CLI usage examples
test: add integration tests for protocol detection
refactor: extract common validation logic
```

## 🤝 Contribution Workflow

### 1. Fork & Clone
```bash
# Fork the repository on GitHub
git clone https://github.com/substrates-ai/mcp-gateway.git
cd mcp-gateway
```

### 2. Create Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### 3. Develop & Test
- Implement your changes
- Add/update tests for new functionality
- Ensure all tests pass: `npm run test:all`
- Test manually if touching payment flows

### 4. Submit Pull Request
- Push your branch: `git push origin feature/your-feature-name`
- Open PR with clear title and description
- Reference any related issues
- Wait for review and address feedback

### PR Requirements
- [ ] All tests passing (`npm run test:all`)
- [ ] New features include tests
- [ ] No TypeScript errors (`npm run build`)
- [ ] Security-sensitive changes reviewed
- [ ] Clear commit messages

## 🔧 Protocol Integration

Want to add support for a new payment protocol? Here's how:

### 1. Create Protocol Implementation
```typescript
// src/protocols/your-protocol.ts
export class YourProtocol implements PaymentProtocol {
  isPaymentRequired(data: any): boolean {
    // Detect if this data requires payment using your protocol
    return data.yourProtocolField !== undefined;
  }

  extractPaymentDetails(data: any): PaymentDetails | null {
    // Extract payment information from protocol data
    // Return standardized PaymentDetails format
  }

  // ... implement other required methods
}
```

### 2. Register in Protocol Detector
```typescript
// src/proxy/protocolDetector.ts
const protocols = new Map<string, PaymentProtocol>();
protocols.set('your-protocol', new YourProtocol());
```

### 3. Add Comprehensive Tests
```typescript
// src/protocols/your-protocol.test.ts
describe('YourProtocol', () => {
  it('should detect payment requirements', () => {
    // Test protocol detection logic
  });

  it('should extract payment details correctly', () => {
    // Test payment data extraction
  });
});
```

### 4. Update Documentation
- Add protocol to README.md supported protocols section
- Update CLI help text if needed
- Add troubleshooting section for common issues

## 🐛 Troubleshooting

### Tests Failing After Clone
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
npm test
```

### TypeScript Compilation Errors
```bash
# Check TypeScript version
npx tsc --version  # Should be 5.8+

# Clean build
rm -rf dist/
npm run build
```

### Integration Tests Timing Out
```bash
# Run with debug output
DEBUG=agentauth:* npm run test:integration

# Run specific test file
npx vitest run tests/integration/x402-direct.test.ts
```

### Permission Issues on macOS/Linux
```bash
# Fix executable permissions
chmod +x dist/proxy.js
```

## 🔧 CLI Options Reference

The CLI supports several advanced options for development and testing:

### Transport Strategy (`--transport` or `-t`)
Controls how the proxy connects to MCP servers:
```bash
# Available strategies:
# - http-first (default): Try HTTP, fall back to SSE
# - sse-first: Try SSE, fall back to HTTP
# - http-only: Only use HTTP transport
# - sse-only: Only use SSE transport

agentauth-mcp connect <server-url> --transport sse-first
```

### Allow HTTP Connections (`--allow-http`)
By default, only HTTPS connections are allowed for security. For local development:
```bash
# Allow non-HTTPS connections (not recommended for production)
agentauth-mcp connect http://localhost:3000/mcp --allow-http
```

### Debug Mode (`--debug` or `-d`)
Enable detailed logging for troubleshooting:
```bash
# Global debug flag
agentauth-mcp connect <server-url> --debug

# Or use environment variable for more control
DEBUG=agentauth:* agentauth-mcp connect <server-url>
```

### Custom Headers (`--header` or `-H`)
Add authentication or other headers to server requests:
```bash
# Single header
agentauth-mcp connect <server-url> --header "Authorization: Bearer token"

# Multiple headers
agentauth-mcp connect <server-url> \
  --header "Authorization: Bearer token" \
  --header "X-Custom-Header: value"

# Environment variable substitution
agentauth-mcp connect <server-url> --header "Authorization: Bearer ${API_TOKEN}"
```

## 💡 Development Tips

### Debugging Payment Flows
```bash
# Enable debug logging in MCP config
{
  "mcpServers": {
    "debug-server": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://mcp-news-dev-production.up.railway.app/mcp", "--debug"],
      "env": {
        "AGENTAUTH_TOKEN": "your-test-token"
      }
    }
  }
}

# Test with specific protocols
DEBUG=agentauth:payment,agentauth:protocol npm test
```

### Testing Against Real Servers
```bash
# Generate test identity
agentauth-mcp generate
# Save the AGENTAUTH_TOKEN from output

# Add to Claude Desktop config for testing:
{
  "mcpServers": {
    "test-server": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://mcp-news-dev-production.up.railway.app/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "your-test-token-from-generate"
      }
    }
  }
}
```

### Code Navigation
- **Payment Flow**: Start in `src/proxy/paymentHandler.ts`
- **Protocol Detection**: Check `src/proxy/protocolDetector.ts`
- **Wallet Operations**: Look in `src/wallet/walletService.ts`
- **MCP Integration**: See `src/proxy.ts` for CLI and `src/lib/mcpUtils.ts` for parsing

## 📋 Roadmap & Future Work

Areas where we'd especially welcome contributions:

- **New Payment Protocols**: Implement support for additional agentic payment standards (e.g. Google's AP2)
- **Enhanced Testing**: More integration scenarios, performance tests
- **Multi-Chain Support**: Additional blockchain networks beyond Base
- **User Experience**: Better error messages, improved CLI feedback
- **Documentation**: Tutorials, integration guides, troubleshooting
- **Performance**: Optimization of payment detection and processing

## 📞 Getting Help

- **GitHub Issues**: For bugs, feature requests, and questions
- **Discussions**: For general questions and community discussion
- **Security Issues**: Please report privately to [security contact]

## 🙏 Code of Conduct

This project follows a standard code of conduct:
- Be respectful and inclusive
- Focus on constructive feedback
- Help maintain a welcoming environment for all contributors

---

**Thank you for contributing to the future of agentic auth and payments!** 🚀