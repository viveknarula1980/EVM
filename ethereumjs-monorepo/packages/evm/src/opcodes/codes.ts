import { Hardfork } from '@ethereumjs/common'

import { handlers } from './functions.js'
import { dynamicGasHandlers } from './gas.js'
import { getFullname } from './util.js'

import type { CustomOpcode } from '../types.js'
import type { OpHandler } from './functions.js'
import type { AsyncDynamicGasHandler, SyncDynamicGasHandler } from './gas.js'
import type { Common } from '@ethereumjs/common'

export class Opcode {
  readonly code: number
  readonly name: string
  readonly fullName: string
  readonly fee: number
  readonly feeBigInt: bigint
  readonly isAsync: boolean
  readonly dynamicGas: boolean
  readonly isInvalid: boolean

  constructor({
    code,
    name,
    fullName,
    fee,
    isAsync,
    dynamicGas,
  }: {
    code: number
    name: string
    fullName: string
    fee: number
    isAsync: boolean
    dynamicGas: boolean
  }) {
    this.code = code
    this.name = name
    this.fullName = fullName
    this.fee = fee
    this.feeBigInt = BigInt(fee)
    this.isAsync = isAsync
    this.dynamicGas = dynamicGas
    this.isInvalid = this.name === 'INVALID'

    // Opcode isn't subject to change, thus all further modifications are prevented.
    Object.freeze(this)
  }
}

export type OpcodeList = Map<number, Opcode>
type OpcodeEntry = { [key: number]: { name: string; isAsync: boolean; dynamicGas: boolean } }
type OpcodeEntryFee = OpcodeEntry & { [key: number]: { fee: number } }

