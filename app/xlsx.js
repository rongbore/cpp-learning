// Read standard unencrypted .xlsx in the browser; no external service receives data.
export async function readXLSX(file){
 const data=new Uint8Array(await file.arrayBuffer());if(data.length>20*1024*1024)throw Error('文件超过 20MB，请拆分后导入');const view=new DataView(data.buffer);let end=data.length-22;
 while(end>=Math.max(0,data.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
 if(end<Math.max(0,data.length-65557))throw Error('不是有效的 XLSX 文件');
 const entries=new Map();let p=view.getUint32(end+16,true),total=0;
 for(let n=0;n<view.getUint16(end+10,true);n++){
 if(view.getUint32(p,true)!==0x02014b50)throw Error('XLSX 目录损坏');const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),expanded=view.getUint32(p+24,true),nl=view.getUint16(p+28,true),el=view.getUint16(p+30,true),cl=view.getUint16(p+32,true),offset=view.getUint32(p+42,true);
 if(flags&1)throw Error('不支持加密的 Excel，请先另存为未加密 XLSX');total+=expanded;if(total>60*1024*1024)throw Error('表格解压后过大，请拆分');
 const name=new TextDecoder().decode(data.slice(p+46,p+46+nl));entries.set(name,{method,size,offset,expanded});p+=46+nl+el+cl;
 }
 async function xml(name){const e=entries.get(name);if(!e)throw Error(`Excel 缺少 ${name}`);const start=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true);let bytes=data.slice(start,start+e.size);
 if(e.method===8){bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}else if(e.method!==0)throw Error('Excel 压缩格式不受支持');
 if(bytes.length!==e.expanded)throw Error('Excel 文件损坏');const doc=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');if(doc.querySelector('parsererror'))throw Error('Excel XML 无效');return doc;}
 const strings=entries.has('xl/sharedStrings.xml')?[...(await xml('xl/sharedStrings.xml')).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 const workbook=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels');const sheet=workbook.getElementsByTagName('sheet')[0];if(!sheet)throw Error('工作簿没有工作表');const rid=sheet.getAttribute('r:id');const rel=[...rels.getElementsByTagName('Relationship')].find(x=>x.getAttribute('Id')===rid);if(!rel)throw Error('工作表关联无效');const target=rel.getAttribute('Target');const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
 const doc=await xml(path),rows=[];
 for(const row of doc.getElementsByTagName('row')){const values=[];for(const cell of row.getElementsByTagName('c')){const ref=cell.getAttribute('r');if(!ref)continue;let col=0;for(const c of ref.replace(/[0-9]/g,''))col=col*26+c.charCodeAt(0)-64;const type=cell.getAttribute('t'),v=cell.getElementsByTagName('v')[0]?.textContent??'';values[col-1]=type==='s'?strings[Number(v)]??'':type==='inlineStr'?[...cell.getElementsByTagName('t')].map(t=>t.textContent).join(''):v;}if(values.some(v=>String(v??'').trim()))rows.push(Array.from(values,v=>v??''));}
 return rows;
}
