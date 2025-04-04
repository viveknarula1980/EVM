import { Chain, Common, Hardfork } from '@ethereumjs/common'
import {
  KECCAK256_RLP,
  KECCAK256_RLP_ARRAY,
  createZeroAddress,
  equalsBytes,
  hexToBytes,
  zeros,
} from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { Block } from '../src/block.js'
import { createBlock, createHeader } from '../src/constructors.js'

import type { BlockHeader } from '../src/header.js'

const common = new Common({
  chain: Chain.Mainnet,
  hardfork: Hardfork.Paris,
})

function validateMergeHeader(header: BlockHeader) {
  assert.ok(equalsBytes(header.parentHash, zeros(32)), 'parentHash')
  assert.ok(equalsBytes(header.uncleHash, KECCAK256_RLP_ARRAY), 'uncleHash')
  assert.ok(header.coinbase.equals(createZeroAddress()), 'coinbase')
  assert.ok(equalsBytes(header.stateRoot, zeros(32)), 'stateRoot')
  assert.ok(equalsBytes(header.transactionsTrie, KECCAK256_RLP), 'transactionsTrie')
  assert.ok(equalsBytes(header.receiptTrie, KECCAK256_RLP), 'receiptTrie')
  assert.ok(equalsBytes(header.logsBloom, zeros(256)), 'logsBloom')
  assert.equal(header.difficulty, BigInt(0), 'difficulty')
  assert.equal(header.number, BigInt(0), 'number')
  assert.equal(header.gasLimit, BigInt('0xffffffffffffff'), 'gasLimit')
  assert.equal(header.gasUsed, BigInt(0), 'gasUsed')
  assert.equal(header.timestamp, BigInt(0), 'timestamp')
  assert.ok(header.extraData.length <= 32, 'extraData')
  assert.equal(header.mixHash.length, 32, 'mixHash')
  assert.ok(equalsBytes(header.nonce, zeros(8)), 'nonce')
}

describe('[Header]: Casper PoS / The Merge Functionality', () => {
  it('should construct default blocks with post-merge PoS constants fields', () => {
    const header = createHeader({}, { common })
    validateMergeHeader(header)

    const block = new Block(undefined, undefined, undefined, undefined, { common }, undefined)
    validateMergeHeader(block.header)
  })

  it('should throw if non merge-conforming PoS constants are provided', () => {
    // Building a header with random values for constants
    try {
      const headerData = {
        uncleHash: hexToBytes('0x123abc'),
      }
      createHeader(headerData, { common })
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok(true, 'should throw on wrong uncleHash')
    }

    try {
      const headerData = {
        difficulty: BigInt(123456),
        number: 1n,
      }
      createHeader(headerData, { common })
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok(true, 'should throw on wrong difficulty')
    }

    try {
      const headerData = {
        extraData: new Uint8Array(33).fill(1),
        number: 1n,
      }
      createHeader(headerData, { common })
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok(true, 'should throw on invalid extraData length')
    }

    try {
      const headerData = {
        mixHash: new Uint8Array(30).fill(1),
      }
      createHeader(headerData, { common })
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok(true, 'should throw on invalid mixHash length')
    }

    try {
      const headerData = {
        nonce: new Uint8Array(8).fill(1),
        number: 1n,
      }
      createHeader(headerData, { common })
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok(true, 'should throw on wrong nonce')
    }
  })

  it('test that a PoS block with uncles cannot be produced', () => {
    try {
      new Block(undefined, undefined, [createHeader(undefined, { common })], undefined, {
        common,
      })
      assert.fail('should have thrown')
    } catch (e: any) {
      assert.ok(true, 'should throw')
    }
  })

  it('EIP-4399: prevRando should return mixHash value', () => {
    const mixHash = new Uint8Array(32).fill(3)
    let block = createBlock({ header: { mixHash } }, { common })
    assert.ok(
      equalsBytes(block.header.prevRandao, mixHash),
      'prevRandao should return mixHash value',
    )

    const commonLondon = common.copy()
    commonLondon.setHardfork(Hardfork.London)
    block = createBlock({ header: { mixHash } }, { common: commonLondon })
    try {
      block.header.prevRandao
      assert.fail('should have thrown')
    } catch (e: any) {
      assert.ok(true, 'prevRandao should throw if EIP-4399 is not activated')
    }
  })
})