// Base opcode list. The opcode list is extended in future hardforks
const opcodes: OpcodeEntry = {
  // 0x0 range - arithmetic ops
  // name, async
  0x00: { name: 'STOP', isAsync: false, dynamicGas: false },
  0x01: { name: 'ADD', isAsync: false, dynamicGas: false },
  0x02: { name: 'MUL', isAsync: false, dynamicGas: false },
  0x03: { name: 'SUB', isAsync: false, dynamicGas: false },
  0x04: { name: 'DIV', isAsync: false, dynamicGas: false },
  0x05: { name: 'SDIV', isAsync: false, dynamicGas: false },
  0x06: { name: 'MOD', isAsync: false, dynamicGas: false },
  0x07: { name: 'SMOD', isAsync: false, dynamicGas: false },
  0x08: { name: 'ADDMOD', isAsync: false, dynamicGas: false },
  0x09: { name: 'MULMOD', isAsync: false, dynamicGas: false },
  0x0a: { name: 'EXP', isAsync: false, dynamicGas: true },
  0x0b: { name: 'SIGNEXTEND', isAsync: false, dynamicGas: false },

  // 0x10 range - bit ops
  0x10: { name: 'LT', isAsync: false, dynamicGas: false },
  0x11: { name: 'GT', isAsync: false, dynamicGas: false },
  0x12: { name: 'SLT', isAsync: false, dynamicGas: false },
  0x13: { name: 'SGT', isAsync: false, dynamicGas: false },
  0x14: { name: 'EQ', isAsync: false, dynamicGas: false },
  0x15: { name: 'ISZERO', isAsync: false, dynamicGas: false },
  0x16: { name: 'AND', isAsync: false, dynamicGas: false },
  0x17: { name: 'OR', isAsync: false, dynamicGas: false },
  0x18: { name: 'XOR', isAsync: false, dynamicGas: false },
  0x19: { name: 'NOT', isAsync: false, dynamicGas: false },
  0x1a: { name: 'BYTE', isAsync: false, dynamicGas: false },

  // 0x20 range - crypto
  0x20: { name: 'KECCAK256', isAsync: false, dynamicGas: true },

  // 0x30 range - closure state
  0x30: { name: 'ADDRESS', isAsync: true, dynamicGas: false },
  0x31: { name: 'BALANCE', isAsync: true, dynamicGas: true },
  0x32: { name: 'ORIGIN', isAsync: true, dynamicGas: false },
  0x33: { name: 'CALLER', isAsync: true, dynamicGas: false },
  0x34: { name: 'CALLVALUE', isAsync: true, dynamicGas: false },
  0x35: { name: 'CALLDATALOAD', isAsync: true, dynamicGas: false },
  0x36: { name: 'CALLDATASIZE', isAsync: true, dynamicGas: false },
  0x37: { name: 'CALLDATACOPY', isAsync: true, dynamicGas: true },
  0x38: { name: 'CODESIZE', isAsync: false, dynamicGas: false },
  0x39: { name: 'CODECOPY', isAsync: false, dynamicGas: true },
  0x3a: { name: 'GASPRICE', isAsync: false, dynamicGas: false },
  0x3b: { name: 'EXTCODESIZE', isAsync: true, dynamicGas: true },
  0x3c: { name: 'EXTCODECOPY', isAsync: true, dynamicGas: true },

  // '0x40' range - block operations
  0x40: { name: 'BLOCKHASH', isAsync: true, dynamicGas: false },
  0x41: { name: 'COINBASE', isAsync: true, dynamicGas: false },
  0x42: { name: 'TIMESTAMP', isAsync: true, dynamicGas: false },
  0x43: { name: 'NUMBER', isAsync: true, dynamicGas: false },
  0x44: { name: 'DIFFICULTY', isAsync: true, dynamicGas: false },
  0x45: { name: 'GASLIMIT', isAsync: true, dynamicGas: false },

  // 0x50 range - 'storage' and execution
  0x50: { name: 'POP', isAsync: false, dynamicGas: false },
  0x51: { name: 'MLOAD', isAsync: false, dynamicGas: true },
  0x52: { name: 'MSTORE', isAsync: false, dynamicGas: true },
  0x53: { name: 'MSTORE8', isAsync: false, dynamicGas: true },
  0x54: { name: 'SLOAD', isAsync: true, dynamicGas: true },
  0x55: { name: 'SSTORE', isAsync: true, dynamicGas: true },
  0x56: { name: 'JUMP', isAsync: false, dynamicGas: false },
  0x57: { name: 'JUMPI', isAsync: false, dynamicGas: false },
  0x58: { name: 'PC', isAsync: false, dynamicGas: false },
  0x59: { name: 'MSIZE', isAsync: false, dynamicGas: false },
  0x5a: { name: 'GAS', isAsync: false, dynamicGas: false },
  0x5b: { name: 'JUMPDEST', isAsync: false, dynamicGas: false },

  // 0x60, range
  0x60: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x61: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x62: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x63: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x64: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x65: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x66: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x67: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x68: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x69: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x6a: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x6b: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x6c: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x6d: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x6e: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x6f: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x70: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x71: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x72: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x73: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x74: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x75: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x76: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x77: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x78: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x79: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x7a: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x7b: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x7c: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x7d: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x7e: { name: 'PUSH', isAsync: false, dynamicGas: false },
  0x7f: { name: 'PUSH', isAsync: false, dynamicGas: false },

  0x80: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x81: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x82: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x83: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x84: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x85: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x86: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x87: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x88: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x89: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x8a: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x8b: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x8c: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x8d: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x8e: { name: 'DUP', isAsync: false, dynamicGas: false },
  0x8f: { name: 'DUP', isAsync: false, dynamicGas: false },

  0x90: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x91: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x92: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x93: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x94: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x95: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x96: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x97: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x98: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x99: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x9a: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x9b: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x9c: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x9d: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x9e: { name: 'SWAP', isAsync: false, dynamicGas: false },
  0x9f: { name: 'SWAP', isAsync: false, dynamicGas: false },

  0xa0: { name: 'LOG', isAsync: false, dynamicGas: true },
  0xa1: { name: 'LOG', isAsync: false, dynamicGas: true },
  0xa2: { name: 'LOG', isAsync: false, dynamicGas: true },
  0xa3: { name: 'LOG', isAsync: false, dynamicGas: true },
  0xa4: { name: 'LOG', isAsync: false, dynamicGas: true },

  // '0xf0' range - closures
  0xf0: { name: 'CREATE', isAsync: true, dynamicGas: true },
  0xf1: { name: 'CALL', isAsync: true, dynamicGas: true },
  0xf2: { name: 'CALLCODE', isAsync: true, dynamicGas: true },
  0xf3: { name: 'RETURN', isAsync: false, dynamicGas: true },

  // '0x70', range - other
  0xfe: { name: 'INVALID', isAsync: false, dynamicGas: false },
  0xff: { name: 'SELFDESTRUCT', isAsync: true, dynamicGas: true },
}

