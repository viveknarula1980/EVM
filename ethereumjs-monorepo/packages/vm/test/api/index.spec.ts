import { Chain, Common, Hardfork, createCustomCommon } from '@ethereumjs/common'
import { EVM, createEVM } from '@ethereumjs/evm'
import { Account, KECCAK256_RLP, createAddressFromString, hexToBytes } from '@ethereumjs/util'
import * as util from 'util' // eslint-disable-line @typescript-eslint/no-unused-vars
import { assert, describe, it } from 'vitest'

import { type VMOpts, paramsVM } from '../../src/index.js'
import { VM } from '../../src/vm.js'

import * as testnet from './testdata/testnet.json'
import * as testnet2 from './testdata/testnet2.json'
import * as testnetMerge from './testdata/testnetMerge.json'
import { setupVM } from './utils.js'

import type { ChainConfig } from '@ethereumjs/common'
import type { DefaultStateManager } from '@ethereumjs/statemanager'

/**
 * Tests for the main constructor API and
 * exposed functionality by src/index.js
 *
 * The following re-exported VM methods are tested within
 * their own files:
 *
 * runBlock.spec.ts
 * runTx.spec.ts
 * runCall.spec.ts
 * runCode.spec.ts
 *
 * opcodes.spec.ts (getActiveOpcodes())
 */

describe('VM -> basic instantiation / boolean switches', () => {
  it('should instantiate without params', async () => {
    const vm = await VM.create()
    assert.ok(vm.stateManager)
    assert.deepEqual(
      (vm.stateManager as DefaultStateManager)['_trie'].root(),
      KECCAK256_RLP,
      'it has default trie',
    )
    assert.equal(vm.common.hardfork(), Hardfork.Shanghai, 'it has correct default HF')
  })

  it('should be able to activate precompiles', async () => {
    const vm = await VM.create({ activatePrecompiles: true })
    assert.notDeepEqual(
      (vm.stateManager as DefaultStateManager)['_trie'].root(),
      KECCAK256_RLP,
      'it has different root',
    )
  })
})

describe('VM -> Default EVM / Custom EVM Opts', () => {
  it('Default EVM should have correct default EVM opts', async () => {
    const vm = await VM.create()
    assert.isFalse((vm.evm as EVM).allowUnlimitedContractSize, 'allowUnlimitedContractSize=false')
  })

  it('should throw if evm and evmOpts are both used', async () => {
    try {
      await VM.create({ evmOpts: {}, evm: await createEVM() })
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok('correctly thrown')
    }
  })

  it('Default EVM should use custom EVM opts', async () => {
    const vm = await VM.create({ evmOpts: { allowUnlimitedContractSize: true } })
    assert.isTrue((vm.evm as EVM).allowUnlimitedContractSize, 'allowUnlimitedContractSize=true')
    const copiedVM = await vm.shallowCopy()
    assert.isTrue(
      (copiedVM.evm as EVM).allowUnlimitedContractSize,
      'allowUnlimitedContractSize=true (for shallowCopied VM)',
    )
  })

  it('Default EVM should use VM common', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Byzantium })
    const vm = await VM.create({ common })
    assert.equal((vm.evm as EVM).common.hardfork(), 'byzantium', 'use modfied HF from VM common')

    const copiedVM = await vm.shallowCopy()
    assert.equal(
      (copiedVM.evm as EVM).common.hardfork(),
      'byzantium',
      'use modfied HF from VM common (for shallowCopied VM)',
    )
  })

  it('Default EVM should prefer common from evmOpts if provided (same logic for blockchain, statemanager)', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Byzantium })
    const vm = await VM.create({ evmOpts: { common } })
    assert.equal((vm.evm as EVM).common.hardfork(), 'byzantium', 'use modfied HF from evmOpts')

    const copiedVM = await vm.shallowCopy()
    assert.equal(
      (copiedVM.evm as EVM).common.hardfork(),
      'byzantium',
      'use modfied HF from evmOpts (for shallowCopied VM)',
    )
  })
})

