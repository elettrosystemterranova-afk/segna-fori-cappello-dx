// ===== secondo telefono (telecomando) =====
// Collegamento diretto tra i due telefoni (WebRTC) SENZA server: nessun STUN/TURN (iceServers vuoto),
// quindi funziona sulla stessa rete (hotspot del telefono principale). I codici di collegamento
// (offerta e risposta) si scambiano con un QR o copiando/incollando il testo.
// Principale = ha la fotocamera, fa tutti i calcoli e manda il video con i fori. Telecomando = lo guarda.
(function(){
var $=function(id){return document.getElementById(id);};
var S={ruolo:null,pc:null,dc:null,sessione:'',scan:null,scanTimer:0,tick:0};
var caricate={};

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
// 4 caratteri calcolati dal codice: appaiono su entrambi i telefoni per riconoscere la coppia giusta
function sigla(testo){var h=5381;for(var i=0;i<testo.length;i++)h=((h<<5)+h+testo.charCodeAt(i))>>>0;return h.toString(36).toUpperCase().slice(-4).padStart(4,'0');}

// ---- WebRTC ----
function nuovoPc(){
  var pc=new RTCPeerConnection({iceServers:[]});
  pc.onconnectionstatechange=function(){
    var st=pc.connectionState;
    if(st==='connected')collegato();
    else if(st==='failed'){passo('Collegamento non riuscito. Controlla che il telecomando sia collegato al Wi-Fi (hotspot) del telefono principale, poi scollega e riprova.');}
    else if(st==='disconnected'||st==='closed'){if(S.pc===pc)stato('Disconnesso.');}
  };
  return pc;
}
function attendiIce(pc){
  return new Promise(function(ok){
    if(pc.iceGatheringState==='complete'){ok();return;}
    var fatto=false;function fine(){if(!fatto){fatto=true;ok();}}
    pc.addEventListener('icegatheringstatechange',function(){if(pc.iceGatheringState==='complete')fine();});
    setTimeout(fine,3500);
  });
}
// Per far stare il codice in un QR riduce i codec video offerti a pochi (H.264 base e VP8)
function limitaCodec(tr){
  try{
    var caps=RTCRtpSender.getCapabilities('video').codecs,pref=[],rtx=[];
    caps.forEach(function(c){
      var m=c.mimeType.toLowerCase();
      if(m==='video/vp8')pref.push(c);
      else if(m==='video/h264'&&/profile-level-id=42e01f/i.test(c.sdpFmtpLine||'')&&/packetization-mode=1/.test(c.sdpFmtpLine||''))pref.unshift(c);
      else if(m==='video/rtx')rtx.push(c);
    });
    if(pref.length&&tr.setCodecPreferences)tr.setCodecPreferences(pref.concat(rtx));
  }catch(e){}
}
function soloIPv4(sdp){ // toglie i candidati con indirizzo IPv6 (contengono ':'): sull'hotspot non servono e allungano il QR
  return sdp.split('\n').map(function(r){return r.replace(/\r$/,'');}).filter(function(r){
    if(r.indexOf('a=candidate:')!==0)return true;
    var a=r.split(' ')[4]||'';return a.indexOf(':')<0;
  }).join('\r\n');
}
function canale(dc){
  S.dc=dc;
  dc.onopen=function(){try{dc.send(JSON.stringify({t:'ciao',r:S.ruolo}));}catch(e){}};
  dc.onmessage=function(e){var m;try{m=JSON.parse(e.data);}catch(x){return;}if(typeof S.onmsg==='function')S.onmsg(m);};
}

// ---- interfaccia ----
function mostra(el,on){$(el).hidden=!on;}
function passo(t){$('rStep').textContent=t;}
function stato(t){$('rStato').textContent=t;}
function ferma(){
  S.pc&&S.pc.close();S.pc=null;S.dc=null;S.ruolo=null;S.sessione='';
  fermaScan();clearInterval(S.tick);
  $('rVideo').srcObject=null;
  ['rBox','rVideoBox','rQrBox'].forEach(function(i){mostra(i,false);});mostra('rBtns',true);
  $('rTxt').value='';stato('');
}
function collegato(){
  fermaScan();mostra('rBox',false);mostra('rQrBox',false);
  stato('✅ Collegato · sessione '+S.sessione+(S.ruolo==='P'?' · il telecomando vede il tuo video':''));
  mostra('rStop',true);
  if(S.ruolo==='R')mostra('rVideoBox',true);
  if(S.ruolo==='P'){clearInterval(S.tick);S.tick=setInterval(function(){if(typeof draw==='function')draw();},500);} // tiene vivo il flusso anche a schermo fermo
}
function permessoCamera(){ // senza permesso il browser nasconde l'indirizzo locale e il collegamento può fallire
  return navigator.mediaDevices.getUserMedia({video:true}).then(function(s){s.getTracks().forEach(function(t){t.stop();});});
}
function mostraCodice(codice,etichetta){
  S.codice=codice;$('rTxt').value=codice;mostra('rQrBox',true);$('rQrInfo').textContent=etichetta+' ('+codice.length+' caratteri)';
  carica('vendor/qrcode.js').then(function(){
    var qr=qrcode(0,'L');qr.addData(codice,'Byte');qr.make();
    var n=qr.getModuleCount(),k=Math.max(2,Math.floor(900/(n+8))),c=$('rQr'),q=4*k;
    c.width=c.height=(n+8)*k;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';
    for(var r=0;r<n;r++)for(var cc=0;cc<n;cc++)if(qr.isDark(r,cc))x.fillRect(q+cc*k,q+r*k,k,k);
    c.hidden=false;
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
    var cv2=document.createElement('canvas'),x=cv2.getContext('2d',{willReadFrequently:true}),occ=false;
    S.scanTimer=setInterval(function(){
      if(occ||!v.videoWidth)return;
      cv2.width=v.videoWidth;cv2.height=v.videoHeight;x.drawImage(v,0,0);
      var d=x.getImageData(0,0,cv2.width,cv2.height),q=jsQR(d.data,d.width,d.height,{inversionAttempts:'dontInvert'});
      if(q&&q.data&&q.data.length>20){occ=true;fermaScan();usaCodice(q.data);}
    },150);
  }).catch(function(e){passo('Non riesco a usare la fotocamera ('+(e&&e.name||e.message||'errore')+'). Puoi copiare e incollare il codice a mano.');});
}

// ---- passi del collegamento ----
function avviaPrincipale(){
  S.ruolo='P';mostra('rBtns',false);mostra('rBox',true);mostra('rVideoBox',false);mostra('rScanBtn',false);
  passo('Preparo il collegamento…');
  permessoCamera().then(function(){
    var pc=S.pc=nuovoPc(),st=cv.captureStream(24);
    st.getTracks().forEach(function(t){pc.addTrack(t,st);});
    pc.getTransceivers().forEach(function(t){limitaCodec(t);});
    canale(pc.createDataChannel('cmd'));
    return pc.createOffer().then(function(o){return pc.setLocalDescription(o);}).then(function(){return attendiIce(pc);}).then(function(){
      var sdp=soloIPv4(pc.localDescription.sdp);S.sessione=sigla(sdp);return comprimi('o'+sdp);});
  }).then(function(codice){
    passo('1) Sul telefono telecomando premi "Questo è il telecomando" e inquadra questo codice (sessione '+S.sessione+'). 2) Poi premi qui sotto "Inquadra il codice del telecomando".');
    mostra('rScanBtn',true);mostraCodice(codice,'Codice del principale');
  }).catch(function(e){passo('Non riesco a preparare il collegamento: '+(e&&e.message||e.name||e));});
}
function avviaTelecomando(){
  S.ruolo='R';mostra('rBtns',false);mostra('rBox',true);mostra('rScanBtn',true);mostra('rQrBox',false);
  passo('Sul telefono principale premi "Questo è il principale". Poi inquadra il suo codice con il pulsante qui sotto (oppure incollalo).');
  permessoCamera().then(scansiona).catch(function(e){passo('Serve il permesso alla fotocamera per leggere il codice ('+(e&&e.name||'errore')+'). Puoi incollare il codice a mano.');});
}
function usaCodice(testo){
  passo('Elaboro il codice…');
  decomprimi(testo).then(function(t){
    var tipo=t.charAt(0),sdp=t.slice(1);
    if(S.ruolo==='R'&&tipo==='o')return rispondi(sdp);
    if(S.ruolo==='P'&&tipo==='a')return accettaRisposta(sdp);
    throw new Error(S.ruolo==='P'?'Questo è il codice del principale: qui serve quello del telecomando.':'Questo è il codice del telecomando: qui serve quello del principale.');
  }).catch(function(e){passo('Codice non accettato: '+(e&&e.message||e.name||e));});
}
function rispondi(sdp){
  var pc=S.pc=nuovoPc();S.sessione=sigla(sdp);
  pc.ontrack=function(e){var v=$('rVideo');v.srcObject=e.streams[0]||new MediaStream([e.track]);v.play().catch(function(){});};
  pc.ondatachannel=function(e){canale(e.channel);};
  return pc.setRemoteDescription({type:'offer',sdp:sdp}).then(function(){return pc.createAnswer();}).then(function(a){return pc.setLocalDescription(a);})
    .then(function(){return attendiIce(pc);}).then(function(){return comprimi('a'+soloIPv4(pc.localDescription.sdp));}).then(function(codice){
      passo('Sessione '+S.sessione+' (deve essere uguale sul principale). Sul principale premi "Inquadra il codice del telecomando" e fagli inquadrare questo codice.');
      mostra('rScanBtn',false);mostraCodice(codice,'Codice del telecomando');
    });
}
function accettaRisposta(sdp){
  if(!S.pc||S.pc.signalingState!=='have-local-offer')throw new Error('Il collegamento è già stato fatto o va ripreparato.');
  passo('Collego…');
  return S.pc.setRemoteDescription({type:'answer',sdp:sdp});
}

$('rPrinc').onclick=avviaPrincipale;
$('rTele').onclick=avviaTelecomando;
$('rScanBtn').onclick=scansiona;
$('rStop').onclick=ferma;
$('rUsa').onclick=function(){var t=$('rTxt').value.trim();if(t&&t!==S.codice)usaCodice(t);else passo('Incolla qui il codice dell\'altro telefono.');};
$('rCopia').onclick=function(){var t=$('rTxt');t.select();try{navigator.clipboard.writeText(t.value);}catch(e){document.execCommand('copy');}passo('Codice copiato.');};
window.addEventListener('pagehide',function(){if(S.pc)S.pc.close();});
S.usa=usaCodice;window.Remoto=S; // per i test
})();
