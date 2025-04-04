import { Chain, Common, Hardfork } from '@ethereumjs/common'
import { hexToBytes } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import {
  AccessListEIP2930Transaction,
  FeeMarketEIP1559Transaction,
  LegacyTransaction,
  TransactionType,
  create1559FeeMarketTx,
  create2930AccessListTx,
  createLegacyTx,
  createTxFromBlockBodyData,
  createTxFromSerializedData,
  createTxFromTxData,
} from '../src/index.js'

const common = new Common({
  chain: Chain.Mainnet,
  hardfork: Hardfork.London,
})

const pKey = hexToBytes('0x4646464646464646464646464646464646464646464646464646464646464646')

const unsignedLegacyTx = createLegacyTx({})
const signedLegacyTx = unsignedLegacyTx.sign(pKey)

const unsignedEIP2930Tx = create2930AccessListTx({ chainId: BigInt(1) }, { common })
const signedEIP2930Tx = unsignedEIP2930Tx.sign(pKey)
const unsignedEIP1559Tx = create1559FeeMarketTx({ chainId: BigInt(1) }, { common })
const signedEIP1559Tx = unsignedEIP1559Tx.sign(pKey)

const txTypes = [
  {
    class: LegacyTransaction,
    name: 'LegacyTransaction',
    unsigned: unsignedLegacyTx,
    signed: signedLegacyTx,
    eip2718: false,
    type: TransactionType.Legacy,
  },
  {
    class: AccessListEIP2930Transaction,
    name: 'AccessListEIP2930Transaction',
    unsigned: unsignedEIP2930Tx,
    signed: signedEIP2930Tx,
    eip2718: true,
    type: TransactionType.AccessListEIP2930,
  },
  {
    class: FeeMarketEIP1559Transaction,
    name: 'FeeMarketEIP1559Transaction',
    unsigned: unsignedEIP1559Tx,
    signed: signedEIP1559Tx,
    eip2718: true,
    type: TransactionType.FeeMarketEIP1559,
  },
]

describe('[TransactionFactory]: Basic functions', () => {
  it('fromSerializedData() -> success cases', () => {
    for (const txType of txTypes) {
      const serialized = txType.unsigned.serialize()
      const factoryTx = createTxFromSerializedData(serialized, { common })
      assert.equal(
        factoryTx.constructor.name,
        txType.class.name,
        `should return the right type (${txType.name})`,
      )
    }
  })

  it('fromSerializedData() -> error cases', () => {
    for (const txType of txTypes) {
      if (txType.eip2718) {
        const unsupportedCommon = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
        assert.throws(
          () => {
            createTxFromSerializedData(txType.unsigned.serialize(), {
              common: unsupportedCommon,
            })
          },
          undefined,
          undefined,
          `should throw when trying to create typed tx when not allowed in Common (${txType.name})`,
        )

        assert.throws(
          () => {
            const serialized = txType.unsigned.serialize()
            serialized[0] = 99 // edit the transaction type
            createTxFromSerializedData(serialized, { common })
          },
          undefined,
          undefined,
          `should throw when trying to create typed tx with wrong type (${txType.name})`,
        )
      }
    }
  })

  it('fromBlockBodyData() -> success cases', () => {
    for (const txType of txTypes) {
      let rawTx: Uint8Array | Uint8Array[]
      if (txType.eip2718) {
        rawTx = txType.signed.serialize()
      } else {
        rawTx = txType.signed.raw() as Uint8Array[]
      }
      const tx = createTxFromBlockBodyData(rawTx, { common })
      assert.equal(
        tx.constructor.name,
        txType.name,
        `should return the right type (${txType.name})`,
      )
      if (txType.eip2718) {
        assert.deepEqual(
          tx.serialize(),
          rawTx,
          `round-trip serialization should match (${txType.name})`,
        )
      } else {
        assert.deepEqual(
          tx.raw(),
          rawTx as Uint8Array[],
          `round-trip raw() creation should match (${txType.name})`,
        )
      }
    }
  })

  it('fromTxData() -> success cases', () => {
    for (const txType of txTypes) {
      const tx = createTxFromTxData({ type: txType.type }, { common })
      assert.equal(
        tx.constructor.name,
        txType.class.name,
        `should return the right type (${txType.name})`,
      )
      if (!txType.eip2718) {
        const tx = createTxFromTxData({})
        assert.equal(
          tx.constructor.name,
          txType.class.name,
          `should return the right type (${txType.name})`,
        )
      }
    }
  })

  it('fromTxData() -> error cases', () => {
    const unsupportedCommon = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
    assert.throws(() => {
      createTxFromTxData({ type: 1 }, { common: unsupportedCommon })
    })

    assert.throws(() => {
      createTxFromTxData({ type: 999 })
    })

    assert.throws(() => {
      createTxFromTxData({ value: BigInt('-100') })
    })
  })
})