describe('VM -> supportedHardforks', () => {
  it('should throw when common is set to an unsupported hardfork', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai })
    const prevSupported = EVM['supportedHardforks']
    EVM['supportedHardforks'] = [
      Hardfork.Chainstart,
      Hardfork.Homestead,
      Hardfork.Dao,
      Hardfork.TangerineWhistle,
      Hardfork.SpuriousDragon,
      Hardfork.Byzantium,
      Hardfork.Constantinople,
      Hardfork.Petersburg,
      Hardfork.Istanbul,
      Hardfork.MuirGlacier,
      Hardfork.Berlin,
      Hardfork.London,
      Hardfork.ArrowGlacier,
      Hardfork.GrayGlacier,
      Hardfork.MergeForkIdTransition,
      Hardfork.Paris,
    ]
    try {
      await VM.create({ common })
      assert.fail('should have failed for unsupported hardfork')
    } catch (e: any) {
      assert.ok(e.message.includes('supportedHardforks'))
    }
    // restore supported hardforks
    EVM['supportedHardforks'] = prevSupported
  })

  it('should succeed when common is set to a supported hardfork', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Byzantium })
    const vm = await VM.create({ common })
    assert.equal(vm.common.hardfork(), Hardfork.Byzantium)
  })

  it('should overwrite parameters when param option is used', async () => {
    let vm = await VM.create()
    assert.equal(
      vm.common.param('elasticityMultiplier'),
      BigInt(2),
      'should use correct default EVM parameters',
    )

    const params = JSON.parse(JSON.stringify(paramsVM))
    params['1559']['elasticityMultiplier'] = 10 // 2
    vm = await VM.create({ params })
    assert.equal(
      vm.common.param('elasticityMultiplier'),
      BigInt(10),
      'should use custom parameters provided',
    )

    vm = await VM.create()
    assert.equal(
      vm.common.param('elasticityMultiplier'),
      BigInt(2),
      'should again use the correct default EVM parameters',
    )
  })
})

describe('VM -> common (chain, HFs, EIPs)', () => {
  it('should accept a common object as option', async () => {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })

    let vm = await VM.create({ common })
    assert.equal(vm.common, common)

    vm = await VM.create()
    assert.equal(
      vm.common.param('elasticityMultiplier'),
      BigInt(2),
      'should use correct default EVM parameters',
    )
  })

  it('should only accept valid chain and fork', async () => {
    // let common = new Common({ chain: Chain.Ropsten, hardfork: Hardfork.Byzantium })
    let common = createCustomCommon({ chainId: 3 })
    common.setHardfork(Hardfork.Byzantium)
    let vm = await VM.create({ common })
    assert.equal(vm.common.param('ecAddGas'), BigInt(500))

    try {
      common = new Common({ chain: 'mainchain', hardfork: Hardfork.Homestead })
      vm = await VM.create({ common })
      assert.fail('should have failed for invalid chain')
    } catch (e: any) {
      assert.ok(e.message.includes('not supported'))
    }
  })

  it('should accept a supported EIP', async () => {
    const isBrowser = new Function('try {return this===window;}catch(e){ return false;}')

    if (isBrowser() === false) {
      const common = new Common({ chain: Chain.Mainnet, eips: [2537] })
      try {
        await VM.create({ common })
        assert.ok(true, 'did not throw')
      } catch (error) {
        assert.fail('should not have thrown')
      }
    }
  })

  it('should accept a custom chain config (createCustomCommon() static constructor)', async () => {
    const customChainParams = { name: 'custom', chainId: 123 }
    const common = createCustomCommon(customChainParams, {
      baseChain: 'mainnet',
      hardfork: 'byzantium',
    })

    const vm = await VM.create({ common })
    assert.equal(vm.common, common)
  })

  it('should accept a custom chain config (Common customChains constructor option)', async () => {
    const customChains = [testnet, testnet2] as ChainConfig[]
    const common = new Common({ chain: 'testnet', hardfork: Hardfork.Berlin, customChains })

    const vm = await VM.create({ common })
    assert.equal(vm.common, common)
  })
})

