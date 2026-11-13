// ===== secondo telefono (telecomando) =====
// Collegamento diretto tra i due telefoni (WebRTC) SENZA server: nessun STUN/TURN (iceServers vuoto),
// quindi funziona sulla stessa rete (hotspot del telefono principale). I codici di collegamento
// (offerta e risposta) si scambiano con un QR o copiando/incollando il testo.
// Il video NON usa i canali video di WebRTC: il principale manda immagini JPEG su un canale dati.
// Così il codice di collegamento resta corto (poche centinaia di caratteri: QR facile da leggere).
// Principale = ha la fotocamera, fa tutti i calcoli e manda il video con i fori. Telecomando = lo guarda.
(function(){
var $=function(id){return document.getElementById(id);};
var S={ruolo:null,pc:null,dcV:null,dcC:null,sessione:'',codice:'',scan:null,scanTimer:0,tick:0,frames:0,sent:0,q:0.72,enc:false,ultimo:null,dis:false,log:[],tmp:null,to:0};
var caricate={};
var MAXMSG=200000; // dimensione massima di un fotogramma JPEG (byte)

function log(t){
  var d=new Date(),h=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2);
  S.log.push(h+' '+t);if(S.log.length>40)S.log.shift();
  var el=$('rLog');if(el)el.textContent=S.log.slice(-14).join('\n');
}
function carica(src){
  return new Promise(function(ok,ko){
    if(caricate[src]){ok();return;}
    var s=document.createElement('script');s.src=src;
    s.onload=function(){caricate[src]=1;ok();};
    s.onerror=function(){ko(new Error('Libreria non caricata ('+src+'). Serve aver aperto la pagina almeno una volta con internet.'));};
    document.head.appendChild(s);
  });
}

// ---- codifica del codice di collegamento: testo -> (compresso) -> base64 ----
function b64u(b){var s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64u(t){t=t.replace(/-/g,'+').replace(/_/g,'/');while(t.length%4)t+='=';var s=atob(t),b=new Uint8Array(s.length);for(var i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
function leggiTutto(readable){return new Response(readable).arrayBuffer().then(function(a){return new Uint8Array(a);});}
function comprimi(testo){
  var raw=new TextEncoder().encode(testo);
  if(!window.CompressionStream)return Promise.resolve('r'+b64u(raw));
  var cs=new CompressionStream('deflate-raw'),w=cs.writable.getWriter();w.write(raw);w.close();
  return leggiTutto(cs.readable).then(function(b){return 'z'+b64u(b);});
}
function decomprimi(codice){
  codice=codice.replace(/\s+/g,'');var tipo=codice.charAt(0),b;
  try{b=unb64u(codice.slice(1));}catch(e){return Promise.reject(new Error('Codice non valido.'));}
  if(tipo==='r')return Promise.resolve(new TextDecoder().decode(b));
  if(tipo!=='z'||!window.DecompressionStream)return Promise.reject(new Error('Codice non valido (o questo telefono è troppo vecchio).'));
  var ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();w.write(b);w.close();
  return leggiTutto(ds.readable).then(function(x){return new TextDecoder().decode(x);});
}
// 4 caratteri calcolati dall'offerta: appaiono su entrambi i telefoni per riconoscere la coppia giusta
function sigla(testo){var h=5381;for(var i=0;i<testo.length;i++)h=((h<<5)+h+testo.charCodeAt(i))>>>0;return h.toString(36).toUpperCase().slice(-4).padStart(4,'0');}
// toglie i candidati con indirizzo IPv6 (contengono ':'): sull'hotspot non servono e allungano il codice
function soloIPv4(sdp){
  return sdp.split('\n').map(function(r){return r.replace(/\r$/,'');}).filter(function(r){
    if(r.indexOf('a=candidate:')!==0)return true;
    var a=r.split(' ')[4]||'';return a.indexOf(':')<0;
  }).join('\r\n');
}
function indirizzi(sdp){ // elenco leggibile dei candidati di un SDP, per i dettagli tecnici
  var out=[];sdp.split('\n').forEach(function(r){
    r=r.trim();if(r.indexOf('a=candidate:')!==0)return;var p=r.split(' '),i=p.indexOf('typ');
    out.push(p[4]+':'+p[5]+' ('+(i>0?p[i+1]:'?')+')');});
  return out;
}

// ---- WebRTC ----
function nuovoPc(){
  var pc=new RTCPeerConnection({iceServers:[]});
  pc.onconnectionstatechange=function(){
    var st=pc.connectionState;log('collegamento: '+st);
    if(S.pc!==pc)return;
    if(st==='failed')fallito();
    else if(st==='disconnected'||st==='closed')stato('Disconnesso.');
  };
  pc.oniceconnectionstatechange=function(){log('ICE: '+pc.iceConnectionState);};
  pc.onicegatheringstatechange=function(){log('ricerca indirizzi: '+pc.iceGatheringState);};
  pc.onsignalingstatechange=function(){log('segnalazione: '+pc.signalingState);};
  return pc;
}
function fallito(){
  stato('❌ Collegamento non riuscito.');
  passo('I due telefoni non riescono a parlarsi. Controlla che il telecomando sia collegato al Wi-Fi (hotspot) del telefono principale e che nessuno dei due abbia la VPN o il "risparmio dati" attivi. Poi premi Scollega e riprova. In "Dettagli tecnici" vedi gli indirizzi trovati.');
  mostra('rStop',true);
}
function attendiIce(pc){
  return new Promise(function(ok){
    if(pc.iceGatheringState==='complete'){ok();return;}
    var fatto=false;function fine(){if(!fatto){fatto=true;ok();}}
    pc.addEventListener('icegatheringstatechange',function(){if(pc.iceGatheringState==='complete')fine();});
    setTimeout(fine,3500);
  });
}
function creaCanali(pc){
  // canali "concordati": stessi id sui due telefoni, senza altra trattativa
  var v=pc.createDataChannel('v',{negotiated:true,id:0}),c=pc.createDataChannel('c',{negotiated:true,id:1});
  v.binaryType='arraybuffer';S.dcV=v;S.dcC=c;
  v.onopen=function(){log('canale video aperto');if(S.ruolo==='P')avviaInvio();};
  v.onclose=function(){log('canale video chiuso');};
  v.onerror=function(){log('canale video: errore');};
  v.onmessage=function(e){if(S.ruolo==='R'&&typeof e.data!=='string'){S.frames++;S.ultimo=e.data;if(!S.dis){S.dis=true;requestAnimationFrame(mostraFrame);}}};
  c.onopen=function(){log('canale comandi aperto');collegato();try{c.send(JSON.stringify({t:'ciao',r:S.ruolo}));}catch(e){}};
  c.onclose=function(){log('canale comandi chiuso');};
  c.onmessage=function(e){var m;try{m=JSON.parse(e.data);}catch(x){return;}if(typeof S.onmsg==='function')S.onmsg(m);};
}

// ---- invio del video (principale) e visualizzazione (telecomando) ----
function avviaInvio(){clearInterval(S.tick);S.tick=setInterval(inviaFrame,90);}
function inviaFrame(){
  var dc=S.dcV;if(!dc||dc.readyState!=='open'||S.enc||dc.bufferedAmount>250000)return;
  var w=Math.min(cv.width,1000),h=Math.max(1,Math.round(cv.height*w/cv.width)),sorg=cv;
  if(w<cv.width){S.tmp=S.tmp||document.createElement('canvas');S.tmp.width=w;S.tmp.height=h;S.tmp.getContext('2d').drawImage(cv,0,0,w,h);sorg=S.tmp;}
  S.enc=true;
  sorg.toBlob(function(b){
    if(!b){S.enc=false;return;}
    b.arrayBuffer().then(function(a){
      if(a.byteLength>MAXMSG){S.q=Math.max(0.35,S.q-0.08);} // troppo grande: abbassa la qualità e salta
      else{if(dc.readyState==='open'&&dc.bufferedAmount<250000){dc.send(a);S.sent++;}if(a.byteLength<90000&&S.q<0.8)S.q+=0.02;}
      S.enc=false;
    }).catch(function(){S.enc=false;});
  },'image/jpeg',S.q);
}
function mostraFrame(){
  S.dis=false;var d=S.ultimo;S.ultimo=null;if(!d)return;
  createImageBitmap(new Blob([d],{type:'image/jpeg'})).then(function(bm){
    var c=$('rFrame');if(c.width!==bm.width||c.height!==bm.height){c.width=bm.width;c.height=bm.height;}
    c.getContext('2d').drawImage(bm,0,0);if(bm.close)bm.close();
  }).catch(function(){});
}

// ---- interfaccia ----
function mostra(el,on){$(el).hidden=!on;}
function passo(t){$('rStep').textContent=t;}
function stato(t){$('rStato').textContent=t;}
function ferma(){
  clearTimeout(S.to);if(S.pc)S.pc.close();S.pc=null;S.dcV=null;S.dcC=null;S.ruolo=null;S.sessione='';S.codice='';
  fermaScan();clearInterval(S.tick);S.frames=0;S.sent=0;S.ultimo=null;
  ['rBox','rVideoBox','rQrBox','rStop','rDett'].forEach(function(i){mostra(i,false);});mostra('rBtns',true);
  $('rTxt').value='';stato('');S.log=[];$('rLog').textContent='';
}
function collegato(){
  clearTimeout(S.to);fermaScan();mostra('rBox',false);mostra('rQrBox',false);mostra('rStop',true);
  stato('✅ Collegato · sessione '+S.sessione+(S.ruolo==='P'?' · il telecomando vede il tuo schermo':''));
  if(S.ruolo==='R')mostra('rVideoBox',true);
}
function permessoCamera(){ // senza permesso il browser nasconde l'indirizzo locale e il collegamento può fallire
  return navigator.mediaDevices.getUserMedia({video:true}).then(function(s){s.getTracks().forEach(function(t){t.stop();});});
}
function mostraCodice(codice,etichetta){
  S.codice=codice;$('rTxt').value=codice;mostra('rQrBox',true);$('rQrInfo').textContent=etichetta+' · '+codice.length+' caratteri';
  carica('vendor/qrcode.js').then(function(){
    var qr=qrcode(0,'L');qr.addData(codice,'Byte');qr.make();
    var n=qr.getModuleCount(),k=Math.max(3,Math.floor(900/(n+8))),c=$('rQr'),q=4*k;
    c.width=c.height=(n+8)*k;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';
    for(var r=0;r<n;r++)for(var cc=0;cc<n;cc++)if(qr.isDark(r,cc))x.fillRect(q+cc*k,q+r*k,k,k);
    c.hidden=false;log('QR creato: '+n+'×'+n+' moduli');
  }).catch(function(e){$('rQr').hidden=true;passo('QR non disponibile ('+e.message+'). Usa il testo qui sotto: copialo e incollalo sull\'altro telefono.');});
}

// ---- lettura del QR con la fotocamera ----
function fermaScan(){
  clearInterval(S.scanTimer);
  if(S.scan){S.scan.getTracks().forEach(function(t){t.stop();});S.scan=null;}
  $('rScan').srcObject=null;mostra('rScan',false);
}
function scansiona(){
  if(typeof live!=='undefined'&&live){passo('Ferma prima il Video live: la fotocamera serve per leggere il codice. Dopo il collegamento puoi riavviarlo.');return;}
  fermaScan();
  Promise.all([carica('vendor/jsQR.js'),navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}}})]).then(function(r){
    var st=r[1],v=$('rScan');S.scan=st;v.srcObject=st;v.setAttribute('playsinline','');v.muted=true;v.play();mostra('rScan',true);
    passo('Inquadra il codice QR dell\'altro telefono (tutto intero e fermo, a 15-25 cm). Se non lo legge, copia e incolla il testo.');
    log('fotocamera accesa per leggere il QR');
    var cv2=document.createElement('canvas'),x=cv2.getContext('2d',{willReadFrequently:true}),n=0;
    S.scanTimer=setInterval(function(){
      if(!v.videoWidth)return;
      cv2.width=v.videoWidth;cv2.height=v.videoHeight;x.drawImage(v,0,0);
      var d=x.getImageData(0,0,cv2.width,cv2.height),q=jsQR(d.data,d.width,d.height,{inversionAttempts:'dontInvert'});
      if(++n%20===0)stato('Cerco il QR… ('+cv2.width+'×'+cv2.height+')');
      if(q&&q.data&&q.data.length>20){log('QR letto: '+q.data.length+' caratteri');fermaScan();usaCodice(q.data);}
    },150);
  }).catch(function(e){passo('Non riesco a usare la fotocamera ('+(e&&e.name||e.message||'errore')+'). Copia e incolla il codice a mano.');});
}

