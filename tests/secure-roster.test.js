import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decryptRoster} from '../app/secure-roster.js';
const b64=bytes=>Buffer.from(bytes).toString('base64');
async function fixture(){
 const password='fictional-test-password-not-a-real-key';
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:310000},material,{name:'AES-GCM',length:256},false,['encrypt']);
 const text='班级,姓名,账号,年级\n测试一班,虚构同学,demo01,7.10\n';
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('zhike-roster:v1')},key,new TextEncoder().encode(text));
 return {password,text,pack:{format:'zhike-encrypted-roster',version:1,cipher:'AES-GCM',kdf:'PBKDF2-SHA256',iterations:310000,salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)}};
}
test('authenticated decryption preserves UTF-8 roster data and exact grade strings',async()=>{const f=await fixture();assert.equal(await decryptRoster(f.pack,f.password),f.text);});
test('wrong passwords and tampered files fail authenticated decryption',async()=>{const f=await fixture();await assert.rejects(decryptRoster(f.pack,'wrong'),/口令不正确/);const bytes=Buffer.from(f.pack.ciphertext,'base64');bytes[0]^=1;await assert.rejects(decryptRoster({...f.pack,ciphertext:b64(bytes)},f.password),/解锁失败/);});
test('unsupported cryptographic parameters are rejected before decryption',async()=>{const f=await fixture();await assert.rejects(decryptRoster({...f.pack,iterations:1},f.password),/格式不受支持/);await assert.rejects(decryptRoster(f.pack,''),/请输入/);});