describe('VM -> setHardfork, state (deprecated), blockchain', () => {
  it('setHardfork', async () => {
    const customChains = [testnetMerge] as ChainConfig[]
    const common = new Common({ chain: 'testnetMerge', hardfork: Hardfork.Istanbul, customChains })

    let vm = await VM.create({ common, setHardfork: true })
    assert.equal((vm as any)._setHardfork, true, 'should set setHardfork option')

    vm = await VM.create({ common, setHardfork: 5001 })
    assert.equal((vm as any)._setHardfork, BigInt(5001), 'should set setHardfork option')
  })

  it('should instantiate', async () => {
    const vm = await setupVM()
    assert.deepEqual(
      (vm.stateManager as DefaultStateManager)['_trie'].root(),
      KECCAK256_RLP,
      'it has default trie',
    )
  })

  it('should pass the correct Common object when copying the VM', async () => {
    const vm = await setupVM({
      common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Byzantium }),
    })

    assert.equal(vm.common.chainName(), 'mainnet')
    assert.equal(vm.common.hardfork(), 'byzantium')

    const copiedVM = await vm.shallowCopy()
    assert.equal(copiedVM.common.chainName(), 'mainnet')
    assert.equal(copiedVM.common.hardfork(), 'byzantium')
  })

  it('should pass the correct VM options when copying the VM', async () => {
    let opts: VMOpts = {
      setHardfork: true,
    }

    let vm = await VM.create(opts)
    let vmCopy = await vm.shallowCopy()
    assert.deepEqual(
      (vmCopy as any)._setHardfork,
      true,
      'copy() correctly passes setHardfork option',
    )
    assert.deepEqual(
      (vm as any)._setHardfork,
      (vmCopy as any)._setHardfork,
      'setHardfork options match',
    )

    //

    opts = {
      setHardfork: BigInt(5001),
    }
    vm = await VM.create(opts)
    vmCopy = await vm.shallowCopy()
    assert.deepEqual(
      (vmCopy as any)._setHardfork,
      BigInt(5001),
      'copy() correctly passes setHardfork option',
    )
    assert.deepEqual(
      (vm as any)._setHardfork,
      (vmCopy as any)._setHardfork,
      'setHardfork options match',
    )
  })
  describe('Ensure that precompile activation creates non-empty accounts', () => {
    it('should work', async () => {
      // setup the accounts for this test
      const caller = createAddressFromString('0x00000000000000000000000000000000000000ee') // caller address
      const contractAddress = createAddressFromString('0x00000000000000000000000000000000000000ff') // contract address
      // setup the vm
      const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
      const vmNotActivated = await VM.create({ common })
      const vmActivated = await VM.create({ common, activatePrecompiles: true })
      const code = '0x6000808080347300000000000000000000000000000000000000045AF100'
      /*
        idea: call the Identity precompile with nonzero value in order to trigger "callNewAccount" for the non-activated VM and do not deduct this
              when calling from the activated VM. Explicitly check that the difference in gas cost is equal to the common callNewAccount gas.
        code:             remarks: (top of the stack is at the zero index)
          PUSH1 0x00
          DUP1
          DUP1
          DUP1
          CALLVALUE
          PUSH20 0000000000000000000000000000000000000004
          GAS
          CALL            [gas, 0x00..04, 0, 0, 0, 0, 0]
          STOP
      */

      await vmNotActivated.stateManager.putCode(contractAddress, hexToBytes(code)) // setup the contract code
      await vmNotActivated.stateManager.putAccount(caller, new Account(BigInt(0), BigInt(0x111))) // give calling account a positive balance
      await vmActivated.stateManager.putCode(contractAddress, hexToBytes(code)) // setup the contract code
      await vmActivated.stateManager.putAccount(caller, new Account(BigInt(0), BigInt(0x111))) // give calling account a positive balance
      // setup the call arguments
      const runCallArgs = {
        caller, // call address
        gasLimit: BigInt(0xffffffffff), // ensure we pass a lot of gas, so we do not run out of gas
        to: contractAddress, // call to the contract address,
        value: BigInt(1),
      }

      const resultNotActivated = await vmNotActivated.evm.runCall(runCallArgs)
      const resultActivated = await vmActivated.evm.runCall(runCallArgs)

      const diff =
        resultNotActivated.execResult.executionGasUsed - resultActivated.execResult.executionGasUsed
      const expected = common.param('callNewAccountGas')

      assert.equal(diff, expected, 'precompiles are activated')
    })
  })
})