// Array of hard forks in order. These changes are repeatedly applied to `opcodes` until the hard fork is in the future based upon the common
// TODO: All gas price changes should be moved to common
// If the base gas cost of any of the operations change, then these should also be added to this list.
// If there are context variables changed (such as "warm slot reads") which are not the base gas fees,
// Then this does not have to be added.
const hardforkOpcodes: { hardfork: Hardfork; opcodes: OpcodeEntry }[] = [
  {
    hardfork: Hardfork.Homestead,
    opcodes: {
      0xf4: { name: 'DELEGATECALL', isAsync: true, dynamicGas: true }, // EIP-7
    },
  },
  {
    hardfork: Hardfork.TangerineWhistle,
    opcodes: {
      0x54: { name: 'SLOAD', isAsync: true, dynamicGas: true },
      0xf1: { name: 'CALL', isAsync: true, dynamicGas: true },
      0xf2: { name: 'CALLCODE', isAsync: true, dynamicGas: true },
      0x3b: { name: 'EXTCODESIZE', isAsync: true, dynamicGas: true },
      0x3c: { name: 'EXTCODECOPY', isAsync: true, dynamicGas: true },
      0xf4: { name: 'DELEGATECALL', isAsync: true, dynamicGas: true }, // EIP-7
      0xff: { name: 'SELFDESTRUCT', isAsync: true, dynamicGas: true },
      0x31: { name: 'BALANCE', isAsync: true, dynamicGas: true },
    },
  },
  {
    hardfork: Hardfork.Byzantium,
    opcodes: {
      0xfd: { name: 'REVERT', isAsync: false, dynamicGas: true }, // EIP-140
      0xfa: { name: 'STATICCALL', isAsync: true, dynamicGas: true }, // EIP-214
      0x3d: { name: 'RETURNDATASIZE', isAsync: true, dynamicGas: false }, // EIP-211
      0x3e: { name: 'RETURNDATACOPY', isAsync: true, dynamicGas: true }, // EIP-211
    },
  },
  {
    hardfork: Hardfork.Constantinople,
    opcodes: {
      0x1b: { name: 'SHL', isAsync: false, dynamicGas: false }, // EIP-145
      0x1c: { name: 'SHR', isAsync: false, dynamicGas: false }, // EIP-145
      0x1d: { name: 'SAR', isAsync: false, dynamicGas: false }, // EIP-145
      0x3f: { name: 'EXTCODEHASH', isAsync: true, dynamicGas: true }, // EIP-1052
      0xf5: { name: 'CREATE2', isAsync: true, dynamicGas: true }, // EIP-1014
    },
  },
  {
    hardfork: Hardfork.Istanbul,
    opcodes: {
      0x46: { name: 'CHAINID', isAsync: false, dynamicGas: false }, // EIP-1344
      0x47: { name: 'SELFBALANCE', isAsync: false, dynamicGas: false }, // EIP-1884
    },
  },
  {
    hardfork: Hardfork.Paris,
    opcodes: {
      0x44: { name: 'PREVRANDAO', isAsync: true, dynamicGas: false }, // EIP-4399
    },
  },
]

