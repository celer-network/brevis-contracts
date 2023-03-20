import { MapDB, Trie } from '@ethereumjs/trie';
import { Account } from '@ethereumjs/util';

import { BytesLike, arrayify, defaultAbiCoder, keccak256, solidityKeccak256, hexlify, RLP } from 'ethers/lib/utils';

// Make sure this matches solidity!
const msgFieldTypes = ['uint256', 'address', 'address', 'uint256', 'bytes'];

// return abi encoded hex string, should match solidity
// values must have same length as msgFieldTypes above
export async function encodeMsg(values: any[]) {
  return defaultAbiCoder.encode(msgFieldTypes, values);
}

// simple helper to return hash result as bytes, not hex string
export function hash2bytes(msg: BytesLike): Uint8Array {
  return arrayify(keccak256(msg))
}

// use solidityKeccak256
export function solHash2Bytes(types: string[], vals: any[]): Uint8Array {
  return arrayify(solidityKeccak256(types, vals))
}

/*
 msg is hex string of abi.encode(nonce, ...) if more fields are added, must add inside this func
 addr is hex string of account address, needed for accountProof
 return [storageProof, accountProof]
*/
export async function generateProof(msg: string, addr: string) {
  // trie for contact's own storage
  const storageTrie = new Trie({ useKeyHashing: true, db: new MapDB() });
  // decode msg to get nonce, then compute path, add to storageTrie, getproof, hash(proof[0]) is account's storageRoot
  // account is RLP([nonce,balance,storageRoot,codeHash]) and path is hash(address), add to accountTrie, getProof
  const decoded = defaultAbiCoder.decode(msgFieldTypes, msg);
  // hash of msg is saved in solidity map, key is nonce, per solidity storage layout,
  // storage slot corresponding to a mapping key k is located at keccak256(k . p) where . is concatenation, p is the map's slot
  // in our case, its slot is 1 (must be full 32 bytes/uint256), for msg.nonce = 0x12, its slot is
  // keccak256(0x0000000000000000000000000000000000000000000000000000000000000012_0000000000000000000000000000000000000000000000000000000000000001)
  // https://playground.ethers.org/
  const slot = solHash2Bytes(['uint256', 'uint256'], [decoded[0], 1]);
  const triePath = Buffer.from(slot); // no need to manually hash again b/c Trie has useKeyHashing true
  
  //  because contract save msg hash as map value
  //  rlp encode msg hash
  const rlpEncodedHex = RLP.encode(keccak256(msg)).replace("0x", "")
  const rlpEncodedUInt8Array = new Uint8Array(rlpEncodedHex.length / 2);
  for (let i = 0; i < rlpEncodedHex.length; i += 2) {
    rlpEncodedUInt8Array[i / 2] = parseInt(rlpEncodedHex.substring(i, i + 2), 16)
  }
  await storageTrie.put(triePath, Buffer.from(rlpEncodedUInt8Array)); 

  // add more mock nodes so we have a branch for proof, path and value don't matter
  await storageTrie.put(Buffer.from('1'), Buffer.from('random value'));
  await storageTrie.put(Buffer.from('2'), Buffer.from('random value'));
  await storageTrie.put(Buffer.from('3'), Buffer.from('random value'));

  const stProof = await storageTrie.createProof(triePath);
  //const value = await storageTrie.verifyProof(storageTrie.root(), triePath, stProof)
  //console.log("storage proof", stProof, "value", value?.toString("hex"), "roots", storageTrie.root().toString("hex"), keccak256(stProof[0]).toString("hex"))

  // trie for global state
  const accountTrie = new Trie({ useKeyHashing: true, db: new MapDB() });
  // now prepare account proof, first create account content, 4 item array of [nonce,balance,storageRoot,codeHash]
  // we only need to make sure storageRoot matches storageTrie.root, note codeHash may be used for isContract check in solidity and should have 32bytes
  const acnt = new Account(undefined, undefined, storageTrie.root(), Buffer.from('0123456789abcdef0123456789abcdef'));
  // acnt path is keccak256(address), value is rlp(acnt)
  const acntPath = Buffer.from(arrayify(addr));
  await accountTrie.put(acntPath, acnt.serialize());
  // add more mock accounts so we have a branch for proof
  await accountTrie.put(Buffer.from('1'), acnt.serialize());
  await accountTrie.put(Buffer.from('2'), acnt.serialize());
  await accountTrie.put(Buffer.from('3'), acnt.serialize());

  const acntProof = await accountTrie.createProof(acntPath);
  // console.log("account proof", acntProof);

  return [stProof, acntProof];
}