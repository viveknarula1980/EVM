import { Chain, Common, Hardfork } from '@ethereumjs/common'
import { RLP } from '@ethereumjs/rlp'
import { createLegacyTx } from '@ethereumjs/tx'
import {
  KECCAK256_RLP_ARRAY,
  bytesToHex,
  equalsBytes,
  hexToBytes,
  toBytes,
  zeros,
} from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import {
  createBlock,
  createBlockFromRLPSerializedBlock,
  createBlockFromValuesArray,
} from '../src/constructors.js'
import { createBlockFromRpc } from '../src/from-rpc.js'
import { genTransactionsTrieRoot } from '../src/helpers.js'
import { type Block, type BlockBytes, type JsonRpcBlock, paramsBlock } from '../src/index.js'

import * as testDataGenesis from './testdata/genesishashestest.json'
import * as testDataFromRpcGoerli from './testdata/testdata-from-rpc-goerli.json'
import * as testDataPreLondon2 from './testdata/testdata_pre-london-2.json'
import * as testDataPreLondon from './testdata/testdata_pre-london.json'
import * as testnetMerge from './testdata/testnetMerge.json'

import type { ChainConfig } from '@ethereumjs/common'
import type { NestedUint8Array, PrefixedHexString } from '@ethereumjs/util'