// ---- passi del collegamento ----
function avviaPrincipale(){
  S.ruolo='P';mostra('rBtns',false);mostra('rBox',true);mostra('rVideoBox',false);mostra('rScanBtn',false);mostra('rDett',true);mostra('rStop',true);
  passo('Preparo il codice di collegamento…');log('principale: preparo il collegamento');
  permessoCamera().then(function(){
    var pc=S.pc=nuovoPc();creaCanali(pc);
    return pc.createOffer().then(function(o){return pc.setLocalDescription(o);}).then(function(){return attendiIce(pc);}).then(function(){
      var sdp=soloIPv4(pc.localDescription.sdp);S.sessione=sigla(sdp);
      var ind=indirizzi(sdp);log('indirizzi di questo telefono: '+(ind.join(', ')||'NESSUNO'));
      return comprimi('o'+sdp);});
  }).then(function(codice){
    passo('PASSO 1 di 2 · Sul telecomando premi "Questo è il telecomando" e fagli leggere questo QR (sessione '+S.sessione+'). PASSO 2 di 2 · Poi premi qui sotto "Inquadra il codice del telecomando".');
    stato('Sessione '+S.sessione+' · in attesa del telecomando');
    mostra('rScanBtn',true);mostraCodice(codice,'Codice del principale');
  }).catch(function(e){passo('Non riesco a preparare il collegamento: '+(e&&e.message||e.name||e));});
}
function avviaTelecomando(){
  S.ruolo='R';mostra('rBtns',false);mostra('rBox',true);mostra('rScanBtn',true);mostra('rQrBox',false);mostra('rDett',true);mostra('rStop',true);
  stato('In attesa del codice del principale');log('telecomando: avviato');
  passo('Sul telefono principale premi "Questo è il principale". Poi inquadra il suo QR con la fotocamera (parte da sola), oppure incolla il suo codice qui sotto.');
  permessoCamera().then(scansiona).catch(function(e){passo('Serve il permesso alla fotocamera per leggere il codice ('+(e&&e.name||'errore')+'). Puoi incollare il codice a mano.');});
}
function usaCodice(testo){
  passo('Elaboro il codice…');
  decomprimi(testo).then(function(t){
    var tipo=t.charAt(0),sdp=t.slice(1);
    if(S.ruolo==='R'&&tipo==='o')return rispondi(sdp);
    if(S.ruolo==='P'&&tipo==='a')return accettaRisposta(sdp);
    throw new Error(S.ruolo==='P'?'Questo è il codice del principale: qui serve quello del telecomando.':'Questo è il codice del telecomando: qui serve quello del principale.');
  }).catch(function(e){log('codice rifiutato: '+(e&&e.message||e.name||e));passo('Codice non accettato: '+(e&&e.message||e.name||e));});
}
function rispondi(sdp){
  var pc=S.pc=nuovoPc();S.sessione=sigla(sdp);creaCanali(pc);
  log('codice del principale ricevuto ('+sdp.length+' byte); indirizzi suoi: '+(indirizzi(sdp).join(', ')||'NESSUNO'));
  stato('✔ Codice del principale ricevuto · sessione '+S.sessione);
  return pc.setRemoteDescription({type:'offer',sdp:sdp}).then(function(){return pc.createAnswer();}).then(function(a){return pc.setLocalDescription(a);})
    .then(function(){return attendiIce(pc);}).then(function(){
      var r=soloIPv4(pc.localDescription.sdp);log('indirizzi di questo telefono: '+(indirizzi(r).join(', ')||'NESSUNO'));return comprimi('a'+r);}).then(function(codice){
      passo('PASSO 2 di 2 · Sessione '+S.sessione+' (deve essere uguale sul principale). Sul principale premi "Inquadra il codice del telecomando" e fagli leggere questo QR (oppure incolla il codice sul principale).');
      mostra('rScanBtn',false);mostraCodice(codice,'Codice del telecomando');
      S.to=setTimeout(function(){if(S.pc&&S.pc.connectionState!=='connected'){stato('⏳ Ancora in attesa del principale…');}},20000);
    });
}
function accettaRisposta(sdp){
  if(!S.pc||S.pc.signalingState!=='have-local-offer')throw new Error('Il collegamento è già stato fatto o va ripreparato (premi Scollega e ricomincia).');
  log('risposta del telecomando ricevuta; indirizzi suoi: '+(indirizzi(sdp).join(', ')||'NESSUNO'));
  stato('✔ Risposta del telecomando ricevuta · collego…');passo('Risposta ricevuta. Collego i due telefoni… (di solito pochi secondi)');
  mostra('rQrBox',false);
  S.to=setTimeout(function(){if(S.pc&&S.pc.connectionState!=='connected'){fallito();}},25000);
  return S.pc.setRemoteDescription({type:'answer',sdp:sdp});
}

$('rPrinc').onclick=avviaPrincipale;
$('rTele').onclick=avviaTelecomando;
$('rScanBtn').onclick=scansiona;
$('rStop').onclick=ferma;
$('rUsa').onclick=function(){var t=$('rTxt').value.trim();if(t&&t!==S.codice)usaCodice(t);else passo('Incolla qui il codice dell\'altro telefono, poi premi "Usa il codice incollato".');};
$('rCopia').onclick=function(){var t=$('rTxt');t.select();try{navigator.clipboard.writeText(t.value);}catch(e){document.execCommand('copy');}passo('Codice copiato.');};
window.addEventListener('pagehide',function(){if(S.pc)S.pc.close();});
S.usa=usaCodice;window.Remoto=S; // per i test
})();
