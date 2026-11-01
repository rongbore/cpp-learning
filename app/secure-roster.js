// All decryption happens locally. Passwords are never sent to the server or persisted.
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function decryptRoster(pack, password) {
  if (!globalThis.crypto?.subtle) throw Error('当前浏览器不支持安全解密，请使用 HTTPS 网站或本地测试服务。');
  if (!pack || pack.format !== 'zhike-encrypted-roster' || pack.version !== 1 || pack.cipher !== 'AES-GCM' || pack.kdf !== 'PBKDF2-SHA256' || pack.iterations !== 310000) throw Error('加密名册格式不受支持');
  if (!password) throw Error('请输入名册解锁口令');
  try {
    const salt=decode(pack.salt), iv=decode(pack.iv), ciphertext=decode(pack.ciphertext);
    if(salt.length!==16||iv.length!==12||ciphertext.length<16||ciphertext.length>5*1024*1024)throw Error('Invalid envelope');
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:pack.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('zhike-roster:v1'),tagLength:128},key,ciphertext);
    return new TextDecoder('utf-8',{fatal:true}).decode(plain);
  } catch { throw Error('名册解锁失败：口令不正确或加密文件已损坏。'); }
}
