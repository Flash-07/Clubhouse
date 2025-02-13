# ClubhouseVault

## Overview

The **ClubhouseVault** project is a Solidity-based smart contract designed to securely manage ERC20 tokens for deposits, withdrawals via off-chain signatures, and multi-signature-based emergency actions. It is tailored for scalable and secure tournament fee collection and payouts.

---

## Features

- **Token Deposits**: Users can deposit ERC20 tokens into the vault.
- **Signature-Based Withdrawals**: Secure withdrawals enabled via off-chain signatures for users.
- **Multi-Signature Emergency Withdrawals**: Owners can perform emergency withdrawals with approval from multiple signers.
- **Tournament Fee Management**: Efficiently collects and handles tournament fees for secure payouts.
- **Secure Pause Functionality**: Admins can pause contract operations during emergencies.

---

## Installation

To use this project, ensure you have the following installed:

1. **Node.js** (v16+ recommended)
2. **npm** or **yarn**
3. **Hardhat** development environment

### Clone the Repository

```bash
git clone https://github.com/your-repository/clubhouse-vault.git
cd clubhouse-vault
```

### Install Dependencies

```bash
npm install
```

---

### Project Structure

```
├── contracts
│   ├── ClubhouseVault.sol         # Main Vault contract
│   ├── TaarakMehtaKaOoltahChashmash.sol  # ERC20 Token contract
├── test
│   ├── ClubhouseMain.test.ts      # Tests for the Main contract
│   ├── ClubhouseVault.test.ts     # Tests for the Vault contract
├── scripts (ignition)
│   ├── Deploy.ts                  # Deployment script of TMKOC and ClubhouseMain
│   ├── TMKOC.ts                   # Deployment script TMKOC
│   ├── ClubhouseMain.ts           # Deployment script ClubhouseMain
│   ├── ClubhouseVault.ts          # Deployment script of ClubhouseVault
│   ├── Interact.ts                # Interaction script to fund the account
├── .env                           # Environment variables
├── hardhat.config.ts              # Hardhat configuration file
└── README.md                      # Project documentation
```

---

### Configuration

```
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Usage
#### Compile Contracts

Run the following command to compile the smart contracts:
```bash
npx hardhat compile
```

#### Deploy Contracts

To deploy the contracts to a local or test network, update the hardhat.config.ts with your desired network configuration. Then, run:
```bash
npx hardhat ignition deploy ./ignition/modules/<deploy_script.ts> --network <network_name>
```

Example for deploying to a local Hardhat network:
```bash
npx hardhat ignition deploy ./ignition/modules/<deploy_script.ts> --network localhost
```

#### Run Tests

Execute the test suite to verify the functionality of the contracts:
```bash
npx hardhat test
```

#### Verify Contracts

To verify your contract on Etherscan (for testnets/mainnet), use:
```bash
npx hardhat verify --network <network_name> <deployed_contract_address>
```

### Testing

The project includes a robust test suite written in TypeScript using Hardhat and Chai. Key functionalities tested include:

- **Deposits:** Verifies successful deposits into the vault.
- **Signature-Based Withdrawals:** Ensures proper off-chain signature validation and withdrawal.
- **Emergency Withdrawals:** Tests multi-signature-based emergency withdrawals.
- **Tournament Fee Management:** Validates fee collection and withdrawals.

Run tests using:
```bash
npx hardhat test
```

---

### Contract Details
#### ClubhouseVault.sol

The main smart contract that manages the core functionality of the system.

#### Key Functions
- **deposit**(address caller, uint256 amount): Allows users to deposit ERC20 tokens into the vault.

- **withdrawWithSignature**(address caller, uint256 amount, uint256 nonce, string message, uint256 expiry, bytes signature): Enables secure token withdrawals using off-chain signatures.

- **emergencyWithdraw**(address to, uint256 amount, bytes[] signatures):** Allows owners to withdraw tokens during emergencies using multi-signature approval.

- **withdrawTournamentFee**(address to, uint256 amount, bytes[] signatures): Enables the withdrawal of tournament fees with multi-signature approval.

- **setTrustedSigner**(address _trustedSigner): Updates the trusted signer for off-chain signature validation.

- **setMultiSigOwners**(address[] owners, uint256 _minApprovals): Configures the multi-signature owners and minimum required approvals.