const eipOpcodes: { eip: number; opcodes: OpcodeEntry }[] = [
  {
    eip: 663,
    opcodes: {
      0xe6: { name: 'DUPN', isAsync: false, dynamicGas: false },
      0xe7: { name: 'SWAPN', isAsync: false, dynamicGas: false },
      0xe8: { name: 'EXCHANGE', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 1153,
    opcodes: {
      0x5c: { name: 'TLOAD', isAsync: false, dynamicGas: false },
      0x5d: { name: 'TSTORE', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 3198,
    opcodes: {
      0x48: { name: 'BASEFEE', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 3855,
    opcodes: {
      0x5f: { name: 'PUSH0', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 3074,
    opcodes: {
      0xf6: { name: 'AUTH', isAsync: true, dynamicGas: true },
      0xf7: { name: 'AUTHCALL', isAsync: true, dynamicGas: true },
    },
  },
  {
    eip: 4200,
    opcodes: {
      0xe0: { name: 'RJUMP', isAsync: false, dynamicGas: false },
      0xe1: { name: 'RJUMPI', isAsync: false, dynamicGas: false },
      0xe2: { name: 'RJUMPV', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 4750,
    opcodes: {
      0xe3: { name: 'CALLF', isAsync: false, dynamicGas: false },
      0xe4: { name: 'RETF', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 4844,
    opcodes: {
      0x49: { name: 'BLOBHASH', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 5656,
    opcodes: {
      0x5e: { name: 'MCOPY', isAsync: false, dynamicGas: true },
    },
  },
  {
    eip: 6206,
    opcodes: {
      0xe5: { name: 'JUMPF', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 7069,
    opcodes: {
      0xf7: { name: 'RETURNDATALOAD', isAsync: false, dynamicGas: false },
      0xf8: { name: 'EXTCALL', isAsync: true, dynamicGas: true },
      0xf9: { name: 'EXTDELEGATECALL', isAsync: true, dynamicGas: true },
      0xfb: { name: 'EXTSTATICCALL', isAsync: true, dynamicGas: true },
    },
  },
  {
    eip: 7480,
    opcodes: {
      0xd0: { name: 'DATALOAD', isAsync: false, dynamicGas: false },
      0xd1: { name: 'DATALOADN', isAsync: false, dynamicGas: false },
      0xd2: { name: 'DATASIZE', isAsync: false, dynamicGas: false },
      0xd3: { name: 'DATACOPY', isAsync: false, dynamicGas: true },
    },
  },
  {
    eip: 7516,
    opcodes: {
      0x4a: { name: 'BLOBBASEFEE', isAsync: false, dynamicGas: false },
    },
  },
  {
    eip: 7620,
    opcodes: {
      0xec: { name: 'EOFCREATE', isAsync: true, dynamicGas: true },
      0xee: { name: 'RETURNCONTRACT', isAsync: true, dynamicGas: true },
    },
  },
]

/**
 * Convert basic opcode info dictionary into complete OpcodeList instance.
 *
 * @param opcodes {Object} Receive basic opcodes info dictionary.
 * @returns {OpcodeList} Complete Opcode list
 */
function createOpcodes(opcodes: OpcodeEntryFee): OpcodeList {
  const result: OpcodeList = new Map()
  for (const [key, value] of Object.entries(opcodes)) {
    const code = parseInt(key, 10)
    if (isNaN(value.fee)) value.fee = 0
    result.set(
      code,
      new Opcode({
        code,
        fullName: getFullname(code, value.name),
        ...value,
      }),
    )
  }
  return result
}

type OpcodeContext = {
  dynamicGasHandlers: Map<number, AsyncDynamicGasHandler | SyncDynamicGasHandler>
  handlers: Map<number, OpHandler>
  opcodes: OpcodeList
  opcodeMap: OpcodeMap
}

export type OpcodeMapEntry = {
  opcodeInfo: Opcode
  opHandler: OpHandler
  gasHandler: AsyncDynamicGasHandler | SyncDynamicGasHandler
}
export type OpcodeMap = OpcodeMapEntry[]

/**
 * Get suitable opcodes for the required hardfork.
 *
 * @param common {Common} Ethereumjs Common metadata object.
 * @param customOpcodes List with custom opcodes (see EVM `customOpcodes` option description).
 * @returns {OpcodeList} Opcodes dictionary object.
 */
export function getOpcodesForHF(common: Common, customOpcodes?: CustomOpcode[]): OpcodeContext {
  let opcodeBuilder: any = { ...opcodes }

  const handlersCopy = new Map(handlers)
  const dynamicGasHandlersCopy = new Map(dynamicGasHandlers)

  for (let fork = 0; fork < hardforkOpcodes.length; fork++) {
    if (common.gteHardfork(hardforkOpcodes[fork].hardfork)) {
      opcodeBuilder = { ...opcodeBuilder, ...hardforkOpcodes[fork].opcodes }
    }
  }
  for (const eipOps of eipOpcodes) {
    if (common.isActivatedEIP(eipOps.eip)) {
      opcodeBuilder = { ...opcodeBuilder, ...eipOps.opcodes }
    }
  }

  for (const key in opcodeBuilder) {
    const baseFee = Number(common.param(`${opcodeBuilder[key].name.toLowerCase()}Gas`))
    // explicitly verify that we have defined a base fee
    if (baseFee === undefined) {
      throw new Error(`base fee not defined for: ${opcodeBuilder[key].name}`)
    }
    opcodeBuilder[key].fee = baseFee
  }

  if (customOpcodes) {
    for (const _code of customOpcodes) {
      const code = <any>_code
      if (code.logicFunction === undefined) {
        delete opcodeBuilder[code.opcode]
        continue
      }

      // Sanity checks
      if (code.opcodeName === undefined || code.baseFee === undefined) {
        throw new Error(
          `Custom opcode ${code.opcode} does not have the required values: opcodeName and baseFee are required`,
        )
      }
      const entry = {
        [code.opcode]: {
          name: code.opcodeName,
          isAsync: true,
          dynamicGas: code.gasFunction !== undefined,
          fee: code.baseFee,
          feeBigInt: BigInt(code.baseFee),
        },
      }
      opcodeBuilder = { ...opcodeBuilder, ...entry }
      if (code.gasFunction !== undefined) {
        dynamicGasHandlersCopy.set(code.opcode, code.gasFunction)
      }
      // logicFunction is never undefined
      handlersCopy.set(code.opcode, code.logicFunction)
    }
  }

  //const dynamicGasHandlers = dynamicGasHandlersCopy
  //const handlers = handlersCopy
  const ops = createOpcodes(opcodeBuilder)

  const opcodeMap: OpcodeMap = []

  for (const [opNumber, op] of ops) {
    const dynamicGas = dynamicGasHandlersCopy.get(opNumber)!
    const handler = handlersCopy.get(opNumber)!
    opcodeMap[opNumber] = {
      opcodeInfo: op,
      opHandler: handler,
      gasHandler: dynamicGas,
    }
  }

  const INVALID = opcodeMap[0xfe]

  for (let i = 0x0; i <= 0xff; i++) {
    if (opcodeMap[i] === undefined) {
      opcodeMap[i] = INVALID
    }
  }

  return {
    dynamicGasHandlers: dynamicGasHandlersCopy,
    handlers: handlersCopy,
    opcodes: ops,
    opcodeMap,
  }
}
