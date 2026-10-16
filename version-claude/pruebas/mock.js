// Simulación local de window.claude (db, user, downloads) para pruebas con datos ficticios.
(function(){
  const store=new Map(); // path -> data
  const listeners=[]; // {kind:'col'|'doc', path, cb}
  let idc=0;
  const newId=()=>"m"+(++idc).toString(36)+Math.random().toString(36).slice(2,8);
  const clone=o=>JSON.parse(JSON.stringify(o));
  window.__store=store;
  function snapDoc(path){const d=store.get(path);return {id:path.split("/").pop(),exists:!!d,data:()=>d?clone(d):undefined,metadata:{fromCache:false,hasPendingWrites:false}};}
  function colDocs(cpath){const n=cpath.split("/").length+1;return [...store.keys()].filter(k=>k.startsWith(cpath+"/")&&k.split("/").length===n).sort().map(snapDoc);}
  function notify(){setTimeout(()=>{listeners.forEach(l=>{if(l.kind==="col"){const docs=colDocs(l.path);l.cb({docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:{fromCache:false,hasPendingWrites:false}});}else l.cb(snapDoc(l.path));});},5);}
  function merge(a,b){for(const k of Object.keys(b)){if(b[k]&&typeof b[k]==="object"&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==="object"&&!Array.isArray(a[k]))merge(a[k],b[k]);else a[k]=clone(b[k]);}return a;}
  const leases=new Map();
  function checkBody(b){const j=JSON.stringify(b);if(/NaN|Infinity/.test(JSON.stringify(b,(k,v)=>typeof v==="number"&&!isFinite(v)?"NaN!":v))&&j.includes("null"))0;return true;}
  function docRef(path){
    if(path.split("/").length%2)throw new TypeError("doc path parity");
    return {id:path.split("/").pop(),path,
      get:async()=>snapDoc(path),
      set:async d=>{if(!d||typeof d!=="object"||Array.isArray(d))throw {code:"invalid_argument"};window.__writes=(window.__writes||0)+1;store.set(path,clone(d));notify();},
      update:async d=>{if(!store.has(path))throw {code:"invalid_argument",message:"missing"};store.set(path,merge(store.get(path),d));notify();},
      delete:async()=>{store.delete(path);notify();},
      acquire:async o=>{const now=Date.now();const l=leases.get(path);if(l&&l.exp>now&&l.holder!==o.holder)return {acquired:false,expiresAt:new Date(l.exp).toISOString()};leases.set(path,{holder:o.holder,exp:now+(o.ttlMs||30000)});return {acquired:true,version:1,holder:o.holder};},
      onSnapshot:(cb)=>{const l={kind:"doc",path,cb};listeners.push(l);setTimeout(()=>cb(snapDoc(path)),5);return ()=>{const i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1);};},
      collection:p=>colRef(path+"/"+p)};
  }
  function colRef(path){
    if(!(path.split("/").length%2))throw new TypeError("collection path parity");
    return {path,
      doc:id=>docRef(path+"/"+(id||newId())),
      add:async d=>{const r=docRef(path+"/"+newId());await r.set(d);return r;},
      onSnapshot:(cb)=>{const l={kind:"col",path,cb};listeners.push(l);setTimeout(()=>{const docs=colDocs(path);cb({docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:{fromCache:false,hasPendingWrites:false}});},5);return ()=>{};},
      get:async()=>{const docs=colDocs(path);return {docs,size:docs.length,empty:!docs.length};}};
  }
  const db=Object.freeze({doc:docRef,collection:colRef});
  const user=Object.freeze({
    id:async()=>"u_test", isOwner:async()=>true, canEdit:async()=>true, can:async()=>true,
    me:async()=>({id:"u_test",name:"Asesora Prueba",avatarUrl:"data:image/gif;base64,R0lGODlhAQABAAAAACw=",color:"#888",email:null,isOwner:true,canEdit:true}),
    profiles:async ids=>{const o={};[].concat(ids).forEach(i=>o[i]={id:i,name:i==="u_test"?"Asesora Prueba":"",avatarUrl:"data:image/gif;base64,R0lGODlhAQABAAAAACw=",color:"#888",email:null,isMe:i==="u_test",guest:false});return o;}
  });
  window.__downloads=[];
  const downloads=Object.freeze({save:async({filename,data})=>{let buf;if(data instanceof Blob)buf=new Uint8Array(await data.arrayBuffer());else if(typeof data==="string")buf=new TextEncoder().encode(data);else buf=new Uint8Array(data);let b64="";for(let i=0;i<buf.length;i+=32768)b64+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));window.__downloads.push({filename,b64:btoa(b64),size:buf.length});return {status:"saved"};}});
  const map={db,user,downloads};
  window.claude={use:name=>new Promise(r=>setTimeout(()=>r(map[name]||null),30))};
})();
