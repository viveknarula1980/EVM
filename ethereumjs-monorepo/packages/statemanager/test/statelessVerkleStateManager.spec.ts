import { createBlock } from '@ethereumjs/block'
import { createCommonFromGethGenesis } from '@ethereumjs/common'
import { createTxFromSerializedData } from '@ethereumjs/tx'
import {
  Address,
  VerkleLeafType,
  bytesToBigInt,
  bytesToHex,
  createAccount,
  createAddressFromString,
  getVerkleKey,
  getVerkleStem,
  hexToBytes,
  randomBytes,
} from '@ethereumjs/util'
import { loadVerkleCrypto } from 'verkle-cryptography-wasm'
import { assert, beforeAll, describe, it, test } from 'vitest'

import { CacheType, StatelessVerkleStateManager } from '../src/index.js'

import * as testnetVerkleKaustinen from './testdata/testnetVerkleKaustinen.json'
import * as verkleBlockJSON from './testdata/verkleKaustinen6Block72.json'

import type { BlockData } from '@ethereumjs/block'
import type { PrefixedHexString, VerkleCrypto } from '@ethereumjs/util'

describe('StatelessVerkleStateManager: Kaustinen Verkle Block', () => {
  let verkleCrypto: VerkleCrypto
  beforeAll(async () => {
    verkleCrypto = await loadVerkleCrypto()
  })
  const common = createCommonFromGethGenesis(testnetVerkleKaustinen, {
    chain: 'customChain',
    eips: [2935, 4895, 6800],
  })
  const decodedTxs = verkleBlockJSON.transactions.map((tx) =>
    createTxFromSerializedData(hexToBytes(tx as PrefixedHexString)),
  )
  const block = createBlock({ ...verkleBlockJSON, transactions: decodedTxs } as BlockData, {
    common,
  })

  it('initPreState()', async () => {
    const stateManager = new StatelessVerkleStateManager({ verkleCrypto })
    stateManager.initVerkleExecutionWitness(block.header.number, block.executionWitness)

    assert.ok(Object.keys(stateManager['_state']).length !== 0, 'should initialize with state')
  })

  it('getAccount()', async () => {
    const stateManager = new StatelessVerkleStateManager({ common, verkleCrypto })
    stateManager.initVerkleExecutionWitness(block.header.number, block.executionWitness)

    const account = await stateManager.getAccount(
      createAddressFromString('0x6177843db3138ae69679a54b95cf345ed759450d'),
    )

    assert.equal(account!.balance, 288610978528114322n, 'should have correct balance')
    assert.equal(account!.nonce, 300n, 'should have correct nonce')
    assert.equal(account!._storageRoot, null, 'stateroot should have not been set')
    assert.equal(
      bytesToHex(account!.codeHash),
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
      'should have correct codeHash',
    )
  })

  it('put/delete/modify account', async () => {
    const stateManager = new StatelessVerkleStateManager({ common, verkleCrypto })
    stateManager.initVerkleExecutionWitness(block.header.number, block.executionWitness)

    const address = new Address(randomBytes(20))

    try {
      await stateManager.getAccount(address)
      assert.fail('should throw on getting account that is not found in witness')
    } catch (e: any) {
      assert.equal(
        e.message.slice(0, 25),
        'No witness bundled for ad',
        'should throw on getting account that does not exist in cache and witness',
      )
    }

    const account = createAccount({
      nonce: BigInt(2),
    })

    await stateManager.putAccount(address, account)
    assert.deepEqual(
      await stateManager.getAccount(address),
      account,
      'should return correct account',
    )

    await stateManager.modifyAccountFields(address, {
      nonce: BigInt(3),
    })
    account.nonce = BigInt(3)
    assert.deepEqual(
      await stateManager.getAccount(address),
      account,
      'should return correct account',
    )

    await stateManager.deleteAccount(address)

    assert.isUndefined(
      await stateManager.getAccount(address),
      'should return undefined for deleted account',
    )
  })

  it('getKey function', async () => {
    const stateManager = new StatelessVerkleStateManager({ common, verkleCrypto })
    stateManager.initVerkleExecutionWitness(block.header.number, block.executionWitness)

    const address = createAddressFromString('0x6177843db3138ae69679a54b95cf345ed759450d')
    const stem = getVerkleStem(stateManager.verkleCrypto, address, 0n)

    const balanceKey = getVerkleKey(stem, VerkleLeafType.Balance)
    const nonceKey = getVerkleKey(stem, VerkleLeafType.Nonce)
    const codeHashKey = getVerkleKey(stem, VerkleLeafType.CodeHash)

    const balanceRaw = stateManager['_state'][bytesToHex(balanceKey)]
    const nonceRaw = stateManager['_state'][bytesToHex(nonceKey)]
    const codeHash = stateManager['_state'][bytesToHex(codeHashKey)]

    const account = await stateManager.getAccount(address)

    assert.equal(
      account!.balance,
      bytesToBigInt(hexToBytes(balanceRaw!), true),
      'should have correct balance',
    )
    assert.equal(
      account!.nonce,
      bytesToBigInt(hexToBytes(nonceRaw!), true),
      'should have correct nonce',
    )
    assert.equal(bytesToHex(account!.codeHash), codeHash, 'should have correct codeHash')
  })

  it(`copy()`, async () => {
    const stateManager = new StatelessVerkleStateManager({
      accountCacheOpts: {
        type: CacheType.ORDERED_MAP,
      },
      storageCacheOpts: {
        type: CacheType.ORDERED_MAP,
      },
      common,
      verkleCrypto,
    })
    stateManager.initVerkleExecutionWitness(block.header.number, block.executionWitness)

    const stateManagerCopy = stateManager.shallowCopy() as StatelessVerkleStateManager

    assert.equal(
      (stateManagerCopy as any)['_accountCacheSettings'].type,
      CacheType.ORDERED_MAP,
      'should switch to ORDERED_MAP account cache on copy()',
    )
    assert.equal(
      (stateManagerCopy as any)['_storageCacheSettings'].type,
      CacheType.ORDERED_MAP,
      'should switch to ORDERED_MAP storage cache on copy()',
    )
  })

  // TODO contract storage functions not yet completely implemented
  test.skip('get/put/clear contract storage', async () => {
    const stateManager = new StatelessVerkleStateManager({ common, verkleCrypto })
    stateManager.initVerkleExecutionWitness(block.header.number, block.executionWitness)

    const contractAddress = createAddressFromString('0x4242424242424242424242424242424242424242')
    const storageKey = '0x0000000000000000000000000000000000000000000000000000000000000022'
    const storageValue = '0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b'
    await stateManager.putStorage(contractAddress, hexToBytes(storageKey), hexToBytes(storageValue))
    let contractStorage = await stateManager.getStorage(contractAddress, hexToBytes(storageKey))

    assert.equal(bytesToHex(contractStorage), storageValue)

    await stateManager.clearStorage(contractAddress)
    contractStorage = await stateManager.getStorage(contractAddress, hexToBytes(storageKey))

    assert.equal(bytesToHex(contractStorage), bytesToHex(new Uint8Array()))
  })
})
