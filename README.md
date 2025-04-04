# EVM Codes

 an interactive and educational reference tool designed to help developers understand and explore the Ethereum Virtual Machine (EVM) at the opcode level.

---

## 🔍 Overview

EVM Codes provides:

- 🧠 A complete list of all EVM opcodes with:
  - Descriptions
  - Stack inputs/outputs
  - Gas costs
  - Example usage
- 📦 A contract viewer to analyze bytecode and see what opcodes are used
- 🧪 A step-by-step execution playground for experimenting with raw EVM code
- 🎓 A tool for learning the internals of the Ethereum Virtual Machine

This project is especially useful for:

- Smart contract developers
- Security auditors
- Blockchain researchers
- EVM tinkerers and enthusiasts

---

## 🚫 What It Is Not

This project is **not a wallet**. It does **not**:

- Interact with real blockchain networks
- Require or use your private key
- Connect to MetaMask or any Web3 provider

EVM Codes is **strictly for viewing and simulating** EVM bytecode locally in your browser.

---


## 🛠 Tech Stack

- Vue.js
- TypeScript
- Vite
- Custom EVM interpreter and visualization logic

---

## 📦 Getting Started (Local Setup)

```bash
cd evm.codes
pnpm install
pnpm run dev