describe('[Block]: block functions', () => {
  it('should test block initialization', () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Chainstart })
    const genesis = createBlock({}, { common })
    assert.ok(bytesToHex(genesis.hash()), 'block should initialize')

    const params = JSON.parse(JSON.stringify(paramsBlock))
    params['1']['minGasLimit'] = 3000 // 5000
    let block = createBlock({}, { params })
    assert.equal(
      block.common.param('minGasLimit'),
      BigInt(3000),
      'should use custom parameters provided',
    )

    // test default freeze values
    // also test if the options are carried over to the constructor
    block = createBlock({})
    assert.ok(Object.isFrozen(block), 'block should be frozen by default')

    block = createBlock({}, { freeze: false })
    assert.ok(
      !Object.isFrozen(block),
      'block should not be frozen when freeze deactivated in options',
    )

    const rlpBlock = block.serialize()
    block = createBlockFromRLPSerializedBlock(rlpBlock)
    assert.ok(Object.isFrozen(block), 'block should be frozen by default')

    block = createBlockFromRLPSerializedBlock(rlpBlock, { freeze: false })
    assert.ok(
      !Object.isFrozen(block),
      'block should not be frozen when freeze deactivated in options',
    )

    const zero = new Uint8Array(0)
    const headerArray: Uint8Array[] = []
    for (let item = 0; item < 15; item++) {
      headerArray.push(zero)
    }

    // mock header data (if set to zeros(0) header throws)
    headerArray[0] = zeros(32) // parentHash
    headerArray[2] = zeros(20) // coinbase
    headerArray[3] = zeros(32) // stateRoot
    headerArray[4] = zeros(32) // transactionsTrie
    headerArray[5] = zeros(32) // receiptTrie
    headerArray[13] = zeros(32) // mixHash
    headerArray[14] = zeros(8) // nonce

    const valuesArray = <BlockBytes>[headerArray, [], []]

    block = createBlockFromValuesArray(valuesArray, { common })
    assert.ok(Object.isFrozen(block), 'block should be frozen by default')

    block = createBlockFromValuesArray(valuesArray, { common, freeze: false })
    assert.ok(
      !Object.isFrozen(block),
      'block should not be frozen when freeze deactivated in options',
    )
  })

  it('initialization -> setHardfork option', () => {
    const customChains = [testnetMerge]
    const common = new Common({
      chain: 'testnetMerge',
      hardfork: Hardfork.Istanbul,
      customChains: customChains as ChainConfig[],
    })

    let block = createBlock(
      {
        header: {
          number: 12, // Berlin block
          extraData: new Uint8Array(97),
        },
      },
      { common, setHardfork: true },
    )
    assert.equal(block.common.hardfork(), Hardfork.Berlin, 'should use setHardfork option')

    block = createBlock(
      {
        header: {
          number: 20, // Future block
        },
      },
      { common, setHardfork: 5001 },
    )
    assert.equal(
      block.common.hardfork(),
      Hardfork.Paris,
      'should use setHardfork option (td > threshold)',
    )

    block = createBlock(
      {
        header: {
          number: 12, // Berlin block,
          extraData: new Uint8Array(97),
        },
      },
      { common, setHardfork: 3000 },
    )
    assert.equal(
      block.common.hardfork(),
      Hardfork.Berlin,
      'should work with setHardfork option (td < threshold)',
    )
  })

  it('should initialize with undefined parameters without throwing', () => {
    assert.doesNotThrow(function () {
      createBlock()
    })
  })

  it('should initialize with null parameters without throwing', () => {
    const common = new Common({ chain: Chain.Goerli })
    const opts = { common }
    assert.doesNotThrow(function () {
      createBlock({}, opts)
    })
  })

  it('should throw when trying to initialize with uncle headers on a PoA network', () => {
    const common = new Common({ chain: Chain.Mainnet })
    const uncleBlock = createBlock({ header: { extraData: new Uint8Array(117) } }, { common })
    assert.throws(function () {
      createBlock({ uncleHeaders: [uncleBlock.header] }, { common })
    })
  })

  it('should test block validation on pow chain', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
    const blockRlp = hexToBytes(testDataPreLondon.blocks[0].rlp as PrefixedHexString)
    try {
      createBlockFromRLPSerializedBlock(blockRlp, { common })
      assert.ok(true, 'should pass')
    } catch (error: any) {
      assert.fail('should not throw')
    }
  })

  it('should test block validation on poa chain', async () => {
    const common = new Common({ chain: Chain.Goerli, hardfork: Hardfork.Chainstart })

    try {
      createBlockFromRpc(testDataFromRpcGoerli as JsonRpcBlock, [], { common })
      assert.ok(true, 'does not throw')
    } catch (error: any) {
      assert.fail('error thrown')
    }
  })

  async function testTransactionValidation(block: Block) {
    assert.ok(block.transactionsAreValid())
    assert.ok(block.getTransactionsValidationErrors().length === 0)
  }

  it('should test transaction validation - invalid tx trie', async () => {
    const blockRlp = hexToBytes(testDataPreLondon.blocks[0].rlp as PrefixedHexString)
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.London })
    const block = createBlockFromRLPSerializedBlock(blockRlp, { common, freeze: false })
    await testTransactionValidation(block)
    ;(block.header as any).transactionsTrie = new Uint8Array(32)
    try {
      await block.validateData()
      assert.fail('should throw')
    } catch (error: any) {
      assert.ok((error.message as string).includes('invalid transaction trie'))
    }
  })

  it('should test transaction validation - transaction not signed', async () => {
    const tx = createLegacyTx({
      gasLimit: 53000,
      gasPrice: 7,
    })
    const blockTest = createBlock({ transactions: [tx] })
    const txTrie = await blockTest.genTxTrie()
    const block = createBlock({
      header: {
        transactionsTrie: txTrie,
      },
      transactions: [tx],
    })
    try {
      await block.validateData()
      assert.fail('should throw')
    } catch (error: any) {
      assert.ok((error.message as string).includes('unsigned'))
    }
  })

  it('should test transaction validation with empty transaction list', async () => {
    const block = createBlock({})
    await testTransactionValidation(block)
  })

  it('should test transaction validation with legacy tx in london', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.London })
    const blockRlp = hexToBytes(testDataPreLondon.blocks[0].rlp as PrefixedHexString)
    const block = createBlockFromRLPSerializedBlock(blockRlp, { common, freeze: false })
    await testTransactionValidation(block)
    ;(block.transactions[0] as any).gasPrice = BigInt(0)
    const result = block.getTransactionsValidationErrors()
    assert.ok(
      result[0].includes('tx unable to pay base fee (non EIP-1559 tx)'),
      'should throw when legacy tx is unable to pay base fee',
    )
  })

  it('should test uncles hash validation', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
    const blockRlp = hexToBytes(testDataPreLondon2.blocks[2].rlp as PrefixedHexString)
    const block = createBlockFromRLPSerializedBlock(blockRlp, { common, freeze: false })
    assert.equal(block.uncleHashIsValid(), true)
    ;(block.header as any).uncleHash = new Uint8Array(32)
    try {
      await block.validateData()
      assert.fail('should throw')
    } catch (error: any) {
      assert.ok((error.message as string).includes('invalid uncle hash'))
    }
  })

  it('should test data integrity', async () => {
    const unsignedTx = createLegacyTx({})
    const txRoot = await genTransactionsTrieRoot([unsignedTx])

    let block = createBlock({
      transactions: [unsignedTx],
      header: {
        transactionsTrie: txRoot,
      },
    })

    // Verifies that the "signed tx check" is skipped
    await block.validateData(false, false)

    async function checkThrowsAsync(fn: Promise<void>, errorMsg: string) {
      try {
        await fn
        assert.fail('should throw')
      } catch (e: any) {
        assert.ok((e.message as string).includes(errorMsg))
      }
    }

    const zeroRoot = zeros(32)

    // Tx root
    block = createBlock({
      transactions: [unsignedTx],
      header: {
        transactionsTrie: zeroRoot,
      },
    })
    await checkThrowsAsync(block.validateData(false, false), 'invalid transaction trie')

    // Withdrawals root
    block = createBlock(
      {
        header: {
          withdrawalsRoot: zeroRoot,
          uncleHash: KECCAK256_RLP_ARRAY,
        },
      },
      { common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) },
    )
    await checkThrowsAsync(block.validateData(false, false), 'invalid withdrawals trie')

    // Uncle root
    block = createBlock(
      {
        header: {
          uncleHash: zeroRoot,
        },
      },
      { common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Chainstart }) },
    )
    await checkThrowsAsync(block.validateData(false, false), 'invalid uncle hash')

    // Verkle withness
    const common = new Common({ chain: Chain.Mainnet, eips: [6800], hardfork: Hardfork.Cancun })
    // Note: `executionWitness: undefined` will still initialize an execution witness in the block
    // So, only testing for `null` here
    block = createBlock({ executionWitness: null }, { common })
    await checkThrowsAsync(
      block.validateData(false, false),
      'Invalid block: ethereumjs stateless client needs executionWitness',
    )
  })

  it('should test isGenesis (mainnet default)', () => {
    const block = createBlock({ header: { number: 1 } })
    assert.notEqual(block.isGenesis(), true)
    const genesisBlock = createBlock({ header: { number: 0 } })
    assert.equal(genesisBlock.isGenesis(), true)
  })

  it('should test genesis hashes (mainnet default)', () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Chainstart })
    const rlp = hexToBytes(`0x${testDataGenesis.test.genesis_rlp_hex}`)
    const hash = hexToBytes(`0x${testDataGenesis.test.genesis_hash}`)
    const block = createBlockFromRLPSerializedBlock(rlp, { common })
    assert.ok(equalsBytes(block.hash(), hash), 'genesis hash match')
  })

  it('should test hash() method (mainnet default)', () => {
    let common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Chainstart })
    const rlp = hexToBytes(`0x${testDataGenesis.test.genesis_rlp_hex}`)
    const hash = hexToBytes(`0x${testDataGenesis.test.genesis_hash}`)
    let block = createBlockFromRLPSerializedBlock(rlp, { common })
    assert.ok(equalsBytes(block.hash(), hash), 'genesis hash match')

    common = new Common({
      chain: Chain.Mainnet,
      hardfork: Hardfork.Chainstart,
      customCrypto: {
        keccak256: () => {
          return new Uint8Array([1])
        },
      },
    })
    block = createBlockFromRLPSerializedBlock(rlp, { common })
    assert.deepEqual(block.hash(), new Uint8Array([1]), 'custom crypto applied on hash() method')
  })

  it('should error on invalid params', () => {
    assert.throws(
      () => {
        createBlockFromRLPSerializedBlock('1' as any)
      },
      undefined,
      undefined,
      'input must be array',
    )
    assert.throws(
      () => {
        createBlockFromValuesArray([1, 2, 3, 4] as any)
      },
      undefined,
      undefined,
      'input length must be 3 or less',
    )
  })

  it('should return the same block data from raw()', () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
    const block = createBlockFromRLPSerializedBlock(
      toBytes(testDataPreLondon2.blocks[2].rlp as PrefixedHexString),
      {
        common,
      },
    )
    const createBlockFromRaw = createBlockFromValuesArray(block.raw(), { common })
    assert.ok(equalsBytes(block.hash(), createBlockFromRaw.hash()))
  })

  it('should test toJSON', () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
    const block = createBlockFromRLPSerializedBlock(
      toBytes(testDataPreLondon2.blocks[2].rlp as PrefixedHexString),
      {
        common,
      },
    )
    assert.equal(typeof block.toJSON(), 'object')
  })

  it('DAO hardfork', () => {
    const blockData = RLP.decode(
      testDataPreLondon2.blocks[0].rlp as PrefixedHexString,
    ) as NestedUint8Array
    // Set block number from test block to mainnet DAO fork block 1920000
    blockData[0][8] = hexToBytes('0x1D4C00')

    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Dao })
    assert.throws(
      function () {
        createBlockFromValuesArray(blockData as BlockBytes, { common })
      },
      /extraData should be 'dao-hard-fork/,
      undefined,
      'should throw on DAO HF block with wrong extra data',
    ) // eslint-disable-line

    // Set extraData to dao-hard-fork
    blockData[0][12] = hexToBytes('0x64616f2d686172642d666f726b')

    assert.doesNotThrow(function () {
      createBlockFromValuesArray(blockData as BlockBytes, { common })
    }, 'should not throw on DAO HF block with correct extra data')
  })

  it('should set canonical difficulty if I provide a calcDifficultyFromHeader header', () => {
    let common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Chainstart })
    const genesis = createBlock({}, { common })

    const nextBlockHeaderData = {
      number: genesis.header.number + BigInt(1),
      timestamp: genesis.header.timestamp + BigInt(10),
    }

    common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.London })
    const blockWithoutDifficultyCalculation = createBlock(
      {
        header: nextBlockHeaderData,
      },
      { common },
    )

    // test if difficulty defaults to 0
    assert.equal(
      blockWithoutDifficultyCalculation.header.difficulty,
      BigInt(0),
      'header difficulty should default to 0',
    )

    // test if we set difficulty if we have a "difficulty header" in options; also verify this is equal to reported canonical difficulty.
    const blockWithDifficultyCalculation = createBlock(
      {
        header: nextBlockHeaderData,
      },
      {
        common,
        calcDifficultyFromHeader: genesis.header,
      },
    )

    assert.ok(
      blockWithDifficultyCalculation.header.difficulty > BigInt(0),
      'header difficulty should be set if difficulty header is given',
    )
    assert.ok(
      blockWithDifficultyCalculation.header.ethashCanonicalDifficulty(genesis.header) ===
        blockWithDifficultyCalculation.header.difficulty,
      'header difficulty is canonical difficulty if difficulty header is given',
    )

    // test if we can provide a block which is too far ahead to still calculate difficulty
    const noParentHeaderData = {
      number: genesis.header.number + BigInt(1337),
      timestamp: genesis.header.timestamp + BigInt(10),
    }

    const block_farAhead = createBlock(
      {
        header: noParentHeaderData,
      },
      {
        common,
        calcDifficultyFromHeader: genesis.header,
      },
    )

    assert.ok(
      block_farAhead.header.difficulty > BigInt(0),
      'should allow me to provide a bogus next block to calculate difficulty on when providing a difficulty header',
    )
  })

  it('should be able to initialize shanghai blocks with correct hardfork defaults', () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai })
    const block = createBlock({}, { common })
    assert.equal(block.common.hardfork(), Hardfork.Shanghai, 'hardfork should be set to shanghai')
    assert.deepEqual(block.withdrawals, [], 'withdrawals should be set to default empty array')
  })
})
